import React, { StrictMode, useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { Homepage } from './components/Homepage';
import './styles.css';
import './homepage.css';

function Root(): React.ReactElement {
  const [currentPath, setCurrentPath] = useState(() => window.location.pathname);

  // Handle browser back/forward navigation
  useEffect(() => {
    const handlePopState = (): void => {
      setCurrentPath(window.location.pathname);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const handleEnterStudio = (): void => {
    window.history.pushState({}, '', '/studio');
    setCurrentPath('/studio');
  };

  // Show studio for /studio path
  if (currentPath === '/studio') {
    return <App />;
  }

  // Show homepage for root and all other paths
  return <Homepage onEnter={handleEnterStudio} />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>
);
