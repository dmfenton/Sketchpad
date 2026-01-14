/**
 * ThoughtStream - Animated typewriter effect showing AI artist thoughts
 */

import React, { useEffect, useState } from 'react';

const ARTIST_THOUGHTS = [
  'Contemplating the interplay of light and shadow...',
  'A sweeping curve here might create tension...',
  'The warmth of golden tones calls for balance...',
  'This composition needs breathing room...',
  'Let the colors dance together...',
  'Finding harmony in chaos...',
  'Each stroke tells part of the story...',
  'The negative space speaks too...',
];

export function ThoughtStream(): React.ReactElement {
  const [displayedText, setDisplayedText] = useState('');
  const [thoughtIndex, setThoughtIndex] = useState(0);

  useEffect(() => {
    const thought = ARTIST_THOUGHTS[thoughtIndex % ARTIST_THOUGHTS.length];
    setDisplayedText('');

    let charIndex = 0;
    const typeInterval = setInterval(() => {
      if (charIndex < thought.length) {
        setDisplayedText(thought.slice(0, charIndex + 1));
        charIndex++;
      } else {
        clearInterval(typeInterval);
        setTimeout(() => {
          setThoughtIndex((i) => i + 1);
        }, 2000);
      }
    }, 50);

    return (): void => clearInterval(typeInterval);
  }, [thoughtIndex]);

  return (
    <div className="thought-stream">
      <div className="thought-label">
        <span className="thought-dot" />
        thinking
      </div>
      <p className="thought-text">
        {displayedText}
        <span className="cursor" />
      </p>
    </div>
  );
}
