import React, { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { Homepage } from './components/Homepage';
import './styles.css';
import './homepage.css';

function Root(): React.ReactElement {
  // Check if we should skip homepage (e.g., returning from app or direct link)
  const [showHomepage, setShowHomepage] = useState(() => {
    // Skip homepage if URL has ?studio or in dev mode with ?dev
    const params = new URLSearchParams(window.location.search);
    return !params.has('studio') && !params.has('dev');
  });

  const handleEnterStudio = (): void => {
    // Update URL without reload
    window.history.pushState({}, '', '?studio');
    setShowHomepage(false);
  };

  if (showHomepage) {
    return <Homepage onEnter={handleEnterStudio} />;
  }

  return <App />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>
);
