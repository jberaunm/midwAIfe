from typing import Optional, List
from pydantic import BaseModel
from datetime import date, datetime

class User(BaseModel):
    id: str
    email: str
    firstName: str
    dueDate: Optional[date] = None
    lastPeriodDate: Optional[date] = None
    dietaryRestrictions: List[str] = []
    preferredUnit: str = "metric"
    dailyCaffeineLimit: int = 200
    notificationOptIn: bool = True
    createdAt: datetime
    updatedAt: Optional[datetime] = None
