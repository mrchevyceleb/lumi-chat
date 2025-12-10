
import React, { useState, useEffect, useRef } from 'react';
import { ChatSession, Folder, Persona } from '../types';
import { ContextMenu } from './ContextMenu';

interface SidebarProps {
  chats: ChatSession[];
  folders: Folder[];
  personas: Persona[];
  activeChatId: string | null;
  onSelectChat: (id: string) => void;
  onNewChat: () => void;
  onCreateFolder: (name: string) => void;
  onMoveChat: (chatId: string, folderId: string | undefined) => void;
  onDeleteChat: (chatId: string) => void;
  onRenameChat: (chatId: string, newTitle: string) => void;
  onTogglePin: (chatId: string) => void;
  onOpenSettings: () => void;
  onRenameFolder: (folderId: string, newName: string) => void;
  onDeleteFolder: (folderId: string) => void;
  onNewChatInFolder: (folderId: string) => void;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  onOpenVault: () => void;
}

// Extracted ChatItem component to prevent re-mounting issues
const ChatItem: React.FC<{
  chat: ChatSession;
  persona?: Persona;
  activeChatId: string | null;
  editingChatId: string | null;
  editTitle: string;
  onSelectChat: (id: string) => void;
  onTogglePin: (id: string) => void;
  onDeleteChat: (id: string) => void;
  startRename: (chat: ChatSession) => void;
  setEditTitle: (title: string) => void;
  finishRename: () => void;
  onDragStart: (e: React.DragEvent, chatId: string) => void;
  onContextMenu: (e: React.MouseEvent, chat: ChatSession) => void;
}> = ({
  chat,
  persona,
  activeChatId,
  editingChatId,
  editTitle,
  onSelectChat,
  onTogglePin,
  onDeleteChat,
  startRename,
  setEditTitle,
  finishRename,
  onDragStart,
  onContextMenu
}) => {
  // Handler for delete to ensure it works
  const handleDelete = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (window.confirm('Are you sure you want to delete this chat?')) {
       onDeleteChat(chat.id);
    }
  };

  const handlePin = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onTogglePin(chat.id);
  };

  const handleRename = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    startRename(chat);
  };

  return (
    <div 
      className={`group relative flex items-center justify-between p-3 md:p-2.5 rounded-xl mb-1.5 md:mb-1 cursor-pointer transition-all duration-200 border min-h-[48px] md:min-h-0 active:scale-[0.98]
        ${activeChatId === chat.id 
          ? 'bg-white shadow-md text-indigo-600 border-indigo-50 dark:bg-white/10 dark:text-indigo-300 dark:border-white/10 dark:shadow-lg dark:shadow-indigo-900/20' 
          : 'border-transparent hover:bg-white/40 text-gray-600 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-gray-200'}
      `}
      onClick={() => onSelectChat(chat.id)}
      onContextMenu={(e) => onContextMenu(e, chat)}
      draggable
      onDragStart={(e) => {
        // Prevent drag if clicking on buttons
        if ((e.target as HTMLElement).closest('.no-drag')) {
            e.preventDefault();
            return;
        }
        onDragStart(e, chat.id);
      }}
      title={chat.title}
    >
      <div className="flex items-center gap-2.5 overflow-hidden flex-1 min-w-0 pointer-events-none">
        <span className="text-lg flex-shrink-0 opacity-80" title={persona?.name || 'Chat'}>
          {persona?.avatar ? persona.avatar : (chat.messages.length > 0 ? '💬' : '✨')}
        </span>
        {editingChatId === chat.id ? (
          <input 
            type="text" 
            value={editTitle} 
            onChange={(e) => setEditTitle(e.target.value)}
            onBlur={finishRename}
            onKeyDown={(e) => e.key === 'Enter' && finishRename()}
            className="bg-transparent border-b border-indigo-400 focus:outline-none w-full text-sm py-0 dark:text-white pointer-events-auto"
            autoFocus
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          />
        ) : (
          <span className="truncate text-sm font-medium w-full block">{chat.title}</span>
        )}
      </div>
      
      {/* Quick Actions - Added no-drag class and strict event stopping */}
      <div 
        className={`no-drag flex items-center gap-0.5 transition-opacity bg-white/60 dark:bg-slate-800/90 rounded-lg shadow-sm backdrop-blur-sm z-20 ml-2 flex-shrink-0
        ${activeChatId === chat.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}
        `}
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
         <button 
          type="button"
          title={chat.isPinned ? "Unpin" : "Pin"}
          onClick={handlePin}
          className={`p-1.5 hover:bg-indigo-100 dark:hover:bg-white/10 rounded text-gray-400 hover:text-indigo-600 ${chat.isPinned ? 'text-indigo-600 dark:text-indigo-400' : ''}`}
         >
           <svg xmlns="http://www.w3.org/2000/svg" fill={chat.isPinned ? "currentColor" : "none"} viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5 pointer-events-none">
             <path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0Z" />
           </svg>
         </button>
         <button 
          type="button"
          title="Rename"
          onClick={handleRename}
          className="p-1.5 hover:bg-indigo-100 dark:hover:bg-white/10 rounded text-gray-400 hover:text-indigo-600"
         >
           <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5 pointer-events-none">
             <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Zm0 0L19.5 7.125" />
           </svg>
         </button>
         <button 
           type="button"
           title="Delete"
           onClick={handleDelete}
           className="p-1.5 hover:bg-red-100 dark:hover:bg-red-900/40 rounded text-gray-400 hover:text-red-500"
         >
           <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5 pointer-events-none">
             <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
           </svg>
         </button>
      </div>
    </div>
  );
};

