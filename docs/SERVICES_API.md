# Services API Reference

This document provides detailed API references for Lumi Chat's core services.

## Table of Contents
- [geminiService](#geminiserviects)
- [ragService](#ragservicets)
- [dbService](#dbservicets)
- [supabaseClient](#supabaseclientts)

## geminiService.ts

Handles AI chat streaming, title generation, text-to-speech, and response parsing.

### Constants

```typescript
// Model-specific context windows for cost management
MODEL_CONTEXT_CONFIGS: Record<string, {
  maxMessages: number;      // Max messages to include in context
  maxContextChars: number;  // Max characters to send to model
  minRecentMessages: number; // Minimum recent messages to always include
}>
```

### Functions

#### `generateChatTitle(userMessage: string): Promise<string | null>`

Generates a short title for a new chat based on the first user message.

**Parameters:**
- `userMessage` (string): The user's first message (minimum 2 characters required)

**Returns:**
- Promise resolving to title string or null if generation fails

**Errors:**
- Logs to console on failure, doesn't throw

**Example:**
```typescript
const title = await generateChatTitle("Tell me about JavaScript");
// Returns something like: "JavaScript Fundamentals"
```

#### `previewVoice(voiceName: string): Promise<string>`

Generates a voice preview audio clip for TTS voice selection.

**Parameters:**
- `voiceName` (string): Voice name from available voices

**Returns:**
- Promise resolving to base64-encoded audio data

**Throws:**
- `Error` if voice preview generation fails

**Example:**
```typescript
const audioBase64 = await previewVoice('Kore');
const audio = new Audio(`data:audio/mp3;base64,${audioBase64}`);
audio.play();
```

#### `streamChatResponse(params): Promise<GenerateResponse>`

Streams an AI chat response with SSE and handles timeouts.

**Parameters:**
```typescript
interface StreamParams {
  userMessage: string;
  ragContext: string;
  messages: Message[];
  userId: string;
  conversationId: string;
  model: ModelId;
  persona?: Persona;
  onChunk: (text: string) => void; // Called for each streaming chunk
  signal?: AbortSignal;             // For cancellation
  fileAttachments?: FileAttachment[];
}
```

**Returns:**
```typescript
interface GenerateResponse {
  text: string;                    // Complete response text
  groundingUrls?: Array<{          // Search result URLs (for Gemini)
    title: string;
    uri: string;
  }>;
  usage?: {
    input: number;  // Input tokens used
    output: number; // Output tokens used
  };
  processedFiles?: ProcessedFileInfo[];
  warnings?: string[];
}
```

**Timeouts:**
- Per-chunk timeout: 30 seconds (if no data received)
- Total stream timeout: 5 minutes (300 seconds)

**Errors:**
- Logs to console with `[Gemini]` prefix
- May throw `InvalidApiKeyError`

**Example:**
```typescript
const response = await streamChatResponse({
  userMessage: 'Hello',
  ragContext: 'Previous context...',
  messages: [],
  userId: 'user123',
  conversationId: 'chat456',
  model: 'gemini-2.5-flash',
  persona: DEFAULT_PERSONA,
  onChunk: (text) => console.log('Chunk:', text),
});

console.log('Full response:', response.text);
console.log('Tokens used:', response.usage);
```

**Console Output Examples:**
```
✓ Normal streaming:
[Gemini] Stream chunk timeout (no timeout case)

✗ Chunk timeout (30s no data):
[Gemini] Stream chunk timeout, assuming complete

✗ Total timeout (5 min exceeded):
[Gemini] Total stream timeout exceeded, ending stream
```

### Context Window Configuration

The service automatically selects context window based on model:

```typescript
// Premium models - increased but cost-conscious
'o1': { maxMessages: 16, maxContextChars: 30000, minRecentMessages: 8 }
'gpt-5.2': { maxMessages: 24, maxContextChars: 48000, minRecentMessages: 10 }

// Standard models - balanced
'gemini-2.5-flash': { maxMessages: 36, maxContextChars: 64000, minRecentMessages: 10 }

// Budget models - generous
'gpt-5-nano': { maxMessages: 45, maxContextChars: 72000, minRecentMessages: 12 }
```

## ragService.ts

Handles vector search, memory storage, and RAG context retrieval.

### Constants

```typescript
const RAG_TIMEOUT_MS = 10000; // 10 seconds timeout for RAG operations
```

### Functions

#### `getRagContext(userMessage, conversationId?, conversationSummary?, conversationLength?): Promise<string>`

Fetches relevant context from the vector store for a user message.

**Parameters:**
- `userMessage` (string): The user's message to search for context
- `conversationId` (string, optional): ID of current conversation for relevance
- `conversationSummary` (string, optional): Summary of conversation topic
- `conversationLength` (number, optional): Number of messages in conversation

**Returns:**
- Promise resolving to context string (empty if no results or timeout)

**Timeout:**
- 10 seconds per call (prevents PWA hanging)

**Optimization:**
- Skips RAG for simple follow-up messages (yes/no, short questions)
- Returns empty string on timeout instead of throwing

**Console Output:**
```
✓ Success: 🟢 RAG context found: 1250 chars
✗ Timeout: 🟡 RAG unavailable: RAG context fetch timed out
✗ Error: 🔴 RAG error: {error message}
```

**Example:**
```typescript
const context = await ragService.getRagContext(
  'How do I debug this?',
  'conv123',
  'JavaScript debugging',
  5 // 5 messages in conversation
);

// Returns: "You previously mentioned... [similar past content]"
// Or empty string if timeout or no results
```

#### `saveMemory(userId, conversationId, userMessage, botResponse): Promise<void>`

Saves a conversation exchange to the vector store for future retrieval.

**Parameters:**
- `userId` (string): User ID
- `conversationId` (string): Chat session ID
- `userMessage` (string): User's message
- `botResponse` (string): AI response

**Returns:**
- Promise resolving when saved

**Throws:**
- May throw if database error (logged to console)

**Example:**
```typescript
await ragService.saveMemory(
  'user123',
  'chat456',
  'How do I center a div?',
  'You can use flexbox: display: flex; justify-content: center;'
);
```

#### `getContextWindow(model): { maxMessages: number; maxContextChars: number; minRecentMessages: number }`

Gets the context window configuration for a specific model.

**Parameters:**
- `model` (ModelId): Model identifier

**Returns:**
- Configuration object with message and character limits

**Example:**
```typescript
const config = ragService.getContextWindow('gpt-5.2');
// Returns: { maxMessages: 24, maxContextChars: 48000, minRecentMessages: 10 }
```

### Helper Functions

#### `withTimeout<T>(promise, ms, errorMessage): Promise<T>`

Wraps a promise with a timeout. Used internally for RAG operations.

**Parameters:**
- `promise` (Promise): Promise to wrap
- `ms` (number): Timeout in milliseconds
- `errorMessage` (string): Error message if timeout occurs

**Returns:**
- Promise that rejects if timeout exceeded

**Example:**
```typescript
const result = await withTimeout(
  supabase.functions.invoke('expensive-operation'),
  5000,
  'Operation took too long'
);
```

#### `isSimpleFollowUp(message, conversationLength): boolean`

Determines if a message is a simple follow-up that doesn't need RAG.

**Parameters:**
- `message` (string): The user's message
- `conversationLength` (number): Number of messages in conversation

**Returns:**
- true if message is a simple follow-up (yes/no, short question)
- false if message needs RAG context

**Patterns Considered Simple Follow-up:**
```
Length: < 20 characters
Conversation: > 2 messages
Matches: yes, no, okay, thanks, why, how, etc.
```

**Example:**
```typescript
isSimpleFollowUp('yes', 5);  // true - skip RAG
isSimpleFollowUp('yes', 0);  // false - first message, needs context
isSimpleFollowUp('Tell me more about React', 5); // false - long message
```

## dbService.ts

Database operations for chats, messages, folders, personas, and user data.

### Key Operations

#### Chat Operations

```typescript
// Create a new chat
createChat(userId, persona, model): Promise<ChatSession>

// Fetch all user's chats
fetchChats(userId): Promise<ChatSession[]>

// Update chat (title, folder, pinned status, etc.)
updateChat(chatId, updates): Promise<void>

// Delete chat and all messages
deleteChat(chatId): Promise<void>

// Fetch messages for a chat
fetchMessages(chatId, limit?, offset?): Promise<Message[]>
```

#### Message Operations

```typescript
// Create a message in a chat
createMessage(chatId, content, role, fileAttachments?): Promise<Message>

// Fetch recent messages
fetchMessages(chatId, limit, offset): Promise<Message[]>

// Update a message
updateMessage(messageId, updates): Promise<void>

// Delete a message
deleteMessage(messageId): Promise<void>
```

#### Settings Operations

```typescript
// Save user settings
saveUserSettings(userId, settings): Promise<void>

// Fetch user settings
fetchUserSettings(userId): Promise<UserSettings>
```

**Note:** All database operations include error logging with `[DB]` prefix.

## supabaseClient.ts

Supabase authentication and session management.

### Functions

#### `attemptSessionRecovery(): Promise<boolean>`

Attempts to recover a user session from stored tokens.

**Returns:**
- true if session recovered successfully
- false if recovery failed

**Used for:**
- App startup when user was previously logged in
- Automatic re-authentication after token expiration

#### `isAuthError(error): boolean`

Checks if an error is authentication-related.

**Parameters:**
- `error` (any): Error object to check

**Returns:**
- true if error is auth-related (invalid token, session expired, etc.)
- false otherwise

**Example:**
```typescript
try {
  await dbService.createChat(...);
} catch (error) {
  if (isAuthError(error)) {
    console.log('Auth error, user needs to sign in again');
    setSession(null);
  }
}
```

### Exports

- `supabase` - Initialized Supabase client instance
- `attemptSessionRecovery` - Session recovery function
- `isAuthError` - Auth error detection

## State Management in App.tsx

### Key State Variables

```typescript
// Network and sync state
const [isOnline, setIsOnline] = useState(true);
const [unsyncedByChat, setUnsyncedByChat] = useState({});

// Realtime tracking
const activeChatIdRef = useRef<string | null>(null);
const pendingRealtimeMessagesRef = useRef<Map<string, any[]>>(new Map());
const isLoadingDataRef = useRef(false);
const loadingMessagesRef = useRef<Set<string>>(new Set());
```

### Event Handlers

#### Network Status Change

```typescript
useEffect(() => {
  const handleOnline = () => {
    setIsOnline(true);
    console.log('[App] Network reconnected');
    // Trigger reconciliation for offline changes
  };

  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', () => {
    setIsOnline(false);
    console.log('[App] Network disconnected');
  });

  return () => {
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', ...);
  };
}, []);
```

#### Realtime Subscription

```typescript
// Subscribe to message changes with error handling
supabase.channel('messages-changes')
  .on('postgres_changes', { event: '*', ... }, (message) => {
    // Queue messages for inactive chats
    if (message.chat_id !== activeChatIdRef.current) {
      pendingRealtimeMessagesRef.current.get(message.chat_id)?.push(message);
    }
  })
  .subscribe((status, err) => {
    if (status === 'SUBSCRIBED') {
      console.log('[Realtime] Messages subscription status: SUBSCRIBED');
    } else if (err) {
      console.error('[Realtime] Subscription error:', err);
    }
  });
```

## Error Handling Patterns

### Database Errors

```typescript
// All DB operations catch and log:
try {
  await dbService.createChat(...);
} catch (error) {
  console.error('[DB] Failed to create chat:', error);
  // User sees error in UI
}
```

### Realtime Errors

```typescript
// Subscription error handler:
.subscribe((status, err) => {
  if (err) {
    console.error('[Realtime] Subscription error:', err);
    // Auto-reconnect attempted on next network change
  }
})
```

### Sync Reconciliation

```typescript
// Retry logic with exponential backoff:
for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
  try {
    await reconcileChat(chatId, unsynced);
    console.log(`[Sync] Successfully reconciled chat ${chatId}`);
  } catch (error) {
    const delay = Math.pow(2, attempt) * 1000;
    console.log(`[Sync] Will retry chat ${chatId} in ${delay}ms`);
    await new Promise(r => setTimeout(r, delay));
  }
}
```

## Performance Considerations

1. **Streaming Timeouts** - 30s chunks, 5min total prevents hanging
2. **RAG Timeout** - 10s prevents PWA stalling on slow vector searches
3. **Message Batching** - Realtime messages queued for inactive chats
4. **Context Windowing** - Model-specific limits control costs
5. **Simple Follow-up Skip** - Short messages skip RAG to save calls
6. **Exponential Backoff** - Retry delays (0ms, 1s, 2s) prevent thundering herd

## Testing Services

### Test RAG Timeout
```typescript
// Manually trigger in console:
await ragService.getRagContext('test'); // Will timeout after 10s
```

### Test Streaming Timeout
```typescript
// Manually trigger chunk timeout:
// Send a message and disconnect network in DevTools for >30s
```

### Test Network Reconnection
```typescript
// In DevTools:
DevTools → Network → Offline (toggle)
// Should see [App] Network disconnected/reconnected in console
```

### Test Sync Reconciliation
```typescript
// Go offline, send message, watch for [Sync] messages
localStorage.getItem('lumi_unsynced_map');  // See queued changes
// Come back online, should see reconciliation attempts
```
