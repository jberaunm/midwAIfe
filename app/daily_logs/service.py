from typing import Optional, Dict, List
from datetime import date
from db.pg_database import execute_query
from daily_logs.models import DailyLog, DailyLogCreate, DailyLogUpdate

class DailyLogService:
    def get_daily_log(self, user_id: str, log_date: date) -> Optional[DailyLog]:
        """Get daily log for a specific user and date"""
        query = """
            SELECT
                id,
                user_id,
                log_date,
                sleep_hours,
                sleep_quality,
                sleep_notes,
                symptoms,
                symptom_severity,
                symptom_notes,
                created_at,
                updated_at
            FROM daily_logs
            WHERE user_id = %s AND log_date = %s
        """

        result = execute_query(query, (user_id, log_date), fetch_one=True)

        if not result:
            return None

        return self._map_daily_log(result)

    def get_daily_logs_range(self, user_id: str, start_date: date, end_date: date) -> List[DailyLog]:
        """Get daily logs for a date range"""
        query = """
            SELECT
                id,
                user_id,
                log_date,
                sleep_hours,
                sleep_quality,
                sleep_notes,
                symptoms,
                symptom_severity,
                symptom_notes,
                created_at,
                updated_at
            FROM daily_logs
            WHERE user_id = %s AND log_date BETWEEN %s AND %s
            ORDER BY log_date DESC
        """

        results = execute_query(query, (user_id, start_date, end_date), fetch_all=True)
        return [self._map_daily_log(row) for row in results]

    def create_daily_log(self, log_data: DailyLogCreate) -> DailyLog:
        """Create a new daily log entry"""
        query = """
            INSERT INTO daily_logs (
                user_id,
                log_date,
                sleep_hours,
                sleep_quality,
                sleep_notes,
                symptoms,
                symptom_severity,
                symptom_notes
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING
                id,
                user_id,
                log_date,
                sleep_hours,
                sleep_quality,
                sleep_notes,
                symptoms,
                symptom_severity,
                symptom_notes,
                created_at,
                updated_at
        """

        result = execute_query(
            query,
            (
                log_data.user_id,
                log_data.log_date,
                log_data.sleep_hours,
                log_data.sleep_quality,
                log_data.sleep_notes,
                log_data.symptoms,
                log_data.symptom_severity,
                log_data.symptom_notes,
            ),
            fetch_one=True,
        )

        return self._map_daily_log(result)

    def update_daily_log(
        self, user_id: str, log_date: date, log_data: DailyLogUpdate
    ) -> Optional[DailyLog]:
        """Update an existing daily log entry"""
        # Build dynamic UPDATE query based on provided fields
        update_fields = []
        params = []

        if log_data.sleep_hours is not None:
            update_fields.append("sleep_hours = %s")
            params.append(log_data.sleep_hours)

        if log_data.sleep_quality is not None:
            update_fields.append("sleep_quality = %s")
            params.append(log_data.sleep_quality)

        if log_data.sleep_notes is not None:
            update_fields.append("sleep_notes = %s")
            params.append(log_data.sleep_notes)

        if log_data.symptoms is not None:
            update_fields.append("symptoms = %s")
            params.append(log_data.symptoms)

        if log_data.symptom_severity is not None:
            update_fields.append("symptom_severity = %s")
            params.append(log_data.symptom_severity)

        if log_data.symptom_notes is not None:
            update_fields.append("symptom_notes = %s")
            params.append(log_data.symptom_notes)

        if not update_fields:
            # No fields to update
            return self.get_daily_log(user_id, log_date)

        # Add WHERE clause parameters
        params.extend([user_id, log_date])

        query = f"""
            UPDATE daily_logs
            SET {', '.join(update_fields)}
            WHERE user_id = %s AND log_date = %s
            RETURNING
                id,
                user_id,
                log_date,
                sleep_hours,
                sleep_quality,
                sleep_notes,
                symptoms,
                symptom_severity,
                symptom_notes,
                created_at,
                updated_at
        """

        result = execute_query(query, tuple(params), fetch_one=True)

        if not result:
            return None

        return self._map_daily_log(result)

    def upsert_daily_log(self, log_data: DailyLogCreate) -> DailyLog:
        """Create or update a daily log entry"""
        query = """
            INSERT INTO daily_logs (
                user_id,
                log_date,
                sleep_hours,
                sleep_quality,
                sleep_notes,
                symptoms,
                symptom_severity,
                symptom_notes
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (user_id, log_date)
            DO UPDATE SET
                sleep_hours = EXCLUDED.sleep_hours,
                sleep_quality = EXCLUDED.sleep_quality,
                sleep_notes = EXCLUDED.sleep_notes,
                symptoms = EXCLUDED.symptoms,
                symptom_severity = EXCLUDED.symptom_severity,
                symptom_notes = EXCLUDED.symptom_notes
            RETURNING
                id,
                user_id,
                log_date,
                sleep_hours,
                sleep_quality,
                sleep_notes,
                symptoms,
                symptom_severity,
                symptom_notes,
                created_at,
                updated_at
        """

        result = execute_query(
            query,
            (
                log_data.user_id,
                log_data.log_date,
                log_data.sleep_hours,
                log_data.sleep_quality,
                log_data.sleep_notes,
                log_data.symptoms,
                log_data.symptom_severity,
                log_data.symptom_notes,
            ),
            fetch_one=True,
        )

        return self._map_daily_log(result)

    def delete_daily_log(self, user_id: str, log_date: date) -> bool:
        """Delete a daily log entry"""
        query = """
            DELETE FROM daily_logs
            WHERE user_id = %s AND log_date = %s
        """

        rowcount = execute_query(query, (user_id, log_date), fetch_all=False)
        return rowcount > 0

    def _map_daily_log(self, row: Dict) -> DailyLog:
        """Map database row to DailyLog model"""
        return DailyLog(
            id=row["id"],
            user_id=row["user_id"],
            log_date=row["log_date"],
            sleep_hours=row.get("sleep_hours"),
            sleep_quality=row.get("sleep_quality"),
            sleep_notes=row.get("sleep_notes"),
            symptoms=row.get("symptoms") or [],
            symptom_severity=row.get("symptom_severity"),
            symptom_notes=row.get("symptom_notes"),
            created_at=row["created_at"],
            updated_at=row.get("updated_at"),
        )


# Singleton instance
daily_log_service = DailyLogService()
