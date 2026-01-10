import { useState, useEffect } from 'react';
import './EventModal.css';

// Convex event type
interface CalendarEvent {
  _id: string;
  title: string;
  startTime: number;
  endTime: number;
  color: string;
  description?: string;
  location?: string;
  allDay?: boolean;
  timezone?: string;
  reminders?: number[];
  type: 'event';
}

interface CreateEventData {
  title: string;
  startTime: number;
  endTime: number;
  color?: string;
  description?: string;
  location?: string;
  allDay?: boolean;
  timezone?: string;
  reminders?: number[];
}

interface UpdateEventData {
  title?: string;
  startTime?: number;
  endTime?: number;
  color?: string;
  description?: string;
  location?: string;
  allDay?: boolean;
  timezone?: string;
  reminders?: number[];
}

// Common reminder options (in minutes before event)
const REMINDER_OPTIONS = [
  { value: 0, label: 'At time of event' },
  { value: 5, label: '5 minutes before' },
  { value: 15, label: '15 minutes before' },
  { value: 30, label: '30 minutes before' },
  { value: 60, label: '1 hour before' },
  { value: 120, label: '2 hours before' },
  { value: 1440, label: '1 day before' },
  { value: 10080, label: '1 week before' },
];

// Common timezone options
const TIMEZONE_OPTIONS = [
  { value: 'America/New_York', label: 'Eastern Time (ET)' },
  { value: 'America/Chicago', label: 'Central Time (CT)' },
  { value: 'America/Denver', label: 'Mountain Time (MT)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
  { value: 'America/Anchorage', label: 'Alaska Time' },
  { value: 'Pacific/Honolulu', label: 'Hawaii Time' },
  { value: 'UTC', label: 'UTC' },
  { value: 'Europe/London', label: 'London (GMT/BST)' },
  { value: 'Europe/Paris', label: 'Paris (CET/CEST)' },
  { value: 'Europe/Berlin', label: 'Berlin (CET/CEST)' },
  { value: 'Asia/Tokyo', label: 'Tokyo (JST)' },
  { value: 'Asia/Shanghai', label: 'Shanghai (CST)' },
  { value: 'Asia/Kolkata', label: 'India (IST)' },
  { value: 'Australia/Sydney', label: 'Sydney (AEST/AEDT)' },
];

// Get user's local timezone
function getLocalTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return 'America/New_York';
  }
}

const COLOR_OPTIONS = [
  { value: '#4A7C2A', label: 'Green' },
  { value: '#2196F3', label: 'Blue' },
  { value: '#9C27B0', label: 'Purple' },
  { value: '#FF9800', label: 'Orange' },
  { value: '#F44336', label: 'Red' },
  { value: '#607D8B', label: 'Gray' },
  { value: '#009688', label: 'Teal' },
  { value: '#E91E63', label: 'Pink' },
];

interface EventModalProps {
  event?: CalendarEvent | null;
  initialDate?: Date | null;
  onSave: (data: CreateEventData | UpdateEventData) => Promise<void>;
  onDelete?: () => Promise<void>;
  onClose: () => void;
}

