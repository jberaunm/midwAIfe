"""AI-driven baby essentials suggestion via Mistral with structured JSON output.

Single-call flow:
  1. Read preferences (secondhand acceptance, notes)
  2. Read existing items (to avoid duplicates)
  3. Read pregnancy week from user (optional context)
  4. Ask Mistral for 2-4 gap-filling suggestions plus one warm message
  5. Return the structured suggestions to the frontend (agent handles messaging)
"""

import json
import os
from typing import Any, Dict, List

import litellm

from essentials.service import essentials_service
from users.service import user_service


MODEL = "mistral/mistral-small-latest"
MAX_SUGGESTIONS = 4

SYSTEM_PROMPT = (
    "You are a warm, practical baby essentials advisor helping parents "
    "build their preparation checklist. You respond in JSON format with "
    "exactly the requested structure. The 'message' field should be "
    "conversational and encouraging — like a friend sharing what worked "
    "for them — not a sales pitch. Reference category, approximate cost, "
    "and why each item matters. Keep the message to 5-7 sentences total."
)


class EssentialsAIService:
    def suggest(self, user_id: str) -> Dict[str, Any]:
        # litellm reads the env var lazily
        if not os.environ.get("MISTRAL_API_KEY"):
            key = os.getenv("MISTRAL_API_KEY", "")
            if key:
                os.environ["MISTRAL_API_KEY"] = key

        try:
            prefs = essentials_service.get_preferences(user_id)
            existing_items = essentials_service.list_items(user_id)
            existing_names = {item.name.lower() for item in existing_items}

            # Optional: get pregnancy week for context
            pregnancy_week = self._get_pregnancy_week(user_id)
        except Exception as e:
            print(f"Error fetching essentials context: {e}")
            raise

        user_prompt = self._build_prompt(
            prefs, existing_names, pregnancy_week
        )

        response = litellm.completion(
            model=MODEL,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
            response_format={"type": "json_object"},
            temperature=0.8,
        )

        content = response.choices[0].message.content or "{}"
        parsed = json.loads(content)

        suggestions = self._extract_suggestions(parsed)
        if not suggestions:
            raise ValueError("Model returned no usable suggestions")

        message_text = (parsed.get("message") or "").strip()
        if not message_text:
            message_text = "Here are some essentials I'd recommend for your checklist."

        return {
            "suggestions": suggestions,
            "message_id": "",
            "message_content": message_text,
        }

    def _extract_suggestions(self, parsed: Dict[str, Any]) -> List[Dict[str, Any]]:
        raw = parsed.get("suggestions", []) or []
        valid_categories = {"Sleep", "Feeding", "Clothing", "Bath", "Gear", "Health", "Travel", "Nursery"}
        out: List[Dict[str, Any]] = []

        for item in raw[:MAX_SUGGESTIONS]:
            if not isinstance(item, dict):
                continue
            name = item.get("name")
            if not name or not str(name).strip():
                continue

            # Handle category — if combined (e.g., "Sleep/Gear"), take the first one
            category = str(item.get("category", "")).strip() if item.get("category") else None
            if category and "/" in category:
                category = category.split("/")[0].strip()

            # Skip if category is invalid
            if category not in valid_categories:
                print(f"Skipping suggestion '{name}' — invalid category '{category}'")
                continue

            out.append({
                "name": str(name).strip(),
                "category": category,
                "estimated_cost": (
                    float(item["estimated_cost"])
                    if item.get("estimated_cost") and str(item["estimated_cost"]).replace(".", "").isdigit()
                    else None
                ),
                "description": (str(item["description"]).strip() if item.get("description") else None),
            })
        return out

    def _get_pregnancy_week(self, user_id: str) -> int | None:
        """Get pregnancy week from user due date if available."""
        try:
            user = user_service.get_user_by_id(user_id)
            if user and user.due_date:
                from datetime import datetime
                due = datetime.fromisoformat(str(user.due_date).replace("Z", "+00:00"))
                today = datetime.now(due.tzinfo) if due.tzinfo else datetime.now()
                days_diff = (due - today).days
                # 280 days is full term (40 weeks)
                weeks = max(1, min(42, 40 - (days_diff // 7)))
                return weeks
        except Exception:
            pass
        return None

    def _build_prompt(
        self,
        prefs,
        existing_names: set,
        pregnancy_week: int | None,
    ) -> str:
        lines = ["Suggest 2 to 4 baby essentials for these parents."]

        if pregnancy_week:
            lines.append(f"\nPregnancy week: {pregnancy_week} (suggests what to focus on now)")

        secondhand = prefs.accept_secondhand
        if secondhand == "yes":
            lines.append("\nParents are happy to buy secondhand items to save money.")
        elif secondhand == "no":
            lines.append("\nParents prefer new items only.")

        notes = prefs.notes
        if notes:
            lines.append(f"\nParents' notes: {notes}")

        if existing_names:
            items_list = ", ".join(sorted(list(existing_names))[:15])  # Show first 15
            lines.append(
                f"\nItems they already have or listed: {items_list}"
                "\nNEVER suggest any of these (case-insensitive match)"
            )

        lines.append(
            "\nReturn JSON in this exact shape:\n"
            "{\n"
            '  "suggestions": [\n'
            '    {"name": "...", "category": "Sleep" or "Feeding" or "Clothing" or "Bath" or "Gear" or "Health" or "Travel" or "Nursery", '
            '"estimated_cost": 99.99, "description": "why this helps"}\n'
            "  ],\n"
            '  "message": "warm prose encouraging them with these essentials"\n'
            "}\n"
            "\nIMPORTANT: category must be exactly ONE of: Sleep, Feeding, Clothing, Bath, Gear, Health, Travel, or Nursery. "
            "Do NOT combine categories. Pick the PRIMARY category for each item."
        )

        return "\n".join(lines)


essentials_ai_service = EssentialsAIService()
