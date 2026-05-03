"""
Baby Names Tools for Midwaife Agent

Read tools (preferences / shortlist / rejected) plus write tools that let the
agent edit the parents' name list and preferences directly from chat:
rename, add, change status, remove, update preferences.
"""

from typing import Any, Dict, Optional
from db.pg_database import execute_query
from names.service import names_service
from names.models import NameCandidateCreate, NamePreferencesUpsert


DEFAULT_USER_ID = "00000000-0000-0000-0000-000000000001"
VALID_STATUSES = ("top", "shortlisted", "rejected")
VALID_GENDERS = ("boy", "girl", "either")


def _get_user_id() -> str:
    """Resolve the current user_id from the session, with a sane fallback."""
    try:
        from google.adk.sessions import get_current_session
        session = get_current_session()
        return session.state.get("user_id", DEFAULT_USER_ID)
    except Exception:
        return DEFAULT_USER_ID


def get_name_preferences_tool() -> Dict[str, Any]:
    """
    Get the parents' baby-name preferences.

    Use this tool whenever the parents ask for name suggestions or discuss
    name choices — it grounds your response in what they actually want
    (gender focus, origin/style, constraints, family-name rules, etc.).

    Returns:
        Dictionary with:
        - gender: 'boy' | 'girl' | 'either'
        - notes: free-form notes about origin, style, sound, family rules, etc.
        - has_preferences: false if the parents haven't saved anything yet
    """
    user_id = _get_user_id()

    query = """
        SELECT gender, notes
        FROM name_preferences
        WHERE user_id = %s
    """
    result = execute_query(query, (user_id,), fetch_one=True)

    if not result:
        return {
            "gender": "either",
            "notes": None,
            "has_preferences": False,
        }

    return {
        "gender": result["gender"],
        "notes": result.get("notes"),
        "has_preferences": True,
    }


def get_name_shortlist_tool() -> Dict[str, Any]:
    """
    Get the parents' current shortlist: their top tier (favourites) and
    the rest of the contenders.

    Use this tool to:
    - Avoid suggesting names already on the list
    - Reference favourites in conversation ("I see Sofia is your #1...")
    - Offer alternatives in the same style as their picks

    "top" is the curated finalist tier (target of three, soft cap — may have
    fewer or more). "shortlisted" is the broader pool of contenders.
    Both are sorted by rank ascending (1 = top favourite).

    Returns:
        Dictionary with:
        - top: list of {name, rank, origin, meaning, notes}
        - shortlisted: list of {name, rank, origin, meaning, notes}
        - counts: {top, shortlisted}
    """
    user_id = _get_user_id()

    query = """
        SELECT name, origin, meaning, notes, status, rank
        FROM name_candidates
        WHERE user_id = %s AND status IN ('top', 'shortlisted')
        ORDER BY status, rank NULLS LAST, name
    """
    rows = execute_query(query, (user_id,), fetch_all=True)

    top = []
    shortlisted = []

    for r in rows:
        entry = {
            "name": r["name"],
            "rank": r.get("rank"),
            "origin": r.get("origin"),
            "meaning": r.get("meaning"),
            "notes": r.get("notes"),
        }
        if r["status"] == "top":
            top.append(entry)
        else:
            shortlisted.append(entry)

    return {
        "top": top,
        "shortlisted": shortlisted,
        "counts": {
            "top": len(top),
            "shortlisted": len(shortlisted),
        },
    }


def get_rejected_names_tool() -> Dict[str, Any]:
    """
    Get the names the parents have explicitly rejected (down-voted).

    Use this tool BEFORE suggesting any new names — never re-suggest a
    name that's on this list, regardless of how good a fit it seems.
    The exclusion is permanent until the parents add the name back themselves.

    Returns:
        Dictionary with:
        - rejected_names: list of name strings (lowercased not guaranteed,
          compare case-insensitively when filtering)
        - count: how many names are excluded
    """
    user_id = _get_user_id()

    query = """
        SELECT name
        FROM name_candidates
        WHERE user_id = %s AND status = 'rejected'
        ORDER BY name
    """
    rows = execute_query(query, (user_id,), fetch_all=True)

    rejected = [r["name"] for r in rows]

    return {
        "rejected_names": rejected,
        "count": len(rejected),
    }


