import React, { StrictMode, useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { Homepage } from './components/Homepage';
import { AuthScreen } from './components/AuthScreen';
import { AuthProvider, useAuth } from './context/AuthContext';
import './styles.css';
import './homepage.css';
import './components/AuthScreen.css';

function Router(): React.ReactElement {
  const [currentPath, setCurrentPath] = useState(() => window.location.pathname);
  const { isLoading, isAuthenticated } = useAuth();

  // Handle browser back/forward navigation
  useEffect(() => {
    const handlePopState = (): void => {
      setCurrentPath(window.location.pathname);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigateTo = (path: string): void => {
    window.history.pushState({}, '', path);
    setCurrentPath(path);
  };

  const handleEnterStudio = (): void => {
    navigateTo('/studio');
  };

  const handleBackToHome = (): void => {
    navigateTo('/');
  };

  // Show loading while checking auth
  if (currentPath === '/studio' && isLoading) {
    return (
      <div className="auth-loading">
        <div className="auth-spinner" />
      </div>
    );
  }

  // Studio requires authentication
  if (currentPath === '/studio') {
    if (!isAuthenticated) {
      return <AuthScreen onBack={handleBackToHome} />;
    }
    return <App />;
  }

  // Homepage is public
  return <Homepage onEnter={handleEnterStudio} />;
}

function Root(): React.ReactElement {
  return (
    <AuthProvider>
      <Router />
    </AuthProvider>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>
);
