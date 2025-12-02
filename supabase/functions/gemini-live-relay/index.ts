import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const GOOGLE_BASE_URL = "generativelanguage.googleapis.com";

serve(async (req) => {
  const upgrade = req.headers.get("upgrade") || "";
  if (upgrade.toLowerCase() !== "websocket") {
    return new Response("Expected Upgrade: websocket", { status: 426 });
  }

  const url = new URL(req.url);
  const model = url.searchParams.get("model") || "gemini-2.0-flash-exp";
  const apiKey = Deno.env.get("GOOGLE_API_KEY");

  if (!apiKey) {
    console.error("GOOGLE_API_KEY not set");
    return new Response("Internal Server Error", { status: 500 });
  }

  // Construct the Gemini Live WebSocket URL
  // Format: wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=API_KEY
  const geminiUrl = `wss://${GOOGLE_BASE_URL}/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${apiKey}`;

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
        clientSocket.close();
      }
    };

    geminiSocket.onerror = (e) => {
      console.error("Gemini error", e);
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

