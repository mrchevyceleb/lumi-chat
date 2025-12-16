# Troubleshooting Guide

This guide helps diagnose and resolve common issues in Lumi Chat development and usage.

## Console Logging Reference

First, check the browser console (F12 → Console tab) for these prefixes:

| Prefix | What it means | Examples |
|--------|---------------|----------|
| `[App]` | Application state | `[App] Network reconnected` |
| `[DB]` | Database operations | `[DB] Chat created successfully` |
| `[Realtime]` | Real-time sync status | `[Realtime] Messages subscription status: SUBSCRIBED` |
| `[Sync]` | Reconciliation attempts | `[Sync] Will retry chat... in 1000ms` |
| `[Gemini]` | AI streaming | `[Gemini] Stream chunk timeout` |
| `🧠 RAG` | Vector search | `🟢 RAG context found: 1250 chars` |
| `🟡 RAG unavailable` | RAG timeout | `🟡 RAG unavailable: RAG context fetch timed out` |

## Common Issues

### 1. Messages Send But Don't Appear

**Symptoms:**
- Message appears in UI momentarily then disappears
- Console shows `[DB] Failed to persist message`
- Other devices don't see the message

**Diagnosis:**
```bash
# Step 1: Check network tab for failed requests
DevTools → Network → filter "functions/v1"
Look for POST requests with status 400-500

# Step 2: Check console for auth errors
Look for "Invalid token" or "RLS policy violation"

# Step 3: Check Supabase Dashboard
Go to Tables → messages → check RLS policies
```

**Root Causes & Fixes:**

1. **Auth token expired**
   - Console shows: `Invalid token` or `JWT expired`
   - Fix: Close and reopen the app (will trigger re-auth)

2. **RLS policy denies write**
   - Console shows: `new row violates row-level security policy`
   - Fix: Check Supabase Dashboard → Authentication → Policies
   - Ensure authenticated user can insert into messages table

3. **Chat ID doesn't exist**
   - Console shows: `chat_id not found`
   - Fix: Verify chat was created first (should see `[DB] Chat created successfully`)

4. **Malformed message data**
   - Console shows: `Invalid format` or schema validation error
   - Fix: Check message fields match database schema

**Quick Fix:**
```
1. F12 → Console
2. Look for red errors
3. Check Supabase Dashboard authentication status
4. Force reload: Ctrl+Shift+R (hard refresh)
```

### 2. PWA Hangs or Becomes Unresponsive

**Symptoms:**
- After sending a message, the app freezes
- Spinner spins indefinitely
- Mobile app especially affected
- Other tabs/apps still work

**Diagnosis:**
```bash
# Step 1: Check for timeout indicators
Open console, send a message, look for:
- "🟡 RAG unavailable: RAG context fetch timed out"
- "[Gemini] Stream chunk timeout"
- "[Gemini] Total stream timeout exceeded"

# Step 2: Check network connectivity
Toggle airplane mode to see if connection issue

# Step 3: Check for stuck HTTP requests
DevTools → Network → look for stalled or pending requests
(particularly "functions/v1/gemini-chat" or "get-rag-context")
```

**Root Causes & Fixes:**

1. **RAG timeout (most common on mobile)**
   - Symptom: `🟡 RAG unavailable: RAG context fetch timed out`
   - Cause: Vector search taking >10 seconds
   - Fix: This is intentional - RAG is skipped, message sends without context
   - Persistent issue: Check Supabase PostgreSQL CPU usage

2. **Streaming timeout**
   - Symptom: `[Gemini] Stream chunk timeout` or `Total stream timeout exceeded`
   - Cause: AI response generating for >5 minutes or no data for 30 seconds
   - Fix: Wait for timeout (will auto-complete), force reload if frozen
   - Persistent issue: Check API provider status (Google Gemini, OpenAI, etc.)

3. **Network issue**
   - Symptom: `[App] Network disconnected`
   - Cause: Lost connection while streaming
   - Fix: Reconnect to network, the app will re-sync when online
   - Persistent issue: Check WiFi/mobile signal strength

4. **Browser tab not focused**
   - Symptom: Appears frozen but works when you click the tab
   - Cause: Browser throttles background tabs
   - Fix: Keep tab focused while waiting for response
   - Prevent: Disable "Background Tab Throttling" in DevTools

**Quick Fix:**
```
1. Check console for timeout messages (see above)
2. If RAG timeout: normal behavior, message will send without context
3. If streaming timeout: wait or reload
4. If network issue: check internet connection
5. Last resort: Ctrl+Shift+R (hard refresh)
```

### 3. Chats Don't Sync Between Devices

**Symptoms:**
- Create chat on phone, doesn't appear on laptop
- Send message on one device, doesn't appear on another
- Changes visible after manual refresh but not in real-time

