import os

os.environ.setdefault("AI_FUEL_SERVICE_SECRET", "test-secret-0123456789")

from fastapi.testclient import TestClient  # noqa: E402

from app import analyzer  # noqa: E402
from app.contract import Anomaly  # noqa: E402
from app.main import app  # noqa: E402

SECRET = os.environ["AI_FUEL_SERVICE_SECRET"]
client = TestClient(app)

REQUEST = {
    "contractVersion": "1.0",
    "organizationId": 7,
    "generatedAt": "2026-11-02T08:00:00Z",
    "vehicles": [{"id": 12, "licensePlate": "KDA 123X", "fuelType": "DIESEL",
                  "tankCapacityLitres": 200, "expectedConsumptionL100km": 25}],
    "fuelRecords": [{"id": 345, "vehicleId": 12, "driverId": 3, "litres": 40, "pricePerLitre": 180,
                     "totalCost": 7200, "odometer": 12000, "station": "Shell", "filledAt": "2026-11-01T07:30:00Z",
                     "source": "MANUAL"}],
}


def test_health_needs_no_secret():
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json()["status"] == "ok"


def test_analyze_requires_the_service_secret():
    assert client.post("/v1/analyze", json=REQUEST).status_code == 401
    assert client.post("/v1/analyze", json=REQUEST, headers={"X-Service-Secret": "wrong"}).status_code == 401


def test_analyze_returns_an_empty_list_for_now():
    res = client.post("/v1/analyze", json=REQUEST, headers={"X-Service-Secret": SECRET})
    assert res.status_code == 200
    body = res.json()
    assert body["organizationId"] == 7
    assert body["anomalies"] == []
    assert body["contractVersion"] == "1.0"


def test_rejects_invalid_payloads():
    bad = {**REQUEST, "fuelRecords": [{**REQUEST["fuelRecords"][0], "litres": -5}]}
    assert client.post("/v1/analyze", json=bad, headers={"X-Service-Secret": SECRET}).status_code == 422
    v2 = {**REQUEST, "contractVersion": "2.0"}
    assert client.post("/v1/analyze", json=v2, headers={"X-Service-Secret": SECRET}).status_code == 422


def test_model_output_is_limited_to_ids_in_the_request(monkeypatch):
    def fake(request):
        return [
            Anomaly(type="CONSUMPTION_SPIKE", severity="HIGH", score=0.9, vehicleId=12, fuelRecordId=345,
                    explanation={"summary": "Used 42% more fuel than expected.", "expected": 25, "actual": 35.5}),
            Anomaly(type="LEAK", severity="LOW", score=0.2, fuelRecordId=999, explanation={"summary": "x"}),
        ]

    monkeypatch.setattr(analyzer, "analyze", fake)
    res = client.post("/v1/analyze", json=REQUEST, headers={"X-Service-Secret": SECRET})
    anomalies = res.json()["anomalies"]
    assert [a["type"] for a in anomalies] == ["CONSUMPTION_SPIKE"]
    assert anomalies[0]["explanation"]["actual"] == 35.5
