import React, { useState } from 'react';
import { useAuthContext } from '../../contexts/AuthContext.js';

type AuthMode =
  | 'signin'
  | 'signup'
  | 'verify-email'
  | 'forgot-password'
  | 'reset-password';

/**
 * Authentication modal component with multi-step flows for:
 * - Sign in / Sign up
 * - Email verification (OTP)
 * - Password reset (OTP)
 */
export function AuthModal(): JSX.Element {
  const {
    signIn,
    signUp,
    signInWithGoogle,
    verifyEmail,
    resetPassword,
    confirmResetPassword
  } = useAuthContext();

  const [mode, setMode] = useState<AuthMode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const resetForm = () => {
    setPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setCode('');
    setError(null);
    setMessage(null);
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const result = await signIn(email, password);
      // If signingIn is false, verification is needed
      if (!result.signingIn) {
        setMode('verify-email');
        setMessage('Please check your email for a verification code.');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sign in failed';
      // Check if it's an email verification error
      if (message.toLowerCase().includes('verify') || message.toLowerCase().includes('verification')) {
        setMode('verify-email');
        setMessage('Please verify your email to continue.');
      } else {
        setError(message);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setIsLoading(true);

    try {
      const result = await signUp(email, password);
      // If signingIn is false, verification is needed
      if (!result.signingIn) {
        setMode('verify-email');
        setMessage('Check your email for a verification code.');
        resetForm();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign up failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      await verifyEmail(email, code);
      // Successfully verified - user will be signed in automatically
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      await resetPassword(email);
      setMode('reset-password');
      setMessage('Check your email for a reset code.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send reset email');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setIsLoading(true);

    try {
      await confirmResetPassword(email, code, newPassword);
      setMode('signin');
      setMessage('Password reset successful. Please sign in.');
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Password reset failed');
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

  const goToSignIn = () => {
    setMode('signin');
    resetForm();
  };

  const goToSignUp = () => {
    setMode('signup');
    resetForm();
  };

  const goToForgotPassword = () => {
    setMode('forgot-password');
    resetForm();
  };

  // Render different forms based on mode
  const renderForm = () => {
    switch (mode) {
      case 'signin':
        return (
          <>
            <h2>Sign In</h2>
            {message && <div className="auth-message">{message}</div>}
            {error && <div className="auth-error">{error}</div>}

            <form onSubmit={handleSignIn}>
              <div className="form-group">
                <label htmlFor="email">Email</label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  disabled={isLoading}
                  autoComplete="email"
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
                  autoComplete="current-password"
                />
              </div>

              <button type="submit" disabled={isLoading} className="btn-primary">
                {isLoading ? 'Signing in...' : 'Sign In'}
              </button>
            </form>

            <button
              type="button"
              className="btn-link"
              onClick={goToForgotPassword}
              disabled={isLoading}
            >
              Forgot password?
            </button>

            <div className="auth-divider">
              <span>or</span>
            </div>

            <button onClick={handleGoogleSignIn} className="btn-google" disabled={isLoading}>
              Continue with Google
            </button>

            <p className="auth-toggle">
              Don't have an account?{' '}
              <button onClick={goToSignUp} disabled={isLoading}>Sign Up</button>
            </p>
          </>
        );

      case 'signup':
        return (
          <>
            <h2>Create Account</h2>
            {error && <div className="auth-error">{error}</div>}

            <form onSubmit={handleSignUp}>
              <div className="form-group">
                <label htmlFor="email">Email</label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  disabled={isLoading}
                  autoComplete="email"
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
                  minLength={8}
                  autoComplete="new-password"
                />
                <span className="form-hint">At least 8 characters</span>
              </div>

              <button type="submit" disabled={isLoading} className="btn-primary">
                {isLoading ? 'Creating account...' : 'Create Account'}
              </button>
            </form>

            <div className="auth-divider">
              <span>or</span>
            </div>

            <button onClick={handleGoogleSignIn} className="btn-google" disabled={isLoading}>
              Continue with Google
            </button>

            <p className="auth-toggle">
              Already have an account?{' '}
              <button onClick={goToSignIn} disabled={isLoading}>Sign In</button>
            </p>
          </>
        );

      case 'verify-email':
        return (
          <>
            <h2>Verify Your Email</h2>
            {message && <div className="auth-message">{message}</div>}
            {error && <div className="auth-error">{error}</div>}

            <p className="auth-description">
              We sent a 6-digit code to <strong>{email}</strong>
            </p>

            <form onSubmit={handleVerifyEmail}>
              <div className="form-group">
                <label htmlFor="code">Verification Code</label>
                <input
                  id="code"
                  type="text"
                  value={code}
                  onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  required
                  disabled={isLoading}
                  placeholder="000000"
                  className="code-input"
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                />
              </div>

              <button type="submit" disabled={isLoading || code.length !== 6} className="btn-primary">
                {isLoading ? 'Verifying...' : 'Verify Email'}
              </button>
            </form>

            <p className="auth-toggle">
              <button onClick={goToSignIn} disabled={isLoading}>Back to Sign In</button>
            </p>
          </>
        );

      case 'forgot-password':
        return (
          <>
            <h2>Reset Password</h2>
            {error && <div className="auth-error">{error}</div>}

            <p className="auth-description">
              Enter your email and we'll send you a code to reset your password.
            </p>

            <form onSubmit={handleForgotPassword}>
              <div className="form-group">
                <label htmlFor="email">Email</label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  disabled={isLoading}
                  autoComplete="email"
                />
              </div>

              <button type="submit" disabled={isLoading} className="btn-primary">
                {isLoading ? 'Sending code...' : 'Send Reset Code'}
              </button>
            </form>

            <p className="auth-toggle">
              <button onClick={goToSignIn} disabled={isLoading}>Back to Sign In</button>
            </p>
          </>
        );

      case 'reset-password':
        return (
          <>
            <h2>Set New Password</h2>
            {message && <div className="auth-message">{message}</div>}
            {error && <div className="auth-error">{error}</div>}

            <p className="auth-description">
              Enter the code sent to <strong>{email}</strong> and your new password.
            </p>

            <form onSubmit={handleResetPassword}>
              <div className="form-group">
                <label htmlFor="code">Reset Code</label>
                <input
                  id="code"
                  type="text"
                  value={code}
                  onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  required
                  disabled={isLoading}
                  placeholder="000000"
                  className="code-input"
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                />
              </div>

              <div className="form-group">
                <label htmlFor="newPassword">New Password</label>
                <input
                  id="newPassword"
                  type="password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  required
                  disabled={isLoading}
                  minLength={8}
                  autoComplete="new-password"
                />
                <span className="form-hint">At least 8 characters</span>
              </div>

              <div className="form-group">
                <label htmlFor="confirmPassword">Confirm Password</label>
                <input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  required
                  disabled={isLoading}
                  autoComplete="new-password"
                />
              </div>

              <button type="submit" disabled={isLoading || code.length !== 6} className="btn-primary">
                {isLoading ? 'Resetting...' : 'Reset Password'}
              </button>
            </form>

            <p className="auth-toggle">
              <button onClick={goToSignIn} disabled={isLoading}>Back to Sign In</button>
            </p>
          </>
        );
    }
  };

  return (
    <div className="auth-modal-overlay">
      <div className="auth-modal">
        {renderForm()}
      </div>
    </div>
  );
}
