import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import './Friends.css'

const Friends = ({ onBack, onRequestsChange }) => {
  const [activeTab, setActiveTab] = useState('friends')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [friends, setFriends] = useState([])
  const [friendRequests, setFriendRequests] = useState({ sent: [], received: [] })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Fetch friends and requests on mount
  useEffect(() => {
    fetchFriends()
    fetchFriendRequests()
  }, [])

  const fetchFriends = async () => {
    try {
      const response = await fetch('/api/friends', {
        headers: {
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`
        }
      })
      
      if (!response.ok) throw new Error('Failed to fetch friends')
      
      const data = await response.json()
      setFriends(data)
    } catch (error) {
      console.error('Error fetching friends:', error)
      setError('Failed to load friends')
    }
  }

  const fetchFriendRequests = async () => {
    try {
      const response = await fetch('/api/friends/requests', {
        headers: {
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`
        }
      })
      
      if (!response.ok) throw new Error('Failed to fetch friend requests')
      
      const data = await response.json()
      setFriendRequests(data)
    } catch (error) {
      console.error('Error fetching friend requests:', error)
      setError('Failed to load friend requests')
    }
  }

  const searchUsers = async () => {
    if (!searchQuery.trim() || searchQuery.trim().length < 2) {
      setError('Please enter at least 2 characters to search')
      return
    }

    setLoading(true)
    setError('')
    setSearchResults([])

    try {
      const response = await fetch(`/api/users/search?q=${encodeURIComponent(searchQuery)}`, {
        headers: {
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`
        }
      })
      
      if (!response.ok) throw new Error('Failed to search users')
      
      const data = await response.json()
      setSearchResults(data)
      
      if (data.length === 0) {
        setError('No users found matching your search')
      }
    } catch (error) {
      console.error('Error searching users:', error)
      setError('Failed to search users')
    } finally {
      setLoading(false)
    }
  }

  const sendFriendRequest = async (addresseeId) => {
    setLoading(true)
    setError('')
    setSuccess('')

    try {
      const response = await fetch('/api/friends/request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`
        },
        body: JSON.stringify({ addressee_id: addresseeId })
      })
      
      const data = await response.json()
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to send friend request')
      }
      
      setSuccess('Friend request sent successfully!')
      setSearchResults([])
      setSearchQuery('')
      fetchFriendRequests()
    } catch (error) {
      console.error('Error sending friend request:', error)
      setError(error.message || 'Failed to send friend request')
    } finally {
      setLoading(false)
    }
  }

  const acceptFriendRequest = async (requestId) => {
    setLoading(true)
    setError('')
    setSuccess('')

    try {
      const response = await fetch(`/api/friends/requests/${requestId}/accept`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`
        }
      })
      
      if (!response.ok) throw new Error('Failed to accept friend request')
      
      setSuccess('Friend request accepted!')
      fetchFriends()
      fetchFriendRequests()
      onRequestsChange?.()
    } catch (error) {
      console.error('Error accepting friend request:', error)
      setError('Failed to accept friend request')
    } finally {
      setLoading(false)
    }
  }

  const declineFriendRequest = async (requestId) => {
    setLoading(true)
    setError('')
    setSuccess('')

    try {
      const response = await fetch(`/api/friends/requests/${requestId}/decline`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`
        }
      })
      
      if (!response.ok) throw new Error('Failed to decline friend request')
      
      setSuccess('Friend request declined')
      fetchFriendRequests()
      onRequestsChange?.()
    } catch (error) {
      console.error('Error declining friend request:', error)
      setError('Failed to decline friend request')
    } finally {
      setLoading(false)
    }
  }

  const removeFriend = async (friendshipId) => {
    if (!window.confirm('Are you sure you want to remove this friend?')) {
      return
    }

    setLoading(true)
    setError('')
    setSuccess('')

    try {
      const response = await fetch(`/api/friends/${friendshipId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`
        }
      })
      
      if (!response.ok) throw new Error('Failed to remove friend')
      
      setSuccess('Friend removed')
      fetchFriends()
    } catch (error) {
      console.error('Error removing friend:', error)
      setError('Failed to remove friend')
    } finally {
      setLoading(false)
    }
  }

  const getInitials = (name) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
  }

  return (
    <div className="friends-container">
      <div className="friends-header">
        <button className="back-btn" onClick={onBack}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M19 12H5M12 19l-7-7 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <h3>Friends</h3>
      </div>

      {error && <div className="friends-error">{error}</div>}
      {success && <div className="friends-success">{success}</div>}

      <div className="friends-tabs">
        <button
          className={`tab ${activeTab === 'friends' ? 'active' : ''}`}
          onClick={() => setActiveTab('friends')}
        >
          Friends {friends.length > 0 && `(${friends.length})`}
        </button>
        <button
          className={`tab ${activeTab === 'requests' ? 'active' : ''}`}
          onClick={() => setActiveTab('requests')}
        >
          Requests
          {(friendRequests.received.length > 0) && (
            <span className="badge">{friendRequests.received.length}</span>
          )}
        </button>
        <button
          className={`tab ${activeTab === 'add' ? 'active' : ''}`}
          onClick={() => setActiveTab('add')}
        >
          Add Friend
        </button>
      </div>

      <div className="friends-content">
        {activeTab === 'friends' && (
          <div className="friends-list">
            {friends.length === 0 ? (
              <div className="empty-state">
                <p>No friends yet</p>
                <p className="hint">Add friends to start booking meetings together!</p>
              </div>
            ) : (
              friends.map(friendship => (
                <div key={friendship.id} className="friend-item">
                  <div className="friend-avatar">
                    {getInitials(friendship.friend.display_name)}
                  </div>
                  <div className="friend-info">
                    <div className="friend-name">{friendship.friend.display_name}</div>
                    <div className="friend-email">{friendship.friend.email}</div>
                  </div>
                  <button
                    className="remove-btn"
                    onClick={() => removeFriend(friendship.id)}
                    disabled={loading}
                    title="Remove friend"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                      <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'requests' && (
          <div className="requests-section">
            {friendRequests.received.length > 0 && (
              <div className="requests-group">
                <h4>Received Requests</h4>
                {friendRequests.received.map(request => (
                  <div key={request.id} className="request-item">
                    <div className="friend-avatar">
                      {getInitials(request.requester_profile.display_name)}
                    </div>
                    <div className="friend-info">
                      <div className="friend-name">{request.requester_profile.display_name}</div>
                      <div className="friend-email">{request.requester_profile.email}</div>
                    </div>
                    <div className="request-actions">
                      <button
                        className="accept-btn"
                        onClick={() => acceptFriendRequest(request.id)}
                        disabled={loading}
                      >
                        Accept
                      </button>
                      <button
                        className="decline-btn"
                        onClick={() => declineFriendRequest(request.id)}
                        disabled={loading}
                      >
                        Decline
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {friendRequests.sent.length > 0 && (
              <div className="requests-group">
                <h4>Sent Requests</h4>
                {friendRequests.sent.map(request => (
                  <div key={request.id} className="request-item">
                    <div className="friend-avatar">
                      {getInitials(request.addressee_profile.display_name)}
                    </div>
                    <div className="friend-info">
                      <div className="friend-name">{request.addressee_profile.display_name}</div>
                      <div className="friend-email">{request.addressee_profile.email}</div>
                    </div>
                    <div className="request-status">Pending</div>
                  </div>
                ))}
              </div>
            )}

            {friendRequests.received.length === 0 && friendRequests.sent.length === 0 && (
              <div className="empty-state">
                <p>No pending friend requests</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'add' && (
          <div className="add-friend-section">
            <div className="search-container">
              <input
                type="email"
                placeholder="Search by email address"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && searchUsers()}
                disabled={loading}
                className="search-input"
              />
              <button
                className="search-btn"
                onClick={searchUsers}
                disabled={loading || !searchQuery.trim()}
              >
                {loading ? 'Searching...' : 'Search'}
              </button>
            </div>

            {searchResults.length > 0 && (
              <div className="search-results">
                <h4>Search Results</h4>
                {searchResults.map(user => (
                  <div key={user.id} className="search-result-item">
                    <div className="friend-avatar">
                      {getInitials(user.display_name)}
                    </div>
                    <div className="friend-info">
                      <div className="friend-name">{user.display_name}</div>
                      <div className="friend-email">{user.email}</div>
                    </div>
                    <button
                      className="add-btn"
                      onClick={() => sendFriendRequest(user.id)}
                      disabled={loading}
                    >
                      Add Friend
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default Friends