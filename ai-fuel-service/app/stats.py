"""Option 2: statistics learnt from the organisation's own data.

- Per-vehicle baseline (robust z-score): flags a stretch far from that
  vehicle's usual L/100 km, even when no expected figure was entered.
- Efficiency drift: a vehicle burning clearly more in the last month than
  before (usually a maintenance problem).
- Isolation Forest: unusual fill-ups across the fleet, on several features
  at once. Fitted per request on this organisation only, with a fixed seed,
  so results are repeatable and nothing is shared between tenants.
- Driver pattern: a driver who consistently burns more than the vehicles
  they drive normally do.
"""
from __future__ import annotations

import math
from datetime import timedelta
from statistics import median

import numpy as np

from . import config
from .contract import AnalyzeRequest, Anomaly, Severity
from .features import Fill, all_fills, clock, local_hour


def _clamp(x: float) -> float:
    return round(max(0.0, min(1.0, x)), 3)


def _mad(values: list[float], centre: float) -> float:
    """Median absolute deviation, floored at 5% of the median so a very
    steady vehicle does not turn tiny wobbles into huge z-scores."""
    mad = median(abs(v - centre) for v in values)
    return max(mad, 0.05 * abs(centre), 1e-9)


def _robust_z(value: float, centre: float, mad: float) -> float:
    return 0.6745 * (value - centre) / mad


def vehicle_baselines(fills_by_vehicle: dict[int, list[Fill]]) -> dict[int, tuple[float, float, int]]:
    """vehicle id -> (median L/100 km, MAD, number of stretches)."""
    out = {}
    for vehicle_id, fills in fills_by_vehicle.items():
        values = [f.l100 for f in fills if f.l100 is not None]
        if values:
            centre = median(values)
            out[vehicle_id] = (centre, _mad(values, centre), len(values))
    return out


def consumption_outliers(fills_by_vehicle, baselines) -> list[Anomaly]:
    found = []
    for vehicle_id, fills in fills_by_vehicle.items():
        base = baselines.get(vehicle_id)
        if not base or base[2] < config.ZSCORE_MIN_SEGMENTS:
            continue
        centre, mad, _ = base
        for f in fills:
            if f.l100 is None:
                continue
            z = _robust_z(f.l100, centre, mad)
            if z > config.ZSCORE_THRESHOLD:
                found.append(Anomaly(
                    type="CONSUMPTION_OUTLIER",
                    severity=Severity.HIGH if z > config.ZSCORE_HIGH else Severity.MEDIUM,
                    score=_clamp(z / (2 * config.ZSCORE_HIGH)),
                    vehicleId=vehicle_id, fuelRecordId=f.record.id,
                    explanation={
                        "summary": f"{f.plate} used {f.l100:.1f} L/100 km on this stretch; it usually uses {centre:.1f}.",
                        "method": "robust z-score", "actual": round(f.l100, 2), "usual": round(centre, 2), "z": round(z, 2),
                    },
                ))
            elif z < -config.ZSCORE_THRESHOLD:
                found.append(Anomaly(
                    type="CONSUMPTION_UNUSUALLY_LOW", severity=Severity.LOW,
                    score=_clamp(-z / (2 * config.ZSCORE_HIGH)),
                    vehicleId=vehicle_id, fuelRecordId=f.record.id,
                    explanation={
                        "summary": f"{f.plate} used only {f.l100:.1f} L/100 km on this stretch (usually {centre:.1f}). "
                                   "A fill-up may be missing, or the odometer reading may be wrong.",
                        "method": "robust z-score", "actual": round(f.l100, 2), "usual": round(centre, 2), "z": round(z, 2),
                    },
                ))
    return found


