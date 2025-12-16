import { supabase } from './supabaseClient';
import { Message, Persona, ModelId, ProcessedFileInfo } from "../types";

export class InvalidApiKeyError extends Error {
  constructor(message: string = "Invalid API Key") {
    super(message);
    this.name = "InvalidApiKeyError";
  }
}

export interface GenerateResponse {
  text: string;
  groundingUrls?: Array<{ title: string; uri: string }>;
  usage?: { input: number; output: number };
  processedFiles?: ProcessedFileInfo[];
  warnings?: string[];
}

export const generateChatTitle = async (userMessage: string): Promise<string | null> => {
  if (!userMessage || userMessage.trim().length < 2) return null;

  try {
    const { data, error } = await supabase.functions.invoke('gemini-title', {
      body: { userMessage }
    });

    if (error) {
      console.error("Title generation error:", error);
      return null;
    }

    return data?.title || null;
  } catch (e) {
    console.error("Title generation failed", e);
    return null;
  }
};

export const previewVoice = async (voiceName: string): Promise<string | null> => {
  try {
    const { data, error } = await supabase.functions.invoke('gemini-tts', {
      body: { 
        text: `Hello! I'm ${voiceName}. Nice to meet you.`,
        voiceName 
      }
    });

    if (error) {
      console.error("Voice preview error:", error);
      
      // Try to parse the response body if available in the error context
      // Supabase functions error usually contains the response body in the error message or context
      if (error instanceof Error) {
         throw error;
      }
      throw new Error("Voice preview failed");
    }

    if (!data?.audioData) {
      console.error("Voice preview error: No audio data in response", data);
      throw new Error("No audio data received from server");
    }

    return data.audioData; // Returns base64 string
  } catch (e: any) {
    console.error("Voice preview failed", e);
    
    // Extract the actual error message if it's wrapped
    let message = e.message;
    if (e.context && e.context.json) {
        try {
            const body = await e.context.json();
            if (body.error) message = body.error;
        } catch (jsonErr) {}
    }
    
    throw new Error(message);
  }
};

// Model-specific context window configurations
// Balanced windows to maintain conversation coherence while managing costs
const MODEL_CONTEXT_CONFIGS: Record<string, { maxMessages: number; maxContextChars: number; minRecentMessages: number }> = {
  // Premium models - increased but still cost-conscious
  'o1': { maxMessages: 16, maxContextChars: 30000, minRecentMessages: 8 },
  'o1-mini': { maxMessages: 18, maxContextChars: 36000, minRecentMessages: 8 },
  'gemini-3-pro-preview': { maxMessages: 22, maxContextChars: 42000, minRecentMessages: 10 },
  'gemini-3.0-pro': { maxMessages: 22, maxContextChars: 42000, minRecentMessages: 10 },
  'gpt-5.2': { maxMessages: 24, maxContextChars: 48000, minRecentMessages: 10 },
  'claude-opus-4-5': { maxMessages: 18, maxContextChars: 36000, minRecentMessages: 8 },
  // Standard models - balanced context
  'gpt-5-mini': { maxMessages: 30, maxContextChars: 56000, minRecentMessages: 10 },
  'gemini-2.5-flash': { maxMessages: 36, maxContextChars: 64000, minRecentMessages: 10 },
  'claude-sonnet-4-5': { maxMessages: 28, maxContextChars: 50000, minRecentMessages: 10 },
  'claude-haiku-4-5': { maxMessages: 36, maxContextChars: 64000, minRecentMessages: 10 },
  // Budget models - generous context
  'gpt-5-nano': { maxMessages: 45, maxContextChars: 72000, minRecentMessages: 12 },
  'gemini-flash-lite-latest': { maxMessages: 45, maxContextChars: 72000, minRecentMessages: 12 },
};

// Default configuration for unknown models
const DEFAULT_CONTEXT_CONFIG = {
  maxMessages: 30,
  maxContextChars: 50000,
  minRecentMessages: 10,
};

/**
 * Gets the appropriate context window config for a model.
 * Expensive models get smaller windows to save costs.
 */
function getContextConfigForModel(modelId: string): typeof DEFAULT_CONTEXT_CONFIG {
  return MODEL_CONTEXT_CONFIGS[modelId] || DEFAULT_CONTEXT_CONFIG;
}

/**
 * Truncates conversation history to a reasonable window size.
 * Prioritizes recent messages while respecting token limits.
 * Uses model-specific limits to optimize costs.
 */
