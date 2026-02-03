import { useTheme } from '../../contexts/ThemeContext.js';

type ThemeOption = 'light' | 'dark' | 'system';

interface ThemeChoice {
  value: ThemeOption;
  label: string;
  description: string;
  icon: string;
}

const THEME_OPTIONS: ThemeChoice[] = [
  {
    value: 'light',
    label: 'Light',
    description: 'Always use light mode',
    icon: '☀️',
  },
  {
    value: 'dark',
    label: 'Dark',
    description: 'Always use dark mode',
    icon: '🌙',
  },
  {
    value: 'system',
    label: 'System',
    description: 'Match your device settings',
    icon: '💻',
  },
];

export function AppearanceTab(): JSX.Element {
  const { theme, setTheme, resolvedTheme } = useTheme();

  return (
    <div className="appearance-tab">
      <div className="section">
        <h3 className="section-title">Theme</h3>
        <p className="section-description">
          Choose how Tilly looks to you. Select a theme or let it match your system settings.
        </p>
        <div className="theme-options">
          {THEME_OPTIONS.map((option) => (
            <label
              key={option.value}
              className={`theme-option ${theme === option.value ? 'selected' : ''}`}
            >
              <input
                type="radio"
                name="theme"
                value={option.value}
                checked={theme === option.value}
                onChange={() => setTheme(option.value)}
              />
              <span className="theme-option-icon">{option.icon}</span>
              <span className="theme-option-content">
                <span className="theme-option-label">{option.label}</span>
                <span className="theme-option-description">{option.description}</span>
              </span>
              {theme === option.value && (
                <span className="theme-option-check">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                </span>
              )}
            </label>
          ))}
        </div>
      </div>

      <div className="section">
        <h3 className="section-title">Current Theme</h3>
        <div className="list">
          <div className="list-item">
            <div className="list-item-info">
              <div className="list-item-avatar">
                {resolvedTheme === 'dark' ? '🌙' : '☀️'}
              </div>
              <div className="list-item-details">
                <span className="list-item-name">
                  {resolvedTheme === 'dark' ? 'Dark mode' : 'Light mode'} active
                </span>
                <span className="list-item-sub">
                  {theme === 'system'
                    ? 'Following your system preference'
                    : `Manually set to ${theme} mode`}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
