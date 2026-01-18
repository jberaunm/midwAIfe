"use client";
import React, { useRef, useEffect, useState } from "react";
import ChatAssistant from "./components/ChatAssistant";
import WeekView from "./components/WeekView";
import { getMilestone, getUser } from "./lib/api";

interface WeekMilestone {
  id: string;
  weekNumber: number;
  nhsSizeComparison: string | null;
  developmentMilestone: string;
  nutritionalFocusColor: string | null;
  keyNutrient: string | null;
  actionTip: string | null;
  sourceUrl: string | null;
}

interface User {
  id: string;
  email: string;
  firstName: string;
  dueDate: string | null;
  lastPeriodDate: string | null;
  dietaryRestrictions: string[];
  preferredUnit: string;
  dailyCaffeineLimit: number;
  notificationOptIn: boolean;
  createdAt: string;
  updatedAt: string | null;
}

// Hardcoded test user ID
const TEST_USER_ID = "00000000-0000-0000-0000-000000000001";

// Calculate pregnancy week from due date
function calculatePregnancyWeek(dueDate: string | null): number {
  if (!dueDate) return 14; // Default fallback

  const due = new Date(dueDate);
  const today = new Date();

  // Calculate days difference
  const diffTime = due.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  // Full term is 280 days (40 weeks), calculate current week
  const daysPregnant = 280 - diffDays;
  const weeksPregnant = Math.floor(daysPregnant / 7);

  // Clamp between 1 and 42 weeks
  return Math.max(1, Math.min(42, weeksPregnant));
}

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [milestone, setMilestone] = useState<WeekMilestone | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [currentWeek, setCurrentWeek] = useState(14);
  const [actualWeek, setActualWeek] = useState(14); // User's actual current week

  useEffect(() => {
    const fetchUserAndMilestone = async () => {
      try {
        setIsLoading(true);

        // Fetch user data
        const userData = await getUser(TEST_USER_ID);
        setUser(userData);

        // Calculate current pregnancy week
        const week = calculatePregnancyWeek(userData.dueDate);
        setActualWeek(week);
        setCurrentWeek(week);

        // Fetch milestone for current week
        const milestoneData = await getMilestone(week);
        setMilestone(milestoneData);
      } catch (error) {
        console.error("Failed to fetch user or milestone:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchUserAndMilestone();
  }, []);

  // Handle week navigation
  const handlePreviousWeek = async () => {
    if (currentWeek > 1) {
      const newWeek = currentWeek - 1;
      setCurrentWeek(newWeek);
      try {
        const milestoneData = await getMilestone(newWeek);
        setMilestone(milestoneData);
      } catch (error) {
        console.error("Failed to fetch milestone:", error);
      }
    }
  };

  const handleNextWeek = async () => {
    if (currentWeek < 42) {
      const newWeek = currentWeek + 1;
      setCurrentWeek(newWeek);
      try {
        const milestoneData = await getMilestone(newWeek);
        setMilestone(milestoneData);
      } catch (error) {
        console.error("Failed to fetch milestone:", error);
      }
    }
  };

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="safety-header">
          {isLoading ? (
            <div className="milestone-info">
              <div className="milestone-text">Loading your information...</div>
            </div>
          ) : user && milestone ? (
            <>
              <div className="milestone-info">
                <div className="week-navigation-container">
                  <div className="milestone-badge-large">Week {currentWeek}</div>
                  <div className="week-navigation-buttons">
                    <button
                      className="week-nav-button"
                      onClick={handlePreviousWeek}
                      disabled={currentWeek <= 1}
                      title="Previous week"
                    >
                      ‹
                    </button>
                    <button
                      className="week-nav-button"
                      onClick={handleNextWeek}
                      disabled={currentWeek >= 42}
                      title="Next week"
                    >
                      ›
                    </button>
                  </div>
                </div>
                <div className="milestone-text">
                  {milestone.nhsSizeComparison && (
                    <div className="milestone-detail">
                      <strong>Baby&apos;s size:</strong> {milestone.nhsSizeComparison}
                    </div>
                  )}
                  <div className="milestone-detail">
                    <strong>Development:</strong> {milestone.developmentMilestone}
                  </div>
                </div>
              </div>
              <div className="nutrition-focus">
                <div className="focus-label-large">
                  {milestone.nutritionalFocusColor ? (
                    <>Priority: {milestone.nutritionalFocusColor} Foods</>
                  ) : (
                    <>Priority Nutrient</>
                  )}
                </div>
                <div className="focus-content-large">
                  {milestone.keyNutrient && (
                    <strong>{milestone.keyNutrient}</strong>
                  )}
                  {milestone.actionTip && (
                    <span className="focus-goal-large">{milestone.actionTip}</span>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="milestone-info">
              <div className="milestone-text">Unable to load your information</div>
            </div>
          )}
        </div>
      </header>

      <main className="main-layout">
        <div className="week-column">
          <WeekView selectedWeek={currentWeek} actualWeek={actualWeek} />
        </div>

        <div className="chat-column">
          <ChatAssistant userId={user?.id} />
        </div>
      </main>
    </div>
  );
}
