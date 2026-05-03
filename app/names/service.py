from typing import Optional, List, Dict
from db.pg_database import execute_query, execute_transaction
from names.models import (
    NamePreferences,
    NamePreferencesUpsert,
    NameCandidate,
    NameCandidateCreate,
)


class NamesService:
    # ----- Preferences -----

    def get_preferences(self, user_id: str) -> NamePreferences:
        query = """
            SELECT user_id, gender, notes, updated_at
            FROM name_preferences
            WHERE user_id = %s
        """
        result = execute_query(query, (user_id,), fetch_one=True)
        if not result:
            return NamePreferences(user_id=user_id)
        return NamePreferences(
            user_id=str(result["user_id"]),
            gender=result["gender"],
            notes=result.get("notes"),
            updated_at=result.get("updated_at"),
        )

    def upsert_preferences(
        self, user_id: str, data: NamePreferencesUpsert
    ) -> NamePreferences:
        query = """
            INSERT INTO name_preferences (user_id, gender, notes, updated_at)
            VALUES (%s, %s, %s, now())
            ON CONFLICT (user_id) DO UPDATE SET
                gender = EXCLUDED.gender,
                notes = EXCLUDED.notes,
                updated_at = now()
            RETURNING user_id, gender, notes, updated_at
        """
        result = execute_query(
            query, (user_id, data.gender, data.notes), fetch_one=True
        )
        return NamePreferences(
            user_id=str(result["user_id"]),
            gender=result["gender"],
            notes=result.get("notes"),
            updated_at=result.get("updated_at"),
        )

    # ----- Candidates -----

    def list_candidates(
        self, user_id: str, status: Optional[str] = None
    ) -> List[NameCandidate]:
        if status:
            query = """
                SELECT id, user_id, name, origin, meaning, notes,
                       status, rank, source, created_at, updated_at
                FROM name_candidates
                WHERE user_id = %s AND status = %s
                ORDER BY rank NULLS LAST, created_at
            """
            params = (user_id, status)
        else:
            query = """
                SELECT id, user_id, name, origin, meaning, notes,
                       status, rank, source, created_at, updated_at
                FROM name_candidates
                WHERE user_id = %s
                ORDER BY status, rank NULLS LAST, created_at
            """
            params = (user_id,)

        results = execute_query(query, params, fetch_all=True)
        return [self._map_candidate(r) for r in results]

    def get_candidate(
        self, user_id: str, candidate_id: str
    ) -> Optional[NameCandidate]:
        query = """
            SELECT id, user_id, name, origin, meaning, notes,
                   status, rank, source, created_at, updated_at
            FROM name_candidates
            WHERE id = %s AND user_id = %s
        """
        result = execute_query(query, (candidate_id, user_id), fetch_one=True)
        return self._map_candidate(result) if result else None

    def find_by_name(self, user_id: str, name: str) -> Optional[NameCandidate]:
        """Case-insensitive lookup of a candidate by name."""
        query = """
            SELECT id, user_id, name, origin, meaning, notes,
                   status, rank, source, created_at, updated_at
            FROM name_candidates
            WHERE user_id = %s AND LOWER(name) = LOWER(%s)
        """
        result = execute_query(query, (user_id, name), fetch_one=True)
        return self._map_candidate(result) if result else None

    def update_candidate_fields(
        self,
        user_id: str,
        candidate_id: str,
        name: Optional[str] = None,
        origin: Optional[str] = None,
        meaning: Optional[str] = None,
        notes: Optional[str] = None,
    ) -> Optional[NameCandidate]:
        """Update textual fields on a candidate. Status and rank are unchanged.
        None means "leave alone"; pass a value to overwrite that field."""
        fields: List[str] = []
        params: List = []
        if name is not None:
            fields.append("name = %s")
            params.append(name)
        if origin is not None:
            fields.append("origin = %s")
            params.append(origin)
        if meaning is not None:
            fields.append("meaning = %s")
            params.append(meaning)
        if notes is not None:
            fields.append("notes = %s")
            params.append(notes)
        if not fields:
            return self.get_candidate(user_id, candidate_id)
        fields.append("updated_at = now()")
        params.extend([candidate_id, user_id])
        query = f"""
            UPDATE name_candidates
            SET {", ".join(fields)}
            WHERE id = %s AND user_id = %s
            RETURNING id, user_id, name, origin, meaning, notes,
                      status, rank, source, created_at, updated_at
        """
        result = execute_query(query, tuple(params), fetch_one=True)
        return self._map_candidate(result) if result else None

    def add_candidate(
        self, user_id: str, data: NameCandidateCreate
    ) -> NameCandidate:
        # Same name (case-insensitive) already exists → flip status instead.
        # Lets a re-typed previously-rejected name return to the shortlist.
        existing = execute_query(
            """
            SELECT id FROM name_candidates
            WHERE user_id = %s AND LOWER(name) = LOWER(%s)
            """,
            (user_id, data.name),
            fetch_one=True,
        )
        if existing:
            return self.update_status(user_id, str(existing["id"]), data.status)

        new_rank = self._next_rank(user_id, data.status)

        query = """
            INSERT INTO name_candidates
                (user_id, name, origin, meaning, notes, status, rank, source)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id, user_id, name, origin, meaning, notes,
                      status, rank, source, created_at, updated_at
        """
        result = execute_query(
            query,
            (
                user_id,
                data.name,
                data.origin,
                data.meaning,
                data.notes,
                data.status,
                new_rank,
                data.source,
            ),
            fetch_one=True,
        )
        return self._map_candidate(result)

    def update_status(
        self, user_id: str, candidate_id: str, new_status: str
    ) -> Optional[NameCandidate]:
        row = execute_query(
            "SELECT status, rank FROM name_candidates WHERE id = %s AND user_id = %s",
            (candidate_id, user_id),
            fetch_one=True,
        )
        if not row:
            return None

        old_status = row["status"]
        old_rank = row["rank"]

        if old_status == new_status:
            return self.get_candidate(user_id, candidate_id)

        new_rank = (
            None
            if new_status == "rejected"
            else self._next_rank(user_id, new_status)
        )

        queries = [
            (
                "UPDATE name_candidates "
                "SET status = %s, rank = %s, updated_at = now() "
                "WHERE id = %s",
                (new_status, new_rank, candidate_id),
            )
        ]

        # Re-pack the source group so ranks stay contiguous.
        if old_status != "rejected" and old_rank is not None:
            queries.append(
                (
                    "UPDATE name_candidates "
                    "SET rank = rank - 1, updated_at = now() "
                    "WHERE user_id = %s AND status = %s AND rank > %s",
                    (user_id, old_status, old_rank),
                )
            )

        execute_transaction(queries)
        return self.get_candidate(user_id, candidate_id)

    def reorder(
        self, user_id: str, status: str, ordered_ids: List[str]
    ) -> List[NameCandidate]:
        if not ordered_ids:
            return self.list_candidates(user_id, status=status)

        queries = [
            (
                "UPDATE name_candidates "
                "SET rank = %s, updated_at = now() "
                "WHERE id = %s AND user_id = %s AND status = %s",
                (idx + 1, cid, user_id, status),
            )
            for idx, cid in enumerate(ordered_ids)
        ]
        execute_transaction(queries)
        return self.list_candidates(user_id, status=status)

    def delete_candidate(self, user_id: str, candidate_id: str) -> bool:
        row = execute_query(
            "SELECT status, rank FROM name_candidates WHERE id = %s AND user_id = %s",
            (candidate_id, user_id),
            fetch_one=True,
        )
        if not row:
            return False

        queries = [
            (
                "DELETE FROM name_candidates WHERE id = %s AND user_id = %s",
                (candidate_id, user_id),
            )
        ]
        if row["status"] != "rejected" and row["rank"] is not None:
            queries.append(
                (
                    "UPDATE name_candidates "
                    "SET rank = rank - 1, updated_at = now() "
                    "WHERE user_id = %s AND status = %s AND rank > %s",
                    (user_id, row["status"], row["rank"]),
                )
            )
        execute_transaction(queries)
        return True

    # ----- Helpers -----

    def _next_rank(self, user_id: str, status: str) -> int:
        result = execute_query(
            """
            SELECT COALESCE(MAX(rank), 0) AS m
            FROM name_candidates
            WHERE user_id = %s AND status = %s
            """,
            (user_id, status),
            fetch_one=True,
        )
        return result["m"] + 1

    def _map_candidate(self, row: Dict) -> NameCandidate:
        return NameCandidate(
            id=str(row["id"]),
            user_id=str(row["user_id"]),
            name=row["name"],
            origin=row.get("origin"),
            meaning=row.get("meaning"),
            notes=row.get("notes"),
            status=row["status"],
            rank=row.get("rank"),
            source=row["source"],
            created_at=row["created_at"],
            updated_at=row.get("updated_at"),
        )


names_service = NamesService()
