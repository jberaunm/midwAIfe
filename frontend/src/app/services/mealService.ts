import { query, getClient } from '../lib/db';
import type { FoodItem, Meal, DayData } from '../types/nutrition';

// ============================================================================
// FOOD ITEMS CRUD
// ============================================================================

export const foodItemsService = {
  /**
   * Get all food items from the catalog
   */
  async getAll(): Promise<FoodItem[]> {
    const result = await query(
      'SELECT * FROM foods ORDER BY name'
    );
    return result.rows.map(dbRowToFoodItem);
  },

  /**
   * Search food items by name
   */
  async search(searchQuery: string): Promise<FoodItem[]> {
    const result = await query(
      'SELECT * FROM foods WHERE name ILIKE $1 ORDER BY name LIMIT 20',
      [`%${searchQuery}%`]
    );
    return result.rows.map(dbRowToFoodItem);
  },

  /**
   * Get a single food item by ID
   */
  async getById(id: string): Promise<FoodItem | null> {
    const result = await query(
      'SELECT * FROM foods WHERE id = $1',
      [id]
    );
    return result.rows.length > 0 ? dbRowToFoodItem(result.rows[0]) : null;
  },

  /**
   * Create a new food item (admin only)
   */
  async create(item: Omit<FoodItem, 'id'>): Promise<FoodItem> {
    const result = await query(
      `INSERT INTO foods (
        name, portion, macro_category, rainbow_color, phytonutrient_focus,
        is_safe_pregnancy, warning_message, warning_type, tags, description
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *`,
      [
        item.name,
        item.portion,
        item.macroCategory,
        item.rainbowColor,
        item.phytonutrientFocus,
        !item.hasWarnings,
        item.warningMessage,
        item.warningType,
        item.tags,
        item.description,
      ]
    );

    const foodId = result.rows[0].id;

    // Insert nutrient mappings if provided
    if (item.containsMicronutrients) {
      await insertNutrientMappings(foodId, item.containsMicronutrients);
    }

    return dbRowToFoodItem(result.rows[0]);
  },
};

// ============================================================================
// MEALS CRUD
// ============================================================================

