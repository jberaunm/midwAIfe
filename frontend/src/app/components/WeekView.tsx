"use client";
import React, { useState, useEffect } from "react";
import FoodSearchModal from "./FoodSearchModal";
import { getWeekMeals, addMealItem, removeMealItem, getDailyLogsRange, upsertDailyLog, type DailyLog } from "../lib/api";
import type { FoodItem, DayData } from "../types/nutrition";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MEAL_TYPES = ["breakfast", "snack1", "lunch", "snack2", "dinner"] as const;
const MEAL_LABELS = {
  breakfast: "Breakfast",
  snack1: "Snack 1",
  lunch: "Lunch",
  snack2: "Snack 2",
  dinner: "Dinner"
};

// Temporary user ID - in production, this would come from authentication
// Using a valid UUID format for PostgreSQL compatibility
const USER_ID = "00000000-0000-0000-0000-000000000001";

interface WeekViewProps {
  selectedWeek?: number;
  actualWeek?: number;
}

export default function WeekView({ selectedWeek, actualWeek }: WeekViewProps) {
  const [weekData, setWeekData] = useState<DayData[]>([]);
  const [dailyLogs, setDailyLogs] = useState<Map<string, DailyLog>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [selectedMealType, setSelectedMealType] = useState<typeof MEAL_TYPES[number] | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [draggedFood, setDraggedFood] = useState<{ day: DayData; mealType: typeof MEAL_TYPES[number]; foodId: string } | null>(null);
  const [draggedDailyLog, setDraggedDailyLog] = useState<{ date: string; type: 'sleep' | 'symptoms' } | null>(null);
  const [isTrashHovered, setIsTrashHovered] = useState(false);
  const [expandedMeals, setExpandedMeals] = useState<Set<string>>(new Set());

  // Calculate start of week for the selected pregnancy week
  const getWeekStartDate = () => {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const startDate = new Date(today);
    startDate.setDate(today.getDate() - dayOfWeek);

    if (!selectedWeek || !actualWeek || selectedWeek === actualWeek) {
      // Default: current calendar week (Sunday)
      return startDate.toISOString().split('T')[0];
    }

    // Calculate the date offset for the selected pregnancy week
    // Each week is 7 days, so offset is (selectedWeek - actualWeek) * 7 days
    const weekOffset = selectedWeek - actualWeek;
    const offsetDate = new Date(startDate);
    offsetDate.setDate(startDate.getDate() + (weekOffset * 7));

    return offsetDate.toISOString().split('T')[0];
  };

  // Map rainbow color names to hex colors
  const getRainbowColorHex = (colorName: string | null | undefined): string | null => {
    if (!colorName) return null;

    const colorMap: Record<string, string> = {
      'Red': '#E53E3E',
      'Orange/Yellow': '#EAA221',
      'Green': '#38A169',
      'Blue/Purple': '#805AD5',
      'White/Brown': '#A0AEC0'
    };

    return colorMap[colorName] || null;
  };

  // Get rainbow colors consumed in the day
  const getRainbowColors = (dayData: DayData): Set<string> => {
    const colors = new Set<string>();

    MEAL_TYPES.forEach(mealType => {
      const meal = dayData.meals[mealType];
      if (meal?.items) {
        meal.items.forEach(food => {
          if (food.rainbowColor) {
            colors.add(food.rainbowColor);
          }
        });
      }
    });

    return colors;
  };

  // Get nutrients with their frequency (how many meals contain them)
  const getDailyNutrientsWithFrequency = (dayData: DayData): { nutrient: string; count: number }[] => {
    const nutrientsCount = new Map<string, number>();

    // Count nutrients across all meals
    MEAL_TYPES.forEach(mealType => {
      const meal = dayData.meals[mealType];
      if (meal?.items && meal.items.length > 0) {
        // Track which nutrients appear in this meal (not per food)
        const mealNutrients = new Set<string>();

        meal.items.forEach(food => {
          const m = food.containsMicronutrients;
          if (m.calcium) mealNutrients.add('Calcium');
          if (m.iron) mealNutrients.add('Iron');
          if (m.folicAcid) mealNutrients.add('Folic Acid');
          if (m.protein) mealNutrients.add('Protein');
          if (m.vitaminD) mealNutrients.add('Vitamin D');
          if (m.omega3) mealNutrients.add('Omega-3 (DHA)');
          if (m.fiber) mealNutrients.add('Fiber');
        });

        // Increment count for each nutrient present in this meal
        mealNutrients.forEach(nutrient => {
          nutrientsCount.set(nutrient, (nutrientsCount.get(nutrient) || 0) + 1);
        });
      }
    });

    // Convert to array and sort by name
    return Array.from(nutrientsCount.entries())
      .map(([nutrient, count]) => ({ nutrient, count }))
      .sort((a, b) => a.nutrient.localeCompare(b.nutrient));
  };

  // Calculate daily nutrient summary based on foods in all meals
  const calculateDailyNutrients = (dayData: DayData): DayData => {
    const nutrients = {
      calcium: false,
      iron: false,
      folicAcid: false,
      protein: false,
      vitaminD: false,
      omega3: false,
      fiber: false,
      vitaminC: false,
      vitaminA: false,
      choline: false,
      iodine: false,
      zinc: false,
      vitaminB12: false
    };

    // Collect all foods from all meals
    const allFoods: FoodItem[] = [];
    MEAL_TYPES.forEach(mealType => {
      const meal = dayData.meals[mealType];
      if (meal?.items) {
        allFoods.push(...meal.items);
      }
    });

    // Check which nutrients are covered
    allFoods.forEach(food => {
      const m = food.containsMicronutrients;
      if (m.calcium) nutrients.calcium = true;
      if (m.iron) nutrients.iron = true;
      if (m.folicAcid) nutrients.folicAcid = true;
      if (m.protein) nutrients.protein = true;
      if (m.vitaminD) nutrients.vitaminD = true;
      if (m.omega3) nutrients.omega3 = true;
      if (m.fiber) nutrients.fiber = true;
    });

    // Calculate missing nutrients
    const missingNutrients: string[] = [];
    if (!nutrients.calcium) missingNutrients.push('Calcium');
    if (!nutrients.iron) missingNutrients.push('Iron');
    if (!nutrients.folicAcid) missingNutrients.push('Folic Acid');
    if (!nutrients.protein) missingNutrients.push('Protein');

    return {
      ...dayData,
      dailySummary: {
        calcium: { covered: nutrients.calcium, mealsCovered: [], status: nutrients.calcium ? 'good' : 'missing' },
        iron: { covered: nutrients.iron, mealsCovered: [], status: nutrients.iron ? 'good' : 'missing' },
        folicAcid: { covered: nutrients.folicAcid, mealsCovered: [], status: nutrients.folicAcid ? 'good' : 'missing' },
        protein: { covered: nutrients.protein, mealsCovered: [], status: nutrients.protein ? 'good' : 'missing' },
        hasWarnings: allFoods.some(f => f.hasWarnings),
        missingNutrients
      }
    };
  };

  // Load week meals on mount and when selected week changes
  useEffect(() => {
    loadWeekMeals();
  }, [selectedWeek, actualWeek]);

  const loadWeekMeals = async () => {
    setLoading(true);
    setError(null);
    try {
      const startDate = getWeekStartDate();
      const data = await getWeekMeals(USER_ID, startDate);

      // Calculate end date (6 days after start)
      const endDateObj = new Date(startDate);
      endDateObj.setDate(endDateObj.getDate() + 6);
      const endDate = endDateObj.toISOString().split('T')[0];

      // Fetch daily logs for the week
      let logs: DailyLog[] = [];
      try {
        logs = await getDailyLogsRange(USER_ID, startDate, endDate);
      } catch (logErr) {
        console.error("Error loading daily logs:", logErr);
        // Continue even if logs fail to load
      }

      // Create a map of daily logs by date for easy lookup
      const logsMap = new Map<string, DailyLog>();
      logs.forEach(log => {
        logsMap.set(log.log_date, log);
      });
      setDailyLogs(logsMap);

      // Fill in missing days
      const fullWeekData: DayData[] = [];
      const startDateObj = new Date(startDate);

      for (let i = 0; i < 7; i++) {
        const currentDate = new Date(startDateObj);
        currentDate.setDate(startDateObj.getDate() + i);
        const dateStr = currentDate.toISOString().split('T')[0];

        const existingDay = data.find((d: DayData) => d.date === dateStr);

        if (existingDay) {
          // Calculate nutrients for existing day
          fullWeekData.push(calculateDailyNutrients(existingDay));
        } else {
          // Create empty day structure
          const emptyDay: DayData = {
            id: dateStr,
            date: dateStr,
            dayOfWeek: DAYS[i] as 'Sunday' | 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday',
            meals: {
              breakfast: null,
              snack1: null,
              lunch: null,
              snack2: null,
              dinner: null
            },
            dailySummary: {
              calcium: { covered: false, mealsCovered: [], status: 'missing' },
              iron: { covered: false, mealsCovered: [], status: 'missing' },
              folicAcid: { covered: false, mealsCovered: [], status: 'missing' },
              protein: { covered: false, mealsCovered: [], status: 'missing' },
              hasWarnings: false,
              missingNutrients: ['Calcium', 'Iron', 'Folic Acid', 'Protein']
            }
          };
          fullWeekData.push(emptyDay);
        }
      }

      setWeekData(fullWeekData);
    } catch (err: any) {
      setError(err.message || "Failed to load week meals");
      console.error("Error loading week meals:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddFoodClick = (day: string, mealType: typeof MEAL_TYPES[number]) => {
    setSelectedDay(day);
    setSelectedMealType(mealType);
    setIsModalOpen(true);
  };

  const handleSelectFood = async (food: FoodItem) => {
    if (!selectedDay || !selectedMealType) return;

    try {
      // Find the date for the selected day
      const dayData = weekData.find(d => d.dayOfWeek === selectedDay);
      if (!dayData) return;

      // Map meal type to API format
      const mealTypeMap: Record<string, string> = {
        breakfast: "Breakfast",
        snack1: "Snack 1",
        lunch: "Lunch",
        snack2: "Snack 2",
        dinner: "Dinner"
      };

      await addMealItem({
        userId: USER_ID,
        date: dayData.date,
        dayOfWeek: selectedDay,
        mealType: mealTypeMap[selectedMealType],
        foodItemId: food.id
      });

      // Reload week data
      await loadWeekMeals();
    } catch (err: any) {
      console.error("Error adding food item:", err);
      alert(`Failed to add food: ${err.message}`);
    }
  };

  const handleRemoveFood = async (day: DayData, mealType: typeof MEAL_TYPES[number], foodId: string) => {
    try {
      const meal = day.meals[mealType];
      if (!meal) return;

      await removeMealItem(meal.id, foodId);

      // Reload week data
      await loadWeekMeals();
    } catch (err: any) {
      console.error("Error removing food item:", err);
      alert(`Failed to remove food: ${err.message}`);
    }
  };

  const toggleMealExpansion = (dayId: string, mealType: typeof MEAL_TYPES[number]) => {
    const key = `${dayId}-${mealType}`;
    setExpandedMeals(prev => {
      const newSet = new Set(prev);
      if (newSet.has(key)) {
        newSet.delete(key);
      } else {
        newSet.add(key);
      }
      return newSet;
    });
  };

  const handleDragStart = (e: React.DragEvent, day: DayData, mealType: typeof MEAL_TYPES[number], foodId: string) => {
    setDraggedFood({ day, mealType, foodId });
    e.dataTransfer.effectAllowed = 'move';
    // Make the dragged element slightly transparent
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '0.5';
    }
  };

  const handleDragEnd = (e: React.DragEvent) => {
    // Reset opacity
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '1';
    }
    setDraggedFood(null);
    setDraggedDailyLog(null);
    setIsTrashHovered(false);
  };

  const handleDailyLogDragStart = (e: React.DragEvent, date: string, type: 'sleep' | 'symptoms') => {
    e.stopPropagation();
    setDraggedDailyLog({ date, type });
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', `${type}-${date}`);
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '0.5';
    }
  };

  const handleRemoveDailyLog = async (date: string, type: 'sleep' | 'symptoms') => {
    try {
      const existingLog = dailyLogs.get(date);
      if (!existingLog) return;

      // Update the log to clear either sleep or symptoms
      const updateData: any = {
        user_id: USER_ID,
        log_date: date
      };

      if (type === 'sleep') {
        updateData.sleep_hours = null;
        updateData.sleep_quality = null;
        updateData.sleep_notes = null;
        // Keep symptoms
        updateData.symptoms = existingLog.symptoms;
        updateData.symptom_severity = existingLog.symptom_severity;
        updateData.symptom_notes = existingLog.symptom_notes;
      } else {
        // Keep sleep
        updateData.sleep_hours = existingLog.sleep_hours;
        updateData.sleep_quality = existingLog.sleep_quality;
        updateData.sleep_notes = existingLog.sleep_notes;
        // Clear symptoms
        updateData.symptoms = null;
        updateData.symptom_severity = null;
        updateData.symptom_notes = null;
      }

      await upsertDailyLog(updateData);

      // Update local state
      const updatedLogs = new Map(dailyLogs);
      if (updateData.sleep_hours === null && updateData.symptoms === null) {
        // If both are null, remove the entry
        updatedLogs.delete(date);
      } else {
        // Update with new values
        updatedLogs.set(date, {
          ...existingLog,
          sleep_hours: updateData.sleep_hours,
          sleep_quality: updateData.sleep_quality,
          sleep_notes: updateData.sleep_notes,
          symptoms: updateData.symptoms,
          symptom_severity: updateData.symptom_severity,
          symptom_notes: updateData.symptom_notes
        });
      }
      setDailyLogs(updatedLogs);
    } catch (error) {
      console.error('Error removing daily log:', error);
      alert('Failed to remove log. Please try again.');
    }
  };

  const handleTrashDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setIsTrashHovered(true);
  };

  const handleTrashDragLeave = () => {
    setIsTrashHovered(false);
  };

  const handleTrashDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsTrashHovered(false);

    if (draggedFood) {
      await handleRemoveFood(draggedFood.day, draggedFood.mealType, draggedFood.foodId);
      setDraggedFood(null);
    } else if (draggedDailyLog) {
      await handleRemoveDailyLog(draggedDailyLog.date, draggedDailyLog.type);
      setDraggedDailyLog(null);
    }
  };

  if (loading) {
    return (
      <div className="week-view-loading">
        <div className="loading-spinner"></div>
        <p>Loading your meal plan...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="week-view-error">
        <p>Error: {error}</p>
        <button onClick={loadWeekMeals} className="retry-button">
          Retry
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="week-view-grid-container">
        {/* Grid Table */}
        <div className="week-grid-table">
          {/* Header Row with Meal Types */}
          <div className="grid-header">
            <div className="grid-cell header-cell day-header-cell">Day</div>
            {MEAL_TYPES.map(mealType => (
              <div key={mealType} className="grid-cell header-cell meal-type-header">
                {MEAL_LABELS[mealType]}
              </div>
            ))}
            <div className="grid-cell header-cell nutrients-header">Daily Nutrients</div>
            <div className="grid-cell header-cell rainbow-header">Eat a Rainbow</div>
          </div>

          {/* Day Rows */}
          {weekData.map((dayData) => {
            const today = new Date().toISOString().split('T')[0];
            const isToday = dayData.date === today;

            return (
            <div key={dayData.id} className={`grid-row ${isToday ? 'today-row' : ''}`}>
              {/* Day Label */}
              <div className="grid-cell day-label-cell">
                <div className="day-label-content">
                  <span className="day-label">{dayData.dayOfWeek}</span>
                  <span className="day-date">{new Date(dayData.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                </div>

                {/* Daily Stats (Sleep & Symptoms) - Below the date */}
                {dailyLogs.get(dayData.date) ? (
                  <div className="day-stats-inline">
                    {dailyLogs.get(dayData.date)!.sleep_hours && (
                      <div
                        className="stat-inline sleep-inline"
                        draggable
                        onDragStart={(e) => handleDailyLogDragStart(e, dayData.date, 'sleep')}
                        onDragEnd={handleDragEnd}
                        title="Drag to trash to delete"
                      >
                        Sleep: {dailyLogs.get(dayData.date)!.sleep_hours}h
                      </div>
                    )}
                    {dailyLogs.get(dayData.date)!.symptoms && dailyLogs.get(dayData.date)!.symptoms!.length > 0 && (
                      <div
                        className="stat-inline symptoms-inline"
                        draggable
                        onDragStart={(e) => handleDailyLogDragStart(e, dayData.date, 'symptoms')}
                        onDragEnd={handleDragEnd}
                        title="Drag to trash to delete"
                      >
                        {dailyLogs.get(dayData.date)!.symptoms!.join(', ')}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="day-stats-inline">
                    <div className="no-data-inline">No log</div>
                  </div>
                )}
              </div>

              {/* Meal Type Cells */}
              {MEAL_TYPES.map(mealType => {
                const meal = dayData.meals[mealType];
                const meals = meal?.items || [];
                const mealKey = `${dayData.id}-${mealType}`;
                const isExpanded = expandedMeals.has(mealKey);
                const maxVisibleItems = 2;
                const hasMoreItems = meals.length > maxVisibleItems;
                const visibleMeals = isExpanded ? meals : meals.slice(0, maxVisibleItems);
                const hiddenCount = meals.length - maxVisibleItems;

                return (
                  <div key={`${dayData.id}-${mealType}`} className="grid-cell meal-cell">
                    <div className="cell-meals-list">
                      {visibleMeals.map((food, foodIndex) => {
                        const rainbowColor = getRainbowColorHex(food.rainbowColor);
                        const hasColor = !!rainbowColor;

                        return (
                          <div
                            key={`${dayData.id}-${mealType}-${food.id}-${foodIndex}`}
                            className={`meal-tag ${food.hasWarnings ? "meal-warning" : ""} ${hasColor ? "meal-tag-colored" : ""}`}
                            draggable
                            onDragStart={(e) => handleDragStart(e, dayData, mealType, food.id)}
                            onDragEnd={handleDragEnd}
                            title={food.warningMessage || "Drag to trash to remove"}
                            style={hasColor ? {
                              borderColor: rainbowColor,
                              borderWidth: '2px'
                            } : {}}
                          >
                            {food.hasWarnings && (
                              <svg
                                className="warning-icon"
                                viewBox="0 0 16 16"
                                fill="none"
                                xmlns="http://www.w3.org/2000/svg"
                              >
                                <circle cx="8" cy="8" r="7" fill="#F59E0B"/>
                                <text x="8" y="12" fontSize="10" fontWeight="bold" fill="white" textAnchor="middle">!</text>
                              </svg>
                            )}
                            <span className="meal-tag-name">{food.name}</span>
                          </div>
                        );
                      })}
                      {hasMoreItems && !isExpanded && (
                        <button
                          className="more-items-badge"
                          onClick={() => toggleMealExpansion(dayData.id, mealType)}
                          title={`Click to see all ${meals.length} items`}
                        >
                          +{hiddenCount} more
                        </button>
                      )}
                      {hasMoreItems && isExpanded && (
                        <button
                          className="more-items-badge collapse-badge"
                          onClick={() => toggleMealExpansion(dayData.id, mealType)}
                          title="Click to collapse"
                        >
                          Show less
                        </button>
                      )}
                      <button
                        className="add-more-btn"
                        onClick={() => handleAddFoodClick(dayData.dayOfWeek, mealType)}
                        title={`Add ${MEAL_LABELS[mealType]} for ${dayData.dayOfWeek}`}
                      >
                        +
                      </button>
                    </div>
                  </div>
                );
              })}

              {/* Nutrients Summary Cell */}
              <div className="grid-cell nutrients-cell">
                {(() => {
                  const nutrients = getDailyNutrientsWithFrequency(dayData);
                  if (nutrients.length === 0) {
                    return <div className="no-nutrients-message">No foods added yet</div>;
                  }
                  return nutrients.map(({ nutrient, count }) => (
                    <div
                      key={nutrient}
                      className="nutrient-badge"
                      style={{
                        fontSize: count === 1 ? '0.7rem' : count === 2 ? '0.8rem' : '0.9rem',
                        fontWeight: count === 1 ? 600 : count === 2 ? 700 : 800
                      }}
                      title={`Present in ${count} meal${count > 1 ? 's' : ''}`}
                    >
                      {nutrient}
                    </div>
                  ));
                })()}
              </div>

              {/* Rainbow Cell */}
              <div className="grid-cell rainbow-cell">
                {(() => {
                  const consumedColors = getRainbowColors(dayData);

                  // Angles for upper semicircle: -180 (left) to 0 (right)
                  // Divide 180 degrees by 5 colors = 36 degrees per segment
                  // Center angles: -180 + 18, -180 + 54, -180 + 90, -180 + 126, -180 + 162
                  const rainbowColors = [
                    { name: 'Red', color: '#E53E3E', angle: -162 },           // Left-most
                    { name: 'Orange/Yellow', color: '#EAA221', angle: -126 },
                    { name: 'Green', color: '#38A169', angle: -90 },          // Top center
                    { name: 'Blue/Purple', color: '#805AD5', angle: -54 },
                    { name: 'White/Brown', color: '#A0AEC0', angle: -18 }     // Right-most
                  ];

                  return (
                    <svg viewBox="0 0 200 110" className="rainbow-chart">
                      {rainbowColors.map((segment) => {
                        const isConsumed = consumedColors.has(segment.name);
                        const segmentWidth = 18; // 180 degrees / 5 colors / 2
                        const startAngle = segment.angle - segmentWidth;
                        const endAngle = segment.angle + segmentWidth;
                        const radius = 90;
                        const innerRadius = 40;

                        // Convert angles to radians
                        const startRad = (startAngle * Math.PI) / 180;
                        const endRad = (endAngle * Math.PI) / 180;

                        // Calculate arc path
                        const x1 = 100 + radius * Math.cos(startRad);
                        const y1 = 100 + radius * Math.sin(startRad);
                        const x2 = 100 + radius * Math.cos(endRad);
                        const y2 = 100 + radius * Math.sin(endRad);
                        const x3 = 100 + innerRadius * Math.cos(endRad);
                        const y3 = 100 + innerRadius * Math.sin(endRad);
                        const x4 = 100 + innerRadius * Math.cos(startRad);
                        const y4 = 100 + innerRadius * Math.sin(startRad);

                        const path = `
                          M ${x1} ${y1}
                          A ${radius} ${radius} 0 0 1 ${x2} ${y2}
                          L ${x3} ${y3}
                          A ${innerRadius} ${innerRadius} 0 0 0 ${x4} ${y4}
                          Z
                        `;

                        return (
                          <path
                            key={segment.name}
                            d={path}
                            fill={isConsumed ? segment.color : '#E8E8E8'}
                            opacity={isConsumed ? 1 : 0.3}
                            stroke="white"
                            strokeWidth="2"
                          >
                            <title>{segment.name}{isConsumed ? ' ✓' : ''}</title>
                          </path>
                        );
                      })}
                      {/* Center circle */}
                      <circle cx="100" cy="100" r="35" fill="white" />
                      {/* Score text */}
                      <text
                        x="100"
                        y="100"
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fontSize="24"
                        fontWeight="bold"
                        fill="#4A5568"
                      >
                        {consumedColors.size}
                      </text>
                      <text
                        x="100"
                        y="115"
                        textAnchor="middle"
                        fontSize="10"
                        fill="#718096"
                      >
                        of 5
                      </text>
                    </svg>
                  );
                })()}

                {/* Trash Drop Zone - Visible when dragging food on today's row OR when dragging daily log from this day */}
                {((isToday && draggedFood) || (draggedDailyLog && draggedDailyLog.date === dayData.date)) && (
                  <div
                    className={`trash-drop-zone-inline ${isTrashHovered ? 'trash-hovered' : ''}`}
                    onDragOver={handleTrashDragOver}
                    onDragLeave={handleTrashDragLeave}
                    onDrop={handleTrashDrop}
                  >
                    <svg
                      className="trash-icon"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="3 6 5 6 21 6"></polyline>
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                      <line x1="10" y1="11" x2="10" y2="17"></line>
                      <line x1="14" y1="11" x2="14" y2="17"></line>
                    </svg>
                    <span className="trash-label">Drop to delete</span>
                  </div>
                )}
              </div>
            </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="nutrition-legend">
          <div className="legend-title">Tips:</div>
          <div className="legend-items">
            <div className="legend-item">
              <span>• Drag food items to the trash icon to remove them</span>
            </div>
            <div className="legend-item">
              <span>• Foods with amber background have safety warnings</span>
            </div>
            <div className="legend-item">
              <span>• Nutrient badges get larger when present in more meals</span>
            </div>
          </div>
        </div>
      </div>

      {/* Food Search Modal */}
      {selectedDay && selectedMealType && (
        <FoodSearchModal
          isOpen={isModalOpen}
          onClose={() => {
            setIsModalOpen(false);
            setSelectedDay(null);
            setSelectedMealType(null);
          }}
          onSelectFood={handleSelectFood}
          selectedDay={selectedDay}
          selectedMealType={selectedMealType}
        />
      )}
    </>
  );
}
