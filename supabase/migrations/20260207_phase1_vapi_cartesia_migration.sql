-- ============================================================
-- Phase 1 Migration - Vapi+Cartesia Integration
-- Migration: phase1_vapi_cartesia_migration
-- Reference: REQUIREMENTS.yaml database.user_profiles, database.user_poi_notifications
-- Issue: #16 Database Schema Migration - Phase 1
-- ============================================================
-- Changes:
--   1. Add location settings columns to user_profiles
--   2. Add notification TTS settings columns to user_profiles
--   3. Create user_poi_notifications table (cool-down time management)
-- ============================================================

-- ============================================================
-- 1. Add Location Settings Columns to user_profiles
-- ============================================================

-- Location cool time (ms) - default 30 minutes (1800000ms)
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS location_cool_time INTEGER DEFAULT 1800000;

-- Location search radius (meters) - default 100m
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS location_search_radius INTEGER DEFAULT 100;

-- ============================================================
-- 2. Add Notification TTS Settings Columns to user_profiles
-- ============================================================

-- Enable/disable notification TTS
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS notification_tts_enabled BOOLEAN DEFAULT true;

-- Maximum TTS text length - default 200 characters
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS notification_tts_max_length INTEGER DEFAULT 200;

-- Include notification title in TTS
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS notification_tts_include_title BOOLEAN DEFAULT true;

-- Include notification body in TTS
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS notification_tts_include_body BOOLEAN DEFAULT true;

-- ============================================================
-- 3. Create user_poi_notifications Table (Cool-down Time Management)
-- ============================================================

CREATE TABLE IF NOT EXISTS user_poi_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  poi_id TEXT NOT NULL,           -- Google Places place_id
  poi_name TEXT NOT NULL,         -- POI name (e.g., "東京駅")
  notified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  latitude REAL NOT NULL,
  longitude REAL NOT NULL
);

-- ============================================================
-- 4. Indexes for Performance
-- ============================================================

-- Composite index for cool-down time lookup
CREATE INDEX IF NOT EXISTS idx_user_poi ON user_poi_notifications(user_id, poi_id, notified_at);

-- Additional index for POI name search (useful for debugging)
CREATE INDEX IF NOT EXISTS idx_poi_name ON user_poi_notifications(poi_name);

-- ============================================================
-- 5. Comments for Documentation
-- ============================================================

-- user_profiles comments
COMMENT ON COLUMN user_profiles.location_cool_time IS 'Location cool down time in milliseconds (default: 1800000 = 30 minutes)';
COMMENT ON COLUMN user_profiles.location_search_radius IS 'Location search radius in meters (default: 100)';
COMMENT ON COLUMN user_profiles.notification_tts_enabled IS 'Enable/disable notification text-to-speech (default: true)';
COMMENT ON COLUMN user_profiles.notification_tts_max_length IS 'Maximum TTS text length in characters (default: 200)';
COMMENT ON COLUMN user_profiles.notification_tts_include_title IS 'Include notification title in TTS (default: true)';
COMMENT ON COLUMN user_profiles.notification_tts_include_body IS 'Include notification body in TTS (default: true)';

-- user_poi_notifications comments
COMMENT ON TABLE user_poi_notifications IS 'POI notification history for cool-down time management (REQUIREMENTS.yaml)';
COMMENT ON COLUMN user_poi_notifications.poi_id IS 'Google Places place_id (unique identifier)';
COMMENT ON COLUMN user_poi_notifications.poi_name IS 'Human-readable POI name (e.g., "東京駅")';
COMMENT ON COLUMN user_poi_notifications.notified_at IS 'Timestamp when notification was sent';
COMMENT ON COLUMN user_poi_notifications.latitude IS 'Latitude at notification time';
COMMENT ON COLUMN user_poi_notifications.longitude IS 'Longitude at notification time';

-- ============================================================
-- 6. Row Level Security (RLS) - PoC Mode
-- ============================================================

ALTER TABLE user_poi_notifications ENABLE ROW LEVEL SECURITY;

-- PoC Policy: Allow all operations
CREATE POLICY "Allow all for PoC - POI notifications" ON user_poi_notifications
  FOR ALL USING (true) WITH CHECK (true);