**Diagnosis:**
```bash
# Step 1: Check realtime subscription status
Open console, look for:
[Realtime] Messages subscription status: SUBSCRIBED
[Realtime] Chats subscription status: SUBSCRIBED

# Step 2: Check for subscription errors
Look for "[Realtime] Subscription error:"

# Step 3: Test basic sync
1. Open console on Device A
2. Send a message
3. Look for "[Realtime] Messages subscription status: SUBSCRIBED"
4. Switch to Device B
5. Open console, send message
6. Check if it appears on Device A in real-time
```

**Root Causes & Fixes:**

1. **Realtime subscription not active**
   - Symptom: `[Realtime] ... subscription status: CHANNEL_ERROR` or not showing SUBSCRIBED
   - Cause: Network issue or Supabase service problem
   - Fix: Hard refresh (Ctrl+Shift+R), check internet connection
   - Check: Supabase Dashboard → Real-time status

2. **RLS policy denies read**
   - Symptom: Subscriptions show SUBSCRIBED but data never syncs
   - Cause: Row-level security policy doesn't allow reading other rows
   - Fix: Check Supabase policies:
     ```sql
     -- Correct policy allows reading all your own chats
     SELECT * FROM chat_sessions WHERE user_id = auth.uid()
     ```

3. **User not authenticated on one device**
   - Symptom: Changes sync on authenticated device but not on another
   - Cause: Session expired or not logged in
   - Fix: Sign out and sign back in on the inactive device

4. **Chat created while offline**
   - Symptom: Chat appears locally but doesn't sync when coming online
   - Cause: Chat was created without user_id in unsynced map
   - Fix: Try reconciliation prompt, or force reload to fully re-sync
   - Check: Console for `[Sync] Will retry chat...` messages

**Quick Fix:**
```
1. Check console for "[Realtime] ... subscription status: SUBSCRIBED"
2. If not SUBSCRIBED: hard refresh (Ctrl+Shift+R)
3. If SUBSCRIBED but not syncing: check Supabase Dashboard policies
4. Sign out and back in on all devices
5. Force reload: Ctrl+Shift+R
```

### 4. Messages Lost After Going Offline

**Symptoms:**
- Send message while offline, message appears locally
- Come back online, message disappears
- No `[Sync]` messages in console

**Diagnosis:**
```bash
# Step 1: Check network status indicator
Console should show:
[App] Network disconnected
[App] Network reconnected

# Step 2: Check sync reconciliation
Look for:
[Sync] Successfully reconciled chat...
[Sync] Will retry chat... in Xms

# Step 3: Check unsync storage
Open console and run:
JSON.parse(localStorage.getItem('lumi_unsynced_map'))
Should show your offline changes
```

**Root Causes & Fixes:**

1. **Reconciliation failed (max retries exceeded)**
   - Symptom: `[Sync]` messages show retry failures
   - Cause: Database error or permission issue on server
   - Fix: Force reload (Ctrl+Shift+R) to re-download state from server
   - Check: Supabase Dashboard for any alerts or errors

2. **Auth session expired**
   - Symptom: Come online but auth token invalid
   - Cause: Token expired while offline
   - Fix: Sign out and sign back in
   - Prevent: Check auth token refresh logic in supabaseClient.ts

3. **RLS policy issue**
   - Symptom: Reconciliation fails silently with no console error
   - Cause: Policy changed or user doesn't have write permissions
   - Fix: Check Supabase Dashboard → Authentication → Policies
   - Ensure INSERT policy allows authenticated users

4. **Unsynced map corruption**
   - Symptom: Unsynced messages in localStorage but not syncing
   - Cause: LocalStorage data corrupted or incompatible
   - Fix: Clear localStorage and reload
     ```javascript
     // In DevTools console:
     localStorage.clear()
     location.reload()
     ```

**Quick Fix:**
```
1. Check "[App] Network" messages confirm reconnection
2. Check "[Sync]" messages for reconciliation attempts
3. If successful: wait a few seconds, message should appear
4. If failed: Ctrl+Shift+R (hard refresh)
5. Last resort: localStorage.clear() and reload
```

### 5. RAG Memory Not Working

**Symptoms:**
- AI doesn't seem to remember previous conversations
- RAG context always empty
- See `🟢 RAG context found: 0 chars` or `🟡 RAG unavailable`

**Diagnosis:**
```bash
# Step 1: Check if RAG is enabled
Console should show:
🟢 RAG context found: 1250 chars (when context retrieved)

# Step 2: Check for timeouts
Look for:
🟡 RAG unavailable: RAG context fetch timed out

# Step 3: Check documents stored
Run in console:
await supabase.from('documents').select('*').limit(1)
Should return documents if any are stored

# Step 4: Check for vector search errors
Look in Supabase Dashboard → Functions → get-rag-context → Logs
```

**Root Causes & Fixes:**

1. **RAG timeout (10 seconds)**
   - Symptom: `🟡 RAG unavailable: RAG context fetch timed out`
   - Cause: Vector search taking too long
   - Fix: This is normal behavior, message will send without context
   - Optimization: Check database query performance, create indexes

2. **No documents stored**
   - Symptom: No RAG context in console despite having previous messages
   - Cause: Messages not being saved to vector store
   - Fix: Check if `embed-and-store-gemini-document` function ran
   - Check: Supabase Dashboard → functions → embed-and-store-gemini-document → Logs

