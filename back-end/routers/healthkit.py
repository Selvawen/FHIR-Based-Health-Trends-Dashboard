from fastapi import APIRouter, Request, HTTPException
from models.healthkit import HealthKitRecord
from typing import List
import os

router = APIRouter()
# MOCK HEALTHKIT API

MOCK_DATASOURCE = "../../synthetic-apple-health-data"

@router.get("/{user_id}", response_model=List[HealthKitRecord])
def GetUserSmartwatchData(user_id: str):
    records = []
    fp = f"{MOCK_DATASOURCE}/{user_id}.xml"

    if not os.path.exists(fp):
        return records # Return empty if no watch source exists

    with open(fp, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line.startswith("<Record"):
                continue
            try:
                r = HealthKitRecord.from_xml(line)
                records.append(r)
            except:
                continue
    return records

@router.get("/{user_id}/config")
async def GetUserConfig(request: Request, user_id: str):
    db = request.app.state.db
    collection = db["users"]
    item = await collection.find_one({"user_id": user_id})

    if item is not None:
        if "_id" in item:
            item["_id"] = str(item["_id"])
        return item
    
    raise HTTPException(status_code=404, detail="User config not found") 


@router.post("/{user_id}/config")
async def SetUserConfig(request: Request, user_id: str):
    db = request.app.state.db
    collection = db["users"]
    body = await request.json()
    result = await collection.update_one({"user_id": user_id}, {"$set": body}, upsert=True)

    connection_poll = body.get("connection_poll", False)
    connection_type = body.get("connection_type", "")
    already_active = user_id in getattr(request.app.state, "active_scheduler_users", set())

    if connection_poll and connection_type and not already_active:
        try:
            from main import start_user_scheduler
            start_user_scheduler(user_id, connection_type)
        except Exception as e:
            print(f"[Scheduler] Failed to hot-start scheduler for user {user_id}: {e}")

    return {
        "user_id": user_id,
        "upserted": result.upserted_id is not None
    }


@router.get("/{user_id}/aggregations")
async def GetUserAggregations(request: Request, user_id: str):
    try:
        db = request.app.state.db
        doc = await db.healthkit_aggregations.find_one({"user_id": user_id})
        if doc is None:
            raise HTTPException(status_code=404, detail="Aggregation not found")
        doc["_id"] = str(doc["_id"])
        return doc
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail="Internal server error")