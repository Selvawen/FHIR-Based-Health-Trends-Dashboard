from fastapi import APIRouter, HTTPException, Query, Request

router = APIRouter()


@router.post("/{patient_id}")
async def CreateOrUpdateEntry(request: Request, patient_id: str) -> dict:
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=422, detail="Invalid JSON body")

    if "date" not in body:
        raise HTTPException(status_code=422, detail="Field 'date' is required")

    try:
        await request.app.state.lifestyle_service.upsert_manual(patient_id, body)
    except Exception:
        raise HTTPException(status_code=500, detail="Internal server error")

    return {"ok": True}


@router.get("/{patient_id}")
async def GetEntries(request: Request, patient_id: str, days: int = Query(default=30)) -> list:
    days = min(days, 90)
    try:
        return await request.app.state.lifestyle_service.get_entries(patient_id, days)
    except Exception:
        raise HTTPException(status_code=500, detail="Internal server error")


@router.delete("/{patient_id}/{date}")
async def DeleteEntry(request: Request, patient_id: str, date: str) -> dict:
    try:
        result = await request.app.state.lifestyle_service.delete_manual(patient_id, date)
    except Exception:
        raise HTTPException(status_code=500, detail="Internal server error")

    if result == "forbidden":
        raise HTTPException(status_code=403, detail="Cannot delete HealthKit-sourced entries")
    if result == "not_found":
        raise HTTPException(status_code=404, detail="Entry not found")

    return {"ok": True}
