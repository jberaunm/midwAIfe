// Micronutrients presence/absence in a food item
export interface MicronutrientPresence {
  calcium: boolean;       // Has calcium?
  iron: boolean;          // Has iron?
  folicAcid: boolean;     // Has folic acid?
  protein: boolean;       // Has protein?
  vitaminD?: boolean;     // Has vitamin D? (optional)
  omega3?: boolean;       // Has omega-3? (optional)
  fiber?: boolean;        // Has fiber? (optional)
}

// Individual food item
export interface FoodItem {
  id: string;
  name: string;
  portion?: string;             // e.g., "1 cup", "100g", "1 medium" (optional)
  macroCategory?: string;       // e.g., "Protein", "Carbohydrate", "Vegetable", "Fruit", "Dairy", "Fat", "Grain"
  rainbowColor?: string;        // e.g., "Red", "Orange", "Yellow", "Green", "Blue", "Purple", "White", "Brown"
  phytonutrientFocus?: string;  // e.g., "Lycopene", "Beta-carotene", "DHA"
  containsMicronutrients: MicronutrientPresence;
  hasWarnings: boolean;
  warningMessage?: string;
  warningType?: 'unsafe' | 'limit' | 'allergen';  // Type of warning
  tags?: string[];              // e.g., ["dairy", "protein", "vegetarian"]
  description?: string;         // Brief description of nutritional benefits
}

// A meal contains multiple food items
export interface Meal {
  id: string;
  type: 'breakfast' | 'snack1' | 'lunch' | 'snack2' | 'dinner';
  items: FoodItem[];
  containsMicronutrients: MicronutrientPresence;  // Aggregated from all items
  notes?: string;               // Optional notes about the meal
}

// Daily nutrient coverage summary - tracks if nutrients are present
export interface DailyNutrientSummary {
  calcium: {
    covered: boolean;           // Is calcium present in meals today?
    mealsCovered: string[];     // Which meals have calcium? e.g., ["breakfast", "lunch"]
    status: 'good' | 'moderate' | 'missing';
  };
  iron: {
    covered: boolean;
    mealsCovered: string[];
    status: 'good' | 'moderate' | 'missing';
  };
  folicAcid: {
    covered: boolean;
    mealsCovered: string[];
    status: 'good' | 'moderate' | 'missing';
  };
  protein: {
    covered: boolean;
    mealsCovered: string[];
    status: 'good' | 'moderate' | 'missing';
  };
  hasWarnings: boolean;         // True if any meal has warnings
  missingNutrients: string[];   // List of nutrients not covered today
}

// A day contains all meals and summary
export interface DayData {
  id: string;
  date: string;                 // ISO date string (YYYY-MM-DD)
  dayOfWeek: 'Sunday' | 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday';
  meals: {
    breakfast: Meal | null;
    snack1: Meal | null;
    lunch: Meal | null;
    snack2: Meal | null;
    dinner: Meal | null;
  };
  dailySummary: DailyNutrientSummary;
  weekNumber?: number;          // Pregnancy week number
  notes?: string;               // Daily notes
}

// Weekly data contains 7 days
export interface WeekData {
  id: string;
  weekNumber: number;           // Pregnancy week number
  startDate: string;            // ISO date string
  endDate: string;              // ISO date string
  days: DayData[];              // Array of 7 days (Sunday to Saturday)
  weeklyAverage: {
    daysWithCalcium: number;    // How many days had calcium
    daysWithIron: number;       // How many days had iron
    daysWithFolicAcid: number;  // How many days had folic acid
    daysWithProtein: number;    // How many days had protein
  };
  milestone?: {
    description: string;        // e.g., "Baby's kidneys are functioning"
    priorityNutrient: string;   // e.g., "Calcium"
    priorityGoal: string;       // e.g., "Include calcium-rich foods daily"
  };
}

// Required nutrients for pregnancy (presence-based)
export const REQUIRED_NUTRIENTS = ['calcium', 'iron', 'folicAcid', 'protein'] as const;

// Helper function to calculate nutrient status based on coverage
export function calculateNutrientStatus(
  covered: boolean,
  mealCount: number
): 'good' | 'moderate' | 'missing' {
  if (!covered) return 'missing';
  if (mealCount >= 2) return 'good';      // Present in 2+ meals
  return 'moderate';                       // Present in 1 meal
}

// Helper function to aggregate micronutrients across food items
export function aggregateMicronutrients(items: FoodItem[]): MicronutrientPresence {
  const aggregated: MicronutrientPresence = {
    calcium: false,
    iron: false,
    folicAcid: false,
    protein: false,
    vitaminD: false,
    omega3: false,
    fiber: false,
  };

  items.forEach(item => {
    if (item.containsMicronutrients.calcium) aggregated.calcium = true;
    if (item.containsMicronutrients.iron) aggregated.iron = true;
    if (item.containsMicronutrients.folicAcid) aggregated.folicAcid = true;
    if (item.containsMicronutrients.protein) aggregated.protein = true;
    if (item.containsMicronutrients.vitaminD) aggregated.vitaminD = true;
    if (item.containsMicronutrients.omega3) aggregated.omega3 = true;
    if (item.containsMicronutrients.fiber) aggregated.fiber = true;
  });

  return aggregated;
}

