import React, { useEffect, useRef, useState } from 'react';
import { Persona } from '../types';
import { AudioUtils } from '../services/audioUtils';

// Types for the raw WebSocket protocol
interface SetupMessage {
  setup: {
    model: string;
    generationConfig?: {
        responseModalities?: string[];
        speechConfig?: {
            voiceConfig?: {
                prebuiltVoiceConfig?: {
                    voiceName: string;
                }
            }
        }
    };
    systemInstruction?: {
        parts: { text: string }[];
    }
  }
}

interface ClientContentMessage {
    realtimeInput: {
        mediaChunks: {
            mimeType: string;
            data: string; // base64
        }[];
    }
}

interface ServerMessage {
    serverContent?: {
        modelTurn?: {
            parts?: {
                inlineData?: {
                    mimeType: string;
                    data: string;
                }
            }[];
        };
        turnComplete?: boolean;
        interrupted?: boolean;
    };
    toolCall?: any; // Ignored for now
    // Live API v1alpha/beta variations:
    inputAudioTranscription?: { text: string }; // Might be inside serverContent or separate depending on version
}

interface TranscriptEntry {
  text: string;
  role: 'user' | 'model';
}

interface LiveSessionOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  persona: Persona;
  voiceName: string;
  onTranscript?: (text: string, role: 'user' | 'model') => void;
  onCallEnd?: (transcripts: TranscriptEntry[]) => void;
}

