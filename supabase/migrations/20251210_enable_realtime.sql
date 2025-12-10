-- Enable Realtime for chats and messages tables for cross-device sync
-- This allows Supabase to broadcast INSERT/UPDATE/DELETE events to subscribed clients

-- Enable realtime for chats table
ALTER PUBLICATION supabase_realtime ADD TABLE public.chats;

-- Enable realtime for messages table
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;

-- Enable realtime for folders table (for completeness)
ALTER PUBLICATION supabase_realtime ADD TABLE public.folders;

