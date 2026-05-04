import logging
from collections import defaultdict
from datetime import datetime, timedelta

from motor.motor_asyncio import AsyncIOMotorDatabase

from config import HealthInsightsConfig
from external.streaming_provider import WorkoutRecord
from models.healthkit import HealthKitRecord

logger = logging.getLogger(__name__)

VITAL_TYPES = {
    "HKQuantityTypeIdentifierRestingHeartRate": "count/min",
    "HKQuantityTypeIdentifierHeartRateVariabilitySDNN": "ms",
    "HKQuantityTypeIdentifierOxygenSaturation": "%",
    "HKQuantityTypeIdentifierRespiratoryRate": "count/min",
    "HKQuantityTypeIdentifierWalkingHeartRateAverage": "count/min",
}

ACTIVITY_TYPES = {
    "HKQuantityTypeIdentifierStepCount": "count",
    "HKQuantityTypeIdentifierActiveEnergyBurned": "kcal",
    "HKQuantityTypeIdentifierAppleExerciseTime": "min",
}

NUTRITION_TYPES = {
    "HKQuantityTypeIdentifierDietaryCarbohydrates": "g",
    "HKQuantityTypeIdentifierBloodGlucose": "mg/dL",
}

SLEEP_TYPE = "HKCategoryTypeIdentifierSleepAnalysis"

IN_BED = "HKCategoryValueSleepAnalysisInBed"
ASLEEP = "HKCategoryValueSleepAnalysisAsleep"
AWAKE = "HKCategoryValueSleepAnalysisAwake"


def _window_cutoff(window_days: int) -> datetime:
    return datetime.utcnow() - timedelta(days=window_days)


def _compute_vitals(records: list[HealthKitRecord], window_days: int) -> dict:
    cutoff = _window_cutoff(window_days)
    by_type: dict[str, list[float]] = defaultdict(list)

    for r in records:
        if r.type not in VITAL_TYPES:
            continue
        if r.start_date.replace(tzinfo=None) < cutoff:
            continue
        by_type[r.type].append(r.value)

    result = {}
    for hk_type, values in by_type.items():
        if not values:
            continue
        result[hk_type] = {
            "min": min(values),
            "max": max(values),
            "avg": sum(values) / len(values),
            "unit": VITAL_TYPES[hk_type],
        }
    return result


def _compute_activity(records: list[HealthKitRecord], window_days: int) -> dict:
    cutoff = _window_cutoff(window_days)
    by_type: dict[str, dict] = defaultdict(lambda: defaultdict(float))

    for r in records:
        if r.type not in ACTIVITY_TYPES:
            continue
        if r.start_date.replace(tzinfo=None) < cutoff:
            continue
        day = r.start_date.date()
        by_type[r.type][day] += r.value

    result = {}
    for hk_type, daily in by_type.items():
        if not daily:
            continue
        daily_totals = [{"date": str(d), "value": v} for d, v in sorted(daily.items())]
        totals = [entry["value"] for entry in daily_totals]
        rolling_avg = sum(totals) / len(totals)
        result[hk_type] = {
            "daily_totals": daily_totals,
            "rolling_avg": rolling_avg,
            "unit": ACTIVITY_TYPES[hk_type],
        }
    return result


def _compute_nutrition(records: list[HealthKitRecord], window_days: int) -> dict:
    cutoff = _window_cutoff(window_days)
    by_type: dict[str, dict] = defaultdict(lambda: defaultdict(float))

    for r in records:
        if r.type not in NUTRITION_TYPES:
            continue
        if r.start_date.replace(tzinfo=None) < cutoff:
            continue
        day = r.start_date.date()
        by_type[r.type][day] += r.value

    result = {}
    for hk_type, daily in by_type.items():
        if not daily:
            continue
        daily_totals = [{"date": str(d), "value": v} for d, v in sorted(daily.items())]
        totals = [entry["value"] for entry in daily_totals]
        result[hk_type] = {
            "daily_totals": daily_totals,
            "rolling_avg": sum(totals) / len(totals),
            "unit": NUTRITION_TYPES[hk_type],
        }
    return result