export const LiveSessionOverlay: React.FC<LiveSessionOverlayProps> = ({ isOpen, onClose, persona, voiceName, onTranscript, onCallEnd }) => {
  const [status, setStatus] = useState<'connecting' | 'connected' | 'error' | 'disconnected'>('connecting');
  const [volume, setVolume] = useState(0); // 0 to 100 for visualizer
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  
  // Real-time subtitle display state
  const [currentSubtitle, setCurrentSubtitle] = useState<string>("");

  // Refs for audio context and session management to persist across renders
  const audioContextsRef = useRef<{ input?: AudioContext, output?: AudioContext }>({});
  const wsRef = useRef<WebSocket | null>(null);
  
  // Refs for audio nodes to prevent Garbage Collection (Fix for Desktop "Immediate Disconnect")
  const audioProcessingRef = useRef<{
    source?: MediaStreamAudioSourceNode;
    processor?: ScriptProcessorNode;
    stream?: MediaStream;
  }>({});

  const nextStartTimeRef = useRef<number>(0);
  const audioSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const mountedRef = useRef(true);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number>(0);
  
  // Track the current active session ID to ignore stale callbacks from race conditions
  const currentSessionIdRef = useRef<string>("");

  // Refs to accumulate transcription chunks until turn completion
  const inputTranscriptBuffer = useRef<string>("");
  const outputTranscriptBuffer = useRef<string>("");
  
  // Track all transcripts during the call
  const allTranscriptsRef = useRef<TranscriptEntry[]>([]);
  
  // Keep onTranscript prop up-to-date in refs to avoid stale closures in Live API callbacks
  const onTranscriptRef = useRef(onTranscript);
  useEffect(() => { onTranscriptRef.current = onTranscript; }, [onTranscript]);
  
  // Keep onCallEnd prop up-to-date in refs
  const onCallEndRef = useRef(onCallEnd);
  useEffect(() => { onCallEndRef.current = onCallEnd; }, [onCallEnd]);

  useEffect(() => {
    mountedRef.current = true;
    
    if (isOpen) {
      setErrorMessage(null);
      setCurrentSubtitle("");
      startSession();
    } else {
      cleanup();
    }

    return () => {
      mountedRef.current = false;
      cleanup();
    };
  }, [isOpen, persona.id, voiceName]);

  // Visualizer Loop
  useEffect(() => {
    if (!isOpen) return;

    const updateVisualizer = () => {
      if (analyserRef.current) {
        const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteFrequencyData(dataArray);
        
        // Calculate average volume
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const average = sum / dataArray.length;
        setVolume(average); // 0 - 255 roughly
      }
      animationFrameRef.current = requestAnimationFrame(updateVisualizer);
    };
    
    updateVisualizer();
    return () => cancelAnimationFrame(animationFrameRef.current);
  }, [isOpen, status]);

  const cleanup = () => {
    // Send any remaining buffered transcripts before cleanup
    const remainingTranscripts: TranscriptEntry[] = [];
    if (inputTranscriptBuffer.current.trim()) {
      remainingTranscripts.push({ text: inputTranscriptBuffer.current.trim(), role: 'user' });
    }
    if (outputTranscriptBuffer.current.trim()) {
      remainingTranscripts.push({ text: outputTranscriptBuffer.current.trim(), role: 'model' });
    }
    
    // Combine all transcripts and send them when call ends
    const allTranscripts = [...allTranscriptsRef.current, ...remainingTranscripts];
    if (allTranscripts.length > 0 && onCallEndRef.current) {
      onCallEndRef.current(allTranscripts);
    }
    
    // Clear transcripts for next session
    allTranscriptsRef.current = [];
    inputTranscriptBuffer.current = "";
    outputTranscriptBuffer.current = "";

    // Invalidate current session ID
    currentSessionIdRef.current = "";

    // Stop and disconnect input processing nodes (Prevents memory leaks and holding Mic)
    if (audioProcessingRef.current.stream) {
        audioProcessingRef.current.stream.getTracks().forEach(track => track.stop());
    }
    audioProcessingRef.current.source?.disconnect();
    audioProcessingRef.current.processor?.disconnect();
    audioProcessingRef.current = {};

    // Stop all playing sources
    audioSourcesRef.current.forEach(source => {
      try { source.stop(); } catch (e) {}
    });
    audioSourcesRef.current.clear();

    // Close contexts
    try { audioContextsRef.current.input?.close(); } catch(e) {}
    try { audioContextsRef.current.output?.close(); } catch(e) {}
    audioContextsRef.current = {};

    // Close WebSocket
    if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
    }
  };

  const startSession = async () => {
    // Create unique ID for this session attempt
    const sessionId = Math.random().toString(36).substring(7);
    currentSessionIdRef.current = sessionId;
    
    // Clear transcription buffers
    inputTranscriptBuffer.current = "";
    outputTranscriptBuffer.current = "";
    allTranscriptsRef.current = [];
    
    setStatus('connecting');

    try {
      // 1. Setup Audio Contexts
      // Input: 16kHz for Gemini
      const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      // Output: 24kHz for high quality response
      const outputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      
      // Explicitly resume contexts to avoid 'suspended' state
      if (inputCtx.state === 'suspended') await inputCtx.resume();
      if (outputCtx.state === 'suspended') await outputCtx.resume();

      audioContextsRef.current = { input: inputCtx, output: outputCtx };

      // Setup Visualizer Analyser
      const analyser = outputCtx.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;
      
      // 2. Get User Media
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioProcessingRef.current.stream = stream;
      } catch (err) {
        throw new Error("Microphone access denied. Please allow microphone permissions.");
      }
      
      // 3. Connect to Gemini Live Relay (Edge Function)
      // Construct URL for Supabase Edge Function
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://mwwoahlygzvietmhklvy.supabase.co';
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      
      // Replace https with wss and include apikey (needed for Supabase Auth/Gateway)
      const wsUrl = `${supabaseUrl.replace('http', 'ws')}/functions/v1/gemini-live-relay?model=gemini-2.0-flash-exp&apikey=${anonKey}`;
      
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (currentSessionIdRef.current !== sessionId) return;
        if (mountedRef.current) setStatus('connected');

        // Send Setup Message
        const setupMsg: SetupMessage = {
            setup: {
                model: "models/gemini-2.0-flash-exp",
                generationConfig: {
                    responseModalities: ["AUDIO"],
                    speechConfig: {
                        voiceConfig: {
                            prebuiltVoiceConfig: {
                                voiceName: voiceName
                            }
                        }
                    }
                },
                systemInstruction: {
                    parts: [{ text: `You are acting as the persona: ${persona.name}. ${persona.systemInstruction}. Keep your responses relatively concise and conversational as this is a voice chat.` }]
                }
            }
        };
        ws.send(JSON.stringify(setupMsg));

        // Setup Audio Input Stream
        const source = inputCtx.createMediaStreamSource(stream);
        const scriptProcessor = inputCtx.createScriptProcessor(4096, 1, 1);
        
        audioProcessingRef.current.source = source;
        audioProcessingRef.current.processor = scriptProcessor;

        scriptProcessor.onaudioprocess = (e) => {
            if (currentSessionIdRef.current !== sessionId || ws.readyState !== WebSocket.OPEN) return;
            
            const inputData = e.inputBuffer.getChannelData(0);
            const base64 = AudioUtils.createBlob(inputData).data;

            const msg: ClientContentMessage = {
                realtimeInput: {
                    mediaChunks: [{
                        mimeType: "audio/pcm;rate=16000",
                        data: base64
                    }]
                }
            };
            ws.send(JSON.stringify(msg));
        };

        source.connect(scriptProcessor);
        scriptProcessor.connect(inputCtx.destination);
      };

      ws.onmessage = async (event) => {
        if (currentSessionIdRef.current !== sessionId) return;
        
        try {
            let message: ServerMessage;
            if (event.data instanceof Blob) {
                 // Handle blob if necessary, but Gemini sends JSON text frames mostly
                 const text = await event.data.text();
                 message = JSON.parse(text);
            } else {
                 message = JSON.parse(event.data);
            }

            // --- Audio Handling ---
            const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (base64Audio) {
                // Reset/Sync time if needed
                nextStartTimeRef.current = Math.max(nextStartTimeRef.current, outputCtx.currentTime);

                const audioBuffer = await AudioUtils.decodeAudioData(
                  AudioUtils.decode(base64Audio),
                  outputCtx,
                  24000,
                  1
                );

                const source = outputCtx.createBufferSource();
                source.buffer = audioBuffer;
                
                // Connect to visualizer and output
                source.connect(analyser);
                analyser.connect(outputCtx.destination);

                source.addEventListener('ended', () => {
                  audioSourcesRef.current.delete(source);
                });

                source.start(nextStartTimeRef.current);
                nextStartTimeRef.current += audioBuffer.duration;
                audioSourcesRef.current.add(source);
            }
            
            // --- Transcription Handling ---
            // Extract transcripts from various possible message formats
            // User input transcription
            if (message.inputAudioTranscription?.text) {
                inputTranscriptBuffer.current += message.inputAudioTranscription.text + " ";
            }
            // Check for transcription in serverContent
            if (message.serverContent?.modelTurn?.parts) {
                for (const part of message.serverContent.modelTurn.parts) {
                    if (part.text) {
                        outputTranscriptBuffer.current += part.text + " ";
                        setCurrentSubtitle(part.text);
                    }
                }
            }
            // Check for separate transcription fields
            if ((message as any).transcription?.text) {
                inputTranscriptBuffer.current += (message as any).transcription.text + " ";
            }
            
            // Handle Turn Completion
            if (message.serverContent?.turnComplete) {
                // Clear buffers or handle end of turn logic
                if (inputTranscriptBuffer.current.trim()) {
                     const text = inputTranscriptBuffer.current.trim();
                     onTranscriptRef.current?.(text, 'user');
                     allTranscriptsRef.current.push({ text, role: 'user' });
                     inputTranscriptBuffer.current = "";
                }
                if (outputTranscriptBuffer.current.trim()) {
                     const text = outputTranscriptBuffer.current.trim();
                     onTranscriptRef.current?.(text, 'model');
                     allTranscriptsRef.current.push({ text, role: 'model' });
                     outputTranscriptBuffer.current = "";
                }
            }

            if (message.serverContent?.interrupted) {
                audioSourcesRef.current.forEach(src => src.stop());
                audioSourcesRef.current.clear();
                nextStartTimeRef.current = outputCtx.currentTime;
                setCurrentSubtitle(""); 
            }

        } catch (err) {
            console.error("Message processing error", err);
        }
      };

      ws.onclose = () => {
         if (currentSessionIdRef.current === sessionId && mountedRef.current) {
            setStatus('disconnected');
         }
      };

      ws.onerror = (err) => {
         console.error("WebSocket Error:", err);
         if (currentSessionIdRef.current === sessionId && mountedRef.current) {
            setStatus('error');
            setErrorMessage("Connection failed");
         }
      };

    } catch (e: any) {
      if (currentSessionIdRef.current === sessionId) {
          console.error("Failed to start session", e);
          setStatus('error');
          setErrorMessage(e.message);
      }
    }
  };

  // --- Render Helpers ---

  // Calculate scale for pulsing effect based on volume
  // Volume is 0-255 roughly. We want scale 1.0 to 1.5
  const scale = 1 + (volume / 255) * 0.5;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/80 backdrop-blur-xl transition-opacity animate-fade-in">
      
      {/* Header */}
      <div className="absolute top-0 w-full p-6 flex justify-between items-center text-white/80">
        <div className="flex items-center gap-2">
           <span className="text-xl">{persona.avatar}</span>
           <span className="font-bold tracking-wide text-sm uppercase">{persona.name} Live</span>
        </div>
        <button 
          onClick={onClose} 
          className="bg-white/10 hover:bg-white/20 p-2 rounded-full transition-colors backdrop-blur-sm"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Main Visualizer */}
      <div className="relative flex items-center justify-center w-64 h-64">
        {/* Glow Effects */}
        <div 
           className={`absolute w-full h-full rounded-full blur-3xl opacity-30 transition-all duration-100 ${persona.color.replace('bg-', 'bg-')}`}
           style={{ transform: `scale(${scale * 1.5})` }}
        />
        
        {/* Core Circle */}
        <div 
           className={`relative z-10 w-32 h-32 rounded-full shadow-[0_0_50px_rgba(255,255,255,0.3)] flex items-center justify-center transition-all duration-75 ${persona.color}`}
           style={{ transform: `scale(${scale})` }}
        >
           {status === 'connecting' ? (
             <div className="w-8 h-8 border-4 border-white/30 border-t-white rounded-full animate-spin" />
           ) : (
             <span className="text-4xl filter drop-shadow-lg">{persona.avatar}</span>
           )}
        </div>
        
        {/* Ripples */}
        {status === 'connected' && (
           <>
             <div className="absolute w-full h-full border border-white/20 rounded-full animate-ping opacity-20" style={{ animationDuration: '3s' }}></div>
             <div className="absolute w-[80%] h-[80%] border border-white/10 rounded-full animate-ping opacity-20" style={{ animationDuration: '3s', animationDelay: '1s' }}></div>
           </>
        )}
      </div>

      {/* Status Text / Subtitles */}
      <div className="mt-12 text-center space-y-4 px-8 w-full max-w-2xl">
        <h2 className="text-2xl font-light text-white">
          {status === 'connecting' && "Connecting..."}
          {status === 'connected' && !currentSubtitle && "Listening..."}
          {status === 'error' && "Connection Failed"}
          {status === 'disconnected' && "Session Ended"}
        </h2>
        
        {/* Subtitles Area */}
        {status === 'connected' && currentSubtitle && (
           <p className="text-white/90 text-lg font-medium animate-fade-in-up">
             "{currentSubtitle}"
           </p>
        )}

        <p className="text-white/40 text-sm max-w-xs mx-auto">
          {status === 'error' ? errorMessage : (status === 'connected' && !currentSubtitle ? "Speak naturally. Lumi will respond." : "")}
        </p>
        
        {status === 'error' && (
           <button onClick={() => startSession()} className="mt-2 text-indigo-300 hover:text-white underline text-sm">
             Try Again
           </button>
        )}
      </div>

      {/* Footer Controls */}
      <div className="absolute bottom-10 flex gap-6">
         <button 
           onClick={onClose}
           className="px-8 py-3 bg-red-500/80 hover:bg-red-500 text-white rounded-full font-bold shadow-lg backdrop-blur-md transition-all hover:scale-105 active:scale-95"
         >
           End Call
         </button>
      </div>

    </div>
  );
};
