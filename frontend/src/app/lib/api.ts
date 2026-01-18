/**
 * API client for backend communication
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

async function fetchApi(endpoint: string, options: RequestInit = {}) {
  const url = `${API_BASE_URL}${endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
    throw new ApiError(response.status, error.detail || 'API request failed');
  }

  return response.json();
}

// ============================================================================
// FOOD ITEMS
// ============================================================================

export async function getAllFoods() {
  return fetchApi('/api/meals/foods');
}

export async function searchFoods(query: string) {
  return fetchApi(`/api/meals/foods?q=${encodeURIComponent(query)}`);
}

export async function getFoodById(foodId: string) {
  return fetchApi(`/api/meals/foods/${foodId}`);
}

export async function createFood(food: any) {
  return fetchApi('/api/meals/foods', {
    method: 'POST',
    body: JSON.stringify(food),
  });
}

// ============================================================================
// MEALS
// ============================================================================

export async function getWeekMeals(userId: string, startDate: string) {
  return fetchApi(`/api/meals/week?user_id=${userId}&start_date=${startDate}`);
}

export async function getMealsByDateRange(userId: string, startDate: string, endDate: string) {
  return fetchApi(`/api/meals/range?user_id=${userId}&start_date=${startDate}&end_date=${endDate}`);
}

export async function upsertMeal(mealData: {
  userId: string;
  date: string;
  dayOfWeek: string;
  mealType: string;
  foodItemIds: string[];
}) {
  return fetchApi('/api/meals/upsert', {
    method: 'POST',
    body: JSON.stringify(mealData),
  });
}

export async function addMealItem(itemData: {
  userId: string;
  date: string;
  dayOfWeek: string;
  mealType: string;
  foodItemId: string;
}) {
  return fetchApi('/api/meals/add-item', {
    method: 'POST',
    body: JSON.stringify(itemData),
  });
}

export async function removeMealItem(mealId: string, foodItemId: string) {
  return fetchApi(`/api/meals/item?meal_id=${mealId}&food_item_id=${foodItemId}`, {
    method: 'DELETE',
  });
}

export async function deleteMeal(mealId: string) {
  return fetchApi(`/api/meals/${mealId}`, {
    method: 'DELETE',
  });
}

// ============================================================================
// MILESTONES
// ============================================================================

export async function getMilestone(weekNumber: number) {
  return fetchApi(`/api/meals/milestones/${weekNumber}`);
}

export async function getAllMilestones() {
  return fetchApi('/api/meals/milestones');
}

// ============================================================================
// USERS
// ============================================================================

export async function getUser(userId: string) {
  return fetchApi(`/api/users/${userId}`);
}

// ============================================================================
// AGENT
// ============================================================================

export interface ChatRequest {
  message: string;
  user_id?: string;
  session_id?: string;
}

export interface ChatResponse {
  success: boolean;
  response: string;
  user_id: string;
  session_id: string;
  error?: string;
}

export async function chatWithAgent(request: ChatRequest): Promise<ChatResponse> {
  return fetchApi('/api/agent/chat', {
    method: 'POST',
    body: JSON.stringify(request),
  });
}

export async function getAgentHealth() {
  return fetchApi('/api/agent/health');
}

export interface GreetingResponse {
  greeting: string;
  is_new: boolean;
  message_id: string;
}

export async function getDailyGreeting(userId: string): Promise<GreetingResponse> {
  return fetchApi(`/api/agent/greeting/${userId}`);
}

export interface MessageHistoryResponse {
  messages: Array<{
    id: string;
    user_id: string;
    session_id: string;
    role: 'user' | 'model' | 'system';
    content: string;
    message_date: string;
    created_at: string;
    metadata: Record<string, any>;
  }>;
  count: number;
}

export async function getMessageHistory(
  userId: string,
  limit: number = 50,
  sinceDate?: string
): Promise<MessageHistoryResponse> {
  let url = `/api/agent/messages/${userId}?limit=${limit}`;
  if (sinceDate) {
    url += `&since_date=${sinceDate}`;
  }
  return fetchApi(url);
}

// ============================================================================
// DAILY LOGS (Sleep & Symptoms)
// ============================================================================

export interface DailyLog {
  id: string;
  user_id: string;
  log_date: string;
  sleep_hours: number | null;
  sleep_quality: 'poor' | 'fair' | 'good' | 'excellent' | null;
  sleep_notes: string | null;
  symptoms: string[] | null;
  symptom_severity: 'mild' | 'moderate' | 'severe' | null;
  symptom_notes: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface DailyLogCreate {
  user_id: string;
  log_date: string;
  sleep_hours?: number | null;
  sleep_quality?: 'poor' | 'fair' | 'good' | 'excellent' | null;
  sleep_notes?: string | null;
  symptoms?: string[] | null;
  symptom_severity?: 'mild' | 'moderate' | 'severe' | null;
  symptom_notes?: string | null;
}

export interface DailyLogUpdate {
  sleep_hours?: number | null;
  sleep_quality?: 'poor' | 'fair' | 'good' | 'excellent' | null;
  sleep_notes?: string | null;
  symptoms?: string[] | null;
  symptom_severity?: 'mild' | 'moderate' | 'severe' | null;
  symptom_notes?: string | null;
}

export async function getDailyLog(userId: string, logDate: string): Promise<DailyLog> {
  return fetchApi(`/api/daily-logs/${userId}/${logDate}`);
}

export async function getDailyLogsRange(
  userId: string,
  startDate: string,
  endDate: string
): Promise<DailyLog[]> {
  return fetchApi(`/api/daily-logs/${userId}?start_date=${startDate}&end_date=${endDate}`);
}

export async function createDailyLog(logData: DailyLogCreate): Promise<DailyLog> {
  return fetchApi('/api/daily-logs/', {
    method: 'POST',
    body: JSON.stringify(logData),
  });
}

export async function updateDailyLog(
  userId: string,
  logDate: string,
  logData: DailyLogUpdate
): Promise<DailyLog> {
  return fetchApi(`/api/daily-logs/${userId}/${logDate}`, {
    method: 'PUT',
    body: JSON.stringify(logData),
  });
}

export async function upsertDailyLog(logData: DailyLogCreate): Promise<DailyLog> {
  return fetchApi('/api/daily-logs/upsert', {
    method: 'POST',
    body: JSON.stringify(logData),
  });
}

export async function deleteDailyLog(userId: string, logDate: string): Promise<void> {
  return fetchApi(`/api/daily-logs/${userId}/${logDate}`, {
    method: 'DELETE',
  });
}
