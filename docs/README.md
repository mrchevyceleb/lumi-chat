# Lumi Chat Documentation

Welcome to the Lumi Chat documentation hub. This directory contains comprehensive guides and references for developers and users.

## Documentation Structure

### For Developers

#### Core Architecture & Patterns
- **[SYNC_ARCHITECTURE.md](./SYNC_ARCHITECTURE.md)** - Deep dive into real-time sync, offline handling, and reconciliation logic
  - How Supabase realtime subscriptions work
  - Message queuing for inactive chats
  - Reconciliation retry logic with exponential backoff
  - Preventing stale closures with refs

- **[SYNC_BUG_FIXES.md](./SYNC_BUG_FIXES.md)** - Technical details of cross-device sync and PWA stalling fixes
  - Root causes of sync failures
  - Timeout implementations (RAG, streaming)
  - Error handling patterns
  - Testing procedures

#### API References
- **[SERVICES_API.md](./SERVICES_API.md)** - Complete API reference for all services
  - `geminiService.ts` - AI streaming, context windowing, timeouts
  - `ragService.ts` - Vector search, memory storage, timeouts
  - `dbService.ts` - Database CRUD operations
  - `supabaseClient.ts` - Auth and session management
  - State management patterns in App.tsx

### For Users & Debugging

#### Troubleshooting & Debugging
- **[TROUBLESHOOTING.md](./TROUBLESHOOTING.md)** - Step-by-step guides for common issues
  - Console logging reference with all prefixes
  - Issue diagnosis procedures
  - Root cause analysis with fixes
  - Advanced debugging techniques
  - Contacting support with helpful info

## Quick Start by Use Case

### I want to understand how sync works
1. Start: [SYNC_ARCHITECTURE.md](./SYNC_ARCHITECTURE.md) - Overview
2. Then: [SYNC_BUG_FIXES.md](./SYNC_BUG_FIXES.md) - How it was fixed
3. Deep dive: [SERVICES_API.md](./SERVICES_API.md) - Code-level details

### My chats aren't syncing between devices
1. Go to: [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) → "Chats Don't Sync Between Devices"
2. Follow the diagnosis steps
3. Check the console logging reference

### My PWA is hanging/freezing
1. Go to: [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) → "PWA Hangs or Becomes Unresponsive"
2. Look for timeout messages in console
3. Follow the quick fix guide

### I want to modify the sync logic
1. Start: [SERVICES_API.md](./SERVICES_API.md) - Understand current patterns
2. Then: [SYNC_ARCHITECTURE.md](./SYNC_ARCHITECTURE.md) - See why it's designed this way
3. Read: [SYNC_BUG_FIXES.md](./SYNC_BUG_FIXES.md) - Understand tradeoffs

### I'm debugging a realtime subscription issue
1. Check: [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) → "Chats Don't Sync Between Devices"
2. Look for: `[Realtime] ... subscription status:` in console
3. Reference: [SERVICES_API.md](./SERVICES_API.md) → "Event Handlers" section

## Console Logging Reference

All prefixes and their meanings (also see [TROUBLESHOOTING.md](./TROUBLESHOOTING.md)):

| Prefix | Purpose | File | Example |
|--------|---------|------|---------|
| `[App]` | Application state, network status | App.tsx | `[App] Network reconnected` |
| `[DB]` | Database operations | dbService.ts | `[DB] Chat created successfully` |
| `[Realtime]` | Real-time sync status | App.tsx | `[Realtime] Messages subscription status: SUBSCRIBED` |
| `[Sync]` | Reconciliation and retries | App.tsx | `[Sync] Successfully reconciled chat...` |
| `[Gemini]` | AI streaming and timeouts | geminiService.ts | `[Gemini] Stream chunk timeout` |
| `🧠 RAG` | Vector search operations | ragService.ts | `🟢 RAG context found: 1250 chars` |
| `🟡 RAG unavailable` | RAG timeout or error | ragService.ts | `🟡 RAG unavailable: RAG context fetch timed out` |

