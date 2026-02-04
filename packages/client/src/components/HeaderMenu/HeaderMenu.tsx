import { useState, useRef, useEffect } from 'react';
import './HeaderMenu.css';

export type MenuTab = 'profile' | 'friends' | 'subscriptions' | 'sharing' | 'appearance';

interface HeaderMenuProps {
  onOpenTab: (tab: MenuTab) => void;
  onSignOut: () => void;
}

export function HeaderMenu({ onOpenTab, onSignOut }: HeaderMenuProps): JSX.Element {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const handleItemClick = (action: () => void) => {
    setIsOpen(false);
    action();
  };

  return (
    <div className="header-menu" ref={menuRef}>
      <button
        className="header-menu-button"
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Menu"
        aria-expanded={isOpen}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>

      {isOpen && (
        <div className="header-menu-dropdown">
          <button
            className="header-menu-item"
            onClick={() => handleItemClick(() => onOpenTab('profile'))}
          >
            <span className="menu-item-icon">👤</span>
            <span>Profile</span>
          </button>

          <button
            className="header-menu-item"
            onClick={() => handleItemClick(() => onOpenTab('friends'))}
          >
            <span className="menu-item-icon">👥</span>
            <span>Friends</span>
          </button>

          <button
            className="header-menu-item"
            onClick={() => handleItemClick(() => onOpenTab('subscriptions'))}
          >
            <span className="menu-item-icon">📅</span>
            <span>Calendars</span>
          </button>

          <button
            className="header-menu-item"
            onClick={() => handleItemClick(() => onOpenTab('sharing'))}
          >
            <span className="menu-item-icon">🔗</span>
            <span>Sharing</span>
          </button>

          <button
            className="header-menu-item"
            onClick={() => handleItemClick(() => onOpenTab('appearance'))}
          >
            <span className="menu-item-icon">🎨</span>
            <span>Appearance</span>
          </button>

          <div className="header-menu-divider" />

          <button
            className="header-menu-item"
            onClick={() => handleItemClick(onSignOut)}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16,17 21,12 16,7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            <span>Sign Out</span>
          </button>
        </div>
      )}
    </div>
  );
}
