import { useState } from 'react';
import { useFriends, type Friend, type FriendRequest } from '../../hooks/useFriends.js';

export function FriendsTab(): JSX.Element {
  const {
    friends,
    pendingRequests,
    sentRequests,
    isLoading,
    sendRequest,
    acceptRequest,
    declineRequest,
    removeFriend,
  } = useFriends();

  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSendRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setError(null);
    setSuccess(null);

    try {
      await sendRequest(email.trim());
      setSuccess(`Friend request sent to ${email}`);
      setEmail('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send request');
    }
  };

  const handleAccept = async (request: FriendRequest) => {
    try {
      await acceptRequest(request._id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to accept request');
    }
  };

  const handleDecline = async (request: FriendRequest) => {
    try {
      await declineRequest(request._id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to decline request');
    }
  };

  const handleRemove = async (friend: Friend) => {
    if (!confirm(`Remove ${friend.name || friend.email} from your friends?`)) return;

    try {
      await removeFriend(friend.friendId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove friend');
    }
  };

  if (isLoading) {
    return <div className="tab-loading">Loading...</div>;
  }

  return (
    <div className="friends-tab">
      {/* Add Friend Form */}
      <div className="section">
        <h3 className="section-title">Add Friend</h3>
        <form className="add-friend-form" onSubmit={handleSendRequest}>
          <input
            type="email"
            className="form-input"
            placeholder="Enter email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <button type="submit" className="btn btn-primary" disabled={!email.trim()}>
            Send Request
          </button>
        </form>
        {error && <div className="alert alert-error">{error}</div>}
        {success && <div className="alert alert-success">{success}</div>}
      </div>

      {/* Pending Requests */}
      {pendingRequests.length > 0 && (
        <div className="section">
          <h3 className="section-title">
            Pending Requests
            <span className="badge">{pendingRequests.length}</span>
          </h3>
          <div className="list">
            {pendingRequests.map((request) => (
              <div key={request._id} className="list-item">
                <div className="list-item-info">
                  <span className="list-item-avatar">
                    {(request.senderName || request.senderEmail || '?')[0].toUpperCase()}
                  </span>
                  <div className="list-item-details">
                    <span className="list-item-name">{request.senderName || 'Unknown'}</span>
                    <span className="list-item-sub">{request.senderEmail}</span>
                  </div>
                </div>
                <div className="list-item-actions">
                  <button
                    className="btn btn-sm btn-success"
                    onClick={() => handleAccept(request)}
                  >
                    Accept
                  </button>
                  <button
                    className="btn btn-sm btn-danger"
                    onClick={() => handleDecline(request)}
                  >
                    Decline
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sent Requests */}
      {sentRequests.length > 0 && (
        <div className="section">
          <h3 className="section-title">Sent Requests</h3>
          <div className="list">
            {sentRequests.map((request) => (
              <div key={request._id} className="list-item">
                <div className="list-item-info">
                  <span className="list-item-avatar">
                    {(request.receiverName || request.receiverEmail || '?')[0].toUpperCase()}
                  </span>
                  <div className="list-item-details">
                    <span className="list-item-name">{request.receiverName || 'Unknown'}</span>
                    <span className="list-item-sub">{request.receiverEmail}</span>
                  </div>
                </div>
                <span className="status-badge pending">Pending</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Friends List */}
      <div className="section">
        <h3 className="section-title">
          Your Friends
          {friends.length > 0 && <span className="badge">{friends.length}</span>}
        </h3>
        {friends.length === 0 ? (
          <div className="empty-state">
            <span className="empty-icon">👋</span>
            <p>No friends yet. Send a friend request to get started!</p>
          </div>
        ) : (
          <div className="list">
            {friends.map((friend) => (
              <div key={friend.friendshipId} className="list-item">
                <div className="list-item-info">
                  <span className="list-item-avatar">
                    {(friend.name || friend.email || '?')[0].toUpperCase()}
                  </span>
                  <div className="list-item-details">
                    <span className="list-item-name">{friend.name || 'Unknown'}</span>
                    <span className="list-item-sub">{friend.email}</span>
                  </div>
                </div>
                <button
                  className="btn btn-sm btn-ghost"
                  onClick={() => handleRemove(friend)}
                  aria-label="Remove friend"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
