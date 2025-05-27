import { useState, useRef, useEffect } from 'react'
import { parseEventRequest } from './claudeApi.js'
import * as eventsApi from './eventsApi.js'
import './App.css'

const App = () => {
  const [events, setEvents] = useState([])
  const eventsRef = useRef([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)

  const [currentView, setCurrentView] = useState('timeGridWeek')
  const [currentDate, setCurrentDate] = useState(new Date())
  const [isCreatingEvent, setIsCreatingEvent] = useState(false)
  const [newEventData, setNewEventData] = useState(null)
  const [dragState, setDragState] = useState(null)
  const [editingEventId, setEditingEventId] = useState(null)
  const [editingTitle, setEditingTitle] = useState('')

  // Chat state
  const [messages, setMessages] = useState([
    {
      id: '1',
      text: "Hi! I'm your calendar assistant with full access to your events. Ask me about your schedule, availability, upcoming meetings, or anything about your calendar!",
      sender: 'bot',
      timestamp: new Date(),
    },
  ])

  const [inputMessage, setInputMessage] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)

  // Load events from database on component mount
  useEffect(() => {
    loadEvents()
  }, [])

  // Keep eventsRef in sync with events state
  useEffect(() => {
    eventsRef.current = events
  }, [events])

  const loadEvents = async () => {
    try {
      setIsLoading(true)
      setError(null)
      const eventsData = await eventsApi.fetchEvents()
      setEvents(eventsData)
    } catch (err) {
      console.error('Failed to load events:', err)
      setError('Failed to load events. Please check if the server is running.')
    } finally {
      setIsLoading(false)
    }
  }

  // Generate time slots for the day (6 AM to 10 PM)
  const generateTimeSlots = () => {
    const slots = []
    for (let hour = 6; hour <= 22; hour++) {
      slots.push({
        time: `${hour.toString().padStart(2, '0')}:00`,
        label: formatTimeLabel(hour, 0)
      })
      if (hour < 22) {
        slots.push({
          time: `${hour.toString().padStart(2, '0')}:30`,
          label: formatTimeLabel(hour, 30)
        })
      }
    }
    return slots
  }

  const formatTimeLabel = (hour, minute) => {
    const ampm = hour >= 12 ? 'PM' : 'AM'
    const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour
    return `${displayHour}:${minute.toString().padStart(2, '0')} ${ampm}`
  }

  // Get week dates
  const getWeekDates = (date = currentDate) => {
    const startOfWeek = new Date(date)
    const day = startOfWeek.getDay()
    startOfWeek.setDate(startOfWeek.getDate() - day)
    
    const weekDates = []
    for (let i = 0; i < 7; i++) {
      const date = new Date(startOfWeek)
      date.setDate(startOfWeek.getDate() + i)
      weekDates.push(date)
    }
    return weekDates
  }

  // Get events for a specific date and time
  const getEventsForDateTime = (date, timeSlot) => {
    const [hours, minutes] = timeSlot.split(':').map(Number)
    const slotStart = new Date(date)
    slotStart.setHours(hours, minutes, 0, 0)
    const slotEnd = new Date(slotStart)
    slotEnd.setMinutes(slotEnd.getMinutes() + 30)

    return events.filter(event => {
      const eventStart = new Date(event.start)
      const eventEnd = new Date(event.end)
      return eventStart < slotEnd && eventEnd > slotStart
    })
  }

  // Get events that START in a specific time slot (for rendering)
  const getEventsStartingInSlot = (date, timeSlot) => {
    const [hours, minutes] = timeSlot.split(':').map(Number)
    const slotStart = new Date(date)
    slotStart.setHours(hours, minutes, 0, 0)
    const slotEnd = new Date(slotStart)
    slotEnd.setMinutes(slotEnd.getMinutes() + 30)

    return events.filter(event => {
      const eventStart = new Date(event.start)
      return eventStart >= slotStart && eventStart < slotEnd
    })
  }

  // Get the actual height of a time slot from the DOM
  const getActualSlotHeight = () => {
    const firstSlot = document.querySelector('.calendar-time-grid > div')
    if (firstSlot) {
      return firstSlot.getBoundingClientRect().height
    }
    return 61 // fallback
  }

  // Calculate event position and height
  const calculateEventDimensions = (event, date) => {
    const eventStart = new Date(event.start)
    const eventEnd = new Date(event.end)
    
    // Check if this event is on the given date
    if (eventStart.toDateString() !== date.toDateString()) {
      return null
    }

    // Calculate minutes from 6 AM (start of calendar)
    const startMinutes = eventStart.getHours() * 60 + eventStart.getMinutes()
    const endMinutes = eventEnd.getHours() * 60 + eventEnd.getMinutes()
    const calendarStartMinutes = 6 * 60 // 6 AM

    // Get the actual slot height from the DOM
    const slotHeight = getActualSlotHeight()
    const topOffset = ((startMinutes - calendarStartMinutes) / 30) * slotHeight
    const duration = endMinutes - startMinutes
    const height = Math.max(30, (duration / 30) * slotHeight)

    return { top: topOffset, height }
  }

  // Convert pixel position to time and date
  const pixelToDateTime = (clientX, clientY) => {
    const calendarGrid = document.querySelector('.calendar-time-grid')
    if (!calendarGrid) return null

    const rect = calendarGrid.getBoundingClientRect()
    const relativeY = Math.max(0, clientY - rect.top)
    const relativeX = Math.max(0, clientX - rect.left - 80) // Subtract time column width

    // Get the actual slot height from the DOM
    const slotHeight = getActualSlotHeight()
    const minutesFromStart = (relativeY / slotHeight) * 30 + (6 * 60) // Start at 6 AM
    const totalMinutes = Math.max(6 * 60, Math.min(22 * 60, minutesFromStart))
    
    // Calculate day
    const columnWidth = (rect.width - 80) / 7
    const dayIndex = Math.max(0, Math.min(6, Math.floor(relativeX / columnWidth)))
    const weekDates = getWeekDates()
    const targetDate = new Date(weekDates[dayIndex])
    
    // Set the time
    const hours = Math.floor(totalMinutes / 60)
    const minutes = totalMinutes % 60
    targetDate.setHours(hours, minutes, 0, 0)
    
    return targetDate
  }

  // Round time to nearest 15 minutes
  const roundToQuarterHour = (date) => {
    const rounded = new Date(date)
    const minutes = rounded.getMinutes()
    const roundedMinutes = Math.round(minutes / 15) * 15
    rounded.setMinutes(roundedMinutes, 0, 0)
    return rounded
  }

  // Handle slot click for creating events
  const handleSlotClick = (date, timeSlot) => {
    if (dragState) return
    
    const [hours, minutes] = timeSlot.split(':').map(Number)
    const startTime = new Date(date)
    startTime.setHours(hours, minutes, 0, 0)
    const endTime = new Date(startTime)
    endTime.setHours(hours + 1, minutes, 0, 0)

    setNewEventData({ start: startTime, end: endTime })
    setIsCreatingEvent(true)
  }

  // Create new event
  const createEvent = async (title) => {
    if (!title.trim() || !newEventData) return

    try {
      const newEvent = await eventsApi.createEvent({
        title: title.trim(),
        start: newEventData.start,
        end: newEventData.end,
        color: '#10b981'
      })

      setEvents(prev => [...prev, newEvent])
      setIsCreatingEvent(false)
      setNewEventData(null)
    } catch (error) {
      console.error('Failed to create event:', error)
      setError('Failed to create event. Please try again.')
    }
  }

  // Delete event
  const deleteEvent = async (eventId) => {
    try {
      await eventsApi.deleteEvent(eventId)
      setEvents(prev => prev.filter(e => e.id !== eventId))
    } catch (error) {
      console.error('Failed to delete event:', error)
      setError('Failed to delete event. Please try again.')
    }
  }

  // Update event (for drag and drop, resize, and title editing)
  const updateEventInDatabase = async (eventId, updatedData) => {
    try {
      const updatedEvent = await eventsApi.updateEvent(eventId, updatedData)
      // Don't update state here - let the caller handle it to avoid conflicts
      return updatedEvent
    } catch (error) {
      console.error('Failed to update event:', error)
      setError('Failed to update event. Please try again.')
      throw error
    }
  }

  // Start dragging an event
  const handleEventMouseDown = (e, event) => {
    e.preventDefault()
    e.stopPropagation()
    
    const rect = e.currentTarget.getBoundingClientRect()
    const offsetY = e.clientY - rect.top
    
    setDragState({
      type: 'move',
      event,
      startX: e.clientX,
      startY: e.clientY,
      offsetY,
      originalStart: new Date(event.start),
      originalEnd: new Date(event.end)
    })
  }

  // Handle title click to edit event
  const handleTitleClick = (e, event) => {
    e.preventDefault()
    e.stopPropagation()
    
    const newTitle = window.prompt('Edit event title:', event.title)
    if (newTitle && newTitle.trim()) {
      updateEventInDatabase(event.id, { title: newTitle.trim() })
        .then(updatedEvent => {
          setEvents(prev => prev.map(e => e.id === event.id ? updatedEvent : e))
        })
        .catch(error => {
          console.error('Failed to update title:', error)
        })
    }
  }

  // Start resizing from top
  const handleTopResizeMouseDown = (e, event) => {
    e.preventDefault()
    e.stopPropagation()
    
    setDragState({
      type: 'resize-top',
      event,
      startY: e.clientY,
      originalStart: new Date(event.start),
      originalEnd: new Date(event.end)
    })
  }

  // Start resizing from bottom
  const handleBottomResizeMouseDown = (e, event) => {
    e.preventDefault()
    e.stopPropagation()
    
    setDragState({
      type: 'resize-bottom',
      event,
      startY: e.clientY,
      originalStart: new Date(event.start),
      originalEnd: new Date(event.end)
    })
  }

  // Handle mouse move for all drag operations
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!dragState) return

      if (dragState.type === 'move') {
        // Calculate time difference based on Y movement
        const deltaY = e.clientY - dragState.startY
        const slotHeight = getActualSlotHeight() // Use dynamic measurement
        const deltaMinutes = (deltaY / slotHeight) * 30 // Each slot = 30 minutes
        
        // Calculate new start time
        const newStart = new Date(dragState.originalStart)
        newStart.setMinutes(newStart.getMinutes() + deltaMinutes)
        
        // Calculate duration and new end time
        const duration = dragState.originalEnd - dragState.originalStart
        const newEnd = new Date(newStart.getTime() + duration)
        
        // Check for day change based on X movement
        const deltaX = e.clientX - dragState.startX
        const calendarGrid = document.querySelector('.calendar-time-grid')
        if (calendarGrid) {
          const rect = calendarGrid.getBoundingClientRect()
          const columnWidth = (rect.width - 80) / 7
          const dayOffset = Math.round(deltaX / columnWidth)
          
          if (dayOffset !== 0) {
            newStart.setDate(newStart.getDate() + dayOffset)
            newEnd.setDate(newEnd.getDate() + dayOffset)
          }
        }
        
        // Round to nearest 15 minutes
        const roundedStart = roundToQuarterHour(newStart)
        const roundedEnd = new Date(roundedStart.getTime() + duration)
        
        // Optimistic update - only update local state, not database
        setEvents(prev => prev.map(e => 
          e.id === dragState.event.id 
            ? { ...e, start: roundedStart, end: roundedEnd }
            : e
        ))
      }
      
      else if (dragState.type === 'resize-top') {
        const deltaY = e.clientY - dragState.startY
        const slotHeight = getActualSlotHeight() // Use dynamic measurement
        const deltaMinutes = (deltaY / slotHeight) * 30
        
        const newStart = new Date(dragState.originalStart)
        newStart.setMinutes(newStart.getMinutes() + deltaMinutes)
        
        // Ensure minimum 15 minutes duration
        const minEnd = new Date(newStart.getTime() + 15 * 60 * 1000)
        const newEnd = dragState.originalEnd > minEnd ? dragState.originalEnd : minEnd
        
        const roundedStart = roundToQuarterHour(newStart)
        
        // Optimistic update - only update local state, not database
        setEvents(prev => prev.map(e => 
          e.id === dragState.event.id 
            ? { ...e, start: roundedStart, end: newEnd }
            : e
        ))
      }
      
      else if (dragState.type === 'resize-bottom') {
        const deltaY = e.clientY - dragState.startY
        const slotHeight = getActualSlotHeight() // Use dynamic measurement
        const deltaMinutes = (deltaY / slotHeight) * 30
        
        const newEnd = new Date(dragState.originalEnd)
        newEnd.setMinutes(newEnd.getMinutes() + deltaMinutes)
        
        // Ensure minimum 15 minutes duration
        const minEnd = new Date(dragState.originalStart.getTime() + 15 * 60 * 1000)
        const finalEnd = newEnd > minEnd ? newEnd : minEnd
        
        const roundedEnd = roundToQuarterHour(finalEnd)
        
        // Optimistic update - only update local state, not database
        setEvents(prev => prev.map(e => 
          e.id === dragState.event.id 
            ? { ...e, end: roundedEnd }
            : e
        ))
      }
    }

    const handleMouseUp = async () => {
      if (dragState) {
        // Get the current event state from the events array using ref
        const currentEvent = eventsRef.current.find(e => e.id === dragState.event.id)
        if (currentEvent) {
          try {
            // Save to database
            const updatedEvent = await updateEventInDatabase(dragState.event.id, {
              start: currentEvent.start,
              end: currentEvent.end
            })
            // Update state with the response from database to ensure consistency
            setEvents(prev => prev.map(e => 
              e.id === dragState.event.id ? updatedEvent : e
            ))
          } catch (error) {
            console.error('Failed to save event:', error)
            // If save fails, revert to original state
            setEvents(prev => prev.map(e => 
              e.id === dragState.event.id 
                ? { ...e, start: dragState.originalStart, end: dragState.originalEnd }
                : e
            ))
          }
        }
      }
      setDragState(null)
    }

    if (dragState) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = dragState.type === 'move' ? 'grabbing' : 'ns-resize'
      document.body.style.userSelect = 'none'
      
      return () => {
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }
    }
  }, [dragState])

  // Navigation
  const navigateWeek = (direction) => {
    const newDate = new Date(currentDate)
    newDate.setDate(newDate.getDate() + (direction * 7))
    setCurrentDate(newDate)
  }

  const goToToday = () => {
    setCurrentDate(new Date())
  }

  // Chat functions
  const addEventToCalendar = async (eventData) => {
    if (!eventData) return

    try {
      const newEvent = await eventsApi.createEvent({
        title: eventData.title,
        start: new Date(eventData.start),
        end: new Date(eventData.end),
        color: '#f59e0b'
      })
      
      setEvents(prev => [...prev, newEvent])
      
      const confirmationMessage = {
        id: (Date.now() + 1).toString(),
        text: `✅ Event added: "${eventData.title}" on ${new Date(eventData.start).toLocaleDateString()} at ${new Date(eventData.start).toLocaleTimeString()}`,
        sender: 'bot',
        timestamp: new Date(),
      }
      setMessages(currentMessages => [...currentMessages, confirmationMessage])
    } catch (error) {
      console.error('Failed to add event to calendar:', error)
      const errorMessage = {
        id: (Date.now() + 1).toString(),
        text: `❌ Failed to add event. Please try again.`,
        sender: 'bot',
        timestamp: new Date(),
      }
      setMessages(currentMessages => [...currentMessages, errorMessage])
    }
  }

  const rearrangeEvents = async (rearrangements) => {
    if (!rearrangements || rearrangements.length === 0) return

    try {
      // Update each event
      const updatePromises = rearrangements.map(async (rearrangement) => {
        return await updateEventInDatabase(rearrangement.eventId, {
          start: new Date(rearrangement.newStart),
          end: new Date(rearrangement.newEnd)
        })
      })

      const updatedEvents = await Promise.all(updatePromises)
      
      // Update local state with all the updated events
      setEvents(prev => {
        return prev.map(event => {
          const updatedEvent = updatedEvents.find(updated => updated.id === event.id)
          return updatedEvent || event
        })
      })
      
      const confirmationMessage = {
        id: (Date.now() + 1).toString(),
        text: `✅ Events rearranged successfully! ${rearrangements.map(r => `"${r.currentTitle}" moved to ${new Date(r.newStart).toLocaleTimeString()}`).join(', ')}`,
        sender: 'bot',
        timestamp: new Date(),
      }
      setMessages(currentMessages => [...currentMessages, confirmationMessage])
    } catch (error) {
      console.error('Failed to rearrange events:', error)
      const errorMessage = {
        id: (Date.now() + 1).toString(),
        text: `❌ Failed to rearrange events. Please try again.`,
        sender: 'bot',
        timestamp: new Date(),
      }
      setMessages(currentMessages => [...currentMessages, errorMessage])
    }
  }

  const handleSendMessage = async () => {
    if (inputMessage.trim() === '' || isProcessing) return

    setIsProcessing(true)

    const userMessage = {
      id: Date.now().toString(),
      text: inputMessage,
      sender: 'user',
      timestamp: new Date(),
    }

    setMessages(currentMessages => [...currentMessages, userMessage])
    const messageText = inputMessage
    setInputMessage('')

    try {
      // Get current messages for context (exclude the user message we just added to avoid duplication)
      const chatHistory = messages.filter(msg => 
        !msg.pendingEvent && !msg.pendingRearrangements // Exclude action prompts
      ).map(msg => ({
        text: msg.text,
        sender: msg.sender,
        timestamp: msg.timestamp
      }))

      // Use the new AI calendar query endpoint with chat history
      const response = await fetch('/api/calendar/query', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          query: messageText,
          chatHistory: chatHistory
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to get AI response')
      }

      const data = await response.json()
      
      // Check if the response is a structured event suggestion or rearrangement
      if (typeof data.response === 'object' && (data.response.type === 'event_suggestion' || data.response.type === 'event_rearrangement')) {
        const botMessage = {
          id: (Date.now() + 1).toString(),
          text: data.response.message,
          sender: 'bot',
          timestamp: new Date(),
          pendingEvent: data.response.type === 'event_suggestion' ? data.response.eventData : null,
          pendingRearrangements: data.response.type === 'event_rearrangement' ? data.response.rearrangements : null
        }
        setMessages(currentMessages => [...currentMessages, botMessage])
      } else {
        // Regular text response
        const botMessage = {
          id: (Date.now() + 1).toString(),
          text: data.response,
          sender: 'bot',
          timestamp: new Date(),
        }
        setMessages(currentMessages => [...currentMessages, botMessage])
      }

    } catch (error) {
      console.error('Error processing message:', error)
      const errorMessage = {
        id: (Date.now() + 1).toString(),
        text: "Sorry, I'm having trouble processing your request. Please try again.",
        sender: 'bot',
        timestamp: new Date(),
      }
      setMessages(currentMessages => [...currentMessages, errorMessage])
    } finally {
      setIsProcessing(false)
    }
  }

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !isProcessing) {
      handleSendMessage()
    }
  }

  const timeSlots = generateTimeSlots()
  const weekDates = getWeekDates()
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  return (
    <div className="app">
      <div className="app-layout">
        <div className="calendar-section">
          <div className="calendar-header">
            <h1>Tilly Calendar</h1>
            <div className="calendar-controls">
              <button 
                onClick={goToToday}
                className="today-btn"
              >
                Today
              </button>
              <button
                onClick={() => navigateWeek(-1)}
                className="nav-btn"
              >
                ‹
              </button>
              <button
                onClick={() => navigateWeek(1)}
                className="nav-btn"
              >
                ›
              </button>
              <button
                onClick={loadEvents}
                disabled={isLoading}
                className="refresh-btn"
              >
                {isLoading ? '⟳' : '↻'}
              </button>
            </div>
          </div>

          {error && (
            <div className="error-message">
              {error}
            </div>
          )}

          <div className="calendar-container">
            {/* Calendar Grid */}
            <div 
              className="calendar-grid"
              style={{ 
                backgroundColor: 'white', 
                borderRadius: '12px', 
                boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
                height: 'calc(100vh - 140px)',
                overflow: 'hidden',
                border: '1px solid #e5e7eb',
                position: 'relative'
              }}
            >
              {/* Week Header */}
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: '80px repeat(7, 1fr)',
                borderBottom: '2px solid #e5e7eb',
                backgroundColor: '#f9fafb'
              }}>
                <div style={{ padding: '12px 8px', fontSize: '12px', fontWeight: '600', color: '#6b7280' }}>
                  Time
                </div>
                {weekDates.map((date, index) => {
                  const isToday = date.toDateString() === new Date().toDateString()
                  return (
                    <div 
                      key={date.toISOString()}
                      style={{ 
                        padding: '12px 8px', 
                        textAlign: 'center',
                        borderLeft: '1px solid #e5e7eb',
                        backgroundColor: isToday ? '#dbeafe' : 'transparent'
                      }}
                    >
                      <div style={{ fontSize: '12px', fontWeight: '600', color: '#6b7280', marginBottom: '2px' }}>
                        {dayNames[index]}
                      </div>
                      <div style={{ 
                        fontSize: '18px', 
                        fontWeight: '700', 
                        color: isToday ? '#3b82f6' : '#1f2937' 
                      }}>
                        {date.getDate()}
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Time Grid */}
              <div 
                className="calendar-time-grid"
                style={{ height: 'calc(100% - 60px)', overflow: 'auto', position: 'relative' }}
              >
                {timeSlots.map((slot, slotIndex) => (
                  <div 
                    key={slot.time}
                    style={{ 
                      display: 'grid', 
                      gridTemplateColumns: '80px repeat(7, 1fr)',
                      minHeight: '60px',
                      borderBottom: slotIndex % 2 === 1 ? '1px solid #e5e7eb' : '1px solid #f3f4f6'
                    }}
                  >
                    {/* Time Label */}
                    <div style={{ 
                      padding: '8px', 
                      fontSize: '12px', 
                      color: '#6b7280',
                      borderRight: '1px solid #e5e7eb',
                      backgroundColor: '#f9fafb',
                      display: 'flex',
                      alignItems: 'flex-start',
                      justifyContent: 'center'
                    }}>
                      {slot.time.endsWith(':00') ? slot.label : ''}
                    </div>

                    {/* Day Columns */}
                    {weekDates.map((date, dayIndex) => {
                      const dayEvents = getEventsForDateTime(date, slot.time)
                      const isToday = date.toDateString() === new Date().toDateString()
                      
                      return (
                        <div 
                          key={`${date.toISOString()}-${slot.time}`}
                          onClick={() => handleSlotClick(date, slot.time)}
                          style={{ 
                            borderLeft: '1px solid #e5e7eb',
                            backgroundColor: isToday ? '#f8fafc' : 'white',
                            cursor: dragState ? 'default' : 'pointer',
                            position: 'relative',
                            minHeight: '60px',
                            padding: '2px'
                          }}
                          onMouseEnter={(e) => {
                            if (dayEvents.length === 0 && !dragState) {
                              e.target.style.backgroundColor = isToday ? '#e0f2fe' : '#f3f4f6'
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (!dragState) {
                              e.target.style.backgroundColor = isToday ? '#f8fafc' : 'white'
                            }
                          }}
                        >
                        </div>
                      )
                    })}
                  </div>
                ))}
                
                {/* Events Layer */}
                <div style={{ 
                  position: 'absolute', 
                  top: 0, 
                  left: '80px', 
                  right: 0, 
                  bottom: 0,
                  pointerEvents: 'none',
                  zIndex: 50
                }}>
                  {weekDates.map((date, dayIndex) => {
                    const dayEvents = events.filter(event => 
                      new Date(event.start).toDateString() === date.toDateString()
                    )
                    
                    return (
                      <div
                        key={`events-${date.toISOString()}`}
                        style={{
                          position: 'absolute',
                          left: `${(dayIndex / 7) * 100}%`,
                          width: `${100 / 7}%`,
                          height: '100%',
                          pointerEvents: 'none'
                        }}
                      >
                        {dayEvents.map(event => {
                          const dimensions = calculateEventDimensions(event, date)
                          if (!dimensions) return null
                          
                          const eventStart = new Date(event.start)
                          const eventEnd = new Date(event.end)
                          const duration = (eventEnd - eventStart) / (1000 * 60)
                          const isBeingDragged = dragState?.event?.id === event.id
                          
                          return (
                            <div
                              key={event.id}
                              data-event-id={event.id}
                              style={{
                                position: 'absolute',
                                top: `${dimensions.top}px`,
                                left: '2px',
                                right: '2px',
                                height: `${dimensions.height}px`,
                                backgroundColor: event.color,
                                color: 'white',
                                borderRadius: '4px',
                                padding: '4px 6px',
                                fontSize: '12px',
                                fontWeight: '500',
                                cursor: 'grab',
                                zIndex: isBeingDragged ? 1000 : 100,
                                overflow: 'hidden',
                                boxShadow: isBeingDragged 
                                  ? '0 8px 25px rgba(0, 0, 0, 0.3)' 
                                  : '0 1px 3px rgba(0, 0, 0, 0.2)',
                                userSelect: 'none',
                                opacity: isBeingDragged ? 0.8 : 1,
                                transform: isBeingDragged ? 'scale(1.02)' : 'scale(1)',
                                transition: isBeingDragged ? 'none' : 'all 0.2s ease',
                                pointerEvents: 'auto'
                              }}
                              onMouseEnter={(e) => {
                                const deleteBtn = e.currentTarget.querySelector('.delete-button')
                                if (deleteBtn) deleteBtn.style.opacity = '1'
                              }}
                              onMouseLeave={(e) => {
                                const deleteBtn = e.currentTarget.querySelector('.delete-button')
                                if (deleteBtn) deleteBtn.style.opacity = '0'
                              }}
                            >
                              {/* Drag area - covers most of the event */}
                              <div
                                onMouseDown={(e) => handleEventMouseDown(e, event)}
                                style={{
                                  position: 'absolute',
                                  top: '20px',
                                  left: '4px',
                                  right: '20px',
                                  bottom: '8px',
                                  cursor: 'grab',
                                  zIndex: 1,
                                  backgroundColor: 'transparent'
                                }}
                              />

                              {/* Top resize handle */}
                              <div
                                onMouseDown={(e) => handleTopResizeMouseDown(e, event)}
                                onMouseEnter={(e) => {
                                  e.target.style.backgroundColor = 'rgba(255, 255, 255, 0.3)'
                                }}
                                onMouseLeave={(e) => {
                                  e.target.style.backgroundColor = 'transparent'
                                }}
                                style={{
                                  position: 'absolute',
                                  top: '0',
                                  left: '0',
                                  right: '0',
                                  height: '4px',
                                  cursor: 'ns-resize',
                                  backgroundColor: 'transparent',
                                  zIndex: 15,
                                  transition: 'background-color 0.2s'
                                }}
                              />
                              
                              {editingEventId === event.id ? (
                                <input
                                  type="text"
                                  value={editingTitle}
                                  onChange={(e) => setEditingTitle(e.target.value)}
                                  onBlur={() => {
                                    if (editingTitle.trim()) {
                                      updateEventInDatabase(event.id, { title: editingTitle.trim() })
                                    }
                                    setEditingEventId(null)
                                    setEditingTitle('')
                                  }}
                                  onKeyPress={(e) => {
                                    if (e.key === 'Enter') {
                                      if (editingTitle.trim()) {
                                        updateEventInDatabase(event.id, { title: editingTitle.trim() })
                                      }
                                      setEditingEventId(null)
                                      setEditingTitle('')
                                    }
                                    if (e.key === 'Escape') {
                                      setEditingEventId(null)
                                      setEditingTitle('')
                                    }
                                  }}
                                  autoFocus
                                  style={{
                                    fontWeight: '600',
                                    fontSize: '12px',
                                    padding: '2px 4px',
                                    border: '1px solid #3b82f6',
                                    borderRadius: '2px',
                                    backgroundColor: 'white',
                                    color: '#1f2937',
                                    outline: 'none',
                                    width: '100%',
                                    zIndex: 100
                                  }}
                                />
                              ) : (
                                <div 
                                  className="event-title"
                                  onClick={() => {
                                    setEditingEventId(event.id)
                                    setEditingTitle(event.title)
                                  }}
                                  style={{ 
                                    fontWeight: '600', 
                                    marginBottom: '2px',
                                    cursor: 'pointer',
                                    padding: '2px 4px',
                                    borderRadius: '2px',
                                    transition: 'background-color 0.2s',
                                    position: 'relative',
                                    zIndex: 100,
                                    pointerEvents: 'auto'
                                  }}
                                  onMouseEnter={(e) => {
                                    e.target.style.backgroundColor = 'rgba(255, 255, 255, 0.2)'
                                  }}
                                  onMouseLeave={(e) => {
                                    e.target.style.backgroundColor = 'transparent'
                                  }}
                                >
                                  {event.title}
                                </div>
                              )}
                              
                              <div style={{ fontSize: '10px', opacity: 0.9, position: 'relative', zIndex: 5 }}>
                                {eventStart.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                {duration >= 60 && ` - ${eventEnd.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
                              </div>

                              {/* Bottom resize handle */}
                              <div
                                onMouseDown={(e) => handleBottomResizeMouseDown(e, event)}
                                onMouseEnter={(e) => {
                                  e.target.style.backgroundColor = 'rgba(255, 255, 255, 0.3)'
                                }}
                                onMouseLeave={(e) => {
                                  e.target.style.backgroundColor = 'transparent'
                                }}
                                style={{
                                  position: 'absolute',
                                  bottom: '0',
                                  left: '0',
                                  right: '0',
                                  height: '6px',
                                  cursor: 'ns-resize',
                                  backgroundColor: 'transparent',
                                  zIndex: 15,
                                  transition: 'background-color 0.2s'
                                }}
                              />
                              
                              {/* Delete button */}
                              <div
                                className="delete-button"
                                onClick={() => {
                                  deleteEvent(event.id)
                                }}
                                style={{
                                  position: 'absolute',
                                  top: '2px',
                                  right: '2px',
                                  width: '16px',
                                  height: '16px',
                                  backgroundColor: 'rgba(220, 38, 38, 0.8)',
                                  borderRadius: '50%',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontSize: '10px',
                                  cursor: 'pointer',
                                  opacity: 0,
                                  transition: 'opacity 0.2s',
                                  zIndex: 20,
                                  pointerEvents: 'auto'
                                }}
                                onMouseEnter={(e) => {
                                  e.target.style.backgroundColor = 'rgba(220, 38, 38, 1)'
                                  e.target.style.opacity = '1'
                                }}
                                onMouseLeave={(e) => {
                                  e.target.style.backgroundColor = 'rgba(220, 38, 38, 0.8)'
                                  e.target.style.opacity = '0'
                                }}
                              >
                                ×
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="ai-section">
          {/* Chat Section */}
          <div style={{ 
            width: '100%', 
            display: 'flex', 
            flexDirection: 'column',
            backgroundColor: '#ffffff',
            height: '100%'
          }}>
            {/* Chat Header */}
            <div style={{ 
              padding: '20px', 
              borderBottom: '1px solid #e5e7eb',
              backgroundColor: '#f9fafb'
            }}>
              <h2 style={{ 
                margin: 0, 
                fontSize: '18px', 
                fontWeight: 600, 
                color: '#1f2937' 
              }}>
                Tilly AI Assistant
              </h2>
              <p style={{ 
                margin: '4px 0 0 0', 
                fontSize: '14px', 
                color: '#6b7280' 
              }}>
                Ask me about your calendar!
              </p>
            </div>
            
            {/* Messages Container */}
            <div style={{ 
              flex: 1, 
              overflowY: 'auto', 
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px'
            }}>
              {messages.map((message) => (
                <div key={message.id}>
                  <div
                    style={{
                      padding: '12px',
                      borderRadius: '12px',
                      maxWidth: '85%',
                      wordWrap: 'break-word',
                      marginLeft: message.sender === 'user' ? 'auto' : '0',
                      marginRight: message.sender === 'user' ? '0' : 'auto',
                      backgroundColor: message.sender === 'user' ? '#3b82f6' : '#f3f4f6',
                      color: message.sender === 'user' ? 'white' : '#1f2937',
                      fontSize: '14px',
                      lineHeight: '1.4'
                    }}
                  >
                    {message.text}
                  </div>
                  
                  {/* Event confirmation buttons */}
                  {message.pendingEvent && (
                    <div style={{ 
                      marginTop: '8px', 
                      padding: '12px', 
                      backgroundColor: '#f0f9ff',
                      border: '1px solid #e0f2fe',
                      borderRadius: '8px',
                      fontSize: '13px'
                    }}>
                      <div style={{ marginBottom: '8px', fontWeight: 500 }}>
                        📅 {message.pendingEvent.title}
                      </div>
                      <div style={{ marginBottom: '8px', color: '#6b7280' }}>
                        {new Date(message.pendingEvent.start).toLocaleDateString()} {new Date(message.pendingEvent.start).toLocaleTimeString()} - {new Date(message.pendingEvent.end).toLocaleTimeString()}
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          onClick={() => addEventToCalendar(message.pendingEvent)}
                          style={{
                            padding: '6px 12px',
                            backgroundColor: '#10b981',
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px',
                            fontSize: '12px',
                            cursor: 'pointer',
                            fontWeight: 500
                          }}
                        >
                          Add Event
                        </button>
                        <button
                          onClick={() => {
                            setMessages(currentMessages => 
                              currentMessages.map(msg => 
                                msg.id === message.id 
                                  ? { ...msg, pendingEvent: undefined }
                                  : msg
                              )
                            )
                          }}
                          style={{
                            padding: '6px 12px',
                            backgroundColor: '#6b7280',
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px',
                            fontSize: '12px',
                            cursor: 'pointer',
                            fontWeight: 500
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Event rearrangement buttons */}
                  {message.pendingRearrangements && (
                    <div style={{ 
                      marginTop: '8px', 
                      padding: '12px', 
                      backgroundColor: '#fef3c7',
                      border: '1px solid #f59e0b',
                      borderRadius: '8px',
                      fontSize: '13px'
                    }}>
                      <div style={{ marginBottom: '8px', fontWeight: 500 }}>
                        🔄 Event Rearrangement
                      </div>
                      {message.pendingRearrangements.map((rearrangement, index) => (
                        <div key={index} style={{ marginBottom: '8px', color: '#6b7280' }}>
                          Move "{rearrangement.currentTitle}" to {new Date(rearrangement.newStart).toLocaleDateString()} {new Date(rearrangement.newStart).toLocaleTimeString()} - {new Date(rearrangement.newEnd).toLocaleTimeString()}
                        </div>
                      ))}
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          onClick={() => rearrangeEvents(message.pendingRearrangements)}
                          style={{
                            padding: '6px 12px',
                            backgroundColor: '#f59e0b',
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px',
                            fontSize: '12px',
                            cursor: 'pointer',
                            fontWeight: 500
                          }}
                        >
                          Move Events
                        </button>
                        <button
                          onClick={() => {
                            setMessages(currentMessages => 
                              currentMessages.map(msg => 
                                msg.id === message.id 
                                  ? { ...msg, pendingRearrangements: undefined }
                                  : msg
                              )
                            )
                          }}
                          style={{
                            padding: '6px 12px',
                            backgroundColor: '#6b7280',
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px',
                            fontSize: '12px',
                            cursor: 'pointer',
                            fontWeight: 500
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
              
              {isProcessing && (
                <div style={{
                  padding: '12px',
                  borderRadius: '12px',
                  maxWidth: '85%',
                  backgroundColor: '#f3f4f6',
                  color: '#6b7280',
                  fontSize: '14px',
                  fontStyle: 'italic'
                }}>
                  Thinking...
                </div>
              )}
            </div>
            
            {/* Input Section */}
            <div style={{ 
              padding: '16px', 
              borderTop: '1px solid #e5e7eb',
              backgroundColor: '#f9fafb'
            }}>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Ask about your calendar..."
                  disabled={isProcessing}
                  style={{
                    flex: 1,
                    padding: '10px 12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '8px',
                    fontSize: '14px',
                    outline: 'none',
                    backgroundColor: isProcessing ? '#f3f4f6' : 'white'
                  }}
                />
                <button
                  onClick={handleSendMessage}
                  disabled={isProcessing || inputMessage.trim() === ''}
                  style={{
                    padding: '10px 16px',
                    backgroundColor: isProcessing || inputMessage.trim() === '' ? '#9ca3af' : '#3b82f6',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '14px',
                    cursor: isProcessing || inputMessage.trim() === '' ? 'not-allowed' : 'pointer',
                    fontWeight: 500
                  }}
                >
                  Send
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Event Creation Modal */}
      {isCreatingEvent && (
        <div className="event-creation-modal">
          <div className="event-creation-content">
            <h3>Create New Event</h3>
            <p>{newEventData && `${newEventData.start.toLocaleDateString()} at ${newEventData.start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}</p>
            <input
              type="text"
              placeholder="Event title"
              autoFocus
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  createEvent(e.target.value)
                }
              }}
              style={{
                width: '100%',
                padding: '12px',
                border: '1px solid #d1d5db',
                borderRadius: '8px',
                fontSize: '14px',
                marginBottom: '16px',
                outline: 'none'
              }}
            />
            <div className="event-creation-buttons">
              <button
                onClick={() => {
                  setIsCreatingEvent(false)
                  setNewEventData(null)
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const input = document.querySelector('input[placeholder="Event title"]')
                  createEvent(input.value)
                }}
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App

