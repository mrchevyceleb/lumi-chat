# Sync Architecture & Reliability

This document explains how Lumi Chat handles real-time synchronization across devices, offline changes, and network reconnection.

## Overview

Lumi Chat uses a multi-layered approach to ensure chats and messages stay in sync across devices:

1. **Supabase Realtime Subscriptions** - Live updates for messages and chats
2. **Network Status Detection** - Automatic detection of online/offline transitions
3. **Message Queuing** - Messages for inactive chats are queued, not discarded
4. **Reconciliation with Retry Logic** - Offline changes are reconciled with exponential backoff
5. **Error Handlers** - Subscription errors trigger logging and recovery attempts

## Architecture Layers

### Layer 1: Realtime Subscriptions

The app subscribes to two channels:

```typescript
// Messages channel: receives all changes to messages in user's chats
supabase.channel('messages-changes')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, ...)
  .subscribe(status => console.log(`[Realtime] Messages subscription status: ${status}`))

// Chats channel: receives all changes to user's chat sessions
supabase.channel('chats-changes')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_sessions' }, ...)
  .subscribe(status => console.log(`[Realtime] Chats subscription status: ${status}`))
```

Both subscriptions include error callbacks that log issues and attempt recovery:

```typescript
.subscribe((status, err) => {
  if (err) {
    console.error(`[Realtime] Subscription error:`, err);
    // Attempt recovery on next reconnect
  }
})
```

### Layer 2: Network Status Detection

The app monitors network connectivity and automatically re-syncs when coming back online:

```typescript
// Detect online/offline transitions
useEffect(() => {
  const handleOnline = () => {
    setIsOnline(true);
    console.log('[App] Network reconnected');
    // Trigger reconciliation for offline changes
  };

  const handleOffline = () => {
    setIsOnline(false);
    console.log('[App] Network disconnected');
  };

  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);

  return () => {
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
  };
}, []);
```

### Layer 3: Message Queuing for Unloaded Chats

When a realtime message arrives for a chat not currently loaded in the UI, instead of discarding it, the app queues it:

```typescript
const pendingRealtimeMessagesRef = useRef<Map<string, any[]>>(new Map());

// In realtime callback:
if (chatId !== activeChatIdRef.current) {
  // Chat not currently visible - queue the message
  if (!pendingRealtimeMessagesRef.current.has(chatId)) {
    pendingRealtimeMessagesRef.current.set(chatId, []);
  }
  pendingRealtimeMessagesRef.current.get(chatId)!.push(message);
} else {
  // Active chat - apply immediately
  setMessages(prev => [...prev, message]);
}

// When chat is opened, apply queued messages:
if (pendingRealtimeMessagesRef.current.has(chatId)) {
  const queued = pendingRealtimeMessagesRef.current.get(chatId) || [];
  setMessages(prev => [...prev, ...queued]);
  pendingRealtimeMessagesRef.current.delete(chatId);
}
```

This ensures no realtime updates are lost just because a chat wasn't visible at that moment.

### Layer 4: Reconciliation with Retry Logic

When a message or chat fails to sync (network error, Supabase error), the app stores it in `unsyncedByChat` and attempts reconciliation with exponential backoff:

```typescript
// Max 3 retry attempts with delays: 0ms, 1s, 2s
const MAX_RETRIES = 3;
const getRetryDelay = (attemptNumber: number) => {
  if (attemptNumber === 0) return 0;
  return Math.pow(2, attemptNumber - 1) * 1000; // exponential backoff
};

// Retry logic in reconciliation function:
for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
  try {
    const delay = getRetryDelay(attempt);
    if (delay > 0) {
      await new Promise(resolve => setTimeout(resolve, delay));
    }

    // Attempt reconciliation
    const result = await reconcileChat(chatId, unsynced);
    console.log(`[Sync] Successfully reconciled chat ${chatId} on attempt ${attempt + 1}`);
    return true;
  } catch (error) {
    if (attempt < MAX_RETRIES - 1) {
      console.log(`[Sync] Will retry chat ${chatId} in ${getRetryDelay(attempt + 1)}ms`);
    }
  }
}
```

If all 3 attempts fail, the user is shown a retry prompt.

### Layer 5: Chat Creation Flow

Chat creation now blocks message sends. If the chat fails to persist to the database, the message flow aborts:

```typescript
// Step 1: Create chat in database
const newChat = await dbService.createChat(userId, persona, model);
if (!newChat?.id) {
  // Chat creation failed - ABORT message flow
  throw new Error('Failed to create chat - aborting message send');
}

// Step 2: Only after chat is persisted, create message
const newMessage = await dbService.createMessage(newChat.id, userMessage, 'user');

// This prevents orphaned messages without a parent chat
```

