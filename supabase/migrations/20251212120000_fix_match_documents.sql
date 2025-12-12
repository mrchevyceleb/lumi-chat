-- Fix: match_documents function needs to handle documents where user_id column is NULL
-- but user_id exists in metadata (for backwards compatibility with existing data)

DROP FUNCTION IF EXISTS "public"."match_documents"(extensions.vector, double precision, integer, jsonb);

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

-- Also re-run the backfill to ensure all documents have user_id in the column
-- This will catch any that were missed
UPDATE "public"."documents" 
SET user_id = (metadata->>'user_id')::uuid 
WHERE metadata->>'user_id' IS NOT NULL 
  AND user_id IS NULL
  AND metadata->>'user_id' ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
