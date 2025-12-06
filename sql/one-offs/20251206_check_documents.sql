-- Check if documents table has any data
-- This helps diagnose if RAG memories are being stored

-- Count total documents
SELECT COUNT(*) as total_documents FROM public.documents;

-- Check recent documents
SELECT 
  id,
  LEFT(content, 100) as content_preview,
  metadata,
  created_at
FROM public.documents
ORDER BY created_at DESC
LIMIT 10;

-- Check documents by user_id (if metadata contains user_id)
SELECT 
  metadata->>'user_id' as user_id,
  COUNT(*) as document_count
FROM public.documents
WHERE metadata ? 'user_id'
GROUP BY metadata->>'user_id';

-- Check if embeddings are present
SELECT 
  COUNT(*) as docs_with_embeddings,
  COUNT(CASE WHEN embedding IS NOT NULL THEN 1 END) as has_embedding,
  COUNT(CASE WHEN embedding IS NULL THEN 1 END) as missing_embedding
FROM public.documents;

