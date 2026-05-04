from fastapi import APIRouter
from models.users import User

router = APIRouter()

@router.get("/", response_model=list[User])
def get_users():
    return {"error": "Method not implemented"}

@router.get("/{user_id}", response_model=User)
def get_user(user_id: int):
    return {"error": "Method not implemented"}

@router.post("/", response_model=User)
def create_user(user: User):
    return {"error": "Method not implemented"}