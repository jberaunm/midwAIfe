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
from essentials.models import EssentialItemCreate, EssentialItemUpdate, EssentialPreferencesUpsert

# In-memory cache for recent suggestions (keyed by user_id)
_suggestions_cache: Dict[str, Dict[str, Any]] = {}


DEFAULT_USER_ID = "00000000-0000-0000-0000-000000000001"
VALID_STATUSES = ("needed", "bought", "skipped")
VALID_CATEGORIES = (
    "Sleep", "Feeding", "Clothing", "Bath",
    "Gear", "Health", "Travel", "Nursery",
)
VALID_SECONDHAND = ("yes", "no", "no_preference")
VALID_HOSPITAL_BAG_SECTIONS = ("labour_ward", "postnatal_ward", "partner_bag")


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
        - items: list of {name, category, status, is_must_have, is_hospital_bag, estimated_cost, purchase_url, notes}
        - must_have_count: number of must-have items
        - shortlist_count: number of shortlist items
        - hospital_bag_count: number of items flagged for the hospital bag
        - total_estimated_cost: sum of all estimated costs
    """
    user_id = _get_user_id()
    items = essentials_service.list_items(user_id, status=status)

    must_have = [i for i in items if i.is_must_have]
    shortlist = [i for i in items if not i.is_must_have]
    hospital_bag = [i for i in items if i.is_hospital_bag]
    total_cost = sum(i.estimated_cost or 0 for i in items)

    return {
        "items": [
            {
                "name": i.name,
                "category": i.category,
                "status": i.status,
                "is_must_have": i.is_must_have,
                "is_hospital_bag": i.is_hospital_bag,
                "hospital_bag_section": i.hospital_bag_section,
                "estimated_cost": float(i.estimated_cost) if i.estimated_cost else None,
                "purchase_url": i.purchase_url,
                "notes": i.notes,
            }
            for i in items
        ],
        "must_have_count": len(must_have),
        "shortlist_count": len(shortlist),
        "hospital_bag_count": len(hospital_bag),
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
    is_hospital_bag: bool = False,
    hospital_bag_section: Optional[str] = None,
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

    IMPORTANT: if the parents ask to add something to their **hospital bag**
    (or say it's needed for the day of birth, e.g. "add nappies to the
    hospital bag"), you MUST pass is_hospital_bag=True. Otherwise the item
    only shows up in the main Baby Essentials list, not the Hospital Bag
    list, even if that's what they asked for. An item can be both a
    must-have AND a hospital-bag item at the same time (e.g. car seat).

    The Hospital Bag list is further split into three physical bags. If the
    parents' phrasing implies one — "for labour", "for when she's on the
    ward", "for me"/"for the birth partner" — also pass hospital_bag_section:
    'labour_ward' (items for the mother during labour itself), 'postnatal_ward'
    (items for mum and baby once moved to recovery), or 'partner_bag' (items
    for the birth partner). Leave it unset if it's ambiguous — the parents
    can sort it later.

    Args:
        name: The item name (required).
        category: One of Sleep, Feeding, Clothing, Bath, Gear, Health, Travel, Nursery
        status: 'needed' (default) | 'bought' | 'skipped'
        is_must_have: true (default) | false (shortlist)
        is_hospital_bag: true if this item belongs in the Hospital Bag list
            (day-of-birth items). false (default) otherwise.
        hospital_bag_section: 'labour_ward' | 'postnatal_ward' | 'partner_bag'
            (optional — only meaningful when is_hospital_bag=True)
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

    if hospital_bag_section is not None and hospital_bag_section not in VALID_HOSPITAL_BAG_SECTIONS:
        return {
            "success": False,
            "error": f"Invalid hospital_bag_section '{hospital_bag_section}'. Must be one of: "
            + ", ".join(VALID_HOSPITAL_BAG_SECTIONS),
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
            is_hospital_bag=is_hospital_bag,
            hospital_bag_section=hospital_bag_section,
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
        "is_hospital_bag": item.is_hospital_bag,
        "hospital_bag_section": item.hospital_bag_section,
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


def set_essentials_item_hospital_bag_tool(
    item_name: str,
    is_hospital_bag: bool,
    hospital_bag_section: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Flag or unflag an existing essentials item for the Hospital Bag list,
    and optionally assign it to one of the three physical bags.

    Use this tool when the parents ask to move an existing item into (or
    out of) their hospital bag, e.g. "add the car seat to the hospital bag"
    or "the going-home outfit isn't in the hospital bag anymore", or to
    reassign which bag an existing hospital-bag item belongs to, e.g.
    "move the going-home outfit to the postnatal ward bag". If the
    item doesn't exist yet, use add_essentials_item_tool instead with
    is_hospital_bag=True.

    Args:
        item_name: The name of the item to update (case-insensitive lookup)
        is_hospital_bag: true to add it to the Hospital Bag list, false to remove it
        hospital_bag_section: 'labour_ward' | 'postnatal_ward' | 'partner_bag'
            (optional). Pass this to assign/reassign which of the three bags
            the item belongs to. Omit to leave the current assignment as-is;
            it's ignored if is_hospital_bag=False.

    Returns:
        Dictionary with the updated item, or error if not found.
    """
    user_id = _get_user_id()

    if hospital_bag_section is not None and hospital_bag_section not in VALID_HOSPITAL_BAG_SECTIONS:
        return {
            "success": False,
            "error": f"Invalid hospital_bag_section '{hospital_bag_section}'. Must be one of: "
            + ", ".join(VALID_HOSPITAL_BAG_SECTIONS),
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
        EssentialItemUpdate(
            is_hospital_bag=is_hospital_bag,
            hospital_bag_section=hospital_bag_section,
        ),
    )

    return {
        "success": True,
        "name": updated.name,
        "is_hospital_bag": updated.is_hospital_bag,
        "hospital_bag_section": updated.hospital_bag_section,
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
        FunctionTool(func=set_essentials_item_hospital_bag_tool),
        # AI Suggestions
        FunctionTool(func=suggest_essentials_tool),
        FunctionTool(func=save_essentials_suggestions_tool),
    ]
