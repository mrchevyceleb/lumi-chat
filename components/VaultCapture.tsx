import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { VaultFolderSelector } from './VaultFolderSelector';
import { dbService } from '../services/dbService';
import { v4 as uuidv4 } from 'uuid';

export const VaultCapture: React.FC = () => {
  const [selection, setSelection] = useState<{ text: string; rect: DOMRect } | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  useEffect(() => {
    const handleSelectionChange = () => {
      const sel = window.getSelection();
      
      // If modal is open, don't update selection to avoid flickering or losing context
      if (isModalOpen) return;

      if (!sel || sel.isCollapsed || !sel.toString().trim()) {
        setSelection(null);
        return;
      }

      // Check if selection is within the chat area (optional, but good for UX)
      // We can check if the anchorNode is within a .prose or .message-bubble class
      let node = sel.anchorNode;
      let isInsideChat = false;
      while (node && node !== document.body) {
        if (node instanceof Element && (node.classList.contains('prose') || node.getAttribute('data-message-content'))) {
          isInsideChat = true;
          break;
        }
        node = node.parentNode;
      }

      // Relaxing the check slightly to allow capturing from any text on screen if user wants, 
      // but ideally we want it for chat content. For now, let's allow it generally but maybe style it distinctively.
      
      const range = sel.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      
      // Only show if selection is visible and has width
      if (rect.width > 0 && rect.height > 0) {
        setSelection({
          text: sel.toString().trim(),
          rect: rect
        });
      } else {
        setSelection(null);
      }
    };

    // Debounce selection change
    let timeout: any;
    const onSelectionChange = () => {
        clearTimeout(timeout);
        timeout = setTimeout(handleSelectionChange, 200);
    };

    document.addEventListener('selectionchange', onSelectionChange);
    // Also listen to mouseup to capture the final state immediately
    document.addEventListener('mouseup', onSelectionChange);

    return () => {
      document.removeEventListener('selectionchange', onSelectionChange);
      document.removeEventListener('mouseup', onSelectionChange);
      clearTimeout(timeout);
    };
  }, [isModalOpen]);

  const handleZap = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsModalOpen(true);
  };

  const handleSaveToFolder = async (folderId: string) => {
    if (!selection) return;

    await dbService.saveVaultItem({
      id: uuidv4(),
      folderId: folderId,
      content: selection.text,
      sourceContext: 'Saved from chat',
      createdAt: Date.now(),
      isPinned: false
    });

    setIsModalOpen(false);
    setSelection(null);
    window.getSelection()?.removeAllRanges();
    
    // Show success toast
    setShowSuccess(true);
    setTimeout(() => setShowSuccess(false), 3000);
  };

  if (!selection && !isModalOpen && !showSuccess) return null;

  return (
    <>
      {/* Zap Button/Tooltip */}
      {selection && !isModalOpen && createPortal(
        <div 
          style={{ 
            top: (selection.rect.top < 60 ? selection.rect.bottom + 10 : selection.rect.top - 50) + window.scrollY,
            left: selection.rect.left + (selection.rect.width / 2) + window.scrollX,
            transform: 'translateX(-50%)'
          }}
          className="absolute z-50"
        >
          <button
            onMouseDown={handleZap} // Use onMouseDown to prevent clearing selection
            className="bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-lg shadow-xl px-3 py-2 flex items-center gap-2 text-xs font-bold animate-bounce-in hover:scale-105 transition-transform cursor-pointer border border-white/10 dark:border-slate-200"
          >
            <span className="text-amber-400 dark:text-amber-500 text-sm">⚡</span>
            <span>Zap to Vault</span>
          </button>
          
          {/* Little arrow pointing to text */}
          <div 
            className={`absolute left-1/2 -translate-x-1/2 w-3 h-3 bg-slate-900 dark:bg-white rotate-45 transform ${selection.rect.top < 60 ? '-top-1.5 border-t border-l border-white/10 dark:border-slate-200' : '-bottom-1.5 border-b border-r border-white/10 dark:border-slate-200'}`}
          />
        </div>,
        document.body
      )}

      {/* Folder Selector Modal */}
      <VaultFolderSelector 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        onSelect={handleSaveToFolder}
        snippet={selection?.text || ''}
      />

      {/* Success Toast */}
      {showSuccess && createPortal(
        <div className="fixed bottom-8 right-8 z-[70] bg-green-500 text-white px-6 py-3 rounded-xl shadow-2xl animate-fade-in-up flex items-center gap-3 font-medium">
          <span className="text-xl">⚡</span>
          Snippet zapped to vault!
        </div>,
        document.body
      )}
    </>
  );
};

