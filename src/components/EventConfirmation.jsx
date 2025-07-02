import React, { useState } from 'react';
import './EventConfirmation.css';

const EventConfirmation = ({ 
  responseData, 
  onConfirm, 
  onCancel,
  isLoading = false 
}) => {
  const [selectedActions, setSelectedActions] = useState([]);

  if (!responseData || typeof responseData === 'string') {
    return null;
  }

  const formatDateTime = (dateTimeStr) => {
    const date = new Date(dateTimeStr);
    return {
      date: date.toLocaleDateString('en-US', { 
        weekday: 'short', 
        month: 'short', 
        day: 'numeric' 
      }),
      time: date.toLocaleTimeString('en-US', { 
        hour: 'numeric', 
        minute: '2-digit',
        hour12: true 
      })
    };
  };

  const renderEventSuggestion = (eventData) => {
    const start = formatDateTime(eventData.start);
    const end = formatDateTime(eventData.end);
    
    return (
      <div className="event-suggestion">
        <div className="event-header">
          <h4>📅 Add New Event</h4>
        </div>
        <div className="event-details">
          <div className="event-title">{eventData.title}</div>
          <div className="event-time">
            {start.date} • {start.time} - {end.time}
          </div>
        </div>
      </div>
    );
  };

  const renderEventRearrangement = (rearrangements) => {
    return (
      <div className="event-rearrangement">
        <div className="event-header">
          <h4>🔄 Reschedule Events</h4>
        </div>
        {rearrangements.map((change, index) => {
          const newStart = formatDateTime(change.newStart);
          const newEnd = formatDateTime(change.newEnd);
          
          return (
            <div key={index} className="rearrangement-item">
              <div className="event-title">{change.currentTitle}</div>
              <div className="time-change">
                <span className="new-time">
                  {newStart.date} • {newStart.time} - {newEnd.time}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderMultipleActions = (actions) => {
    return (
      <div className="multiple-actions">
        <div className="event-header">
          <h4>📋 Schedule Changes</h4>
        </div>
        {actions.map((action, index) => (
          <div key={index} className="action-item">
            {action.type === 'event_suggestion' && renderEventSuggestion(action.eventData)}
            {action.type === 'event_rearrangement' && renderEventRearrangement(action.rearrangements)}
          </div>
        ))}
      </div>
    );
  };

  const handleConfirm = () => {
    if (responseData.type === 'multiple_actions') {
      onConfirm(responseData.actions);
    } else if (responseData.type === 'event_suggestion') {
      onConfirm([{ type: 'event_suggestion', eventData: responseData.eventData }]);
    } else if (responseData.type === 'event_rearrangement') {
      onConfirm([{ type: 'event_rearrangement', rearrangements: responseData.rearrangements }]);
    }
  };

  return (
    <div className="event-confirmation">
      <div className="confirmation-content">
        {responseData.message && (
          <p className="confirmation-message">{responseData.message}</p>
        )}
        
        <div className="confirmation-details">
          {responseData.type === 'event_suggestion' && renderEventSuggestion(responseData.eventData)}
          {responseData.type === 'event_rearrangement' && renderEventRearrangement(responseData.rearrangements)}
          {responseData.type === 'multiple_actions' && renderMultipleActions(responseData.actions)}
        </div>
        
        <div className="confirmation-actions">
          <button 
            className="cancel-btn" 
            onClick={onCancel}
            disabled={isLoading}
          >
            Cancel
          </button>
          <button 
            className="confirm-btn" 
            onClick={handleConfirm}
            disabled={isLoading}
          >
            {isLoading ? 'Processing...' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default EventConfirmation;