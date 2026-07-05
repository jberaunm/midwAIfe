"""
Baby Essentials Tools for Midwaife Agent

Read tools for preferences and items, plus write tools that let the agent
edit the parents' essentials list directly from chat: add items, change
status, update preferences.
"""

from typing import Any, Dict, Optional, List
import json
from datetime import datetime
from db.pg_database import execute_query
from essentials.service import essentials_service
from essentials.models import EssentialItemCreate, EssentialPreferencesUpsert

# In-memory cache for recent suggestions (keyed by user_id)
_suggestions_cache: Dict[str, Dict[str, Any]] = {}


DEFAULT_USER_ID = "00000000-0000-0000-0000-000000000001"
VALID_STATUSES = ("needed", "bought", "skipped")
VALID_CATEGORIES = (
    "Sleep", "Feeding", "Clothing", "Bath",
    "Gear", "Health", "Travel", "Nursery",
)
VALID_SECONDHAND = ("yes", "no", "no_preference")


def _get_user_id() -> str:
    """Resolve the current user_id from the session, with a sane fallback."""
    try:
        from google.adk.sessions import get_current_session
        session = get_current_session()
        return session.state.get("user_id", DEFAULT_USER_ID)
    except Exception:
        return DEFAULT_USER_ID


def get_essentials_preferences_tool() -> Dict[str, Any]:
    """
    Get the parents' baby-essentials preferences (secondhand acceptance and notes).

    Use this tool when the parents discuss their budget constraints, space
    limitations, or other preferences that should influence suggestions.

    Returns:
        Dictionary with:
        - accept_secondhand: 'yes' | 'no' | 'no_preference'
        - notes: free-form notes about constraints (e.g., 'small flat, no nursery')
        - has_preferences: false if parents haven't saved anything yet
    """
    user_id = _get_user_id()
    prefs = essentials_service.get_preferences(user_id)

    return {
        "accept_secondhand": prefs.accept_secondhand,
        "notes": prefs.notes,
        "has_preferences": prefs.accept_secondhand != "no_preference" or bool(prefs.notes),
    }


def get_essentials_items_tool(status: Optional[str] = None) -> Dict[str, Any]:
    """
    Get the parents' essentials list, optionally filtered by status.

    Use this tool to:
    - Avoid suggesting items they already have
    - See what they've marked as bought vs. still needed
    - Reference their priorities in conversation
    - Check must-have vs. shortlist items

    Args:
        status: Filter by 'needed' | 'bought' | 'skipped' (optional, omit to see all)

    Returns:
        Dictionary with:
        - items: list of {name, category, status, is_must_have, estimated_cost, purchase_url, notes}
        - must_have_count: number of must-have items
        - shortlist_count: number of shortlist items
        - total_estimated_cost: sum of all estimated costs
    """
    user_id = _get_user_id()
    items = essentials_service.list_items(user_id, status=status)

    must_have = [i for i in items if i.is_must_have]
    shortlist = [i for i in items if not i.is_must_have]
    total_cost = sum(i.estimated_cost or 0 for i in items)

    return {
        "items": [
            {
                "name": i.name,
                "category": i.category,
                "status": i.status,
                "is_must_have": i.is_must_have,
                "estimated_cost": float(i.estimated_cost) if i.estimated_cost else None,
                "purchase_url": i.purchase_url,
                "notes": i.notes,
            }
            for i in items
        ],
        "must_have_count": len(must_have),
        "shortlist_count": len(shortlist),
        "total_estimated_cost": float(total_cost),
    }


