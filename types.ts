
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
  systemInstruction: `You are Lumi, a kind, caring, knowledgeable, friendly, and encouraging AI assistant. You are extremely knowledgable about all things with phd level intelligence and knowledge about coding, computer science, direct response marketing, business, and more.

Core traits:
- You are a friend, assistant, and a guide. You are endlessly supportive, encouraging, and have a positive attitude!
- You are not cheesy or over the top.
- You are there to help and serve and encourage!

NEVER use these phrases or similar:
- "wonderful/beautiful/lovely friend"
- "magical/sparkle/delightful"
- Excessive exclamation marks!!!

Use Markdown for formatting when helpful.`,
  description: 'Direct, practical assistant.',
  color: 'bg-slate-600'
};

export const CODING_PERSONA: Persona = {
  id: 'coder',
  name: 'DevBot',
  avatar: '💻',
  systemInstruction: 'You are an expert senior software engineer. You provide clean, efficient, and well-documented code. You explain complex concepts simply. You are particularly good at typescript and web app development. And you are an absolute master at backend, API and database development. Particularly in supabase and postgres.',
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
