"""ai-fuel-service: internal fuel analytics for Transtrack Kenya.

Reachable only on the internal Docker network and authenticated with a
shared secret (X-Service-Secret). It never queries the database; the API
sends it a single organisation's data per request.
"""
import hmac
import os
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Header, HTTPException, status

from . import analyzer
from .contract import CONTRACT_VERSION, AnalyzeRequest, AnalyzeResponse


def _service_secret() -> str:
    secret = os.environ.get("AI_FUEL_SERVICE_SECRET", "")
    if len(secret) < 16:
        raise RuntimeError("AI_FUEL_SERVICE_SECRET must be set (at least 16 characters).")
    return secret


def require_service_secret(x_service_secret: str = Header(default="")) -> None:
    if not hmac.compare_digest(x_service_secret.encode(), _service_secret().encode()):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid service secret.")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    _service_secret()  # refuse to start without a secret
    yield


app = FastAPI(
    lifespan=lifespan,
    title="Transtrack AI Fuel Service",
    version=CONTRACT_VERSION,
    description="Fuel anomaly analysis for one organisation at a time. See docs/ai-fuel-contract.md.",
    docs_url=None,
    redoc_url=None,
)


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "contractVersion": CONTRACT_VERSION, "modelVersion": analyzer.MODEL_VERSION}


@app.post("/v1/analyze", response_model=AnalyzeResponse, dependencies=[Depends(require_service_secret)])
def analyze(request: AnalyzeRequest) -> AnalyzeResponse:
    if request.contractVersion.split(".")[0] != CONTRACT_VERSION.split(".")[0]:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Unsupported contract version.")

    known_vehicles = {v.id for v in request.vehicles}
    known_records = {r.id for r in request.fuelRecords}
    anomalies = [
        a for a in analyzer.analyze(request)
        if (a.vehicleId is None or a.vehicleId in known_vehicles)
        and (a.fuelRecordId is None or a.fuelRecordId in known_records)
    ]
    return AnalyzeResponse(
        organizationId=request.organizationId,
        modelVersion=analyzer.MODEL_VERSION,
        anomalies=anomalies,
    )
