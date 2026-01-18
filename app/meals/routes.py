from fastapi import APIRouter, HTTPException, Query
from typing import List, Optional
from meals.service import MealService
from meals.models import (
    FoodItem,
    FoodItemCreate,
    DayData,
    MealUpsert,
    MealItemAdd,
    WeeklyMilestone
)

router = APIRouter(prefix="/api/meals", tags=["meals"])
meal_service = MealService()

# ============================================================================
# FOOD ITEMS ENDPOINTS
# ============================================================================

@router.get("/foods", response_model=List[FoodItem])
async def get_foods(q: Optional[str] = Query(None, description="Search query")):
    """Get all foods or search by query"""
    try:
        if q:
            foods = meal_service.search_foods(q)
        else:
            foods = meal_service.get_all_foods()
        return foods
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching foods: {str(e)}")

@router.get("/foods/{food_id}", response_model=FoodItem)
async def get_food_by_id(food_id: str):
    """Get a single food item by ID"""
    try:
        food = meal_service.get_food_by_id(food_id)
        if not food:
            raise HTTPException(status_code=404, detail="Food not found")
        return food
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching food: {str(e)}")

@router.post("/foods", response_model=FoodItem, status_code=201)
async def create_food(food: FoodItemCreate):
    """Create a new food item (admin only)"""
    try:
        new_food = meal_service.create_food(food)
        return new_food
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error creating food: {str(e)}")

# ============================================================================
# MEALS ENDPOINTS
# ============================================================================

@router.get("/week", response_model=List[DayData])
async def get_week_meals(
    user_id: str = Query(..., description="User ID"),
    start_date: str = Query(..., description="Start date (YYYY-MM-DD)")
):
    """Get all meals for a week"""
    try:
        days = meal_service.get_week_meals(user_id, start_date)
        return days
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching week meals: {str(e)}")

@router.get("/range", response_model=List[DayData])
async def get_meals_by_date_range(
    user_id: str = Query(..., description="User ID"),
    start_date: str = Query(..., description="Start date (YYYY-MM-DD)"),
    end_date: str = Query(..., description="End date (YYYY-MM-DD)")
):
    """Get all meals for a date range"""
    try:
        days = meal_service.get_meals_by_date_range(user_id, start_date, end_date)
        return days
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching meals: {str(e)}")

@router.post("/upsert", status_code=201)
async def upsert_meal(meal_data: MealUpsert):
    """Create or update a meal with food items"""
    try:
        meal_service.upsert_meal(
            meal_data.userId,
            meal_data.date,
            meal_data.dayOfWeek,
            meal_data.mealType,
            meal_data.foodItemIds
        )
        return {"message": "Meal updated successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error upserting meal: {str(e)}")

@router.post("/add-item", status_code=201)
async def add_meal_item(item_data: MealItemAdd):
    """Add a single food item to a meal"""
    try:
        print(f"[DEBUG] Received add-item request: userId={item_data.userId}, date={item_data.date}, dayOfWeek={item_data.dayOfWeek}, mealType={item_data.mealType}, foodItemId={item_data.foodItemId}")
        meal_service.add_meal_item(
            item_data.userId,
            item_data.date,
            item_data.dayOfWeek,
            item_data.mealType,
            item_data.foodItemId
        )
        return {"message": "Food item added successfully"}
    except Exception as e:
        print(f"[ERROR] Error in add_meal_item: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error adding food item: {str(e)}")

@router.delete("/item")
async def remove_meal_item(
    meal_id: str = Query(..., description="Meal ID"),
    food_item_id: str = Query(..., description="Food item ID")
):
    """Remove a food item from a meal"""
    try:
        meal_service.remove_meal_item(meal_id, food_item_id)
        return {"message": "Food item removed successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error removing food item: {str(e)}")

@router.delete("/{meal_id}")
async def delete_meal(meal_id: str):
    """Delete an entire meal"""
    try:
        meal_service.delete_meal(meal_id)
        return {"message": "Meal deleted successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error deleting meal: {str(e)}")

# ============================================================================
# MILESTONES ENDPOINTS
# ============================================================================

@router.get("/milestones/{week_number}", response_model=WeeklyMilestone)
async def get_milestone(week_number: int):
    """Get milestone for a specific pregnancy week"""
    try:
        milestone = meal_service.get_milestone_by_week(week_number)
        if not milestone:
            raise HTTPException(status_code=404, detail="Milestone not found")
        return milestone
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching milestone: {str(e)}")

@router.get("/milestones", response_model=List[WeeklyMilestone])
async def get_all_milestones():
    """Get all milestones"""
    try:
        milestones = meal_service.get_all_milestones()
        return milestones
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching milestones: {str(e)}")
