from typing import Optional, List
from pydantic import BaseModel

# ============================================================================
# Micronutrient Models
# ============================================================================

class MicronutrientPresence(BaseModel):
    calcium: bool = False
    iron: bool = False
    folicAcid: bool = False
    protein: bool = False
    vitaminD: Optional[bool] = None
    omega3: Optional[bool] = None
    fiber: Optional[bool] = None

# ============================================================================
# Food Models
# ============================================================================

class FoodItem(BaseModel):
    id: str
    name: str
    portion: Optional[str] = None
    macroCategory: Optional[str] = None
    rainbowColor: Optional[str] = None
    phytonutrientFocus: Optional[str] = None
    containsMicronutrients: MicronutrientPresence
    hasWarnings: bool = False
    warningMessage: Optional[str] = None
    warningType: Optional[str] = None
    tags: Optional[List[str]] = None
    description: Optional[str] = None

class FoodItemCreate(BaseModel):
    name: str
    portion: Optional[str] = None
    macroCategory: Optional[str] = None
    rainbowColor: Optional[str] = None
    phytonutrientFocus: Optional[str] = None
    containsMicronutrients: MicronutrientPresence
    hasWarnings: bool = False
    warningMessage: Optional[str] = None
    warningType: Optional[str] = None
    tags: Optional[List[str]] = None
    description: Optional[str] = None

# ============================================================================
# Meal Models
# ============================================================================

class Meal(BaseModel):
    id: str
    type: str
    items: List[FoodItem]
    containsMicronutrients: MicronutrientPresence
    notes: Optional[str] = None

class DayMeals(BaseModel):
    breakfast: Optional[Meal] = None
    snack1: Optional[Meal] = None
    lunch: Optional[Meal] = None
    snack2: Optional[Meal] = None
    dinner: Optional[Meal] = None

class NutrientStatus(BaseModel):
    covered: bool
    mealsCovered: List[str]
    status: str  # 'good', 'moderate', 'missing'

class DailySummary(BaseModel):
    calcium: NutrientStatus
    iron: NutrientStatus
    folicAcid: NutrientStatus
    protein: NutrientStatus
    hasWarnings: bool
    missingNutrients: List[str]

class DayData(BaseModel):
    id: str
    date: str
    dayOfWeek: str
    meals: DayMeals
    dailySummary: DailySummary

class MealUpsert(BaseModel):
    userId: str
    date: str
    dayOfWeek: str
    mealType: str
    foodItemIds: List[str]

class MealItemAdd(BaseModel):
    userId: str
    date: str
    dayOfWeek: str
    mealType: str
    foodItemId: str

# ============================================================================
# Milestone Models
# ============================================================================

class WeeklyMilestone(BaseModel):
    id: str
    weekNumber: int
    nhsSizeComparison: Optional[str] = None
    developmentMilestone: str
    nutritionalFocusColor: Optional[str] = None
    keyNutrient: Optional[str] = None
    actionTip: Optional[str] = None
    sourceUrl: Optional[str] = None
