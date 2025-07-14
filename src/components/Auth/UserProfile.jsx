import { useState, useEffect } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import Friends from '../Friends/Friends'
import './UserProfile.css'

const UserProfile = ({ onClose }) => {
  const { user, signOut } = useAuth()
  const [isEditing, setIsEditing] = useState(false)
  const [profile, setProfile] = useState(null)
  const [formData, setFormData] = useState({
    display_name: '',
    bio: '',
    timezone: '',
    allow_friend_requests: true,
    public_availability: false,
    default_meeting_duration: 30
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [showFriends, setShowFriends] = useState(false)
  const [pendingRequestsCount, setPendingRequestsCount] = useState(0)

  // Fetch user profile from backend
  const fetchUserProfile = async () => {
    try {
      const session = await supabase.auth.getSession()
      const response = await fetch('/api/users/profile', {
        headers: {
          'Authorization': `Bearer ${session.data.session?.access_token}`
        }
      })
      
      if (response.ok) {
        const profileData = await response.json()
        setProfile(profileData)
        setFormData({
          display_name: profileData.display_name || '',
          bio: profileData.bio || '',
          timezone: profileData.timezone || '',
          allow_friend_requests: profileData.allow_friend_requests !== undefined ? profileData.allow_friend_requests : true,
          public_availability: profileData.public_availability !== undefined ? profileData.public_availability : false,
          default_meeting_duration: profileData.default_meeting_duration || 30
        })
      }
    } catch (error) {
      console.error('Error fetching user profile:', error)
    }
  }

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

  // Load profile and pending requests count when component mounts
  useEffect(() => {
    if (user) {
      fetchUserProfile()
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
      const session = await supabase.auth.getSession()
      const response = await fetch('/api/users/profile', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${session.data.session?.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
      })
      
      if (response.ok) {
        const updatedProfile = await response.json()
        setProfile(updatedProfile)
        setSuccess('Profile updated successfully!')
        setIsEditing(false)
      } else {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to update profile')
      }
    } catch (error) {
      setError(error.message)
    } finally {
      setLoading(false)
    }
  }

  const handleInputChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }))
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
    return profile?.display_name || user?.email?.split('@')[0] || 'User'
  }

  return (
    <div className="user-profile-dropdown">
      <div className="user-profile-header">
        <div className="user-avatar">
          {getInitials(profile?.display_name, user?.email)}
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
              value={formData.display_name}
              onChange={(e) => handleInputChange('display_name', e.target.value)}
              placeholder="Enter your display name"
              disabled={loading}
            />
          </div>
          
          <div className="form-group">
            <label htmlFor="bio">Bio</label>
            <textarea
              id="bio"
              value={formData.bio}
              onChange={(e) => handleInputChange('bio', e.target.value)}
              placeholder="Tell others about yourself"
              disabled={loading}
              rows={3}
            />
          </div>
          
          <div className="form-group">
            <label htmlFor="timezone">Timezone</label>
            <select
              id="timezone"
              value={formData.timezone}
              onChange={(e) => handleInputChange('timezone', e.target.value)}
              disabled={loading}
            >
              <option value="">Select timezone</option>
              <option value="America/New_York">Eastern Time (ET)</option>
              <option value="America/Chicago">Central Time (CT)</option>
              <option value="America/Denver">Mountain Time (MT)</option>
              <option value="America/Los_Angeles">Pacific Time (PT)</option>
              <option value="America/Phoenix">Arizona Time (MST)</option>
              <option value="America/Anchorage">Alaska Time (AKST)</option>
              <option value="Pacific/Honolulu">Hawaii Time (HST)</option>
              <option value="UTC">UTC</option>
              <option value="Europe/London">London (GMT)</option>
              <option value="Europe/Paris">Paris (CET)</option>
              <option value="Europe/Berlin">Berlin (CET)</option>
              <option value="Asia/Tokyo">Tokyo (JST)</option>
              <option value="Asia/Shanghai">Shanghai (CST)</option>
              <option value="Asia/Kolkata">India (IST)</option>
              <option value="Australia/Sydney">Sydney (AEST)</option>
            </select>
          </div>
          
          <div className="form-group">
            <label htmlFor="meetingDuration">Default Meeting Duration (minutes)</label>
            <select
              id="meetingDuration"
              value={formData.default_meeting_duration}
              onChange={(e) => handleInputChange('default_meeting_duration', parseInt(e.target.value))}
              disabled={loading}
            >
              <option value={15}>15 minutes</option>
              <option value={30}>30 minutes</option>
              <option value={45}>45 minutes</option>
              <option value={60}>1 hour</option>
              <option value={90}>1.5 hours</option>
              <option value={120}>2 hours</option>
            </select>
          </div>
          
          <div className="form-group">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={formData.allow_friend_requests}
                onChange={(e) => handleInputChange('allow_friend_requests', e.target.checked)}
                disabled={loading}
              />
              Allow others to send friend requests
            </label>
          </div>
          
          <div className="form-group">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={formData.public_availability}
                onChange={(e) => handleInputChange('public_availability', e.target.checked)}
                disabled={loading}
              />
              Share availability with friends
            </label>
          </div>
          
          <div className="form-actions">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                setIsEditing(false)
                setError('')
                setSuccess('')
                // Reset form to current profile data
                if (profile) {
                  setFormData({
                    display_name: profile.display_name || '',
                    bio: profile.bio || '',
                    timezone: profile.timezone || '',
                    allow_friend_requests: profile.allow_friend_requests !== undefined ? profile.allow_friend_requests : true,
                    public_availability: profile.public_availability !== undefined ? profile.public_availability : false,
                    default_meeting_duration: profile.default_meeting_duration || 30
                  })
                }
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