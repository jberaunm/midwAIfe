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
  skip_save_user_message?: boolean;
}

export interface ChatResponse {
  success: boolean;
  response: string;
  user_id: string;
  session_id: string;
  error?: string;
}

export async function chatWithAgent(request: ChatRequest): Promise<ChatResponse> {
  console.log('[API] chatWithAgent called:', { message: request.message.substring(0, 50), userId: request.user_id });
  const response = await fetchApi('/api/agent/chat', {
    method: 'POST',
    body: JSON.stringify(request),
  });
  console.log('[API] chatWithAgent response:', { success: response.success, userId: response.user_id });
  return response;
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

// ============================================================================
// BABY NAMES
// ============================================================================

export type NameGender = 'boy' | 'girl' | 'either';
export type NameStatus = 'top' | 'shortlisted' | 'rejected';
export type NameSource = 'parent' | 'ai';

export interface NamePreferences {
  user_id: string;
  gender: NameGender;
  notes: string | null;
  updated_at: string | null;
}

export interface NamePreferencesUpsert {
  gender: NameGender;
  notes?: string | null;
}

export interface NameCandidate {
  id: string;
  user_id: string;
  name: string;
  origin: string | null;
  meaning: string | null;
  notes: string | null;
  status: NameStatus;
  rank: number | null;
  source: NameSource;
  created_at: string;
  updated_at: string | null;
}

export interface NameCandidateCreate {
  name: string;
  origin?: string | null;
  meaning?: string | null;
  notes?: string | null;
  status?: NameStatus;
  source?: NameSource;
}

export async function getNamePreferences(userId: string): Promise<NamePreferences> {
  return fetchApi(`/api/names/preferences/${userId}`);
}

export async function upsertNamePreferences(
  userId: string,
  prefs: NamePreferencesUpsert,
): Promise<NamePreferences> {
  return fetchApi(`/api/names/preferences/${userId}`, {
    method: 'PUT',
    body: JSON.stringify(prefs),
  });
}

export async function getNameCandidates(
  userId: string,
  status?: NameStatus,
): Promise<NameCandidate[]> {
  const url = status
    ? `/api/names/candidates/${userId}?status=${status}`
    : `/api/names/candidates/${userId}`;
  return fetchApi(url);
}

export async function addNameCandidate(
  userId: string,
  data: NameCandidateCreate,
): Promise<NameCandidate> {
  return fetchApi(`/api/names/candidates/${userId}`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateNameStatus(
  userId: string,
  candidateId: string,
  status: NameStatus,
): Promise<NameCandidate> {
  return fetchApi(`/api/names/candidates/${userId}/${candidateId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

export async function reorderNameCandidates(
  userId: string,
  status: 'top' | 'shortlisted',
  orderedIds: string[],
): Promise<NameCandidate[]> {
  return fetchApi(`/api/names/candidates/${userId}/reorder`, {
    method: 'POST',
    body: JSON.stringify({ status, ordered_ids: orderedIds }),
  });
}

export async function deleteNameCandidate(
  userId: string,
  candidateId: string,
): Promise<void> {
  return fetchApi(`/api/names/candidates/${userId}/${candidateId}`, {
    method: 'DELETE',
  });
}

export interface NameSuggestionItem {
  name: string;
  origin: string | null;
  meaning: string | null;
}

export interface NameSuggestionResponse {
  suggestions: NameSuggestionItem[];
  message_id: string;
  message_content: string;
}

export async function suggestNames(userId: string): Promise<NameSuggestionResponse> {
  return fetchApi(`/api/names/suggest/${userId}`, {
    method: 'POST',
  });
}

// ============================================================================
// BABY ESSENTIALS
// ============================================================================

export type EssentialCategory =
  | 'Sleep' | 'Feeding' | 'Clothing' | 'Bath'
  | 'Gear' | 'Health' | 'Travel' | 'Nursery';
export type EssentialStatus = 'needed' | 'bought' | 'skipped';
export type EssentialSource = 'parent' | 'ai';
export type EssentialSecondhand = 'yes' | 'no' | 'no_preference';

export interface EssentialPreferences {
  user_id: string;
  accept_secondhand: EssentialSecondhand;
  notes: string | null;
  updated_at: string | null;
}

export interface EssentialPreferencesUpsert {
  accept_secondhand: EssentialSecondhand;
  notes?: string | null;
}

export interface EssentialItem {
  id: string;
  user_id: string;
  name: string;
  category: EssentialCategory;
  status: EssentialStatus;
  is_must_have: boolean;
  estimated_cost: number | null;
  purchase_url: string | null;
  notes: string | null;
  source: EssentialSource;
  created_at: string;
  updated_at: string | null;
}

export interface EssentialItemCreate {
  name: string;
  category: EssentialCategory;
  status?: EssentialStatus;
  is_must_have?: boolean;
  estimated_cost?: number | null;
  purchase_url?: string | null;
  notes?: string | null;
  source?: EssentialSource;
}

export interface EssentialItemUpdate {
  name?: string;
  category?: EssentialCategory;
  status?: EssentialStatus;
  is_must_have?: boolean;
  estimated_cost?: number | null;
  purchase_url?: string | null;
  notes?: string | null;
  // Sentinels — pass true to explicitly null a nullable field
  // (since `undefined` means "leave unchanged")
  clear_estimated_cost?: boolean;
  clear_purchase_url?: boolean;
  clear_notes?: boolean;
}

export async function getEssentialPreferences(
  userId: string,
): Promise<EssentialPreferences> {
  return fetchApi(`/api/essentials/preferences/${userId}`);
}

export async function upsertEssentialPreferences(
  userId: string,
  prefs: EssentialPreferencesUpsert,
): Promise<EssentialPreferences> {
  return fetchApi(`/api/essentials/preferences/${userId}`, {
    method: 'PUT',
    body: JSON.stringify(prefs),
  });
}

export async function getEssentialItems(
  userId: string,
  status?: EssentialStatus,
): Promise<EssentialItem[]> {
  const url = status
    ? `/api/essentials/items/${userId}?status=${status}`
    : `/api/essentials/items/${userId}`;
  return fetchApi(url);
}

export async function addEssentialItem(
  userId: string,
  data: EssentialItemCreate,
): Promise<EssentialItem> {
  return fetchApi(`/api/essentials/items/${userId}`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateEssentialItem(
  userId: string,
  itemId: string,
  data: EssentialItemUpdate,
): Promise<EssentialItem> {
  return fetchApi(`/api/essentials/items/${userId}/${itemId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function deleteEssentialItem(
  userId: string,
  itemId: string,
): Promise<void> {
  return fetchApi(`/api/essentials/items/${userId}/${itemId}`, {
    method: 'DELETE',
  });
}

export interface EssentialSuggestionItem {
  name: string;
  category?: EssentialCategory | null;
  estimated_cost?: number | null;
  description?: string | null;
}

export interface EssentialSuggestionResponse {
  suggestions: EssentialSuggestionItem[];
  message_id: string;
  message_content: string;
}

export async function suggestEssentials(userId: string): Promise<EssentialSuggestionResponse> {
  return fetchApi(`/api/essentials/suggest/${userId}`, {
    method: 'POST',
  });
}

export async function getLatestSuggestions(userId: string): Promise<{
  success: boolean;
  suggestions: EssentialSuggestionItem[];
  timestamp?: string;
  message?: string;
}> {
  return fetchApi(`/api/essentials/latest-suggestions/${userId}`);
}