## Timeout Configurations

Understanding these timeouts helps diagnose performance issues:

| Component | Timeout | Location | Purpose |
|-----------|---------|----------|---------|
| RAG context fetch | 10 seconds | ragService.ts:5 | Prevents message blocking on slow vector search |
| Streaming chunk | 30 seconds | geminiService.ts:247 | Per-chunk timeout for SSE stream |
| Total stream | 5 minutes | geminiService.ts:249 | Maximum time for complete response |

## State Management Refs

Key refs used to prevent stale closures in async callbacks:

| Ref | File | Purpose |
|-----|------|---------|
| `activeChatIdRef` | App.tsx:35 | Routes realtime updates to current chat |
| `pendingRealtimeMessagesRef` | App.tsx:39 | Queues messages for inactive chats |
| `isLoadingDataRef` | App.tsx:29 | Prevents concurrent data loads |
| `loadingMessagesRef` | App.tsx:32 | Prevents per-chat message load conflicts |

## Bug Fixes Implemented

### December 2025 - Critical Reliability Fixes

1. **Cross-Device Chat Sync Failures** (Fixed)
   - Chats created on one device now appear on other devices in real-time
   - Implementation: Error handlers, message queuing, retry logic
   - See: [SYNC_BUG_FIXES.md](./SYNC_BUG_FIXES.md)

2. **PWA Stalling** (Fixed)
   - Mobile PWA no longer hangs indefinitely after messages
   - Implementation: 10s RAG timeout, 30s chunk timeout, 5min total timeout
   - See: [SYNC_BUG_FIXES.md](./SYNC_BUG_FIXES.md)

3. **Orphaned Messages** (Fixed)
   - Chat creation now blocks message send (atomic operation)
   - Messages can't exist without parent chat

4. **Lost Offline Messages** (Fixed)
   - Messages queued while offline properly reconcile when back online
   - Exponential backoff retry (max 3 attempts)

## Related Documentation

- **[CLAUDE.md](../CLAUDE.md)** - Project overview, tech stack, commands
- **[CHANGELOG.md](../CHANGELOG.md)** - Version history and feature releases
- **[README.md](../README.md)** - Quick start guide for users

## Contributing to Documentation

When updating code that affects:

- **Sync behavior** → Update [SYNC_ARCHITECTURE.md](./SYNC_ARCHITECTURE.md)
- **Timeouts** → Update [SYNC_BUG_FIXES.md](./SYNC_BUG_FIXES.md) and CLAUDE.md
- **Services/APIs** → Update [SERVICES_API.md](./SERVICES_API.md)
- **Error handling** → Update [TROUBLESHOOTING.md](./TROUBLESHOOTING.md)
- **New features** → Add to [CHANGELOG.md](../CHANGELOG.md)

## Quick Links

- **Supabase Dashboard** - https://supabase.com/dashboard
- **Gemini API Docs** - https://ai.google.dev
- **React 19 Docs** - https://react.dev
- **Vite Docs** - https://vite.dev

## Support

For issues not covered in [TROUBLESHOOTING.md](./TROUBLESHOOTING.md):

1. Check console for log messages (see logging reference above)
2. Search [CHANGELOG.md](../CHANGELOG.md) for related fixes
3. Review [SERVICES_API.md](./SERVICES_API.md) for API details
4. Check Supabase Dashboard for server-side logs
5. Contact support with console logs and steps to reproduce

## Document Maintenance

- Last Updated: December 16, 2025
- Coverage: Core sync, streaming, RAG, and error handling
- Accuracy: Verified against current codebase

## Quick Navigation

```
docs/
├── README.md (you are here)
├── SYNC_ARCHITECTURE.md - Design and implementation details
├── SYNC_BUG_FIXES.md - Root causes and solutions
├── SERVICES_API.md - Code-level API reference
└── TROUBLESHOOTING.md - Step-by-step issue diagnosis
```
