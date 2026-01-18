-- ============================================================================
-- MIDWAIFE PREGNANCY MEAL TRACKING - LOCAL POSTGRESQL SCHEMA
-- Enhanced schema combining rainbow approach with meal grouping
-- ============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- 1. USER PROFILE: Manages the pregnancy timeline
-- ============================================================================
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email TEXT UNIQUE,
    first_name TEXT NOT NULL,
    due_date DATE NOT NULL,
    dietary_restrictions TEXT[], -- e.g., ['vegetarian', 'dairy-free']
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- 2. MICRONUTRIENT MASTER: Pregnancy-critical nutrients
-- ============================================================================
CREATE TABLE nutrients (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL UNIQUE, -- e.g., 'Folate', 'Iron', 'DHA', 'Choline'
    display_name TEXT NOT NULL, -- e.g., 'Folic Acid', 'Iron', 'Omega-3 DHA'
    pregnancy_benefit TEXT,      -- Why it's needed for the baby
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- 3. RAINBOW FOOD MASTER: Stores food items with visual categories
-- ============================================================================
CREATE TABLE foods (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL UNIQUE,
    portion TEXT,                -- e.g., '1 cup', '4 oz'

    -- Visual/Category Information
    macro_category TEXT CHECK (macro_category IN ('Protein', 'Carbohydrate', 'Vegetable', 'Fruit', 'Dairy', 'Fat', 'Grain')),
    rainbow_color TEXT CHECK (rainbow_color IN ('Red', 'Orange', 'Yellow', 'Green', 'Blue', 'Purple', 'White', 'Brown')),
    phytonutrient_focus TEXT,    -- e.g., 'Lycopene', 'DHA', 'Folate'

    -- Safety Information
    is_safe_pregnancy BOOLEAN DEFAULT TRUE,
    warning_message TEXT,
    warning_type TEXT CHECK (warning_type IN ('unsafe', 'limit', 'allergen')),

    -- Additional Metadata
    tags TEXT[],                 -- e.g., ['vegetarian', 'quick', 'high-protein']
    description TEXT,            -- Nutritional description

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- 4. BINARY NUTRIENT MAPPING: Tracks presence/absence (No amounts!)
-- ============================================================================
CREATE TABLE food_nutrients (
    food_id UUID REFERENCES foods(id) ON DELETE CASCADE,
    nutrient_id UUID REFERENCES nutrients(id) ON DELETE CASCADE,
    is_present BOOLEAN DEFAULT TRUE, -- Simply marks if food is a notable source
    PRIMARY KEY (food_id, nutrient_id)
);

-- ============================================================================
-- 5. MEALS: Groups food items together (NEW - was missing)
-- ============================================================================
CREATE TABLE meals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    log_date DATE NOT NULL DEFAULT CURRENT_DATE,
    day_of_week TEXT NOT NULL CHECK (day_of_week IN ('Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday')),
    meal_type TEXT NOT NULL CHECK (meal_type IN ('Breakfast', 'Snack 1', 'Lunch', 'Snack 2', 'Dinner')),
    notes TEXT,                  -- Overall meal notes
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, log_date, meal_type)
);

