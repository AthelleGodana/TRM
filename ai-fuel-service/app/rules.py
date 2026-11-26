"""Option 1: fixed checks. Each finds a specific, explainable problem with
a fill-up. A rule whose input is missing (no tank size, no odometer) is
skipped rather than flagged.
"""
from __future__ import annotations

from typing import Callable, Iterable

from . import config
from .contract import Anomaly, Severity
from .features import Fill


def _clamp(x: float) -> float:
    return round(max(0.0, min(1.0, x)), 3)


def _n(x: float, digits: int = 0) -> str:
    return f"{x:,.{digits}f}"


def _anomaly(fill: Fill, type_: str, severity: Severity, score: float, summary: str, **facts) -> Anomaly:
    return Anomaly(
        type=type_, severity=severity, score=_clamp(score),
        vehicleId=fill.record.vehicleId, fuelRecordId=fill.record.id,
        explanation={"summary": summary, "method": "rule", **facts},
    )


def over_tank_capacity(fill: Fill) -> Iterable[Anomaly]:
    tank = fill.vehicle.tankCapacityLitres if fill.vehicle else None
    if not tank or fill.tank_fraction is None or fill.tank_fraction <= config.TANK_TOLERANCE:
        return
    ratio = fill.tank_fraction
    yield _anomaly(
        fill, "OVER_TANK_CAPACITY",
        Severity.CRITICAL if ratio > config.TANK_CRITICAL else Severity.HIGH,
        0.5 + (ratio - config.TANK_TOLERANCE) / 0.4,
        f"{fill.plate} took {_n(fill.record.litres, 1)} L but its tank holds {_n(tank)} L ({ratio:.0%}).",
        litres=fill.record.litres, tankCapacityLitres=tank, ratio=round(ratio, 3),
    )


def odometer_rollback(fill: Fill) -> Iterable[Anomaly]:
    if fill.km_since is None or fill.km_since >= 0:
        return
    yield _anomaly(
        fill, "ODOMETER_ROLLBACK", Severity.HIGH, 0.8,
        f"{fill.plate}: odometer {_n(fill.record.odometer)} km is lower than at the previous fill-up "
        f"({_n(fill.prev.odometer)} km). Check for a typing mistake or tampering.",
        odometer=fill.record.odometer, previousOdometer=fill.prev.odometer, previousRecordId=fill.prev.id,
    )


def _is_duplicate(fill: Fill) -> bool:
    prev = fill.prev
    if prev is None:
        return False
    same_litres = abs(fill.record.litres - prev.litres) <= config.DUPLICATE_LITRES
    close_in_time = fill.hours_since is not None and fill.hours_since * 60 <= config.DUPLICATE_MINUTES
    same_odometer = fill.record.odometer is not None and fill.record.odometer == prev.odometer
    return (same_litres and close_in_time) or (same_odometer and same_litres)


def duplicate_entry(fill: Fill) -> Iterable[Anomaly]:
    if not _is_duplicate(fill):
        return
    yield _anomaly(
        fill, "DUPLICATE_ENTRY", Severity.MEDIUM, 0.7,
        f"{fill.plate}: {_n(fill.record.litres, 1)} L recorded twice "
        f"({_n((fill.hours_since or 0) * 60)} min apart). It may have been entered or charged twice.",
        previousRecordId=fill.prev.id, minutesApart=round((fill.hours_since or 0) * 60, 1),
    )


def rapid_refill(fill: Fill) -> Iterable[Anomaly]:
    if fill.prev is None or fill.hours_since is None or _is_duplicate(fill):
        return
    tank = fill.vehicle.tankCapacityLitres if fill.vehicle else None
    soon = fill.hours_since < config.RAPID_REFILL_HOURS
    short = (
        fill.km_since is not None and 0 <= fill.km_since < config.RAPID_REFILL_KM
        and tank and fill.record.litres > config.RAPID_REFILL_TANK_FRACTION * tank
    )
    if not (soon or short):
        return
    gap = f"{_n(fill.hours_since * 60)} min" if fill.hours_since < 2 else f"{fill.hours_since:.1f} h"
    distance = f", {_n(fill.km_since)} km" if fill.km_since is not None else ""
    yield _anomaly(
        fill, "RAPID_REFILL",
        Severity.HIGH if fill.hours_since < config.RAPID_REFILL_HIGH_HOURS else Severity.MEDIUM,
        0.9 - min(fill.hours_since, config.RAPID_REFILL_HOURS) / config.RAPID_REFILL_HOURS * 0.4,
        f"{fill.plate} was filled again {gap}{distance} after the previous fill-up, "
        f"with {_n(fill.record.litres, 1)} L.",
        hoursSince=round(fill.hours_since, 2), kmSince=fill.km_since, previousRecordId=fill.prev.id,
    )


def high_consumption(fill: Fill) -> Iterable[Anomaly]:
    expected = fill.vehicle.expectedConsumptionL100km if fill.vehicle else None
    if not expected or fill.l100_smoothed is None:
        return
    ratio = fill.l100_smoothed / expected
    if ratio < config.CONSUMPTION_MEDIUM:
        return
    severity = (Severity.CRITICAL if ratio >= config.CONSUMPTION_CRITICAL
                else Severity.HIGH if ratio >= config.CONSUMPTION_HIGH else Severity.MEDIUM)
    yield _anomaly(
        fill, "HIGH_CONSUMPTION", severity, (ratio - 1) / 1.5,
        f"{fill.plate} used {_n(fill.l100_smoothed, 1)} L/100 km, {ratio - 1:.0%} more than the expected "
        f"{_n(expected, 1)} L/100 km.",
        expected=expected, actual=round(fill.l100_smoothed, 2), ratio=round(ratio, 3),
    )


def price_outlier(fill: Fill) -> Iterable[Anomaly]:
    price, ref = fill.record.pricePerLitre, fill.reference_price
    if not price or not ref:
        return
    deviation = abs(price - ref) / ref
    if deviation <= config.PRICE_MEDIUM:
        return
    direction = "above" if price > ref else "below"
    yield _anomaly(
        fill, "PRICE_OUTLIER", Severity.HIGH if deviation > config.PRICE_HIGH else Severity.MEDIUM, deviation / 0.5,
        f"{fill.plate} paid KES {_n(price, 2)} per litre, {deviation:.0%} {direction} the usual "
        f"KES {_n(ref, 2)} that week.",
        pricePerLitre=price, referencePrice=round(ref, 2), deviation=round(deviation, 3),
    )


def cost_mismatch(fill: Fill) -> Iterable[Anomaly]:
    r = fill.record
    if not r.pricePerLitre or r.totalCost is None:
        return
    expected = r.litres * r.pricePerLitre
    diff = abs(r.totalCost - expected)
    if diff <= config.COST_TOLERANCE * expected or diff <= config.COST_MIN_KES:
        return
    yield _anomaly(
        fill, "COST_MISMATCH", Severity.MEDIUM, diff / expected,
        f"{fill.plate}: total KES {_n(r.totalCost)} does not match {_n(r.litres, 1)} L x KES {_n(r.pricePerLitre, 2)} "
        f"= KES {_n(expected)} (difference KES {_n(diff)}).",
        totalCost=r.totalCost, expectedTotal=round(expected, 2), difference=round(diff, 2),
    )


RULES: list[Callable[[Fill], Iterable[Anomaly]]] = [
    over_tank_capacity, odometer_rollback, duplicate_entry, rapid_refill, high_consumption, price_outlier, cost_mismatch,
]


def run_rules(fills: list[Fill]) -> list[Anomaly]:
    return [a for fill in fills for rule in RULES for a in rule(fill)]
