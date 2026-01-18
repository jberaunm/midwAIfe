"use client";
import React, { useState, useEffect, useCallback } from "react";
import { searchFoods, getAllFoods } from "../lib/api";
import type { FoodItem } from "../types/nutrition";

interface FoodSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectFood: (food: FoodItem) => void;
  selectedDay: string;
  selectedMealType: string;
}

export default function FoodSearchModal({
  isOpen,
  onClose,
  onSelectFood,
  selectedDay,
  selectedMealType,
}: FoodSearchModalProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [foods, setFoods] = useState<FoodItem[]>([]);
  const [filteredFoods, setFilteredFoods] = useState<FoodItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load all foods on mount
  useEffect(() => {
    if (isOpen) {
      loadFoods();
    }
  }, [isOpen]);

  // Filter foods based on search query
  useEffect(() => {
    if (searchQuery.trim()) {
      performSearch(searchQuery);
    } else {
      setFilteredFoods(foods);
    }
  }, [searchQuery, foods]);

  const loadFoods = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getAllFoods();
      setFoods(data);
      setFilteredFoods(data);
    } catch (err: any) {
      setError(err.message || "Failed to load foods");
    } finally {
      setLoading(false);
    }
  };

  const performSearch = async (query: string) => {
    if (!query.trim()) {
      setFilteredFoods(foods);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const data = await searchFoods(query);
      setFilteredFoods(data);
    } catch (err: any) {
      setError(err.message || "Search failed");
      // Fallback to client-side filtering
      const filtered = foods.filter((food) =>
        food.name.toLowerCase().includes(query.toLowerCase())
      );
      setFilteredFoods(filtered);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectFood = (food: FoodItem) => {
    onSelectFood(food);
    setSearchQuery("");
    onClose();
  };

  const handleClose = () => {
    setSearchQuery("");
    onClose();
  };

  if (!isOpen) return null;

  const getMealTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      breakfast: "Breakfast",
      snack1: "Snack 1",
      lunch: "Lunch",
      snack2: "Snack 2",
      dinner: "Dinner",
    };
    return labels[type] || type;
  };

  const getNutrientBadges = (food: FoodItem) => {
    const badges = [];
    if (food.containsMicronutrients.calcium) badges.push("Calcium");
    if (food.containsMicronutrients.iron) badges.push("Iron");
    if (food.containsMicronutrients.folicAcid) badges.push("Folic Acid");
    if (food.containsMicronutrients.protein) badges.push("Protein");
    if (food.containsMicronutrients.vitaminD) badges.push("Vitamin D");
    if (food.containsMicronutrients.omega3) badges.push("Omega-3");
    if (food.containsMicronutrients.fiber) badges.push("Fiber");
    return badges;
  };

  return (
    <div className="meal-input-modal" onClick={handleClose}>
      <div
        className="meal-input-content food-search-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <h3>Add Food to {getMealTypeLabel(selectedMealType)}</h3>
            <p className="modal-subtitle">{selectedDay}</p>
          </div>
          <button className="modal-close-btn" onClick={handleClose}>
            ×
          </button>
        </div>

        <div className="search-input-container">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search foods (e.g., spinach, salmon, eggs)..."
            autoFocus
            className="food-search-input"
          />
        </div>

        {error && <div className="error-message">{error}</div>}

        <div className="food-list-container">
          {loading ? (
            <div className="loading-message">Loading foods...</div>
          ) : filteredFoods.length === 0 ? (
            <div className="no-results-message">
              {searchQuery
                ? `No foods found matching "${searchQuery}"`
                : "No foods available"}
            </div>
          ) : (
            <div className="food-list">
              {filteredFoods.map((food) => (
                <div
                  key={food.id}
                  className={`food-item ${
                    food.hasWarnings ? "food-item-warning" : ""
                  }`}
                  onClick={() => handleSelectFood(food)}
                >
                  <div className="food-item-header">
                    <div className="food-item-title">
                      <span className="food-name">{food.name}</span>
                      {food.portion && (
                        <span className="food-portion">({food.portion})</span>
                      )}
                      {food.rainbowColor && (
                        <span
                          className={`color-badge color-${food.rainbowColor.toLowerCase()}`}
                        >
                          {food.rainbowColor}
                        </span>
                      )}
                    </div>
                    {food.hasWarnings && (
                      <span className="warning-badge" title={food.warningMessage}>
                        !
                      </span>
                    )}
                  </div>

                  {food.description && (
                    <div className="food-description">{food.description}</div>
                  )}

                  <div className="food-nutrients">
                    {getNutrientBadges(food).map((nutrient) => (
                      <span key={nutrient} className="nutrient-badge">
                        {nutrient}
                      </span>
                    ))}
                  </div>

                  {food.hasWarnings && food.warningMessage && (
                    <div className="food-warning-message">
                      ⚠️ {food.warningMessage}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