def update_name_preferences_tool(
    gender: Optional[str] = None,
    notes: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Update the parents' baby-name preferences. Only the provided fields are
    changed; missing fields keep their current values.

    Use this tool when the parents tell you to change their preferences,
    e.g. "We want boy names now" or "Update my notes to short Portuguese
    names". If they want to add to existing notes rather than replace them,
    first call get_name_preferences_tool, merge in the new content, and
    pass the combined string here.

    Args:
        gender: New gender focus — 'boy' | 'girl' | 'either'. Omit to keep
                the current value.
        notes: New free-form notes (origin, style, constraints).
               Omit to keep current value. Pass an empty string to clear.

    Returns:
        Dictionary with the updated preferences.
    """
    user_id = _get_user_id()

    if gender is not None and gender not in VALID_GENDERS:
        return {
            "success": False,
            "error": f"Invalid gender '{gender}'. Must be one of: "
            + ", ".join(VALID_GENDERS),
        }

    current = names_service.get_preferences(user_id)
    new_gender = gender if gender is not None else current.gender
    new_notes = notes if notes is not None else current.notes

    updated = names_service.upsert_preferences(
        user_id,
        NamePreferencesUpsert(gender=new_gender, notes=new_notes),
    )

    return {
        "success": True,
        "gender": updated.gender,
        "notes": updated.notes,
    }


def add_name_tool(
    name: str,
    status: str = "shortlisted",
    origin: Optional[str] = None,
    meaning: Optional[str] = None,
    notes: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Add a name to the parents' list, or change its status if it already
    exists. The name is added with source='parent' (recorded as something
    the parents asked for, not an AI suggestion).

    Use this tool when the parents mention a name they want to consider,
    e.g. "Add Mateus to my list" or "I'd like to consider Sofia".

    Args:
        name: The name to add.
        status: 'top' | 'shortlisted' (default) | 'rejected'.
        origin: Optional cultural origin (e.g., 'Portuguese').
        meaning: Optional meaning (e.g., 'Wisdom').
        notes: Optional free-form notes about why they like it.

    Returns:
        Dictionary with the resulting candidate (name, status, rank).
    """
    user_id = _get_user_id()

    if status not in VALID_STATUSES:
        return {
            "success": False,
            "error": f"Invalid status '{status}'. Must be one of: "
            + ", ".join(VALID_STATUSES),
        }

    if not name or not name.strip():
        return {"success": False, "error": "Name cannot be empty."}

    candidate = names_service.add_candidate(
        user_id,
        NameCandidateCreate(
            name=name.strip(),
            status=status,
            source="parent",
            origin=origin,
            meaning=meaning,
            notes=notes,
        ),
    )

    return {
        "success": True,
        "name": candidate.name,
        "status": candidate.status,
        "rank": candidate.rank,
    }


def update_name_tool(
    current_name: str,
    new_name: Optional[str] = None,
    origin: Optional[str] = None,
    meaning: Optional[str] = None,
    notes: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Rename a name or update its metadata (origin, meaning, notes).
    Status and rank are unchanged. Only the provided fields are written.

    Use this tool when the parents ask to fix a typo, change a spelling
    (e.g. "Tiago to Thiago"), or attach a meaning/origin you discovered.

    Args:
        current_name: The current name on their list (case-insensitive).
        new_name: The replacement name. Omit to keep the current name.
        origin: New cultural origin. Omit to keep current.
        meaning: New meaning. Omit to keep current.
        notes: New notes. Omit to keep current.

    Returns:
        Dictionary with the updated candidate, or an error if the name
        isn't on the list, or if the new spelling collides with another
        existing name.
    """
    user_id = _get_user_id()

    existing = names_service.find_by_name(user_id, current_name)
    if not existing:
        return {
            "success": False,
            "error": f"'{current_name}' is not on the parents' list.",
        }

    if new_name and new_name.lower() != existing.name.lower():
        conflict = names_service.find_by_name(user_id, new_name)
        if conflict and conflict.id != existing.id:
            return {
                "success": False,
                "error": f"'{new_name}' is already on the list. "
                f"Cannot rename '{current_name}' to it.",
            }

    updated = names_service.update_candidate_fields(
        user_id,
        existing.id,
        name=new_name,
        origin=origin,
        meaning=meaning,
        notes=notes,
    )
    if not updated:
        return {"success": False, "error": f"Failed to update '{current_name}'."}

    return {
        "success": True,
        "name": updated.name,
        "previous_name": existing.name if new_name else None,
        "origin": updated.origin,
        "meaning": updated.meaning,
        "notes": updated.notes,
        "status": updated.status,
        "rank": updated.rank,
    }


def set_name_status_tool(name: str, status: str) -> Dict[str, Any]:
    """
    Change a name's status — promote to top three, return to the broader
    shortlist, or reject it.

    Use this tool when the parents want to:
    - Promote a name to favourites: status='top'
    - Move a name from top back to the shortlist: status='shortlisted'
    - Permanently say no to a name: status='rejected'
      (prefer this over remove_name_tool — it keeps the rejection on
      record so the AI never re-suggests it)

    Ranks within the source group are re-packed automatically.

    Args:
        name: The name to update (case-insensitive lookup).
        status: 'top' | 'shortlisted' | 'rejected'.

    Returns:
        Dictionary with the updated candidate or an error.
    """
    user_id = _get_user_id()

    if status not in VALID_STATUSES:
        return {
            "success": False,
            "error": f"Invalid status '{status}'. Must be one of: "
            + ", ".join(VALID_STATUSES),
        }

    existing = names_service.find_by_name(user_id, name)
    if not existing:
        return {
            "success": False,
            "error": f"'{name}' is not on the parents' list.",
        }

    updated = names_service.update_status(user_id, existing.id, status)
    if not updated:
        return {"success": False, "error": f"Failed to change status for '{name}'."}

    return {
        "success": True,
        "name": updated.name,
        "previous_status": existing.status,
        "status": updated.status,
        "rank": updated.rank,
    }


def remove_name_tool(name: str) -> Dict[str, Any]:
    """
    Permanently delete a name from the parents' list. This loses the
    record — if the parents just want to "say no" to a name (don't
    suggest again), call set_name_status_tool with status='rejected'
    instead.

    Use this tool only when the parents explicitly want to remove a
    name entirely, e.g. "Forget Tiago — take it off completely".

    Args:
        name: The name to delete (case-insensitive lookup).

    Returns:
        Dictionary indicating whether the name was found and removed.
    """
    user_id = _get_user_id()

    existing = names_service.find_by_name(user_id, name)
    if not existing:
        return {
            "success": False,
            "error": f"'{name}' is not on the parents' list.",
        }

    deleted = names_service.delete_candidate(user_id, existing.id)
    return {
        "success": deleted,
        "name": existing.name,
        "removed": deleted,
    }


def create_names_tools():
    """Create baby-names tool definitions for the agent."""
    from google.adk.tools.function_tool import FunctionTool

    return [
        # Read
        FunctionTool(func=get_name_preferences_tool),
        FunctionTool(func=get_name_shortlist_tool),
        FunctionTool(func=get_rejected_names_tool),
        # Write
        FunctionTool(func=update_name_preferences_tool),
        FunctionTool(func=add_name_tool),
        FunctionTool(func=update_name_tool),
        FunctionTool(func=set_name_status_tool),
        FunctionTool(func=remove_name_tool),
    ]
