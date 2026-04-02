-- Migration: Add timezone column to events table
-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor > New Query)

-- Add timezone column to events table (nullable text, stores IANA timezone string)
ALTER TABLE events
ADD COLUMN IF NOT EXISTS timezone text DEFAULT NULL;

-- Add a comment for documentation
COMMENT ON COLUMN events.timezone IS 'IANA timezone the event was created in (e.g. America/Los_Angeles). NULL = floating/no timezone.';
