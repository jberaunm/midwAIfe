from typing import List, Optional, Dict
from datetime import datetime, timedelta
from db.pg_database import execute_query, execute_transaction
from meals.models import (
    FoodItem,
    FoodItemCreate,
    Meal,
    DayData,
    DayMeals,
    DailySummary,
    NutrientStatus,
    MicronutrientPresence,
    WeeklyMilestone
)

class MealService:
    """Service layer for meal operations"""

    # ========================================================================
    # FOOD ITEMS
    # ========================================================================

    def get_all_foods(self) -> List[FoodItem]:
        """Get all food items"""
        results = execute_query('SELECT * FROM foods ORDER BY name')
        # Get nutrients for all foods
        food_ids = [row['id'] for row in results]
        nutrients_map = self._get_food_nutrients_map(food_ids)
        return [self._map_food_item(row, nutrients_map.get(row['id'], [])) for row in results]

    def search_foods(self, query: str) -> List[FoodItem]:
        """Search foods by name"""
        results = execute_query(
            'SELECT * FROM foods WHERE name ILIKE %s ORDER BY name LIMIT 20',
            (f'%{query}%',)
        )
        # Get nutrients for search results
        food_ids = [row['id'] for row in results]
        nutrients_map = self._get_food_nutrients_map(food_ids)
        return [self._map_food_item(row, nutrients_map.get(row['id'], [])) for row in results]

    def get_food_by_id(self, food_id: str) -> Optional[FoodItem]:
        """Get a single food by ID"""
        result = execute_query(
            'SELECT * FROM foods WHERE id = %s',
            (food_id,),
            fetch_one=True
        )
        if not result:
            return None
        # Get nutrients for this food
        nutrients_map = self._get_food_nutrients_map([result['id']])
        return self._map_food_item(result, nutrients_map.get(result['id'], []))

    def create_food(self, food: FoodItemCreate) -> FoodItem:
        """Create a new food item"""
        result = execute_query(
            '''INSERT INTO foods (
                name, portion, macro_category, rainbow_color, phytonutrient_focus,
                is_safe_pregnancy, warning_message, warning_type, tags, description
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING *''',
            (
                food.name,
                food.portion,
                food.macroCategory,
                food.rainbowColor,
                food.phytonutrientFocus,
                not food.hasWarnings,
                food.warningMessage,
                food.warningType,
                food.tags,
                food.description
            ),
            fetch_one=True
        )

        # Insert nutrient mappings
        food_id = result['id']
        self._insert_nutrient_mappings(food_id, food.containsMicronutrients)

        return self._map_food_item(result)

    # ========================================================================
    # MEALS
    # ========================================================================

    def get_week_meals(self, user_id: str, start_date: str) -> List[DayData]:
        """Get meals for a week"""
        end_date = (datetime.strptime(start_date, '%Y-%m-%d') + timedelta(days=6)).strftime('%Y-%m-%d')
        return self.get_meals_by_date_range(user_id, start_date, end_date)

    def get_meals_by_date_range(self, user_id: str, start_date: str, end_date: str) -> List[DayData]:
        """Get meals for a date range"""
        results = execute_query(
            '''SELECT
                m.id as meal_id,
                m.log_date as meal_date,
                m.day_of_week,
                m.meal_type,
                m.notes as meal_notes,
                mi.id as meal_item_id,
                mi.sort_order,
                f.*
            FROM meals m
            LEFT JOIN meal_items mi ON m.id = mi.meal_id
            LEFT JOIN foods f ON mi.food_id = f.id
            WHERE m.user_id = %s
                AND m.log_date >= %s
                AND m.log_date <= %s
            ORDER BY m.log_date, m.meal_type, mi.sort_order''',
            (user_id, start_date, end_date)
        )

        # Get nutrient mappings for all foods
        food_ids = list(set(row['id'] for row in results if row['id']))
        nutrients_map = self._get_food_nutrients_map(food_ids)

        # Group by date
        day_map: Dict[str, DayData] = {}

        for row in results:
            date_key = str(row['meal_date'])

            if date_key not in day_map:
                day_map[date_key] = DayData(
                    id=date_key,
                    date=date_key,
                    dayOfWeek=row['day_of_week'],
                    meals=DayMeals(),
                    dailySummary=DailySummary(
                        calcium=NutrientStatus(covered=False, mealsCovered=[], status='missing'),
                        iron=NutrientStatus(covered=False, mealsCovered=[], status='missing'),
                        folicAcid=NutrientStatus(covered=False, mealsCovered=[], status='missing'),
                        protein=NutrientStatus(covered=False, mealsCovered=[], status='missing'),
                        hasWarnings=False,
                        missingNutrients=[]
                    )
                )

            day_data = day_map[date_key]
            meal_type_key = self._map_meal_type_to_key(row['meal_type'])

            # Initialize meal if not exists
            current_meal = getattr(day_data.meals, meal_type_key)
            if not current_meal:
                setattr(day_data.meals, meal_type_key, Meal(
                    id=row['meal_id'],
                    type=row['meal_type'],
                    items=[],
                    containsMicronutrients=MicronutrientPresence(),
                    notes=row['meal_notes']
                ))

            # Add food item if exists
            if row['id']:
                food_item = self._map_food_item(row, nutrients_map.get(row['id'], []))
                current_meal = getattr(day_data.meals, meal_type_key)
                current_meal.items.append(food_item)

        # Calculate aggregate nutrients
        for day_data in day_map.values():
            for meal_attr in ['breakfast', 'snack1', 'lunch', 'snack2', 'dinner']:
                meal = getattr(day_data.meals, meal_attr)
                if meal:
                    meal.containsMicronutrients = self._aggregate_micronutrients(meal.items)

            day_data.dailySummary = self._calculate_daily_summary(day_data.meals)

        return list(day_map.values())

    def upsert_meal(self, user_id: str, date: str, day_of_week: str, meal_type: str, food_item_ids: List[str]):
        """Create or update a meal"""
        queries = []

        # Upsert meal
        queries.append((
            '''INSERT INTO meals (user_id, log_date, day_of_week, meal_type)
               VALUES (%s, %s, %s, %s)
               ON CONFLICT (user_id, log_date, meal_type)
               DO UPDATE SET day_of_week = EXCLUDED.day_of_week, updated_at = NOW()
               RETURNING id''',
            (user_id, date, day_of_week, meal_type)
        ))

        # Get meal ID (need to execute first query to get it)
        meal_result = execute_query(
            '''INSERT INTO meals (user_id, log_date, day_of_week, meal_type)
               VALUES (%s, %s, %s, %s)
               ON CONFLICT (user_id, log_date, meal_type)
               DO UPDATE SET day_of_week = EXCLUDED.day_of_week, updated_at = NOW()
               RETURNING id''',
            (user_id, date, day_of_week, meal_type),
            fetch_one=True
        )
        meal_id = meal_result['id']

        # Delete existing meal items
        execute_query(
            'DELETE FROM meal_items WHERE meal_id = %s',
            (meal_id,),
            fetch_all=False
        )

        # Insert new meal items
        if food_item_ids:
            for idx, food_item_id in enumerate(food_item_ids):
                execute_query(
                    'INSERT INTO meal_items (meal_id, food_id, sort_order) VALUES (%s, %s, %s)',
                    (meal_id, food_item_id, idx),
                    fetch_all=False
                )

    def add_meal_item(self, user_id: str, date: str, day_of_week: str, meal_type: str, food_item_id: str):
        """Add a food item to a meal"""
        # Get or create meal
        meal_result = execute_query(
            '''INSERT INTO meals (user_id, log_date, day_of_week, meal_type)
               VALUES (%s, %s, %s, %s)
               ON CONFLICT (user_id, log_date, meal_type)
               DO UPDATE SET day_of_week = EXCLUDED.day_of_week, updated_at = NOW()
               RETURNING id''',
            (user_id, date, day_of_week, meal_type),
            fetch_one=True
        )
        meal_id = meal_result['id']

        # Get next sort order
        sort_result = execute_query(
            'SELECT COALESCE(MAX(sort_order), -1) + 1 as next_order FROM meal_items WHERE meal_id = %s',
            (meal_id,),
            fetch_one=True
        )
        next_order = sort_result['next_order']

        # Add food item
        execute_query(
            'INSERT INTO meal_items (meal_id, food_id, sort_order) VALUES (%s, %s, %s)',
            (meal_id, food_item_id, next_order),
            fetch_all=False
        )

    def remove_meal_item(self, meal_id: str, food_item_id: str):
        """Remove a food item from a meal"""
        execute_query(
            'DELETE FROM meal_items WHERE meal_id = %s AND food_id = %s',
            (meal_id, food_item_id),
            fetch_all=False
        )

    def delete_meal(self, meal_id: str):
        """Delete a meal"""
        execute_query(
            'DELETE FROM meals WHERE id = %s',
            (meal_id,),
            fetch_all=False
        )

    # ========================================================================
    # MILESTONES
    # ========================================================================

    def get_milestone_by_week(self, week_number: int) -> Optional[WeeklyMilestone]:
        """Get milestone for a specific week"""
        result = execute_query(
            'SELECT * FROM weekly_milestones WHERE week_number = %s',
            (week_number,),
            fetch_one=True
        )
        return self._map_milestone(result) if result else None

    def get_all_milestones(self) -> List[WeeklyMilestone]:
        """Get all milestones"""
        results = execute_query('SELECT * FROM weekly_milestones ORDER BY week_number')
        return [self._map_milestone(row) for row in results]

    # ========================================================================
    # HELPER METHODS
    # ========================================================================

    def _map_food_item(self, row: Dict, nutrients: List[str] = None) -> FoodItem:
        """Map database row to FoodItem"""
        if nutrients is None:
            nutrients = []

        return FoodItem(
            id=row['id'],
            name=row['name'],
            portion=row.get('portion'),
            macroCategory=row.get('macro_category'),
            rainbowColor=row.get('rainbow_color'),
            phytonutrientFocus=row.get('phytonutrient_focus'),
            containsMicronutrients=MicronutrientPresence(
                calcium='calcium' in nutrients,
                iron='iron' in nutrients,
                folicAcid='folate' in nutrients,
                protein='protein' in nutrients,
                vitaminD='vitamin_d' in nutrients if nutrients else None,
                omega3='dha' in nutrients if nutrients else None,
                fiber='fiber' in nutrients if nutrients else None
            ),
            hasWarnings=not row.get('is_safe_pregnancy', True) or bool(row.get('warning_message')),
            warningMessage=row.get('warning_message'),
            warningType=row.get('warning_type'),
            tags=row.get('tags'),
            description=row.get('description')
        )

    def _get_food_nutrients_map(self, food_ids: List[str]) -> Dict[str, List[str]]:
        """Get nutrient mappings for multiple foods"""
        if not food_ids:
            return {}

        placeholders = ','.join(['%s'] * len(food_ids))
        results = execute_query(
            f'''SELECT fn.food_id, n.name
                FROM food_nutrients fn
                JOIN nutrients n ON fn.nutrient_id = n.id
                WHERE fn.food_id IN ({placeholders}) AND fn.is_present = true''',
            tuple(food_ids)
        )

        nutrients_map: Dict[str, List[str]] = {}
        for row in results:
            food_id = row['food_id']
            if food_id not in nutrients_map:
                nutrients_map[food_id] = []
            nutrients_map[food_id].append(row['name'])

        return nutrients_map

    def _insert_nutrient_mappings(self, food_id: str, micronutrients: MicronutrientPresence):
        """Insert nutrient mappings for a food"""
        nutrients = []
        if micronutrients.calcium:
            nutrients.append('calcium')
        if micronutrients.iron:
            nutrients.append('iron')
        if micronutrients.folicAcid:
            nutrients.append('folate')
        if micronutrients.protein:
            nutrients.append('protein')
        if micronutrients.vitaminD:
            nutrients.append('vitamin_d')
        if micronutrients.omega3:
            nutrients.append('dha')
        if micronutrients.fiber:
            nutrients.append('fiber')

        if nutrients:
            placeholders = ','.join(['%s'] * len(nutrients))
            execute_query(
                f'''INSERT INTO food_nutrients (food_id, nutrient_id, is_present)
                    SELECT %s, id, true FROM nutrients WHERE name IN ({placeholders})''',
                (food_id, *nutrients),
                fetch_all=False
            )

    def _aggregate_micronutrients(self, items: List[FoodItem]) -> MicronutrientPresence:
        """Aggregate micronutrients from food items"""
        return MicronutrientPresence(
            calcium=any(item.containsMicronutrients.calcium for item in items),
            iron=any(item.containsMicronutrients.iron for item in items),
            folicAcid=any(item.containsMicronutrients.folicAcid for item in items),
            protein=any(item.containsMicronutrients.protein for item in items),
            vitaminD=any(item.containsMicronutrients.vitaminD for item in items if item.containsMicronutrients.vitaminD),
            omega3=any(item.containsMicronutrients.omega3 for item in items if item.containsMicronutrients.omega3),
            fiber=any(item.containsMicronutrients.fiber for item in items if item.containsMicronutrients.fiber)
        )

    def _calculate_daily_summary(self, meals: DayMeals) -> DailySummary:
        """Calculate daily nutrient summary"""
        coverage = {
            'calcium': {'meals': [], 'covered': False},
            'iron': {'meals': [], 'covered': False},
            'folicAcid': {'meals': [], 'covered': False},
            'protein': {'meals': [], 'covered': False}
        }

        has_warnings = False

        for meal_attr in ['breakfast', 'snack1', 'lunch', 'snack2', 'dinner']:
            meal = getattr(meals, meal_attr)
            if meal:
                if meal.containsMicronutrients.calcium:
                    coverage['calcium']['meals'].append(meal_attr)
                    coverage['calcium']['covered'] = True
                if meal.containsMicronutrients.iron:
                    coverage['iron']['meals'].append(meal_attr)
                    coverage['iron']['covered'] = True
                if meal.containsMicronutrients.folicAcid:
                    coverage['folicAcid']['meals'].append(meal_attr)
                    coverage['folicAcid']['covered'] = True
                if meal.containsMicronutrients.protein:
                    coverage['protein']['meals'].append(meal_attr)
                    coverage['protein']['covered'] = True

                if any(item.hasWarnings for item in meal.items):
                    has_warnings = True

        missing_nutrients = []
        if not coverage['calcium']['covered']:
            missing_nutrients.append('Calcium')
        if not coverage['iron']['covered']:
            missing_nutrients.append('Iron')
        if not coverage['folicAcid']['covered']:
            missing_nutrients.append('Folic Acid')
        if not coverage['protein']['covered']:
            missing_nutrients.append('Protein')

        def get_status(covered: bool, meal_count: int) -> str:
            if not covered:
                return 'missing'
            if meal_count >= 2:
                return 'good'
            return 'moderate'

        return DailySummary(
            calcium=NutrientStatus(
                covered=coverage['calcium']['covered'],
                mealsCovered=coverage['calcium']['meals'],
                status=get_status(coverage['calcium']['covered'], len(coverage['calcium']['meals']))
            ),
            iron=NutrientStatus(
                covered=coverage['iron']['covered'],
                mealsCovered=coverage['iron']['meals'],
                status=get_status(coverage['iron']['covered'], len(coverage['iron']['meals']))
            ),
            folicAcid=NutrientStatus(
                covered=coverage['folicAcid']['covered'],
                mealsCovered=coverage['folicAcid']['meals'],
                status=get_status(coverage['folicAcid']['covered'], len(coverage['folicAcid']['meals']))
            ),
            protein=NutrientStatus(
                covered=coverage['protein']['covered'],
                mealsCovered=coverage['protein']['meals'],
                status=get_status(coverage['protein']['covered'], len(coverage['protein']['meals']))
            ),
            hasWarnings=has_warnings,
            missingNutrients=missing_nutrients
        )

    def _map_meal_type_to_key(self, meal_type: str) -> str:
        """Map meal type to key"""
        mapping = {
            'Breakfast': 'breakfast',
            'Snack 1': 'snack1',
            'Lunch': 'lunch',
            'Snack 2': 'snack2',
            'Dinner': 'dinner'
        }
        return mapping.get(meal_type, 'breakfast')

    def _map_milestone(self, row: Dict) -> WeeklyMilestone:
        """Map database row to WeeklyMilestone"""
        return WeeklyMilestone(
            id=row['id'],
            weekNumber=row['week_number'],
            nhsSizeComparison=row.get('nhs_size_comparison'),
            developmentMilestone=row['development_milestone'],
            nutritionalFocusColor=row.get('nutritional_focus_color'),
            keyNutrient=row.get('key_nutrient'),
            actionTip=row.get('action_tip'),
            sourceUrl=row.get('source_url')
        )
