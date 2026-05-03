"""AI-driven baby name suggestion via Mistral with structured JSON output.

Single-call flow:
  1. Read preferences + positive list (top + shortlisted) + rejected list
  2. Ask Mistral for 1-3 suggestions plus one warm prose message
  3. Persist the prose to chat_messages so the chat panel shows it
  4. Return the structured suggestions + message id/content to the frontend
"""

import json
import os
from typing import Any, Dict, List

import litellm

from chat.services import save_message
from names.service import names_service


MODEL = "mistral/mistral-small-latest"
MAX_SUGGESTIONS = 3

SYSTEM_PROMPT = (
    "You are a warm, knowledgeable baby naming companion helping parents "
    "discover meaningful names. You always respond in JSON format with "
    "exactly the requested structure. The \"message\" field should feel "
    "personal and conversational — like a friend sharing names they thought "
    "of for the parents — not a clinical list. Weave each suggested name's "
    "origin and meaning naturally into the prose. Keep the message to 4-6 "
    "sentences total."
)


class NamesAIService:
    def suggest(self, user_id: str) -> Dict[str, Any]:
        # litellm reads the env var lazily — make sure it's set
        # (the agent module loads it at import time, but we don't want to
        # depend on import order)
        if not os.environ.get("MISTRAL_API_KEY"):
            key = os.getenv("MISTRAL_API_KEY", "")
            if key:
                os.environ["MISTRAL_API_KEY"] = key

        prefs = names_service.get_preferences(user_id)
        positive = (
            names_service.list_candidates(user_id, status="top")
            + names_service.list_candidates(user_id, status="shortlisted")
        )
        rejected = names_service.list_candidates(user_id, status="rejected")
        positive_names = [c.name for c in positive]
        rejected_names = [c.name for c in rejected]

        user_prompt = self._build_prompt(prefs, positive_names, rejected_names)

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
            message_text = "Here are a few names I thought of for you."

        saved = save_message(
            user_id=user_id,
            session_id=f"names_suggestion_{user_id[:8]}",
            role="model",
            content=message_text,
            metadata={
                "source": "names_suggestion",
                "suggested_names": [s["name"] for s in suggestions],
            },
        )

        return {
            "suggestions": suggestions,
            "message_id": saved["id"],
            "message_content": message_text,
        }

    def _extract_suggestions(self, parsed: Dict[str, Any]) -> List[Dict[str, Any]]:
        raw = parsed.get("suggestions", []) or []
        out: List[Dict[str, Any]] = []
        for item in raw[:MAX_SUGGESTIONS]:
            if not isinstance(item, dict):
                continue
            name = item.get("name")
            if not name or not str(name).strip():
                continue
            out.append({
                "name": str(name).strip(),
                "origin": (str(item["origin"]).strip() if item.get("origin") else None),
                "meaning": (str(item["meaning"]).strip() if item.get("meaning") else None),
            })
        return out

    def _build_prompt(
        self, prefs, positive_names: List[str], rejected_names: List[str]
    ) -> str:
        gender_text = {
            "boy": "boy names",
            "girl": "girl names",
            "either": "names of any gender",
        }.get(prefs.gender, "names")

        lines = [f"Suggest 1 to 3 {gender_text} for these parents."]

        if prefs.notes:
            lines.append(f"\nParents' notes: {prefs.notes}")

        if positive_names:
            lines.append(
                "\nNames already on their list (do not re-suggest): "
                + ", ".join(positive_names)
            )

        if rejected_names:
            lines.append(
                "\nNames they have explicitly rejected (NEVER suggest these, "
                "case-insensitive): " + ", ".join(rejected_names)
            )

        lines.append(
            "\nReturn JSON in this exact shape:\n"
            "{\n"
            '  "suggestions": [\n'
            '    {"name": "...", "origin": "...", "meaning": "..."}\n'
            "  ],\n"
            '  "message": "warm prose mentioning each suggestion with its '
            'origin and meaning"\n'
            "}"
        )

        return "\n".join(lines)


names_ai_service = NamesAIService()
