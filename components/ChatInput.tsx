
import React, { useState, useRef, useEffect } from 'react';
import JSZip from 'jszip';
import { AVAILABLE_MODELS, ModelId, Persona } from '../types';

interface ChatInputProps {
  onSendMessage: (text: string, files: any[], useSearch: boolean, responseLength: 'concise' | 'detailed', isVoiceActive: boolean, modelId: ModelId, personaId: string) => void;
  onStop: () => void;
  isTyping: boolean;
  personas: Persona[];
  selectedPersonaId: string;
  onPersonaChange: (personaId: string) => void;
  onCreatePersona: () => void;
  onEditPersona: (persona: Persona) => void;
  onDeletePersona: (personaId: string) => void;
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
  onDeletePersona
}) => {
  const [input, setInput] = useState('');
  const [attachedFiles, setAttachedFiles] = useState<{name: string, data: string, mimeType: string, isTextContext?: boolean}[]>([]);
  const [useSearch, setUseSearch] = useState(false);
  const [responseLength, setResponseLength] = useState<'concise' | 'detailed'>('detailed');
  const [isListening, setIsListening] = useState(false);
  // Default to the first available model to ensure validity
  const [selectedModel, setSelectedModel] = useState<ModelId>(AVAILABLE_MODELS[0].id);
  
  const [showModelMenu, setShowModelMenu] = useState(false);
  const [showPersonaMenu, setShowPersonaMenu] = useState(false);
  
  // Snippet Modal State
  const [showSnippetModal, setShowSnippetModal] = useState(false);
  const [snippetName, setSnippetName] = useState('');
  const [snippetContent, setSnippetContent] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);
  const modelMenuRef = useRef<HTMLDivElement>(null);
  const personaMenuRef = useRef<HTMLDivElement>(null);

  // --- Close menus on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (modelMenuRef.current && !modelMenuRef.current.contains(event.target as Node)) {
        setShowModelMenu(false);
      }
      if (personaMenuRef.current && !personaMenuRef.current.contains(event.target as Node)) {
        setShowPersonaMenu(false);
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
  const processFile = async (file: File) => {
    // 1. Handle Zip Files (Code Analysis)
    if (file.name.endsWith('.zip') || file.type === 'application/zip' || file.type === 'application/x-zip-compressed') {
      try {
        const zip = new JSZip();
        const loadedZip = await zip.loadAsync(file);
        let combinedSourceCode = `SOURCE CODE CONTEXT FROM ARCHIVE '${file.name}':\n\n`;
        let fileCount = 0;

        // Iterate through files
        const filePromises: Promise<void>[] = [];
        loadedZip.forEach((relativePath, zipEntry) => {
          const promise = (async () => {
            if (zipEntry.dir) return;
            // Filter for code/text files
            const isCode = /\.(js|ts|jsx|tsx|py|html|css|json|md|txt|java|c|cpp|h|rs|go|rb|php|sql)$/i.test(relativePath);
            
            if (isCode) {
              const content = await zipEntry.async("string");
              combinedSourceCode += `--- FILE: ${relativePath} ---\n${content}\n\n`;
              fileCount++;
            }
          })();
          filePromises.push(promise);
        });

        await Promise.all(filePromises);
        
        if (fileCount > 0) {
          setAttachedFiles(prev => [...prev, {
            name: `${file.name} (Extracted ${fileCount} files)`,
            data: combinedSourceCode,
            mimeType: 'text/plain',
            isTextContext: true
          }]);
        } else {
          alert("No readable code files found in zip.");
        }
      } catch (err) {
        console.error("Failed to unzip", err);
        alert("Could not analyze zip file. It might be corrupted.");
      }
      return;
    }

    // 2. Handle Regular Files (Images, etc)
    const reader = new FileReader();
    reader.onload = (readEvent) => {
      const base64Raw = readEvent.target?.result as string;
      const base64Data = base64Raw.split(',')[1];
      
      setAttachedFiles(prev => [...prev, {
        name: file.name,
        data: base64Data,
        mimeType: file.type || 'application/octet-stream'
      }]);
    };
    reader.readAsDataURL(file);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach(processFile);
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
      <div className="p-2 md:p-6 pb-4 md:pb-6 pt-2 flex-shrink-0">
             <div className="max-w-6xl mx-auto bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl border border-white/50 dark:border-slate-600 rounded-3xl shadow-xl relative transition-all focus-within:ring-2 focus-within:ring-indigo-400/50">
                
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

                <div className="flex items-end gap-1.5 md:gap-2 p-1.5 md:p-2">
                   {/* Attachment Button */}
                   <button 
                     onClick={() => fileInputRef.current?.click()}
                     className="p-2 md:p-3 text-gray-400 hover:text-indigo-500 transition-colors rounded-full hover:bg-gray-100 dark:hover:bg-slate-700"
                     title="Attach file (Image or Zip)"
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
                     onChange={handleFileUpload} 
                   />

                   {/* Code Snippet Button */}
                   <button 
                     onClick={() => setShowSnippetModal(true)}
                     className="p-2 md:p-3 text-gray-400 hover:text-indigo-500 transition-colors rounded-full hover:bg-gray-100 dark:hover:bg-slate-700"
                     title="Add Code Snippet"
                   >
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5" />
                      </svg>
                   </button>

                   {/* Google Search Toggle */}
                   <button 
                     onClick={() => setUseSearch(!useSearch)}
                     className={`p-2 md:p-3 transition-colors rounded-full hover:bg-gray-100 dark:hover:bg-slate-700 ${useSearch ? 'text-blue-500' : 'text-gray-400 hover:text-blue-500'}`}
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
                     className="flex-1 bg-transparent border-none outline-none resize-none py-3 max-h-32 text-gray-700 dark:text-gray-200 placeholder-gray-400"
                     rows={1}
                   />

                   {/* Voice Input */}
                   <button 
                     onClick={handleVoiceInput}
                     className={`p-2 md:p-3 rounded-full transition-all ${isListening ? 'bg-red-500 text-white animate-pulse' : 'text-gray-400 hover:text-red-500 hover:bg-gray-100 dark:hover:bg-slate-700'}`}
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
                       p-2 md:p-3 rounded-full shadow-lg transition-all transform hover:scale-105 active:scale-95
                       ${(!input.trim() && attachedFiles.length === 0 && !isTyping)
                         ? 'bg-gray-200 dark:bg-slate-700 text-gray-400 cursor-not-allowed' 
                         : 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white'}
                     `}
                     title={isTyping ? "Stop generating" : "Send message"}
                   >
                      {isTyping ? (
                        <div className="w-6 h-6 flex items-center justify-center">
                          <div className="w-3 h-3 bg-white rounded-sm shadow-sm"></div>
                        </div>
                      ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6 pl-0.5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0 1 21.485 12 59.77 59.77 0 0 1 3.27 20.876L5.999 12Zm0 0h7.5" />
                        </svg>
                      )}
                   </button>
                </div>
             </div>
             
             {/* Footer Controls */}
             <div className="flex flex-col items-center gap-2 mt-2 md:mt-3">
               <div className="flex flex-wrap justify-center items-center gap-2">
                   
                   {/* Persona Selector */}
                   <div className="relative" ref={personaMenuRef}>
                     <button
                       onClick={() => setShowPersonaMenu(!showPersonaMenu)}
                       className={`flex items-center gap-1.5 bg-gray-100 dark:bg-slate-700/50 rounded-full pl-2 pr-3 py-1 border border-gray-200 dark:border-slate-600 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors`}
                     >
                       <span className="text-sm">{currentPersona.avatar}</span>
                       <span className="max-w-[80px] md:max-w-xs truncate">{currentPersona.name}</span>
                       <span className="opacity-50">▼</span>
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

                   {/* Model Selector */}
                   <div className="relative" ref={modelMenuRef}>
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
                                onClick={() => { setSelectedModel(model.id); setShowModelMenu(false); }}
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

                   {/* Other Controls */}
                   <div className="flex items-center bg-gray-100 dark:bg-slate-700/50 rounded-full p-1 border border-gray-200 dark:border-slate-600">
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
