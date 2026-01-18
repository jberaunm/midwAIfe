from typing import Optional, Dict
from datetime import date
from db.pg_database import execute_query
from users.models import User

class UserService:
    def get_user_by_id(self, user_id: str) -> Optional[User]:
        """Get user by ID"""
        query = """
            SELECT
                id,
                email,
                first_name,
                due_date,
                last_period_date,
                dietary_restrictions,
                preferred_unit,
                daily_caffeine_limit,
                notification_opt_in,
                created_at,
                updated_at
            FROM users
            WHERE id = %s
        """

        result = execute_query(query, (user_id,), fetch_one=True)

        if not result:
            return None

        return self._map_user(result)

    def _map_user(self, row: Dict) -> User:
        """Map database row to User model"""
        return User(
            id=row['id'],
            email=row['email'],
            firstName=row['first_name'],
            dueDate=row.get('due_date'),
            lastPeriodDate=row.get('last_period_date'),
            dietaryRestrictions=row.get('dietary_restrictions') or [],
            preferredUnit=row.get('preferred_unit', 'metric'),
            dailyCaffeineLimit=row.get('daily_caffeine_limit', 200),
            notificationOptIn=row.get('notification_opt_in', True),
            createdAt=row['created_at'],
            updatedAt=row.get('updated_at')
        )

# Singleton instance
user_service = UserService()