def update_essentials_preferences_tool(
    accept_secondhand: Optional[str] = None,
    notes: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Update the parents' essentials preferences. Only the provided fields are
    changed; missing fields keep their current values.

    Use this tool when the parents tell you to change their preferences,
    e.g. "We're happy with secondhand" or "Update my notes to mention we
    have a small flat". If they want to add to existing notes, first call
    get_essentials_preferences_tool, merge in the new content, and pass
    the combined string here.

    Args:
        accept_secondhand: 'yes' | 'no' | 'no_preference' (optional)
        notes: New free-form notes about constraints. Omit to keep current
               value. Pass an empty string to clear.

    Returns:
        Dictionary with the updated preferences.
    """
    user_id = _get_user_id()

    if accept_secondhand is not None and accept_secondhand not in VALID_SECONDHAND:
        return {
            "success": False,
            "error": f"Invalid secondhand value '{accept_secondhand}'. Must be one of: "
            + ", ".join(VALID_SECONDHAND),
        }

    current = essentials_service.get_preferences(user_id)
    new_secondhand = (
        accept_secondhand if accept_secondhand is not None else current.accept_secondhand
    )
    new_notes = notes if notes is not None else current.notes

    updated = essentials_service.upsert_preferences(
        user_id,
        EssentialPreferencesUpsert(
            accept_secondhand=new_secondhand,
            notes=new_notes if new_notes else None,
        ),
    )

    return {
        "success": True,
        "accept_secondhand": updated.accept_secondhand,
        "notes": updated.notes,
    }


def add_essentials_item_tool(
    name: str,
    category: str,
    status: str = "needed",
    is_must_have: bool = True,
    estimated_cost: Optional[float] = None,
    purchase_url: Optional[str] = None,
    notes: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Add an essential item to the parents' list, or update it if it already
    exists (by case-insensitive name match). Items added by the parent have
    source='parent' and default to must-have status.

    Use this tool when the parents mention an item they want to add,
    e.g. "Add a car seat to my list" or "We need a travel cot".

    Args:
        name: The item name (required).
        category: One of Sleep, Feeding, Clothing, Bath, Gear, Health, Travel, Nursery
        status: 'needed' (default) | 'bought' | 'skipped'
        is_must_have: true (default) | false (shortlist)
        estimated_cost: Optional cost in GBP
        purchase_url: Optional link where to buy
        notes: Optional notes about why they need it or special requirements

    Returns:
        Dictionary with the resulting item (name, category, status, cost, etc.)
    """
    user_id = _get_user_id()

    if category not in VALID_CATEGORIES:
        return {
            "success": False,
            "error": f"Invalid category '{category}'. Must be one of: "
            + ", ".join(VALID_CATEGORIES),
        }

    if status not in VALID_STATUSES:
        return {
            "success": False,
            "error": f"Invalid status '{status}'. Must be one of: "
            + ", ".join(VALID_STATUSES),
        }

    if not name or not name.strip():
        return {"success": False, "error": "Item name cannot be empty."}

    item = essentials_service.add_item(
        user_id,
        EssentialItemCreate(
            name=name.strip(),
            category=category,
            status=status,
            is_must_have=is_must_have,
            estimated_cost=estimated_cost,
            purchase_url=purchase_url,
            notes=notes,
            source="parent",
        ),
    )

    return {
        "success": True,
        "name": item.name,
        "category": item.category,
        "status": item.status,
        "is_must_have": item.is_must_have,
        "estimated_cost": float(item.estimated_cost) if item.estimated_cost else None,
    }


def update_essentials_item_status_tool(
    item_name: str,
    new_status: str,
) -> Dict[str, Any]:
    """
    Change an item's status (needed → bought → skipped, etc.).

    Use this tool when the parents tell you they've bought something or
    changed their mind about an item.

    Args:
        item_name: The name of the item to update (case-insensitive lookup)
        new_status: 'needed' | 'bought' | 'skipped'

    Returns:
        Dictionary with the updated item, or error if not found.
    """
    user_id = _get_user_id()

    if new_status not in VALID_STATUSES:
        return {
            "success": False,
            "error": f"Invalid status '{new_status}'. Must be one of: "
            + ", ".join(VALID_STATUSES),
        }

    item = essentials_service.find_by_name(user_id, item_name)
    if not item:
        return {
            "success": False,
            "error": f"Item '{item_name}' not found in your essentials list.",
        }

    updated = essentials_service.update_item(
        user_id,
        item.id,
        {"status": new_status},
    )

    return {
        "success": True,
        "name": updated.name,
        "status": updated.status,
    }


def save_essentials_suggestions_tool(suggestions: List[Dict[str, str]]) -> Dict[str, Any]:
    """
    Save the suggested items so the UI can display them.

    The agent calls this after generating suggestions to provide
    structured data for the UI to display (name and category only).
    The UI fetches these suggestions separately from the chat message.

    Args:
        suggestions: List of dicts with 'name' and 'category' keys
                    e.g., [{"name": "Car seat", "category": "Travel"}, ...]

    Returns:
        Confirmation with the saved suggestions.
    """
    user_id = _get_user_id()

    if not suggestions or not isinstance(suggestions, list):
        return {
            "success": False,
            "error": "suggestions must be a non-empty list of dicts with 'name' and 'category'",
        }

    # Validate each suggestion has name and category
    validated = []
    for s in suggestions:
        if isinstance(s, dict) and "name" in s and "category" in s:
            validated.append({
                "name": str(s["name"]).strip(),
                "category": str(s["category"]).strip(),
            })

    if not validated:
        return {
            "success": False,
            "error": "No valid suggestions (each must have 'name' and 'category')",
        }

    # Store in cache with timestamp so frontend can retrieve
    _suggestions_cache[user_id] = {
        "suggestions": validated,
        "timestamp": datetime.now().isoformat(),
    }

    return {
        "success": True,
        "saved_suggestions": validated,
        "count": len(validated),
    }


def suggest_essentials_tool() -> Dict[str, Any]:
    """
    Get context for the agent to generate personalized essentials suggestions.

    The agent will use this information to suggest 2-4 items that:
    - Match their secondhand preferences and budget
    - Fill gaps in what they already have
    - Are appropriate for their current pregnancy week
    - Respect any special constraints in their notes

    The agent should generate suggestions with realistic prices, category info,
    and practical descriptions (why each item helps). Use this context to
    provide warm, detailed guidance.

    Returns:
        Dictionary with all context the agent needs:
        - preferences: secondhand acceptance, budget notes
        - existing_items: summary of what they already have
        - pregnancy_week: current week for relevance
        - valid_categories: available item categories
    """
    user_id = _get_user_id()

    try:
        prefs = get_essentials_preferences_tool()
        items = get_essentials_items_tool()

        # Get pregnancy week if available
        pregnancy_week = None
        try:
            from users.service import user_service
            user = user_service.get_user_by_id(user_id)
            if user and user.due_date:
                due = datetime.fromisoformat(str(user.due_date).replace("Z", "+00:00"))
                today = datetime.now(due.tzinfo) if due.tzinfo else datetime.now()
                days_diff = (due - today).days
                weeks = max(1, min(42, 40 - (days_diff // 7)))
                pregnancy_week = weeks
        except Exception:
            pass

        return {
            "success": True,
            "preferences": prefs,
            "existing_items_summary": f"{items.get('must_have_count', 0)} must-haves, {items.get('shortlist_count', 0)} shortlist items",
            "existing_items_list": [item["name"] for item in items.get("items", [])],
            "pregnancy_week": pregnancy_week,
            "valid_categories": list(VALID_CATEGORIES),
        }
    except Exception as e:
        return {
            "success": False,
            "error": f"Failed to fetch essentials context: {str(e)}",
        }


def create_essentials_tools():
    """Create baby-essentials tool definitions for the agent."""
    from google.adk.tools.function_tool import FunctionTool

    return [
        # Read
        FunctionTool(func=get_essentials_preferences_tool),
        FunctionTool(func=get_essentials_items_tool),
        # Write
        FunctionTool(func=update_essentials_preferences_tool),
        FunctionTool(func=add_essentials_item_tool),
        FunctionTool(func=update_essentials_item_status_tool),
        # AI Suggestions
        FunctionTool(func=suggest_essentials_tool),
        FunctionTool(func=save_essentials_suggestions_tool),
    ]
