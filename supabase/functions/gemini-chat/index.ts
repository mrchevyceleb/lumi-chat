// Supabase Edge Function: gemini-chat
// Proxies chat requests to Gemini, OpenAI, or Anthropic API, keeping API keys server-side

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { GoogleGenerativeAI } from "https://esm.sh/@google/generative-ai@0.21.0";
import Anthropic from "https://esm.sh/@anthropic-ai/sdk@0.39.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { parseIncomingFile, ParsedFile, normalizeMimeType } from "../_shared/file_parsing.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, accept",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Expose-Headers": "Content-Type, Cache-Control, Connection",
  "Access-Control-Max-Age": "86400",
};

type ProcessedFileInfo = {
  name: string;
  mimeType?: string;
  size?: number;
  bucket?: string;
  path?: string;
  kind?: string;
  zipEntryPath?: string;
  truncated?: boolean;
  warning?: string;
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
const DEFAULT_BUCKET = "uploads";

// Check if the model is an OpenAI model (GPT or o1)
function isOpenAIModel(modelId: string): boolean {
  return modelId?.startsWith("gpt-") || modelId === "o1" || modelId === "o1-mini";
}

// Check if the model is an Anthropic model (Claude)
function isAnthropicModel(modelId: string): boolean {
  return modelId?.startsWith("claude-");
}

// Map frontend model IDs to actual API model names
function mapModelId(modelId: string): string {
  const modelMap: Record<string, string> = {
    // Gemini models - map to actual Google API model names
    "gemini-2.5-flash": "gemini-2.5-flash-preview-05-20",
    "gemini-3-pro-preview": "gemini-3-pro-preview",
    "gemini-3.0-pro": "gemini-3-pro-preview", // alias to correct preview model
    "gemini-flash-lite-latest": "gemini-2.0-flash-lite",
    // OpenAI GPT-5 models - use exact API names
    "gpt-5.2": "gpt-5.2-2025-12-11",
    "gpt-5-mini": "gpt-5-mini",
    "gpt-5-nano": "gpt-5-nano",
    // o1 models use exact strings
    "o1": "o1",
    "o1-mini": "o1-mini",
    // Claude models - use API aliases
    "claude-haiku-4-5": "claude-haiku-4-5",
    "claude-sonnet-4-5": "claude-sonnet-4-5",
    "claude-opus-4-5": "claude-opus-4-5",
  };
  
  const mapped = modelMap[modelId];
  if (mapped) {
    console.log(`Model mapping: ${modelId} -> ${mapped}`);
    return mapped;
  }
  console.log(`Model not mapped, using as-is: ${modelId}`);
  return modelId;
}

function formatContextBlock(file: ParsedFile, parentName?: string): string {
  const origin = file.zipEntryPath && parentName
    ? `${parentName} -> ${file.zipEntryPath}`
    : file.zipEntryPath
      ? file.zipEntryPath
      : file.name;

  const meta: string[] = [];
  if (file.mimeType) meta.push(`Type: ${file.mimeType}`);
  if (file.size) meta.push(`Size: ${file.size} bytes`);
  if (file.truncated) meta.push("Note: truncated for length");
  if (file.warning) meta.push(`Warning: ${file.warning}`);

  const metaBlock = meta.length > 0 ? `${meta.join(" | ")}\n` : "";
  const textBlock = file.text ? file.text : "";
  return `FILE: ${origin}\n${metaBlock}${textBlock}`;
}

async function downloadFromStorage(path: string, bucket: string): Promise<Uint8Array> {
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error || !data) {
    throw new Error(`Failed to download ${path} from ${bucket}: ${error?.message || "unknown error"}`);
  }
  const buf = await data.arrayBuffer();
  return new Uint8Array(buf);
}

async function getUserIdFromRequest(req: Request): Promise<string | null> {
  const authHeader = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  const token = authHeader.replace("Bearer ", "");
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user.id;
}

async function saveFileMetadataRows(userId: string | null, chatId: string | null, files: ProcessedFileInfo[]) {
  if (!userId) return;
  const rows = files
    .filter((f) => f.path && f.bucket)
    .map((f) => ({
      user_id: userId,
      chat_id: chatId,
      bucket: f.bucket,
      path: f.path,
      zip_entry_path: f.zipEntryPath ?? null,
      original_name: f.name,
      extension: f.name.includes(".") ? f.name.split(".").pop() : null,
      mime_type: f.mimeType,
      size_bytes: f.size ?? null,
    }));

  if (rows.length === 0) return;

  const { error } = await supabase.from("file_metadata").insert(rows);
  if (error) {
    console.error("File metadata insert failed", error.message);
  }
}

