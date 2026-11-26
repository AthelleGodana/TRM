"""Fuel anomaly analysis.

Receives one organisation's vehicles and fuel records and returns
anomalies. It must not reach out to the Transtrack database or any other
tenant's data: everything it may use is in the request.

  Option 1, rules (app/rules.py): fixed, self-explaining checks.
  Option 2, statistics (app/stats.py): learnt from this organisation's data.

No external AI service is called; nothing leaves this container.
"""
from .contract import AnalyzeRequest, Anomaly
from .features import all_fills, build_fills
from .rules import run_rules
from .stats import run_stats

MODEL_VERSION = "rules-1+stats-1"

_SEVERITY_ORDER = {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3}


def analyze(request: AnalyzeRequest) -> list[Anomaly]:
    fills_by_vehicle = build_fills(request)
    rule_hits = run_rules(all_fills(fills_by_vehicle))

    # A fill-up a rule already explains is not reported again by the
    # statistics, which are less specific.
    explained = {a.fuelRecordId for a in rule_hits if a.fuelRecordId is not None}
    stat_hits = [a for a in run_stats(request, fills_by_vehicle) if a.fuelRecordId is None or a.fuelRecordId not in explained]

    # One finding per (type, record/vehicle).
    unique: dict[tuple, Anomaly] = {}
    for a in rule_hits + stat_hits:
        key = (a.type, a.fuelRecordId if a.fuelRecordId is not None else f"vehicle:{a.vehicleId}")
        if key not in unique or a.score > unique[key].score:
            unique[key] = a

    return sorted(unique.values(), key=lambda a: (_SEVERITY_ORDER[a.severity.value], -a.score, a.fuelRecordId or 0))
