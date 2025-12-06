# RAG Memory System Diagnostics

## What Was Fixed

Your RAG (Retrieval-Augmented Generation) memory system has been enhanced with comprehensive logging and debugging features to help diagnose and fix any issues.

### Changes Made

1. **Enhanced Logging in Client-Side Services**
   - Added detailed console logging to `services/ragService.ts`
   - Logs now show when RAG is being called, skipped, or returning results
   - Added logging in `App.tsx` to track RAG context retrieval

2. **Improved Edge Function Logging**
   - Enhanced `get-rag-context` function with detailed logging
   - Enhanced `embed-and-store-gemini-document` function with detailed logging
   - All edge functions now log their operations and errors with emojis for easy scanning

3. **Fixed `isSimpleFollowUp` Heuristic**
   - Reduced the threshold from 30 to 20 characters
   - Made patterns more strict to avoid false positives
   - Added logging to show when messages are being skipped

4. **Added Visual RAG Indicator**
   - Model responses now show a 🧠 Memory badge when RAG context was used
   - Hover over the badge to see how much context was used

5. **Verified Configuration**
   - Confirmed all required secrets are set (`GOOGLE_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`)
   - Verified project is correctly linked
   - Deployed updated edge functions

## How to Test

### 1. Open Browser Console
Open your browser's developer tools (F12) and go to the Console tab.

### 2. Send a Test Message
Send a message that should trigger RAG. You should see logs like:

```
📝 App: Requesting RAG context...
🔍 RAG: Will fetch context (not a simple follow-up)
🔍 RAG: Fetching context for message: {...}
🟢 RAG Context received: {...}
📝 App: RAG context retrieved: {...}
```

### 3. Check Edge Function Logs
Go to your Supabase Dashboard > Edge Functions and check the logs for:
- `get-rag-context`
- `embed-and-store-gemini-document`

Look for logs with emojis:
- 📥 = Request received
- 🔮 = Generating embedding
- ✅ = Success
- ❌ = Error
- ⚠️ = Warning
- 🔍 = Searching
- 💾 = Saving

### 4. Check the Database
Run this SQL in the Supabase SQL Editor to check if documents are being stored:

```sql
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

-- Check if embeddings are present
SELECT 
  COUNT(*) as total,
  COUNT(CASE WHEN embedding IS NOT NULL THEN 1 END) as has_embedding
FROM public.documents;
```

### 5. Look for Visual Indicators
When a response uses RAG memory, you should see a small purple 🧠 Memory badge at the bottom of the AI's message bubble.

## Common Issues and Solutions

### Issue: "No matching documents found" in logs
**Solution:** This means no memories are stored yet, or the similarity threshold is too high.
- Have a conversation and check if memories are being saved (look for "💾 RAG: Saving memory..." logs)
- Check the documents table in your database

### Issue: "RAG skipped: Simple follow-up detected"
**Solution:** The message was too short and matched a simple pattern.
- Send a longer, more detailed message
- The new threshold is 20 characters (was 30)

### Issue: No RAG logs appear at all
**Solution:** Check if the edge functions are deployed correctly
- Run: `supabase functions deploy get-rag-context`
- Run: `supabase functions deploy embed-and-store-gemini-document`

### Issue: "Failed to get user from token"
**Solution:** Authentication issue
- Sign out and sign back in
- Check that you're logged in

### Issue: Edge function errors about missing API keys
**Solution:** Verify secrets are set
- Run: `supabase secrets list`
- Should show: `GOOGLE_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- If missing, set them: `supabase secrets set GOOGLE_API_KEY="your-key"`

## Testing Checklist

- [ ] Browser console shows RAG logs when sending messages
- [ ] Edge function logs show successful embedding generation
- [ ] Database contains documents in the `documents` table
- [ ] Documents have embeddings (not NULL)
- [ ] Documents have correct metadata (user_id, conversation_id)
- [ ] Responses show the 🧠 Memory badge when using RAG
- [ ] Saving memories shows success logs after each conversation

## Next Steps

If RAG is still not working after checking all of the above:

1. Share the console logs from the browser
2. Share the edge function logs from Supabase Dashboard
3. Share the results of the SQL queries above
4. Check if there are any CORS or network errors in the browser Network tab

## Architecture Overview

```
User sends message
    ↓
App.tsx: getRagContext() called
    ↓
ragService.ts: Check if simple follow-up (skip if yes)
    ↓
Supabase Edge Function: get-rag-context
    ↓
Generate embedding for query
    ↓
Search documents table with vector similarity
    ↓
Return matching documents as context
    ↓
geminiService.ts: Include RAG context in prompt
    ↓
AI generates response with memory context
    ↓
ragService.ts: saveMemory() called
    ↓
Supabase Edge Function: embed-and-store-gemini-document
    ↓
Generate embedding for conversation
    ↓
Store in documents table with metadata
```

## Console Log Examples

### Successful RAG Retrieval:
```
📝 App: Requesting RAG context... {chatId: "...", conversationLength: 3, ...}
🔍 RAG: Will fetch context (not a simple follow-up)
🔍 RAG: Fetching context for message: {messageLength: 45, ...}
🟢 RAG Context received: {length: 256, hasContext: true, ...}
📝 App: RAG context retrieved: {hasContext: true, contextLength: 256, ...}
```

### Successful Memory Save:
```
💾 RAG: Saving memory... {userId: "...", conversationId: "...", ...}
🟢 Memory saved successfully: {id: "..."}
```

### Simple Follow-up Skipped:
```
🔵 RAG skipped: Simple follow-up detected: yes
```