async function processIncomingFiles(
  files: any[] | undefined,
  userId: string | null,
  chatId: string | null
): Promise<{
  processedFiles: ProcessedFileInfo[];
  contextBlocks: string[];
  inlineMedia: any[];
  warnings: string[];
}> {
  const processedFiles: ProcessedFileInfo[] = [];
  const contextBlocks: string[] = [];
  const inlineMedia: any[] = [];
  const warnings: string[] = [];

  for (const file of files || []) {
    const bucket = file.bucket || DEFAULT_BUCKET;
    const incomingMime = normalizeMimeType(file);
    const incoming = { ...file, bucket, mimeType: incomingMime };

    try {
      const parsed = await parseIncomingFile(incoming, downloadFromStorage);

      parsed.forEach((p) => {
        const info: ProcessedFileInfo = {
          name: p.name,
          mimeType: p.mimeType,
          size: p.size ?? file.size,
          bucket: p.bucket || bucket,
          path: p.path || file.path,
          kind: p.kind,
          zipEntryPath: p.zipEntryPath,
          truncated: p.truncated,
          warning: p.warning,
        };
        processedFiles.push(info);
        if (p.warning) {
          warnings.push(`${p.name}: ${p.warning}`);
        }
        if (p.kind === "image" && file.data) {
          inlineMedia.push({ mimeType: p.mimeType, data: file.data });
        }
        if (p.text) {
          contextBlocks.push(formatContextBlock({ ...p, text: p.text }, file.name));
        }
      });
    } catch (err: any) {
      const warning = `Failed to process ${file.name || "file"}: ${err?.message || err}`;
      console.error(warning);
      warnings.push(warning);
      processedFiles.push({
        name: file.name || "file",
        mimeType: incomingMime,
        bucket,
        path: file.path,
        kind: "other",
        warning,
      });
    }
  }

  await saveFileMetadataRows(userId, chatId, processedFiles);

  return { processedFiles, contextBlocks, inlineMedia, warnings };
}

