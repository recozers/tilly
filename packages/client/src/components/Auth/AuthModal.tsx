import React, { useState } from 'react';
import { useAuthContext } from '../../contexts/AuthContext.js';

/**
 * Authentication modal component
 */
export function AuthModal(): JSX.Element {
  const { signIn, signUp, signInWithGoogle } = useAuthContext();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      if (mode === 'signin') {
        await signIn(email, password);
      } else {
        await signUp(email, password);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    try {
      await signInWithGoogle();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google sign-in failed');
    }
  };

  return (
    <div className="auth-modal-overlay">
      <div className="auth-modal">
        <h2>{mode === 'signin' ? 'Sign In' : 'Sign Up'}</h2>

        {error && <div className="auth-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              disabled={isLoading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              disabled={isLoading}
              minLength={6}
            />
          </div>

          <button type="submit" disabled={isLoading} className="btn-primary">
            {isLoading ? 'Loading...' : mode === 'signin' ? 'Sign In' : 'Sign Up'}
          </button>
        </form>

        <div className="auth-divider">
          <span>or</span>
        </div>

        <button onClick={handleGoogleSignIn} className="btn-google" disabled={isLoading}>
          Continue with Google
        </button>

        <p className="auth-toggle">
          {mode === 'signin' ? (
            <>
              Don't have an account?{' '}
              <button onClick={() => setMode('signup')}>Sign Up</button>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <button onClick={() => setMode('signin')}>Sign In</button>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
