# Lumi Chat

A full-stack AI chat application with multi-model support, RAG memory, and real-time sync.

![License](https://img.shields.io/badge/License-MIT-blue)
![React](https://img.shields.io/badge/React-19.2-61dafb)
![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178c6)
![Supabase](https://img.shields.io/badge/Supabase-Backend-3ecf8e)

---

## Features

- **Multi-Model Support** - Gemini, GPT, and Claude models in one interface
- **RAG Memory System** - Conversations saved to vector store for context retrieval
- **Real-Time Sync** - Cross-device sync via Supabase subscriptions
- **File Uploads** - Images, PDFs, ZIPs supported (25MB max)
- **PWA Ready** - Install as a native app on any device
- **Custom Personas** - Create AI personalities with custom system prompts
- **Folder Organization** - Organize chats into folders
- **Voice Output** - Text-to-speech for AI responses
- **Offline Support** - Queue messages when offline, sync when back

---

## Supported Models

| Provider | Models |
|----------|--------|
| Google | Gemini 2.5 Flash, Gemini 3 Pro |
| OpenAI | GPT-5.2, GPT-5 Mini, GPT-5 Nano, o1, o1-mini |
| Anthropic | Claude Haiku 4.5, Claude Sonnet 4.5, Claude Opus 4.5 |

---

## Tech Stack

- **Frontend**: React 19.2, TypeScript 5.8, Vite 6, Tailwind CSS 4
- **Backend**: Supabase (PostgreSQL + Auth + Edge Functions + Storage)
- **Vector DB**: pgvector for RAG embeddings
- **AI**: Server-side API calls via Edge Functions

---

## Quick Start

### Prerequisites

- Node.js 18+
- Supabase account
- API keys for AI providers (Gemini, OpenAI, and/or Anthropic)

### 1. Clone and Install

```bash
git clone https://github.com/mrchevyceleb/lumi-chat.git
cd lumi-chat
npm install
```

### 2. Configure Supabase

Create a Supabase project and run the migrations:

```bash
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

### 3. Set Environment Variables

Create `.env.local`:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

### 4. Deploy Edge Functions

```bash
supabase secrets set GOOGLE_API_KEY=your-key
supabase secrets set OPENAI_API_KEY=your-key
supabase secrets set ANTHROPIC_API_KEY=your-key

supabase functions deploy gemini-chat
supabase functions deploy gemini-title
supabase functions deploy gemini-tts
supabase functions deploy get-rag-context
supabase functions deploy embed-and-store-gemini-document
```

### 5. Run Locally

```bash
npm run dev
```

Open http://localhost:5173

---

## Deployment

### Docker

```bash
npm run docker:build
npm run docker:run
```

### Google Cloud Run

```bash
gcloud builds submit --config cloudbuild.yaml
```

---

## Architecture

```
lumi-chat/
├── components/       # React UI components
├── services/         # Business logic
│   ├── geminiService.ts   # AI streaming, title gen, TTS
│   ├── dbService.ts       # Supabase CRUD operations
│   └── ragService.ts      # Vector similarity search
├── supabase/
│   ├── functions/    # Edge Functions for AI proxying
│   └── migrations/   # Database schema
└── App.tsx           # Main state management
```

---

## Key Features Explained

### RAG Memory

Conversations are embedded and stored in a vector database. When you chat, relevant past context is automatically retrieved and included, giving the AI long-term memory.

### Context Windowing

Each model has optimized token limits to control costs while maintaining quality. The system automatically manages context size.

### Optimistic Updates

Messages appear instantly in the UI before server confirmation. If the server fails, the UI handles rollback gracefully.

---

## License

MIT License - feel free to use, modify, and distribute.

---

**Built by [Matt Johnston](https://mattjohnston.io)**

*Part of the Vibe Marketing open source toolkit.*
