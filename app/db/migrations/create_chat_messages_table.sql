-- Create chat_messages table to store conversation history
CREATE TABLE IF NOT EXISTS chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('user', 'model', 'system')),
    content TEXT NOT NULL,
    message_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Create indexes separately
CREATE INDEX IF NOT EXISTS idx_chat_messages_user_date ON chat_messages (user_id, message_date);
CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages (session_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created ON chat_messages (created_at DESC);

-- Add comments
COMMENT ON TABLE chat_messages IS 'Stores chat conversation history between users and the AI agent';
COMMENT ON COLUMN chat_messages.role IS 'Message sender: user, model (AI), or system (greeting)';
COMMENT ON COLUMN chat_messages.message_date IS 'Date of message for daily greeting tracking';
COMMENT ON COLUMN chat_messages.metadata IS 'Additional metadata like message_type, is_greeting, etc.';
