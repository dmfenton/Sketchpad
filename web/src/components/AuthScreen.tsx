/**
 * Authentication Screen - Login/Signup with invite code for web
 */

import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import './AuthScreen.css';

type AuthMode = 'magic-link' | 'signin' | 'signup';

interface AuthScreenProps {
  onBack?: () => void;
}

export function AuthScreen({ onBack }: AuthScreenProps): React.ReactElement {
  const { signIn, signUp, requestMagicLink, verifyMagicLinkCode } = useAuth();

  const [mode, setMode] = useState<AuthMode>('magic-link');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [code, setCode] = useState('');
  const [showCodeInput, setShowCodeInput] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const clearMessages = (): void => {
    setError(null);
    setSuccess(null);
  };

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    clearMessages();
    setLoading(true);

    try {
      let result;

      if (mode === 'magic-link') {
        if (!email.trim()) {
          setError('Email is required');
          setLoading(false);
          return;
        }

        if (showCodeInput) {
          if (code.length !== 6) {
            setError('Please enter the 6-digit code');
            setLoading(false);
            return;
          }
          result = await verifyMagicLinkCode(email, code);
        } else {
          result = await requestMagicLink(email);
          if (result.success) {
            setSuccess('Check your email for a sign-in link or enter the code below');
            setShowCodeInput(true);
            setLoading(false);
            return;
          }
        }
      } else if (mode === 'signin') {
        if (!email.trim() || !password.trim()) {
          setError('Email and password are required');
          setLoading(false);
          return;
        }
        result = await signIn(email, password);
      } else {
        if (!email.trim() || !password.trim()) {
          setError('Email and password are required');
          setLoading(false);
          return;
        }
        if (!inviteCode.trim()) {
          setError('Invite code is required to sign up');
          setLoading(false);
          return;
        }
        result = await signUp(email, password, inviteCode);
      }

      if (!result.success) {
        setError(result.error ?? 'Authentication failed');
      }
    } catch {
      setError('An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  const switchMode = (newMode: AuthMode): void => {
    setMode(newMode);
    clearMessages();
    setShowCodeInput(false);
    setCode('');
  };

  return (
    <div className="auth-screen">
      <div className="auth-container">
        {onBack && (
          <button className="auth-back" onClick={onBack} type="button">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Back to Home
          </button>
        )}

        <div className="auth-header">
          <div className="auth-logo">
            <svg viewBox="0 0 40 40">
              <circle cx="20" cy="20" r="18" fill="none" stroke="currentColor" strokeWidth="1.5" />
              <path
                d="M 12 28 Q 20 10, 28 28"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </div>
          <h1 className="auth-title">Code Monet</h1>
          <p className="auth-subtitle">
            {mode === 'magic-link'
              ? 'Sign in with email'
              : mode === 'signin'
                ? 'Welcome back'
                : 'Create your account'}
          </p>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="auth-field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (showCodeInput) {
                  setShowCodeInput(false);
                  setCode('');
                }
              }}
              placeholder="you@example.com"
              autoComplete="email"
              disabled={loading}
              required
            />
          </div>

          {mode === 'magic-link' && showCodeInput && (
            <div className="auth-field">
              <label htmlFor="code">Verification Code</label>
              <input
                id="code"
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
                placeholder="000000"
                maxLength={6}
                autoComplete="one-time-code"
                disabled={loading}
                className="auth-code-input"
                autoFocus
              />
            </div>
          )}

          {mode !== 'magic-link' && (
            <div className="auth-field">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                disabled={loading}
                required
              />
            </div>
          )}

          {mode === 'signup' && (
            <div className="auth-field">
              <label htmlFor="inviteCode">Invite Code</label>
              <input
                id="inviteCode"
                type="text"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                placeholder="Enter your invite code"
                autoComplete="off"
                disabled={loading}
                required
              />
              <span className="auth-field-hint">Required to create an account</span>
            </div>
          )}

          {error && <div className="auth-error">{error}</div>}
          {success && <div className="auth-success">{success}</div>}

          <button type="submit" className="auth-submit" disabled={loading}>
            {loading ? (
              <span className="auth-spinner" />
            ) : mode === 'magic-link' ? (
              showCodeInput ? (
                'Verify Code'
              ) : (
                'Send Magic Link'
              )
            ) : mode === 'signin' ? (
              'Sign In'
            ) : (
              'Sign Up'
            )}
          </button>
        </form>

        <div className="auth-footer">
          {mode === 'magic-link' && (
            <>
              <button
                type="button"
                className="auth-link"
                onClick={() => switchMode('signin')}
                disabled={loading}
              >
                Use password instead
              </button>
              <span className="auth-divider">or</span>
              <button
                type="button"
                className="auth-link"
                onClick={() => switchMode('signup')}
                disabled={loading}
              >
                Create account with invite code
              </button>
            </>
          )}
          {mode === 'signin' && (
            <>
              <button
                type="button"
                className="auth-link"
                onClick={() => switchMode('magic-link')}
                disabled={loading}
              >
                Sign in with magic link
              </button>
              <span className="auth-divider">or</span>
              <button
                type="button"
                className="auth-link"
                onClick={() => switchMode('signup')}
                disabled={loading}
              >
                Create account
              </button>
            </>
          )}
          {mode === 'signup' && (
            <>
              <button
                type="button"
                className="auth-link"
                onClick={() => switchMode('magic-link')}
                disabled={loading}
              >
                Sign in with magic link
              </button>
              <span className="auth-divider">or</span>
              <button
                type="button"
                className="auth-link"
                onClick={() => switchMode('signin')}
                disabled={loading}
              >
                Sign in with password
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
