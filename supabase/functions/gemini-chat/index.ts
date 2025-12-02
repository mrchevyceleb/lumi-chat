// Supabase Edge Function: gemini-chat
// Proxies chat requests to Gemini API, keeping API key server-side

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { GoogleGenerativeAI } from "https://esm.sh/@google/generative-ai@0.21.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, accept",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Expose-Headers": "Content-Type, Cache-Control, Connection",
  "Access-Control-Max-Age": "86400",
};

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
    const apiKey = Deno.env.get("GOOGLE_API_KEY");
    if (!apiKey) {
      throw new Error("GOOGLE_API_KEY not configured");
    }

    const {
      messages,
      systemInstruction,
      modelId,
      useSearch,
      files,
      textContexts,
      ragContext,
    } = await req.json();

    const genAI = new GoogleGenerativeAI(apiKey);

    // Prepare tools
    const tools: any[] = [];
    if (useSearch) {
      tools.push({ googleSearch: {} });
    }

    // Prepare history (all messages except the last one)
    const lastMessage = messages[messages.length - 1];
    const history = messages.slice(0, -1).map((msg: any) => ({
      role: msg.role,
      parts: [{ text: msg.content }],
    }));

    // Create model with config
    const model = genAI.getGenerativeModel({
      model: modelId || "gemini-2.0-flash-exp",
      systemInstruction: systemInstruction,
      tools: tools.length > 0 ? tools : undefined,
    });

    // Start chat with history
    const chat = model.startChat({ history });

    // Build current message parts
    const parts: any[] = [];

    // Add text contexts (from zip files, code snippets)
    if (textContexts && textContexts.length > 0) {
      parts.push({ text: "Here is the file context for my request:\n" });
      textContexts.forEach((ctx: string) => {
        parts.push({ text: ctx });
      });
      parts.push({ text: "\nUser Request:\n" });
    }

    // Add image files
    if (files && files.length > 0) {
      files.forEach((file: { mimeType: string; data: string }) => {
        parts.push({
          inlineData: {
            mimeType: file.mimeType,
            data: file.data,
          },
        });
      });
    }

    // Add user text with optional RAG context
    let finalContent = lastMessage.content;
    if (ragContext) {
      finalContent = `IMPORTANT CONTEXT PRIORITY RULES:
1. ALWAYS prioritize the current conversation history above. The user is continuing an existing discussion.
2. Only use the SUPPLEMENTARY MEMORY below if it is DIRECTLY and CLEARLY relevant to both:
   - The current conversation topic/theme
   - The user's specific request
3. If the supplementary memory is about a DIFFERENT topic than the current conversation, IGNORE IT COMPLETELY.
4. When in doubt, rely on the conversation history, not the supplementary memory.

SUPPLEMENTARY MEMORY (use ONLY if directly relevant to current conversation):
${ragContext}

USER'S CURRENT MESSAGE:
${lastMessage.content}`;
    }
    parts.push({ text: finalContent });

    // Stream the response
    const result = await chat.sendMessageStream(parts);

    // Create a readable stream for the response
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        let fullText = "";
        let groundingUrls: any[] = [];
        let usage = { input: 0, output: 0 };

        try {
          for await (const chunk of result.stream) {
            const text = chunk.text();
            if (text) {
              fullText += text;
              // Send chunk as SSE
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ type: "chunk", text: fullText })}\n\n`)
              );
            }

            // Check for grounding metadata
            if (chunk.candidates?.[0]?.groundingMetadata?.groundingChunks) {
              const chunks = chunk.candidates[0].groundingMetadata.groundingChunks;
              chunks.forEach((c: any) => {
                if (c.web?.uri && c.web?.title) {
                  groundingUrls.push({ title: c.web.title, uri: c.web.uri });
                }
              });
            }

            // Check for usage metadata
            if (chunk.usageMetadata) {
              usage.input = chunk.usageMetadata.promptTokenCount || 0;
              usage.output = chunk.usageMetadata.candidatesTokenCount || 0;
            }
          }

          // Send final message with metadata
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "done",
                text: fullText,
                groundingUrls,
                usage,
              })}\n\n`
            )
          );
        } catch (error: any) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "error", error: error.message })}\n\n`
            )
          );
        }

        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error: any) {
    console.error("Gemini proxy error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});


