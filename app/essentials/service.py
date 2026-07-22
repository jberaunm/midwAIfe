from typing import Optional, List, Dict, Any
from db.pg_database import execute_query
from essentials.models import (
    EssentialPreferences,
    EssentialPreferencesUpsert,
    EssentialItem,
    EssentialItemCreate,
    EssentialItemUpdate,
)


class EssentialsService:
    # ----- Preferences -----

    def get_preferences(self, user_id: str) -> EssentialPreferences:
        query = """
            SELECT user_id, accept_secondhand, notes, updated_at
            FROM essential_preferences
            WHERE user_id = %s
        """
        result = execute_query(query, (user_id,), fetch_one=True)
        if not result:
            return EssentialPreferences(user_id=user_id)
        return EssentialPreferences(
            user_id=str(result["user_id"]),
            accept_secondhand=result["accept_secondhand"],
            notes=result.get("notes"),
            updated_at=result.get("updated_at"),
        )

    def upsert_preferences(
        self, user_id: str, data: EssentialPreferencesUpsert
    ) -> EssentialPreferences:
        query = """
            INSERT INTO essential_preferences (user_id, accept_secondhand, notes, updated_at)
            VALUES (%s, %s, %s, now())
            ON CONFLICT (user_id) DO UPDATE SET
                accept_secondhand = EXCLUDED.accept_secondhand,
                notes = EXCLUDED.notes,
                updated_at = now()
            RETURNING user_id, accept_secondhand, notes, updated_at
        """
        result = execute_query(
            query, (user_id, data.accept_secondhand, data.notes), fetch_one=True
        )
        return EssentialPreferences(
            user_id=str(result["user_id"]),
            accept_secondhand=result["accept_secondhand"],
            notes=result.get("notes"),
            updated_at=result.get("updated_at"),
        )

    # ----- Items -----

    def list_items(
        self, user_id: str, status: Optional[str] = None
    ) -> List[EssentialItem]:
        if status:
            query = """
                SELECT id, user_id, name, category, status, is_must_have,
                       is_hospital_bag, estimated_cost, purchase_url, notes,
                       source, created_at, updated_at
                FROM essential_items
                WHERE user_id = %s AND status = %s
                ORDER BY is_must_have DESC, status, category, name
            """
            params: tuple = (user_id, status)
        else:
            query = """
                SELECT id, user_id, name, category, status, is_must_have,
                       is_hospital_bag, estimated_cost, purchase_url, notes,
                       source, created_at, updated_at
                FROM essential_items
                WHERE user_id = %s
                ORDER BY is_must_have DESC, status, category, name
            """
            params = (user_id,)

        results = execute_query(query, params, fetch_all=True)
        return [self._map_item(r) for r in results]

    def get_item(self, user_id: str, item_id: str) -> Optional[EssentialItem]:
        query = """
            SELECT id, user_id, name, category, status, is_must_have,
                   is_hospital_bag, estimated_cost, purchase_url, notes,
                   source, created_at, updated_at
            FROM essential_items
            WHERE id = %s AND user_id = %s
        """
        result = execute_query(query, (item_id, user_id), fetch_one=True)
        return self._map_item(result) if result else None

    def find_by_name(self, user_id: str, name: str) -> Optional[EssentialItem]:
        """Case-insensitive lookup by name."""
        query = """
            SELECT id, user_id, name, category, status, is_must_have,
                   is_hospital_bag, estimated_cost, purchase_url, notes,
                   source, created_at, updated_at
            FROM essential_items
            WHERE user_id = %s AND LOWER(name) = LOWER(%s)
        """
        result = execute_query(query, (user_id, name), fetch_one=True)
        return self._map_item(result) if result else None

    def add_item(
        self, user_id: str, data: EssentialItemCreate
    ) -> EssentialItem:
        # Same name (case-insensitive) already exists → update it instead.
        # Lets re-typed names land back on the right tier rather than failing
        # on the unique index.
        existing = execute_query(
            "SELECT id FROM essential_items WHERE user_id = %s AND LOWER(name) = LOWER(%s)",
            (user_id, data.name),
            fetch_one=True,
        )
        if existing:
            update = EssentialItemUpdate(
                category=data.category,
                status=data.status,
                is_must_have=data.is_must_have,
                is_hospital_bag=data.is_hospital_bag,
                estimated_cost=data.estimated_cost,
                purchase_url=data.purchase_url,
                notes=data.notes,
            )
            updated = self.update_item(user_id, str(existing["id"]), update)
            if updated:
                return updated

        query = """
            INSERT INTO essential_items
                (user_id, name, category, status, is_must_have, is_hospital_bag,
                 estimated_cost, purchase_url, notes, source)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id, user_id, name, category, status, is_must_have,
                      is_hospital_bag, estimated_cost, purchase_url, notes,
                      source, created_at, updated_at
        """
        result = execute_query(
            query,
            (
                user_id,
                data.name,
                data.category,
                data.status,
                data.is_must_have,
                data.is_hospital_bag,
                data.estimated_cost,
                data.purchase_url,
                data.notes,
                data.source,
            ),
            fetch_one=True,
        )
        return self._map_item(result)

    def update_item(
        self, user_id: str, item_id: str, data: EssentialItemUpdate
    ) -> Optional[EssentialItem]:
        """Partial update — only fields explicitly provided are written.

        For nullable fields, pass `clear_*=True` to set them to NULL
        (since `None` means "leave alone").
        """
        fields: List[str] = []
        params: List[Any] = []

        if data.name is not None:
            fields.append("name = %s")
            params.append(data.name)
        if data.category is not None:
            fields.append("category = %s")
            params.append(data.category)
        if data.status is not None:
            fields.append("status = %s")
            params.append(data.status)
        if data.is_must_have is not None:
            fields.append("is_must_have = %s")
            params.append(data.is_must_have)
        if data.is_hospital_bag is not None:
            fields.append("is_hospital_bag = %s")
            params.append(data.is_hospital_bag)

        if data.clear_estimated_cost:
            fields.append("estimated_cost = NULL")
        elif data.estimated_cost is not None:
            fields.append("estimated_cost = %s")
            params.append(data.estimated_cost)

        if data.clear_purchase_url:
            fields.append("purchase_url = NULL")
        elif data.purchase_url is not None:
            fields.append("purchase_url = %s")
            params.append(data.purchase_url)

        if data.clear_notes:
            fields.append("notes = NULL")
        elif data.notes is not None:
            fields.append("notes = %s")
            params.append(data.notes)

        if not fields:
            return self.get_item(user_id, item_id)

        fields.append("updated_at = now()")
        params.extend([item_id, user_id])

        query = f"""
            UPDATE essential_items
            SET {", ".join(fields)}
            WHERE id = %s AND user_id = %s
            RETURNING id, user_id, name, category, status, is_must_have,
                      is_hospital_bag, estimated_cost, purchase_url, notes,
                      source, created_at, updated_at
        """
        result = execute_query(query, tuple(params), fetch_one=True)
        return self._map_item(result) if result else None

    def delete_item(self, user_id: str, item_id: str) -> bool:
        query = "DELETE FROM essential_items WHERE id = %s AND user_id = %s"
        rowcount = execute_query(query, (item_id, user_id), fetch_all=False)
        return rowcount > 0

    # ----- Helpers -----

    def _map_item(self, row: Dict) -> EssentialItem:
        # numeric(8,2) comes back as Decimal — coerce to float so it
        # serializes as a JSON number for the frontend.
        cost = row.get("estimated_cost")
        return EssentialItem(
            id=str(row["id"]),
            user_id=str(row["user_id"]),
            name=row["name"],
            category=row["category"],
            status=row["status"],
            is_must_have=row["is_must_have"],
            is_hospital_bag=row["is_hospital_bag"],
            estimated_cost=float(cost) if cost is not None else None,
            purchase_url=row.get("purchase_url"),
            notes=row.get("notes"),
            source=row["source"],
            created_at=row["created_at"],
            updated_at=row.get("updated_at"),
        )


essentials_service = EssentialsService()
