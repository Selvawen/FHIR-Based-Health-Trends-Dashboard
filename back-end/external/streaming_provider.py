import logging
import os
import random
import xml.etree.ElementTree as ET
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone

from external.external_providers import HealthKitDataProvider
from models.healthkit import HealthKitRecord

logger = logging.getLogger(__name__)

METRIC_UNITS = {
    "HKQuantityTypeIdentifierRestingHeartRate": "count/min",
    "HKQuantityTypeIdentifierHeartRateVariabilitySDNN": "ms",
    "HKQuantityTypeIdentifierOxygenSaturation": "%",
    "HKQuantityTypeIdentifierRespiratoryRate": "count/min",
    "HKQuantityTypeIdentifierWalkingHeartRateAverage": "count/min",
    "HKQuantityTypeIdentifierStepCount": "count",
    "HKQuantityTypeIdentifierActiveEnergyBurned": "kcal",
    "HKQuantityTypeIdentifierAppleExerciseTime": "min",
    "HKQuantityTypeIdentifierDietaryCarbohydrates": "g",
    "HKQuantityTypeIdentifierBloodGlucose": "mg/dL",
}

WORKOUT_PROB: float = 0.20
DIETARY_PROB: float = 0.30

WORKOUT_KCAL_PER_MIN: dict[str, tuple[float, float]] = {
    "HKWorkoutActivityTypeRunning": (10.0, 14.0),
    "HKWorkoutActivityTypeWalking": (4.0, 6.0),
    "HKWorkoutActivityTypeTraditionalStrengthTraining": (5.0, 8.0),
}

WORKOUT_TYPES = list(WORKOUT_KCAL_PER_MIN.keys())
MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack"]


@dataclass
class WorkoutRecord:
    user_id: str
    workout_type: str
    duration_sec: float
    kcal: float
    start_date: datetime
    end_date: datetime
    distance_km: float = 0.0


@dataclass
class DietaryRecord:
    patient_id: str
    calories_kcal: float
    protein_g: float
    carbs_g: float
    fat_g: float
    sugar_g: float
    meal_type: str
    timestamp: datetime


