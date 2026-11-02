# AI Fuel Service contract (v1.0)

This is the interface between the Transtrack API and `ai-fuel-service`. Build the fuel anomaly model against it. Three files implement it and must change together:

- `ai-fuel-service/app/contract.py` (Pydantic models)
- `server/src/fuel/providers/FuelAnalyticsProvider.js` (`CONTRACT_VERSION`, response validation)
- `server/src/fuel/analysisJob.js` (request builder)

## Ground rules

- **One organisation per request.** The API sends a single tenant's vehicles and fuel records. The service never sees any other tenant's data.
- **No database access.** The service must not connect to the Transtrack database or call the API. Everything it may use is in the request body.
- **Internal only.** The service runs on the `ai-internal` Docker network. It publishes no ports and has no internet access.
- **Authenticated.** Every `/v1/*` call carries `X-Service-Secret: <AI_FUEL_SERVICE_SECRET>`, which the service compares in constant time. The secret must be at least 16 characters, and the service refuses to start without one.
- **IDs are validated on the way back.** The API rejects a whole response if:
  - its `organizationId` differs from the request's, or
  - any anomaly references a `vehicleId` or `fuelRecordId` that was not in the request.

  The run is then recorded as `FAILED`, and none of its anomalies are stored.

## `GET /health`

No authentication. Used by the Docker healthcheck.

```json
{ "status": "ok", "contractVersion": "1.0", "modelVersion": "stub-0" }
```

## `POST /v1/analyze`

### Request

```json
{
  "contractVersion": "1.0",
  "organizationId": 7,
  "generatedAt": "2026-11-02T08:00:00Z",
  "vehicles": [
    {
      "id": 12,
      "licensePlate": "KDA 123X",
      "fuelType": "DIESEL",
      "tankCapacityLitres": 200,
      "expectedConsumptionL100km": 25
    }
  ],
  "fuelRecords": [
    {
      "id": 345,
      "vehicleId": 12,
      "driverId": 3,
      "litres": 40,
      "pricePerLitre": 180,
      "totalCost": 7200,
      "odometer": 12000,
      "station": "Shell Westlands",
      "filledAt": "2026-11-01T07:30:00Z",
      "source": "MANUAL"
    }
  ]
}
```

| Field | Type | Notes |
|---|---|---|
| `contractVersion` | string | A different major version returns `422`. |
| `organizationId` | int | Echo it back in the response. |
| `generatedAt` | ISO-8601 | When the API built the request. |
| `vehicles[].fuelType` | enum or null | `DIESEL`, `PETROL`, `ELECTRIC`, `HYBRID`, `CNG` or `LPG`. Null if the vehicle has no fuel profile. |
| `vehicles[].tankCapacityLitres` | number or null | From `VehicleFuelProfile`. |
| `vehicles[].expectedConsumptionL100km` | number or null | From `VehicleFuelProfile`. |
| `fuelRecords[]` | | Records from the last `FUEL_ANALYSIS_LOOKBACK_DAYS` days (default 90), oldest first. |
| `fuelRecords[].litres` | number > 0 | |
| `fuelRecords[].pricePerLitre`, `totalCost` | number or null | Records copied from old vehicle logs may lack a cost. |
| `fuelRecords[].odometer` | int or null | Kilometres. |
| `fuelRecords[].driverId` | int or null | |
| `fuelRecords[].source` | enum | `MANUAL` or `FUEL_CARD`. |

Limits: up to 10,000 vehicles and 200,000 fuel records per request. Unknown fields are ignored, so the API can add fields without breaking the service.

### Response `200`

```json
{
  "organizationId": 7,
  "contractVersion": "1.0",
  "modelVersion": "fuel-iforest-2027.01",
  "anomalies": [
    {
      "type": "CONSUMPTION_SPIKE",
      "severity": "HIGH",
      "score": 0.87,
      "vehicleId": 12,
      "fuelRecordId": 345,
      "explanation": {
        "summary": "Used 42% more fuel per km than this vehicle's expected 25 L/100 km.",
        "expectedL100km": 25,
        "observedL100km": 35.5
      }
    }
  ]
}
```

| Field | Type | Notes |
|---|---|---|
| `anomalies[].type` | string (1–100 chars) | A free-form code. Suggested values: `CONSUMPTION_SPIKE`, `TANK_OVERFILL`, `ODOMETER_REGRESSION`, `PRICE_OUTLIER`, `DUPLICATE_FILL`, `OFF_ROUTE_FILL`. |
| `anomalies[].severity` | enum | `LOW`, `MEDIUM`, `HIGH` or `CRITICAL`. |
| `anomalies[].score` | number from 0 to 1 | The model's confidence or anomaly score. |
| `anomalies[].vehicleId` | int or null | Must be one of the request's `vehicles[].id`. |
| `anomalies[].fuelRecordId` | int or null | Must be one of the request's `fuelRecords[].id`. |
| `anomalies[].explanation.summary` | string | **Required.** Fleet managers see this as plain text on the Insights page. |
| `anomalies[].explanation.*` | any | Extra factors are stored as JSON and shown later. |

An empty `anomalies` list is valid. The current stub always returns one.

### Errors

| Status | Meaning |
|---|---|
| `401` | Missing or wrong `X-Service-Secret`. |
| `422` | Invalid payload, or an unsupported contract major version. |
| `5xx` / timeout | The API marks the run `FAILED`. The timeout is `AI_FUEL_SERVICE_TIMEOUT_MS`, default 30 s. |

## How the API calls it

1. `runFuelAnalysisForTenant(org)` runs per organisation. It is triggered by an ORG_ADMIN with `POST /api/fuel/analysis/run`, or by the scheduled hook when `FUEL_ANALYSIS_JOB_ENABLED=true`.
2. The provider is chosen per organisation:
   - `HttpFuelAnalyticsProvider` (this service) when `FUEL_ANALYTICS_PROVIDER=http`, the service URL and secret are set, **and** the organisation has both `fuelHubEnabled` and `aiFuelAnalyticsEnabled`.
   - Otherwise `NullFuelAnalyticsProvider`, and the run is recorded as `SKIPPED`.
3. Every run creates a `FuelAnalysisRun` row. Accepted anomalies become `FuelAnomaly` rows with status `OPEN`. Fleet managers review them as `CONFIRMED` or `DISMISSED` in the Insights page.

## Changing the contract

- **Adding optional fields** is backward compatible: bump the minor version (`1.1`).
- **Removing or renaming fields**, or changing their meaning, needs a new major version (`2.0`). Update all three implementation files and this document together.
