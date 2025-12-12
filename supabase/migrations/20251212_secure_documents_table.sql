-- Migration: Secure the documents table for multi-user RAG system
-- This migration adds proper Row Level Security (RLS) to the documents table
-- to ensure user data isolation for the RAG/embedding system.

-- ============================================
-- STEP 1: Add user_id column to documents table
-- ============================================
-- This is a non-destructive operation - existing data is preserved
ALTER TABLE "public"."documents" 
ADD COLUMN IF NOT EXISTS "user_id" uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- ============================================
-- STEP 2: Backfill existing data from metadata
-- ============================================
-- Migrate user_id from JSONB metadata to the new column
-- This preserves all existing RAG data
-- Only update rows where metadata user_id is a valid UUID format
UPDATE "public"."documents" 
SET user_id = (metadata->>'user_id')::uuid 
WHERE metadata->>'user_id' IS NOT NULL 
  AND user_id IS NULL
  AND metadata->>'user_id' ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';

-- ============================================
-- STEP 3: Add index for query performance
-- ============================================
-- Since RAG queries will filter by user_id, add an index
CREATE INDEX IF NOT EXISTS "idx_documents_user_id" 
ON "public"."documents" USING btree ("user_id");

-- ============================================
-- STEP 4: Enable Row Level Security
-- ============================================
ALTER TABLE "public"."documents" ENABLE ROW LEVEL SECURITY;

-- ============================================
-- STEP 5: Create RLS Policies
-- ============================================
-- Drop any existing policies first (in case of re-run)
DROP POLICY IF EXISTS "Users can select their own documents" ON "public"."documents";
DROP POLICY IF EXISTS "Users can insert their own documents" ON "public"."documents";
DROP POLICY IF EXISTS "Users can update their own documents" ON "public"."documents";
DROP POLICY IF EXISTS "Users can delete their own documents" ON "public"."documents";
DROP POLICY IF EXISTS "Service role has full access" ON "public"."documents";

-- Allow users to view only their own documents
CREATE POLICY "Users can select their own documents" 
  ON "public"."documents" 
  FOR SELECT 
  USING (auth.uid() = user_id);

-- Allow users to insert documents for themselves
CREATE POLICY "Users can insert their own documents" 
  ON "public"."documents" 
  FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

-- Allow users to update their own documents  
CREATE POLICY "Users can update their own documents" 
  ON "public"."documents" 
  FOR UPDATE 
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Allow users to delete their own documents
CREATE POLICY "Users can delete their own documents" 
  ON "public"."documents" 
  FOR DELETE 
  USING (auth.uid() = user_id);

-- Service role bypass (edge functions use service role key)
-- This ensures our Supabase Edge Functions continue to work
CREATE POLICY "Service role has full access" 
  ON "public"."documents"
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ============================================
-- STEP 6: Update match_documents function
-- ============================================
-- Drop existing function versions
DROP FUNCTION IF EXISTS "public"."match_documents"(extensions.vector, double precision, integer);
DROP FUNCTION IF EXISTS "public"."match_documents"(extensions.vector, double precision, integer, jsonb);

-- Recreate with user_id column filtering for extra security
-- This function is called by the get-rag-context edge function
CREATE OR REPLACE FUNCTION "public"."match_documents"(
  query_embedding extensions.vector,
  match_threshold double precision DEFAULT 0.5,
  match_count integer DEFAULT 5,
  filter jsonb DEFAULT '{}'::jsonb
) RETURNS TABLE(id uuid, content text, metadata jsonb, similarity double precision)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  filter_user_id uuid;
BEGIN
  -- Extract user_id from filter for column-level filtering
  -- This provides double security: both column and metadata filtering
  filter_user_id := (filter->>'user_id')::uuid;
  
  RETURN QUERY
  SELECT
    d.id,
    d.content,
    d.metadata,
    (1 - (d.embedding <=> query_embedding))::double precision AS similarity
  FROM documents d
  WHERE 
    -- Similarity threshold check
    1 - (d.embedding <=> query_embedding) > match_threshold
    -- JSONB metadata filter (existing behavior)
    AND (filter = '{}'::jsonb OR d.metadata @> filter)
    -- User ID column filter (new security layer)
    AND (filter_user_id IS NULL OR d.user_id = filter_user_id)
  ORDER BY d.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Set function owner
ALTER FUNCTION "public"."match_documents"(extensions.vector, double precision, integer, jsonb) OWNER TO postgres;

-- ============================================
-- VERIFICATION QUERIES (run manually to confirm)
-- ============================================
-- Check RLS is enabled:
-- SELECT tablename, rowsecurity FROM pg_tables WHERE tablename = 'documents';
--
-- Check policies exist:
-- SELECT policyname FROM pg_policies WHERE tablename = 'documents';
--
-- Check user_id column is populated:
-- SELECT id, user_id, metadata->>'user_id' as meta_user_id FROM documents LIMIT 5;
