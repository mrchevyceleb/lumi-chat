
import React, { useState } from 'react';
import { Message, AVAILABLE_MODELS } from '../types';
import ReactMarkdown from 'react-markdown';

interface MessageBubbleProps {
  message: Message;
  isLast: boolean;
  isTyping: boolean;
}

export const MessageBubble: React.FC<MessageBubbleProps> = React.memo(({ message, isLast, isTyping }) => {
  const isUser = message.role === 'user';
  const [copied, setCopied] = useState<string | null>(null);

  const handleCopy = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopied(code);
    setTimeout(() => setCopied(null), 2000);
  };

  // Get readable model name
  const modelName = message.role === 'model' && message.model 
      ? AVAILABLE_MODELS.find(m => m.id === message.model)?.name || message.model 
      : null;

  // Custom renderer for Code Blocks
  const components = {
    code({ node, inline, className, children, ...props }: any) {
      const match = /language-(\w+)/.exec(className || '');
      const codeText = String(children).replace(/\n$/, '');
      
      if (!inline && match) {
        return (
          <div className="relative my-4 rounded-lg overflow-hidden border border-white/20 shadow-lg group max-w-full">
            <div className="flex justify-between items-center bg-[#2d2d2d] px-3 py-1.5 text-xs text-gray-300">
              <span className="font-mono">{match[1]}</span>
              <button
                onClick={() => handleCopy(codeText)}
                className="opacity-60 group-hover:opacity-100 transition-opacity hover:text-white"
              >
                {copied === codeText ? 'Copied!' : 'Copy Code'}
              </button>
            </div>
            <div className="bg-[#1e1e1e] p-3 overflow-x-auto text-sm">
              <code className={className} {...props}>
                {children}
              </code>
            </div>
          </div>
        );
      }
      return (
        <code className="bg-black/5 dark:bg-white/10 px-1 py-0.5 rounded text-sm font-mono text-red-600 dark:text-pink-300 border border-black/5 dark:border-white/5 break-all" {...props}>
          {children}
        </code>
      );
    }
  };

  return (
    <div 
      className={`flex w-full mb-6 ${isUser ? 'justify-end' : 'justify-start'}`}
      data-role={message.role}
      data-message-id={message.id}
    >
      <div className={`flex flex-col max-w-[95%] md:max-w-[85%] lg:max-w-[90%] ${isUser ? 'items-end' : 'items-start'}`}>
        
        {/* Name / Role Label */}
        <span className={`text-xs mb-1 px-1 font-semibold opacity-50 dark:text-gray-400 ${isUser ? 'text-right' : 'text-left'}`}>
          {isUser ? 'You' : 'Lumi'}
        </span>

        {/* Bubble */}
        <div 
          className={`
            relative px-4 py-3 md:px-5 md:py-4 rounded-2xl md:rounded-3xl text-base leading-relaxed shadow-sm break-words overflow-hidden max-w-full
            ${isUser 
              ? 'bg-gradient-to-br from-indigo-500 to-purple-600 text-white rounded-br-sm shadow-lg shadow-indigo-500/20' 
              : 'bg-white/90 dark:bg-slate-800/80 backdrop-blur-md text-gray-800 dark:text-gray-100 rounded-bl-sm border border-white/60 dark:border-white/10 shadow-sm dark:shadow-[0_0_15px_rgba(0,0,0,0.2)]'
            }
          `}
        >
          {/* Display Attached Images if any */}
          {message.images && message.images.length > 0 && (
             <div className="flex flex-wrap gap-2 mb-2">
                {message.images.map((imgSrc, i) => (
                   <img 
                     key={i}
                     src={imgSrc} 
                     alt="Uploaded attachment" 
                     className="max-w-full sm:max-w-[200px] rounded-lg border border-white/20 shadow-sm object-cover"
                   />
                ))}
             </div>
          )}

          {isUser ? (
            <div className="whitespace-pre-wrap">{message.content}</div>
          ) : (
            <div className="markdown-body">
              {/* Typing Indicator: Only show if typing and no content yet */}
              {isTyping && !message.content ? (
                 <div className="flex items-center gap-1 h-6 py-1 px-1">
                    <div className="w-2 h-2 bg-gray-400 dark:bg-gray-500 rounded-full typing-dot"></div>
                    <div className="w-2 h-2 bg-gray-400 dark:bg-gray-500 rounded-full typing-dot"></div>
                    <div className="w-2 h-2 bg-gray-400 dark:bg-gray-500 rounded-full typing-dot"></div>
                 </div>
              ) : (
                 !message.content ? <div className="opacity-50 text-sm">...</div> :
                <ReactMarkdown components={components}>
                  {message.content}
                </ReactMarkdown>
              )}
            </div>
          )}
          
          {/* Processed file metadata */}
          {!isUser && message.fileMetadata && message.fileMetadata.length > 0 && (
            <div className="mt-3 space-y-1 text-xs text-gray-600 dark:text-gray-200">
              <div className="font-semibold text-gray-700 dark:text-gray-100">Files processed</div>
              {message.fileMetadata.map((f, idx) => (
                <div key={`${f.path || f.name}-${idx}`} className="flex flex-wrap items-center gap-2">
                  <span className="px-2 py-1 rounded bg-gray-100 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 text-[11px] font-semibold">{f.name}</span>
                  {f.mimeType && <span className="opacity-70">{f.mimeType}</span>}
                  {typeof f.size === 'number' && <span className="opacity-70">{(f.size / 1024).toFixed(1)} KB</span>}
                  {f.zipEntryPath && <span className="opacity-70">entry: {f.zipEntryPath}</span>}
                  {f.truncated && <span className="text-amber-600 dark:text-amber-300 font-semibold">truncated</span>}
                  {f.warning && <span className="text-red-500 dark:text-red-300">⚠️ {f.warning}</span>}
                </div>
              ))}
            </div>
          )}

          {!isUser && message.warnings && message.warnings.length > 0 && (
            <div className="mt-2 text-xs text-amber-600 dark:text-amber-300 space-y-1">
              {message.warnings.map((w, idx) => (
                <div key={idx}>⚠️ {w}</div>
              ))}
            </div>
          )}
          
          {/* Model Name and RAG Indicator */}
          {!isUser && (modelName || message.usedRagContext) && (
             <div className="flex items-center justify-end gap-2 mt-2 text-[10px] opacity-40 font-medium tracking-wide">
               {modelName && <span>{modelName}</span>}
               {message.usedRagContext && (
                 <span 
                   className="px-1.5 py-0.5 rounded bg-purple-500/20 dark:bg-purple-400/20 text-purple-700 dark:text-purple-300 opacity-100 border border-purple-500/30" 
                   title={`Used ${message.ragContextLength || 0} chars of memory context`}
                 >
                   🧠 Memory
                 </span>
               )}
             </div>
          )}
        </div>

        {/* Grounding Sources (Google Search Results) */}
        {!isUser && message.groundingUrls && message.groundingUrls.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
             {message.groundingUrls.map((url, idx) => (
               <a 
                key={idx}
                href={url.uri}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs bg-white/50 hover:bg-white/80 dark:bg-slate-800/50 dark:hover:bg-slate-700/80 px-2 py-1 rounded-full border border-white/60 dark:border-white/10 text-indigo-600 dark:text-indigo-300 truncate max-w-[200px] flex items-center gap-1 transition-colors shadow-sm"
               >
                 <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
                 {url.title}
               </a>
             ))}
          </div>
        )}

      </div>
    </div>
  );
});
