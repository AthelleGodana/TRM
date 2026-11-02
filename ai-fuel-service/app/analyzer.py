"""Fuel anomaly analysis.

This is where the real model goes. It receives one organisation's vehicles
and fuel records and returns anomalies. It must not reach out to the
Transtrack database or any other tenant's data: everything it may use is in
the request.
"""
from .contract import AnalyzeRequest, Anomaly

MODEL_VERSION = "stub-0"


def analyze(request: AnalyzeRequest) -> list[Anomaly]:
    # Placeholder: no model yet, so no anomalies.
    return []
