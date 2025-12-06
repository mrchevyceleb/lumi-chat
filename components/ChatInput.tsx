
import React, { useState, useRef, useEffect } from 'react';
import { AVAILABLE_MODELS, ModelId, Persona, FileAttachment } from '../types';
import { supabase } from '../services/supabaseClient';

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25MB safety cap
const ACCEPTED_UPLOAD_MIMES = new Set([
  'application/pdf',
  'application/zip',
  'application/x-zip-compressed'
]);
const INLINE_TEXT_EXT = /\.(md|txt|csv|json)$/i;

const sanitizeFileName = (name: string) => name.replace(/[^a-zA-Z0-9._-]/g, '_');
const buildStoragePath = (userId: string, file: File) => {
  const suffix = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
  return `${userId}/${Date.now()}-${suffix}-${sanitizeFileName(file.name)}`;
};

const readFileAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

const readFileAsText = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string) || '');
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });

interface ChatInputProps {
  onSendMessage: (text: string, files: FileAttachment[], useSearch: boolean, responseLength: 'concise' | 'detailed', isVoiceActive: boolean, modelId: ModelId, personaId: string) => void;
  onStop: () => void;
  isTyping: boolean;
  personas: Persona[];
  selectedPersonaId: string;
  onPersonaChange: (personaId: string) => void;
  onCreatePersona: () => void;
  onEditPersona: (persona: Persona) => void;
  onDeletePersona: (personaId: string) => void;
  selectedModel: ModelId;
  onModelChange: (modelId: ModelId) => void;
  useSearch: boolean;
  onToggleSearch: (value: boolean) => void;
}