// Handle OpenAI streaming response
async function handleOpenAI(
  messages: any[],
  systemInstruction: string,
  modelId: string,
  mediaFiles: any[],
  textContexts: string[],
  ragContext: string,
  useSearch: boolean,
  meta: { processedFiles: ProcessedFileInfo[]; warnings: string[] }
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
  if (mediaFiles && mediaFiles.length > 0) {
    mediaFiles.forEach((file: { mimeType: string; data: string }) => {
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
                processedFiles: meta.processedFiles,
                warnings: meta.warnings,
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
              processedFiles: meta.processedFiles,
              warnings: meta.warnings,
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
  mediaFiles: any[],
  textContexts: string[],
  ragContext: string,
  useSearch: boolean,
  meta: { processedFiles: ProcessedFileInfo[]; warnings: string[] }
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
  if (mediaFiles && mediaFiles.length > 0) {
    mediaFiles.forEach((file: { mimeType: string; data: string }) => {
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
              processedFiles: meta.processedFiles,
              warnings: meta.warnings,
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

// Handle Anthropic streaming response
async function handleAnthropic(
  messages: any[],
  systemInstruction: string,
  modelId: string,
  mediaFiles: any[],
  textContexts: string[],
  ragContext: string,
  useSearch: boolean,
  meta: { processedFiles: ProcessedFileInfo[]; warnings: string[] }
): Promise<Response> {
  console.log(`🟣 handleAnthropic called with model: ${modelId}`);
  
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    console.error("❌ ANTHROPIC_API_KEY not configured!");
    throw new Error("ANTHROPIC_API_KEY not configured");
  }
  console.log(`✅ ANTHROPIC_API_KEY is configured (length: ${apiKey.length})`);

  const anthropic = new Anthropic({ apiKey });

  // Map the model ID to actual API model name
  const actualModelId = mapModelId(modelId);

  // Build conversation history (exclude last message)
  const lastMessage = messages[messages.length - 1];
  const anthropicMessages: any[] = [];

  // Add conversation history (all messages except the last one)
  for (const msg of messages.slice(0, -1)) {
    anthropicMessages.push({
      role: msg.role === "model" ? "assistant" : "user",
      content: msg.content,
    });
  }

  // Build final user message content array
  const contentParts: any[] = [];

  // Add text contexts (from files, code snippets)
  if (textContexts && textContexts.length > 0) {
    let contextText = "Here is the file context for my request:\n";
    textContexts.forEach((ctx: string) => {
      contextText += ctx + "\n";
    });
    contextText += "\nUser Request:\n";
    contentParts.push({ type: "text", text: contextText });
  }

  // Add images (Anthropic format: base64 with type and source)
  if (mediaFiles && mediaFiles.length > 0) {
    mediaFiles.forEach((file: { mimeType: string; data: string }) => {
      contentParts.push({
        type: "image",
        source: {
          type: "base64",
          media_type: file.mimeType,
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
  contentParts.push({ type: "text", text: finalContent });

  // Add final user message
  anthropicMessages.push({
    role: "user",
    content: contentParts,
  });

  // Note: Anthropic doesn't have built-in web search like Gemini
  // If useSearch is enabled, we'd need to implement it separately or warn the user
  if (useSearch) {
    console.log("Warning: Web search requested but not supported natively by Anthropic");
  }

  console.log(`🚀 Creating Anthropic stream with model: ${actualModelId}`);
  console.log(`   Message count: ${anthropicMessages.length}`);
  console.log(`   System instruction length: ${systemInstruction?.length || 0}`);

  // Create streaming request
  const stream = await anthropic.messages.stream({
    model: actualModelId,
    max_tokens: 4096,
    system: systemInstruction,
    messages: anthropicMessages,
  });
  
  console.log(`✅ Anthropic stream created successfully`);

  // Create SSE stream for client
  const encoder = new TextEncoder();
  const readableStream = new ReadableStream({
    async start(controller) {
      let fullText = "";
      let usage = { input: 0, output: 0 };

      try {
        console.log(`🔄 Starting Anthropic stream processing...`);
        let chunkCount = 0;
        
        // Stream chunks from Anthropic
        for await (const chunk of stream) {
          chunkCount++;
          console.log(`📦 Received chunk ${chunkCount}: type=${chunk.type}`);
          
          if (chunk.type === "content_block_delta") {
            if (chunk.delta?.type === "text_delta") {
              fullText += chunk.delta.text;
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ type: "chunk", text: fullText })}\n\n`)
              );
            }
          } else if (chunk.type === "message_start") {
            // Extract usage from message_start event
            if (chunk.message?.usage) {
              usage.input = chunk.message.usage.input_tokens || 0;
            }
          } else if (chunk.type === "message_delta") {
            // Extract output tokens from message_delta
            if (chunk.usage) {
              usage.output = chunk.usage.output_tokens || 0;
            }
          }
        }

        console.log(`✅ Stream complete. Total chunks: ${chunkCount}, Final text length: ${fullText.length}`);

        // Send final message
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: "done",
              text: fullText,
              groundingUrls: [], // Anthropic doesn't provide grounding URLs
              usage,
              processedFiles: meta.processedFiles,
              warnings: meta.warnings,
            })}\n\n`
          )
        );
      } catch (error: any) {
        console.error("Anthropic streaming error:", error);
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "error", error: error.message })}\n\n`
          )
        );
      }

      controller.close();
    },
  });

  return new Response(readableStream, {
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
    const body = await req.json();
    const {
      messages,
      systemInstruction,
      modelId,
      useSearch,
      files,
      textContexts,
      ragContext,
      chatId = null,
    } = body;

    const userId = await getUserIdFromRequest(req);
    const { processedFiles, contextBlocks, inlineMedia, warnings } = await processIncomingFiles(
      files,
      userId,
      chatId
    );

    const mergedTextContexts = [...(textContexts || []), ...contextBlocks];

    // Route to appropriate handler based on model
    console.log(`🔀 Routing request for model: ${modelId}`);
    console.log(`   isOpenAIModel: ${isOpenAIModel(modelId)}`);
    console.log(`   isAnthropicModel: ${isAnthropicModel(modelId)}`);
    
    if (isOpenAIModel(modelId)) {
      console.log(`📤 Routing to OpenAI handler`);
    } else if (isAnthropicModel(modelId)) {
      console.log(`📤 Routing to Anthropic handler`);
    } else {
      console.log(`📤 Routing to Gemini handler (fallback)`);
    }
    
    if (isOpenAIModel(modelId)) {
      return await handleOpenAI(
        messages,
        systemInstruction,
        modelId,
        inlineMedia,
        mergedTextContexts,
        ragContext,
        useSearch,
        { processedFiles, warnings }
      );
    } else if (isAnthropicModel(modelId)) {
      return await handleAnthropic(
        messages,
        systemInstruction,
        modelId,
        inlineMedia,
        mergedTextContexts,
        ragContext,
        useSearch,
        { processedFiles, warnings }
      );
    } else {
      return await handleGemini(
        messages,
        systemInstruction,
        modelId,
        inlineMedia,
        mergedTextContexts,
        ragContext,
        useSearch,
        { processedFiles, warnings }
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


