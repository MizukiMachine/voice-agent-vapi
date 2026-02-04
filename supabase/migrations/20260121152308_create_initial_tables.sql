-- Voice Engine Studio - Initial Tables
-- Migration: create_initial_tables

-- ============================================================
-- User Profiles Table
-- ============================================================
CREATE TABLE user_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  voice_profile_blob TEXT,  -- Base64 encoded voice profile data
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add comment for documentation
COMMENT ON TABLE user_profiles IS 'Stores user information and voice profile data for identification';
COMMENT ON COLUMN user_profiles.voice_profile_blob IS 'Base64 encoded Picovoice Eagle voice profile';

-- ============================================================
-- User Memories Table
-- ============================================================
CREATE TABLE user_memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  fact TEXT NOT NULL,  -- Extracted fact from conversation
  source TEXT,         -- Source of the fact (e.g., 'conversation', 'explicit')
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add comment for documentation
COMMENT ON TABLE user_memories IS 'Stores extracted facts/memories from user conversations';
COMMENT ON COLUMN user_memories.fact IS 'A single fact about the user extracted from conversation';
COMMENT ON COLUMN user_memories.source IS 'Origin of the fact: conversation, explicit_memo, etc.';

-- ============================================================
-- Indexes for Performance
-- ============================================================
CREATE INDEX idx_user_memories_user_id ON user_memories(user_id);
CREATE INDEX idx_user_memories_created_at ON user_memories(created_at DESC);

-- ============================================================
-- Row Level Security (RLS) - PoC Mode
-- ============================================================
-- Note: For PoC, we allow all operations. In production, these policies
-- should be updated to use Supabase Auth (auth.uid())

-- Enable RLS on tables
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_memories ENABLE ROW LEVEL SECURITY;

-- PoC Policy: Allow all operations (replace with auth-based policies in production)
CREATE POLICY "Allow all for PoC - profiles" ON user_profiles
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all for PoC - memories" ON user_memories
  FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- Production RLS Policies (commented out for PoC)
-- Uncomment and modify when integrating Supabase Auth
-- ============================================================
/*
-- Drop PoC policies first
DROP POLICY IF EXISTS "Allow all for PoC - profiles" ON user_profiles;
DROP POLICY IF EXISTS "Allow all for PoC - memories" ON user_memories;

-- Production: Users can only access their own profile
CREATE POLICY "Users can access own profile" ON user_profiles
  FOR ALL USING (auth.uid() = id);

-- Production: Users can only access their own memories
CREATE POLICY "Users can access own memories" ON user_memories
  FOR ALL USING (user_id = auth.uid());
*/
