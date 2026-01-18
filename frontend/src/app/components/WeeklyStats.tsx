import React from "react";
import { useSessionData } from "../contexts/SessionDataContext";

interface WeeklyStatsProps {
  date: Date;
}

export default function WeeklyStats({ date }: WeeklyStatsProps) {
  const { weeklyData, loading, error } = useSessionData();
  
  const weekStats = weeklyData?.data || [];
  const summary = weeklyData?.summary || null;

  const formatDayName = (dayName: string) => {
    return dayName.substring(0, 3); // Get first 3 characters (Mon, Tue, etc.)
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).getDate().toString();
  };

  if (loading) {
    return (
      <div className="stat-card weekly-stats-card">
        <h1>Weekly Overview</h1>
        <div style={{ textAlign: "center", padding: "20px", color: "#666" }}>
          Loading weekly data...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="stat-card weekly-stats-card">
        <h1>Weekly Overview</h1>
        <div style={{ textAlign: "center", padding: "20px", color: "#666" }}>
          No data available for this week
        </div>
      </div>
    );
  }

  return (
    <div className="stat-card weekly-stats-card">
      <h1>Weekly Overview</h1>
      
      {/* Daily breakdown */}
      <div className="weekly-breakdown">
        <div className="days-grid">
          {weekStats.map((day, index) => {
            // Determine CSS classes for the day item
            const dayClasses = ['day-item'];
            
            if (day.is_today) {
              dayClasses.push('today');
              if (day.session_completed) {
                dayClasses.push('completed');
              } else {
                dayClasses.push('incomplete');
              }
            }
            
            if (day.has_activity) {
              dayClasses.push('has-activity');
            } else {
              dayClasses.push('no-activity');
            }
            
            return (
            <div 
              key={index} 
              className={dayClasses.join(' ')}
            >
              <div className="day-header">
                <span className="day-name">{formatDayName(day.day_name)}</span>
                <span className="day-date">{formatDate(day.date)}</span>
              </div>
              <div className="day-stats">
                <div className="stat-item">
                  <span className="stat-value session-type">{day.session_type}</span>
                </div>
                <div className="stat-item">
                  <span className="stat-value">
                    {day.planned_distance === 0 ? "-" : day.actual_distance === 0 ? day.planned_distance + "k" : day.actual_distance + "k"}</span>
                </div>
              </div>
            </div>
          );
          })}
        </div>
      </div>

      {/* Weekly totals */}
      <div className="weekly-totals">
        <div className="total-item">
          <span className="total-label">Distance</span>
          <span className="total-value">{summary?.total_distance_completed || 0}/{summary?.total_distance_planned || 0}k</span>
        </div>
        <div className="total-item">
          <span className="total-label">Total Sessions</span>
          <span className="total-value">{summary?.total_sessions || 0}</span>
        </div>
        <div className="total-item">
          <span className="total-label">Completed</span>
          <span className="total-value">{summary?.completed_sessions || 0}</span>
        </div>
        <div className="total-item">
          <span className="total-label">Completion Rate</span>
          <span className="total-value">{summary ? summary.completion_rate.toFixed(0) : 0}%</span>
        </div>
      </div>

    </div>
  );
} 