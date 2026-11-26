"""Turns one organisation's request into per-fill-up facts used by the
rules and the statistics: what changed since the vehicle's previous
fill-up, consumption over that stretch, and the going price of fuel.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import timedelta, timezone
from statistics import median
from typing import Optional

from . import config
from .contract import AnalyzeRequest, FuelRecord, Vehicle


@dataclass
class Fill:
    record: FuelRecord
    vehicle: Optional[Vehicle]
    prev: Optional[FuelRecord] = None
    km_since: Optional[float] = None       # odometer difference to the previous fill-up
    hours_since: Optional[float] = None
    tank_fraction: Optional[float] = None  # litres / tank capacity
    l100: Optional[float] = None           # this stretch's L/100 km (stretches >= MIN_SEGMENT_KM)
    l100_smoothed: Optional[float] = None  # rolling over the last few stretches
    reference_price: Optional[float] = None
    extra: dict = field(default_factory=dict)

    @property
    def plate(self) -> str:
        return self.vehicle.licensePlate if self.vehicle else f"vehicle {self.record.vehicleId}"


def _reference_prices(records: list[FuelRecord], fuel_type_of: dict[int, object]) -> dict[int, float]:
    """Median price per litre of the organisation's other fill-ups of the
    same fuel type within +/- PRICE_WINDOW_DAYS."""
    window = timedelta(days=config.PRICE_WINDOW_DAYS)
    priced = [r for r in records if r.pricePerLitre]
    out: dict[int, float] = {}
    for r in priced:
        kind = fuel_type_of.get(r.vehicleId)
        peers = [
            p.pricePerLitre for p in priced
            if p.id != r.id and fuel_type_of.get(p.vehicleId) == kind and abs(p.filledAt - r.filledAt) <= window
        ]
        if len(peers) >= config.PRICE_MIN_PEERS:
            out[r.id] = median(peers)
    return out


def build_fills(request: AnalyzeRequest) -> dict[int, list[Fill]]:
    """Fill-ups grouped by vehicle, oldest first, with derived facts."""
    vehicles = {v.id: v for v in request.vehicles}
    fuel_type_of = {v.id: v.fuelType for v in request.vehicles}
    prices = _reference_prices(request.fuelRecords, fuel_type_of)

    by_vehicle: dict[int, list[FuelRecord]] = {}
    for r in request.fuelRecords:
        by_vehicle.setdefault(r.vehicleId, []).append(r)

    result: dict[int, list[Fill]] = {}
    for vehicle_id, records in by_vehicle.items():
        records.sort(key=lambda r: (r.filledAt, r.id))
        vehicle = vehicles.get(vehicle_id)
        tank = vehicle.tankCapacityLitres if vehicle else None
        fills: list[Fill] = []
        window: list[tuple[float, float]] = []  # (litres, km) of recent valid stretches
        previous_rolled_back = False
        for i, r in enumerate(records):
            prev = records[i - 1] if i else None
            fill = Fill(record=r, vehicle=vehicle, prev=prev, reference_price=prices.get(r.id))
            if tank:
                fill.tank_fraction = r.litres / tank
            # Consumption is only measured on believable stretches: not one
            # with more litres than the tank holds, and not one measured from
            # a reading that went backwards. Those are reported by their own
            # rules and would otherwise skew every check after them.
            impossible_fill = fill.tank_fraction is not None and fill.tank_fraction > config.TANK_TOLERANCE
            if prev is not None:
                fill.hours_since = (r.filledAt - prev.filledAt).total_seconds() / 3600
                if r.odometer is not None and prev.odometer is not None:
                    fill.km_since = r.odometer - prev.odometer
                    measurable = not impossible_fill and not previous_rolled_back
                    previous_rolled_back = fill.km_since < 0
                    # The litres put in now replace what was burnt since the
                    # previous fill-up.
                    if measurable and fill.km_since >= config.MIN_SEGMENT_KM:
                        fill.l100 = r.litres / fill.km_since * 100
                        window = (window + [(r.litres, fill.km_since)])[-config.SMOOTHING_SEGMENTS:]
                        litres = sum(w[0] for w in window)
                        km = sum(w[1] for w in window)
                        fill.l100_smoothed = litres / km * 100
            fills.append(fill)
        result[vehicle_id] = fills
    return result


def all_fills(fills_by_vehicle: dict[int, list[Fill]]) -> list[Fill]:
    return [f for fills in fills_by_vehicle.values() for f in fills]


def local_hour(fill: Fill) -> float:
    """Hour of day in Kenya (fractional), for "filled at 02:40"."""
    t = fill.record.filledAt
    if t.tzinfo is not None:
        t = t.astimezone(timezone.utc)  # naive times are taken as UTC
    return (t.hour + t.minute / 60 + config.LOCAL_UTC_OFFSET_HOURS) % 24


def clock(fill: Fill) -> str:
    h = local_hour(fill)
    return f"{int(h):02d}:{int(round((h % 1) * 60)) % 60:02d}"
