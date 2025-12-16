# Changelog

All notable changes to Lumi Chat are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Network Status Detection** - App now detects online/offline state transitions for PWA reliability
- **Message Queuing for Unloaded Chats** - Realtime messages for inactive chats are queued instead of discarded (pendingRealtimeMessagesRef)
- **Realtime Subscription Error Handlers** - Both messages and chats subscriptions now have error callbacks with logging
- **Sync Reconciliation Retry Logic** - Exponential backoff retry mechanism (max 3 attempts) for failed chat/message reconciliation
- **Automatic Re-sync on Network Reconnect** - When PWA regains connectivity, automatically re-syncs offline changes
- **Streaming Timeout Protections**
  - RAG context fetch: 10-second timeout to prevent blocking message sends
  - AI streaming chunks: 30-second per-chunk timeout
  - Total stream duration: 5-minute maximum timeout
- **Enhanced Console Logging**
  - `[Sync]` prefix for reconciliation events
  - `[App]` prefix for network and app state changes
  - `🟡 RAG unavailable` indicator for RAG timeouts
  - Status tracking for realtime subscriptions

### Fixed

- **Cross-device Chat Sync Failure** - Chats created on one device now properly appear on other devices through improved realtime synchronization and retry logic
- **PWA Stalling Issue** - Mobile PWA no longer hangs indefinitely after sending messages due to:
  - RAG timeout wrapper (10 seconds max) preventing blocking operations
  - Streaming response timeouts (30s chunks, 5min total) preventing runaway reads
  - Network reconnection handling preventing zombie connections
- **Orphaned Messages** - Chat creation now blocks message send; if DB save fails, entire flow aborts instead of creating messages without a parent chat
- **Lost Offline Messages** - Messages queued while offline are now properly reconciled when coming back online with retry logic

### Changed

- **RAG Performance** - Simple follow-up messages (yes/no, short questions) now skip RAG fetch to reduce API calls and improve responsiveness
- **Chat Creation Flow** - Now validates chat persistence before allowing message sends
- **State Management** - Refs added to prevent stale closures in async realtime callbacks:
  - `activeChatIdRef` for routing message updates
  - `pendingRealtimeMessagesRef` for queuing unloaded chat messages
  - `isLoadingDataRef` for preventing concurrent data loads
  - `loadingMessagesRef` for per-chat message load deduplication

### Removed

- Implicit message discarding for inactive chats (now queued with pendingRealtimeMessagesRef)

## [2025-12-15]

### Added

- Model-specific context window configurations in geminiService.ts for cost management
- Improved context windowing with balanced token limits per model tier

### Fixed

- RAG troubleshooting documentation for pgvector extension schema issues

### Changed

- Updated CLAUDE.md with current debugging patterns and troubleshooting guide

## [2025-12-10]

### Added

- File attachment support for PDFs, ZIPs, images, and text files
- Supabase Storage integration for file uploads (25MB per file limit)
- File metadata tracking in messages table

### Fixed

- File upload permissions and metadata storage

### Changed

- Enhanced message schema to include file_metadata field

## [2025-12-01]

### Added

- Multi-model AI support (Gemini, GPT, Claude)
- Supabase realtime subscriptions for cross-device sync
- RAG memory system with vector embeddings
- Voice synthesis support (TTS)

### Changed

- Architecture refactored for multi-model support
- Database schema updated for RAG and model metadata

## [2025-11-01]

### Added

- Initial Lumi Chat release
- Chat sessions with messaging
- User authentication via Supabase
- PWA capabilities with service worker
- Dark mode support
