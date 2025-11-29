// Supabase Edge Function: gemini-title
// Generates chat titles using Gemini

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { GoogleGenerativeAI } from "https://esm.sh/@google/generative-ai@0.21.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
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
    const apiKey = Deno.env.get("GOOGLE_API_KEY");
    if (!apiKey) {
      throw new Error("GOOGLE_API_KEY not configured");
    }

    const { userMessage } = await req.json();

    if (!userMessage || userMessage.trim().length < 2) {
      return new Response(JSON.stringify({ title: null }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-lite" });

    const result = await model.generateContent({
      contents: [{
        role: "user",
        parts: [{
          text: `Generate a very short, concise, descriptive title (max 3-6 words) for a chat that begins with this message: "${userMessage}". Return ONLY the title text. Do not use quotes. Do not label it.`
        }]
      }],
      generationConfig: {
        maxOutputTokens: 30,
      },
    });

    const title = result.response.text()?.trim();

    // Filter out generic responses
    if (!title || title.toLowerCase().includes("conversation") || title.length > 50) {
      return new Response(JSON.stringify({ title: null }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ title }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Title generation error:", error);
    return new Response(JSON.stringify({ title: null }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

