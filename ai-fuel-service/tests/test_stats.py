import os

os.environ.setdefault("AI_FUEL_SERVICE_SECRET", "test-secret-0123456789")

from app import analyzer  # noqa: E402
from app.contract import AnalyzeRequest  # noqa: E402
from app.features import all_fills, build_fills  # noqa: E402
from app.stats import consumption_outliers, efficiency_drift, unusual_fills, vehicle_baselines  # noqa: E402
from tests.fleet_data import GENERATED, VEHICLES, add_after, fleet, last_of, request  # noqa: E402


def prepared(records, vehicles=VEHICLES):
    req = AnalyzeRequest.model_validate(request(records, vehicles))
    by_vehicle = build_fills(req)
    return req, by_vehicle, vehicle_baselines(by_vehicle)


def test_robust_z_flags_a_planted_outlier_but_not_normal_variation():
    records = fleet()
    _, by_vehicle, base = prepared(records)
    assert consumption_outliers(by_vehicle, base) == []

    last = last_of(records, 3)
    spike = add_after(records, 3, 48, litres=round(380 * 0.11 * 1.8, 1), odometer=last["odometer"] + 380)
    _, by_vehicle, base = prepared(records)
    hits = consumption_outliers(by_vehicle, base)
    assert [a.fuelRecordId for a in hits] == [spike["id"]]
    assert hits[0].type == "CONSUMPTION_OUTLIER"


def test_robust_z_works_without_an_expected_figure():
    records = fleet()
    last = last_of(records, 3)
    spike = add_after(records, 3, 48, litres=round(380 * 0.11 * 1.8, 1), odometer=last["odometer"] + 380)
    no_expected = [{**v, "expectedConsumptionL100km": None} for v in VEHICLES]
    _, by_vehicle, base = prepared(records, no_expected)
    assert spike["id"] in {a.fuelRecordId for a in consumption_outliers(by_vehicle, base)}


def test_drift_fires_at_25_percent_but_not_10():
    _, by_vehicle, _ = prepared(fleet(drift={1: 1.25}))
    hits = efficiency_drift(by_vehicle, GENERATED)
    assert [a.vehicleId for a in hits] == [1]
    assert hits[0].fuelRecordId is None
    assert "last 30 days" in hits[0].explanation.summary

    _, by_vehicle, _ = prepared(fleet(drift={1: 1.10}))
    assert efficiency_drift(by_vehicle, GENERATED) == []


def test_isolation_forest_needs_enough_data():
    records = fleet(days=60, every_days=3)   # well under 200 fill-ups
    _, by_vehicle, base = prepared(records)
    assert len(records) < 200
    assert unusual_fills(all_fills(by_vehicle), base) == []


def big_fleet():
    vehicles = VEHICLES + [
        {"id": 4, "licensePlate": "KDM 404D", "fuelType": "DIESEL", "tankCapacityLitres": 120, "expectedConsumptionL100km": 15},
        {"id": 5, "licensePlate": "KDM 505E", "fuelType": "DIESEL", "tankCapacityLitres": 90, "expectedConsumptionL100km": 12},
    ]
    return vehicles, fleet(days=90, every_days=1, vehicles=vehicles)


def test_isolation_forest_is_repeatable_and_finds_a_strange_fill():
    vehicles, records = big_fleet()
    assert len(records) >= 200
    last = last_of(records, 4)
    # 03:10 in Nairobi, on a Sunday, 8 km after the previous fill, 2.6x the usual litres.
    strange = add_after(records, 4, 0, litres=118, odometer=last["odometer"] + 8,
                        filledAt="2026-11-15T00:10:00+00:00")
    _, by_vehicle, base = prepared(records, vehicles)
    first = unusual_fills(all_fills(by_vehicle), base)
    second = unusual_fills(all_fills(by_vehicle), base)
    assert [(a.fuelRecordId, a.score) for a in first] == [(a.fuelRecordId, a.score) for a in second]
    assert strange["id"] in {a.fuelRecordId for a in first}
    hit = next(a for a in first if a.fuelRecordId == strange["id"])
    assert hit.severity.value in ("LOW", "MEDIUM")
    assert hit.explanation.method == "isolation forest"


def test_clean_history_raises_nothing_above_low():
    vehicles, records = big_fleet()
    hits = analyzer.analyze(AnalyzeRequest.model_validate(request(records, vehicles)))
    assert all(a.severity.value == "LOW" for a in hits), [a.explanation.summary for a in hits]
    assert len(hits) <= 0.01 * len(records)


def test_analyzer_reports_each_record_once_and_rules_win():
    vehicles, records = big_fleet()
    last = last_of(records, 1)
    over = add_after(records, 1, 48, litres=260, odometer=last["odometer"] + 900)  # rule: over tank
    req = AnalyzeRequest.model_validate(request(records, vehicles))
    hits = analyzer.analyze(req)
    on_record = [a for a in hits if a.fuelRecordId == over["id"]]
    assert {a.type for a in on_record} == {"OVER_TANK_CAPACITY"}
    keys = [(a.type, a.fuelRecordId, a.vehicleId if a.fuelRecordId is None else None) for a in hits]
    assert len(keys) == len(set(keys))
    order = {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3}
    assert [order[a.severity.value] for a in hits] == sorted(order[a.severity.value] for a in hits)