## State Management Patterns

### Using Refs to Avoid Stale Closures

Realtime callbacks run asynchronously and can capture stale state. Refs are used to always have current values:

```typescript
// State (can become stale in closures)
const [activeChatId, setActiveChatId] = useState<string | null>(null);

// Ref (always current in closures)
const activeChatIdRef = useRef<string | null>(null);

// Keep them in sync
useEffect(() => {
  activeChatIdRef.current = activeChatId;
}, [activeChatId]);

// In realtime callback:
supabase.channel('messages-changes').on('postgres_changes', ..., (message) => {
  // This always uses the current activeChatId
  if (message.chat_id === activeChatIdRef.current) {
    setMessages(prev => [...prev, message]);
  }
});
```

## Debugging Sync Issues

### Check Network Status
```
[App] Network reconnected
[App] Network disconnected
```

### Verify Realtime Subscriptions
```
[Realtime] Messages subscription status: SUBSCRIBED
[Realtime] Chats subscription status: SUBSCRIBED
```

Any status other than SUBSCRIBED indicates a connection issue.

### Monitor Reconciliation
```
[Sync] Successfully reconciled chat 123abc on attempt 1
[Sync] Will retry chat 123abc in 1000ms
```

Repeated retries suggest database or permission issues.

### Check for Queued Messages
If messages arrive for inactive chats, they'll be queued without logging (silent operation). When you open that chat, the queued messages will appear.

## Common Issues & Solutions

### Issue: Chats created on one device don't appear on another

**Root cause:** Realtime subscription not active or message queuing not working.

**Debug steps:**
1. Check `[Realtime] Chats subscription status:` - should be SUBSCRIBED
2. Check if error handler fired: `[Realtime] Subscription error:`
3. Verify database permissions in Supabase Dashboard
4. Check that `INSERT` permissions are enabled for `chat_sessions` table

**Solution:**
- Wait 5 seconds for realtime to propagate
- Force refresh the page
- Check Supabase RLS policies and enable if needed

### Issue: PWA hangs after sending a message

**Root cause:** Streaming response timeout or RAG timeout not working.

**Debug steps:**
1. Check `[Gemini] Total stream timeout exceeded` or `🟡 RAG unavailable:` in console
2. Check network tab for hanging requests
3. Look for `[App] Network disconnected` - might be a connectivity issue

**Solution:**
- Close and reopen the app
- Check internet connection
- Clear browser cache and retry
- If `🟡 RAG unavailable` appears, RAG is disabled for that message (intended behavior)

### Issue: Offline messages don't sync after coming back online

**Root cause:** Reconciliation failed after all 3 retries.

**Debug steps:**
1. Check `[App] Network reconnected` in console
2. Look for `[Sync]` messages and error details
3. Check Supabase Dashboard for database errors
4. Verify RLS policies allow your user to write messages

**Solution:**
- Force a full page reload
- Check that you're logged in (session might have expired)
- Contact support if database is experiencing issues

## Performance Optimization

### Preventing Stale Closures
Always use refs for values captured in async callbacks:
```typescript
// Good - uses ref
if (message.chat_id === activeChatIdRef.current) { ... }

// Bad - might use stale state
if (message.chat_id === activeChatId) { ... }
```

### Queuing Instead of Discarding
Messages for inactive chats are now queued rather than discarded:
```typescript
// Before (lost messages):
if (chatId !== activeChatIdRef.current) return; // Discarded!

// After (queued messages):
pendingRealtimeMessagesRef.current.get(chatId)?.push(message);
```

### Blocking Chat Creation
Chat creation now blocks message send to prevent orphaned messages:
```typescript
// Before (orphaned messages):
createChat(); // Fire and forget
createMessage(); // Created even if chat fails

// After (safe):
const newChat = await createChat();
if (!newChat?.id) throw new Error('Chat creation failed');
createMessage(newChat.id); // Only created if chat succeeded
```

## Future Improvements

1. **Exponential backoff with jitter** - Add randomization to prevent thundering herd
2. **Offline queue persistence** - Store unsynced items in IndexedDB for durability
3. **Bidirectional sync detection** - Detect and resolve conflicts if same chat edited simultaneously
4. **Sync progress indicator** - Show user which items are syncing/queued
5. **Selective sync** - Allow users to choose which chats to keep in sync for bandwidth savings
