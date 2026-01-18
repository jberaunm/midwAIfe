from fastapi import APIRouter, HTTPException, Query
from datetime import date
from typing import List
from daily_logs.service import daily_log_service
from daily_logs.models import DailyLog, DailyLogCreate, DailyLogUpdate

router = APIRouter(prefix="/api/daily-logs", tags=["daily-logs"])

@router.get("/{user_id}/{log_date}", response_model=DailyLog)
async def get_daily_log(user_id: str, log_date: date):
    """Get daily log for a specific user and date"""
    try:
        log = daily_log_service.get_daily_log(user_id, log_date)
        if not log:
            raise HTTPException(
                status_code=404,
                detail=f"Daily log not found for user {user_id} on {log_date}"
            )
        return log
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching daily log: {str(e)}")

@router.get("/{user_id}", response_model=List[DailyLog])
async def get_daily_logs_range(
    user_id: str,
    start_date: date = Query(..., description="Start date (YYYY-MM-DD)"),
    end_date: date = Query(..., description="End date (YYYY-MM-DD)")
):
    """Get daily logs for a user within a date range"""
    try:
        logs = daily_log_service.get_daily_logs_range(user_id, start_date, end_date)
        return logs
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching daily logs: {str(e)}")

@router.post("/", response_model=DailyLog)
async def create_daily_log(log_data: DailyLogCreate):
    """Create a new daily log entry"""
    try:
        log = daily_log_service.create_daily_log(log_data)
        return log
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error creating daily log: {str(e)}")

@router.put("/{user_id}/{log_date}", response_model=DailyLog)
async def update_daily_log(user_id: str, log_date: date, log_data: DailyLogUpdate):
    """Update an existing daily log entry"""
    try:
        log = daily_log_service.update_daily_log(user_id, log_date, log_data)
        if not log:
            raise HTTPException(
                status_code=404,
                detail=f"Daily log not found for user {user_id} on {log_date}"
            )
        return log
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error updating daily log: {str(e)}")

@router.post("/upsert", response_model=DailyLog)
async def upsert_daily_log(log_data: DailyLogCreate):
    """Create or update a daily log entry (upsert)"""
    try:
        log = daily_log_service.upsert_daily_log(log_data)
        return log
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error upserting daily log: {str(e)}")

@router.delete("/{user_id}/{log_date}")
async def delete_daily_log(user_id: str, log_date: date):
    """Delete a daily log entry"""
    try:
        deleted = daily_log_service.delete_daily_log(user_id, log_date)
        if not deleted:
            raise HTTPException(
                status_code=404,
                detail=f"Daily log not found for user {user_id} on {log_date}"
            )
        return {"message": "Daily log deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error deleting daily log: {str(e)}")