class StreamingHealthKitProvider(HealthKitDataProvider):

    def __init__(self, source_dir: str):
        if not source_dir:
            raise ValueError("source_dir must be a non-empty string")
        self.source_dir = source_dir
        self._ranges: dict[str, tuple[float, float]] = {}
        self._workouts: dict[str, list[WorkoutRecord]] = {}
        self._sleep_records: dict[str, list[dict]] = {}
        self._failed_users: set[str] = set()
        self._loaded_users: set[str] = set()
        self._pending_workouts: dict[str, list[WorkoutRecord]] = defaultdict(list)
        self._pending_dietary: dict[str, list[DietaryRecord]] = defaultdict(list)

    def _load_user(self, user_id: str) -> None:
        if user_id in self._loaded_users or user_id in self._failed_users:
            return

        path = f"{self.source_dir}/{user_id}.xml"
        fallback_path = f"{self.source_dir}/2 Months Mixed Health Apple Health Data.xml"

        if not os.path.exists(path):
            logger.warning("XML file not found for user %s, falling back to mixed data file", user_id)
            path = fallback_path

        try:
            tree = ET.parse(path)
        except FileNotFoundError:
            logger.error("XML file not found for user %s: %s", user_id, path)
            self._failed_users.add(user_id)
            return
        except ET.ParseError as e:
            logger.error("Failed to parse XML for user %s: %s", user_id, e)
            self._failed_users.add(user_id)
            return

        root = tree.getroot()
        values_by_type: dict[str, list[float]] = defaultdict(list)
        workouts: list[WorkoutRecord] = []
        sleep_records: list[dict] = []

        for elem in root.findall("Record"):
            hk_type = elem.attrib.get("type", "")
            if hk_type in METRIC_UNITS:
                try:
                    values_by_type[hk_type].append(float(elem.attrib["value"]))
                except (KeyError, ValueError):
                    pass
            elif hk_type == "HKCategoryTypeIdentifierSleepAnalysis":
                try:
                    start = datetime.strptime(elem.attrib["startDate"], "%Y-%m-%d %H:%M:%S %z")
                    end = datetime.strptime(elem.attrib["endDate"], "%Y-%m-%d %H:%M:%S %z")
                    sleep_records.append({
                        "date": start.date(),
                        "value": elem.attrib["value"],
                        "start_date": start,
                        "end_date": end,
                    })
                except Exception as e:
                    logger.debug("Skipping malformed sleep record: %s", e)

        for elem in root.findall("Workout"):
            try:
                start = datetime.strptime(elem.attrib["startDate"], "%Y-%m-%d %H:%M:%S %z")
                end = datetime.strptime(elem.attrib["endDate"], "%Y-%m-%d %H:%M:%S %z")
                workouts.append(WorkoutRecord(
                    user_id=user_id,
                    workout_type=elem.attrib["workoutActivityType"],
                    duration_sec=float(elem.attrib["duration"]),
                    kcal=float(elem.attrib["totalEnergyBurned"]),
                    start_date=start,
                    end_date=end,
                    distance_km=float(elem.attrib.get("totalDistance", 0.0)),
                ))
            except Exception as e:
                logger.debug("Skipping malformed Workout element: %s", e)

        ranges: dict[str, tuple[float, float]] = {}
        for hk_type, vals in values_by_type.items():
            if vals:
                lo, hi = min(vals), max(vals)
                if hk_type == "HKQuantityTypeIdentifierOxygenSaturation" and hi <= 1.0:
                    lo, hi = round(lo * 100, 2), round(hi * 100, 2)
                ranges[hk_type] = (lo, hi)

        self._ranges[user_id] = ranges
        self._workouts[user_id] = workouts
        self._sleep_records[user_id] = sleep_records
        self._loaded_users.add(user_id)
        logger.info("Loaded ranges for user %s: %d metric types", user_id, len(ranges))

    def _generate_workout(self, user_id: str) -> WorkoutRecord:
        workout_type = random.choice(WORKOUT_TYPES)
        duration_sec = round(random.uniform(600, 3600), 1)
        kcal_lo, kcal_hi = WORKOUT_KCAL_PER_MIN[workout_type]
        kcal = round(random.uniform(kcal_lo, kcal_hi) * (duration_sec / 60), 1)
        now = datetime.now(tz=timezone.utc)
        return WorkoutRecord(
            user_id=user_id,
            workout_type=workout_type,
            duration_sec=duration_sec,
            kcal=kcal,
            start_date=now,
            end_date=now,
            distance_km=0.0,
        )

    def _generate_dietary(self, user_id: str) -> DietaryRecord:
        return DietaryRecord(
            patient_id=user_id,
            calories_kcal=round(random.uniform(1200, 2800), 1),
            protein_g=round(random.uniform(30, 120), 1),
            carbs_g=round(random.uniform(100, 350), 1),
            fat_g=round(random.uniform(30, 100), 1),
            sugar_g=round(random.uniform(20, 80), 1),
            meal_type=random.choice(MEAL_TYPES),
            timestamp=datetime.now(tz=timezone.utc),
        )

    def poll(self, user_id: str) -> list[HealthKitRecord]:
        self._load_user(user_id)

        if user_id in self._failed_users:
            return []

        ranges = self._ranges.get(user_id, {})
        if not ranges:
            return []

        now = datetime.now(tz=timezone.utc)
        records = []
        for hk_type, (lo, hi) in ranges.items():
            value = round(random.uniform(lo, hi), 2)
            if hk_type == "HKQuantityTypeIdentifierOxygenSaturation" and value <= 1.0:
                value = round(value * 100, 2)
            records.append(HealthKitRecord(
                type=hk_type,
                source="StreamingProvider",
                unit=METRIC_UNITS[hk_type],
                value=value,
                start_date=now,
                end_date=now,
            ))

        if random.random() < WORKOUT_PROB:
            self._pending_workouts[user_id].append(self._generate_workout(user_id))

        if random.random() < DIETARY_PROB:
            self._pending_dietary[user_id].append(self._generate_dietary(user_id))

        return records

    def IsConnected(self) -> bool:
        return bool(self.source_dir) and os.path.isdir(self.source_dir)

    def get_pending_workouts(self, user_id: str) -> list[WorkoutRecord]:
        return self._pending_workouts.pop(user_id, [])

    def get_pending_dietary(self, user_id: str) -> list[DietaryRecord]:
        return self._pending_dietary.pop(user_id, [])

    def get_sleep_records(self, user_id: str) -> list[dict]:
        self._load_user(user_id)
        return self._sleep_records.get(user_id, [])
