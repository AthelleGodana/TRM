"""Thresholds for the fuel checks, in one place so they can be tuned.

Ratios are actual / expected (1.3 = 30% above). Distances in km, times in
hours, money in KES.
"""

# Fill-ups are compared with the previous fill-up of the same vehicle.
MIN_SEGMENT_KM = 50          # shorter stretches are too noisy for L/100 km
SMOOTHING_SEGMENTS = 3       # rolling window that absorbs partial top-ups

# Rule: over tank capacity
TANK_TOLERANCE = 1.05        # pumps and tank figures are not exact
TANK_CRITICAL = 1.25

# Rule: rapid refill
RAPID_REFILL_HOURS = 3
RAPID_REFILL_HIGH_HOURS = 0.5
RAPID_REFILL_KM = 20
RAPID_REFILL_TANK_FRACTION = 0.2

# Rule: duplicate entry
DUPLICATE_MINUTES = 10
DUPLICATE_LITRES = 0.5

# Rule: high consumption (vs the vehicle's expected L/100 km)
CONSUMPTION_MEDIUM = 1.3
CONSUMPTION_HIGH = 1.6
CONSUMPTION_CRITICAL = 2.0

# Rule: price outlier (vs the organisation's median price that week)
PRICE_WINDOW_DAYS = 7
PRICE_MIN_PEERS = 3
PRICE_MEDIUM = 0.15
PRICE_HIGH = 0.30

# Rule: cost mismatch (total vs litres x price)
COST_TOLERANCE = 0.02
COST_MIN_KES = 50

# Statistics
ZSCORE_MIN_SEGMENTS = 6
ZSCORE_THRESHOLD = 3.5
ZSCORE_HIGH = 6.0
DRIFT_RECENT_DAYS = 30
DRIFT_MIN_RECENT = 4
DRIFT_MIN_BEFORE = 6
DRIFT_MEDIUM = 1.2
DRIFT_HIGH = 1.4
FOREST_MIN_RECORDS = 200
FOREST_CONTAMINATION = 0.02
FOREST_TREES = 200
# A forest outlier is reported only with at least one concrete reason:
FOREST_CONSUMPTION_RATIO = 1.4   # x the vehicle's usual L/100 km
FOREST_LITRES_RATIO = 1.6        # x the vehicle's usual fill
FOREST_SHORT_KM = 50
FOREST_SHORT_HOURS = 6
FOREST_PRICE_DEVIATION = 0.10
FOREST_NIGHT_FROM = 22           # local hour; night is 22:00-05:00
FOREST_NIGHT_TO = 5
DRIVER_MIN_SEGMENTS = 5
DRIVER_LOW = 1.25
DRIVER_MEDIUM = 1.4

# Kenya has no daylight saving: East Africa Time is always UTC+3.
LOCAL_UTC_OFFSET_HOURS = 3
