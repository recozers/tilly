import { useState, useEffect } from 'react';
import { useSubscriptions, type Subscription } from '../../hooks/useSubscriptions.js';

const COLORS = [
  '#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6',
  '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1',
];

// Calendar provider configurations
const PROVIDERS = [
  {
    id: 'google',
    name: 'Google Calendar',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24">
        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
      </svg>
    ),
    color: '#4285F4',
    helpUrl: 'https://support.google.com/calendar/answer/37648',
    instructions: 'Settings → Settings for my calendars → [Calendar] → Integrate calendar → Secret address in iCal format',
  },
  {
    id: 'apple',
    name: 'Apple Calendar',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
        <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
      </svg>
    ),
    color: '#333333',
    helpUrl: 'https://support.apple.com/guide/calendar/share-calendars-icl1022',
    instructions: 'iCloud.com → Calendar → Share → Public Calendar → Copy Link',
  },
  {
    id: 'outlook',
    name: 'Outlook',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24">
        <path fill="#0078D4" d="M24 7.387v10.478c0 .23-.08.424-.238.576-.158.153-.352.23-.58.23h-8.547v-6.959l1.6 1.229c.101.078.216.117.345.117.129 0 .244-.039.344-.117l6.836-5.249c.101-.077.166-.182.193-.316.03-.133.047-.25.047-.352V7.29c0 .065-.047.13-.14.194l-7.28 5.588-1.945-1.494v-4.75c0-.228.08-.422.238-.58.158-.159.352-.238.58-.238h8.547c.228 0 .422.08.58.238.158.158.238.352.238.58v.06zM14.635 6.729v11.636H.58c-.228 0-.422-.077-.58-.229C-.08 17.986 0 17.793 0 17.564V6.729c0-.228.08-.422.238-.58.158-.158.352-.238.58-.238h13.237c.228 0 .422.08.58.238.158.158.238.352.238.58zm-7.07 8.16c1.276 0 2.3-.396 3.066-1.188.766-.79 1.149-1.828 1.149-3.111 0-1.276-.387-2.303-1.16-3.082-.774-.78-1.804-1.168-3.094-1.168-1.27 0-2.287.396-3.055 1.188-.767.791-1.15 1.826-1.15 3.101 0 1.283.39 2.318 1.169 3.101.778.784 1.802 1.176 3.076 1.159zm.04-6.396c.67 0 1.196.234 1.579.703.383.469.574 1.108.574 1.916 0 .82-.195 1.464-.586 1.934-.39.469-.92.703-1.586.703-.659 0-1.18-.238-1.567-.715-.387-.477-.58-1.115-.58-1.914 0-.807.19-1.447.574-1.92.383-.473.917-.707 1.592-.707z"/>
      </svg>
    ),
    color: '#0078D4',
    helpUrl: 'https://support.microsoft.com/en-us/office/share-your-calendar-in-outlook-com',
    instructions: 'Settings → View all Outlook settings → Calendar → Shared calendars → Publish a calendar',
  },
  {
    id: 'other',
    name: 'Other / Paste URL',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
      </svg>
    ),
    color: '#6b7280',
    helpUrl: null,
    instructions: 'Paste any iCal/ICS feed URL',
  },
];

// Try to detect calendar provider from URL
function detectProvider(url: string): string | null {
  const lowerUrl = url.toLowerCase();
  if (lowerUrl.includes('google.com') || lowerUrl.includes('googleapis.com')) return 'google';
  if (lowerUrl.includes('icloud.com') || lowerUrl.includes('apple.com')) return 'apple';
  if (lowerUrl.includes('outlook.') || lowerUrl.includes('office365.') || lowerUrl.includes('live.com')) return 'outlook';
  return null;
}

// Try to extract a sensible name from URL
function suggestNameFromUrl(url: string): string {
  const provider = detectProvider(url);
  if (provider === 'google') return 'Google Calendar';
  if (provider === 'apple') return 'Apple Calendar';
  if (provider === 'outlook') return 'Outlook Calendar';

  // Try to extract from URL path
  try {
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split('/').filter(Boolean);
    if (pathParts.length > 0) {
      const lastPart = pathParts[pathParts.length - 1]
        .replace(/\.ics$/i, '')
        .replace(/[_-]/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase());
      if (lastPart.length > 2 && lastPart.length < 40) {
        return lastPart;
      }
    }
  } catch {
    // Invalid URL
  }

  return 'External Calendar';
}

