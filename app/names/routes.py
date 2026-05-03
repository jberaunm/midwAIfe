from fastapi import APIRouter, HTTPException, Query
from typing import List, Optional
from names.service import names_service
from names.ai_service import names_ai_service
from names.models import (
    NamePreferences,
    NamePreferencesUpsert,
    NameCandidate,
    NameCandidateCreate,
    NameStatusUpdate,
    NameReorder,
    NameSuggestionResponse,
)

router = APIRouter(prefix="/api/names", tags=["names"])


@router.get("/preferences/{user_id}", response_model=NamePreferences)
async def get_preferences(user_id: str):
    """Get baby-name preferences for a user (returns defaults if none saved)."""
    try:
        return names_service.get_preferences(user_id)
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Error fetching preferences: {str(e)}"
        )


@router.put("/preferences/{user_id}", response_model=NamePreferences)
async def upsert_preferences(user_id: str, data: NamePreferencesUpsert):
    """Create or update baby-name preferences."""
    try:
        return names_service.upsert_preferences(user_id, data)
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Error upserting preferences: {str(e)}"
        )


@router.get("/candidates/{user_id}", response_model=List[NameCandidate])
async def list_candidates(
    user_id: str,
    status: Optional[str] = Query(
        None, description="Filter by status: top | shortlisted | rejected"
    ),
):
    """List name candidates for a user, optionally filtered by status."""
    try:
        return names_service.list_candidates(user_id, status=status)
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Error fetching candidates: {str(e)}"
        )


@router.post("/candidates/{user_id}", response_model=NameCandidate)
async def add_candidate(user_id: str, data: NameCandidateCreate):
    """Add a name candidate. If the same name already exists, flips its status."""
    try:
        return names_service.add_candidate(user_id, data)
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Error adding candidate: {str(e)}"
        )


@router.patch(
    "/candidates/{user_id}/{candidate_id}/status", response_model=NameCandidate
)
async def update_candidate_status(
    user_id: str, candidate_id: str, data: NameStatusUpdate
):
    """Promote / demote / reject a candidate. Re-packs ranks in the source group."""
    try:
        result = names_service.update_status(user_id, candidate_id, data.status)
        if not result:
            raise HTTPException(status_code=404, detail="Candidate not found")
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Error updating status: {str(e)}"
        )


@router.post("/candidates/{user_id}/reorder", response_model=List[NameCandidate])
async def reorder_candidates(user_id: str, data: NameReorder):
    """Reorder candidates within a status group (top or shortlisted)."""
    try:
        return names_service.reorder(user_id, data.status, data.ordered_ids)
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Error reordering: {str(e)}"
        )


@router.post("/suggest/{user_id}", response_model=NameSuggestionResponse)
async def suggest_names(user_id: str):
    """Generate 1-3 AI suggestions and persist a chat message describing them."""
    try:
        return names_ai_service.suggest(user_id)
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Error generating suggestions: {str(e)}"
        )


@router.delete("/candidates/{user_id}/{candidate_id}")
async def delete_candidate(user_id: str, candidate_id: str):
    """Hard-delete a candidate. Re-packs ranks in the source group."""
    try:
        deleted = names_service.delete_candidate(user_id, candidate_id)
        if not deleted:
            raise HTTPException(status_code=404, detail="Candidate not found")
        return {"message": "Candidate deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Error deleting candidate: {str(e)}"
        )
