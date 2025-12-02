

import React, { useState, useRef } from 'react';
import { UsageStats } from '../services/dbService';
import { AVAILABLE_MODELS, ModelId } from '../types';
import { previewVoice } from '../services/geminiService';
import { AudioUtils } from '../services/audioUtils';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSignOut: () => void;
  darkMode: boolean;
  toggleDarkMode: () => void;
  userEmail?: string;
  voiceName: string;
  setVoiceName: (name: string) => void;
  usageStats?: UsageStats;
  onUpdateApiKey?: () => void;
  defaultModel: ModelId;
  setDefaultModel: (modelId: ModelId) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ 
  isOpen, 
  onClose, 
  onSignOut, 
  darkMode, 
  toggleDarkMode,
  userEmail,
  voiceName,
  setVoiceName,
  usageStats = { inputTokens: 0, outputTokens: 0, modelBreakdown: {} },
  onUpdateApiKey,
  defaultModel,
  setDefaultModel
}) => {
  const [activeTab, setActiveTab] = useState<'general' | 'dashboard'>('general');
  const [playingVoice, setPlayingVoice] = useState<string | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);

  // Cleanup audio when modal closes
  React.useEffect(() => {
    if (!isOpen) {
      if (currentSourceRef.current) {
        try { currentSourceRef.current.stop(); } catch (e) {}
        currentSourceRef.current = null;
        setPlayingVoice(null);
      }
    }
  }, [isOpen]);

  const handlePreview = async (name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    
    // Stop current if playing
    if (currentSourceRef.current) {
      try {
        currentSourceRef.current.stop();
      } catch (e) {}
      currentSourceRef.current = null;
      setPlayingVoice(null);
      
      // If clicking the same voice, just stop (toggle behavior)
      if (playingVoice === name) return;
    }

    try {
      setPlayingVoice(name);
      
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioContextRef.current;
      if (ctx.state === 'suspended') await ctx.resume();

      const base64Audio = await previewVoice(name);
      
      if (!base64Audio) {
          setPlayingVoice(null);
          return;
      }

      const audioData = AudioUtils.decode(base64Audio);
      const audioBuffer = await AudioUtils.decodeAudioData(audioData, ctx, 24000);

      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);
      
      source.onended = () => {
        setPlayingVoice(null);
        currentSourceRef.current = null;
      };
      
      currentSourceRef.current = source;
      source.start();

    } catch (err) {
      console.error("Preview failed", err);
      setPlayingVoice(null);
      currentSourceRef.current = null;
    }
  };

  if (!isOpen) return null;

  // Calculate Costs
  let totalCost = 0;
  
  // Use breakdown if available, otherwise fallback to generic calculation for legacy totals
  const breakdownEntries = Object.entries(usageStats.modelBreakdown || {}) as [string, { input: number; output: number }][];
  
  if (breakdownEntries.length > 0) {
      breakdownEntries.forEach(([modelId, stats]) => {
          const modelConfig = AVAILABLE_MODELS.find(m => m.id === modelId);
          if (modelConfig) {
              totalCost += (stats.input / 1000000) * modelConfig.costInput;
              totalCost += (stats.output / 1000000) * modelConfig.costOutput;
          } else {
             // Fallback for unknown models (e.g. old data)
             totalCost += (stats.input / 1000000) * 0.075;
             totalCost += (stats.output / 1000000) * 0.30;
          }
      });
  } else {
      // Legacy calculation
      totalCost = (usageStats.inputTokens / 1000000) * 0.075 + (usageStats.outputTokens / 1000000) * 0.30;
  }

  const totalTokens = usageStats.inputTokens + usageStats.outputTokens;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4 animate-fade-in" onClick={onClose}>
      <div 
        className="w-full max-w-md bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-white/50 dark:border-slate-700 overflow-hidden flex flex-col max-h-[80vh]" 
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 dark:border-slate-700 flex justify-between items-center bg-gray-50/50 dark:bg-slate-800/50">
          <h2 className="font-bold text-lg text-gray-800 dark:text-white">Settings</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            ✕
          </button>
        </div>

        {/* Tab Bar */}
        <div className="flex border-b border-gray-100 dark:border-slate-700">
           <button 
             onClick={() => setActiveTab('general')}
             className={`flex-1 py-3 text-sm font-bold text-center transition-colors ${activeTab === 'general' ? 'text-indigo-600 border-b-2 border-indigo-600 dark:text-indigo-400' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'}`}
           >
             General
           </button>
           <button 
             onClick={() => setActiveTab('dashboard')}
             className={`flex-1 py-3 text-sm font-bold text-center transition-colors ${activeTab === 'dashboard' ? 'text-indigo-600 border-b-2 border-indigo-600 dark:text-indigo-400' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'}`}
           >
             Usage Dashboard
           </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 overflow-y-auto custom-scrollbar">
          
          {activeTab === 'general' ? (
            <>
              {/* Account Section */}
              <div>
                 <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Account</h3>
                 <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center text-white font-bold">
                      {userEmail ? userEmail[0].toUpperCase() : 'U'}
                    </div>
                    <div className="flex-1 overflow-hidden">
                      <div className="text-sm font-medium text-gray-900 dark:text-white truncate">{userEmail}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">Pro Plan</div>
                    </div>
                 </div>
                 
                 {onUpdateApiKey && (
                    <button 
                       onClick={onUpdateApiKey}
                       className="w-full py-2 bg-indigo-50 dark:bg-indigo-900/20 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 rounded-xl text-xs font-bold transition-colors border border-indigo-200 dark:border-indigo-800"
                    >
                       Update Gemini API Key
                    </button>
                 )}
              </div>

              {/* Preferences */}
              <div>
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Preferences</h3>
                
                {/* Dark Mode */}
                <div className="flex items-center justify-between p-3 rounded-xl bg-gray-50 dark:bg-slate-700/50 border border-gray-100 dark:border-slate-700 mb-3">
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{darkMode ? '🌙' : '☀️'}</span>
                    <div>
                      <div className="text-sm font-medium text-gray-800 dark:text-gray-200">Dark Mode</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">{darkMode ? 'On' : 'Off'}</div>
                    </div>
                  </div>
                  <button 
                    onClick={toggleDarkMode}
                    className={`w-12 h-6 rounded-full p-1 transition-colors duration-200 ease-in-out ${darkMode ? 'bg-indigo-600' : 'bg-gray-300'}`}
                  >
                    <div className={`w-4 h-4 bg-white rounded-full shadow-sm transform transition-transform duration-200 ${darkMode ? 'translate-x-6' : 'translate-x-0'}`} />
                  </button>
                </div>

                {/* Default Model Settings */}
                <div>
                  <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Default Model</h3>
                  <select
                    value={defaultModel}
                    onChange={(e) => setDefaultModel(e.target.value as ModelId)}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-xl text-sm text-gray-800 dark:text-gray-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                  >
                    {AVAILABLE_MODELS.map(model => (
                      <option key={model.id} value={model.id}>
                        {model.name} - {model.description}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Voice Settings */}
                <div>
                   <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Live Voice</h3>
                   <div className="grid grid-cols-2 gap-2">
                  {[
                    { name: 'Kore', label: 'Kore (Female)', gender: 'Female' },
                    { name: 'Aoede', label: 'Aoede (Female)', gender: 'Female' },
                    { name: 'Puck', label: 'Puck (Male)', gender: 'Male' },
                    { name: 'Fenrir', label: 'Fenrir (Male)', gender: 'Male' },
                    { name: 'Charon', label: 'Charon (Male)', gender: 'Male' },
                  ].map((v) => (
                    <button
                      key={v.name}
                      onClick={() => setVoiceName(v.name)}
                      className={`p-2 rounded-lg text-xs font-medium border transition-all text-left flex items-center justify-between group
                        ${voiceName === v.name 
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm' 
                          : 'bg-white dark:bg-slate-700 border-gray-200 dark:border-slate-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-600'
                        }
                      `}
                    >
                      <div className="flex flex-col">
                        <span>{v.name}</span>
                        <span className={`text-[10px] opacity-70 ${voiceName === v.name ? 'text-indigo-100' : 'text-gray-400'}`}>
                           {v.gender}
                        </span>
                      </div>
                      <div 
                        onClick={(e) => handlePreview(v.name, e)}
                        className={`p-1.5 rounded-full transition-colors ${
                          playingVoice === v.name 
                            ? 'bg-indigo-400 text-white animate-pulse' 
                            : voiceName === v.name 
                              ? 'hover:bg-indigo-500 text-indigo-100' 
                              : 'hover:bg-gray-200 dark:hover:bg-slate-500 text-gray-400'
                        }`}
                        title="Preview Voice"
                      >
                        {playingVoice === v.name ? (
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                            <path fillRule="evenodd" d="M4.5 7.5a3 3 0 013-3h9a3 3 0 013 3v9a3 3 0 01-3 3h-9a3 3 0 01-3-3v-9z" clipRule="evenodd" />
                          </svg>
                        ) : (
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                            <path fillRule="evenodd" d="M4.5 5.653c0-1.426 1.529-2.33 2.779-1.643l11.54 6.348c1.295.712 1.295 2.573 0 3.285L7.28 19.991c-1.25.687-2.779-.217-2.779-1.643V5.653z" clipRule="evenodd" />
                          </svg>
                        )}
                      </div>
                    </button>
                  ))}
                   </div>
                </div>
              </div>

              <hr className="border-gray-100 dark:border-slate-700" />

              {/* Sign Out */}
              <button 
                onClick={onSignOut}
                className="w-full py-3 text-sm font-bold text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15M12 9l-3 3m0 0 3 3m-3-3h12.75" />
                </svg>
                Sign Out
              </button>
            </>
          ) : (
            <div className="space-y-6">
               <div className="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl p-6 text-white shadow-lg">
                  <div className="text-indigo-100 text-xs font-bold uppercase tracking-wider mb-1">Total Estimated Cost</div>
                  <div className="text-4xl font-bold">${totalCost.toFixed(5)}</div>
                  <div className="mt-4 flex gap-4 text-sm">
                     <div className="flex flex-col">
                        <span className="opacity-70 text-xs">Total Tokens</span>
                        <span className="font-semibold">{totalTokens.toLocaleString()}</span>
                     </div>
                  </div>
               </div>

               {/* Token Breakdown by Model */}
               {breakdownEntries.length > 0 && (
                 <div>
                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Model Breakdown</h3>
                    <div className="space-y-3">
                       {breakdownEntries.map(([modelId, stats]) => {
                         const modelName = AVAILABLE_MODELS.find(m => m.id === modelId)?.name || modelId;
                         const modelCostConfig = AVAILABLE_MODELS.find(m => m.id === modelId);
                         const mCost = modelCostConfig 
                            ? (stats.input / 1000000) * modelCostConfig.costInput + (stats.output / 1000000) * modelCostConfig.costOutput
                            : 0;

                         return (
                           <div key={modelId} className="bg-gray-50 dark:bg-slate-700/30 rounded-lg p-3 border border-gray-100 dark:border-slate-700">
                              <div className="flex justify-between items-center mb-2">
                                 <span className="font-semibold text-sm text-gray-800 dark:text-gray-200">{modelName}</span>
                                 <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">${mCost.toFixed(5)}</span>
                              </div>
                              <div className="flex gap-4 text-xs text-gray-500 dark:text-gray-400">
                                 <span>In: {stats.input.toLocaleString()}</span>
                                 <span>Out: {stats.output.toLocaleString()}</span>
                              </div>
                           </div>
                         );
                       })}
                    </div>
                 </div>
               )}

               <p className="text-[10px] text-gray-400 text-center">
                  * Costs are estimated based on Gemini pricing. <br/>
                  Flash: $0.075/1M In, $0.30/1M Out. <br/>
                  Pro models estimated at higher rates.
               </p>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};
