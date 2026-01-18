from fastapi import APIRouter, HTTPException
from users.service import user_service
from users.models import User

router = APIRouter(prefix="/api/users", tags=["users"])

@router.get("/{user_id}", response_model=User)
async def get_user(user_id: str):
    """Get user by ID"""
    try:
        user = user_service.get_user_by_id(user_id)
        if not user:
            raise HTTPException(status_code=404, detail=f"User not found: {user_id}")
        return user
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching user: {str(e)}")
