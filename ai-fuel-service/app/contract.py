"""Request/response contract between the Transtrack API and this service.

Keep in step with docs/ai-fuel-contract.md and
server/src/fuel/providers/FuelAnalyticsProvider.js (CONTRACT_VERSION).
Every request carries exactly one organisation's data.
"""
from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field

CONTRACT_VERSION = "1.0"


class FuelType(str, Enum):
    DIESEL = "DIESEL"
    PETROL = "PETROL"
    ELECTRIC = "ELECTRIC"
    HYBRID = "HYBRID"
    CNG = "CNG"
    LPG = "LPG"


class FuelSource(str, Enum):
    MANUAL = "MANUAL"
    FUEL_CARD = "FUEL_CARD"


class Severity(str, Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


class Vehicle(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: int
    licensePlate: str
    fuelType: Optional[FuelType] = None
    tankCapacityLitres: Optional[float] = Field(default=None, gt=0)
    expectedConsumptionL100km: Optional[float] = Field(default=None, gt=0)


class FuelRecord(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: int
    vehicleId: int
    driverId: Optional[int] = None
    litres: float = Field(gt=0)
    pricePerLitre: Optional[float] = Field(default=None, gt=0)
    totalCost: Optional[float] = Field(default=None, ge=0)
    odometer: Optional[int] = Field(default=None, ge=0)
    station: Optional[str] = None
    filledAt: datetime
    source: FuelSource


class AnalyzeRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    contractVersion: str = CONTRACT_VERSION
    organizationId: int
    generatedAt: datetime
    vehicles: list[Vehicle] = Field(default_factory=list, max_length=10_000)
    fuelRecords: list[FuelRecord] = Field(default_factory=list, max_length=200_000)


class Explanation(BaseModel):
    """Human-readable explanation. `summary` is shown to fleet managers;
    any extra keys (factors, expected vs actual values...) are kept as-is."""
    model_config = ConfigDict(extra="allow")

    summary: str


class Anomaly(BaseModel):
    type: str = Field(min_length=1, max_length=100)
    severity: Severity
    score: float = Field(ge=0, le=1)
    vehicleId: Optional[int] = None
    fuelRecordId: Optional[int] = None
    explanation: Explanation


class AnalyzeResponse(BaseModel):
    organizationId: int
    contractVersion: str = CONTRACT_VERSION
    modelVersion: Optional[str] = None
    anomalies: list[Anomaly]

