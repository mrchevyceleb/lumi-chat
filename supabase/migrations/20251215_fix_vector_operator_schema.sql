-- Fix: Vector operator schema mismatch
-- The <=> operator is defined in the 'extensions' schema where pgvector is installed
-- but the match_documents function had search_path = public, so the operator wasn't found

-- Drop the old function
DROP FUNCTION IF EXISTS "public"."match_documents"(extensions.vector, double precision, integer, jsonb);
DROP FUNCTION IF EXISTS "public"."match_documents"(extensions.vector, double precision, integer);

-- Recreate with proper search_path that includes extensions schema
CREATE OR REPLACE FUNCTION "public"."match_documents"(
  query_embedding extensions.vector,
  match_threshold double precision DEFAULT 0.5,
  match_count integer DEFAULT 5,
  filter jsonb DEFAULT '{}'::jsonb
) RETURNS TABLE(id uuid, content text, metadata jsonb, similarity double precision)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  filter_user_id uuid;
BEGIN
  -- Extract user_id from filter for column-level filtering
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
    -- JSONB metadata filter (existing behavior for conversation_id, etc.)
    AND (filter = '{}'::jsonb OR d.metadata @> filter)
    -- User ID filter: check column first, fall back to metadata for backwards compatibility
    AND (
      filter_user_id IS NULL
      OR d.user_id = filter_user_id
      OR (d.user_id IS NULL AND d.metadata->>'user_id' = filter_user_id::text)
    )
  ORDER BY d.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

ALTER FUNCTION "public"."match_documents"(extensions.vector, double precision, integer, jsonb) OWNER TO postgres;