function formatDateTimeLocal(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function formatDateOnly(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function EventModal({
  event,
  initialDate,
  onSave,
  onDelete,
  onClose,
}: EventModalProps): JSX.Element {
  const isEditing = !!event;

  const getDefaultStart = () => {
    if (event) return new Date(event.startTime);
    if (initialDate) return initialDate;
    const now = new Date();
    now.setMinutes(0, 0, 0);
    now.setHours(now.getHours() + 1);
    return now;
  };

  const getDefaultEnd = () => {
    if (event) return new Date(event.endTime);
    const start = getDefaultStart();
    const end = new Date(start);
    end.setHours(end.getHours() + 1);
    return end;
  };

  const [title, setTitle] = useState(event?.title || '');
  const [allDay, setAllDay] = useState(event?.allDay || false);
  const [start, setStart] = useState(formatDateTimeLocal(getDefaultStart()));
  const [end, setEnd] = useState(formatDateTimeLocal(getDefaultEnd()));
  // For all-day events, default end date to same as start date (single day event)
  const [startDate, setStartDate] = useState(formatDateOnly(getDefaultStart()));
  const [endDate, setEndDate] = useState(formatDateOnly(getDefaultStart()));
  const [color, setColor] = useState(event?.color || '#4A7C2A');
  const [description, setDescription] = useState(event?.description || '');
  const [location, setLocation] = useState(event?.location || '');
  const [timezone, setTimezone] = useState(event?.timezone || getLocalTimezone());
  const [reminders, setReminders] = useState<number[]>(event?.reminders || [15]); // Default: 15 min before
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Add a reminder
  const addReminder = (minutes: number) => {
    if (!reminders.includes(minutes)) {
      setReminders([...reminders, minutes].sort((a, b) => a - b));
    }
  };

  // Remove a reminder
  const removeReminder = (minutes: number) => {
    setReminders(reminders.filter(r => r !== minutes));
  };

  // Update end time when start changes (maintain 1 hour duration for new events)
  useEffect(() => {
    if (!isEditing) {
      const startDate = new Date(start);
      const endDate = new Date(startDate);
      endDate.setHours(endDate.getHours() + 1);
      setEnd(formatDateTimeLocal(endDate));
    }
  }, [start, isEditing]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!title.trim()) {
      setError('Title is required');
      return;
    }

    let startDateTime: Date;
    let endDateTime: Date;

    if (allDay) {
      // For all-day events, use UTC to avoid timezone shifting
      // Parse date components and create UTC midnight times
      const [startYear, startMonth, startDay] = startDate.split('-').map(Number);
      const [endYear, endMonth, endDay] = endDate.split('-').map(Number);

      // Start at 00:00:00 UTC
      startDateTime = new Date(Date.UTC(startYear, startMonth - 1, startDay, 0, 0, 0));
      // End at 23:59:59.999 UTC
      endDateTime = new Date(Date.UTC(endYear, endMonth - 1, endDay, 23, 59, 59, 999));

      if (endDateTime < startDateTime) {
        setError('End date must be on or after start date');
        return;
      }
    } else {
      startDateTime = new Date(start);
      endDateTime = new Date(end);

      if (endDateTime <= startDateTime) {
        setError('End time must be after start time');
        return;
      }
    }

    setIsSubmitting(true);

    try {
      const data: CreateEventData = {
        title: title.trim(),
        startTime: startDateTime.getTime(),
        endTime: endDateTime.getTime(),
        color,
        description: description.trim() || undefined,
        location: location.trim() || undefined,
        allDay,
        timezone,
        reminders: reminders.length > 0 ? reminders : undefined,
      };

      await onSave(data);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save event');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!event || !onDelete) return;

    if (!confirm('Are you sure you want to delete this event?')) {
      return;
    }

    setIsSubmitting(true);
    try {
      await onDelete();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete event');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div className="event-modal-overlay" onClick={handleBackdropClick}>
      <div className="event-modal" role="dialog" aria-modal="true">
        <div className="event-modal-header">
          <h2>{isEditing ? 'Edit Event' : 'New Event'}</h2>
          <button
            className="event-modal-close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {error && <div className="event-modal-error">{error}</div>}

          <div className="form-group">
            <label htmlFor="event-title">Title</label>
            <input
              id="event-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Event title"
              autoFocus
              required
            />
          </div>

          <div className="form-group form-group-checkbox">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={allDay}
                onChange={(e) => setAllDay(e.target.checked)}
              />
              <span>All day</span>
            </label>
          </div>

          {allDay ? (
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="event-start-date">Start Date</label>
                <input
                  id="event-start-date"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="event-end-date">End Date</label>
                <input
                  id="event-end-date"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  required
                />
              </div>
            </div>
          ) : (
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="event-start">Start</label>
                <input
                  id="event-start"
                  type="datetime-local"
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="event-end">End</label>
                <input
                  id="event-end"
                  type="datetime-local"
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                  required
                />
              </div>
            </div>
          )}

          <div className="form-group">
            <label htmlFor="event-location">Location</label>
            <input
              id="event-location"
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Add location"
            />
          </div>

          <div className="form-group">
            <label htmlFor="event-description">Description</label>
            <textarea
              id="event-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add description"
              rows={3}
            />
          </div>

          <div className="form-group">
            <label htmlFor="event-timezone">Timezone</label>
            <select
              id="event-timezone"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="form-select"
            >
              {TIMEZONE_OPTIONS.map((tz) => (
                <option key={tz.value} value={tz.value}>
                  {tz.label}
                </option>
              ))}
              {/* Show current timezone if not in list */}
              {!TIMEZONE_OPTIONS.find(tz => tz.value === timezone) && (
                <option value={timezone}>{timezone}</option>
              )}
            </select>
          </div>

          <div className="form-group">
            <label>Reminders</label>
            <div className="reminders-container">
              {reminders.length > 0 ? (
                <div className="reminder-chips">
                  {reminders.map((minutes) => {
                    const option = REMINDER_OPTIONS.find(o => o.value === minutes);
                    return (
                      <span key={minutes} className="reminder-chip">
                        {option?.label || `${minutes} min before`}
                        <button
                          type="button"
                          className="reminder-remove"
                          onClick={() => removeReminder(minutes)}
                          aria-label="Remove reminder"
                        >
                          ×
                        </button>
                      </span>
                    );
                  })}
                </div>
              ) : (
                <span className="no-reminders">No reminders set</span>
              )}
              <select
                className="reminder-add-select"
                value=""
                onChange={(e) => {
                  if (e.target.value) {
                    addReminder(parseInt(e.target.value, 10));
                    e.target.value = '';
                  }
                }}
              >
                <option value="">Add reminder...</option>
                {REMINDER_OPTIONS.filter(opt => !reminders.includes(opt.value)).map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-group">
            <label>Color</label>
            <div className="color-picker">
              {COLOR_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={`color-option ${color === opt.value ? 'selected' : ''}`}
                  style={{ backgroundColor: opt.value }}
                  onClick={() => setColor(opt.value)}
                  aria-label={opt.label}
                  title={opt.label}
                />
              ))}
            </div>
          </div>

          <div className="event-modal-actions">
            {isEditing && onDelete && (
              <button
                type="button"
                className="btn-delete"
                onClick={handleDelete}
                disabled={isSubmitting}
              >
                Delete
              </button>
            )}
            <div className="action-spacer" />
            <button
              type="button"
              className="btn-cancel"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-save"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
