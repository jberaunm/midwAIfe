-- ============================================================================
-- MIGRATION: Add Daily Logs for Sleep and Symptoms Tracking
-- Created: 2026-01-18
-- ============================================================================

-- ============================================================================
-- Create daily_logs table to track sleep and symptoms per day
-- ============================================================================
CREATE TABLE IF NOT EXISTS daily_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    log_date DATE NOT NULL DEFAULT CURRENT_DATE,

    -- Sleep tracking
    sleep_hours DECIMAL(3,1) CHECK (sleep_hours >= 0 AND sleep_hours <= 24), -- e.g., 6.5, 8.0
    sleep_quality TEXT CHECK (sleep_quality IN ('poor', 'fair', 'good', 'excellent')),
    sleep_notes TEXT, -- Optional notes about sleep (e.g., "Woke up 3 times")

    -- Symptoms tracking
    symptoms TEXT[], -- Array of symptoms (e.g., ['nausea', 'fatigue', 'headache'])
    symptom_severity TEXT CHECK (symptom_severity IN ('mild', 'moderate', 'severe')),
    symptom_notes TEXT, -- Detailed notes about symptoms

    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Ensure only one log per user per day
    UNIQUE(user_id, log_date)
);

-- ============================================================================
-- Indexes for Performance
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_daily_logs_user_date ON daily_logs(user_id, log_date);
CREATE INDEX IF NOT EXISTS idx_daily_logs_user_week ON daily_logs(user_id, log_date DESC);

-- ============================================================================
-- Trigger for automatic updated_at timestamp
-- ============================================================================
CREATE TRIGGER update_daily_logs_updated_at BEFORE UPDATE ON daily_logs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Common Pregnancy Symptoms Reference (for UI dropdowns)
-- ============================================================================
COMMENT ON COLUMN daily_logs.symptoms IS
'Common values: nausea, vomiting, fatigue, headache, back_pain, leg_cramps,
heartburn, constipation, swelling, mood_changes, insomnia, dizziness,
breast_tenderness, frequent_urination, shortness_of_breath';
