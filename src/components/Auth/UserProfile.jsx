import { useState, useEffect } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import Friends from '../Friends/Friends'
import './UserProfile.css'

const UserProfile = ({ onClose }) => {
  const { user, signOut, updateProfile } = useAuth()
  const [isEditing, setIsEditing] = useState(false)
  const [displayName, setDisplayName] = useState(user?.user_metadata?.display_name || '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [showFriends, setShowFriends] = useState(false)
  const [pendingRequestsCount, setPendingRequestsCount] = useState(0)

  // Fetch pending friend requests count
  const fetchPendingRequestsCount = async () => {
    try {
      const session = await supabase.auth.getSession()
      const response = await fetch('/api/friends/requests', {
        headers: {
          'Authorization': `Bearer ${session.data.session?.access_token}`
        }
      })
      
      if (response.ok) {
        const data = await response.json()
        setPendingRequestsCount(data.received.length)
      }
    } catch (error) {
      console.error('Error fetching pending requests count:', error)
    }
  }

  // Load pending requests count when component mounts
  useEffect(() => {
    if (user) {
      fetchPendingRequestsCount()
    }
  }, [user])

  const handleSignOut = async () => {
    try {
      await signOut()
      onClose()
    } catch (error) {
      console.error('Error signing out:', error)
    }
  }

  const handleUpdateProfile = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setSuccess('')

    try {
      const { error } = await updateProfile({
        display_name: displayName
      })
      if (error) throw error
      
      setSuccess('Profile updated successfully!')
      setIsEditing(false)
    } catch (error) {
      setError(error.message)
    } finally {
      setLoading(false)
    }
  }

  const getInitials = (name, email) => {
    if (name) {
      return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    }
    if (email) {
      return email[0].toUpperCase()
    }
    return 'U'
  }

  const getDisplayName = () => {
    return user?.user_metadata?.display_name || user?.email?.split('@')[0] || 'User'
  }

  return (
    <div className="user-profile-dropdown">
      <div className="user-profile-header">
        <div className="user-avatar">
          {getInitials(user?.user_metadata?.display_name, user?.email)}
        </div>
        <div className="user-info">
          <div className="user-name">{getDisplayName()}</div>
          <div className="user-email">{user?.email}</div>
        </div>
      </div>

      {error && <div className="profile-error">{error}</div>}
      {success && <div className="profile-success">{success}</div>}

      {isEditing ? (
        <form onSubmit={handleUpdateProfile} className="profile-edit-form">
          <div className="form-group">
            <label htmlFor="displayName">Display Name</label>
            <input
              type="text"
              id="displayName"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Enter your display name"
              disabled={loading}
            />
          </div>
          <div className="form-actions">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                setIsEditing(false)
                setError('')
                setSuccess('')
                setDisplayName(user?.user_metadata?.display_name || '')
              }}
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={loading}
            >
              {loading ? 'Updating...' : 'Update'}
            </button>
          </div>
        </form>
      ) : showFriends ? (
        <Friends 
          onBack={() => setShowFriends(false)} 
          onRequestsChange={() => fetchPendingRequestsCount()} 
        />
      ) : (
        <div className="profile-actions">
          <button
            className="profile-action-btn"
            onClick={() => setIsEditing(true)}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M12 22H5a2 2 0 01-2-2V5a2 2 0 012-2h7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M18.5 2.5l3 3L12 15l-4 1 1-4z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Edit Profile
          </button>
          
          <button
            className="profile-action-btn"
            onClick={() => {
              setShowFriends(true)
              setPendingRequestsCount(0) // Clear notification when opened
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M22 21v-2a4 4 0 00-3-3.87" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M16 3.13a4 4 0 010 7.75" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Friends
            {pendingRequestsCount > 0 && (
              <span className="notification-badge">{pendingRequestsCount}</span>
            )}
          </button>
          
          <div className="profile-divider"></div>
          
          <button
            className="profile-action-btn sign-out"
            onClick={handleSignOut}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <polyline points="16,17 21,12 16,7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <line x1="21" y1="12" x2="9" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Sign Out
          </button>
        </div>
      )}
    </div>
  )
}

export default UserProfile 