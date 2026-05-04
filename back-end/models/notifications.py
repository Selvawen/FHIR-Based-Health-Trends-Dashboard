from pydantic import BaseModel
from datetime import datetime

class Notification(BaseModel):
    id: int
    user_id: int #FK to Users
    title: str
    priority: str
    details: str
    day: str = None
    created_at: datetime = None
    read: bool = False