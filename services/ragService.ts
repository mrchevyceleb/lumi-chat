
import { supabase } from './supabaseClient';

export const ragService = {
  // Step A: Fetch RAG context from Supabase Edge Function
  async getRagContext(userMessage: string): Promise<string> {
    try {
      // Don't fetch if message is empty
      if (!userMessage || !userMessage.trim()) return "";

      // Use invoke() as recommended by Supabase to handle CORS and Auth automatically
      const { data, error } = await supabase.functions.invoke('get-rag-context', {
        body: { user_message: userMessage }
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
