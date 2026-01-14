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
      setSuccess('Profile updated successfully');
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

  return (
    <div className="profile-tab">
      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      <div className="section">
        <h3 className="section-title">Your Profile</h3>

        <div className="profile-field">
          <label className="field-label">Email</label>
          <div className="field-value">{profile?.email || 'Not set'}</div>
        </div>

        <div className="profile-field">
          <label className="field-label">Name</label>
          {isEditing ? (
            <div className="edit-field">
              <input
                type="text"
                className="form-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter your name"
                autoFocus
              />
              <div className="edit-actions">
                <button
                  className="btn btn-primary"
                  onClick={handleSave}
                  disabled={isSaving}
                >
                  {isSaving ? 'Saving...' : 'Save'}
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={handleCancel}
                  disabled={isSaving}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="field-value-editable">
              <span>{profile?.name || 'Not set'}</span>
              <button className="btn btn-link" onClick={() => setIsEditing(true)}>
                Edit
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="section">
        <h3 className="section-title">Account</h3>
        <button className="btn btn-danger" onClick={handleSignOut}>
          Sign Out
        </button>
      </div>
    </div>
  );
}
