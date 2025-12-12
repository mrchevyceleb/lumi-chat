
import { supabase } from './supabaseClient';

/**
 * Checks if a message is likely a simple follow-up that doesn't need RAG.
 * This saves API calls for conversational messages.
 */
function isSimpleFollowUp(message: string, conversationLength: number): boolean {
  const trimmed = message.trim().toLowerCase();
  
  // Only skip RAG for very short messages (< 20 chars) in ongoing conversations
  // We want to be more permissive to avoid missing important context
  if (conversationLength > 2 && trimmed.length < 20) {
    // Common follow-up patterns that don't need external memory
    const followUpPatterns = [
      /^(yes|no|yeah|yep|nope|ok|okay|sure|thanks|thank you|got it|i see|makes sense)$/i,
      /^(why|how|what|when|where|who)\??$/i, // Single-word questions only
      /^(do it|go ahead|sounds good|perfect|great|nice|cool)$/i,
    ];
    
    if (followUpPatterns.some(pattern => pattern.test(trimmed))) {
      return true;
    }
  }
  
  return false;
}

export const ragService = {
  // Step A: Fetch RAG context from Supabase Edge Function
  // Now accepts conversation context to improve relevance filtering
  async getRagContext(
    userMessage: string, 
    conversationId?: string,
    conversationSummary?: string,
    conversationLength: number = 0
  ): Promise<string> {
    try {
      // Don't fetch if message is empty
      if (!userMessage || !userMessage.trim()) {
        return "";
      }

      // Skip RAG for simple follow-up messages to save API calls
      if (isSimpleFollowUp(userMessage, conversationLength)) {
        return "";
      }

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
        console.error("🔴 RAG error:", error.message || error);
        return "";
      }

      // Log only if context was found (useful for debugging RAG)
      if (data?.context) {
        console.log("🟢 RAG context found:", data.context.length, "chars");
      }
      
      return data?.context || "";
    } catch (e: any) {
      console.error("🔴 RAG exception:", e.message || e);
      return "";
    }
  },

  // Step 2: Save memory to Supabase Vector Store
  async saveMemory(userId: string, conversationId: string, userMessage: string, botResponse: string) {
    try {
      const { data, error } = await supabase.functions.invoke('embed-and-store-gemini-document', {
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
         console.error("🔴 RAG save error:", error.message || error);
      }
    } catch (e: any) {
      console.error("🔴 RAG save exception:", e.message || e);
    }
  }
};
