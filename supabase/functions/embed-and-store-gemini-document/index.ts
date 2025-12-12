// Supabase Edge Function: embed-and-store-gemini-document
// Creates embeddings with Gemini text-embedding-004 and stores into public.documents

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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
        content: { parts: [{ text }] },
        taskType: "RETRIEVAL_DOCUMENT",
      }),
    },
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
    const { text, metadata } = await req.json();

    console.log("📥 embed-and-store: Received request", {
      textLength: text?.length || 0,
      hasMetadata: !!metadata,
      metadata: metadata
    });

    if (!text || !text.trim()) {
      console.log("⚠️ embed-and-store: Empty text provided");
      return new Response(JSON.stringify({ error: "Text is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      console.error("❌ embed-and-store: Missing Supabase configuration");
      throw new Error("Supabase service configuration missing");
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // 1) Create embedding
    console.log("🔮 embed-and-store: Generating embedding...");
    const embedding = await generateEmbedding(text);
    console.log("✅ embed-and-store: Embedding generated, dimension:", embedding.length);

    // 2) Insert document with embedding + metadata
    // Include user_id as a column (not just in metadata) for RLS security
    console.log("💾 embed-and-store: Inserting document into database...");
    const { data, error } = await supabase
      .from("documents")
      .insert({
        content: text,
        embedding,
        metadata: metadata || {},
        user_id: metadata?.user_id || null,
      })
      .select("id")
      .single();

    if (error) {
      console.error("❌ embed-and-store: Database insert failed:", error);
      throw new Error(error.message || "Insert failed");
    }

    console.log("✅ embed-and-store: Document stored successfully, ID:", data.id);

    return new Response(JSON.stringify({ id: data.id }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("❌ embed-and-store: Error:", error);
    console.error("❌ embed-and-store: Error stack:", error.stack);
    return new Response(
      JSON.stringify({ error: error.message || "Server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});

