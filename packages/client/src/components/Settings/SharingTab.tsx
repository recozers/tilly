import { useState } from 'react';
import { useFeeds, getFeedUrls, type FeedToken } from '../../hooks/useFeeds.js';

export function SharingTab(): JSX.Element {
  const {
    feeds,
    isLoading,
    newlyCreatedToken,
    createFeed,
    revokeFeed,
    removeFeed,
    clearNewToken,
  } = useFeeds();

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [includePrivate, setIncludePrivate] = useState(false);
  const [expiresInDays, setExpiresInDays] = useState<number | ''>('');
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<'https' | 'webcal' | null>(null);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setError(null);

    try {
      await createFeed({
        name: name.trim(),
        includePrivate,
        expiresInDays: expiresInDays ? Number(expiresInDays) : undefined,
      });
      setName('');
      setIncludePrivate(false);
      setExpiresInDays('');
      setShowForm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create feed');
    }
  };

  const handleCopyUrl = (type: 'https' | 'webcal') => {
    if (!newlyCreatedToken) return;

    const urls = getFeedUrls(newlyCreatedToken.token);
    const urlToCopy = type === 'webcal' ? urls.webcal : urls.https;
    navigator.clipboard.writeText(urlToCopy);
    setCopied(type);
    setTimeout(() => setCopied(null), 2000);
  };

  const handleOpenGoogleCalendar = () => {
    if (!newlyCreatedToken) return;
    const urls = getFeedUrls(newlyCreatedToken.token);
    window.open(urls.googleCalendar, '_blank');
  };

  const handleRevoke = async (feed: FeedToken) => {
    try {
      await revokeFeed(feed._id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke');
    }
  };

  const handleRemove = async (feed: FeedToken) => {
    if (!confirm('Permanently delete this feed link?')) return;

    try {
      await removeFeed(feed._id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete');
    }
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString();
  };

  if (isLoading) {
    return <div className="tab-loading">Loading...</div>;
  }

  return (
    <div className="sharing-tab">
      {/* Newly Created Token Alert */}
      {newlyCreatedToken && (
        <div className="token-alert">
          <div className="token-alert-header">
            <span className="token-alert-icon">🔑</span>
            <h4>Feed Link Created!</h4>
          </div>
          <p className="token-alert-warning">
            Copy this link now. You won't be able to see it again!
          </p>

          {/* HTTPS URL - for manual entry */}
          <div className="token-section">
            <label className="token-section-label">HTTPS URL (for manual entry)</label>
            <div className="token-display">
              <code>{getFeedUrls(newlyCreatedToken.token).https}</code>
              <button className="btn btn-sm btn-primary" onClick={() => handleCopyUrl('https')}>
                {copied === 'https' ? 'Copied!' : 'Copy'}
              </button>
            </div>
          </div>

          {/* webcal URL - for automatic subscription */}
          <div className="token-section">
            <label className="token-section-label">webcal:// URL (opens calendar app)</label>
            <div className="token-display">
              <code>{getFeedUrls(newlyCreatedToken.token).webcal}</code>
              <button className="btn btn-sm btn-primary" onClick={() => handleCopyUrl('webcal')}>
                {copied === 'webcal' ? 'Copied!' : 'Copy'}
              </button>
            </div>
          </div>

          {/* Quick add buttons */}
          <div className="quick-add-section">
            <span className="quick-add-label">Quick Add:</span>
            <button className="btn btn-sm btn-google" onClick={handleOpenGoogleCalendar}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Google Calendar
            </button>
            <a href={getFeedUrls(newlyCreatedToken.token).webcal} className="btn btn-sm btn-apple">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
              </svg>
              Apple Calendar
            </a>
          </div>

          <button className="btn btn-ghost btn-sm done-btn" onClick={clearNewToken}>
            I've saved the link
          </button>
        </div>
      )}

      {/* Create Feed Section */}
      <div className="section">
        <div className="section-header">
          <h3 className="section-title">Calendar Feed Links</h3>
          {!showForm && (
            <button className="btn btn-primary btn-sm" onClick={() => setShowForm(true)}>
              + Create Link
            </button>
          )}
        </div>

        <p className="section-description">
          Create shareable links to let others subscribe to your calendar in their apps.
        </p>

        {showForm && (
          <form className="add-form" onSubmit={handleCreate}>
            <div className="form-group">
              <label className="form-label">Link Name</label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g., Work Schedule"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="form-group form-checkbox">
              <label>
                <input
                  type="checkbox"
                  checked={includePrivate}
                  onChange={(e) => setIncludePrivate(e.target.checked)}
                />
                <span>Include private events</span>
              </label>
              <span className="form-hint">Private events will show as "Busy" to subscribers</span>
            </div>

            <div className="form-group">
              <label className="form-label">Expires In (Optional)</label>
              <div className="expires-input">
                <input
                  type="number"
                  className="form-input"
                  placeholder="Never"
                  min="1"
                  value={expiresInDays}
                  onChange={(e) => setExpiresInDays(e.target.value ? Number(e.target.value) : '')}
                />
                <span className="expires-label">days</span>
              </div>
            </div>

            {error && <div className="alert alert-error">{error}</div>}

            <div className="form-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setShowForm(false)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={!name.trim()}>
                Create Link
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Feeds List */}
      <div className="section">
        {!showForm && (
          <>
            {feeds.length === 0 ? (
              <div className="empty-state">
                <span className="empty-icon">🔗</span>
                <p>No feed links created yet.</p>
                <p className="empty-hint">Share your calendar by creating a subscribable feed link.</p>
              </div>
            ) : (
              <div className="list">
                {feeds.map((feed) => (
                  <div key={feed._id} className={`list-item feed-item ${!feed.isActive ? 'revoked' : ''}`}>
                    <div className="list-item-info">
                      <span className={`feed-status ${feed.isActive ? 'active' : 'inactive'}`} />
                      <div className="list-item-details">
                        <span className="list-item-name">
                          {feed.name}
                          {!feed.isActive && <span className="revoked-badge">Revoked</span>}
                        </span>
                        <span className="list-item-sub">
                          {feed.tokenPreview}
                          {' • '}
                          {feed.accessCount} access{feed.accessCount !== 1 ? 'es' : ''}
                          {feed.expiresAt && ` • Expires ${formatDate(feed.expiresAt)}`}
                        </span>
                      </div>
                    </div>
                    <div className="list-item-actions">
                      {feed.isActive && (
                        <button
                          className="btn btn-sm btn-warning"
                          onClick={() => handleRevoke(feed)}
                          title="Revoke access"
                        >
                          Revoke
                        </button>
                      )}
                      <button
                        className="btn btn-sm btn-ghost"
                        onClick={() => handleRemove(feed)}
                        aria-label="Delete feed"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
