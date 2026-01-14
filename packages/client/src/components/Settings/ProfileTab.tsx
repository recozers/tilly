import { useState, useEffect } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../../../convex/_generated/api';
import { useAuthContext } from '../../contexts/AuthContext.js';

export function ProfileTab(): JSX.Element {
  const { signOut } = useAuthContext();
  const profile = useQuery(api.users.queries.getProfile);
  const updateProfile = useMutation(api.users.mutations.updateProfile);

  const [name, setName] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (profile?.name) {
      setName(profile.name);
    }
  }, [profile?.name]);

  const handleSave = async () => {
    setError(null);
    setSuccess(null);
    setIsSaving(true);

    try {
      await updateProfile({ name: name.trim() || undefined });
      setSuccess('Profile updated');
      setIsEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update profile');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setName(profile?.name || '');
    setIsEditing(false);
    setError(null);
  };

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sign out');
    }
  };

  if (profile === undefined) {
    return <div className="tab-loading">Loading...</div>;
  }

  const displayName = profile?.name || profile?.email?.split('@')[0] || '?';
  const initial = displayName[0].toUpperCase();

  return (
    <div className="profile-tab">
      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      {/* Profile Card */}
      <div className="profile-card">
        <div className="profile-avatar">
          {initial}
        </div>
        <div className="profile-info">
          <div className="profile-name">{profile?.name || 'No name set'}</div>
          <div className="profile-email">{profile?.email}</div>
        </div>
      </div>

      {/* Edit Name Section */}
      <div className="section">
        <h3 className="section-title">Display Name</h3>
        {isEditing ? (
          <div className="edit-name-form">
            <input
              type="text"
              className="form-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter your name"
              autoFocus
            />
            <div className="edit-name-actions">
              <button
                className="btn btn-primary"
                onClick={handleSave}
                disabled={isSaving}
              >
                {isSaving ? 'Saving...' : 'Save'}
              </button>
              <button
                className="btn btn-ghost"
                onClick={handleCancel}
                disabled={isSaving}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="list">
            <div className="list-item">
              <div className="list-item-info">
                <div className="list-item-details">
                  <span className="list-item-name">{profile?.name || 'Not set'}</span>
                  <span className="list-item-sub">This is how you appear to friends</span>
                </div>
              </div>
              <button className="btn btn-sm btn-success" onClick={() => setIsEditing(true)}>
                Edit
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Account Section */}
      <div className="section">
        <h3 className="section-title">Account</h3>
        <div className="list">
          <div className="list-item signout-item">
            <div className="list-item-info">
              <div className="list-item-details">
                <span className="list-item-name">Sign out</span>
                <span className="list-item-sub">Sign out of your account on this device</span>
              </div>
            </div>
            <button className="btn btn-sm btn-danger" onClick={handleSignOut}>
              Sign Out
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
