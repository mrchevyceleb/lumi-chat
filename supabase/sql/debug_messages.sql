-- Debug script to check message counts
-- Run with: supabase db query --file ./sql/debug_messages.sql --linked

-- Total messages
SELECT COUNT(*) as total_messages FROM messages;

-- Messages per chat
SELECT chat_id, COUNT(*) as message_count
FROM messages
GROUP BY chat_id
ORDER BY message_count DESC
LIMIT 10;

-- Messages for the specific problematic chat
SELECT COUNT(*) as count_for_01d7bc17
FROM messages 
WHERE chat_id = '01d7bc17-6294-446f-9981-10abd023e1b8';

-- Recent messages (newest first)
SELECT chat_id, role, LEFT(content, 50) as content_preview, 
       TO_TIMESTAMP(timestamp/1000) as created_at
FROM messages
ORDER BY timestamp DESC
LIMIT 20;

-- Check if the chat exists
SELECT id, title, TO_TIMESTAMP(last_updated/1000) as last_updated
FROM chats
WHERE id = '01d7bc17-6294-446f-9981-10abd023e1b8';