def efficiency_drift(fills_by_vehicle, generated_at) -> list[Anomaly]:
    found = []
    cutoff = generated_at - timedelta(days=config.DRIFT_RECENT_DAYS)
    for vehicle_id, fills in fills_by_vehicle.items():
        stretches = [f for f in fills if f.l100 is not None]
        recent = [f.l100 for f in stretches if f.record.filledAt >= cutoff]
        before = [f.l100 for f in stretches if f.record.filledAt < cutoff]
        if len(recent) < config.DRIFT_MIN_RECENT or len(before) < config.DRIFT_MIN_BEFORE:
            continue
        now_m, before_m = median(recent), median(before)
        ratio = now_m / before_m
        if ratio < config.DRIFT_MEDIUM:
            continue
        plate = stretches[0].plate
        found.append(Anomaly(
            type="EFFICIENCY_DRIFT",
            severity=Severity.HIGH if ratio >= config.DRIFT_HIGH else Severity.MEDIUM,
            score=_clamp((ratio - 1) / 0.6),
            vehicleId=vehicle_id, fuelRecordId=None,
            explanation={
                "summary": f"{plate}: fuel use up {ratio - 1:.0%} over the last {config.DRIFT_RECENT_DAYS} days "
                           f"({now_m:.1f} vs {before_m:.1f} L/100 km). Check tyres, injectors, air filter and driving.",
                "method": "efficiency drift", "recentMedian": round(now_m, 2), "earlierMedian": round(before_m, 2),
                "ratio": round(ratio, 3),
            },
        ))
    return found


# ── Isolation Forest ────────────────────────────────────────────────────
FEATURES = ["consumption", "litres", "hoursSince", "kmSince", "price", "hourSin", "hourCos", "weekend"]


def _feature_rows(fills: list[Fill], baselines) -> np.ndarray:
    litres_median: dict[int, float] = {}
    for f in fills:
        litres_median.setdefault(f.record.vehicleId, [])
        litres_median[f.record.vehicleId].append(f.record.litres)
    litres_median = {k: median(v) for k, v in litres_median.items()}
    hours_all = [f.hours_since for f in fills if f.hours_since is not None and f.hours_since > 0]
    km_all = [f.km_since for f in fills if f.km_since is not None and f.km_since > 0]
    hours_mid = median(hours_all) if hours_all else 24.0
    km_mid = median(km_all) if km_all else 300.0

    rows = []
    for f in fills:
        base = baselines.get(f.record.vehicleId)
        consumption = f.l100 / base[0] if (f.l100 is not None and base) else 1.0
        hour = local_hour(f)
        rows.append([
            consumption,
            f.record.litres / (litres_median.get(f.record.vehicleId) or f.record.litres),
            math.log1p(max(f.hours_since if f.hours_since is not None else hours_mid, 0)),
            math.log1p(max(f.km_since if f.km_since is not None else km_mid, 0)),
            (f.record.pricePerLitre / f.reference_price) if (f.record.pricePerLitre and f.reference_price) else 1.0,
            math.sin(2 * math.pi * hour / 24),
            math.cos(2 * math.pi * hour / 24),
            1.0 if f.record.filledAt.weekday() >= 5 else 0.0,
        ])
    return np.asarray(rows, dtype=float)


def _reasons(f: Fill, row: np.ndarray) -> list[str]:
    """Concrete, human-meaningful reasons a fill-up stands out. The forest
    ranks how unusual a fill-up is overall; it is only reported when at
    least one of these holds, so normal variation (a weekend fill, a
    slightly smaller top-up) never raises an alert on its own."""
    reasons = []
    consumption, litres_ratio, _, _, price_ratio = row[:5]
    if f.l100 is not None and consumption >= config.FOREST_CONSUMPTION_RATIO:
        reasons.append(f"{consumption:.1f}x its usual fuel use")
    if litres_ratio >= config.FOREST_LITRES_RATIO:
        reasons.append(f"{f.record.litres:.0f} L, {litres_ratio:.1f}x its usual fill")
    if f.km_since is not None and 0 <= f.km_since < config.FOREST_SHORT_KM:
        reasons.append(f"only {f.km_since:.0f} km after the previous fill-up")
    if f.hours_since is not None and f.hours_since < config.FOREST_SHORT_HOURS:
        reasons.append(f"{f.hours_since:.1f} h after the previous fill-up")
    if f.reference_price and abs(price_ratio - 1) >= config.FOREST_PRICE_DEVIATION:
        reasons.append(f"price {abs(price_ratio - 1):.0%} {'above' if price_ratio > 1 else 'below'} the usual")
    hour = local_hour(f)
    if hour >= config.FOREST_NIGHT_FROM or hour < config.FOREST_NIGHT_TO:
        reasons.append(f"filled at {clock(f)} at night")
    return reasons


