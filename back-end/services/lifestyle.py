import logging
from datetime import date, datetime, timedelta

from motor.motor_asyncio import AsyncIOMotorDatabase

from external.streaming_provider import DietaryRecord, WorkoutRecord

logger = logging.getLogger(__name__)


class LifestyleService:

    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db

    async def ensure_index(self) -> None:
        await self.db.lifestyle_logs.create_index(
            [("patient_id", 1), ("date", -1)],
            sparse=True,
        )

    async def upsert_manual(self, patient_id: str, entry: dict) -> None:
        now = datetime.utcnow()
        try:
            await self.db.lifestyle_logs.update_one(
                {"patient_id": patient_id, "date": entry["date"], "source": "manual"},
                {
                    "$set": {**entry, "patient_id": patient_id, "source": "manual", "updated_at": now},
                    "$setOnInsert": {"created_at": now},
                },
                upsert=True,
            )
        except Exception as e:
            logger.error("Failed to upsert manual entry for patient %s: %s", patient_id, e)
            raise

    async def get_entries(self, patient_id: str, days: int) -> list[dict]:
        cutoff = str(date.today() - timedelta(days=days))
        try:
            cursor = self.db.lifestyle_logs.find(
                {"patient_id": patient_id, "date": {"$gte": cutoff}},
                sort=[("date", -1)],
            )
            docs = await cursor.to_list(length=None)
        except Exception as e:
            logger.error("Failed to fetch entries for patient %s: %s", patient_id, e)
            raise

        by_date: dict[str, dict] = {}
        for doc in docs:
            doc.pop("_id", None)
            d = doc["date"]
            if d not in by_date or doc.get("source") == "manual":
                by_date[d] = doc

        return sorted(by_date.values(), key=lambda x: x["date"], reverse=True)

    async def delete_manual(self, patient_id: str, date_str: str) -> str:
        try:
            doc = await self.db.lifestyle_logs.find_one({"patient_id": patient_id, "date": date_str})
        except Exception as e:
            logger.error("Failed to find entry for patient %s date %s: %s", patient_id, date_str, e)
            raise

        if doc is None:
            return "not_found"
        if doc.get("source") != "manual":
            return "forbidden"

        try:
            await self.db.lifestyle_logs.delete_one({"patient_id": patient_id, "date": date_str, "source": "manual"})
        except Exception as e:
            logger.error("Failed to delete entry for patient %s date %s: %s", patient_id, date_str, e)
            raise

        return "ok"

    async def write_healthkit_entries(
        self,
        patient_id: str,
        workouts: list[WorkoutRecord],
        dietary: list[DietaryRecord],
    ) -> None:
        now = datetime.utcnow()
        cutoff_30d = str(date.today() - timedelta(days=30))

        try:
            for w in workouts:
                entry_date = w.start_date.strftime("%Y-%m-%d")
                doc = {
                    "patient_id": patient_id,
                    "date": entry_date,
                    "source": "healthkit",
                    "calories_kcal": round(w.kcal, 1),
                    "protein_g": 0.0,
                    "carbs_g": 0.0,
                    "fat_g": 0.0,
                    "sugar_g": 0.0,
                    "exercise_min": round(w.duration_sec / 60, 1),
                    "activity_level": "moderate",
                    "notes": "",
                    "workout_sessions": [
                        {"type": w.workout_type, "duration_sec": w.duration_sec, "kcal": w.kcal}
                    ],
                    "updated_at": now,
                }
                await self.db.lifestyle_logs.update_one(
                    {"patient_id": patient_id, "date": entry_date, "source": "healthkit"},
                    {"$set": doc, "$setOnInsert": {"created_at": now}},
                    upsert=True,
                )

            for d in dietary:
                entry_date = d.timestamp.strftime("%Y-%m-%d")
                doc = {
                    "patient_id": patient_id,
                    "date": entry_date,
                    "source": "healthkit",
                    "calories_kcal": d.calories_kcal,
                    "protein_g": d.protein_g,
                    "carbs_g": d.carbs_g,
                    "fat_g": d.fat_g,
                    "sugar_g": d.sugar_g,
                    "exercise_min": 0.0,
                    "activity_level": "none",
                    "notes": "",
                    "workout_sessions": [],
                    "updated_at": now,
                }
                await self.db.lifestyle_logs.update_one(
                    {"patient_id": patient_id, "date": entry_date, "source": "healthkit"},
                    {"$set": doc, "$setOnInsert": {"created_at": now}},
                    upsert=True,
                )

            await self.db.lifestyle_logs.delete_many(
                {"patient_id": patient_id, "date": {"$lt": cutoff_30d}}
            )

        except Exception as e:
            logger.error("Failed to write healthkit entries for patient %s: %s", patient_id, e)
            raise
