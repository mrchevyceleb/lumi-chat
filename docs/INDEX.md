# Documentation Index

**Last Updated:** December 16, 2025
**Documentation Version:** 1.0
**Coverage:** Sync & Reliability Bug Fixes

## Quick Links

### For Quick Answers
- **I see `🟡 RAG unavailable` in console** → [TROUBLESHOOTING.md](./TROUBLESHOOTING.md#5-rag-memory-not-working)
- **My PWA is hanging** → [TROUBLESHOOTING.md](./TROUBLESHOOTING.md#2-pwa-hangs-or-becomes-unresponsive)
- **Chats not syncing** → [TROUBLESHOOTING.md](./TROUBLESHOOTING.md#3-chats-dont-sync-between-devices)
- **Messages disappear** → [TROUBLESHOOTING.md](./TROUBLESHOOTING.md#1-messages-send-but-dont-appear)
- **Console log meaning** → [CLAUDE.md](../CLAUDE.md#console-logging-prefixes)

### For Understanding
- **How sync works** → [SYNC_ARCHITECTURE.md](./SYNC_ARCHITECTURE.md)
- **What was broken/fixed** → [SYNC_BUG_FIXES.md](./SYNC_BUG_FIXES.md)
- **Service APIs** → [SERVICES_API.md](./SERVICES_API.md)
- **Timeout configs** → [SYNC_BUG_FIXES.md](./SYNC_BUG_FIXES.md#timeout-behavior)

### For Development
- **Modify sync logic** → [SYNC_ARCHITECTURE.md](./SYNC_ARCHITECTURE.md) then [SERVICES_API.md](./SERVICES_API.md)
- **Add features** → [SERVICES_API.md](./SERVICES_API.md) → update [CHANGELOG.md](../CHANGELOG.md)
- **Debug issues** → [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) → [SYNC_ARCHITECTURE.md](./SYNC_ARCHITECTURE.md)

## Document Overview

| Document | Purpose | Read Time | Depth |
|----------|---------|-----------|-------|
| [README.md](./README.md) | Navigation hub | 5 min | Overview |
| [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) | Issue diagnosis | 15-30 min | Practical |
| [SYNC_ARCHITECTURE.md](./SYNC_ARCHITECTURE.md) | Design patterns | 20-30 min | Technical |
| [SYNC_BUG_FIXES.md](./SYNC_BUG_FIXES.md) | Root causes & fixes | 25-40 min | Deep |
| [SERVICES_API.md](./SERVICES_API.md) | Code reference | Variable | Reference |

## Console Log Reference

Quick reference for console log prefixes (see [CLAUDE.md](../CLAUDE.md#console-logging-prefixes)):

```
[App]                    - Network, app state changes
[DB]                     - Database CRUD operations
[Realtime]               - Sync subscription status
[Sync]                   - Reconciliation attempts
[Gemini]                 - AI streaming timeouts
🧠 RAG                   - Vector search operations
🟡 RAG unavailable       - RAG timeouts (normal behavior)
```

## Timeout Values

- **RAG fetch:** 10 seconds (ragService.ts:5)
- **Streaming chunk:** 30 seconds (geminiService.ts:247)
- **Streaming total:** 5 minutes (geminiService.ts:249)

## Key Concepts

### Message Queuing
When realtime message arrives for inactive chat → queued not discarded → applied when chat opened
See: [SYNC_ARCHITECTURE.md](./SYNC_ARCHITECTURE.md#layer-3-message-queuing-for-unloaded-chats)

### Reconciliation Retry
Failed sync attempts retry with delays: 0ms → 1s → 2s → fail
See: [SYNC_ARCHITECTURE.md](./SYNC_ARCHITECTURE.md#layer-4-reconciliation-with-retry-logic)

### Atomic Chat Creation
Chat must be created successfully before message send (prevents orphaned messages)
See: [SYNC_ARCHITECTURE.md](./SYNC_ARCHITECTURE.md#layer-5-chat-creation-flow)

### Network Auto-Recovery
App detects online/offline transitions and auto re-syncs on reconnect
See: [SYNC_ARCHITECTURE.md](./SYNC_ARCHITECTURE.md#layer-2-network-status-detection)

## Debugging Quick Start

1. Open browser console (F12)
2. Look for log prefixes above
3. If issue found, go to [TROUBLESHOOTING.md](./TROUBLESHOOTING.md)
4. Follow diagnosis steps for your issue
5. Check "Quick Fix" section for solutions

## Common Searches

- **"Message sent but didn't appear"** → [TROUBLESHOOTING.md#1](./TROUBLESHOOTING.md#1-messages-send-but-dont-appear)
- **"App froze"** → [TROUBLESHOOTING.md#2](./TROUBLESHOOTING.md#2-pwa-hangs-or-becomes-unresponsive)
- **"Chat not on other device"** → [TROUBLESHOOTING.md#3](./TROUBLESHOOTING.md#3-chats-dont-sync-between-devices)
- **"Message disappeared after offline"** → [TROUBLESHOOTING.md#4](./TROUBLESHOOTING.md#4-messages-lost-after-going-offline)
- **"No context from old chats"** → [TROUBLESHOOTING.md#5](./TROUBLESHOOTING.md#5-rag-memory-not-working)
- **"Settings reset"** → [TROUBLESHOOTING.md#6](./TROUBLESHOOTING.md#6-settings-dont-persist)

## File Locations

```
C:\CURSOR-PROJECTS\lumi-chat\lumi-chat\
├── CLAUDE.md ........................ Project overview & debugging
├── CHANGELOG.md ..................... Version history
├── docs/
│   ├── INDEX.md (you are here) ...... This file
│   ├── README.md .................... Documentation hub
│   ├── TROUBLESHOOTING.md ........... Issue diagnosis
│   ├── SYNC_ARCHITECTURE.md ......... Design & patterns
│   ├── SYNC_BUG_FIXES.md ............ Root causes & solutions
│   └── SERVICES_API.md ............. Code reference
```

## Update History

### December 16, 2025
- Created comprehensive documentation for sync and reliability bug fixes
- 5 new documents in docs/ directory
- Updated CLAUDE.md with debugging details
- Created CHANGELOG.md with Keep a Changelog format
- 2,190+ lines of documentation
- ~72 KB total documentation

## Support Resources

- **Supabase Docs:** https://supabase.com/docs
- **React Docs:** https://react.dev
- **Vite Docs:** https://vite.dev
- **Gemini API:** https://ai.google.dev

## Next Steps

1. **New to the project?** Start with [README.md](./README.md)
2. **Debugging an issue?** Go to [TROUBLESHOOTING.md](./TROUBLESHOOTING.md)
3. **Want to understand design?** Read [SYNC_ARCHITECTURE.md](./SYNC_ARCHITECTURE.md)
4. **Modifying code?** Check [SERVICES_API.md](./SERVICES_API.md)
5. **Making a change?** Update [../CHANGELOG.md](../CHANGELOG.md)

---

**Documentation Maintained By:** Claude Code AI
**Accuracy Check:** December 16, 2025