export const Sidebar: React.FC<SidebarProps> = ({
  chats, folders, personas, activeChatId, onSelectChat, onNewChat, onCreateFolder,
  onMoveChat, onDeleteChat, onRenameChat, onTogglePin, onOpenSettings,
  onRenameFolder, onDeleteFolder, onNewChatInFolder, isOpen, setIsOpen, onOpenVault
}) => {
  // State for creating/renaming folders and chats
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editFolderName, setEditFolderName] = useState("");
  
  const [editingChatId, setEditingChatId] = useState<string | null>(null);
  const [editChatTitle, setEditChatTitle] = useState("");

  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());

  // Search State
  const [searchQuery, setSearchQuery] = useState("");

  // Resizing State
  const [sidebarWidth, setSidebarWidth] = useState(288); // Default 288px (w-72)
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const [isDesktop, setIsDesktop] = useState(false);

  // Context Menu State
  const [contextMenu, setContextMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
    type: 'folder' | 'chat';
    item: Folder | ChatSession;
  } | null>(null);

  useEffect(() => {
    // Hydration fix / check window width
    setIsDesktop(window.innerWidth >= 768);
    const handleResize = () => setIsDesktop(window.innerWidth >= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Resizing Logic
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isResizing) {
        let newWidth = e.clientX;
        if (newWidth < 200) newWidth = 200; // Min width
        if (newWidth > 480) newWidth = 480; // Max width
        setSidebarWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      if (isResizing) {
        setIsResizing(false);
        document.body.style.cursor = 'default';
      }
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none'; // Prevent text selection while dragging
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing]);

  // Drag and Drop Handlers
  const handleDragStart = (e: React.DragEvent, chatId: string) => {
    e.dataTransfer.setData("chatId", chatId);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDropOnFolder = (e: React.DragEvent, folderId: string) => {
    e.preventDefault();
    const chatId = e.dataTransfer.getData("chatId");
    if (chatId) onMoveChat(chatId, folderId);
    // Expand folder on drop
    const newExpanded = new Set(expandedFolders);
    newExpanded.add(folderId);
    setExpandedFolders(newExpanded);
  };

  const handleDropOnRecent = (e: React.DragEvent) => {
    e.preventDefault();
    const chatId = e.dataTransfer.getData("chatId");
    if (chatId) onMoveChat(chatId, undefined);
  };

  // Context Menu Handlers
  const handleContextMenu = (e: React.MouseEvent, type: 'folder' | 'chat', item: Folder | ChatSession) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      type,
      item
    });
  };

  // Folder Actions
  const handleCreateFolder = () => {
    if (newFolderName.trim()) {
      onCreateFolder(newFolderName.trim());
      setNewFolderName("");
      setIsCreatingFolder(false);
    }
  };

  const toggleFolder = (folderId: string) => {
    const newExpanded = new Set(expandedFolders);
    if (newExpanded.has(folderId)) {
      newExpanded.delete(folderId);
    } else {
      newExpanded.add(folderId);
    }
    setExpandedFolders(newExpanded);
  };

  const startRenameChat = (chat: ChatSession) => {
    setEditingChatId(chat.id);
    setEditChatTitle(chat.title);
  };

  const finishRenameChat = () => {
    if (editingChatId && editChatTitle.trim()) {
      onRenameChat(editingChatId, editChatTitle.trim());
    }
    setEditingChatId(null);
  };

  const startRenameFolder = (folder: Folder) => {
    setEditingFolderId(folder.id);
    setEditFolderName(folder.name);
  };

  const finishRenameFolder = () => {
    if (editingFolderId && editFolderName.trim()) {
      onRenameFolder(editingFolderId, editFolderName.trim());
    }
    setEditingFolderId(null);
  };

  // Separate Chats
  const filteredChats = React.useMemo(() => {
    console.log('[Sidebar] Total chats received:', chats.length);
    if (!searchQuery.trim()) return chats;
    const query = searchQuery.toLowerCase();
    const filtered = chats.filter(c => 
      c.title.toLowerCase().includes(query) || 
      c.messages.some(m => m.content.toLowerCase().includes(query))
    );
    console.log('[Sidebar] After search filter:', filtered.length, 'query:', searchQuery);
    return filtered;
  }, [chats, searchQuery]);

  const pinnedChats = filteredChats.filter(c => c.isPinned);
  const recentChats = filteredChats.filter(c => !c.folderId && !c.isPinned);
  
  console.log('[Sidebar] Pinned:', pinnedChats.length, 'Recent:', recentChats.length, 'Total filtered:', filteredChats.length);

  const renderChatList = (chatList: ChatSession[]) => {
    if (chatList.length === 0) return <div className="text-xs text-gray-400 p-2 italic">No chats yet</div>;
    
    // Sort pinned first (redundant if lists are separate, but good for safety), then by date
    const sorted = [...chatList].sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      return b.lastUpdated - a.lastUpdated;
    });

    return sorted.map(chat => {
      const chatPersona = personas.find(p => p.id === chat.personaId);
      return (
        <ChatItem 
          key={chat.id}
          chat={chat}
          persona={chatPersona}
          activeChatId={activeChatId}
          editingChatId={editingChatId}
          editTitle={editChatTitle}
          onSelectChat={onSelectChat}
          onTogglePin={onTogglePin}
          onDeleteChat={onDeleteChat}
          startRename={startRenameChat}
          setEditTitle={setEditChatTitle}
          finishRename={finishRenameChat}
          onDragStart={handleDragStart}
          onContextMenu={(e, c) => handleContextMenu(e, 'chat', c)}
        />
      );
    });
  };

  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-30 md:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div 
        ref={sidebarRef}
        className={`
          fixed md:relative z-40 h-full flex flex-col group/sidebar
          bg-white/95 md:bg-white/80 dark:bg-[#020617]/80 backdrop-blur-xl border-r border-white/40 dark:border-white/5 shadow-2xl md:shadow-none
          w-[85vw] max-w-[320px]
          ${isResizing ? '' : 'transition-all duration-300'} 
          ${isOpen ? 'translate-x-0 opacity-100' : '-translate-x-full md:translate-x-0 md:!w-0 md:min-w-0 md:opacity-0 md:overflow-hidden md:p-0 md:border-0'}
        `}
        style={{ width: isOpen && isDesktop ? sidebarWidth : (isDesktop ? 0 : undefined) }}
      >
        
        {/* Resize Handle (Desktop Only) */}
        <div 
           className="hidden md:block absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-indigo-500/30 z-50 transition-colors"
           onMouseDown={() => setIsResizing(true)}
        />
        
        {/* Header */}
        <div className="p-5 pb-2 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-tr from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center text-white font-bold text-lg shadow-lg">
              ✨
            </div>
            <h1 className="font-bold text-xl tracking-tight bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
              Lumi
            </h1>
          </div>
          <div className="flex gap-1">
            <button 
              type="button"
              onClick={onOpenVault}
              className="p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-gray-100 dark:hover:bg-white/10 rounded-xl text-gray-500 dark:text-gray-400 transition-colors active:scale-95"
              title="Open Vault"
            >
              <span className="text-xl">⚡</span>
            </button>
            <button 
              type="button"
              onClick={onOpenSettings}
              className="p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-gray-100 dark:hover:bg-white/10 rounded-xl text-gray-500 dark:text-gray-400 transition-colors active:scale-95"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5 pointer-events-none">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 0 1 0 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 0 1 0-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
              </svg>
            </button>
            {/* Mobile Close Button */}
            <button 
              type="button"
              onClick={() => setIsOpen(false)}
              className="md:hidden p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-gray-100 dark:hover:bg-slate-800 rounded-xl text-gray-500 transition-colors active:scale-95"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                 <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* New Chat Button */}
        <div className="px-5 mb-4 flex-shrink-0 space-y-3">
          <div className="relative group">
            <input
              type="text"
              placeholder="Search chats..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-gray-100 dark:bg-white/5 border border-transparent focus:border-indigo-500 focus:bg-white dark:focus:bg-slate-800 rounded-xl px-4 py-3 pl-10 text-base outline-none transition-all dark:text-white"
              style={{ fontSize: '16px' }}
            />
            <svg 
              xmlns="http://www.w3.org/2000/svg" 
              className="h-4 w-4 absolute left-3.5 top-3 text-gray-400 group-focus-within:text-indigo-500 transition-colors" 
              fill="none" 
              viewBox="0 0 24 24" 
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </button>
            )}
          </div>

          <button 
            type="button"
            onClick={onNewChat}
            className="w-full py-3.5 min-h-[48px] bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-lg shadow-indigo-200 dark:shadow-none transition-all flex items-center justify-center gap-2 active:scale-[0.97] text-base"
          >
            <span className="text-xl">+</span> New Chat
          </button>
        </div>

        {/* Scrollable List */}
        <div className="flex-1 overflow-y-auto px-3 space-y-6 custom-scrollbar pb-6">
          
          {/* Pinned Section */}
          {pinnedChats.length > 0 && (
             <div>
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider px-2 mb-2">Pinned</h3>
                {renderChatList(pinnedChats)}
             </div>
          )}

          {/* Folders Section */}
          {/* Hide folders structure when searching to show a flat list of matches if desired, 
              OR keep structure but filter contents. 
              Here we keep structure but if search is active, we might want to show matches inside folders too.
              Current logic filters `chats` so `chats.filter(c => c.folderId === folder.id)` will naturally be filtered.
              However, if we want to show ALL matches regardless of folder structure when searching, we should conditionally render.
          */}
          {!searchQuery ? (
            <div>
              <div className="flex items-center justify-between px-2 mb-2">
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Projects</h3>
                <button 
                  type="button"
                  onClick={() => setIsCreatingFolder(true)}
                  className="text-gray-400 hover:text-indigo-600 transition-colors text-lg font-bold px-1"
                  title="New Folder"
                >
                  +
                </button>
              </div>

              {isCreatingFolder && (
                <div className="mb-2 px-1 animate-fade-in-up">
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

              <div className="space-y-1">
                {folders.map(folder => (
                  <div 
                    key={folder.id} 
                    className="rounded-xl overflow-hidden transition-all duration-300"
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDropOnFolder(e, folder.id)}
                  >
                    <div 
                      className={`
                        group flex items-center justify-between p-2 rounded-lg cursor-pointer
                        ${activeChatId && chats.find(c => c.id === activeChatId)?.folderId === folder.id 
                          ? 'bg-indigo-50 dark:bg-white/10 text-indigo-700 dark:text-indigo-300' 
                          : 'hover:bg-gray-100 dark:hover:bg-white/5 text-gray-700 dark:text-gray-300'}
                      `}
                      onClick={() => toggleFolder(folder.id)}
                      onContextMenu={(e) => handleContextMenu(e, 'folder', folder)}
                    >
                      <div className="flex items-center gap-2 flex-1 overflow-hidden pointer-events-none">
                        <span className={`transition-transform duration-200 text-[10px] ${expandedFolders.has(folder.id) ? 'rotate-90' : ''}`}>▶</span>
                        <span className="text-lg">📁</span>
                        
                        {editingFolderId === folder.id ? (
                          <input 
                            type="text" 
                            value={editFolderName} 
                            onChange={(e) => setEditFolderName(e.target.value)}
                            onBlur={finishRenameFolder}
                            onKeyDown={(e) => e.key === 'Enter' && finishRenameFolder()}
                            className="bg-transparent border-b border-indigo-400 focus:outline-none w-full text-sm py-0 dark:text-white pointer-events-auto"
                            autoFocus
                            onClick={(e) => e.stopPropagation()}
                          />
                        ) : (
                          <span className="truncate text-sm font-medium">{folder.name}</span>
                        )}
                      </div>

                      <div className="flex items-center gap-1">
                         <button
                           type="button"
                           title="New Chat in Folder"
                           onClick={(e) => {
                             e.stopPropagation();
                             const newExpanded = new Set(expandedFolders);
                             newExpanded.add(folder.id);
                             setExpandedFolders(newExpanded);
                             onNewChatInFolder(folder.id);
                           }}
                           className="p-1 hover:bg-indigo-200 dark:hover:bg-white/20 rounded text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-300"
                         >
                           <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5 pointer-events-none">
                             <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                           </svg>
                         </button>
                         <button
                           type="button"
                           title="Rename Folder" 
                           onClick={(e) => { e.stopPropagation(); startRenameFolder(folder); }}
                           className="p-1 hover:bg-indigo-200 dark:hover:bg-white/20 rounded text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-300"
                         >
                           <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5 pointer-events-none">
                              <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Zm0 0L19.5 7.125" />
                           </svg>
                         </button>
                         <button
                           type="button"
                           title="Delete Folder" 
                           onClick={(e) => { 
                             e.stopPropagation(); 
                             if(confirm("Delete folder? Chats inside will be moved to 'Recent'.")){
                                onDeleteFolder(folder.id);
                             }
                           }}
                           className="p-1 hover:bg-red-200 dark:hover:bg-red-900/40 rounded text-gray-400 hover:text-red-500"
                         >
                           <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5 pointer-events-none">
                             <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                           </svg>
                         </button>
                      </div>
                    </div>

                    {/* Folder Contents */}
                    {expandedFolders.has(folder.id) && (
                      <div className="pl-4 mt-1 space-y-0.5 border-l-2 border-indigo-100 dark:border-white/5 ml-4">
                         {renderChatList(filteredChats.filter(c => c.folderId === folder.id))}
                      </div>
                    )}
                  </div>
                ))}
                {folders.length === 0 && <div className="text-xs text-gray-400 p-2 italic">No projects created</div>}
              </div>
            </div>
          ) : (
             <div className="pb-2">
                {/* In search mode, show matches from folders as a simple list if they are not pinned */}
                {(() => {
                   const folderMatches = filteredChats.filter(c => c.folderId && !c.isPinned);
                   if (folderMatches.length === 0) return null;
                   return (
                     <div className="mb-4">
                        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider px-2 mb-2">Project Matches</h3>
                        {renderChatList(folderMatches)}
                     </div>
                   );
                })()}
             </div>
          )}

          {/* Recent Chats Section */}
          <div 
             onDragOver={handleDragOver}
             onDrop={handleDropOnRecent}
             className="min-h-[100px]"
          >
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider px-2 mb-2">Recent</h3>
            {renderChatList(recentChats)}
          </div>

        </div>

        {/* Footer User Info */}
        <div className="p-4 border-t border-gray-100 dark:border-white/5 bg-gray-50/50 dark:bg-slate-900/50">
           <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-gradient-to-r from-pink-500 to-rose-500 flex items-center justify-center text-white text-xs font-bold">
                PRO
              </div>
              <div className="flex-1 overflow-hidden">
                 <div className="text-xs font-bold text-gray-800 dark:text-white">Lumi Pro</div>
                 <div className="text-[10px] text-gray-500 dark:text-gray-400 truncate">Unlimited Generation</div>
              </div>
           </div>
        </div>

        {/* Context Menu */}
        {contextMenu && (
          <ContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            onClose={() => setContextMenu(null)}
            items={contextMenu.type === 'folder' ? [
              { 
                label: 'New Chat', 
                onClick: () => {
                  const folder = contextMenu.item as Folder;
                  const newExpanded = new Set(expandedFolders);
                  newExpanded.add(folder.id);
                  setExpandedFolders(newExpanded);
                  onNewChatInFolder(folder.id);
                }
              },
              { 
                label: 'Rename Folder', 
                onClick: () => startRenameFolder(contextMenu.item as Folder) 
              },
              { 
                label: 'Delete Folder', 
                onClick: () => {
                   if(confirm("Delete folder? Chats inside will be moved to 'Recent'.")){
                      onDeleteFolder(contextMenu.item.id);
                   }
                },
                danger: true
              }
            ] : [
              { 
                label: (contextMenu.item as ChatSession).isPinned ? 'Unpin Chat' : 'Pin Chat', 
                onClick: () => onTogglePin(contextMenu.item.id) 
              },
              { 
                label: 'Rename Chat', 
                onClick: () => startRenameChat(contextMenu.item as ChatSession) 
              },
              { 
                label: 'Delete Chat', 
                onClick: () => {
                   if (window.confirm('Are you sure you want to delete this chat?')) {
                      onDeleteChat(contextMenu.item.id);
                   }
                },
                danger: true
              }
            ]}
          />
        )}
      </div>
    </>
  );
};