export function SubscriptionsTab(): JSX.Element {
  const {
    subscriptions,
    isLoading,
    createSubscription,
    updateSubscription,
    removeSubscription,
    syncSubscription,
    isSyncing,
  } = useSubscriptions();

  const [view, setView] = useState<'list' | 'providers' | 'form'>('list');
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [color, setColor] = useState(COLORS[0]);
  const [autoSync, setAutoSync] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  // Auto-detect URL from clipboard when showing providers
  useEffect(() => {
    if (view === 'providers') {
      navigator.clipboard.readText().then(text => {
        if (text && (text.includes('.ics') || text.includes('webcal://') || text.includes('/calendar'))) {
          // Looks like a calendar URL in clipboard
          setUrl(text.trim());
          setName(suggestNameFromUrl(text.trim()));
          const detected = detectProvider(text);
          if (detected) {
            setSelectedProvider(detected);
            setColor(PROVIDERS.find(p => p.id === detected)?.color || COLORS[0]);
          }
        }
      }).catch(() => {
        // Clipboard access denied, that's fine
      });
    }
  }, [view]);

  // Auto-suggest name when URL changes
  useEffect(() => {
    if (url && !name) {
      setName(suggestNameFromUrl(url));
    }
    // Auto-select color based on provider
    const detected = detectProvider(url);
    if (detected && !selectedProvider) {
      setSelectedProvider(detected);
      const providerColor = PROVIDERS.find(p => p.id === detected)?.color;
      if (providerColor && COLORS.includes(providerColor)) {
        setColor(providerColor);
      }
    }
  }, [url, name, selectedProvider]);

  const handleSelectProvider = (providerId: string) => {
    setSelectedProvider(providerId);
    const provider = PROVIDERS.find(p => p.id === providerId);
    if (provider?.color && COLORS.includes(provider.color)) {
      setColor(provider.color);
    }
    setView('form');
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !url.trim()) return;

    setError(null);
    setIsCreating(true);

    try {
      // Normalize URL (webcal:// to https://)
      let normalizedUrl = url.trim();
      if (normalizedUrl.startsWith('webcal://')) {
        normalizedUrl = normalizedUrl.replace('webcal://', 'https://');
      }

      await createSubscription({
        name: name.trim(),
        url: normalizedUrl,
        color,
        autoSync,
      });

      // Reset and go back to list
      resetForm();
      setView('list');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add calendar');
    } finally {
      setIsCreating(false);
    }
  };

  const resetForm = () => {
    setName('');
    setUrl('');
    setColor(COLORS[0]);
    setAutoSync(true);
    setSelectedProvider(null);
    setError(null);
  };

  const handleBack = () => {
    if (view === 'form') {
      setView('providers');
    } else {
      resetForm();
      setView('list');
    }
  };

  const handleToggleSync = async (sub: Subscription) => {
    try {
      await updateSubscription(sub._id, { autoSync: !sub.autoSync });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update');
    }
  };

  const handleToggleVisibility = async (sub: Subscription) => {
    try {
      const currentVisible = sub.visible !== false; // Default to true if undefined
      await updateSubscription(sub._id, { visible: !currentVisible });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update');
    }
  };

  const handleRemove = async (sub: Subscription) => {
    if (!confirm(`Remove "${sub.name}" calendar? This will also remove all imported events.`)) return;

    try {
      await removeSubscription(sub._id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove calendar');
    }
  };

  const handleSync = async (sub: Subscription) => {
    setError(null);
    try {
      const result = await syncSubscription(sub._id);
      if (!result.success) {
        setError(result.error || 'Sync failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sync');
    }
  };

  const formatLastSync = (timestamp?: number) => {
    if (!timestamp) return 'Never synced';
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString();
  };

  if (isLoading) {
    return <div className="tab-loading">Loading...</div>;
  }

  // Provider selection view
  if (view === 'providers') {
    return (
      <div className="subscriptions-tab">
        <div className="section">
          <div className="section-header">
            <button className="btn btn-ghost btn-sm" onClick={handleBack}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
              Back
            </button>
          </div>

          <h3 className="import-title">Import Calendar</h3>
          <p className="import-subtitle">Choose your calendar provider to get started</p>

          <div className="provider-grid">
            {PROVIDERS.map((provider) => (
              <button
                key={provider.id}
                className={`provider-card ${selectedProvider === provider.id ? 'selected' : ''}`}
                onClick={() => handleSelectProvider(provider.id)}
              >
                <div className="provider-icon" style={{ color: provider.color }}>
                  {provider.icon}
                </div>
                <span className="provider-name">{provider.name}</span>
              </button>
            ))}
          </div>

          {url && (
            <div className="clipboard-detected">
              <span className="clipboard-icon">📋</span>
              <span>Calendar URL detected in clipboard</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Form view
  if (view === 'form') {
    const provider = PROVIDERS.find(p => p.id === selectedProvider);

    return (
      <div className="subscriptions-tab">
        <div className="section">
          <div className="section-header">
            <button className="btn btn-ghost btn-sm" onClick={handleBack}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
              Back
            </button>
          </div>

          {provider && provider.id !== 'other' && (
            <div className="provider-header">
              <div className="provider-icon-large" style={{ color: provider.color }}>
                {provider.icon}
              </div>
              <div className="provider-info">
                <h3 className="provider-title">{provider.name}</h3>
                {provider.helpUrl && (
                  <a
                    href={provider.helpUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="provider-help-link"
                  >
                    How to get your calendar URL →
                  </a>
                )}
              </div>
            </div>
          )}

          {provider && provider.instructions && (
            <div className="instructions-box">
              <span className="instructions-label">Quick steps:</span>
              <p className="instructions-text">{provider.instructions}</p>
            </div>
          )}

          <form className="add-form" onSubmit={handleCreate}>
            <div className="form-group">
              <label className="form-label">Calendar URL</label>
              <input
                type="url"
                className="form-input"
                placeholder="https://... or webcal://..."
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                autoFocus
              />
              <span className="form-hint">
                Paste your iCal/ICS feed URL here
              </span>
            </div>

            <div className="form-group">
              <label className="form-label">Calendar Name</label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g., Work Calendar"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Color</label>
              <div className="color-picker">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={`color-option ${color === c ? 'selected' : ''}`}
                    style={{ backgroundColor: c }}
                    onClick={() => setColor(c)}
                    aria-label={`Select color ${c}`}
                  />
                ))}
              </div>
            </div>

            <div className="form-group form-checkbox">
              <label>
                <input
                  type="checkbox"
                  checked={autoSync}
                  onChange={(e) => setAutoSync(e.target.checked)}
                />
                <span>Auto-sync every hour</span>
              </label>
            </div>

            {error && <div className="alert alert-error">{error}</div>}

            <div className="form-actions">
              <button type="button" className="btn btn-ghost" onClick={handleBack}>
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={!name.trim() || !url.trim() || isCreating}
              >
                {isCreating ? 'Adding...' : 'Add Calendar'}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // List view (default)
  return (
    <div className="subscriptions-tab">
      <div className="section">
        <div className="section-header">
          <h3 className="section-title">External Calendars</h3>
          <button className="btn btn-primary btn-sm" onClick={() => setView('providers')}>
            + Import Calendar
          </button>
        </div>

        {error && <div className="alert alert-error">{error}</div>}

        {subscriptions.length === 0 ? (
          <div className="empty-state-card" onClick={() => setView('providers')}>
            <div className="empty-providers">
              {PROVIDERS.slice(0, 3).map((provider) => (
                <div key={provider.id} className="empty-provider-icon" style={{ color: provider.color }}>
                  {provider.icon}
                </div>
              ))}
            </div>
            <p className="empty-title">Import your calendars</p>
            <p className="empty-subtitle">
              Connect Google Calendar, Apple Calendar, Outlook, or any iCal feed
            </p>
            <span className="empty-cta">Click to get started →</span>
          </div>
        ) : (
          <div className="list">
            {subscriptions.map((sub) => (
              <div key={sub._id} className={`list-item subscription-item ${sub.visible === false ? 'subscription-hidden' : ''}`}>
                <div className="list-item-info">
                  <span
                    className="subscription-color"
                    style={{ backgroundColor: sub.color }}
                  />
                  <div className="list-item-details">
                    <span className="list-item-name">{sub.name}</span>
                    <span className="list-item-sub">
                      {formatLastSync(sub.lastSyncAt)}
                      {sub.lastSyncError && (
                        <span className="sync-error" title={sub.lastSyncError}>
                          {' '}• Error
                        </span>
                      )}
                    </span>
                  </div>
                </div>
                <div className="list-item-actions">
                  <button
                    className={`btn btn-sm btn-ghost visibility-btn ${sub.visible === false ? 'hidden-cal' : ''}`}
                    onClick={() => handleToggleVisibility(sub)}
                    title={sub.visible === false ? 'Show on calendar' : 'Hide from calendar'}
                  >
                    {sub.visible === false ? (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" />
                        <line x1="1" y1="1" x2="23" y2="23" />
                      </svg>
                    ) : (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
                  <button
                    className={`btn btn-sm btn-ghost sync-btn ${isSyncing(sub._id) ? 'syncing' : ''}`}
                    onClick={() => handleSync(sub)}
                    disabled={isSyncing(sub._id)}
                    title="Sync now"
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      className={isSyncing(sub._id) ? 'spin' : ''}
                    >
                      <path d="M23 4v6h-6M1 20v-6h6" />
                      <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
                    </svg>
                  </button>
                  <label className="toggle-switch" title={sub.autoSync ? 'Auto-sync on' : 'Auto-sync off'}>
                    <input
                      type="checkbox"
                      checked={sub.autoSync}
                      onChange={() => handleToggleSync(sub)}
                    />
                    <span className="toggle-slider" />
                  </label>
                  <button
                    className="btn btn-sm btn-ghost"
                    onClick={() => handleRemove(sub)}
                    aria-label="Remove calendar"
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
      </div>
    </div>
  );
}