def unusual_fills(fills: list[Fill], baselines) -> list[Anomaly]:
    if len(fills) < config.FOREST_MIN_RECORDS:
        return []
    from sklearn.ensemble import IsolationForest  # imported only when used (slow import)

    X = _feature_rows(fills, baselines)
    model = IsolationForest(
        n_estimators=config.FOREST_TREES, contamination=config.FOREST_CONTAMINATION, random_state=0,
    ).fit(X)
    decision = model.decision_function(X)  # < 0 means an outlier
    worst = -decision.min() if decision.min() < 0 else 1.0
    centre = np.median(X, axis=0)
    spread = np.median(np.abs(X - centre), axis=0)
    spread[spread < 1e-6] = np.std(X, axis=0)[spread < 1e-6] + 1e-6

    found = []
    for f, row, d in zip(fills, X, decision):
        if d >= 0:
            continue
        reasons = _reasons(f, row)
        if not reasons:
            continue
        score = _clamp(-d / worst)
        zs = (row - centre) / spread
        found.append(Anomaly(
            type="UNUSUAL_FILL_PATTERN",
            severity=Severity.MEDIUM if score >= 0.5 else Severity.LOW,
            score=score,
            vehicleId=f.record.vehicleId, fuelRecordId=f.record.id,
            explanation={
                "summary": f"{f.plate}: unusual fill-up for this fleet: {', '.join(reasons)}.",
                "method": "isolation forest",
                "reasons": reasons,
                "factors": {FEATURES[i]: round(float(zs[i]), 2) for i in np.argsort(-np.abs(zs))[:3]},
            },
        ))
    return found


def driver_patterns(fills: list[Fill], baselines) -> list[Anomaly]:
    by_driver: dict[int, list[tuple[float, Fill]]] = {}
    for f in fills:
        base = baselines.get(f.record.vehicleId)
        if f.record.driverId is None or f.l100 is None or not base or base[2] < 4:
            continue
        by_driver.setdefault(f.record.driverId, []).append((f.l100 / base[0], f))
    found = []
    for driver_id, items in by_driver.items():
        if len(items) < config.DRIVER_MIN_SEGMENTS:
            continue
        ratio = median(r for r, _ in items)
        if ratio < config.DRIVER_LOW:
            continue
        latest = max((f for _, f in items), key=lambda f: f.record.filledAt)
        vehicles = sorted({f.plate for _, f in items})
        found.append(Anomaly(
            type="DRIVER_CONSUMPTION_PATTERN",
            severity=Severity.MEDIUM if ratio >= config.DRIVER_MEDIUM else Severity.LOW,
            score=_clamp((ratio - 1) / 1.0),
            vehicleId=latest.record.vehicleId, fuelRecordId=latest.record.id,
            explanation={
                "summary": f"When driver #{driver_id} drives, fuel use is typically {ratio - 1:.0%} above the vehicle's "
                           f"usual ({len(items)} stretches, {', '.join(vehicles)}). Consider coaching or a route check.",
                "method": "driver pattern", "driverId": driver_id, "ratio": round(ratio, 3), "stretches": len(items),
            },
        ))
    return found


def run_stats(request: AnalyzeRequest, fills_by_vehicle: dict[int, list[Fill]]) -> list[Anomaly]:
    baselines = vehicle_baselines(fills_by_vehicle)
    fills = all_fills(fills_by_vehicle)
    drift = efficiency_drift(fills_by_vehicle, request.generatedAt)

    # A drifting vehicle's recent high stretches are one problem, reported
    # once as the drift, not again stretch by stretch.
    drifting = {a.vehicleId for a in drift}
    cutoff = request.generatedAt - timedelta(days=config.DRIFT_RECENT_DAYS)
    recent_ids = {f.record.id for f in fills if f.record.vehicleId in drifting and f.record.filledAt >= cutoff}
    outliers = [a for a in consumption_outliers(fills_by_vehicle, baselines)
                if not (a.type == "CONSUMPTION_OUTLIER" and a.fuelRecordId in recent_ids)]

    return outliers + drift + unusual_fills(fills, baselines) + driver_patterns(fills, baselines)

