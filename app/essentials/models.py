from typing import Optional, Literal
from datetime import datetime
from pydantic import BaseModel

CategoryType = Literal[
    "Sleep", "Feeding", "Clothing", "Bath",
    "Gear", "Health", "Travel", "Nursery",
]
StatusType = Literal["needed", "bought", "skipped"]
SourceType = Literal["parent", "ai"]
SecondhandType = Literal["yes", "no", "no_preference"]


class EssentialPreferences(BaseModel):
    user_id: str
    accept_secondhand: SecondhandType = "no_preference"
    notes: Optional[str] = None
    updated_at: Optional[datetime] = None


class EssentialPreferencesUpsert(BaseModel):
    accept_secondhand: SecondhandType = "no_preference"
    notes: Optional[str] = None


class EssentialItem(BaseModel):
    id: str
    user_id: str
    name: str
    category: CategoryType
    status: StatusType
    is_must_have: bool
    estimated_cost: Optional[float] = None
    purchase_url: Optional[str] = None
    notes: Optional[str] = None
    source: SourceType
    created_at: datetime
    updated_at: Optional[datetime] = None


class EssentialItemCreate(BaseModel):
    name: str
    category: CategoryType
    status: StatusType = "needed"
    is_must_have: bool = False
    estimated_cost: Optional[float] = None
    purchase_url: Optional[str] = None
    notes: Optional[str] = None
    source: SourceType = "parent"


# Partial-edit body — every field optional. Used by PATCH /items/{id}.
class EssentialItemUpdate(BaseModel):
    name: Optional[str] = None
    category: Optional[CategoryType] = None
    status: Optional[StatusType] = None
    is_must_have: Optional[bool] = None
    estimated_cost: Optional[float] = None
    purchase_url: Optional[str] = None
    notes: Optional[str] = None
    # Sentinels — pass true to explicitly clear a nullable field
    # (since None now means "leave unchanged").
    clear_estimated_cost: bool = False
    clear_purchase_url: bool = False
    clear_notes: bool = False


class EssentialSuggestionItem(BaseModel):
    name: str
    category: Optional[CategoryType] = None
    estimated_cost: Optional[float] = None
    description: Optional[str] = None


class EssentialSuggestionResponse(BaseModel):
    suggestions: list[EssentialSuggestionItem]
    message_id: str
    message_content: str