3. **pgvector schema issue**
   - Symptom: Error `operator does not exist: extensions.vector <=> extensions.vector`
   - Cause: pgvector extension not in correct schema
   - Fix: Run migration `20251215_fix_vector_operator_schema.sql`
   - Check: Supabase Dashboard → SQL Editor → run:
     ```sql
     SELECT * FROM pg_extension WHERE extname = 'vector';
     SELECT schema_name FROM information_schema.schemata WHERE schema_name = 'extensions';
     ```

4. **RLS policy blocks RAG**
   - Symptom: Documents table queries fail silently
   - Cause: Row-level security policy too restrictive
   - Fix: Check Supabase Dashboard → tables → documents → RLS
   - Ensure policy allows selecting by user_id

5. **Simple follow-up optimization**
   - Symptom: Short messages like "yes" or "ok" don't trigger RAG
   - Cause: Intentional optimization to save API calls
   - Fix: Type longer messages for RAG context
   - Check: ragService.ts → isSimpleFollowUp() function

**Quick Fix:**
```
1. Check console for "🟢 RAG context found" vs "🟡 RAG unavailable"
2. If timeout: normal, message sends without context
3. If no context: check Supabase documents table in Dashboard
4. If pgvector error: run schema migration
5. Test with longer message (not just "yes"/"no")
```

### 6. Settings Don't Persist

**Symptoms:**
- Change model, reload, reverts to default
- Dark mode toggle resets after refresh
- Voice settings don't save

**Diagnosis:**
```bash
# Step 1: Check localStorage
Open DevTools → Application → Local Storage
Look for: lumi_dark_mode, lumi_default_model, lumi_voice_name

# Step 2: Check database
Run in console:
await supabase.from('user_settings').select('*').eq('user_id', (await supabase.auth.getUser()).data.user.id)

# Step 3: Check persistence logs
Look for "[DB]" messages in console after changing settings
```

**Root Causes & Fixes:**

1. **Settings not saved to database**
   - Symptom: localStorage updated but database not updated
   - Cause: DB save failed silently
   - Fix: Check console for `[DB]` errors
   - Debug: Check Supabase Dashboard logs

2. **Auth not available when settings change**
   - Symptom: Settings sync fails right after login
   - Cause: Session not fully initialized
   - Fix: Wait 2 seconds after login before changing settings
   - Check: See if session exists in Supabase Dashboard

3. **RLS policy blocks write**
   - Symptom: Settings don't update and no console error
   - Cause: RLS policy too restrictive
   - Fix: Check Supabase → tables → user_settings → RLS policies

4. **localStorage disabled**
   - Symptom: Settings disappear after reload even if DB updated
   - Cause: Browser localStorage disabled or full
   - Fix: Check DevTools → Application → Cookies → site
   - Ensure "Storage" is not disabled for this site
   - Clear browser storage if full: Settings → Storage → Clear cache

**Quick Fix:**
```
1. Check DevTools → Application → Local Storage for lumi_* keys
2. Change a setting and look for "[DB]" log
3. If no "[DB]" log: DB save failed, check Supabase
4. Reload and verify setting persists
5. If not: check RLS policies in Supabase Dashboard
```

## Advanced Debugging

### Enable Verbose Logging

Add this to the console to see all database operations:
```javascript
// In DevTools Console:
localStorage.setItem('DEBUG_LUMI', 'true');
location.reload();
```

### Check All Active Subscriptions

```javascript
// In DevTools Console:
// This requires access to internal Supabase state
supabase.getChannels().forEach(channel => {
  console.log('Channel:', channel.topic, 'State:', channel.state);
});
```

### View Current Sync State

```javascript
// In DevTools Console:
{
  chats: localStorage.getItem('lumi_chats_cache') ? 'cached' : 'none',
  unsynced: JSON.parse(localStorage.getItem('lumi_unsynced_map') || '{}'),
  activeChatId: localStorage.getItem('lumi_active_chat'),
  isOnline: navigator.onLine,
  sessions: (await supabase.auth.getSession()).data
}
```

### Monitor Realtime in Real-Time

```javascript
// In DevTools Console:
// Add this custom log function
window.realtimeDebug = true;

// Then find where subscriptions are created in App.tsx
// and add:
.on('postgres_changes', ..., (payload) => {
  if (window.realtimeDebug) {
    console.log('🔴 REALTIME CHANGE:', payload);
  }
})
```

## Contacting Support

When reporting an issue, include:
1. Browser and OS version
2. Steps to reproduce
3. Console logs (copy the entire console output)
4. Network tab requests/responses for failed calls
5. Supabase function logs (if backend issue suspected)
6. localStorage content (via `JSON.parse(localStorage.getItem('lumi_unsynced_map'))`)

Export console logs:
```javascript
// In DevTools Console:
copy(performance.memory ? 'Chrome' : 'Firefox'); // Browser type
copy(navigator.userAgent); // Full user agent
copy(localStorage); // All local storage
```
