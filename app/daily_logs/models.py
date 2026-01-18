from typing import Optional, List
from pydantic import BaseModel
from datetime import date, datetime
from decimal import Decimal

class DailyLogCreate(BaseModel):
    """Model for creating a daily log entry"""
    user_id: str
    log_date: date
    sleep_hours: Optional[Decimal] = None
    sleep_quality: Optional[str] = None  # 'poor', 'fair', 'good', 'excellent'
    sleep_notes: Optional[str] = None
    symptoms: Optional[List[str]] = None
    symptom_severity: Optional[str] = None  # 'mild', 'moderate', 'severe'
    symptom_notes: Optional[str] = None

class DailyLogUpdate(BaseModel):
    """Model for updating a daily log entry"""
    sleep_hours: Optional[Decimal] = None
    sleep_quality: Optional[str] = None
    sleep_notes: Optional[str] = None
    symptoms: Optional[List[str]] = None
    symptom_severity: Optional[str] = None
    symptom_notes: Optional[str] = None

class DailyLog(BaseModel):
    """Model for a daily log entry"""
    id: str
    user_id: str
    log_date: date
    sleep_hours: Optional[Decimal] = None
    sleep_quality: Optional[str] = None
    sleep_notes: Optional[str] = None
    symptoms: Optional[List[str]] = None
    symptom_severity: Optional[str] = None
    symptom_notes: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
