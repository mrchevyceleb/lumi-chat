import React, { useState, useEffect } from 'react';
import { VaultFolder } from '../types';
import { dbService } from '../services/dbService';
import { v4 as uuidv4 } from 'uuid';

interface VaultFolderSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (folderId: string) => void;
  snippet: string;
}

export const VaultFolderSelector: React.FC<VaultFolderSelectorProps> = ({ isOpen, onClose, onSelect, snippet }) => {
  const [folders, setFolders] = useState<VaultFolder[]>([]);
  const [newFolderName, setNewFolderName] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (isOpen) {
      loadFolders();
    }
  }, [isOpen]);

  const loadFolders = async () => {
    setIsLoading(true);
    const data = await dbService.getVaultFolders();
    setFolders(data);
    setIsLoading(false);
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    const newFolder = await dbService.createVaultFolder(newFolderName.trim());
    if (newFolder) {
      setFolders([...folders, newFolder]);
      setNewFolderName('');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div 
        className="bg-white dark:bg-[#1e293b] w-full max-w-md rounded-2xl shadow-2xl border border-white/20 dark:border-white/10 overflow-hidden animate-fade-in-up"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-6 border-b border-gray-100 dark:border-white/5">
          <h2 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <span className="text-2xl">⚡</span> Zap to Vault
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Where should we store this snippet?
          </p>
        </div>

        <div className="p-6 space-y-4">
          <div className="bg-indigo-50 dark:bg-indigo-900/20 p-3 rounded-lg border border-indigo-100 dark:border-indigo-500/20">
             <p className="text-sm text-slate-600 dark:text-slate-300 italic line-clamp-3">
               "{snippet}"
             </p>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-500 uppercase">Select Folder</label>
            <div className="max-h-40 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
              {isLoading ? (
                <div className="text-center py-4 text-gray-400 text-sm">Loading folders...</div>
              ) : folders.length === 0 ? (
                <div className="text-center py-4 text-gray-400 text-sm">No folders yet</div>
              ) : (
                folders.map(folder => (
                  <button
                    key={folder.id}
                    onClick={() => onSelect(folder.id)}
                    className="w-full text-left px-4 py-3 rounded-xl hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors flex items-center gap-3 group"
                  >
                    <span className="text-amber-400">📁</span>
                    <span className="text-slate-700 dark:text-slate-200 font-medium flex-1 truncate">{folder.name}</span>
                    <span className="opacity-0 group-hover:opacity-100 text-indigo-500 text-sm font-bold">Select →</span>
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="pt-4 border-t border-gray-100 dark:border-white/5">
             <label className="text-xs font-bold text-gray-500 uppercase mb-2 block">Or Create New</label>
             <div className="flex gap-2">
               <input 
                 className="flex-1 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl px-4 py-2 outline-none focus:ring-2 focus:ring-indigo-500 dark:text-white text-sm"
                 placeholder="New folder name..."
                 value={newFolderName}
                 onChange={e => setNewFolderName(e.target.value)}
                 onKeyDown={e => e.key === 'Enter' && handleCreateFolder()}
               />
               <button 
                 onClick={handleCreateFolder}
                 disabled={!newFolderName.trim()}
                 className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors"
               >
                 Create
               </button>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
};

