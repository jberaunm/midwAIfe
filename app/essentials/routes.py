from fastapi import APIRouter, HTTPException, Query
from typing import List, Optional
from essentials.service import essentials_service
from essentials.ai_service import essentials_ai_service
from essentials.models import (
    EssentialPreferences,
    EssentialPreferencesUpsert,
    EssentialItem,
    EssentialItemCreate,
    EssentialItemUpdate,
    EssentialSuggestionResponse,
)

router = APIRouter(prefix="/api/essentials", tags=["essentials"])


@router.get("/preferences/{user_id}", response_model=EssentialPreferences)
async def get_preferences(user_id: str):
    """Get baby-essentials preferences (returns defaults if none saved)."""
    try:
        return essentials_service.get_preferences(user_id)
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Error fetching preferences: {str(e)}"
        )


@router.put("/preferences/{user_id}", response_model=EssentialPreferences)
async def upsert_preferences(user_id: str, data: EssentialPreferencesUpsert):
    """Create or update baby-essentials preferences."""
    try:
        return essentials_service.upsert_preferences(user_id, data)
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Error upserting preferences: {str(e)}"
        )


@router.get("/items/{user_id}", response_model=List[EssentialItem])
async def list_items(
    user_id: str,
    status: Optional[str] = Query(
        None, description="Filter by status: needed | bought | skipped"
    ),
):
    """List essentials for a user, optionally filtered by status."""
    try:
        return essentials_service.list_items(user_id, status=status)
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Error fetching items: {str(e)}"
        )


@router.post("/items/{user_id}", response_model=EssentialItem)
async def add_item(user_id: str, data: EssentialItemCreate):
    """Add an essential. If the same name exists, updates it instead."""
    try:
        return essentials_service.add_item(user_id, data)
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Error adding item: {str(e)}"
        )


@router.patch("/items/{user_id}/{item_id}", response_model=EssentialItem)
async def update_item(user_id: str, item_id: str, data: EssentialItemUpdate):
    """Partial update — name, category, status, is_must_have, cost, url, notes.
    Pass clear_* flags to explicitly null nullable fields."""
    try:
        result = essentials_service.update_item(user_id, item_id, data)
        if not result:
            raise HTTPException(status_code=404, detail="Item not found")
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Error updating item: {str(e)}"
        )


@router.delete("/items/{user_id}/{item_id}")
async def delete_item(user_id: str, item_id: str):
    """Hard-delete an essential."""
    try:
        deleted = essentials_service.delete_item(user_id, item_id)
        if not deleted:
            raise HTTPException(status_code=404, detail="Item not found")
        return {"message": "Item deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Error deleting item: {str(e)}"
        )


@router.get("/latest-suggestions/{user_id}")
async def get_latest_suggestions(user_id: str):
    """Get the latest suggestions saved by the agent (UI display only)."""
    try:
        from midwaife.tools.essentials_tools import _suggestions_cache

        if user_id in _suggestions_cache:
            return {
                "success": True,
                "suggestions": _suggestions_cache[user_id]["suggestions"],
                "timestamp": _suggestions_cache[user_id]["timestamp"],
            }
        else:
            return {
                "success": False,
                "suggestions": [],
                "message": "No recent suggestions available",
            }
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Error retrieving suggestions: {str(e)}"
        )


@router.post("/suggest/{user_id}", response_model=EssentialSuggestionResponse)
async def suggest_essentials(user_id: str):
    """Generate 2-4 AI suggestions and persist a chat message describing them."""
    try:
        return essentials_ai_service.suggest(user_id)
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Error generating suggestions: {str(e)}"
        )
