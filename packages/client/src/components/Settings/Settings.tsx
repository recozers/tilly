import { useState, useEffect } from 'react';
import { ProfileTab } from './ProfileTab.js';
import { FriendsTab } from './FriendsTab.js';
import { SubscriptionsTab } from './SubscriptionsTab.js';
import { SharingTab } from './SharingTab.js';
import './Settings.css';

export type TabId = 'profile' | 'friends' | 'subscriptions' | 'sharing';

interface SettingsProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: TabId;
}

interface Tab {
  id: TabId;
  label: string;
  icon: string;
}

const TABS: Tab[] = [
  { id: 'profile', label: 'Profile', icon: '👤' },
  { id: 'friends', label: 'Friends', icon: '👥' },
  { id: 'subscriptions', label: 'Calendars', icon: '📅' },
  { id: 'sharing', label: 'Sharing', icon: '🔗' },
];

export function Settings({ isOpen, onClose, initialTab = 'friends' }: SettingsProps): JSX.Element | null {
  const [activeTab, setActiveTab] = useState<TabId>(initialTab);

  // Update active tab when initialTab changes
  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  if (!isOpen) return null;

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div className="settings-backdrop" onClick={handleBackdropClick}>
      <div className="settings-modal">
        <div className="settings-header">
          <div className="settings-tabs">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              className={`settings-tab ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <span className="tab-icon">{tab.icon}</span>
              <span className="tab-label">{tab.label}</span>
            </button>
          ))}
          </div>
          <button className="settings-close" onClick={onClose} aria-label="Close">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="settings-content">
          {activeTab === 'profile' && <ProfileTab />}
          {activeTab === 'friends' && <FriendsTab />}
          {activeTab === 'subscriptions' && <SubscriptionsTab />}
          {activeTab === 'sharing' && <SharingTab />}
        </div>
      </div>
    </div>
  );
}
