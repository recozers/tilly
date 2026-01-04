import { useState, useEffect } from 'react';
import type { TypedEvent, CreateEventDto, UpdateEventDto } from '@tilly/shared';
import './EventModal.css';

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
  event?: TypedEvent | null;
  initialDate?: Date | null;
  onSave: (data: CreateEventDto | UpdateEventDto) => Promise<void>;
  onDelete?: (id: number) => Promise<void>;
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

export function EventModal({
  event,
  initialDate,
  onSave,
  onDelete,
  onClose,
}: EventModalProps): JSX.Element {
  const isEditing = !!event;

  const getDefaultStart = () => {
    if (event) return new Date(event.start);
    if (initialDate) return initialDate;
    const now = new Date();
    now.setMinutes(0, 0, 0);
    now.setHours(now.getHours() + 1);
    return now;
  };

  const getDefaultEnd = () => {
    if (event) return new Date(event.end);
    const start = getDefaultStart();
    const end = new Date(start);
    end.setHours(end.getHours() + 1);
    return end;
  };

  const [title, setTitle] = useState(event?.title || '');
  const [start, setStart] = useState(formatDateTimeLocal(getDefaultStart()));
  const [end, setEnd] = useState(formatDateTimeLocal(getDefaultEnd()));
  const [color, setColor] = useState(event?.color || '#4A7C2A');
  const [description, setDescription] = useState(event?.description || '');
  const [location, setLocation] = useState(event?.location || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

    const startDate = new Date(start);
    const endDate = new Date(end);

    if (endDate <= startDate) {
      setError('End time must be after start time');
      return;
    }

    setIsSubmitting(true);

    try {
      const data = {
        title: title.trim(),
        start: startDate.toISOString(),
        end: endDate.toISOString(),
        color,
        description: description.trim() || undefined,
        location: location.trim() || undefined,
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
      await onDelete(event.id);
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
