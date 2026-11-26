"""Builds realistic analysis requests for tests: a few vehicles filling up
every couple of days with small natural variation (fixed seed)."""
import random
from datetime import datetime, timedelta, timezone

START = datetime(2026, 8, 18, 5, 0, tzinfo=timezone.utc)   # 08:00 in Nairobi
GENERATED = datetime(2026, 11, 16, 6, 0, tzinfo=timezone.utc)

VEHICLES = [
    {"id": 1, "licensePlate": "KDK 101A", "fuelType": "DIESEL", "tankCapacityLitres": 200, "expectedConsumptionL100km": 25},
    {"id": 2, "licensePlate": "KDK 202B", "fuelType": "DIESEL", "tankCapacityLitres": 150, "expectedConsumptionL100km": 18},
    {"id": 3, "licensePlate": "KDL 303C", "fuelType": "DIESEL", "tankCapacityLitres": 80, "expectedConsumptionL100km": 11},
]


def fleet(days=90, every_days=2, vehicles=VEHICLES, seed=7, drift=None):
    """Normal history for each vehicle. drift = {vehicle_id: factor} makes
    that vehicle burn `factor` times more over the last 30 days."""
    rng = random.Random(seed)
    records, next_id = [], 1
    for v in vehicles:
        odometer = 40_000 + v["id"] * 10_000
        t = START + timedelta(hours=v["id"])
        driver = 100 + v["id"]
        while t < START + timedelta(days=days):
            km = rng.uniform(320, 420)
            odometer += round(km)
            factor = 1.0
            if drift and v["id"] in drift and t >= GENERATED - timedelta(days=30):
                factor = drift[v["id"]]
            litres = round(km * v["expectedConsumptionL100km"] / 100 * rng.uniform(0.95, 1.05) * factor, 1)
            price = round(rng.uniform(178, 184), 2)
            records.append({
                "id": next_id, "vehicleId": v["id"], "driverId": driver, "litres": litres,
                "pricePerLitre": price, "totalCost": round(litres * price, 2), "odometer": odometer,
                "station": "Shell", "filledAt": t.isoformat(), "source": "MANUAL",
            })
            next_id += 1
            t += timedelta(days=every_days, minutes=rng.randint(-90, 90))
    return records


def request(records, vehicles=VEHICLES):
    return {
        "contractVersion": "1.0", "organizationId": 7, "generatedAt": GENERATED.isoformat(),
        "vehicles": vehicles, "fuelRecords": records,
    }


def last_of(records, vehicle_id):
    return max((r for r in records if r["vehicleId"] == vehicle_id), key=lambda r: r["filledAt"])


def add_after(records, vehicle_id, hours, **changes):
    """Appends a fill-up `hours` after the vehicle's latest one."""
    base = last_of(records, vehicle_id)
    rec = {**base, "id": max(r["id"] for r in records) + 1,
           "filledAt": (datetime.fromisoformat(base["filledAt"]) + timedelta(hours=hours)).isoformat()}
    rec.update(changes)
    if "litres" in changes and "totalCost" not in changes and rec.get("pricePerLitre"):
        rec["totalCost"] = round(rec["litres"] * rec["pricePerLitre"], 2)
    records.append(rec)
    return rec
