import React, { useState, useEffect } from 'react';
import { VaultFolder, VaultItem } from '../types';
import { dbService } from '../services/dbService';
import { SnippetEditorModal } from './SnippetEditorModal';

interface VaultModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const VaultModal: React.FC<VaultModalProps> = ({ isOpen, onClose }) => {
  const [folders, setFolders] = useState<VaultFolder[]>([]);
  const [items, setItems] = useState<VaultItem[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null); // null = All Items
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState('');
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [editingSnippet, setEditingSnippet] = useState<VaultItem | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      loadItems();
    }
  }, [selectedFolderId, isOpen]);

  const loadData = async () => {
    setIsLoading(true);
    const foldersData = await dbService.getVaultFolders();
    setFolders(foldersData);
    setIsLoading(false);
  };

  const loadItems = async () => {
    const itemsData = await dbService.getVaultItems(selectedFolderId || undefined);
    setItems(itemsData);
  };

  const handleDeleteItem = async (id: string) => {
    if (confirm('Are you sure you want to delete this snippet?')) {
      await dbService.deleteVaultItem(id);
      setItems(items.filter(i => i.id !== id));
    }
  };

  const handleCopyItem = (content: string) => {
    navigator.clipboard.writeText(content);
  };

  const handleTogglePin = async (id: string, currentPinned: boolean) => {
    await dbService.toggleVaultItemPin(id, !currentPinned);
    setItems(items.map(i => i.id === id ? { ...i, isPinned: !currentPinned } : i));
  };

  const handleCreateFolder = async () => {
    if (newFolderName.trim()) {
        await dbService.createVaultFolder(newFolderName.trim());
        setNewFolderName('');
        setIsCreatingFolder(false);
        loadData();
    }
  }

  const handleDragStart = (e: React.DragEvent, itemId: string) => {
      setIsDragging(true);
      e.dataTransfer.setData("vaultItemId", itemId);
  };

  const handleDragEnd = () => {
      // Use setTimeout to allow click event to be cancelled if it was a drag
      setTimeout(() => setIsDragging(false), 100);
  };

  const handleSnippetClick = (e: React.MouseEvent, item: VaultItem) => {
      // Don't open modal if clicking on action buttons
      if ((e.target as HTMLElement).closest('button')) {
          return;
      }
      // Don't open modal if we just dragged
      if (isDragging) {
          return;
      }
      setEditingSnippet(item);
  };

  const handleSnippetUpdate = (updatedSnippet: VaultItem) => {
      setItems(items.map(i => i.id === updatedSnippet.id ? updatedSnippet : i));
  };

  const handleDragOver = (e: React.DragEvent) => {
      e.preventDefault();
  };

  const handleDropOnFolder = async (e: React.DragEvent, folderId: string | null) => {
      e.preventDefault();
      const itemId = e.dataTransfer.getData("vaultItemId");
      if (itemId) {
          await dbService.moveVaultItem(itemId, folderId);
          // Update UI optimistically
          setItems(items.map(i => i.id === itemId ? { ...i, folderId: folderId } : i));
          // If we are filtering by a specific folder and moved it out, remove it from view
          if (selectedFolderId && selectedFolderId !== folderId) {
              setItems(prev => prev.filter(i => i.id !== itemId));
          }
      }
  };

  // Filter items by search
  const filteredItems = items.filter(i => 
    i.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (i.sourceContext && i.sourceContext.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const pinnedItems = filteredItems.filter(i => i.isPinned);
  const unpinnedItems = filteredItems.filter(i => !i.isPinned);

  const renderCard = (item: VaultItem) => (
      <div 
          key={item.id} 
          draggable
          onDragStart={(e) => handleDragStart(e, item.id)}
          onDragEnd={handleDragEnd}
          onClick={(e) => handleSnippetClick(e, item)}
          className="group bg-gray-50 dark:bg-[#1e293b] border border-gray-200 dark:border-white/5 rounded-xl p-4 hover:shadow-lg hover:border-indigo-500/30 transition-all flex flex-col h-48 cursor-pointer relative"
          title="Click to view/edit snippet"
      >
          <div className="flex-1 overflow-y-auto custom-scrollbar mb-2 pr-2">
              <p className="text-slate-700 dark:text-slate-300 whitespace-pre-wrap text-sm leading-relaxed font-mono">
                  {item.content}
              </p>
          </div>
          <div className="pt-2 border-t border-gray-200 dark:border-white/5 flex items-center justify-between text-xs text-gray-500">
              <span>{new Date(item.createdAt).toLocaleDateString()}</span>
              <div className="flex items-center gap-1 opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                  <button 
                      onClick={(e) => {
                          e.stopPropagation();
                          handleTogglePin(item.id, item.isPinned);
                      }}
                      className={`p-1.5 rounded-lg transition-colors ${item.isPinned ? 'text-amber-400 bg-amber-400/10' : 'hover:bg-gray-200 dark:hover:bg-white/10 text-gray-400'}`}
                      title={item.isPinned ? "Unpin" : "Pin"}
                  >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                          <path d="M10 2a.75.75 0 01.75.75v1.5h1.5a.75.75 0 010 1.5h-1.5v2.5h2.25a.75.75 0 010 1.5h-2.25v2.25a.75.75 0 01-1.5 0v-2.25H6.75a.75.75 0 010-1.5h2.25v-2.5H6.75a.75.75 0 010-1.5h2.25v-1.5A.75.75 0 0110 2z" />
                      </svg>
                  </button>
                  <button 
                      onClick={(e) => {
                          e.stopPropagation();
                          handleCopyItem(item.content);
                      }}
                      className="p-1.5 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 rounded-lg transition-colors"
                      title="Copy to clipboard"
                  >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                          <path d="M7 3.5a1.5 1.5 0 011.5-1.5h7A1.5 1.5 0 0117 3.5v2.25a.75.75 0 101.5 0V3.5A3 3 0 0015.5 .5h-7A3 3 0 005.5 3.5v2.25a.75.75 0 101.5 0V3.5z" />
                          <path fillRule="evenodd" d="M4.25 6.75A2.75 2.75 0 001.5 9.5v6A2.75 2.75 0 004.25 18.25h7a2.75 2.75 0 002.75-2.75v-6A2.75 2.75 0 0011.25 6.75h-7zm0 1.5h7c.69 0 1.25.56 1.25 1.25v6c0 .69-.56 1.25-1.25 1.25h-7c-.69 0-1.25-.56-1.25-1.25v-6c0-.69.56-1.25 1.25-1.25z" clipRule="evenodd" />
                      </svg>
                  </button>
                  <button 
                      onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteItem(item.id);
                      }}
                      className="p-1.5 hover:bg-red-100 dark:hover:bg-red-500/20 text-red-500 rounded-lg transition-colors"
                      title="Delete"
                  >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                          <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" />
                      </svg>
                  </button>
              </div>
          </div>
          {/* Pin Indicator for card view */}
          {item.isPinned && (
              <div className="absolute top-2 right-2 text-amber-400">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                       <path d="M10 2a.75.75 0 01.75.75v1.5h1.5a.75.75 0 010 1.5h-1.5v2.5h2.25a.75.75 0 010 1.5h-2.25v2.25a.75.75 0 01-1.5 0v-2.25H6.75a.75.75 0 010-1.5h2.25v-2.5H6.75a.75.75 0 010-1.5h2.25v-1.5A.75.75 0 0110 2z" />
                  </svg>
              </div>
          )}
      </div>
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 md:p-8" onClick={onClose}>
      <div 
        className="bg-white dark:bg-[#0f172a] w-full max-w-6xl h-[85vh] rounded-2xl shadow-2xl border border-white/20 dark:border-white/10 overflow-hidden flex flex-col md:flex-row animate-fade-in-up"
        onClick={e => e.stopPropagation()}
      >
        {/* Sidebar */}
        <div className="w-full md:w-64 bg-gray-50 dark:bg-[#1e293b]/50 border-b md:border-b-0 md:border-r border-gray-200 dark:border-white/5 flex flex-col">
          <div className="p-4 border-b border-gray-200 dark:border-white/5 flex items-center justify-between">
            <h2 className="font-bold text-lg text-slate-800 dark:text-white flex items-center gap-2">
              <span>📂</span> Vault
            </h2>
            <button 
                onClick={() => setIsCreatingFolder(true)} 
                className="p-1 hover:bg-gray-200 dark:hover:bg-white/10 rounded-md transition-colors" 
                title="New Folder"
            >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-gray-500">
                  <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
                </svg>
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {isCreatingFolder && (
                <div className="mb-2 px-3 animate-fade-in-up">
                    <input
                        autoFocus
                        type="text"
                        placeholder="Folder Name"
                        className="w-full bg-white dark:bg-slate-800 border border-indigo-400 rounded-lg px-2 py-1.5 text-sm outline-none dark:text-white"
                        value={newFolderName}
                        onChange={(e) => setNewFolderName(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') handleCreateFolder();
                            if (e.key === 'Escape') setIsCreatingFolder(false);
                        }}
                        onBlur={() => {
                            if (!newFolderName.trim()) setIsCreatingFolder(false);
                        }}
                    />
                </div>
            )}

            <button 
              onClick={() => setSelectedFolderId(null)}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDropOnFolder(e, null)}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${selectedFolderId === null ? 'bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300' : 'text-slate-600 dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-white/5'}`}
            >
              <span className="text-lg">⚡</span> All Snippets
            </button>
            
            <div className="pt-2 pb-1 px-3 text-xs font-bold text-gray-400 uppercase tracking-wider">Folders</div>
            
            {folders.map(folder => (
              <div key={folder.id} className="group relative">
                  <button 
                    onClick={() => setSelectedFolderId(folder.id)}
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDropOnFolder(e, folder.id)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${selectedFolderId === folder.id ? 'bg-white dark:bg-white/10 shadow-sm text-slate-800 dark:text-white' : 'text-slate-600 dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-white/5'}`}
                  >
                    <span className="text-amber-400">📁</span>
                    <span className="truncate flex-1">{folder.name}</span>
                  </button>
              </div>
            ))}
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col h-full min-w-0 bg-white dark:bg-[#0f172a]">
          {/* Search Header */}
          <div className="p-4 border-b border-gray-200 dark:border-white/5 flex items-center gap-4 bg-white/50 dark:bg-[#0f172a]/50 backdrop-blur-md">
             <div className="relative flex-1 max-w-xl">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                  <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 1.879l-12.035 12.035a1 1 0 01-1.414-1.414l12.035-12.035A7.002 7.002 0 012 9z" clipRule="evenodd" />
                </svg>
                <input 
                  type="text" 
                  placeholder="Search snippets..." 
                  className="w-full bg-gray-100 dark:bg-slate-800 border-none rounded-xl pl-10 pr-4 py-2 outline-none focus:ring-2 focus:ring-indigo-500 dark:text-white transition-all"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                />
             </div>
             <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-white/10 rounded-full transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6 text-gray-500">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
             </button>
          </div>

          {/* Snippets Grid */}
          <div className="flex-1 overflow-y-auto p-4 md:p-6">
            {filteredItems.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-gray-400 opacity-60">
                    <div className="text-6xl mb-4">🕸️</div>
                    <p className="text-lg font-medium">No snippets found</p>
                    <p className="text-sm">Try selecting a different folder or zapping some text!</p>
                </div>
            ) : (
                <div className="space-y-8">
                    {/* Pinned Section */}
                    {pinnedItems.length > 0 && (
                        <div>
                            <h3 className="text-xs font-bold text-amber-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                    <path d="M10 2a.75.75 0 01.75.75v1.5h1.5a.75.75 0 010 1.5h-1.5v2.5h2.25a.75.75 0 010 1.5h-2.25v2.25a.75.75 0 01-1.5 0v-2.25H6.75a.75.75 0 010-1.5h2.25v-2.5H6.75a.75.75 0 010-1.5h2.25v-1.5A.75.75 0 0110 2z" />
                                </svg>
                                Pinned
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {pinnedItems.map(renderCard)}
                            </div>
                        </div>
                    )}

                    {/* Unpinned Section */}
                    <div>
                        {pinnedItems.length > 0 && <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Everything Else</h3>}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {unpinnedItems.map(renderCard)}
                        </div>
                    </div>
                </div>
            )}
          </div>
        </div>
      </div>

      {/* Snippet Editor Modal */}
      <SnippetEditorModal
        isOpen={editingSnippet !== null}
        snippet={editingSnippet}
        onClose={() => setEditingSnippet(null)}
        onUpdate={handleSnippetUpdate}
      />
    </div>
  );
};