def _compute_workouts(workouts: list[WorkoutRecord], window_days: int) -> dict:
    cutoff = _window_cutoff(window_days)
    sessions = []
    total_kcal = 0.0
    total_duration = 0.0
    total_distance = 0.0

    for w in workouts:
        if w.start_date.replace(tzinfo=None) < cutoff:
            continue
        sessions.append({
            "type": w.workout_type,
            "duration_sec": w.duration_sec,
            "kcal": w.kcal,
            "distance_km": w.distance_km,
            "start_date": w.start_date,
        })
        total_kcal += w.kcal
        total_duration += w.duration_sec
        total_distance += w.distance_km

    return {
        "sessions": sessions,
        "rolling_total_kcal": total_kcal,
        "rolling_total_duration_sec": total_duration,
        "rolling_total_distance_km": total_distance,
    }


def _compute_sleep(sleep_records: list[dict], window_days: int) -> dict:
    cutoff = _window_cutoff(window_days)
    nightly: dict = defaultdict(lambda: {"total_in_bed_min": 0.0, "total_asleep_min": 0.0, "total_awake_min": 0.0})

    for rec in sleep_records:
        start = rec["start_date"]
        end = rec["end_date"]
        value = rec["value"]
        if start.replace(tzinfo=None) < cutoff:
            continue
        duration_min = (end - start).total_seconds() / 60
        day = rec["date"]
        if value == IN_BED:
            nightly[day]["total_in_bed_min"] += duration_min
        elif value == ASLEEP:
            nightly[day]["total_asleep_min"] += duration_min
        elif value == AWAKE:
            nightly[day]["total_awake_min"] += duration_min

    nightly_list = [
        {"date": str(d), **v}
        for d, v in sorted(nightly.items())
    ]

    asleep_values = [n["total_asleep_min"] for n in nightly_list]
    rolling_avg = sum(asleep_values) / len(asleep_values) if asleep_values else 0.0

    return {
        "nightly": nightly_list,
        "rolling_avg_asleep_min": rolling_avg,
    }


READINGS_BUFFER_SIZE = 10

TRACKED_METRIC_TYPES = {**VITAL_TYPES, **ACTIVITY_TYPES, **NUTRITION_TYPES}


def _build_readings_push(records: list[HealthKitRecord]) -> dict:
    """Build the $push payload to append one reading per metric type to each buffer."""
    now = datetime.utcnow()
    push_ops = {}
    for r in records:
        if r.type not in TRACKED_METRIC_TYPES:
            continue
        safe_key = r.type.replace(".", "_")
        field = f"readings.{safe_key}"
        entry = {"value": r.value, "timestamp": now}
        if field not in push_ops:
            push_ops[field] = {"$each": [entry], "$slice": -READINGS_BUFFER_SIZE}
        else:
            push_ops[field]["$each"].append(entry)
    return push_ops


class AggregationService:
    def __init__(self, db: AsyncIOMotorDatabase, config: HealthInsightsConfig):
        self.db = db
        self.config = config

    async def update(
        self,
        user_id: str,
        records: list[HealthKitRecord],
        workouts: list[WorkoutRecord],
        sleep_records: list[dict] | None = None,
    ) -> None:
        if not records and not workouts and not sleep_records:
            logger.debug("No data to aggregate for user %s", user_id)
            return

        if sleep_records is None:
            sleep_records = []

        window_days = self.config.AggregationWindowDays

        set_doc = {
            "user_id": user_id,
            "last_updated": datetime.utcnow(),
            "vitals": _compute_vitals(records, window_days),
            "activity": _compute_activity(records, window_days),
            "workouts": _compute_workouts(workouts, window_days),
            "sleep": _compute_sleep(sleep_records, window_days),
            "nutrition": _compute_nutrition(records, window_days),
        }

        push_ops = _build_readings_push(records)

        try:
            update_payload: dict = {"$set": set_doc}
            if push_ops:
                update_payload["$push"] = push_ops
            await self.db.healthkit_aggregations.update_one(
                {"user_id": user_id},
                update_payload,
                upsert=True,
            )
        except Exception as e:
            logger.error("Failed to upsert aggregation for user %s: %s", user_id, e)