function getContextWindow(messages: Message[], modelId: string): Message[] {
  const config = getContextConfigForModel(modelId);
  
  if (messages.length <= config.minRecentMessages) {
    return messages;
  }

  // Start with the most recent messages
  let selectedMessages: Message[] = [];
  let totalChars = 0;
  
  // Work backwards from most recent, always including minimum recent messages
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    const msgChars = msg.content.length;
    
    // Always include minimum recent messages
    const isMinimumRecent = selectedMessages.length < config.minRecentMessages;
    
    // Check if we'd exceed limits
    const wouldExceedMessages = selectedMessages.length >= config.maxMessages;
    const wouldExceedChars = totalChars + msgChars > config.maxContextChars;
    
    if (!isMinimumRecent && (wouldExceedMessages || wouldExceedChars)) {
      break;
    }
    
    selectedMessages.unshift(msg);
    totalChars += msgChars;
  }
  
  // Log truncation for debugging
  // Context window trimmed if needed (logged silently)
  
  return selectedMessages;
}

export const streamChatResponse = async (
  messages: Message[],
  persona: Persona,
  files: { mimeType: string; data?: string; path?: string; bucket?: string; name?: string; size?: number }[],
  textContexts: string[],
  useSearch: boolean,
  responseLength: 'concise' | 'detailed',
  modelId: ModelId,
  onChunk: (text: string) => void,
  signal?: AbortSignal,
  ragContext?: string,
  chatId?: string
): Promise<GenerateResponse> => {

  let systemInstruction = persona.systemInstruction;

  // Modify instructions based on response length preference
  if (responseLength === 'concise') {
    systemInstruction += "\n\nIMPORTANT: Please be extremely concise and brief in your response. Avoid unnecessary elaboration. Get straight to the point.";
  } else {
    systemInstruction += "\n\nIMPORTANT: Please provide a detailed, comprehensive, and in-depth response. Explain your reasoning where applicable.";
  }

  // Apply context window to prevent sending entire conversation history
  // Uses model-specific limits (expensive models get smaller windows)
  const windowedMessages = getContextWindow(messages, modelId);
  const validMessages = windowedMessages.filter(m => m.content.trim() !== '');

  // Prepare request body
  const requestBody = {
    messages: validMessages.map(m => ({
      role: m.role,
      content: m.content
    })),
    systemInstruction,
    modelId,
    useSearch,
    files: files.filter(f => !f.hasOwnProperty('isTextContext')),
    textContexts,
    ragContext,
    chatId
  };

  let finalResponseText = '';
  let groundingUrls: Array<{ title: string; uri: string }> = [];
  let usage = { input: 0, output: 0 };
  let processedFiles: ProcessedFileInfo[] = [];
  let warnings: string[] = [];

  const { data: sessionData } = await supabase.auth.getSession();
  const authToken = sessionData.session?.access_token;
  const authHeader = authToken
    ? `Bearer ${authToken}`
    : `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im13d29haGx5Z3p2aWV0bWhrbHZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQwNzc2NTUsImV4cCI6MjA3OTY1MzY1NX0.1UoXU-WHslXQQngaeRlE63Ef__o4cNFeV6K3dE_wj2w'}`;

  try {
    // Call the edge function
    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL || 'https://mwwoahlygzvietmhklvy.supabase.co'}/functions/v1/gemini-chat`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream',
          'Authorization': authHeader,
        },
        body: JSON.stringify(requestBody),
        signal,
        // Disable credentials to prevent CORS issues on mobile
        credentials: 'omit'
      }
    );

    if (!response.ok) {
      const error = await response.json();
      if (error.error?.includes('API key') || error.error?.includes('API_KEY')) {
        throw new InvalidApiKeyError("Server API key issue");
      }
      throw new Error(error.error || 'Chat request failed');
    }

    // Handle SSE stream
    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      if (signal?.aborted) break;

      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Process SSE messages
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line in buffer

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));

            if (data.type === 'chunk') {
              finalResponseText = data.text;
              onChunk(finalResponseText);
            } else if (data.type === 'done') {
              finalResponseText = data.text;
              groundingUrls = data.groundingUrls || [];
              usage = data.usage || { input: 0, output: 0 };
              processedFiles = data.processedFiles || [];
              warnings = data.warnings || [];
              onChunk(finalResponseText);
            } else if (data.type === 'error') {
              throw new Error(data.error);
            }
          } catch (parseError) {
            // Skip malformed JSON
          }
        }
      }
    }
  } catch (error: any) {
    console.error("Gemini Error:", error);

    if (error instanceof InvalidApiKeyError || error.name === 'InvalidApiKeyError') {
      throw error;
    }

    if (error.name === 'AbortError') {
      // Request was aborted, that's fine
      return { text: finalResponseText, groundingUrls, usage, processedFiles, warnings };
    }

    const errorMessage = "I'm having trouble connecting right now. Please try again.";
    if (!signal?.aborted) {
      onChunk(errorMessage);
      return { text: errorMessage, groundingUrls: [], usage, processedFiles, warnings };
    }
  }

  // Fallback for empty responses
  if (!finalResponseText && !signal?.aborted) {
    const fallbackText = "I received your message, but couldn't generate a response. Please try rephrasing.";
    onChunk(fallbackText);
    return { text: fallbackText, groundingUrls: [], usage, processedFiles, warnings };
  }

  return { text: finalResponseText, groundingUrls, usage, processedFiles, warnings };
};
