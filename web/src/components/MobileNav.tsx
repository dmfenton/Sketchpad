/**
 * Mobile bottom navigation component.
 */

import React from 'react';

export type MobileTab = 'canvas' | 'messages' | 'debug';

interface MobileNavProps {
  activeTab: MobileTab;
  onTabChange: (tab: MobileTab) => void;
  messageCount?: number;
}

export function MobileNav({
  activeTab,
  onTabChange,
  messageCount = 0,
}: MobileNavProps): React.ReactElement {
  return (
    <nav className="mobile-nav">
      <button
        className={activeTab === 'canvas' ? 'active' : ''}
        onClick={() => onTabChange('canvas')}
        aria-label="Canvas"
      >
        <span className="icon">🎨</span>
        <span>Canvas</span>
      </button>
      <button
        className={activeTab === 'messages' ? 'active' : ''}
        onClick={() => onTabChange('messages')}
        aria-label="Messages"
      >
        <span className="icon">💬</span>
        <span>Messages</span>
        {messageCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-accent text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
            {messageCount > 99 ? '99+' : messageCount}
          </span>
        )}
      </button>
      <button
        className={activeTab === 'debug' ? 'active' : ''}
        onClick={() => onTabChange('debug')}
        aria-label="Debug"
      >
        <span className="icon">🔧</span>
        <span>Debug</span>
      </button>
    </nav>
  );
}
