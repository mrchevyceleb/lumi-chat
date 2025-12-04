// Supabase Edge Function: gemini-chat
// Proxies chat requests to Gemini or OpenAI API, keeping API keys server-side

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { GoogleGenerativeAI } from "https://esm.sh/@google/generative-ai@0.21.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, accept",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Expose-Headers": "Content-Type, Cache-Control, Connection",
  "Access-Control-Max-Age": "86400",
};

// Check if the model is an OpenAI model (GPT or o1)
function isOpenAIModel(modelId: string): boolean {
  return modelId?.startsWith("gpt-") || modelId === "o1" || modelId === "o1-mini";
}

// Map frontend model IDs to actual API model names
function mapModelId(modelId: string): string {
  const modelMap: Record<string, string> = {
    // Gemini models - map to actual Google API model names
    "gemini-2.5-flash": "gemini-2.5-flash-preview-05-20",
    "gemini-3-pro-preview": "gemini-2.5-pro-preview-06-05",
    "gemini-flash-lite-latest": "gemini-2.0-flash-lite",
    // OpenAI GPT-5 models - use exact API names
    "gpt-5.1": "gpt-5.1",
    "gpt-5-mini": "gpt-5-mini",
    "gpt-5-nano": "gpt-5-nano",
    // o1 models use exact strings
    "o1": "o1",
    "o1-mini": "o1-mini",
  };
  
  const mapped = modelMap[modelId];
  if (mapped) {
    console.log(`Model mapping: ${modelId} -> ${mapped}`);
    return mapped;
  }
  console.log(`Model not mapped, using as-is: ${modelId}`);
  return modelId;
}

// Handle OpenAI streaming response
async function handleOpenAI(
  messages: any[],
  systemInstruction: string,
  modelId: string,
  files: any[],
  textContexts: string[],
  ragContext: string,
  useSearch: boolean
): Promise<Response> {
  const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
  if (!openaiApiKey) {
    throw new Error("OPENAI_API_KEY not configured");
  }

  // Build messages for OpenAI
  const openaiMessages: any[] = [];

  // Add system instruction
  if (systemInstruction) {
    openaiMessages.push({ role: "system", content: systemInstruction });
  }

  // Add conversation history (except last message)
  const lastMessage = messages[messages.length - 1];
  for (const msg of messages.slice(0, -1)) {
    openaiMessages.push({
      role: msg.role === "model" ? "assistant" : "user",
      content: msg.content,
    });
  }

  // Build final user message content
  // Note: Responses API uses "input_text" and "input_image" types (not "text" and "image_url")
  const contentParts: any[] = [];

  // Add text contexts
  if (textContexts && textContexts.length > 0) {
    let contextText = "Here is the file context for my request:\n";
    textContexts.forEach((ctx: string) => {
      contextText += ctx + "\n";
    });
    contextText += "\nUser Request:\n";
    contentParts.push({ type: "input_text", text: contextText });
  }

  // Add images (OpenAI Responses API format)
  if (files && files.length > 0) {
    files.forEach((file: { mimeType: string; data: string }) => {
      contentParts.push({
        type: "input_image",
        image_url: `data:${file.mimeType};base64,${file.data}`,
      });
    });
  }

  // Add user text with optional RAG context
  let finalContent = lastMessage.content;
  if (ragContext) {
    finalContent = `YOUR MEMORY OF THIS USER (from previous conversations):
The following is retrieved context about this user from your long-term memory. This contains information they've shared with you before.

${ragContext}

---

CURRENT REQUEST:
${lastMessage.content}

INSTRUCTIONS: Use the memory above to provide a personalized response. If the user references their "background", previous discussions, or asks you to "remember" something, the information is likely in the memory above.`;
  }
  contentParts.push({ type: "input_text", text: finalContent });

  // If only text, simplify the content
  if (contentParts.length === 1 && contentParts[0].type === "input_text") {
    openaiMessages.push({ role: "user", content: contentParts[0].text });
  } else {
    openaiMessages.push({ role: "user", content: contentParts });
  }

  // Map the model ID to actual API model name
  const actualModelId = mapModelId(modelId);
  
  // Check if this is an o1 model (uses Chat Completions API, not Responses API)
  const isO1Model = actualModelId === "o1" || actualModelId === "o1-mini";

  if (isO1Model) {
    // o1 models use Chat Completions API
    const requestBody: any = {
      model: actualModelId,
      messages: openaiMessages,
      stream: true,
    };

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openaiApiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
    }

    // Create SSE stream for o1 models (Chat Completions format)
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    const stream = new ReadableStream({
      async start(controller) {
        let fullText = "";
        let usage = { input: 0, output: 0 };

        try {
          const reader = response.body!.getReader();

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value);
            const lines = chunk.split("\n");

            for (const line of lines) {
              if (line.startsWith("data: ")) {
                const data = line.slice(6);
                if (data === "[DONE]") continue;

                try {
                  const parsed = JSON.parse(data);
                  
                  // Handle Chat Completions API format
                  if (parsed.choices?.[0]?.delta?.content) {
                    fullText += parsed.choices[0].delta.content;
                    controller.enqueue(
                      encoder.encode(`data: ${JSON.stringify({ type: "chunk", text: fullText })}\n\n`)
                    );
                  }
                  
                  // Extract usage if available
                  if (parsed.usage) {
                    usage.input = parsed.usage.prompt_tokens || 0;
                    usage.output = parsed.usage.completion_tokens || 0;
                  }
                } catch {
                  // Skip non-JSON lines
                }
              }
            }
          }

          // Send final message
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "done",
                text: fullText,
                groundingUrls: [],
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
  }

  // Build request body for Responses API (GPT models)
  const requestBody: any = {
    model: actualModelId,
    input: openaiMessages,
    stream: true,
  };

  // Add web search tool if enabled
  if (useSearch) {
    requestBody.tools = [{ type: "web_search_preview" }];
  }

  // Make streaming request to OpenAI Responses API
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openaiApiKey}`,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
  }

  // Create SSE stream for client
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const stream = new ReadableStream({
    async start(controller) {
      let fullText = "";
      let usage = { input: 0, output: 0 };

      try {
        const reader = response.body!.getReader();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split("\n");

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const data = line.slice(6);
              if (data === "[DONE]") continue;

              try {
                const parsed = JSON.parse(data);
                
                // Handle different event types from Responses API
                if (parsed.type === "response.output_text.delta") {
                  fullText += parsed.delta || "";
                  controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify({ type: "chunk", text: fullText })}\n\n`)
                  );
                } else if (parsed.type === "response.completed") {
                  // Extract usage from completed response
                  if (parsed.response?.usage) {
                    usage.input = parsed.response.usage.input_tokens || 0;
                    usage.output = parsed.response.usage.output_tokens || 0;
                  }
                }
              } catch {
                // Skip non-JSON lines
              }
            }
          }
        }

        // Send final message
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: "done",
              text: fullText,
              groundingUrls: [],
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
}

