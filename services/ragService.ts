
import { supabase } from './supabaseClient';

export const ragService = {
  // Step A: Fetch RAG context from Supabase Edge Function
  // Now accepts conversation context to improve relevance filtering
  async getRagContext(
    userMessage: string, 
    conversationId?: string,
    conversationSummary?: string
  ): Promise<string> {
    try {
      // Don't fetch if message is empty
      if (!userMessage || !userMessage.trim()) return "";

      // Build the query with conversation context for better relevance
      const queryWithContext = conversationSummary 
        ? `[Current conversation topic: ${conversationSummary}] ${userMessage}`
        : userMessage;

      // Use invoke() as recommended by Supabase to handle CORS and Auth automatically
      const { data, error } = await supabase.functions.invoke('get-rag-context', {
        body: { 
          user_message: queryWithContext,
          conversation_id: conversationId // Can be used server-side to boost same-conversation results
        }
      });

      if (error) {
        console.error("🔴 RAG Context invoke error:", error);
        return "";
      }

      console.log("🟢 RAG Context received:", data?.context?.slice(0, 100) || "(empty)");
      return data?.context || "";
    } catch (e) {
      console.error("🔴 RAG Context exception:", e);
      return "";
    }
  },

  // Step 2: Save memory to Supabase Vector Store
  async saveMemory(userId: string, conversationId: string, userMessage: string, botResponse: string) {
    try {
      const { error } = await supabase.functions.invoke('embed-and-store-gemini-document', {
        body: {
          text: `User: ${userMessage}\nBot: ${botResponse}`,
          metadata: {
            user_id: userId,
            conversation_id: conversationId,
            timestamp: new Date().toISOString()
          }
        }
      });
      
      if (error) {
         console.error("🔴 Save memory error:", error);
      } else {
         console.log("🟢 Memory saved successfully");
      }
    } catch (e) {
      console.error("🔴 Save memory exception:", e);
    }
  }
};
