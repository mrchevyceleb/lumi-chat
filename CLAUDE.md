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
- **Sync**: unsyncedByChat (tracks offline changes)

Key patterns:
- localStorage hydration on load (prevents loading flash)
- Refs for async operations to avoid stale closures
- Lazy message loading per chat
- Real-time Supabase subscriptions for cross-device sync

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

- Check browser console for prefixed logs: `[App]`, `[DB]`, `[Realtime]`, `🧠 RAG`
- Supabase Dashboard → Edge Functions for server-side logs
- Verify realtime subscriptions: look for `[Realtime] Messages subscription status: SUBSCRIBED`

### RAG/Vector Search Troubleshooting

If RAG returns no results with error `operator does not exist: extensions.vector <=> extensions.vector`:
- The pgvector extension is installed in the `extensions` schema
- The `match_documents` function must have `SET search_path = public, extensions` to find the `<=>` operator
- Fix: See migration `20251215_fix_vector_operator_schema.sql`

## File Handling

Supports PDFs, ZIPs, images, text files. Max 25MB per file. Files stored in Supabase Storage `uploads` bucket.
