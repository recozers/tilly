import { useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import './AuthModal.css'

const AuthModal = ({ isOpen, onClose }) => {
  const [mode, setMode] = useState('signin') // 'signin', 'signup', 'reset'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const { signIn, signUp, signInWithProvider, resetPassword } = useAuth()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setMessage('')

    try {
      if (mode === 'signin') {
        const { error } = await signIn(email, password)
        if (error) throw error
        onClose()
      } else if (mode === 'signup') {
        if (password !== confirmPassword) {
          throw new Error('Passwords do not match')
        }
        const { error } = await signUp(email, password)
        if (error) throw error
        setMessage('Check your email for a confirmation link!')
      } else if (mode === 'reset') {
        const { error } = await resetPassword(email)
        if (error) throw error
        setMessage('Check your email for a password reset link!')
      }
    } catch (error) {
      setError(error.message)
    } finally {
      setLoading(false)
    }
  }

  const handleGoogleSignIn = async () => {
    setLoading(true)
    setError('')
    try {
      const { error } = await signInWithProvider('google')
      if (error) throw error
    } catch (error) {
      setError(error.message)
    } finally {
      setLoading(false)
    }
  }

  const resetForm = () => {
    setEmail('')
    setPassword('')
    setConfirmPassword('')
    setError('')
    setMessage('')
  }

  const switchMode = (newMode) => {
    setMode(newMode)
    resetForm()
  }

  if (!isOpen) return null

  return (
    <div className="auth-modal-overlay" onClick={onClose}>
      <div className="auth-modal" onClick={(e) => e.stopPropagation()}>
        <div className="auth-modal-header">
          <h2>
            {mode === 'signin' && 'Sign In'}
            {mode === 'signup' && 'Create Account'}
            {mode === 'reset' && 'Reset Password'}
          </h2>
          <button className="auth-modal-close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="auth-modal-content">
          {error && <div className="auth-error">{error}</div>}
          {message && <div className="auth-message">{message}</div>}

          <form onSubmit={handleSubmit}>
            <div className="auth-form-group">
              <label htmlFor="email">Email</label>
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="Enter your email"
                disabled={loading}
              />
            </div>

            {mode !== 'reset' && (
              <div className="auth-form-group">
                <label htmlFor="password">Password</label>
                <input
                  type="password"
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="Enter your password"
                  disabled={loading}
                  minLength={6}
                />
              </div>
            )}

            {mode === 'signup' && (
              <div className="auth-form-group">
                <label htmlFor="confirmPassword">Confirm Password</label>
                <input
                  type="password"
                  id="confirmPassword"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  placeholder="Confirm your password"
                  disabled={loading}
                  minLength={6}
                />
              </div>
            )}

            <button
              type="submit"
              className="auth-submit-btn"
              disabled={loading}
            >
              {loading ? 'Loading...' : 
                mode === 'signin' ? 'Sign In' :
                mode === 'signup' ? 'Create Account' :
                'Send Reset Link'
              }
            </button>
          </form>

          {mode !== 'reset' && (
            <>
              <div className="auth-divider">
                <span>or</span>
              </div>

              <button
                className="auth-google-btn"
                onClick={handleGoogleSignIn}
                disabled={loading}
              >
                <svg width="18" height="18" viewBox="0 0 18 18">
                  <path fill="#4285F4" d="M16.51 8H8.98v3h4.3c-.18 1-.74 1.48-1.6 2.04v2.01h2.6a7.8 7.8 0 0 0 2.38-5.88c0-.57-.05-.66-.15-1.18z"/>
                  <path fill="#34A853" d="M8.98 17c2.16 0 3.97-.72 5.3-1.94l-2.6-2.04a4.8 4.8 0 0 1-7.18-2.53H1.83v2.07A8 8 0 0 0 8.98 17z"/>
                  <path fill="#FBBC05" d="M4.5 10.49a4.8 4.8 0 0 1 0-3.07V5.35H1.83a8 8 0 0 0 0 7.28l2.67-2.14z"/>
                  <path fill="#EA4335" d="M8.98 3.58c1.32 0 2.5.45 3.44 1.35l2.54-2.54a8 8 0 0 0-5.98-2.39 8 8 0 0 0-7.15 4.42l2.67 2.14c.63-1.89 2.39-3.18 4.48-3.18z"/>
                </svg>
                Continue with Google
              </button>
            </>
          )}

          <div className="auth-links">
            {mode === 'signin' && (
              <>
                <button 
                  type="button" 
                  className="auth-link"
                  onClick={() => switchMode('signup')}
                >
                  Don't have an account? Sign up
                </button>
                <button 
                  type="button" 
                  className="auth-link"
                  onClick={() => switchMode('reset')}
                >
                  Forgot your password?
                </button>
              </>
            )}
            {mode === 'signup' && (
              <button 
                type="button" 
                className="auth-link"
                onClick={() => switchMode('signin')}
              >
                Already have an account? Sign in
              </button>
            )}
            {mode === 'reset' && (
              <button 
                type="button" 
                className="auth-link"
                onClick={() => switchMode('signin')}
              >
                Back to sign in
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default AuthModal 