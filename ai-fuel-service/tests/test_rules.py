import os

os.environ.setdefault("AI_FUEL_SERVICE_SECRET", "test-secret-0123456789")

from app.contract import AnalyzeRequest  # noqa: E402
from app.features import all_fills, build_fills  # noqa: E402
from app.rules import run_rules  # noqa: E402
from tests.fleet_data import VEHICLES, add_after, fleet, last_of, request  # noqa: E402


def rule_hits(records, vehicles=VEHICLES):
    req = AnalyzeRequest.model_validate(request(records, vehicles))
    return run_rules(all_fills(build_fills(req)))


def types_for(hits, record_id):
    return {a.type for a in hits if a.fuelRecordId == record_id}


def test_normal_history_raises_nothing():
    assert rule_hits(fleet()) == []


def test_over_tank_capacity_high_and_critical():
    records = fleet()
    last = last_of(records, 1)
    high = add_after(records, 1, 48, litres=220, odometer=last["odometer"] + 880)        # 110% of 200 L
    critical = add_after(records, 1, 96, litres=260, odometer=last["odometer"] + 1900)   # 130%
    hits = {a.fuelRecordId: a for a in rule_hits(records) if a.type == "OVER_TANK_CAPACITY"}
    assert hits[high["id"]].severity.value == "HIGH"
    assert hits[critical["id"]].severity.value == "CRITICAL"
    assert "tank holds 200 L" in hits[high["id"]].explanation.summary


def test_over_tank_capacity_tolerates_small_overfill_and_unknown_tank():
    records = fleet()
    last = last_of(records, 1)
    ok = add_after(records, 1, 48, litres=208, odometer=last["odometer"] + 830)  # 104%: within tolerance
    assert "OVER_TANK_CAPACITY" not in types_for(rule_hits(records), ok["id"])
    no_tank = [{**v, "tankCapacityLitres": None} for v in VEHICLES]
    big = add_after(records, 1, 96, litres=400, odometer=last["odometer"] + 2400)
    assert "OVER_TANK_CAPACITY" not in types_for(rule_hits(records, no_tank), big["id"])


def test_odometer_rollback():
    records = fleet()
    last = last_of(records, 2)
    bad = add_after(records, 2, 48, odometer=last["odometer"] - 50, litres=60)
    hit = next(a for a in rule_hits(records) if a.fuelRecordId == bad["id"] and a.type == "ODOMETER_ROLLBACK")
    assert hit.severity.value == "HIGH"
    assert hit.explanation.previousRecordId == last["id"]


def test_duplicate_entry_is_not_also_a_rapid_refill():
    records = fleet()
    last = last_of(records, 3)
    dup = add_after(records, 3, 0.1, litres=last["litres"])  # same litres, 6 minutes later
    found = types_for(rule_hits(records), dup["id"])
    assert "DUPLICATE_ENTRY" in found
    assert "RAPID_REFILL" not in found


def test_rapid_refill_by_time_and_by_distance():
    records = fleet()
    last = last_of(records, 1)
    soon = add_after(records, 1, 0.4, litres=30, odometer=last["odometer"] + 5)       # 24 min later
    hits = rule_hits(records)
    rapid = next(a for a in hits if a.fuelRecordId == soon["id"] and a.type == "RAPID_REFILL")
    assert rapid.severity.value == "HIGH"

    records = fleet()
    last = last_of(records, 1)
    short = add_after(records, 1, 6, litres=60, odometer=last["odometer"] + 12)        # 12 km, 30% of tank
    assert "RAPID_REFILL" in types_for(rule_hits(records), short["id"])


def test_high_consumption_bands():
    records = fleet()
    last = last_of(records, 1)
    # Three stretches of 200 km at 2.2x the expected 25 L/100 km (110 L each,
    # within the 200 L tank).
    recs = [add_after(records, 1, 24 * (i + 1), litres=round(200 * 0.25 * 2.2, 1), odometer=last["odometer"] + 200 * (i + 1))
            for i in range(3)]
    hits = {a.fuelRecordId: a for a in rule_hits(records) if a.type == "HIGH_CONSUMPTION"}
    assert hits[recs[-1]["id"]].severity.value == "CRITICAL"
    assert hits[recs[-1]["id"]].explanation.expected == 25


def test_an_over_tank_fill_does_not_also_raise_consumption_alerts():
    records = fleet()
    last = last_of(records, 1)
    over = add_after(records, 1, 48, litres=260, odometer=last["odometer"] + 400)
    after = [add_after(records, 1, 48 * (i + 2), litres=100, odometer=last["odometer"] + 400 * (i + 2)) for i in range(2)]
    hits = rule_hits(records)
    assert types_for(hits, over["id"]) == {"OVER_TANK_CAPACITY"}
    assert all("HIGH_CONSUMPTION" not in types_for(hits, r["id"]) for r in after)


def test_high_consumption_skipped_without_expected_figure():
    records = fleet()
    last = last_of(records, 1)
    rec = add_after(records, 1, 48, litres=180, odometer=last["odometer"] + 400)
    no_expected = [{**v, "expectedConsumptionL100km": None} for v in VEHICLES]
    assert "HIGH_CONSUMPTION" not in types_for(rule_hits(records, no_expected), rec["id"])


def test_price_outlier_and_cost_mismatch():
    records = fleet()
    last = last_of(records, 2)
    pricey = add_after(records, 2, 48, pricePerLitre=240.0, litres=70, odometer=last["odometer"] + 390)
    hit = next(a for a in rule_hits(records) if a.fuelRecordId == pricey["id"] and a.type == "PRICE_OUTLIER")
    assert hit.severity.value == "HIGH"   # about 32% above ~181

    records = fleet()
    last = last_of(records, 2)
    padded = add_after(records, 2, 48, litres=70, pricePerLitre=180.0, totalCost=14_000, odometer=last["odometer"] + 390)
    found = types_for(rule_hits(records), padded["id"])
    assert "COST_MISMATCH" in found
    small = add_after(records, 2, 96, litres=70, pricePerLitre=180.0, totalCost=12_640, odometer=last["odometer"] + 780)
    assert "COST_MISMATCH" not in types_for(rule_hits(records), small["id"])  # KES 40 rounding is fine