-- ============================================================================
-- 6. MEAL ITEMS: Individual foods within a meal
-- ============================================================================
CREATE TABLE meal_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    meal_id UUID REFERENCES meals(id) ON DELETE CASCADE,
    food_id UUID REFERENCES foods(id),
    sort_order INTEGER DEFAULT 0,
    symptom_notes TEXT,          -- e.g., "Felt nauseous afterward"
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- 7. WEEKLY MILESTONES: Content for AI companion
-- ============================================================================
CREATE TABLE weekly_milestones (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    week_number INTEGER NOT NULL UNIQUE,
    baby_development_info TEXT NOT NULL,
    recommended_rainbow_focus TEXT, -- Suggests a color for the week
    priority_nutrient TEXT,         -- e.g., 'Calcium', 'Iron'
    priority_goal TEXT,             -- e.g., 'Include calcium-rich foods daily'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================
CREATE INDEX idx_meals_user_date ON meals(user_id, log_date);
CREATE INDEX idx_meals_user_week ON meals(user_id, log_date);
CREATE INDEX idx_meal_items_meal ON meal_items(meal_id);
CREATE INDEX idx_foods_name ON foods(name);
CREATE INDEX idx_foods_rainbow ON foods(rainbow_color);
CREATE INDEX idx_food_nutrients_food ON food_nutrients(food_id);
CREATE INDEX idx_food_nutrients_nutrient ON food_nutrients(nutrient_id);

-- ============================================================================
-- FUNCTIONS FOR AUTOMATIC UPDATES
-- ============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_meals_updated_at BEFORE UPDATE ON meals
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_foods_updated_at BEFORE UPDATE ON foods
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- SAMPLE DATA: Critical Pregnancy Micronutrients (NHS UK Guidelines)
-- The core nutrients required for baby development, particularly emphasized by NHS
-- ============================================================================
INSERT INTO nutrients (name, display_name, pregnancy_benefit) VALUES
    -- TOP PRIORITY (NHS Emphasized)
    ('folate', 'Folate (Vitamin B9)', 'Vital for preventing neural tube defects like spina bifida. Take 400mcg daily before conception and first 12 weeks.'),
    ('vitamin_d', 'Vitamin D', 'Essential for bone, teeth, and muscle health. NHS recommends 10mcg daily supplement throughout pregnancy.'),
    ('iron', 'Iron', 'Needed to support increased blood volume and supply oxygen to baby. Prevents maternal anemia.'),
    ('iodine', 'Iodine', 'Supports baby''s thyroid function and brain development. Critical for cognitive development.'),
    ('calcium', 'Calcium', 'Critical for building baby''s bones and teeth. Supports skeletal development.'),
    ('dha', 'Omega-3 DHA', 'Important for development of nervous system, brain, and eyes. Essential fatty acid.'),
    ('choline', 'Choline', 'Supports brain development and further reduces neural tube defect risks. Works with folate.'),

    -- SUPPORTING NUTRIENTS
    ('protein', 'Protein', 'Builds baby''s tissues and supports growth. Essential for cell development.'),
    ('vitamin_c', 'Vitamin C', 'Helps absorb iron from plant sources and supports immune system.'),
    ('vitamin_a', 'Vitamin A', 'Important for eye development and immune function. Avoid high-dose supplements.'),
    ('vitamin_b12', 'Vitamin B12', 'Works with folate for red blood cell formation. Critical for vegetarians/vegans.'),
    ('zinc', 'Zinc', 'Supports immune system and cell growth. Important for DNA synthesis.'),
    ('fiber', 'Fiber', 'Prevents constipation (common in pregnancy) and supports digestive health.')
ON CONFLICT (name) DO NOTHING;

-- ============================================================================
-- SAMPLE DATA: Rainbow Foods with Nutrients
-- ============================================================================

-- RED Foods
INSERT INTO foods (name, portion, macro_category, rainbow_color, phytonutrient_focus, is_safe_pregnancy, tags, description, warning_message) VALUES
    ('Tomatoes', '1 cup', 'Vegetable', 'Red', 'Lycopene', true, ARRAY['vegetable', 'antioxidant'], 'Rich in lycopene and vitamin C', NULL),
    ('Red Bell Pepper', '1 medium', 'Vegetable', 'Red', 'Vitamin C', true, ARRAY['vegetable', 'vitamin-rich'], 'Excellent source of vitamin C and folate', NULL),
    ('Strawberries', '1 cup', 'Fruit', 'Red', 'Vitamin C', true, ARRAY['fruit', 'folate-rich'], 'High in vitamin C and folate. Wash well to remove soil-borne pathogens.', NULL),
    ('Lean Beef', '3 oz', 'Protein', 'Red', 'Iron', true, ARRAY['meat', 'iron-rich', 'protein'], 'Excellent source of heme iron, B12, and zinc. Must be cooked thoroughly - avoid rare or medium steaks.', 'Avoid "rare" or "medium" steaks - must be fully cooked')
ON CONFLICT (name) DO NOTHING;

-- ORANGE Foods
INSERT INTO foods (name, portion, macro_category, rainbow_color, phytonutrient_focus, is_safe_pregnancy, tags, description, warning_message, warning_type) VALUES
    ('Carrots', '1 cup', 'Vegetable', 'Orange', 'Beta-carotene', true, ARRAY['vegetable', 'vitamin-a'], 'High in beta-carotene for eye development', NULL, NULL),
    ('Sweet Potato', '1 medium', 'Carbohydrate', 'Orange', 'Beta-carotene', true, ARRAY['carbohydrate', 'vitamin-a', 'fiber'], 'Excellent source of Vitamin A (beta-carotene), fiber, and Vitamin C. Supports baby''s eye development and immune system.', NULL, NULL),
    ('Orange', '1 medium', 'Fruit', 'Orange', 'Vitamin C', true, ARRAY['fruit', 'vitamin-c', 'folate'], 'Excellent source of vitamin C and folate. Helps iron absorption from plant sources.', NULL, NULL),
    ('Salmon (Grilled)', '4 oz (113g)', 'Protein', 'Orange', 'DHA', true, ARRAY['seafood', 'omega3', 'protein', 'vitamin-d'], 'One of the best sources of DHA omega-3, Vitamin D, protein, and iodine. Critical for baby''s brain, nervous system, and eye development.', 'NHS Limit: Max 2 portions of oily fish per week due to pollutants', 'limit')
ON CONFLICT (name) DO NOTHING;

-- YELLOW Foods
INSERT INTO foods (name, portion, macro_category, rainbow_color, phytonutrient_focus, is_safe_pregnancy, tags, description, warning_message, warning_type) VALUES
    ('Banana', '1 medium', 'Fruit', 'Yellow', 'Potassium', true, ARRAY['fruit', 'quick-energy'], 'Good source of potassium and vitamin B6. Helps with leg cramps and digestion.', NULL, NULL),
    ('Corn', '1 cup', 'Carbohydrate', 'Yellow', 'Fiber', true, ARRAY['grain', 'fiber'], 'Provides fiber and B vitamins', NULL, NULL),
    ('Yellow Bell Pepper', '1 medium', 'Vegetable', 'Yellow', 'Vitamin C', true, ARRAY['vegetable', 'vitamin-c'], 'High in vitamin C', NULL, NULL),
    ('British Lion Eggs', '2 large', 'Protein', 'Yellow', 'Choline', true, ARRAY['protein', 'choline-rich', 'vitamin-d', 'iodine'], 'THE BEST source of choline (vital for brain development), plus protein, Vitamin D, B12, iodine. Look for British Lion stamp.', 'UK Safe: Runny/soft eggs are SAFE if British Lion stamped (Salmonella-controlled)', NULL),
    ('Chickpeas (Cooked)', '1 cup', 'Protein', 'Yellow', 'Folate', true, ARRAY['legume', 'folate-rich', 'iron-rich', 'vegetarian', 'fiber'], 'Great plant-based source of folate, iron, protein, and fiber. Excellent for vegetarians.', NULL, NULL),
    ('Quinoa (Cooked)', '1 cup', 'Grain', 'Yellow', 'Protein', true, ARRAY['grain', 'protein', 'iron-rich', 'vegetarian'], 'Complete protein containing all essential amino acids. Rich in iron, folate, and fiber.', NULL, NULL)
ON CONFLICT (name) DO NOTHING;

-- GREEN Foods
INSERT INTO foods (name, portion, macro_category, rainbow_color, phytonutrient_focus, is_safe_pregnancy, tags, description, warning_message, warning_type) VALUES
    ('Spinach', '1 cup cooked', 'Vegetable', 'Green', 'Folate', true, ARRAY['vegetable', 'folate-rich', 'iron-rich', 'calcium'], 'SUPERSTAR food - packed with folate, iron, calcium, Vitamin A, and Vitamin C. Wash thoroughly to remove soil-borne pathogens.', NULL, NULL),
    ('Broccoli', '1 cup', 'Vegetable', 'Green', 'Folate', true, ARRAY['vegetable', 'calcium', 'folate', 'fiber'], 'Excellent source of folate, calcium, Vitamin C, and fiber. Great for baby''s bone and neural development.', NULL, NULL),
    ('Avocado', '1/2 medium', 'Fat', 'Green', 'Healthy Fats', true, ARRAY['healthy-fat', 'folate', 'fiber'], 'Provides healthy monounsaturated fats and folate. Good for brain development and maternal health.', NULL, NULL),
    ('Kiwi', '2 medium', 'Fruit', 'Green', 'Vitamin C', true, ARRAY['fruit', 'vitamin-c', 'fiber'], 'High in vitamin C and fiber. Helps with iron absorption and digestion.', NULL, NULL)
ON CONFLICT (name) DO NOTHING;

-- BLUE/PURPLE Foods
INSERT INTO foods (name, portion, macro_category, rainbow_color, phytonutrient_focus, is_safe_pregnancy, tags, description, warning_message, warning_type) VALUES
    ('Blueberries', '1 cup', 'Fruit', 'Blue', 'Antioxidants', true, ARRAY['fruit', 'antioxidant', 'vitamin-c', 'fiber'], 'Packed with antioxidants, Vitamin C, and fiber. Supports immune system and digestion.', NULL, NULL),
    ('Eggplant', '1 cup', 'Vegetable', 'Purple', 'Anthocyanins', true, ARRAY['vegetable', 'fiber'], 'Contains anthocyanins and fiber. Good for digestive health.', NULL, NULL),
    ('Purple Cabbage', '1 cup', 'Vegetable', 'Purple', 'Anthocyanins', true, ARRAY['vegetable', 'vitamin-c'], 'Rich in vitamin C and antioxidants. Supports immune function.', NULL, NULL)
ON CONFLICT (name) DO NOTHING;

-- WHITE/BROWN Foods
INSERT INTO foods (name, portion, macro_category, rainbow_color, phytonutrient_focus, is_safe_pregnancy, tags, description, warning_message, warning_type) VALUES
    ('Chicken (Breast)', '3 oz (85g)', 'Protein', 'White', 'Protein', true, ARRAY['meat', 'protein', 'vitamin-b', 'lean'], 'Lean source of high-quality protein, B vitamins, and iron. Supports tissue growth and maternal health.', 'Must be cooked thoroughly to 75°C internal temperature. No pink meat', 'limit'),
    ('Turkey (Lean)', '3 oz (85g)', 'Protein', 'White', 'Protein', true, ARRAY['meat', 'protein', 'zinc', 'lean'], 'Lean protein rich in zinc, B vitamins, and iron. Great alternative to chicken.', 'Store leftovers properly within 2 hours. Reheat thoroughly', 'limit'),
    ('Greek Yogurt', '1 cup (200g)', 'Dairy', 'White', 'Calcium', true, ARRAY['dairy', 'protein', 'calcium', 'probiotic'], 'Excellent source of calcium, protein, iodine, and B12. Probiotics support gut health. Choose pasteurized only.', NULL, NULL),
    ('Milk (Pasteurized)', '1 cup', 'Dairy', 'White', 'Calcium', true, ARRAY['dairy', 'calcium', 'vitamin-d'], 'Excellent source of calcium, Vitamin D, protein, iodine, and B12. Essential for bone development.', NULL, NULL),
    ('Tofu (Firm)', '1/2 cup (100g)', 'Protein', 'White', 'Protein', true, ARRAY['vegetarian', 'protein', 'calcium', 'iron'], 'Excellent plant-based protein and calcium (if calcium-set). Rich in iron. Great for vegetarians/vegans.', NULL, NULL),
    ('Lentils (Cooked)', '1 cup', 'Protein', 'Brown', 'Folate', true, ARRAY['legume', 'folate-rich', 'iron-rich', 'vegetarian', 'fiber'], 'SUPERSTAR plant protein - packed with folate, iron, protein, fiber, and zinc. Essential for vegetarians.', NULL, NULL),
    ('Brown Rice', '1 cup cooked', 'Carbohydrate', 'Brown', 'Fiber', true, ARRAY['grain', 'fiber'], 'Provides fiber and B vitamins. Helps prevent constipation.', NULL, NULL),
    ('Walnuts', '1 oz (14 halves)', 'Fat', 'Brown', 'Omega-3', true, ARRAY['nuts', 'omega3', 'healthy-fat'], 'Best nut source of plant-based omega-3 ALA, plus protein and fiber. Supports brain development.', NULL, NULL),
    ('Almonds', '1 oz (23 nuts)', 'Fat', 'Brown', 'Vitamin E', true, ARRAY['nuts', 'healthy-fat', 'calcium'], 'Rich in healthy fats, calcium, and vitamin E. Good source of protein and fiber.', NULL, NULL),
    ('White Beans', '1 cup', 'Protein', 'White', 'Fiber', true, ARRAY['legume', 'fiber', 'vegetarian', 'iron'], 'High in fiber, iron, folate, calcium, and zinc. Excellent plant protein source.', NULL, NULL),
    ('Sardines (Canned)', '3 oz (85g)', 'Protein', 'Blue', 'DHA', true, ARRAY['seafood', 'omega3', 'calcium', 'vitamin-d'], 'LOW MERCURY option - excellent source of DHA, calcium (if eating bones), Vitamin D, and protein.', 'Eat bones for extra calcium. Low mercury = safer than large fish', 'limit')
ON CONFLICT (name) DO NOTHING;

-- UNSAFE Foods (examples)
INSERT INTO foods (name, macro_category, rainbow_color, is_safe_pregnancy, warning_message, warning_type, tags) VALUES
    ('Raw Sushi', 'Protein', 'Red', false, 'Raw fish may contain harmful bacteria and parasites. Avoid during pregnancy.', 'unsafe', ARRAY['seafood', 'raw']),
    ('Unpasteurized Cheese', 'Dairy', 'White', false, 'May contain Listeria bacteria. Only eat pasteurized dairy during pregnancy.', 'unsafe', ARRAY['dairy', 'raw']),
    ('Raw Eggs', 'Protein', 'Yellow', false, 'May contain Salmonella. Only eat fully cooked eggs during pregnancy.', 'unsafe', ARRAY['raw'])
ON CONFLICT (name) DO NOTHING;

-- ============================================================================
-- LINK NUTRIENTS TO FOODS (Evidence-Based Nutritional Mapping)
-- ============================================================================

-- RED FOODS
-- Tomatoes: Vitamin C
INSERT INTO food_nutrients (food_id, nutrient_id, is_present)
SELECT f.id, n.id, true FROM foods f, nutrients n WHERE f.name = 'Tomatoes' AND n.name IN ('vitamin_c') ON CONFLICT DO NOTHING;

-- Red Bell Pepper: Excellent source of Folate & Vitamin C
INSERT INTO food_nutrients (food_id, nutrient_id, is_present)
SELECT f.id, n.id, true FROM foods f, nutrients n WHERE f.name = 'Red Bell Pepper' AND n.name IN ('folate', 'vitamin_c') ON CONFLICT DO NOTHING;

-- Strawberries: Folate & Vitamin C
INSERT INTO food_nutrients (food_id, nutrient_id, is_present)
SELECT f.id, n.id, true FROM foods f, nutrients n WHERE f.name = 'Strawberries' AND n.name IN ('folate', 'vitamin_c', 'fiber') ON CONFLICT DO NOTHING;

-- Lean Beef: Best source of heme iron, plus B12, Zinc, Protein
INSERT INTO food_nutrients (food_id, nutrient_id, is_present)
SELECT f.id, n.id, true FROM foods f, nutrients n WHERE f.name = 'Lean Beef' AND n.name IN ('iron', 'protein', 'vitamin_b12', 'zinc') ON CONFLICT DO NOTHING;

-- ORANGE FOODS
-- Carrots: Vitamin A (beta-carotene)
INSERT INTO food_nutrients (food_id, nutrient_id, is_present)
SELECT f.id, n.id, true FROM foods f, nutrients n WHERE f.name = 'Carrots' AND n.name IN ('vitamin_a', 'fiber') ON CONFLICT DO NOTHING;

-- Sweet Potato: Vitamin A & Fiber
INSERT INTO food_nutrients (food_id, nutrient_id, is_present)
SELECT f.id, n.id, true FROM foods f, nutrients n WHERE f.name = 'Sweet Potato' AND n.name IN ('vitamin_a', 'fiber') ON CONFLICT DO NOTHING;

-- Orange: Folate & Vitamin C
INSERT INTO food_nutrients (food_id, nutrient_id, is_present)
SELECT f.id, n.id, true FROM foods f, nutrients n WHERE f.name = 'Orange' AND n.name IN ('folate', 'vitamin_c') ON CONFLICT DO NOTHING;

-- Salmon: Best source of DHA omega-3, plus Vitamin D, Protein, Iodine
INSERT INTO food_nutrients (food_id, nutrient_id, is_present)
SELECT f.id, n.id, true FROM foods f, nutrients n WHERE f.name = 'Salmon (Grilled)' AND n.name IN ('dha', 'protein', 'vitamin_d', 'iodine', 'vitamin_b12') ON CONFLICT DO NOTHING;

-- YELLOW FOODS
-- Banana: Fiber & Vitamin B6
INSERT INTO food_nutrients (food_id, nutrient_id, is_present)
SELECT f.id, n.id, true FROM foods f, nutrients n WHERE f.name = 'Banana' AND n.name IN ('fiber') ON CONFLICT DO NOTHING;

-- Corn: Fiber & Folate
INSERT INTO food_nutrients (food_id, nutrient_id, is_present)
SELECT f.id, n.id, true FROM foods f, nutrients n WHERE f.name = 'Corn' AND n.name IN ('fiber', 'folate') ON CONFLICT DO NOTHING;

-- Yellow Bell Pepper: Vitamin C
INSERT INTO food_nutrients (food_id, nutrient_id, is_present)
SELECT f.id, n.id, true FROM foods f, nutrients n WHERE f.name = 'Yellow Bell Pepper' AND n.name IN ('vitamin_c') ON CONFLICT DO NOTHING;

-- British Lion Eggs: Excellent source of Choline, plus Protein, Vitamin D, B12, Iodine
INSERT INTO food_nutrients (food_id, nutrient_id, is_present)
SELECT f.id, n.id, true FROM foods f, nutrients n WHERE f.name = 'British Lion Eggs' AND n.name IN ('choline', 'protein', 'vitamin_d', 'vitamin_b12', 'iodine') ON CONFLICT DO NOTHING;

-- Chickpeas: Great plant-based Folate, Iron, Protein, Fiber, Zinc
INSERT INTO food_nutrients (food_id, nutrient_id, is_present)
SELECT f.id, n.id, true FROM foods f, nutrients n WHERE f.name = 'Chickpeas (Cooked)' AND n.name IN ('folate', 'iron', 'protein', 'fiber', 'zinc') ON CONFLICT DO NOTHING;

-- Quinoa: Complete protein, Iron, Folate, Fiber
INSERT INTO food_nutrients (food_id, nutrient_id, is_present)
SELECT f.id, n.id, true FROM foods f, nutrients n WHERE f.name = 'Quinoa (Cooked)' AND n.name IN ('protein', 'iron', 'folate', 'fiber') ON CONFLICT DO NOTHING;

-- GREEN FOODS
-- Spinach: Superstar - Folate, Iron, Calcium, Vitamin A & C
INSERT INTO food_nutrients (food_id, nutrient_id, is_present)
SELECT f.id, n.id, true FROM foods f, nutrients n WHERE f.name = 'Spinach' AND n.name IN ('folate', 'iron', 'calcium', 'vitamin_a', 'vitamin_c', 'fiber') ON CONFLICT DO NOTHING;

-- Broccoli: Folate, Calcium, Vitamin C, Fiber
INSERT INTO food_nutrients (food_id, nutrient_id, is_present)
SELECT f.id, n.id, true FROM foods f, nutrients n WHERE f.name = 'Broccoli' AND n.name IN ('folate', 'calcium', 'vitamin_c', 'fiber') ON CONFLICT DO NOTHING;

-- Avocado: Folate & Healthy fats
INSERT INTO food_nutrients (food_id, nutrient_id, is_present)
SELECT f.id, n.id, true FROM foods f, nutrients n WHERE f.name = 'Avocado' AND n.name IN ('folate', 'fiber') ON CONFLICT DO NOTHING;

-- Kiwi: Folate, Vitamin C, Fiber
INSERT INTO food_nutrients (food_id, nutrient_id, is_present)
SELECT f.id, n.id, true FROM foods f, nutrients n WHERE f.name = 'Kiwi' AND n.name IN ('folate', 'vitamin_c', 'fiber') ON CONFLICT DO NOTHING;

-- BLUE/PURPLE FOODS
-- Blueberries: Fiber & Vitamin C
INSERT INTO food_nutrients (food_id, nutrient_id, is_present)
SELECT f.id, n.id, true FROM foods f, nutrients n WHERE f.name = 'Blueberries' AND n.name IN ('fiber', 'vitamin_c') ON CONFLICT DO NOTHING;

-- Eggplant: Fiber
INSERT INTO food_nutrients (food_id, nutrient_id, is_present)
SELECT f.id, n.id, true FROM foods f, nutrients n WHERE f.name = 'Eggplant' AND n.name IN ('fiber') ON CONFLICT DO NOTHING;

-- Purple Cabbage: Vitamin C & Fiber
INSERT INTO food_nutrients (food_id, nutrient_id, is_present)
SELECT f.id, n.id, true FROM foods f, nutrients n WHERE f.name = 'Purple Cabbage' AND n.name IN ('vitamin_c', 'fiber') ON CONFLICT DO NOTHING;

-- WHITE/BROWN FOODS
-- Greek Yogurt: Excellent source of Calcium, Protein, Iodine, B12
INSERT INTO food_nutrients (food_id, nutrient_id, is_present)
SELECT f.id, n.id, true FROM foods f, nutrients n WHERE f.name = 'Greek Yogurt' AND n.name IN ('calcium', 'protein', 'iodine', 'vitamin_b12') ON CONFLICT DO NOTHING;

-- Milk (Pasteurized): Calcium, Vitamin D, Protein, Iodine, B12
INSERT INTO food_nutrients (food_id, nutrient_id, is_present)
SELECT f.id, n.id, true FROM foods f, nutrients n WHERE f.name = 'Milk (Pasteurized)' AND n.name IN ('calcium', 'vitamin_d', 'protein', 'iodine', 'vitamin_b12') ON CONFLICT DO NOTHING;

-- Lentils: Excellent plant-based Iron, Folate, Protein, Fiber, Zinc
INSERT INTO food_nutrients (food_id, nutrient_id, is_present)
SELECT f.id, n.id, true FROM foods f, nutrients n WHERE f.name = 'Lentils (Cooked)' AND n.name IN ('folate', 'iron', 'protein', 'fiber', 'zinc') ON CONFLICT DO NOTHING;

-- Brown Rice: Fiber
INSERT INTO food_nutrients (food_id, nutrient_id, is_present)
SELECT f.id, n.id, true FROM foods f, nutrients n WHERE f.name = 'Brown Rice' AND n.name IN ('fiber') ON CONFLICT DO NOTHING;

-- Almonds: Calcium, Vitamin E, Fiber
INSERT INTO food_nutrients (food_id, nutrient_id, is_present)
SELECT f.id, n.id, true FROM foods f, nutrients n WHERE f.name = 'Almonds' AND n.name IN ('calcium', 'fiber') ON CONFLICT DO NOTHING;

-- White Beans: Iron, Folate, Fiber, Calcium, Zinc
INSERT INTO food_nutrients (food_id, nutrient_id, is_present)
SELECT f.id, n.id, true FROM foods f, nutrients n WHERE f.name = 'White Beans' AND n.name IN ('iron', 'folate', 'fiber', 'calcium', 'zinc', 'protein') ON CONFLICT DO NOTHING;

-- Chicken (Breast): Lean Protein, B vitamins, Iron
INSERT INTO food_nutrients (food_id, nutrient_id, is_present)
SELECT f.id, n.id, true FROM foods f, nutrients n WHERE f.name = 'Chicken (Breast)' AND n.name IN ('protein', 'iron', 'zinc', 'vitamin_b12') ON CONFLICT DO NOTHING;

-- Turkey (Lean): Lean Protein, Zinc, B vitamins, Iron
INSERT INTO food_nutrients (food_id, nutrient_id, is_present)
SELECT f.id, n.id, true FROM foods f, nutrients n WHERE f.name = 'Turkey (Lean)' AND n.name IN ('protein', 'zinc', 'iron', 'vitamin_b12') ON CONFLICT DO NOTHING;

-- Tofu (Firm): Excellent plant protein, Calcium (if set), Iron
INSERT INTO food_nutrients (food_id, nutrient_id, is_present)
SELECT f.id, n.id, true FROM foods f, nutrients n WHERE f.name = 'Tofu (Firm)' AND n.name IN ('protein', 'calcium', 'iron') ON CONFLICT DO NOTHING;

-- Walnuts: Best plant-based Omega-3 source, Protein, Fiber
INSERT INTO food_nutrients (food_id, nutrient_id, is_present)
SELECT f.id, n.id, true FROM foods f, nutrients n WHERE f.name = 'Walnuts' AND n.name IN ('dha', 'protein', 'fiber') ON CONFLICT DO NOTHING;

-- Sardines (Canned): DHA, Calcium (with bones), Vitamin D, Protein
INSERT INTO food_nutrients (food_id, nutrient_id, is_present)
SELECT f.id, n.id, true FROM foods f, nutrients n WHERE f.name = 'Sardines (Canned)' AND n.name IN ('dha', 'calcium', 'vitamin_d', 'protein', 'iodine', 'vitamin_b12') ON CONFLICT DO NOTHING;

-- ============================================================================
-- SAMPLE DATA: Weekly Milestones
-- ============================================================================
INSERT INTO weekly_milestones (week_number, baby_development_info, recommended_rainbow_focus, priority_nutrient, priority_goal) VALUES
    (14, 'Baby''s kidneys are functioning and producing urine', 'Green', 'Calcium', 'Include calcium-rich foods daily for bone development'),
    (15, 'Baby can sense light and make facial expressions', 'Orange', 'Vitamin A', 'Include colorful vegetables for eye development'),
    (16, 'Baby''s nervous system is developing rapidly', 'Green', 'Folate', 'Continue high folate intake for neural development'),
    (17, 'Baby is storing fat for energy regulation', 'Orange', 'DHA', 'Include omega-3 rich foods for brain development'),
    (18, 'Baby''s bones are hardening', 'White', 'Calcium', 'Maintain high calcium intake for skeletal development')
ON CONFLICT (week_number) DO NOTHING;
