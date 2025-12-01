import React, { useState, useEffect } from 'react';
import { VaultItem } from '../types';
import { dbService } from '../services/dbService';

interface SnippetEditorModalProps {
  isOpen: boolean;
  snippet: VaultItem | null;
  onClose: () => void;
  onUpdate: (updatedSnippet: VaultItem) => void;
}

export const SnippetEditorModal: React.FC<SnippetEditorModalProps> = ({ 
  isOpen, 
  snippet, 
  onClose, 
  onUpdate 
}) => {
  const [content, setContent] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (snippet) {
      setContent(snippet.content);
      setIsEditing(false);
    }
  }, [snippet]);

  const handleSave = async () => {
    if (!snippet || !content.trim()) return;
    
    setIsSaving(true);
    try {
      await dbService.updateVaultItem(snippet.id, { content: content.trim() });
      onUpdate({ ...snippet, content: content.trim() });
      setIsEditing(false);
    } catch (error) {
      console.error('Failed to save snippet:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCopy = () => {
    if (content) {
      navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleAddText = (text: string) => {
    setContent(prev => prev + (prev ? '\n\n' : '') + text);
    setIsEditing(true);
  };

  if (!isOpen || !snippet) return null;

  return (
    <div 
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div 
        className="bg-white dark:bg-[#0f172a] w-full max-w-4xl max-h-[90vh] rounded-2xl shadow-2xl border border-white/20 dark:border-white/10 overflow-hidden flex flex-col animate-fade-in-up"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b border-gray-200 dark:border-white/5 flex items-center justify-between bg-white/50 dark:bg-[#0f172a]/50 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold text-slate-800 dark:text-white">
              {isEditing ? 'Editing Snippet' : 'View Snippet'}
            </h2>
            {snippet.isPinned && (
              <span className="text-amber-400" title="Pinned">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                  <path d="M10 2a.75.75 0 01.75.75v1.5h1.5a.75.75 0 010 1.5h-1.5v2.5h2.25a.75.75 0 010 1.5h-2.25v2.25a.75.75 0 01-1.5 0v-2.25H6.75a.75.75 0 010-1.5h2.25v-2.5H6.75a.75.75 0 010-1.5h2.25v-1.5A.75.75 0 0110 2z" />
                </svg>
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsEditing(!isEditing)}
              className="px-4 py-2 text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 rounded-lg transition-colors"
            >
              {isEditing ? 'Cancel' : 'Edit'}
            </button>
            <button
              onClick={handleCopy}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors flex items-center gap-2 ${
                copied 
                  ? 'bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-400' 
                  : 'text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-500/10'
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path d="M7 3.5a1.5 1.5 0 011.5-1.5h7A1.5 1.5 0 0117 3.5v2.25a.75.75 0 101.5 0V3.5A3 3 0 0015.5 .5h-7A3 3 0 005.5 3.5v2.25a.75.75 0 101.5 0V3.5z" />
                <path fillRule="evenodd" d="M4.25 6.75A2.75 2.75 0 001.5 9.5v6A2.75 2.75 0 004.25 18.25h7a2.75 2.75 0 002.75-2.75v-6A2.75 2.75 0 0011.25 6.75h-7zm0 1.5h7c.69 0 1.25.56 1.25 1.25v6c0 .69-.56 1.25-1.25 1.25h-7c-.69 0-1.25-.56-1.25-1.25v-6c0-.69.56-1.25 1.25-1.25z" clipRule="evenodd" />
              </svg>
              {copied ? 'Copied!' : 'Copy'}
            </button>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 dark:hover:bg-white/10 rounded-lg transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6 text-gray-500">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-6">
          {isEditing ? (
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="w-full h-full min-h-[400px] bg-gray-50 dark:bg-[#1e293b] border border-gray-200 dark:border-white/5 rounded-xl p-4 text-slate-700 dark:text-slate-300 font-mono text-sm leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400"
              placeholder="Enter your snippet content..."
              autoFocus
            />
          ) : (
            <div className="bg-gray-50 dark:bg-[#1e293b] border border-gray-200 dark:border-white/5 rounded-xl p-6 min-h-[400px]">
              <pre className="text-slate-700 dark:text-slate-300 whitespace-pre-wrap text-sm leading-relaxed font-mono">
                {content || '(empty snippet)'}
              </pre>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-200 dark:border-white/5 flex items-center justify-between bg-white/50 dark:bg-[#0f172a]/50 backdrop-blur-md">
          <div className="text-xs text-gray-500 dark:text-gray-400">
            Created {new Date(snippet.createdAt).toLocaleString()}
          </div>
          {isEditing && (
            <button
              onClick={handleSave}
              disabled={isSaving || !content.trim()}
              className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors flex items-center gap-2"
            >
              {isSaving ? (
                <>
                  <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Saving...
                </>
              ) : (
                'Save Changes'
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

