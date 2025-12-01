

import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Sidebar } from './components/Sidebar';
import { MessageBubble } from './components/MessageBubble';
import { ChatInput } from './components/ChatInput'; // New Import
import { streamChatResponse, generateChatTitle, InvalidApiKeyError } from './services/geminiService';
import { ChatSession, Folder, Message, Persona, DEFAULT_PERSONA, CODING_PERSONA, ModelId } from './types';
import { LiveSessionOverlay } from './components/LiveSessionOverlay';
import { supabase } from './services/supabaseClient';
import { dbService, UsageStats } from './services/dbService';
import { ragService } from './services/ragService'; // Import RAG Service
import { AuthOverlay } from './components/AuthOverlay';
import { SettingsModal } from './components/SettingsModal';
import { VaultCapture } from './components/VaultCapture';
import { VaultModal } from './components/VaultModal';
import { ContextMenu } from './components/ContextMenu';

// Mock data initialization
const INITIAL_PERSONAS = [DEFAULT_PERSONA, CODING_PERSONA];

const App: React.FC = () => {
  // --- Auth State ---
  const [session, setSession] = useState<any>(null);
  const [isAuthChecking, setIsAuthChecking] = useState(true);

  // --- App State ---
  // Initialize from LocalStorage to prevent "Reloading" flash and provide instant UI
  const [chats, setChats] = useState<ChatSession[]>(() => {
    try {
      const saved = localStorage.getItem('lumi_chats_cache');
      return saved ? JSON.parse(saved) : [];
    } catch(e) { console.error("Cache parse error", e); return []; }
  });

  const [folders, setFolders] = useState<Folder[]>(() => {
    try {
      const saved = localStorage.getItem('lumi_folders_cache');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  
  // Initialize Active Chat from LocalStorage to persist across reloads
  const [activeChatId, setActiveChatId] = useState<string | null>(() => {
    return localStorage.getItem('lumi_active_chat');
  });

  const [openTabs, setOpenTabs] = useState<string[]>([]); // New: Track open tabs
  const [tabContextMenu, setTabContextMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
    chatId: string;
  } | null>(null);

  // Default sidebar closed on mobile for cleaner UX
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => {
    return window.innerWidth >= 768;
  });
  const [isLoadingData, setIsLoadingData] = useState(false);
  
  // Theme State
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('lumi_dark_mode');
    return saved === 'true';
  });

  // Voice State (Settings)
  const [voiceName, setVoiceName] = useState(() => {
    return localStorage.getItem('lumi_voice_name') || 'Kore';
  });

  // Token Usage State
  const [usageStats, setUsageStats] = useState<UsageStats>({ 
    inputTokens: 0, 
    outputTokens: 0,
    modelBreakdown: {}
  });

  useEffect(() => {
    localStorage.setItem('lumi_voice_name', voiceName);
  }, [voiceName]);

  // Persist Active Chat ID
  useEffect(() => {
    if (activeChatId) {
      localStorage.setItem('lumi_active_chat', activeChatId);
    } else {
      localStorage.removeItem('lumi_active_chat');
    }
  }, [activeChatId]);

  // Persistence Effects for Data Caching (Non-Blocking)
  useEffect(() => {
    const timer = setTimeout(() => {
        try {
            localStorage.setItem('lumi_chats_cache', JSON.stringify(chats));
        } catch(e) { console.warn("Quota exceeded for chat cache"); }
    }, 0);
    return () => clearTimeout(timer);
  }, [chats]);
  
  useEffect(() => {
    const timer = setTimeout(() => {
        localStorage.setItem('lumi_folders_cache', JSON.stringify(folders));
    }, 0);
    return () => clearTimeout(timer);
  }, [folders]);

  // Interaction State
  const [isTyping, setIsTyping] = useState(false);
  
  const [personas, setPersonas] = useState<Persona[]>(() => {
    try {
      const saved = localStorage.getItem('lumi_personas_cache');
      return saved ? JSON.parse(saved) : INITIAL_PERSONAS;
    } catch { return INITIAL_PERSONAS; }
  });

  // Current Persona tracks the selection for *new* chats or the *active* chat's persona
  const [currentPersona, setCurrentPersona] = useState<Persona>(DEFAULT_PERSONA);

  useEffect(() => {
    localStorage.setItem('lumi_personas_cache', JSON.stringify(personas));
  }, [personas]);

  // Sync currentPersona with active chat
  useEffect(() => {
    if (activeChatId) {
      const chat = chats.find(c => c.id === activeChatId);
      if (chat) {
        const p = personas.find(p => p.id === chat.personaId);
        if (p) setCurrentPersona(p);
      }
    }
  }, [activeChatId, chats, personas]);
  
  // Scroll Markers State
  const [scrollMarkers, setScrollMarkers] = useState<{top: number, id: string}[]>([]);
  const [showScrollButton, setShowScrollButton] = useState(false);
  
  // Persona Creation/Editing State
  const [showPersonaModal, setShowPersonaModal] = useState(false);
  const [isCreatingPersona, setIsCreatingPersona] = useState(false);
  const [newPersona, setNewPersona] = useState<Partial<Persona>>({
    id: undefined,
    name: '',
    description: '',
    systemInstruction: '',
    avatar: '🤖',
    color: 'bg-indigo-500'
  });

  const [isLiveMode, setIsLiveMode] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isVaultOpen, setIsVaultOpen] = useState(false);

  // --- Refs ---
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  
  // Scroll State
  const isAtBottomRef = useRef(true); 

  // --- Auth & Data Loading Effect ---
  useEffect(() => {
    const checkUser = async () => {
      setIsAuthChecking(true);
      const { data: { session } } = await supabase.auth.getSession();
      setSession(session);
      setIsAuthChecking(false);
      
      if (session) {
        loadUserData();
      }
    };
    checkUser();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'TOKEN_REFRESHED') return;

      setSession(session);
      if (session) {
        loadUserData();
      } else {
        // Clear state on logout
        setChats([]);
        setFolders([]);
        setPersonas(INITIAL_PERSONAS);
        setActiveChatId(null);
        setOpenTabs([]);
        setUsageStats({ inputTokens: 0, outputTokens: 0, modelBreakdown: {} });
      }
    });

    return () => subscription.unsubscribe();
  }, []);


  // --- Tab Management Effect ---
  useEffect(() => {
    if (activeChatId) {
      setOpenTabs(prev => {
        if (prev.includes(activeChatId)) return prev;
        return [...prev, activeChatId];
      });
    }
  }, [activeChatId]);

  const loadUserData = async () => {
    // Only show loading indicator if we have empty local state
    if (chats.length === 0) setIsLoadingData(true);
    
    try {
        const [fetchedFolders, fetchedPersonas, fetchedChats, fetchedUsage] = await Promise.all([
            dbService.getFolders(),
            dbService.getPersonas(),
            dbService.getChats(),
            dbService.getUsageStats()
        ]);
        
        // Update state with fetched data (reconciliation/overwrite)
        setFolders(fetchedFolders);
        const allPersonas = [...INITIAL_PERSONAS, ...fetchedPersonas];
        setPersonas(allPersonas);
        setChats(fetchedChats);
        setUsageStats(fetchedUsage);
    } catch (error) {
        console.error("Failed to load data", error);
    } finally {
        setIsLoadingData(false);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setIsSettingsOpen(false);
    // Clear cache
    localStorage.removeItem('lumi_chats_cache');
    localStorage.removeItem('lumi_folders_cache');
  };

  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('lumi_dark_mode', String(darkMode));
  }, [darkMode]);

  // --- Scroll Logic ---
  const handleScroll = () => {
    if (chatContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = chatContainerRef.current;
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 100;
      isAtBottomRef.current = isAtBottom;
      setShowScrollButton(!isAtBottom);
    }
  };

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  };

  // Instant scroll on active chat change or reload
  useLayoutEffect(() => {
    isAtBottomRef.current = true;
    scrollToBottom('auto'); // 'auto' ensures instant jump without animation
  }, [activeChatId]);

  // Smooth scroll for new messages (streaming/typing)
  useEffect(() => {
    if (isAtBottomRef.current) {
      scrollToBottom('smooth');
    }
  }, [chats, isTyping]);

  // --- Scroll Marker Calculation ---
  useEffect(() => {
    if (!activeChatId) return;
    const calculateMarkers = () => {
      const container = chatContainerRef.current;
      if (!container) return;
      const userMessages = container.querySelectorAll('[data-role="user"]');
      const totalHeight = container.scrollHeight;
      if (totalHeight === 0) return;
      const newMarkers = Array.from(userMessages).map((el: any) => {
        const relativeTop = el.offsetTop; 
        const percentage = (relativeTop / totalHeight) * 100;
        return { top: percentage, id: el.getAttribute('data-message-id') };
      });
      setScrollMarkers(newMarkers);
    };
    const timeoutId = setTimeout(calculateMarkers, 300);
    const observer = new ResizeObserver(calculateMarkers);
    if (chatContainerRef.current) observer.observe(chatContainerRef.current);
    return () => {
      clearTimeout(timeoutId);
      observer.disconnect();
    };
  }, [chats, activeChatId, isTyping]);

  const scrollToMessage = (id: string) => {
    const el = document.querySelector(`[data-message-id="${id}"]`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const getActiveChat = () => chats.find(c => c.id === activeChatId);

  // --- Actions ---

  const createNewChat = async (personaOverride?: Persona, folderId?: string) => {
    let personaToUse = DEFAULT_PERSONA;
    if (personaOverride) {
      personaToUse = personaOverride;
      setCurrentPersona(personaOverride);
    } else {
      setCurrentPersona(DEFAULT_PERSONA);
    }
    const newChat: ChatSession = {
      id: uuidv4(),
      title: 'New Conversation',
      isPinned: false,
      messages: [],
      personaId: personaToUse.id,
      folderId: folderId,
      lastUpdated: Date.now()
    };
    setChats([newChat, ...chats]);
    setActiveChatId(newChat.id);
    setIsSidebarOpen(false); // Close sidebar when creating new chat
    await dbService.createChat(newChat);
  };

  const handleCloseTab = (e: React.MouseEvent, chatId: string) => {
    e.stopPropagation();
    const newTabs = openTabs.filter(id => id !== chatId);
    setOpenTabs(newTabs);
    if (activeChatId === chatId) {
      if (newTabs.length > 0) setActiveChatId(newTabs[newTabs.length - 1]);
      else setActiveChatId(null);
    }
  };

  const handleTabClick = (chatId: string) => {
    setActiveChatId(chatId);
  };

  const handleTabContextMenu = (e: React.MouseEvent, chatId: string) => {
    e.preventDefault();
    setTabContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      chatId
    });
  };

  const handleCloseOthers = () => {
    if (!tabContextMenu) return;
    const { chatId } = tabContextMenu;
    setOpenTabs([chatId]);
    if (activeChatId !== chatId) setActiveChatId(chatId);
    setTabContextMenu(null);
  };

  const handleCloseToRight = () => {
    if (!tabContextMenu) return;
    const { chatId } = tabContextMenu;
    const index = openTabs.indexOf(chatId);
    if (index === -1) return;
    
    const newTabs = openTabs.slice(0, index + 1);
    setOpenTabs(newTabs);
    
    // If active chat was closed (meaning it was to the right), switch to the current tab
    if (activeChatId && !newTabs.includes(activeChatId)) {
      setActiveChatId(chatId);
    }
    setTabContextMenu(null);
  };

  const handleCloseAll = () => {
    setOpenTabs([]);
    setActiveChatId(null);
    setTabContextMenu(null);
  };

  const handleStopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsTyping(false);
    }
  };

  const handlePersonaChange = async (personaId: string) => {
     const selected = personas.find(p => p.id === personaId) || DEFAULT_PERSONA;
     setCurrentPersona(selected);
     
     // If active chat exists, update its persona immediately
     if (activeChatId) {
        setChats(prev => prev.map(c => c.id === activeChatId ? { ...c, personaId } : c));
        await dbService.updateChat(activeChatId, { personaId });
     }
  };

  // --- NEW: Handle Live Transcript ---
  const handleLiveTranscript = async (content: string, role: 'user' | 'model') => {
    if (!content.trim()) return;

    let chatId = activeChatId;
    let currentChatList = [...chats];
    let isNewChat = false;

    // If no active chat, create one for the live session
    if (!chatId) {
       const newChatId = uuidv4();
       const newChat: ChatSession = {
           id: newChatId,
           title: "Live Voice Chat", 
           isPinned: false,
           messages: [],
           personaId: currentPersona.id,
           lastUpdated: Date.now()
       };
       chatId = newChatId;
       currentChatList = [newChat, ...chats];
       setChats(currentChatList);
       setActiveChatId(chatId);
       isNewChat = true;
       setIsSidebarOpen(false); // Close sidebar when starting new chat via live transcript
       await dbService.createChat(newChat);
    }

    const newMessage: Message = {
        id: uuidv4(),
        role,
        content: content.trim(),
        timestamp: Date.now(),
        type: 'text'
    };

    setChats(prev => prev.map(c => {
        if (c.id === chatId) {
            return {
                ...c,
                messages: [...c.messages, newMessage],
                lastUpdated: Date.now(),
                // If title is generic, update it with first user message
                title: (isNewChat && role === 'user' && c.title === "Live Voice Chat") 
                   ? (content.slice(0, 30) + "...") 
                   : c.title
            };
        }
        return c;
    }));

    await dbService.addMessage(chatId, newMessage);
    isAtBottomRef.current = true;
  };

  // --- NEW: Handle Send Message (Receives data from ChatInput) ---
  const handleSendMessage = async (text: string, files: any[], useSearch: boolean, responseLength: 'concise' | 'detailed', isVoiceActive: boolean, modelId: ModelId, personaId: string) => {
    
    // Ensure we have a chat
    let chatId = activeChatId;
    let currentChatList = [...chats];
    let isNewChat = false;
    
    const usedPersona = personas.find(p => p.id === personaId) || currentPersona;

    // Determine initial title content
    const initialText = text.trim() || files[0]?.name || "New Chat";

    if (!chatId) {
      // Use a neutral, persona-agnostic placeholder title until the AI title is generated
      const title = initialText.slice(0, 60);
      const newChat: ChatSession = {
        id: uuidv4(),
        title: title,
        isPinned: false,
        messages: [],
        personaId: usedPersona.id,
        lastUpdated: Date.now()
      };
      chatId = newChat.id;
      currentChatList = [newChat, ...chats];
      setActiveChatId(chatId);
      isNewChat = true;
      setIsSidebarOpen(false); // Close sidebar when starting new chat
      dbService.createChat(newChat); 
    }

    const chatBeforeUpdate = chats.find(c => c.id === chatId);
    const shouldGenerateTitle = isNewChat || (chatBeforeUpdate && chatBeforeUpdate.messages.length === 0);

    const imageAttachments = files
      .filter(f => f.mimeType.startsWith('image/'))
      .map(f => `data:${f.mimeType};base64,${f.data}`);
      
    const hasImages = imageAttachments.length > 0;
    const messageType = hasImages ? 'image' : 'text';

    const newMessage: Message = {
      id: uuidv4(),
      role: 'user',
      content: text,
      timestamp: Date.now(),
      type: messageType,
      images: hasImages ? imageAttachments : undefined
    };

    // --- INSTANT UI UPDATE ---
    const updatedChats = currentChatList.map(c => {
      if (c.id === chatId) {
        let newTitle = c.title;
        if (c.messages.length === 0 && (c.title === 'New Conversation' || isNewChat)) {
           newTitle = `${usedPersona.name} - ${initialText.slice(0, 40)}`;
        }
        return { 
          ...c, 
          messages: [...c.messages, newMessage],
          title: newTitle,
          lastUpdated: Date.now()
        };
      }
      return c;
    });

    isAtBottomRef.current = true;
    setChats(updatedChats);
    
    // Set Typing Status IMMEDIATELY to avoid "1 second delay" feeling
    // while RAG context is being fetched in background.
    setIsTyping(true);

    // Instant scroll on send
    setTimeout(() => scrollToBottom('auto'), 0);
    
    // Background DB Update
    dbService.addMessage(chatId, newMessage);
    
    const updatedChat = updatedChats.find(c => c.id === chatId);
    if (updatedChat && !isNewChat) {
         dbService.updateChat(chatId, { 
            lastUpdated: Date.now(),
            title: updatedChat.title
         });
    }

    // --- RAG & Title Generation (Background) ---

    // 1. Fetch RAG Context with conversation awareness
    // Build a brief summary of current conversation topic from recent messages
    let ragContext = "";
    if (text.trim()) {
       const updatedChat = updatedChats.find(c => c.id === chatId);
       let conversationSummary = "";
       
       // Extract topic context from recent messages (last 3 exchanges max)
       if (updatedChat && updatedChat.messages.length > 0) {
         const recentMessages = updatedChat.messages.slice(-6); // Last 3 exchanges
         const topics = recentMessages
           .filter(m => m.role === 'user')
           .map(m => m.content.slice(0, 100))
           .join('; ');
         if (topics) {
           conversationSummary = topics.slice(0, 300); // Cap at 300 chars
         }
       }
       
       ragContext = await ragService.getRagContext(text, chatId!, conversationSummary);
    }

    // 2. Title Gen - use AI-only title (no persona prefix)
    if (shouldGenerateTitle && initialText.length > 0) {
      generateChatTitle(initialText).then(async (aiTitle) => {
           if (!aiTitle) return;
           const cleanTitle = aiTitle.replace(/^"|"$/g, '');
           const finalTitle = cleanTitle;
           setChats(prev => prev.map(c => c.id === chatId ? { ...c, title: finalTitle } : c));
           await dbService.updateChat(chatId!, { title: finalTitle });
      });
    }

    const filesToSend = files.filter(f => !f.isTextContext).map(f => ({ mimeType: f.mimeType, data: f.data }));
    const textContexts = files.filter(f => f.isTextContext).map(f => f.data);
    
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const aiMessageId = uuidv4();
    const aiMessageTimestamp = Date.now();
    
    try {
      const activeChat = updatedChats.find(c => c.id === chatId);
      if (!activeChat) throw new Error("Chat lost");

      // Add Model Message Placeholder
      setChats(prev => prev.map(c => {
         if (c.id === chatId) {
           return {
             ...c,
             messages: [...c.messages, { 
                id: aiMessageId, 
                role: 'model', 
                content: '', 
                timestamp: aiMessageTimestamp,
                model: modelId
             }]
           };
         }
         return c;
      }));
      
      await dbService.addMessage(chatId!, { 
          id: aiMessageId, 
          role: 'model', 
          content: '', 
          timestamp: aiMessageTimestamp,
          model: modelId
      });

      // Step B & C: Call Gemini with Context
      const response = await streamChatResponse(
        activeChat.messages,
        usedPersona,
        filesToSend,
        textContexts,
        useSearch,
        responseLength,
        modelId,
        (streamedText) => {
          setChats(prev => prev.map(c => {
            if (c.id === chatId) {
              const msgs = [...c.messages];
              const msgIndex = msgs.findIndex(m => m.id === aiMessageId);
              if (msgIndex !== -1) {
                msgs[msgIndex] = { ...msgs[msgIndex], content: streamedText };
              }
              return { ...c, messages: msgs };
            }
            return c;
          }));
        },
        controller.signal,
        ragContext // Pass RAG context here
      );

      setChats(prev => prev.map(c => {
        if (c.id === chatId) {
          const msgs = [...c.messages];
          const msgIndex = msgs.findIndex(m => m.id === aiMessageId);
          if (msgIndex !== -1) {
            msgs[msgIndex] = { 
              ...msgs[msgIndex], 
              content: response.text,
              groundingUrls: response.groundingUrls 
            };
          }
          return { ...c, messages: msgs };
        }
        return c;
      }));
      
      if (response.usage) {
         const newInput = response.usage.input || 0;
         const newOutput = response.usage.output || 0;
         
         // Update usage locally first for UI responsiveness
         const newBreakdown = { ...usageStats.modelBreakdown };
         if (!newBreakdown[modelId]) newBreakdown[modelId] = { input: 0, output: 0 };
         newBreakdown[modelId].input += newInput;
         newBreakdown[modelId].output += newOutput;

         const newStats = {
            inputTokens: usageStats.inputTokens + newInput,
            outputTokens: usageStats.outputTokens + newOutput,
            modelBreakdown: newBreakdown
         };
         setUsageStats(newStats);
         dbService.updateUsageStats(newInput, newOutput, modelId);
      }

      await dbService.updateMessageContent(aiMessageId, response.text, response.groundingUrls);

      // Step 2: Save Memory to Supabase Vector Store
      if (session?.user?.id && response.text) {
         // Fire and forget, don't await
         ragService.saveMemory(session.user.id, chatId!, text, response.text);
      }

      // Use isVoiceActive param to trigger speech
      if (isVoiceActive && !controller.signal.aborted && 'speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(response.text);
        const voices = window.speechSynthesis.getVoices();
        const preferredVoice = voices.find(v => v.name.includes('Google') && v.lang.startsWith('en')) || voices[0];
        if (preferredVoice) utterance.voice = preferredVoice;
        window.speechSynthesis.speak(utterance);
      }

    } catch (error: any) {
       console.error(error);
       
       // Handle API errors
       const errorMessage = error instanceof InvalidApiKeyError 
         ? "⚠️ Server configuration error. Please contact support."
         : "⚠️ Sorry, something went wrong. Please check your connection.";

       setChats(prev => prev.map(c => {
        if (c.id === chatId) {
          const msgs = [...c.messages];
          const msgIndex = msgs.findIndex(m => m.id === aiMessageId);
          if (msgIndex !== -1) {
            msgs[msgIndex] = { ...msgs[msgIndex], content: errorMessage };
          }
          return { ...c, messages: msgs };
        }
        return c;
      }));
    } finally {
      setIsTyping(false);
      abortControllerRef.current = null;
    }
  };

  // --- Persona Management (same as before) ---
  const saveOrUpdatePersona = async () => {
    if (!newPersona.name) return;
    let personaToSave: Persona;
    const isDefaultId = ['default', 'coder'].includes(newPersona.id || '');

    if (newPersona.id && !isDefaultId) {
      const existingPersona = personas.find(p => p.id === newPersona.id) || newPersona;
      personaToSave = { ...existingPersona, ...newPersona } as Persona;
      const updatedPersonas = personas.map(p => p.id === newPersona.id ? personaToSave : p);
      setPersonas(updatedPersonas);
      if (currentPersona.id === newPersona.id) setCurrentPersona(personaToSave);
    } else {
      personaToSave = {
        ...(newPersona as Persona),
        id: uuidv4(),
        description: newPersona.description || 'Custom AI',
        systemInstruction: newPersona.systemInstruction || 'You are a helpful assistant.',
        avatar: newPersona.avatar || '🤖',
        color: newPersona.color || 'bg-gray-500'
      };
      setPersonas([...personas, personaToSave]);
      setCurrentPersona(personaToSave);
    }
    await dbService.savePersona(personaToSave);
    setIsCreatingPersona(false);
    setShowPersonaModal(false);
    setNewPersona({
      id: undefined, name: '', description: '', systemInstruction: '', avatar: '🤖', color: 'bg-indigo-500'
    });
  };

  const handleDeletePersona = async (personaId: string) => {
    if (['default', 'coder'].includes(personaId)) return;
    if (window.confirm("Are you sure you want to delete this persona?")) {
        const updated = personas.filter(p => p.id !== personaId);
        setPersonas(updated);
        if (currentPersona.id === personaId) setCurrentPersona(DEFAULT_PERSONA);
        await dbService.deletePersona(personaId);
    }
  };

  const startCreatingPersona = () => {
    setNewPersona({ id: undefined, name: '', description: '', systemInstruction: '', avatar: '🤖', color: 'bg-indigo-500' });
    setIsCreatingPersona(true);
    setShowPersonaModal(true);
  };

  const startEditingPersona = (p: Persona) => {
    setNewPersona(p);
    setIsCreatingPersona(true);
    setShowPersonaModal(true);
  };

  // --- Folder Management (same as before) ---
  const handleCreateFolder = async (name: string) => {
    const newFolder = await dbService.createFolder(name);
    if (newFolder) setFolders([...folders, newFolder]);
  };
  
  const handleRenameFolder = async (folderId: string, newName: string) => {
    setFolders(folders.map(f => f.id === folderId ? { ...f, name: newName } : f));
    await dbService.renameFolder(folderId, newName);
  };

  const handleDeleteFolder = async (folderId: string) => {
    setFolders(folders.filter(f => f.id !== folderId));
    setChats(chats.map(c => c.folderId === folderId ? { ...c, folderId: undefined } : c));
    await dbService.deleteFolder(folderId);
  };

  const handleMoveChat = async (chatId: string, folderId: string | undefined) => {
    setChats(chats.map(c => c.id === chatId ? { ...c, folderId } : c));
    await dbService.updateChat(chatId, { folderId });
  };

  const handleDeleteChat = async (chatId: string) => {
    setChats(prev => prev.filter(c => c.id !== chatId));
    setOpenTabs(prev => prev.filter(id => id !== chatId));
    if (activeChatId === chatId) setActiveChatId(null);
    await dbService.deleteChat(chatId);
  };

  const handleRenameChat = async (chatId: string, newTitle: string) => {
    setChats(chats.map(c => c.id === chatId ? { ...c, title: newTitle } : c));
    await dbService.updateChat(chatId, { title: newTitle });
  };

  const handleTogglePin = async (chatId: string) => {
    const chat = chats.find(c => c.id === chatId);
    if (!chat) return;
    const newPinState = !chat.isPinned;
    setChats(chats.map(c => c.id === chatId ? { ...c, isPinned: newPinState } : c));
    await dbService.updateChat(chatId, { isPinned: newPinState });
  };

  // --- RENDERING ---

  // 1. Loading
  if (isAuthChecking) {
     return <div className="flex h-screen w-full bg-[#eef2f9] dark:bg-[#0f172a] items-center justify-center"><div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div></div>;
  }

  // 2. Auth Check
  if (!session) return <AuthOverlay onLoginSuccess={() => loadUserData()} />;

  // 4. Data Sync Loading
  if (isLoadingData && chats.length === 0) {
      return (
          <div className="flex h-screen w-full bg-[#eef2f9] dark:bg-[#0f172a] items-center justify-center">
              <div className="flex flex-col items-center gap-4">
                  <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                  <div className="text-indigo-600 dark:text-indigo-400 font-bold animate-pulse">Syncing Lumi...</div>
              </div>
          </div>
      );
  }

  // 5. Main App
  const activeChat = getActiveChat();

  return (
    <div className="flex h-[100dvh] w-full bg-[#eef2f9] dark:bg-[#020617] text-slate-800 dark:text-slate-100 font-sans relative overflow-hidden transition-colors duration-500">
      <VaultCapture />
      <LiveSessionOverlay 
        isOpen={isLiveMode} 
        onClose={() => setIsLiveMode(false)} 
        persona={currentPersona} 
        voiceName={voiceName}
        onTranscript={handleLiveTranscript} // Pass the handler
      />
      
      <SettingsModal 
        isOpen={isSettingsOpen} 
        onClose={() => setIsSettingsOpen(false)}
        onSignOut={handleSignOut}
        darkMode={darkMode}
        toggleDarkMode={() => setDarkMode(!darkMode)}
        userEmail={session.user.email}
        voiceName={voiceName}
        setVoiceName={setVoiceName}
        usageStats={usageStats}
      />

      <VaultModal 
        isOpen={isVaultOpen} 
        onClose={() => setIsVaultOpen(false)} 
      />

      <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0 pointer-events-none">
         {/* Brighter, more atmospheric nebula blobs for dark mode */}
         <div className="absolute top-[-10%] left-[-10%] w-[60%] h-[60%] bg-purple-200 dark:bg-purple-600/20 rounded-full mix-blend-multiply dark:mix-blend-screen filter blur-3xl opacity-60 animate-blob"></div>
         <div className="absolute top-[-10%] right-[-10%] w-[60%] h-[60%] bg-blue-200 dark:bg-blue-600/20 rounded-full mix-blend-multiply dark:mix-blend-screen filter blur-3xl opacity-60 animate-blob animation-delay-2000"></div>
         <div className="absolute bottom-[-20%] left-[20%] w-[60%] h-[60%] bg-pink-200 dark:bg-pink-600/20 rounded-full mix-blend-multiply dark:mix-blend-screen filter blur-3xl opacity-60 animate-blob animation-delay-4000"></div>
      </div>

      <Sidebar 
        chats={chats} folders={folders} personas={personas} activeChatId={activeChatId}
        onSelectChat={setActiveChatId} onNewChat={() => createNewChat()} onCreateFolder={handleCreateFolder}
        onMoveChat={handleMoveChat} onDeleteChat={handleDeleteChat} onRenameChat={handleRenameChat}
        onTogglePin={handleTogglePin} onRenameFolder={handleRenameFolder} onDeleteFolder={handleDeleteFolder}
        onNewChatInFolder={(fid) => createNewChat(undefined, fid)} isOpen={isSidebarOpen} setIsOpen={setIsSidebarOpen}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenVault={() => setIsVaultOpen(true)}
      />

      <div className="flex-1 flex flex-col z-10 h-full relative min-w-0">
        
        {/* Top Bar - Compact on mobile */}
        <div className="relative z-20 h-12 md:h-14 flex items-center justify-between px-3 md:px-6 bg-white/30 dark:bg-[#0f172a]/40 backdrop-blur-md flex-shrink-0 border-b border-white/40 dark:border-white/5">
           <div className="flex items-center gap-2 md:gap-3 min-w-0">
             <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="text-gray-500 hover:text-indigo-600 transition-colors">
               <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5 md:w-6 md:h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" /></svg>
             </button>
             <h2 className="font-bold text-gray-800 dark:text-white truncate text-sm md:text-base max-w-[180px] md:max-w-none">
                {activeChat ? activeChat.title : 'Lumi'}
                {isLoadingData && <span className="hidden md:inline text-xs font-normal text-indigo-500 ml-2 animate-pulse">(Syncing...)</span>}
             </h2>
           </div>
           
           <div className="flex items-center gap-2 flex-shrink-0">
             <button onClick={() => setIsLiveMode(true)} className="p-2 rounded-full bg-gradient-to-r from-red-500 to-pink-500 text-white shadow-lg shadow-pink-500/20 hover:scale-105 active:scale-95 transition-transform" title="Start Live Voice Chat">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4 md:w-5 md:h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z" /></svg>
             </button>
           </div>
        </div>

        {/* Tabs - Hidden on mobile for cleaner UX */}
        {openTabs.length > 0 && (
          <div className="hidden md:flex items-center gap-1.5 px-3 pt-2 bg-gray-50/50 dark:bg-[#0B1120]/50 border-b border-gray-200 dark:border-white/5 overflow-x-auto custom-scrollbar-hide z-10 h-10 flex-shrink-0">
             {openTabs.map(tabId => {
               const chat = chats.find(c => c.id === tabId);
               if (!chat) return null;
               const isActive = activeChatId === tabId;
               return (
                 <div 
                   key={tabId} 
                   onClick={() => handleTabClick(tabId)} 
                   onContextMenu={(e) => handleTabContextMenu(e, tabId)}
                   className={`group relative flex items-center justify-between gap-2 px-3 h-8 min-w-[120px] max-w-[200px] rounded-t-lg cursor-pointer select-none transition-all duration-200 border-t-2 ${isActive ? 'bg-white dark:bg-[#1e293b]/60 text-indigo-600 dark:text-indigo-300 border-indigo-500 shadow-sm z-10 backdrop-blur-sm' : 'bg-transparent text-gray-500 dark:text-gray-400 hover:bg-white/40 dark:hover:bg-white/5 border-transparent hover:text-gray-700 dark:hover:text-gray-200'}`}
                 >
                   <span className="text-xs font-medium truncate flex-1">{chat.title}</span>
                   <button onClick={(e) => handleCloseTab(e, tabId)} className={`p-0.5 rounded-md opacity-0 group-hover:opacity-100 hover:bg-gray-200 dark:hover:bg-white/10 transition-all ${isActive ? 'opacity-100' : ''}`}>
                     <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3 h-3"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                   </button>
                   {!isActive && (<div className="absolute right-0 top-2 bottom-2 w-[1px] bg-gray-300 dark:bg-white/5 opacity-30 pointer-events-none group-hover:opacity-0" />)}
                 </div>
               );
             })}
          </div>
        )}

        {tabContextMenu && (
          <ContextMenu
            x={tabContextMenu.x}
            y={tabContextMenu.y}
            onClose={() => setTabContextMenu(null)}
            items={[
              { label: 'Close', onClick: () => handleCloseTab({ stopPropagation: () => {} } as any, tabContextMenu.chatId) },
              { label: 'Close Others', onClick: handleCloseOthers },
              { label: 'Close to the Right', onClick: handleCloseToRight },
              { label: 'Close All', onClick: handleCloseAll, danger: true }
            ]}
          />
        )}

        {/* Chat Area */}
        <div className="flex-1 relative min-h-0">
          {showScrollButton && (
            <button onClick={() => scrollToBottom('smooth')} className="absolute bottom-6 right-8 z-30 p-3 bg-white dark:bg-slate-800 rounded-full shadow-xl border border-gray-100 dark:border-white/10 text-indigo-600 dark:text-indigo-400 hover:bg-gray-50 dark:hover:bg-slate-700 transition-all animate-fade-in-up hover:scale-110 active:scale-95" title="Scroll to bottom">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
            </button>
          )}

          {activeChat && (
            <div className="absolute top-0 right-0 h-full w-2 z-20 pointer-events-none py-4">
              {scrollMarkers.map((marker) => (
                <div key={marker.id} className="absolute right-[1px] w-1.5 h-[3px] rounded-full bg-indigo-500/50 hover:bg-indigo-400 cursor-pointer pointer-events-auto transition-colors z-20 shadow-[0_0_10px_rgba(99,102,241,0.5)]" style={{ top: `${marker.top}%` }} title="Go to prompt" onClick={(e) => { e.stopPropagation(); scrollToMessage(marker.id); }} />
              ))}
            </div>
          )}

          <div className="absolute inset-0 overflow-y-auto p-4 md:p-8 space-y-4" ref={chatContainerRef} onScroll={handleScroll}>
             {!activeChat ? (
               <div className="h-full flex flex-col items-center justify-center opacity-80 mt-[-50px]">
                  <div className="w-24 h-24 bg-white/50 dark:bg-white/5 rounded-full flex items-center justify-center mb-6 shadow-xl backdrop-blur-md animate-bounce-slow border border-white/20 dark:border-white/10"><img src="https://xcjqilfhlwbykckzdzry.supabase.co/storage/v1/object/public/images/50ad6e29-e72e-4158-b9cf-486ab30c64c5/d7a6feb7-13c3-4823-84ef-913e89786d2d.png" alt="Lumi" className="w-16 h-16 object-contain" /></div>
                  <h1 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-indigo-600 to-pink-500 bg-clip-text text-transparent mb-3 text-center drop-shadow-sm">How can I help you?</h1>
                  <p className="text-gray-500 dark:text-gray-400 text-center max-w-md">I can help you write code, brainstorm ideas, translate languages, and much more.</p>
               </div>
             ) : (
               <>
                 {activeChat.messages.map((msg, idx) => (
                   <MessageBubble key={msg.id} message={msg} isLast={idx === activeChat.messages.length - 1} isTyping={isTyping && idx === activeChat.messages.length - 1 && msg.role === 'model'} />
                 ))}
                 <div ref={messagesEndRef} />
               </>
             )}
          </div>
        </div>

        {/* Isolated Chat Input Component */}
        <ChatInput 
          onSendMessage={handleSendMessage} 
          isTyping={isTyping} 
          onStop={handleStopGeneration} 
          personas={personas}
          selectedPersonaId={currentPersona.id}
          onPersonaChange={handlePersonaChange}
          onCreatePersona={startCreatingPersona}
          onEditPersona={startEditingPersona}
          onDeletePersona={handleDeletePersona}
        />

      </div>

      {showPersonaModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-fade-in" onClick={() => setShowPersonaModal(false)}>
          <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border border-white/40 dark:border-white/10" onClick={e => e.stopPropagation()}>
             <div className="bg-gradient-to-r from-indigo-600 to-purple-600 p-6 text-white">
                <h2 className="text-2xl font-bold">{newPersona.id && !['default', 'coder'].includes(newPersona.id) ? 'Edit Persona' : 'Create New Persona'}</h2>
                <p className="opacity-80 text-sm mt-1">Design your perfect AI companion</p>
             </div>
             <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
                <div className="flex gap-4">
                  <div className="flex-1"><label className="block text-xs font-bold text-gray-500 uppercase mb-1">Name</label><input className="w-full bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-xl px-4 py-2 outline-none focus:ring-2 focus:ring-indigo-500 dark:text-white" value={newPersona.name} onChange={e => setNewPersona({...newPersona, name: e.target.value})} placeholder="e.g. Chef Bot" /></div>
                  <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">Avatar</label><input className="w-16 text-center bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-xl px-2 py-2 outline-none focus:ring-2 focus:ring-indigo-500 dark:text-white" value={newPersona.avatar} onChange={e => setNewPersona({...newPersona, avatar: e.target.value})} placeholder="👨‍🍳" /></div>
                </div>
                <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">System Instructions</label><textarea className="w-full h-32 bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 dark:text-white resize-none" value={newPersona.systemInstruction} onChange={e => setNewPersona({...newPersona, systemInstruction: e.target.value})} placeholder="How should this AI behave? Be specific about tone, expertise, and format." /></div>
                <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">Description</label><input className="w-full bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-xl px-4 py-2 outline-none focus:ring-2 focus:ring-indigo-500 dark:text-white" value={newPersona.description} onChange={e => setNewPersona({...newPersona, description: e.target.value})} placeholder="Short description for the menu" /></div>
                <div>
                   <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Theme Color</label>
                   <div className="flex gap-2 flex-wrap">
                      {['bg-red-500', 'bg-orange-500', 'bg-amber-500', 'bg-green-500', 'bg-teal-500', 'bg-blue-500', 'bg-indigo-500', 'bg-purple-500', 'bg-pink-500', 'bg-gray-500'].map(c => (
                        <div key={c} onClick={() => setNewPersona({...newPersona, color: c})} className={`w-8 h-8 rounded-full cursor-pointer transition-transform hover:scale-110 ${c} ${newPersona.color === c ? 'ring-2 ring-offset-2 ring-gray-400' : ''}`} />
                      ))}
                   </div>
                </div>
             </div>
             <div className="p-6 pt-0 flex justify-end gap-3">
                <button onClick={() => setShowPersonaModal(false)} className="px-5 py-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-xl font-medium transition-colors">Cancel</button>
                <button onClick={saveOrUpdatePersona} disabled={!newPersona.name} className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-lg shadow-indigo-200 dark:shadow-none transition-transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed">Save Persona</button>
             </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
