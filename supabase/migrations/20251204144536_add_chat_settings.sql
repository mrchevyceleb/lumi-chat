-- Add model_id and use_search columns to chats table for conversation-specific settings

ALTER TABLE "public"."chats" 
ADD COLUMN IF NOT EXISTS "model_id" text,
ADD COLUMN IF NOT EXISTS "use_search" boolean DEFAULT false;

-- Add comment explaining these fields
COMMENT ON COLUMN "public"."chats"."model_id" IS 'The model ID selected for this specific conversation. If null, uses the user''s default model.';
COMMENT ON COLUMN "public"."chats"."use_search" IS 'Whether web search is enabled for this specific conversation.';
