-- Diagnostic and Backfill Migration
-- This will:
-- 1. Log current state
-- 2. Backfill user_id from metadata for all documents

-- First, let's do the backfill
-- Update documents where user_id is NULL but metadata has a valid UUID user_id
UPDATE documents
SET user_id = (metadata->>'user_id')::uuid
WHERE user_id IS NULL
  AND metadata->>'user_id' IS NOT NULL
  AND metadata->>'user_id' ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';

-- Create a simple diagnostic function to check status
-- (This is optional, just for verification)
DO $$
DECLARE
  total_count INTEGER;
  with_user_id INTEGER;
  without_user_id INTEGER;
BEGIN
  SELECT COUNT(*) INTO total_count FROM documents;
  SELECT COUNT(*) INTO with_user_id FROM documents WHERE user_id IS NOT NULL;
  SELECT COUNT(*) INTO without_user_id FROM documents WHERE user_id IS NULL;
  
  RAISE NOTICE 'DIAGNOSTIC: Total documents: %, With user_id: %, Without user_id: %', 
    total_count, with_user_id, without_user_id;
END $$;
