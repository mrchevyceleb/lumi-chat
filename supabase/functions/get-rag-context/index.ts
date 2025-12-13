// Supabase Edge Function: get-rag-context
// Retrieves relevant context from the vector store for RAG
// Uses two-tier strategy: prioritize current conversation, then expand

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Generate embedding using Gemini's embedding model
async function generateEmbedding(text: string): Promise<number[]> {
  const apiKey = Deno.env.get("GOOGLE_API_KEY");
  if (!apiKey) {
    throw new Error("GOOGLE_API_KEY not configured");
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "models/text-embedding-004",
        content: {
          parts: [{ text }]
        },
        taskType: "RETRIEVAL_QUERY"
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Embedding API error: ${error}`);
  }

  const data = await response.json();
  return data.embedding.values;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { user_message, conversation_id } = await req.json();

    console.log("📥 get-rag-context: Received request", {
      hasMessage: !!user_message,
      conversationId: conversation_id,
      messageLength: user_message?.length || 0
    });

    if (!user_message || !user_message.trim()) {
      console.log("⚠️ get-rag-context: Empty message, returning empty context");
      return new Response(JSON.stringify({ context: "" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Initialize Supabase client with service role for database access
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    if (!supabaseUrl || !supabaseServiceKey) {
      console.error("❌ get-rag-context: Missing Supabase configuration");
      throw new Error("Supabase configuration missing");
    }
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get the user from the auth header for filtering
    const authHeader = req.headers.get("authorization");
    let userId: string | null = null;
    
    if (authHeader) {
      const token = authHeader.replace("Bearer ", "");
      const { data: { user }, error: userError } = await supabase.auth.getUser(token);
      if (userError) {
        console.error("⚠️ get-rag-context: Failed to get user from token:", userError);
      }
      userId = user?.id || null;
      console.log("👤 get-rag-context: User ID:", userId ? userId.slice(0, 8) + "..." : "none");
    }

    // Generate embedding for the user's query
    console.log("🔮 get-rag-context: Generating embedding for query:", user_message.slice(0, 50) + "...");
    const queryEmbedding = await generateEmbedding(user_message);
    console.log("✅ get-rag-context: Embedding generated, dimension:", queryEmbedding.length);

    // TWO-TIER STRATEGY:
    // 1. First, try to get results from the CURRENT conversation
    // 2. If not enough good matches, expand to other conversations

    let matches: any[] = [];
    let sameConversationMatches: any[] = [];
    let otherConversationMatches: any[] = [];

    // Tier 1: Search within the current conversation
    if (conversation_id) {
      const sameConvoFilter: Record<string, any> = {
        conversation_id: conversation_id,
      };
      if (userId) {
        sameConvoFilter.user_id = userId;
      }

      console.log("🔍 get-rag-context: Searching same conversation with filter:", sameConvoFilter);

      const { data: sameConvoData, error: sameConvoError } = await supabase.rpc(
        "match_documents",
        {
          query_embedding: queryEmbedding,
          match_threshold: 0.4, // Lower threshold for same conversation
          match_count: 5,
          filter: sameConvoFilter,
        }
      );

      if (sameConvoError) {
        console.error("❌ get-rag-context: Error in same-conversation search:", sameConvoError);
      }

      if (sameConvoData && sameConvoData.length > 0) {
        sameConversationMatches = sameConvoData.map((doc: any) => ({
          ...doc,
          source: "current_conversation"
        }));
        console.log(`✅ get-rag-context: Found ${sameConversationMatches.length} matches in current conversation`);
      } else {
        console.log("ℹ️ get-rag-context: No matches found in current conversation");
      }
    }

    // Tier 2: Only search other conversations if we have < 3 good matches from current convo
    const needMoreContext = sameConversationMatches.length < 3;
    
    console.log(`🔍 get-rag-context: Need more context? ${needMoreContext} (have ${sameConversationMatches.length} from current)`);
    
    if (needMoreContext) {
      const otherConvoFilter: Record<string, any> = {};
      if (userId) {
        otherConvoFilter.user_id = userId;
      }

      console.log("🔍 get-rag-context: Searching other conversations with filter:", otherConvoFilter);

      const { data: otherConvoData, error: otherConvoError } = await supabase.rpc(
        "match_documents",
        {
          query_embedding: queryEmbedding,
          match_threshold: 0.35, // Lower threshold to catch more relevant memories
          match_count: 10, // Get more results so important memories aren't missed
          filter: otherConvoFilter,
        }
      );

      if (otherConvoError) {
        console.error("❌ get-rag-context: Error in other-conversations search:", otherConvoError);
      }

      if (otherConvoData && otherConvoData.length > 0) {
        // Filter out results from the current conversation (if any slipped through)
        otherConversationMatches = otherConvoData
          .filter((doc: any) => doc.metadata?.conversation_id !== conversation_id)
          .map((doc: any) => ({
            ...doc,
            source: "other_conversation"
          }));
        console.log(`✅ get-rag-context: Found ${otherConversationMatches.length} matches in other conversations`);
      } else {
        console.log("ℹ️ get-rag-context: No matches found in other conversations");
      }
    }

    // Combine: prioritize same-conversation matches
    matches = [...sameConversationMatches, ...otherConversationMatches];

    if (matches.length === 0) {
      console.log("⚠️ get-rag-context: No matching documents found");
      return new Response(JSON.stringify({ context: "" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Format the context from matching documents
    const contextParts = matches
      .sort((a: any, b: any) => b.similarity - a.similarity)
      .slice(0, 5) // Max 5 total results
      .map((doc: any, index: number) => {
        const similarity = Math.round(doc.similarity * 100);
        const timestamp = doc.metadata?.timestamp 
          ? new Date(doc.metadata.timestamp).toLocaleDateString() 
          : "Unknown date";
        
        const sourceLabel = doc.source === "current_conversation" 
          ? "THIS conversation" 
          : "a previous conversation";
        
        return `[Memory ${index + 1} - ${similarity}% relevant, from ${sourceLabel}, ${timestamp}]\n${doc.content}`;
      });

    const context = contextParts.join("\n\n---\n\n");
    
    const sameConvoCount = sameConversationMatches.length;
    const otherConvoCount = otherConversationMatches.length;
    console.log(`✅ get-rag-context: Returning ${matches.length} documents: ${sameConvoCount} from current convo, ${otherConvoCount} from others`);
    console.log(`📤 get-rag-context: Context length: ${context.length} chars`);

    return new Response(JSON.stringify({ context }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("❌ get-rag-context: RAG context error:", error);
    console.error("❌ get-rag-context: Error stack:", error.stack);
    return new Response(JSON.stringify({ error: error.message, context: "" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

