from fastapi import APIRouter, Request
from pymongo.errors import PyMongoError

router = APIRouter()

@router.get("/{patient_id}")
async def get_notifications(request: Request, patient_id: str, unread_only: bool = False, limit: int = 20):
    try:
        db = request.app.state.db
        query = {"patient_id": patient_id}
        if unread_only:
            query["read"] = False
        
        cursor = db.notifications.find(query).sort("created_at", -1).limit(limit)
        result = []
        async for doc in cursor:
            doc["_id"] = str(doc["_id"])
            if "created_at" in doc:
                doc["created_at"] = doc["created_at"].isoformat()
            result.append(doc)
        return {"notifications": result, "count": len(result)}
    except PyMongoError as e:
        return {"error": str(e)}

@router.post("/{patient_id}/mark-read")
async def mark_all_read(request: Request, patient_id: str):
    try:
        db = request.app.state.db
        result = await db.notifications.update_many(
            {"patient_id": patient_id, "read": False},
            {"$set": {"read": True}},
        )
        return {"marked_read": result.modified_count}
    except PyMongoError as e:
        return {"error": str(e)}