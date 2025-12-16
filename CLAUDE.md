# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Lumi Chat is a full-stack AI chat application with multi-model support (Gemini, GPT, Claude), real-time sync via Supabase, RAG memory system, file uploads, and PWA capabilities.

## Tech Stack

- **Frontend**: React 19.2, TypeScript 5.8, Vite 6, Tailwind CSS 4
- **Backend**: Supabase (PostgreSQL + Auth + Edge Functions + Storage)
- **AI Providers**: Google Gemini, OpenAI GPT, Anthropic Claude (via Edge Functions)

## Development Commands

```bash
npm install          # Install dependencies
npm run dev          # Start dev server (port 5173)
npm run build        # TypeScript compile + Vite build
npm run preview      # Preview production build
npm run docker:build # Build Docker image
npm run docker:run   # Run container on port 8080
```

## Supabase Edge Functions

Deploy functions:
```bash
supabase functions deploy gemini-chat
supabase functions deploy gemini-title
supabase functions deploy gemini-tts
supabase functions deploy get-rag-context
supabase functions deploy embed-and-store-gemini-document
supabase functions deploy gemini-live-relay
```

Required secrets: `GOOGLE_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`

## Architecture

### Entry Point Flow
`index.html` → `index.tsx` → `App.tsx` (main state management)

### Key Directories
- `/components/` - React UI components (Sidebar, ChatInput, MessageBubble, SettingsModal, VaultModal, etc.)
- `/services/` - Business logic (geminiService, dbService, ragService, supabaseClient)
- `/supabase/functions/` - Edge Functions for AI proxying and RAG
- `/supabase/migrations/` - Database schema migrations

### Services
| Service | Purpose |
|---------|---------|
| `geminiService.ts` | AI chat streaming, title generation, TTS, context windowing |
| `dbService.ts` | CRUD for chats, messages, folders, personas, vault, settings |
| `ragService.ts` | Vector similarity search and memory storage |
| `supabaseClient.ts` | Auth session management and recovery |

### State Management
App.tsx manages all state via React hooks:
- **Auth**: session, isAuthChecking
- **Data**: chats, folders, activeChatId, openTabs
- **Settings**: selectedModel, defaultModel, voiceName, useSearch, darkMode
- **Sync**: unsyncedByChat (tracks offline changes), isOnline (network status)
- **Realtime**: realtime subscription error/status tracking

Key patterns:
- localStorage hydration on load (prevents loading flash)
- Refs for async operations to avoid stale closures
- Lazy message loading per chat
- Real-time Supabase subscriptions for cross-device sync
- Network status detection with automatic re-sync when coming back online
- Message queuing for unloaded chats (pendingRealtimeMessagesRef)
- Exponential backoff retry logic for failed reconciliation (max 3 attempts)
- Chat creation now blocks message send - if DB save fails, entire flow aborts

Key refs used to avoid stale closures in realtime callbacks:
- `activeChatIdRef` - current chat for routing realtime message updates
- `pendingRealtimeMessagesRef` - queue messages for chats not yet loaded
- `isLoadingDataRef` - prevent concurrent data loads
- `loadingMessagesRef` - prevent concurrent message loads per chat

### Database Tables
- `chat_sessions` - Chat metadata (title, folder, pinned, persona, model, search)
- `messages` - Chat messages with file metadata and grounding URLs
- `folders` - User folder hierarchy
- `personas` - Custom AI system instructions
- `documents` - Vector embeddings for RAG (pgvector)
- `user_settings` - User preferences
- `user_usage` - Token usage statistics

### Supported Models (types.ts)
`gemini-2.5-flash`, `gemini-3-pro-preview`, `gpt-5.2`, `gpt-5-mini`, `gpt-5-nano`, `o1`, `o1-mini`, `claude-haiku-4-5`, `claude-sonnet-4-5`, `claude-opus-4-5`

## Key Patterns

- **SSE Streaming**: AI responses stream via Server-Sent Events from Edge Functions
- **Optimistic Updates**: Messages appear in UI before server confirmation
- **Context Windowing**: Model-specific token limits to control costs (see `getContextWindow()`)
- **RAG Memory**: Conversations saved to vector store, retrieved for context
- **Offline Support**: Service worker + localStorage caching

## Testing & Debugging

### Console Logging Prefixes
Monitor these console prefixes to track application health and behavior:

| Prefix | Purpose | Example |
|--------|---------|---------|
| `[App]` | App state, network status, reconnection events | `[App] Network reconnected` |
| `[DB]` | Database operations (CRUD) | `[DB] Chat created successfully` |
| `[Realtime]` | Supabase real-time subscription events | `[Realtime] Messages subscription status: SUBSCRIBED` |
| `🧠 RAG` | Vector search operations | `🟢 RAG context found: 1250 chars` |
| `[Sync]` | Message/chat reconciliation and retry logic | `[Sync] Successfully reconciled chat...` |
| `[Gemini]` | AI streaming response handling | `[Gemini] Total stream timeout exceeded` |
| `🟡 RAG unavailable` | RAG timeout or unavailable state | `🟡 RAG unavailable: RAG context fetch timed out` |

### Debugging Tools
- Check browser console for the prefixes above to track request/response flow
- Supabase Dashboard → Edge Functions for server-side logs
- Verify realtime subscriptions: look for `[Realtime] Messages subscription status: SUBSCRIBED`
- Network tab in DevTools: filter for `functions/v1/` to see Edge Function calls
- Application tab → Storage → Local Storage for `lumi_*` cache keys

### Timeout Configurations
Understanding these timeouts helps diagnose hanging or slow responses:

| Component | Timeout | Purpose |
|-----------|---------|---------|
| RAG context fetch | 10 seconds | Prevents RAG from blocking message sending in PWAs |
| Streaming chunk | 30 seconds | Per-chunk timeout for AI response streaming |
| Total stream | 5 minutes (300s) | Maximum time for complete AI response |

If you see `🟡 RAG unavailable: RAG context fetch timed out`, the RAG system exceeded 10 seconds and was skipped. The message will still be sent without vector search context.

### Sync & Reconciliation Troubleshooting

The app automatically reconciles offline changes with exponential backoff (max 3 attempts):

**Symptoms of sync issues:**
- Messages sent offline don't appear on other devices after coming back online
- Chat created on one device doesn't appear on another
- `[Sync] Will retry chat...` appears repeatedly in console

**How to debug:**
1. Check network status: `[App] Network reconnected/disconnected` logs
2. Verify Realtime subscriptions are active: `[Realtime] Messages subscription status: SUBSCRIBED`
3. Look for reconciliation attempts: `[Sync] Successfully reconciled chat...`
4. If retries are failing, check Supabase Dashboard for database errors
5. Force a full reload to re-sync all data from server

**Reconciliation retry logic:**
- First attempt: immediate
- Second attempt: 1 second delay
- Third attempt: 2 seconds delay
- If all fail, user sees retry prompt

### RAG/Vector Search Troubleshooting

If RAG returns no results with error `operator does not exist: extensions.vector <=> extensions.vector`:
- The pgvector extension is installed in the `extensions` schema
- The `match_documents` function must have `SET search_path = public, extensions` to find the `<=>` operator
- Fix: See migration `20251215_fix_vector_operator_schema.sql`

**RAG performance optimization:**
- Simple follow-up messages (yes/no, short questions) skip RAG to save API calls
- RAG context is only fetched if message is > 2 chars and in active conversation
- Retrieved documents are filtered by relevance threshold (configurable in function)

## File Handling

Supports PDFs, ZIPs, images, text files. Max 25MB per file. Files stored in Supabase Storage `uploads` bucket.
