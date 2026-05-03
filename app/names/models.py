from typing import Optional, List, Literal
from datetime import datetime
from pydantic import BaseModel

GenderType = Literal["boy", "girl", "either"]
StatusType = Literal["top", "shortlisted", "rejected"]
SourceType = Literal["parent", "ai"]


class NamePreferences(BaseModel):
    user_id: str
    gender: GenderType = "either"
    notes: Optional[str] = None
    updated_at: Optional[datetime] = None


class NamePreferencesUpsert(BaseModel):
    gender: GenderType = "either"
    notes: Optional[str] = None


class NameCandidate(BaseModel):
    id: str
    user_id: str
    name: str
    origin: Optional[str] = None
    meaning: Optional[str] = None
    notes: Optional[str] = None
    status: StatusType
    rank: Optional[int] = None
    source: SourceType
    created_at: datetime
    updated_at: Optional[datetime] = None


class NameCandidateCreate(BaseModel):
    name: str
    origin: Optional[str] = None
    meaning: Optional[str] = None
    notes: Optional[str] = None
    status: StatusType = "shortlisted"
    source: SourceType = "parent"


class NameStatusUpdate(BaseModel):
    status: StatusType


class NameReorder(BaseModel):
    status: Literal["top", "shortlisted"]
    ordered_ids: List[str]


class NameSuggestionItem(BaseModel):
    name: str
    origin: Optional[str] = None
    meaning: Optional[str] = None


class NameSuggestionResponse(BaseModel):
    suggestions: List[NameSuggestionItem]
    message_id: str
    message_content: str