export const ChatInput: React.FC<ChatInputProps> = ({ 
  onSendMessage, 
  onStop, 
  isTyping, 
  personas, 
  selectedPersonaId, 
  onPersonaChange,
  onCreatePersona,
  onEditPersona,
  onDeletePersona,
  selectedModel,
  onModelChange,
  useSearch,
  onToggleSearch
}) => {
  const [input, setInput] = useState('');
  const [attachedFiles, setAttachedFiles] = useState<FileAttachment[]>([]);
  const [responseLength, setResponseLength] = useState<'concise' | 'detailed'>('detailed');
  const [isListening, setIsListening] = useState(false);
  
  const [showModelMenu, setShowModelMenu] = useState(false);
  const [showPersonaMenu, setShowPersonaMenu] = useState(false);
  const [showMobileOptions, setShowMobileOptions] = useState(false); // NEW: Mobile Options State
  
  // Snippet Modal State
  const [showSnippetModal, setShowSnippetModal] = useState(false);
  const [snippetName, setSnippetName] = useState('');
  const [snippetContent, setSnippetContent] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);
  const modelMenuRef = useRef<HTMLDivElement>(null);
  const personaMenuRef = useRef<HTMLDivElement>(null);
  const mobileOptionsRef = useRef<HTMLDivElement>(null); // NEW: Ref for mobile menu

  // --- Close menus on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (modelMenuRef.current && !modelMenuRef.current.contains(event.target as Node)) {
        setShowModelMenu(false);
      }
      if (personaMenuRef.current && !personaMenuRef.current.contains(event.target as Node)) {
        setShowPersonaMenu(false);
      }
      if (mobileOptionsRef.current && !mobileOptionsRef.current.contains(event.target as Node)) {
        setShowMobileOptions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // --- Voice Input ---
  const handleVoiceInput = () => {
    if (!('webkitSpeechRecognition' in window)) {
      alert("Voice input is only supported in Chrome/Edge.");
      return;
    }
    
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    const recognition = new (window as any).webkitSpeechRecognition();
    recognitionRef.current = recognition;
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    
    recognition.onresult = (event: any) => {
      const text = event.results[0][0].transcript;
      setInput(text);
      // Auto-send on voice result
      handleSend(text);
    };

    recognition.start();
  };

  // --- File Processing ---
  const uploadToStorage = async (file: File): Promise<FileAttachment | null> => {
    if (file.size > MAX_UPLOAD_BYTES) {
      alert(`"${file.name}" is too large. Max size is ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)}MB.`);
      return null;
    }

    const { data } = await supabase.auth.getUser();
    const userId = data.user?.id;
    if (!userId) {
      alert("Please sign in before uploading files.");
      return null;
    }

    const path = buildStoragePath(userId, file);
    const { error } = await supabase.storage
      .from('uploads')
      .upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false });

    if (error) {
      console.error("Upload failed", error);
      alert(`Could not upload ${file.name}.`);
      return null;
    }

    return {
      name: file.name,
      mimeType: file.type || 'application/octet-stream',
      size: file.size,
      bucket: 'uploads',
      path
    };
  };

  const processFile = async (file: File) => {
    const mimeType = file.type || 'application/octet-stream';
    const lower = file.name.toLowerCase();
    const isPdf = mimeType === 'application/pdf' || lower.endsWith('.pdf');
    const isZip = ACCEPTED_UPLOAD_MIMES.has(mimeType) || lower.endsWith('.zip');

    if (isPdf || isZip) {
      const uploaded = await uploadToStorage(file);
      if (uploaded) {
        setAttachedFiles(prev => [...prev, uploaded]);
      }
      return;
    }

    const isText = mimeType.startsWith('text/') || INLINE_TEXT_EXT.test(lower);
    if (isText) {
      try {
        const text = await readFileAsText(file);
        setAttachedFiles(prev => [...prev, {
          name: file.name,
          mimeType,
          data: text,
          isTextContext: true
        }]);
      } catch (err) {
        console.error("Failed to read text file", err);
        alert(`Could not read ${file.name}`);
      }
      return;
    }

    try {
      const base64Raw = await readFileAsDataUrl(file);
      const base64Data = base64Raw.split(',')[1];
      setAttachedFiles(prev => [...prev, {
        name: file.name,
        data: base64Data,
        mimeType
      }]);
    } catch (err) {
      console.error("Failed to read file", err);
      alert(`Could not attach ${file.name}`);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    for (const file of Array.from(files)) {
      await processFile(file);
    }
    e.target.value = ''; // reset
  };

  // --- Snippet Handling ---
  const handleAddSnippet = () => {
    if (!snippetContent.trim()) {
      setShowSnippetModal(false);
      return;
    }
    
    const name = snippetName.trim() || `snippet-${attachedFiles.length + 1}.txt`;
    
    setAttachedFiles(prev => [...prev, {
      name: name,
      data: snippetContent, // Storing raw text for context
      mimeType: 'text/plain',
      isTextContext: true
    }]);

    // Reset
    setSnippetName('');
    setSnippetContent('');
    setShowSnippetModal(false);
  };

  // --- Global Drop/Paste Handling (within this component's lifecycle) ---
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (!e.clipboardData) return;
      const items = e.clipboardData.items;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          e.preventDefault();
          const blob = items[i].getAsFile();
          if (blob) processFile(blob);
        }
      }
    };
    
    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
         Array.from(e.dataTransfer.files).forEach(processFile);
      }
    };
    
    const handleDragOver = (e: DragEvent) => e.preventDefault();

    window.addEventListener('paste', handlePaste);
    window.addEventListener('drop', handleDrop);
    window.addEventListener('dragover', handleDragOver);
    
    return () => {
      window.removeEventListener('paste', handlePaste);
      window.removeEventListener('drop', handleDrop);
      window.removeEventListener('dragover', handleDragOver);
    };
  }, []);

  const handleSend = (overrideText?: string) => {
    const textToSend = typeof overrideText === 'string' ? overrideText : input;
    
    if (isTyping) {
        onStop();
        return;
    }

    if (!textToSend.trim() && attachedFiles.length === 0) return;

    onSendMessage(textToSend, attachedFiles, useSearch, responseLength, isListening, selectedModel, selectedPersonaId);
    
    // Clear state
    setInput('');
    setAttachedFiles([]);
    setIsListening(false);
  };

  const getModelName = () => AVAILABLE_MODELS.find(m => m.id === selectedModel)?.name || 'Model';
  const currentPersona = personas.find(p => p.id === selectedPersonaId) || personas[0];

  return (
    <>
      <div className="p-3 md:p-6 pb-4 md:pb-6 pt-3 flex-shrink-0 safe-area-bottom">
             <div className="max-w-6xl mx-auto bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl border border-white/50 dark:border-slate-600 rounded-2xl md:rounded-3xl shadow-xl relative transition-all focus-within:ring-2 focus-within:ring-indigo-400/50">
                
                {/* File Preview */}
                {attachedFiles.length > 0 && (
                  <div className="flex gap-2 p-3 pb-0 overflow-x-auto custom-scrollbar">
                     {attachedFiles.map((file, i) => (
                       <div key={i} className="relative group flex-shrink-0 max-w-[120px]">
                          <div className="h-14 w-full bg-gray-100 dark:bg-slate-700 rounded-lg flex items-center gap-2 px-2 border border-gray-200 dark:border-slate-600 overflow-hidden">
                             {file.mimeType.startsWith('image/') ? (
                               <img src={`data:${file.mimeType};base64,${file.data}`} alt="preview" className="h-10 w-10 object-cover rounded" />
                             ) : (
                               <span className="text-xl flex-shrink-0">
                                 {file.isTextContext ? '📝' : '📄'}
                               </span>
                             )}
                             <span className="text-[10px] truncate text-gray-600 dark:text-gray-300">{file.name}</span>
                          </div>
                          <button 
                            onClick={() => setAttachedFiles(prev => prev.filter((_, idx) => idx !== i))}
                            className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs shadow-md opacity-0 group-hover:opacity-100 transition-opacity z-10"
                          >
                            ✕
                          </button>
                       </div>
                     ))}
                  </div>
                )}

                <div className="flex items-end gap-1 md:gap-2 p-2 md:p-3 relative">
                   {/* Mobile Options Toggle */}
                   <div className="relative md:hidden" ref={mobileOptionsRef}>
                      <button
                        onClick={() => setShowMobileOptions(!showMobileOptions)}
                        className={`p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-400 hover:text-indigo-500 transition-colors rounded-xl hover:bg-gray-100 dark:hover:bg-slate-700 active:scale-95 ${showMobileOptions ? 'bg-indigo-50 text-indigo-500 dark:bg-slate-700' : ''}`}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 0 1 0 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.212 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 0 1 0-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281Z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                        </svg>
                      </button>

                      {/* Mobile Menu Popup */}
                      {showMobileOptions && (
                        <div className="absolute bottom-full left-0 mb-2 w-64 bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-slate-600 overflow-hidden animate-fade-in-up z-50 p-3 space-y-3">
                           
                           {/* 1. Model Selection */}
                           <div>
                             <div className="text-xs font-bold text-gray-400 uppercase mb-1">Model</div>
                             <div className="space-y-1">
                              {AVAILABLE_MODELS.map(model => (
                                <button
                                  key={model.id}
                                  onClick={() => { onModelChange(model.id); setShowMobileOptions(false); }}
                                  className={`w-full text-left px-2 py-1.5 rounded-lg text-xs transition-colors flex items-center justify-between ${selectedModel === model.id ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700'}`}
                                >
                                  <span>{model.name}</span>
                                  {selectedModel === model.id && <span>✓</span>}
                                </button>
                              ))}
                             </div>
                           </div>

                           {/* 2. Response Length */}
                           <div>
                             <div className="text-xs font-bold text-gray-400 uppercase mb-1">Length</div>
                             <div className="flex bg-gray-100 dark:bg-slate-700 rounded-lg p-1">
                               <button 
                                 onClick={() => setResponseLength('concise')}
                                 className={`flex-1 py-1.5 text-xs rounded-md font-medium transition-all ${responseLength === 'concise' ? 'bg-white dark:bg-slate-600 shadow text-indigo-600 dark:text-indigo-300' : 'text-gray-500 dark:text-gray-400'}`}
                               >
                                 Brief
                               </button>
                               <button 
                                 onClick={() => setResponseLength('detailed')}
                                 className={`flex-1 py-1.5 text-xs rounded-md font-medium transition-all ${responseLength === 'detailed' ? 'bg-white dark:bg-slate-600 shadow text-indigo-600 dark:text-indigo-300' : 'text-gray-500 dark:text-gray-400'}`}
                               >
                                 Detailed
                               </button>
                             </div>
                           </div>

                           {/* 3. Extra Tools */}
                           <div>
                             <div className="text-xs font-bold text-gray-400 uppercase mb-1">Tools</div>
                             <div className="flex flex-col gap-1">
                              <button 
                                onClick={() => { onToggleSearch(!useSearch); setShowMobileOptions(false); }}
                                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs transition-colors ${useSearch ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700'}`}
                              >
                                 <span className="text-lg">🌍</span>
                                 <span>Google Search {useSearch ? '(On)' : '(Off)'}</span>
                               </button>
                               <button 
                                 onClick={() => { setShowSnippetModal(true); setShowMobileOptions(false); }}
                                 className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
                               >
                                 <span className="text-lg">💻</span>
                                 <span>Add Code Snippet</span>
                               </button>
                             </div>
                           </div>
                        </div>
                      )}
                   </div>

                   {/* Attachment Button - Always visible */}
                   <button 
                     onClick={() => fileInputRef.current?.click()}
                   className="p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-400 hover:text-indigo-500 transition-colors rounded-xl hover:bg-gray-100 dark:hover:bg-slate-700 active:scale-95"
                   title="Attach file (Image, PDF, ZIP, text)"
                   >
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m18.375 12.739-7.693 7.693a4.5 4.5 0 0 1-6.364-6.364l10.94-10.94A3 3 0 1 1 19.5 7.372L8.552 18.32m.009-.01-.01.01m5.699-9.941-7.81 7.81a1.5 1.5 0 0 0 2.112 2.13" />
                      </svg>
                   </button>
                   <input 
                     type="file" 
                     multiple 
                     ref={fileInputRef} 
                    className="hidden" 
                    accept=".pdf,.zip,.txt,.md,.json,.csv,image/*"
                     onChange={handleFileUpload} 
                   />

                   {/* Code Snippet Button - Hidden on mobile */}
                   <button 
                     onClick={() => setShowSnippetModal(true)}
                     className="hidden md:block p-2 md:p-3 text-gray-400 hover:text-indigo-500 transition-colors rounded-full hover:bg-gray-100 dark:hover:bg-slate-700"
                     title="Add Code Snippet"
                   >
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5" />
                      </svg>
                   </button>

                   {/* Google Search Toggle - Hidden on mobile */}
                  <button 
                    onClick={() => onToggleSearch(!useSearch)}
                    className={`hidden md:block p-2 md:p-3 transition-colors rounded-full hover:bg-gray-100 dark:hover:bg-slate-700 ${useSearch ? 'text-blue-500' : 'text-gray-400 hover:text-blue-500'}`}
                    title="Toggle Google Search"
                  >
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418" />
                      </svg>
                   </button>

                   <textarea 
                     value={input}
                     onChange={(e) => setInput(e.target.value)}
                     onKeyDown={(e) => {
                       if (e.key === 'Enter' && !e.shiftKey) {
                         e.preventDefault();
                         handleSend();
                       }
                     }}
                     placeholder={isListening ? "Listening..." : `Message ${currentPersona.name}...`}
                     className="flex-1 bg-transparent border-none outline-none resize-none py-3 md:py-3 max-h-32 text-gray-700 dark:text-gray-200 placeholder-gray-400 text-base leading-relaxed"
                     rows={1}
                     style={{ fontSize: '16px' }}
                   />

                   {/* Voice Input - Hidden on mobile (use Live mode instead) */}
                   <button 
                     onClick={handleVoiceInput}
                     className={`hidden md:block p-2 md:p-3 rounded-full transition-all ${isListening ? 'bg-red-500 text-white animate-pulse' : 'text-gray-400 hover:text-red-500 hover:bg-gray-100 dark:hover:bg-slate-700'}`}
                     title="Voice Input"
                   >
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z" />
                      </svg>
                   </button>

                   {/* Send / Stop Button */}
                   <button 
                     onClick={() => handleSend()}
                     disabled={(!input.trim() && attachedFiles.length === 0 && !isTyping)}
                     className={`
                       p-3 min-w-[48px] min-h-[48px] flex items-center justify-center rounded-xl shadow-lg transition-all transform hover:scale-105 active:scale-90
                       ${(!input.trim() && attachedFiles.length === 0 && !isTyping)
                         ? 'bg-gray-200 dark:bg-slate-700 text-gray-400 cursor-not-allowed' 
                         : 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-indigo-500/30'}
                     `}
                     title={isTyping ? "Stop generating" : "Send message"}
                   >
                      {isTyping ? (
                        <div className="w-6 h-6 flex items-center justify-center">
                          <div className="w-3.5 h-3.5 bg-white rounded-sm shadow-sm"></div>
                        </div>
                      ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6 pl-0.5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0 1 21.485 12 59.77 59.77 0 0 1 3.27 20.876L5.999 12Zm0 0h7.5" />
                        </svg>
                      )}
                   </button>
                </div>
             </div>
             
             {/* Footer Controls - Simplified on mobile */}
             <div className="flex flex-col items-center gap-2 md:gap-2 mt-2 md:mt-3">
               <div className="flex flex-wrap justify-center items-center gap-2 md:gap-2">
                   
                   {/* Persona Selector - Touch-friendly on mobile */}
                   <div className="relative" ref={personaMenuRef}>
                     <button
                       onClick={() => setShowPersonaMenu(!showPersonaMenu)}
                       className={`flex items-center gap-2 bg-gray-100 dark:bg-slate-700/50 rounded-full px-3 py-2 min-h-[40px] border border-gray-200 dark:border-slate-600 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors active:scale-95`}
                     >
                       <span className="text-lg">{currentPersona.avatar}</span>
                       <span className="hidden md:inline max-w-xs truncate">{currentPersona.name}</span>
                       <span className="opacity-50 text-xs">▼</span>
                     </button>
                     
                     {showPersonaMenu && (
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-gray-200 dark:border-slate-600 overflow-hidden animate-fade-in-up z-50">
                          <div className="max-h-60 overflow-y-auto custom-scrollbar p-1">
                            {personas.map(p => {
                              const isDefault = ['default', 'coder'].includes(p.id);
                              return (
                                <div key={p.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700 group">
                                  <button
                                    onClick={() => { onPersonaChange(p.id); setShowPersonaMenu(false); }}
                                    className="flex items-center gap-2 flex-1 text-left"
                                  >
                                    <span className="text-lg">{p.avatar}</span>
                                    <span className={`text-sm font-medium ${selectedPersonaId === p.id ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-700 dark:text-gray-200'}`}>
                                      {p.name}
                                    </span>
                                  </button>
                                  
                                  {/* Edit Actions */}
                                  <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button onClick={(e) => { e.stopPropagation(); onEditPersona(p); setShowPersonaMenu(false); }} className="p-1.5 text-gray-400 hover:text-indigo-500 rounded hover:bg-white dark:hover:bg-slate-600">✎</button>
                                    {!isDefault && (
                                      <button onClick={(e) => { e.stopPropagation(); onDeletePersona(p.id); }} className="p-1.5 text-gray-400 hover:text-red-500 rounded hover:bg-white dark:hover:bg-slate-600">🗑️</button>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                          <div 
                            onClick={() => { onCreatePersona(); setShowPersonaMenu(false); }} 
                            className="flex items-center gap-2 p-2.5 bg-gray-50 dark:bg-slate-900/50 border-t border-gray-100 dark:border-slate-700 cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
                          >
                            <span className="bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 w-6 h-6 rounded flex items-center justify-center text-xs font-bold">+</span>
                            <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">Create New Persona</span>
                          </div>
                        </div>
                     )}
                   </div>

                   {/* Model Selector - Hidden on mobile */}
                   <div className="relative hidden md:block" ref={modelMenuRef}>
                      <button 
                        onClick={() => setShowModelMenu(!showModelMenu)}
                        className="flex items-center gap-1.5 bg-gray-100 dark:bg-slate-700/50 rounded-full px-3 py-1 border border-gray-200 dark:border-slate-600 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors"
                      >
                        <span className={selectedModel.includes('pro') ? 'text-indigo-500' : 'text-green-500'}>●</span>
                        {getModelName()}
                        <span className="opacity-50">▼</span>
                      </button>
                      
                      {showModelMenu && (
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-gray-200 dark:border-slate-600 overflow-hidden animate-fade-in-up z-50">
                          <div className="p-1">
                            {AVAILABLE_MODELS.map(model => (
                              <button
                                key={model.id}
                                onClick={() => { onModelChange(model.id); setShowModelMenu(false); }}
                                className={`w-full text-left p-2 rounded-lg text-xs transition-colors flex flex-col ${selectedModel === model.id ? 'bg-indigo-50 dark:bg-slate-700' : 'hover:bg-gray-50 dark:hover:bg-slate-700'}`}
                              >
                                <div className="flex items-center justify-between">
                                  <span className={`font-bold ${selectedModel === model.id ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-700 dark:text-gray-200'}`}>
                                    {model.name}
                                  </span>
                                  {selectedModel === model.id && <span className="text-indigo-500">✓</span>}
                                </div>
                                <span className="text-[10px] text-gray-400 mt-0.5">{model.description}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                   </div>

                   {/* Response Length - Hidden on mobile */}
                   <div className="hidden md:flex items-center bg-gray-100 dark:bg-slate-700/50 rounded-full p-1 border border-gray-200 dark:border-slate-600">
                      <button 
                        onClick={() => setResponseLength('concise')}
                        className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${responseLength === 'concise' ? 'bg-white dark:bg-slate-600 shadow-sm text-indigo-600 dark:text-indigo-300' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}
                      >
                        ⚡ Brief
                      </button>
                      <button 
                        onClick={() => setResponseLength('detailed')}
                        className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${responseLength === 'detailed' ? 'bg-white dark:bg-slate-600 shadow-sm text-indigo-600 dark:text-indigo-300' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}
                      >
                        📚 In-Depth
                      </button>
                   </div>
               </div>
             </div>
      </div>

      {/* Snippet Modal */}
      {showSnippetModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in" onClick={() => setShowSnippetModal(false)}>
          <div 
            className="w-full max-w-2xl bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-white/20 dark:border-slate-600 overflow-hidden flex flex-col h-[70vh] md:h-auto md:max-h-[80vh]" 
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-4 border-b border-gray-100 dark:border-slate-700 flex justify-between items-center bg-gray-50/50 dark:bg-slate-900/50">
               <div className="flex items-center gap-2">
                 <div className="p-1.5 bg-indigo-100 dark:bg-indigo-900/30 rounded text-indigo-600 dark:text-indigo-400">
                   <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                     <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5" />
                   </svg>
                 </div>
                 <h3 className="font-bold text-gray-800 dark:text-white">Add Code Snippet</h3>
               </div>
               <button onClick={() => setShowSnippetModal(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                 ✕
               </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 flex-1 flex flex-col gap-4 overflow-y-auto">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">Filename (Optional)</label>
                <input 
                  autoFocus
                  placeholder="e.g. App.tsx, script.py"
                  className="w-full px-4 py-2 rounded-xl bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-600 focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-gray-800 dark:text-white placeholder-gray-400"
                  value={snippetName}
                  onChange={e => setSnippetName(e.target.value)}
                />
              </div>
              <div className="flex-1 flex flex-col">
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">Code</label>
                <textarea
                  placeholder="Paste your code here..."
                  className="flex-1 w-full p-4 rounded-xl bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-600 focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-gray-800 dark:text-white placeholder-gray-400 font-mono text-sm resize-none min-h-[200px]"
                  value={snippetContent}
                  onChange={e => setSnippetContent(e.target.value)}
                />
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-gray-100 dark:border-slate-700 flex justify-end gap-3 bg-gray-50/50 dark:bg-slate-900/50">
               <button 
                 onClick={() => setShowSnippetModal(false)} 
                 className="px-5 py-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-xl font-medium transition-colors"
               >
                 Cancel
               </button>
               <button 
                 onClick={handleAddSnippet} 
                 disabled={!snippetContent.trim()}
                 className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-lg shadow-indigo-200 dark:shadow-none transition-transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
               >
                 Add Snippet
               </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
