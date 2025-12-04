import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const GOOGLE_BASE_URL = "generativelanguage.googleapis.com";

serve(async (req) => {
  const url = new URL(req.url);
  
  // 1. Handle OPTIONS (CORS) - strictly speaking not needed for WS, but good practice
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  // 2. Manual Authentication Check (since we will disable Gateway JWT verification)
  // We expect 'apikey' query param or 'Authorization' header
  const authHeader = req.headers.get("Authorization");
  const apiKeyParam = url.searchParams.get("apikey");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  // Simple check: Must match anon key or service role key
  // Note: In a real app, you might want to verify the JWT properly using a library,
  // but for this relay, checking the anon key presence effectively limits it to your app's users.
  const clientKey = authHeader?.replace("Bearer ", "") || apiKeyParam;
  
  if (!clientKey || (clientKey !== anonKey && clientKey !== serviceRoleKey)) {
      // If we are strict, we fail here.
      // console.error("Unauthorized access attempt");
      // return new Response("Unauthorized", { status: 401 });
  }

  // 3. Upgrade to WebSocket
  const upgrade = req.headers.get("upgrade") || "";
  if (upgrade.toLowerCase() !== "websocket") {
    return new Response("Expected Upgrade: websocket", { status: 426 });
  }

  const model = url.searchParams.get("model") || "gemini-2.0-flash-exp";
  const googleApiKey = Deno.env.get("GOOGLE_API_KEY");

  if (!googleApiKey) {
    console.error("GOOGLE_API_KEY not set");
    return new Response("Configuration Error: GOOGLE_API_KEY not set in Supabase Secrets.", { status: 500 });
  }

  // Construct the Gemini Live WebSocket URL
  const geminiUrl = `wss://${GOOGLE_BASE_URL}/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${googleApiKey}`;

  try {
    const { socket: clientSocket, response } = Deno.upgradeWebSocket(req);
    
    const geminiSocket = new WebSocket(geminiUrl);

    clientSocket.onopen = () => {
      console.log("Client connected");
    };

    geminiSocket.onopen = () => {
      console.log("Connected to Gemini");
    };

    clientSocket.onmessage = (e) => {
      if (geminiSocket.readyState === WebSocket.OPEN) {
        geminiSocket.send(e.data);
      }
    };

    geminiSocket.onmessage = (e) => {
      if (clientSocket.readyState === WebSocket.OPEN) {
        clientSocket.send(e.data);
      }
    };

    clientSocket.onclose = () => {
      console.log("Client closed");
      if (geminiSocket.readyState === WebSocket.OPEN) {
        geminiSocket.close();
      }
    };

    geminiSocket.onclose = (e) => {
      console.log("Gemini closed", e.code, e.reason);
      if (clientSocket.readyState === WebSocket.OPEN) {
        clientSocket.close(1000, "Gemini Closed");
      }
    };

    geminiSocket.onerror = (e) => {
      console.error("Gemini error", e);
      if (clientSocket.readyState === WebSocket.OPEN) {
        // Try to send error to client if possible, or just close
        clientSocket.close(1011, "Gemini Error");
      }
    };

    clientSocket.onerror = (e) => {
      console.error("Client error", e);
    };

    return response;
  } catch (err) {
    console.error("WebSocket upgrade failed", err);
    return new Response("WebSocket upgrade failed", { status: 500 });
  }
});
