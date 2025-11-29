
export interface Message {
  id: string;
  role: 'user' | 'model';
  content: string;
  timestamp: number;
  type?: 'text' | 'image' | 'audio';
  groundingUrls?: Array<{ title: string; uri: string }>;
  images?: string[]; // Array of base64 data URLs for UI display
  model?: string; // Track which model generated this message
}

export interface ChatSession {
  id: string;
  title: string;
  folderId?: string; // If undefined, it's in "Recent"
  isPinned: boolean;
  messages: Message[];
  personaId: string;
  lastUpdated: number;
}

export interface Folder {
  id: string;
  name: string;
}

export interface Persona {
  id: string;
  name: string;
  avatar: string; // Emoji or URL
  systemInstruction: string;
  description: string;
  color: string;
}

export const DEFAULT_PERSONA: Persona = {
  id: 'default',
  name: 'Lumi',
  avatar: '💡',
  systemInstruction: `You are Lumi, a knowledgeable AI assistant. You communicate like a smart colleague in their late 30s - direct, competent, and real.

Core traits:
- Straightforward and practical. Say what needs to be said without padding.
- Conversational but grounded. No over-the-top enthusiasm or forced positivity.
- Helpful without being servile. You're an equal, not a butler.
- Can be witty or sarcastic when it fits. Dry humor > cheerfulness.
- When you don't know something, just say so.

NEVER use these phrases or similar:
- "wonderful/beautiful/lovely friend"
- "magical/sparkle/delightful"
- "I'm here for you" or "I'm all ears"
- "What a great question!"
- Excessive exclamation marks!!!
- 😊 emoji spam

Instead, sound like a normal person texting a friend. Keep it real. Use Markdown for formatting when helpful.`,
  description: 'Direct, practical assistant.',
  color: 'bg-slate-600'
};

export const CODING_PERSONA: Persona = {
  id: 'coder',
  name: 'DevBot',
  avatar: '💻',
  systemInstruction: 'You are an expert senior software engineer. You provide clean, efficient, and well-documented code. You explain complex concepts simply. You prefer TypeScript and Python.',
  description: 'Expert coding assistance.',
  color: 'bg-blue-500'
};

export type ModelId = 'gemini-2.5-flash' | 'gemini-3-pro-preview' | 'gemini-flash-lite-latest';

export interface ModelConfig {
  id: ModelId;
  name: string;
  description: string;
  costInput: number; // $ per 1M tokens
  costOutput: number; // $ per 1M tokens
}

export const AVAILABLE_MODELS: ModelConfig[] = [
  { 
    id: 'gemini-2.5-flash', 
    name: 'Gemini 2.5 Flash', 
    description: 'Fast, efficient, low latency.', 
    costInput: 0.075, 
    costOutput: 0.30 
  },
  {
    id: 'gemini-flash-lite-latest',
    name: 'Gemini 2.0 Flash-Lite',
    description: 'Super fast & cost-effective.',
    costInput: 0.075,
    costOutput: 0.30
  },
  { 
    id: 'gemini-3-pro-preview', 
    name: 'Gemini 3 Pro', 
    description: 'High intelligence & reasoning.', 
    costInput: 2.50, 
    costOutput: 10.00 
  }
];