// Handle Gemini streaming response
async function handleGemini(
  messages: any[],
  systemInstruction: string,
  modelId: string,
  files: any[],
  textContexts: string[],
  ragContext: string,
  useSearch: boolean
): Promise<Response> {
  const apiKey = Deno.env.get("GOOGLE_API_KEY");
  if (!apiKey) {
    throw new Error("GOOGLE_API_KEY not configured");
  }

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

  // Map the model ID to actual API model name
  const actualModelId = mapModelId(modelId) || "gemini-2.0-flash";

  // Create model with config
  const model = genAI.getGenerativeModel({
    model: actualModelId,
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
    finalContent = `YOUR MEMORY OF THIS USER (from previous conversations):
The following is retrieved context about this user from your long-term memory. This contains information they've shared with you before.

${ragContext}

---

CURRENT REQUEST:
${lastMessage.content}

INSTRUCTIONS: Use the memory above to provide a personalized response. If the user references their "background", previous discussions, or asks you to "remember" something, the information is likely in the memory above.`;
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
    const {
      messages,
      systemInstruction,
      modelId,
      useSearch,
      files,
      textContexts,
      ragContext,
    } = await req.json();

    // Route to appropriate handler based on model
    if (isOpenAIModel(modelId)) {
      return await handleOpenAI(
        messages,
        systemInstruction,
        modelId,
        files,
        textContexts,
        ragContext,
        useSearch
      );
    } else {
      return await handleGemini(
        messages,
        systemInstruction,
        modelId,
        files,
        textContexts,
        ragContext,
        useSearch
      );
    }
  } catch (error: any) {
    console.error("Chat proxy error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});