export const mealsService = {
  /**
   * Get all meals for a specific date range
   */
  async getByDateRange(userId: string, startDate: string, endDate: string): Promise<DayData[]> {
    const result = await query(
      `SELECT
        m.id as meal_id,
        m.meal_date,
        m.day_of_week,
        m.meal_type,
        m.notes as meal_notes,
        mi.id as meal_item_id,
        mi.sort_order,
        mi.symptom_notes,
        f.*
      FROM meals m
      LEFT JOIN meal_items mi ON m.id = mi.meal_id
      LEFT JOIN foods f ON mi.food_id = f.id
      WHERE m.user_id = $1
        AND m.meal_date >= $2
        AND m.meal_date <= $3
      ORDER BY m.meal_date, m.meal_type, mi.sort_order`,
      [userId, startDate, endDate]
    );

    // Get nutrient mappings for all foods
    const foodIds = [...new Set(result.rows.map(row => row.id).filter(Boolean))];
    const nutrientsMap = await getFoodNutrientsMap(foodIds);

    // Group meals by date
    const dayMap = new Map<string, DayData>();

    result.rows.forEach((row: any) => {
      const dateKey = row.meal_date;

      if (!dayMap.has(dateKey)) {
        dayMap.set(dateKey, {
          id: dateKey,
          date: row.meal_date,
          dayOfWeek: row.day_of_week,
          meals: {
            breakfast: null,
            snack1: null,
            lunch: null,
            snack2: null,
            dinner: null,
          },
          dailySummary: {
            calcium: { covered: false, mealsCovered: [], status: 'missing' },
            iron: { covered: false, mealsCovered: [], status: 'missing' },
            folicAcid: { covered: false, mealsCovered: [], status: 'missing' },
            protein: { covered: false, mealsCovered: [], status: 'missing' },
            hasWarnings: false,
            missingNutrients: [],
          },
        });
      }

      const dayData = dayMap.get(dateKey)!;
      const mealTypeKey = mapMealTypeToKey(row.meal_type);

      // Initialize meal if not exists
      if (!dayData.meals[mealTypeKey]) {
        dayData.meals[mealTypeKey] = {
          id: row.meal_id,
          type: row.meal_type,
          items: [],
          containsMicronutrients: {
            calcium: false,
            iron: false,
            folicAcid: false,
            protein: false,
          },
          notes: row.meal_notes,
        };
      }

      // Add food item if exists
      if (row.id) {
        const foodItem = dbRowToFoodItem(row, nutrientsMap.get(row.id));
        dayData.meals[mealTypeKey]!.items.push(foodItem);
      }
    });

    // Calculate aggregate nutrients for each meal
    dayMap.forEach(dayData => {
      Object.values(dayData.meals).forEach(meal => {
        if (meal) {
          meal.containsMicronutrients = aggregateMicronutrients(meal.items);
        }
      });
    });

    return Array.from(dayMap.values());
  },

  /**
   * Get meals for a specific week
   */
  async getWeek(userId: string, startDate: string): Promise<DayData[]> {
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 6);
    return this.getByDateRange(userId, startDate, endDate.toISOString().split('T')[0]);
  },

  /**
   * Create or update a meal
   */
  async upsert(
    userId: string,
    date: string,
    dayOfWeek: string,
    mealType: string,
    foodItemIds: string[]
  ): Promise<void> {
    const client = await getClient();

    try {
      await client.query('BEGIN');

      // Upsert meal
      const mealResult = await client.query(
        `INSERT INTO meals (user_id, log_date, day_of_week, meal_type)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id, log_date, meal_type)
         DO UPDATE SET day_of_week = EXCLUDED.day_of_week, updated_at = NOW()
         RETURNING id`,
        [userId, date, dayOfWeek, mealType]
      );

      const mealId = mealResult.rows[0].id;

      // Delete existing meal items
      await client.query(
        'DELETE FROM meal_items WHERE meal_id = $1',
        [mealId]
      );

      // Insert new meal items
      if (foodItemIds.length > 0) {
        const values = foodItemIds.map((foodItemId, index) =>
          `('${mealId}', '${foodItemId}', ${index})`
        ).join(', ');

        await client.query(
          `INSERT INTO meal_items (meal_id, food_id, sort_order) VALUES ${values}`
        );
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  },

  /**
   * Add a food item to a meal
   */
  async addFoodItem(
    userId: string,
    date: string,
    dayOfWeek: string,
    mealType: string,
    foodItemId: string
  ): Promise<void> {
    const client = await getClient();

    try {
      await client.query('BEGIN');

      // Get or create meal
      const mealResult = await client.query(
        `INSERT INTO meals (user_id, log_date, day_of_week, meal_type)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id, log_date, meal_type)
         DO UPDATE SET day_of_week = EXCLUDED.day_of_week, updated_at = NOW()
         RETURNING id`,
        [userId, date, dayOfWeek, mealType]
      );

      const mealId = mealResult.rows[0].id;

      // Get current max sort order
      const sortResult = await client.query(
        'SELECT COALESCE(MAX(sort_order), -1) + 1 as next_order FROM meal_items WHERE meal_id = $1',
        [mealId]
      );

      const nextSortOrder = sortResult.rows[0].next_order;

      // Add the food item
      await client.query(
        'INSERT INTO meal_items (meal_id, food_id, sort_order) VALUES ($1, $2, $3)',
        [mealId, foodItemId, nextSortOrder]
      );

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  },

  /**
   * Remove a food item from a meal
   */
  async removeFoodItem(mealId: string, foodItemId: string): Promise<void> {
    await query(
      'DELETE FROM meal_items WHERE meal_id = $1 AND food_id = $2',
      [mealId, foodItemId]
    );
  },

  /**
   * Delete an entire meal
   */
  async delete(mealId: string): Promise<void> {
    await query(
      'DELETE FROM meals WHERE id = $1',
      [mealId]
    );
  },
};

// ============================================================================
// WEEKLY MILESTONES
// ============================================================================

export const milestonesService = {
  /**
   * Get milestone for a specific pregnancy week
   */
  async getByWeek(weekNumber: number) {
    const result = await query(
      'SELECT * FROM weekly_milestones WHERE week_number = $1',
      [weekNumber]
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  },

  /**
   * Get all milestones
   */
  async getAll() {
    const result = await query(
      'SELECT * FROM weekly_milestones ORDER BY week_number'
    );
    return result.rows;
  },
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get nutrient mappings for multiple foods
 */
async function getFoodNutrientsMap(foodIds: string[]): Promise<Map<string, string[]>> {
  if (foodIds.length === 0) return new Map();

  const placeholders = foodIds.map((_, i) => `$${i + 1}`).join(', ');
  const result = await query(
    `SELECT fn.food_id, n.name
     FROM food_nutrients fn
     JOIN nutrients n ON fn.nutrient_id = n.id
     WHERE fn.food_id IN (${placeholders}) AND fn.is_present = true`,
    foodIds
  );

  const nutrientsMap = new Map<string, string[]>();
  result.rows.forEach((row: any) => {
    if (!nutrientsMap.has(row.food_id)) {
      nutrientsMap.set(row.food_id, []);
    }
    nutrientsMap.get(row.food_id)!.push(row.name);
  });

  return nutrientsMap;
}

/**
 * Insert nutrient mappings for a food item
 */
async function insertNutrientMappings(foodId: string, micronutrients: any) {
  const nutrients = [];
  if (micronutrients.calcium) nutrients.push('calcium');
  if (micronutrients.iron) nutrients.push('iron');
  if (micronutrients.folicAcid) nutrients.push('folate');
  if (micronutrients.protein) nutrients.push('protein');
  if (micronutrients.vitaminD) nutrients.push('vitamin_d');
  if (micronutrients.omega3) nutrients.push('dha');
  if (micronutrients.fiber) nutrients.push('fiber');

  if (nutrients.length === 0) return;

  const placeholders = nutrients.map((_, i) => `$${i + 2}`).join(', ');
  await query(
    `INSERT INTO food_nutrients (food_id, nutrient_id, is_present)
     SELECT $1, id, true FROM nutrients WHERE name IN (${placeholders})`,
    [foodId, ...nutrients]
  );
}

/**
 * Convert database row to FoodItem type
 */
function dbRowToFoodItem(row: any, nutrients?: string[]): FoodItem {
  return {
    id: row.id,
    name: row.name,
    portion: row.portion || undefined,
    macroCategory: row.macro_category || undefined,
    rainbowColor: row.rainbow_color || undefined,
    phytonutrientFocus: row.phytonutrient_focus || undefined,
    containsMicronutrients: {
      calcium: nutrients?.includes('calcium') || false,
      iron: nutrients?.includes('iron') || false,
      folicAcid: nutrients?.includes('folate') || false,
      protein: nutrients?.includes('protein') || false,
      vitaminD: nutrients?.includes('vitamin_d'),
      omega3: nutrients?.includes('dha'),
      fiber: nutrients?.includes('fiber'),
    },
    hasWarnings: !row.is_safe_pregnancy || !!row.warning_message,
    warningMessage: row.warning_message || undefined,
    warningType: row.warning_type || undefined,
    tags: row.tags || undefined,
    description: row.description || undefined,
  };
}

/**
 * Aggregate micronutrients from multiple food items
 */
function aggregateMicronutrients(items: FoodItem[]) {
  return {
    calcium: items.some(item => item.containsMicronutrients.calcium),
    iron: items.some(item => item.containsMicronutrients.iron),
    folicAcid: items.some(item => item.containsMicronutrients.folicAcid),
    protein: items.some(item => item.containsMicronutrients.protein),
    vitaminD: items.some(item => item.containsMicronutrients.vitaminD),
    omega3: items.some(item => item.containsMicronutrients.omega3),
    fiber: items.some(item => item.containsMicronutrients.fiber),
  };
}

/**
 * Map meal type to key format
 */
function mapMealTypeToKey(mealType: string): 'breakfast' | 'snack1' | 'lunch' | 'snack2' | 'dinner' {
  const mapping: Record<string, 'breakfast' | 'snack1' | 'lunch' | 'snack2' | 'dinner'> = {
    'Breakfast': 'breakfast',
    'Snack 1': 'snack1',
    'Lunch': 'lunch',
    'Snack 2': 'snack2',
    'Dinner': 'dinner',
  };
  return mapping[mealType] || 'breakfast';
}
