import React, { useState, useEffect } from 'react';

interface TypingEffectProps {
  text: string;
  speed?: number;
  isStreaming?: boolean; // If true, we just render text as is because the parent controls flow
}

export const TypingEffect: React.FC<TypingEffectProps> = ({ text, speed = 15, isStreaming = false }) => {
  const [displayedText, setDisplayedText] = useState('');

  useEffect(() => {
    if (isStreaming) {
      setDisplayedText(text);
      return;
    }

    let i = 0;
    const timer = setInterval(() => {
      if (i < text.length) {
        setDisplayedText(text.substring(0, i + 1));
        i++;
      } else {
        clearInterval(timer);
      }
    }, speed);

    return () => clearInterval(timer);
  }, [text, speed, isStreaming]);

  return <span className="whitespace-pre-wrap">{displayedText}</span>;
};