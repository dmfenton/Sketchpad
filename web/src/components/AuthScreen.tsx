/**
 * Authentication screen with magic link flow.
 */

import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';

type AuthStep = 'email' | 'code';

export function AuthScreen(): React.ReactElement {
  const { requestMagicLink, verifyMagicLinkCode } = useAuth();
  const [step, setStep] = useState<AuthStep>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setError(null);
    setIsLoading(true);

    const result = await requestMagicLink(email.trim());

    setIsLoading(false);
    if (result.success) {
      setStep('code');
    } else {
      setError(result.error || 'Failed to send magic link');
    }
  };

  const handleCodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length !== 6) return;

    setError(null);
    setIsLoading(true);

    const result = await verifyMagicLinkCode(email, code);

    setIsLoading(false);
    if (!result.success) {
      setError(result.error || 'Invalid code');
    }
    // On success, AuthContext will update and this screen will unmount
  };

  const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '').slice(0, 6);
    setCode(value);
  };

  const handleBack = () => {
    setStep('email');
    setCode('');
    setError(null);
  };

  return (
    <div className="min-h-screen bg-bg-primary flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-bg-secondary rounded-xl p-8 shadow-2xl">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-text-primary mb-2">Code Monet</h1>
          <p className="text-text-secondary">Autonomous AI Artist</p>
        </div>

        {step === 'email' ? (
          <form onSubmit={handleEmailSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm text-text-secondary mb-2">
                Email address
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full px-4 py-3 bg-bg-primary border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
                disabled={isLoading}
                autoFocus
              />
            </div>

            {error && (
              <div className="text-error text-sm bg-error/10 px-3 py-2 rounded-lg">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading || !email.trim()}
              className="w-full py-3 bg-accent text-white font-medium rounded-lg hover:bg-accent-dim disabled:bg-text-muted disabled:cursor-not-allowed transition-colors"
            >
              {isLoading ? 'Sending...' : 'Send Magic Link'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleCodeSubmit} className="space-y-4">
            <div className="text-center mb-4">
              <p className="text-text-secondary text-sm">
                We sent a code to <span className="text-text-primary font-medium">{email}</span>
              </p>
            </div>

            <div>
              <label htmlFor="code" className="block text-sm text-text-secondary mb-2">
                Enter 6-digit code
              </label>
              <input
                id="code"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={code}
                onChange={handleCodeChange}
                placeholder="000000"
                className="w-full px-4 py-3 bg-bg-primary border border-border rounded-lg text-text-primary text-center text-2xl tracking-[0.5em] font-mono placeholder:text-text-muted placeholder:tracking-[0.5em] focus:outline-none focus:border-accent"
                disabled={isLoading}
                autoFocus
                maxLength={6}
              />
            </div>

            {error && (
              <div className="text-error text-sm bg-error/10 px-3 py-2 rounded-lg">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading || code.length !== 6}
              className="w-full py-3 bg-accent text-white font-medium rounded-lg hover:bg-accent-dim disabled:bg-text-muted disabled:cursor-not-allowed transition-colors"
            >
              {isLoading ? 'Verifying...' : 'Verify Code'}
            </button>

            <button
              type="button"
              onClick={handleBack}
              className="w-full py-2 text-text-secondary hover:text-text-primary transition-colors"
            >
              ← Use a different email
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
