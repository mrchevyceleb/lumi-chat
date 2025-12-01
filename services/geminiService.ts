import { supabase } from './supabaseClient';
import { Message, Persona, ModelId } from "../types";

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

export const streamChatResponse = async (
  messages: Message[],
  persona: Persona,
  files: { mimeType: string; data: string }[],
  textContexts: string[],
  useSearch: boolean,
  responseLength: 'concise' | 'detailed',
  modelId: ModelId,
  onChunk: (text: string) => void,
  signal?: AbortSignal,
  ragContext?: string
): Promise<GenerateResponse> => {

  let systemInstruction = persona.systemInstruction;

  // Modify instructions based on response length preference
  if (responseLength === 'concise') {
    systemInstruction += "\n\nIMPORTANT: Please be extremely concise and brief in your response. Avoid unnecessary elaboration. Get straight to the point.";
  } else {
    systemInstruction += "\n\nIMPORTANT: Please provide a detailed, comprehensive, and in-depth response. Explain your reasoning where applicable.";
  }

  const validMessages = messages.filter(m => m.content.trim() !== '');

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
    ragContext
  };

  let finalResponseText = '';
  let groundingUrls: Array<{ title: string; uri: string }> = [];
  let usage = { input: 0, output: 0 };

  try {
    // Call the edge function
    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL || 'https://mwwoahlygzvietmhklvy.supabase.co'}/functions/v1/gemini-chat`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im13d29haGx5Z3p2aWV0bWhrbHZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQwNzc2NTUsImV4cCI6MjA3OTY1MzY1NX0.1UoXU-WHslXQQngaeRlE63Ef__o4cNFeV6K3dE_wj2w'}`,
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
      return { text: finalResponseText, groundingUrls, usage };
    }

    const errorMessage = "I'm having trouble connecting right now. Please try again.";
    if (!signal?.aborted) {
      onChunk(errorMessage);
      return { text: errorMessage, groundingUrls: [], usage };
    }
  }

  // Fallback for empty responses
  if (!finalResponseText && !signal?.aborted) {
    const fallbackText = "I received your message, but couldn't generate a response. Please try rephrasing.";
    onChunk(fallbackText);
    return { text: fallbackText, groundingUrls: [], usage };
  }

  return { text: finalResponseText, groundingUrls, usage };
};