// Helper function to calculate daily summary
export function calculateDailySummary(meals: DayData['meals']): DailyNutrientSummary {
  const coverage = {
    calcium: { meals: [] as string[], covered: false },
    iron: { meals: [] as string[], covered: false },
    folicAcid: { meals: [] as string[], covered: false },
    protein: { meals: [] as string[], covered: false },
  };

  let hasWarnings = false;

  Object.entries(meals).forEach(([mealType, meal]) => {
    if (meal) {
      if (meal.containsMicronutrients.calcium) {
        coverage.calcium.meals.push(mealType);
        coverage.calcium.covered = true;
      }
      if (meal.containsMicronutrients.iron) {
        coverage.iron.meals.push(mealType);
        coverage.iron.covered = true;
      }
      if (meal.containsMicronutrients.folicAcid) {
        coverage.folicAcid.meals.push(mealType);
        coverage.folicAcid.covered = true;
      }
      if (meal.containsMicronutrients.protein) {
        coverage.protein.meals.push(mealType);
        coverage.protein.covered = true;
      }

      if (meal.items.some(item => item.hasWarnings)) {
        hasWarnings = true;
      }
    }
  });

  const missingNutrients: string[] = [];
  if (!coverage.calcium.covered) missingNutrients.push('Calcium');
  if (!coverage.iron.covered) missingNutrients.push('Iron');
  if (!coverage.folicAcid.covered) missingNutrients.push('Folic Acid');
  if (!coverage.protein.covered) missingNutrients.push('Protein');

  return {
    calcium: {
      covered: coverage.calcium.covered,
      mealsCovered: coverage.calcium.meals,
      status: calculateNutrientStatus(coverage.calcium.covered, coverage.calcium.meals.length),
    },
    iron: {
      covered: coverage.iron.covered,
      mealsCovered: coverage.iron.meals,
      status: calculateNutrientStatus(coverage.iron.covered, coverage.iron.meals.length),
    },
    folicAcid: {
      covered: coverage.folicAcid.covered,
      mealsCovered: coverage.folicAcid.meals,
      status: calculateNutrientStatus(coverage.folicAcid.covered, coverage.folicAcid.meals.length),
    },
    protein: {
      covered: coverage.protein.covered,
      mealsCovered: coverage.protein.meals,
      status: calculateNutrientStatus(coverage.protein.covered, coverage.protein.meals.length),
    },
    hasWarnings,
    missingNutrients,
  };
}

// Sample food database (this would typically come from an API)
export const SAMPLE_FOODS: Record<string, Omit<FoodItem, 'id'>> = {
  'greek-yogurt': {
    name: 'Greek Yogurt',
    portion: '1 cup',
    containsMicronutrients: {
      calcium: true,
      iron: false,
      folicAcid: false,
      protein: true,
    },
    hasWarnings: false,
    tags: ['dairy', 'protein'],
    description: 'High in calcium and protein',
  },
  'spinach': {
    name: 'Spinach',
    portion: '1 cup cooked',
    containsMicronutrients: {
      calcium: true,
      iron: true,
      folicAcid: true,
      protein: true,
      fiber: true,
    },
    hasWarnings: false,
    tags: ['vegetable', 'iron-rich', 'folate-rich'],
    description: 'Excellent source of iron and folic acid',
  },
  'salmon': {
    name: 'Grilled Salmon',
    portion: '4 oz',
    containsMicronutrients: {
      calcium: false,
      iron: false,
      folicAcid: false,
      protein: true,
      omega3: true,
      vitaminD: true,
    },
    hasWarnings: false,
    tags: ['seafood', 'protein', 'omega3'],
    description: 'Rich in protein and omega-3 fatty acids',
  },
  'raw-fish': {
    name: 'Raw Sushi',
    portion: '4 oz',
    containsMicronutrients: {
      calcium: false,
      iron: false,
      folicAcid: false,
      protein: true,
    },
    hasWarnings: true,
    warningMessage: 'Raw fish may contain harmful bacteria and parasites. Avoid during pregnancy.',
    warningType: 'unsafe',
    tags: ['seafood', 'raw'],
    description: 'High protein but unsafe during pregnancy',
  },
  'lentils': {
    name: 'Cooked Lentils',
    portion: '1 cup',
    containsMicronutrients: {
      calcium: false,
      iron: true,
      folicAcid: true,
      protein: true,
      fiber: true,
    },
    hasWarnings: false,
    tags: ['legume', 'protein', 'iron-rich', 'vegetarian'],
    description: 'Excellent plant-based iron and folate source',
  },
  'fortified-cereal': {
    name: 'Fortified Cereal',
    portion: '1 cup',
    containsMicronutrients: {
      calcium: true,
      iron: true,
      folicAcid: true,
      protein: false,
      fiber: true,
    },
    hasWarnings: false,
    tags: ['grain', 'fortified'],
    description: 'Fortified with essential vitamins and minerals',
  },
  'orange-juice-fortified': {
    name: 'Fortified Orange Juice',
    portion: '1 glass',
    containsMicronutrients: {
      calcium: true,
      iron: false,
      folicAcid: true,
      protein: false,
    },
    hasWarnings: false,
    tags: ['beverage', 'fortified'],
    description: 'Good source of calcium and vitamin C',
  },
  'beef': {
    name: 'Lean Beef',
    portion: '3 oz',
    containsMicronutrients: {
      calcium: false,
      iron: true,
      folicAcid: false,
      protein: true,
    },
    hasWarnings: false,
    tags: ['meat', 'protein', 'iron-rich'],
    description: 'Excellent source of heme iron and protein',
  },
};
