import { useState, useRef, useEffect } from 'react'
import { parseEventRequest } from './claudeApi.js'

const App = () => {
  const [events, setEvents] = useState([
    {
      id: 1,
      title: 'Sample Meeting',
      start: new Date(new Date().setHours(10, 0, 0, 0)),
      end: new Date(new Date().setHours(11, 0, 0, 0)),
      color: '#3b82f6'
    }
  ])

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
      text: "Hello! I'm here to help with your calendar. Try asking me to schedule a meeting or appointment!",
      sender: 'bot',
      timestamp: new Date(),
    },
  ])

  const [inputMessage, setInputMessage] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)

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
  const createEvent = (title) => {
    if (!title.trim() || !newEventData) return

    const newEvent = {
      id: Date.now(),
      title: title.trim(),
      start: newEventData.start,
      end: newEventData.end,
      color: '#10b981'
    }

    setEvents(prev => [...prev, newEvent])
    setIsCreatingEvent(false)
    setNewEventData(null)
  }

  // Delete event
  const deleteEvent = (eventId) => {
    setEvents(prev => prev.filter(e => e.id !== eventId))
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
      setEvents(prev => prev.map(e => 
        e.id === event.id ? { ...e, title: newTitle.trim() } : e
      ))
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
        
        // Update event
        setEvents(prev => prev.map(ev => 
          ev.id === dragState.event.id 
            ? { ...ev, start: roundedStart, end: roundedEnd }
            : ev
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
        
        setEvents(prev => prev.map(ev => 
          ev.id === dragState.event.id 
            ? { ...ev, start: roundedStart, end: newEnd }
            : ev
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
        
        setEvents(prev => prev.map(ev => 
          ev.id === dragState.event.id 
            ? { ...ev, end: roundedEnd }
            : ev
        ))
      }
    }

    const handleMouseUp = () => {
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
  const addEventToCalendar = (eventData) => {
    if (!eventData) return

    const newEvent = {
      id: Date.now(),
      title: eventData.title,
      start: new Date(eventData.start),
      end: new Date(eventData.end),
      color: '#f59e0b'
    }
    
    setEvents(prev => [...prev, newEvent])
    
    const confirmationMessage = {
      id: (Date.now() + 1).toString(),
      text: `✅ Event added: "${eventData.title}" on ${new Date(eventData.start).toLocaleDateString()} at ${new Date(eventData.start).toLocaleTimeString()}`,
      sender: 'bot',
      timestamp: new Date(),
    }
    setMessages(currentMessages => [...currentMessages, confirmationMessage])
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
      const parsedResult = await parseEventRequest(messageText)
      
      const botMessage = {
        id: (Date.now() + 1).toString(),
        text: parsedResult.response,
        sender: 'bot',
        timestamp: new Date(),
        pendingEvent: parsedResult.intent === 'create_event' ? parsedResult.event : undefined,
      }

      setMessages(currentMessages => [...currentMessages, botMessage])

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
    <div style={{ display: 'flex', height: '100vh', fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
      {/* Calendar Section */}
      <div style={{ flex: 1, padding: '20px', paddingRight: '10px', backgroundColor: '#f9fafb' }}>
        {/* Calendar Header */}
        <div style={{ 
          marginBottom: '20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div style={{ 
            fontSize: '28px', 
            fontWeight: 700, 
            color: '#1f2937',
            letterSpacing: '-0.02em'
          }}>
            {currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </div>
          
          {/* Navigation Controls */}
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button
              onClick={goToToday}
              style={{
                padding: '8px 16px',
                backgroundColor: '#6b7280',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                fontSize: '14px',
                fontWeight: '500',
                cursor: 'pointer'
              }}
            >
              Today
            </button>
            <button
              onClick={() => navigateWeek(-1)}
              style={{
                padding: '8px 12px',
                backgroundColor: '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                fontSize: '14px',
                fontWeight: '500',
                cursor: 'pointer'
              }}
            >
              ‹
            </button>
            <button
              onClick={() => navigateWeek(1)}
              style={{
                padding: '8px 12px',
                backgroundColor: '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                fontSize: '14px',
                fontWeight: '500',
                cursor: 'pointer'
              }}
            >
              ›
            </button>
          </div>
        </div>
        
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
                        // Only add hover effect if no events overlap this slot
                        if (dayEvents.length === 0 && !dragState) {
                          e.target.style.backgroundColor = isToday ? '#e0f2fe' : '#f3f4f6'
                        }
                      }}
                      onMouseLeave={(e) => {
                        // Always reset to original background
                        if (!dragState) {
                          e.target.style.backgroundColor = isToday ? '#f8fafc' : 'white'
                        }
                      }}
                    >
                      {/* Empty slot - events are rendered separately below */}
                    </div>
                  )
                })}
              </div>
            ))}
            
            {/* Events Layer - Rendered separately to avoid interference */}
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
                            // Show delete button on event hover
                            const deleteBtn = e.currentTarget.querySelector('.delete-button')
                            if (deleteBtn) deleteBtn.style.opacity = '1'
                          }}
                          onMouseLeave={(e) => {
                            // Hide delete button when leaving event
                            const deleteBtn = e.currentTarget.querySelector('.delete-button')
                            if (deleteBtn) deleteBtn.style.opacity = '0'
                          }}
                        >
                          {/* Drag area - covers only the bottom part of the event, completely avoiding title */}
                          <div
                            onMouseDown={(e) => handleEventMouseDown(e, event)}
                            style={{
                              position: 'absolute',
                              top: '40px', // Start much lower to avoid title completely
                              left: '4px',
                              right: '4px',
                              bottom: '4px',
                              cursor: 'grab',
                              zIndex: 1,
                              backgroundColor: 'transparent' // Clean - no testing background
                            }}
                          />
                          
                          {editingEventId === event.id ? (
                            // Editing mode - show input
                            <input
                              type="text"
                              value={editingTitle}
                              onChange={(e) => setEditingTitle(e.target.value)}
                              onBlur={() => {
                                // Save the edit
                                if (editingTitle.trim()) {
                                  setEvents(prev => prev.map(e => 
                                    e.id === event.id ? { ...e, title: editingTitle.trim() } : e
                                  ))
                                }
                                setEditingEventId(null)
                                setEditingTitle('')
                              }}
                              onKeyPress={(e) => {
                                if (e.key === 'Enter') {
                                  // Save on Enter
                                  if (editingTitle.trim()) {
                                    setEvents(prev => prev.map(ev => 
                                      ev.id === event.id ? { ...ev, title: editingTitle.trim() } : ev
                                    ))
                                  }
                                  setEditingEventId(null)
                                  setEditingTitle('')
                                }
                                if (e.key === 'Escape') {
                                  // Cancel on Escape
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
                            // Display mode - show title
                            <div 
                              className="event-title"
                              onClick={() => {
                                console.log('Title clicked for event:', event.id)
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
                          
                          {/* Top resize handle - TEMPORARILY REMOVED FOR TESTING */}
                          {/* 
                          <div
                            onMouseDown={(e) => handleTopResizeMouseDown(e, event)}
                            style={{
                              position: 'absolute',
                              top: '0',
                              left: '0',
                              right: '0',
                              height: '4px',
                              cursor: 'ns-resize',
                              backgroundColor: 'transparent',
                              zIndex: 15
                            }}
                          />
                          */}
                          
                          {/* Bottom resize handle */}
                          <div
                            onMouseDown={(e) => handleBottomResizeMouseDown(e, event)}
                            style={{
                              position: 'absolute',
                              bottom: '0',
                              left: '0',
                              right: '0',
                              height: '4px',
                              cursor: 'ns-resize',
                              backgroundColor: 'transparent',
                              zIndex: 15
                            }}
                          />
                          
                          {/* Delete button */}
                          <div
                            className="delete-button"
                            onClick={() => {
                              console.log('Delete button clicked for event:', event.id)
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
                              opacity: 0, // Hidden by default
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

        {/* Event Creation Modal */}
        {isCreatingEvent && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
          }}>
            <div style={{
              backgroundColor: 'white',
              borderRadius: '12px',
              padding: '24px',
              width: '400px',
              boxShadow: '0 10px 25px rgba(0, 0, 0, 0.2)'
            }}>
              <h3 style={{ margin: '0 0 16px 0', fontSize: '18px', fontWeight: '600' }}>
                Create New Event
              </h3>
              <p style={{ margin: '0 0 16px 0', color: '#6b7280', fontSize: '14px' }}>
                {newEventData && `${newEventData.start.toLocaleDateString()} at ${newEventData.start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
              </p>
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
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button
                  onClick={() => {
                    setIsCreatingEvent(false)
                    setNewEventData(null)
                  }}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: '#6b7280',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '14px',
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    const input = document.querySelector('input[placeholder="Event title"]')
                    createEvent(input.value)
                  }}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: '#3b82f6',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '14px',
                    cursor: 'pointer'
                  }}
                >
                  Create
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Chat Section */}
      <div style={{ 
        width: '350px', 
        borderLeft: '1px solid #e5e7eb', 
        display: 'flex', 
        flexDirection: 'column',
        backgroundColor: '#ffffff'
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
            Tilly
          </h2>
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
              placeholder="Ask me to schedule something..."
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
  )
}

export default App

