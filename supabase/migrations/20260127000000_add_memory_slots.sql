-- ============================================================
-- Memory Slots Migration
-- Migration: add_memory_slots
-- Reference: REQUIREMENTS_v3.yaml
-- ============================================================
-- Changes:
--   1. Create user_memory_slots table (fixed 10 slots per user)
--   2. Deprecate user_memories table (append-only, replaced by slots)
--   3. Add indexes and RLS policies
-- ============================================================

-- ============================================================
-- User Memory Slots Table (Fixed 10 slots per user)
-- ============================================================
CREATE TABLE IF NOT EXISTS user_memory_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  slot_number INTEGER NOT NULL CHECK (slot_number BETWEEN 1 AND 10),
  content TEXT NOT NULL DEFAULT '' CHECK (LENGTH(content) <= 200),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add unique constraint: one user cannot have multiple entries for the same slot
CREATE UNIQUE INDEX idx_user_memory_slots_unique ON user_memory_slots(user_id, slot_number);

-- Add index for faster lookups
CREATE INDEX idx_user_memory_slots_user_id ON user_memory_slots(user_id);

-- Comments for documentation
COMMENT ON TABLE user_memory_slots IS 'Fixed 10 memory slots per user (REQUIREMENTS_v3)';
COMMENT ON COLUMN user_memory_slots.slot_number IS 'Slot number 1-10';
COMMENT ON COLUMN user_memory_slots.content IS 'Memory content, max 200 characters. Empty string means slot is empty.';
COMMENT ON COLUMN user_memory_slots.updated_at IS 'Last update timestamp';

-- ============================================================
-- Initialize empty slots for existing users
-- ============================================================
-- For each existing user, create 10 empty slots if they don't exist
INSERT INTO user_memory_slots (user_id, slot_number, content)
SELECT DISTINCT up.id, generate_series, ''
FROM user_profiles up
CROSS JOIN LATERAL generate_series(1, 10) AS generate_series
LEFT JOIN user_memory_slots ums ON up.id = ums.user_id AND ums.slot_number = generate_series
WHERE ums.id IS NULL;

-- ============================================================
-- Row Level Security (RLS) - PoC Mode
-- ============================================================
ALTER TABLE user_memory_slots ENABLE ROW LEVEL SECURITY;

-- PoC Policy: Allow all operations
CREATE POLICY "Allow all for PoC - memory slots" ON user_memory_slots
  FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- Production RLS Policies (commented out for PoC)
-- ============================================================
/*
DROP POLICY IF EXISTS "Allow all for PoC - memory slots" ON user_memory_slots;

-- Users can only access their own memory slots
CREATE POLICY "Users can access own memory slots" ON user_memory_slots
  FOR ALL USING (user_id = auth.uid());
*/

-- ============================================================
-- Mark user_memories table as deprecated
-- ============================================================
COMMENT ON TABLE user_memories IS 'DEPRECATED: Replaced by user_memory_slots (REQUIREMENTS_v3)';
