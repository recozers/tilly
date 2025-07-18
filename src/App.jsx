import { useState, useRef, useEffect } from 'react'
import * as eventsApi from './eventsApi.js'
import { useAuth } from './contexts/AuthContext'
import { supabase } from './lib/supabase'
import AuthModal from './components/Auth/AuthModal'
import UserProfile from './components/Auth/UserProfile'
import EventConfirmation from './components/EventConfirmation'
import './App.css'
import useEventLayout from './hooks/useEventLayout'

const App = () => {
  const { user, loading: authLoading } = useAuth()
  const [events, setEvents] = useState([])
  const eventsRef = useRef([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)
  
  // Auth state
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [showUserProfile, setShowUserProfile] = useState(false)


  const [currentDate, setCurrentDate] = useState(new Date())
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

  // Import state
  const [isImporting, setIsImporting] = useState(false)
  const [importResult, setImportResult] = useState(null)
  const fileInputRef = useRef(null)
  const [showImportModal, setShowImportModal] = useState(false)
  const [importMethod, setImportMethod] = useState('file')
  const [importUrl, setImportUrl] = useState('')
  const [selectedFile, setSelectedFile] = useState(null)
  const [showDropdown, setShowDropdown] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  
  // Calendar subscription state
  const [calendarSubscriptions, setCalendarSubscriptions] = useState([])
  const [subscribeToCalendar, setSubscribeToCalendar] = useState(false)
  const [subscriptionName, setSubscriptionName] = useState('')
  const [showSubscriptions, setShowSubscriptions] = useState(false)
  
  // Invitation state
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [inviteEventId, setInviteEventId] = useState(null)
  const [inviteEmails, setInviteEmails] = useState([''])
  const [inviteMessage, setInviteMessage] = useState('')
  const [isSendingInvites, setIsSendingInvites] = useState(false)
  const [showEventConfirmation, setShowEventConfirmation] = useState(false)
  const [pendingEventData, setPendingEventData] = useState(null)
  const [showAISection, setShowAISection] = useState(true)

  // Use the event layout hook for proper overlapping
  const eventsWithLayout = useEventLayout(events)

  // Ref for auto-scrolling chat
  const messagesEndRef = useRef(null)
  const userProfileRef = useRef(null)

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Auto-scroll calendar to center on current time
  useEffect(() => {
    const scrollToCurrentTime = () => {
      const timeGrid = document.querySelector('.calendar-time-grid')
      if (timeGrid) {
        const now = new Date()
        const currentMinutes = now.getHours() * 60 + now.getMinutes()
        const slotHeight = 60 // Use consistent value
        const currentTimePosition = (currentMinutes / 30) * slotHeight
        
        // Position the current time at 25% from the top
        const gridHeight = timeGrid.clientHeight
        const scrollPosition = Math.max(0, currentTimePosition - (gridHeight * 0.25))
        
        timeGrid.scrollTop = scrollPosition
      }
    }

    // Delay to ensure DOM is ready
    const timer = setTimeout(scrollToCurrentTime, 100)
    return () => clearTimeout(timer)
  }, []) // Only run on initial mount

  // Load events from database when user is authenticated
  useEffect(() => {
    if (user) {
      loadEvents()
    }
  }, [user])

  // Keep eventsRef in sync with events state
  useEffect(() => {
    eventsRef.current = events
  }, [events])

  const [currentTime, setCurrentTime] = useState(new Date())

  // Update current time every minute
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date())
    }, 60000) // Update every minute

    return () => clearInterval(interval)
  }, [])

  // Handle click outside user profile to close it
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (userProfileRef.current && !userProfileRef.current.contains(event.target)) {
        setShowUserProfile(false)
      }
    }

    if (showUserProfile) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => {
        document.removeEventListener('mousedown', handleClickOutside)
      }
    }
  }, [showUserProfile])

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

  // Generate time slots for the day (all 24 hours)
  const generateTimeSlots = () => {
    const slots = []
    for (let hour = 0; hour < 24; hour++) {
      slots.push({
        time: `${hour.toString().padStart(2, '0')}:00`,
        label: formatTimeLabel(hour, 0)
      })
      if (hour < 23) {
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

  // Calculate overlapping events for a specific date
  const getOverlappingEvents = (targetEvent, allEvents, date) => {
    const targetStart = new Date(targetEvent.start)
    const targetEnd = new Date(targetEvent.end)
    
    return allEvents.filter(event => {
      if (event.id === targetEvent.id) return false
      
      const eventStart = new Date(event.start)
      const eventEnd = new Date(event.end)
      const currentDate = new Date(date)
      currentDate.setHours(0, 0, 0, 0)
      
      // Check if both events are visible on this date
      const targetStartDate = new Date(targetStart)
      targetStartDate.setHours(0, 0, 0, 0)
      const targetEndDate = new Date(targetEnd)
      targetEndDate.setHours(0, 0, 0, 0)
      
      const eventStartDate = new Date(eventStart)
      eventStartDate.setHours(0, 0, 0, 0)
      const eventEndDate = new Date(eventEnd)
      eventEndDate.setHours(0, 0, 0, 0)
      
      // Both events must be visible on this date
      const targetVisible = targetStartDate <= currentDate && targetEndDate >= currentDate
      const eventVisible = eventStartDate <= currentDate && eventEndDate >= currentDate
      
      if (!targetVisible || !eventVisible) return false
      
      // Calculate visible time ranges for this date
      let targetVisibleStart, targetVisibleEnd, eventVisibleStart, eventVisibleEnd
      
      // Target event visible range
      if (targetStartDate.getTime() === currentDate.getTime()) {
        targetVisibleStart = targetStart
      } else {
        targetVisibleStart = new Date(currentDate)
        targetVisibleStart.setHours(0, 0, 0, 0)
      }
      
      if (targetEndDate.getTime() === currentDate.getTime()) {
        targetVisibleEnd = targetEnd
      } else {
        targetVisibleEnd = new Date(currentDate)
        targetVisibleEnd.setHours(23, 59, 59, 999)
      }
      
      // Other event visible range
      if (eventStartDate.getTime() === currentDate.getTime()) {
        eventVisibleStart = eventStart
      } else {
        eventVisibleStart = new Date(currentDate)
        eventVisibleStart.setHours(0, 0, 0, 0)
      }
      
      if (eventEndDate.getTime() === currentDate.getTime()) {
        eventVisibleEnd = eventEnd
      } else {
        eventVisibleEnd = new Date(currentDate)
        eventVisibleEnd.setHours(23, 59, 59, 999)
      }
      
      // Check if the visible time ranges overlap
      return targetVisibleStart < eventVisibleEnd && targetVisibleEnd > eventVisibleStart
    })
  }

  // Calculate event position, height, and width for overlaps
  const calculateEventDimensions = (event, date, allEvents) => {
    const eventStart = new Date(event.start)
    const eventEnd = new Date(event.end)
    const currentDate = new Date(date)
    currentDate.setHours(0, 0, 0, 0)
    
    // Check if this event overlaps with the given date
    const eventStartDate = new Date(eventStart)
    eventStartDate.setHours(0, 0, 0, 0)
    const eventEndDate = new Date(eventEnd)
    eventEndDate.setHours(0, 0, 0, 0)
    
    // If event doesn't overlap with this date, don't show it
    if (currentDate < eventStartDate || currentDate > eventEndDate) {
      return null
    }

    // Calculate the visible portion of the event on this specific date
    let visibleStart, visibleEnd
    
    if (eventStartDate.getTime() === currentDate.getTime()) {
      // Event starts on this date - use actual start time
      visibleStart = eventStart
    } else {
      // Event started on a previous date - start at midnight (calendar start)
      visibleStart = new Date(currentDate)
      visibleStart.setHours(0, 0, 0, 0)
    }
    
    if (eventEndDate.getTime() === currentDate.getTime()) {
      // Event ends on this date - use actual end time
      visibleEnd = eventEnd
    } else {
      // Event continues to next date - end at 11:59 PM (calendar end) 
      visibleEnd = new Date(currentDate)
      visibleEnd.setHours(23, 59, 59, 999)
    }

    // Calculate minutes from midnight (start of calendar)
    const startMinutes = visibleStart.getHours() * 60 + visibleStart.getMinutes()
    const endMinutes = visibleEnd.getHours() * 60 + visibleEnd.getMinutes()
    const calendarStartMinutes = 0 // Midnight

    // Get the actual slot height from the DOM
    const slotHeight = getActualSlotHeight()
    const topOffset = ((startMinutes - calendarStartMinutes) / 30) * slotHeight
    const duration = endMinutes - startMinutes
    const height = Math.max(30, (duration / 30) * slotHeight)

    // Calculate overlap positioning
    const overlappingEvents = getOverlappingEvents(event, allEvents, date)
    const totalOverlapping = overlappingEvents.length + 1 // Including current event
    
    // Sort all overlapping events (including current) by start time, then by ID for consistency
    const allOverlappingEvents = [event, ...overlappingEvents].sort((a, b) => {
      const startDiff = new Date(a.start) - new Date(b.start)
      if (startDiff === 0) {
        return a.id - b.id // Use ID as tiebreaker for consistent ordering
      }
      return startDiff
    })
    
    const eventIndex = allOverlappingEvents.findIndex(e => e.id === event.id)
    
    // Calculate exact width and position for overlapping events
    const exactWidthPercentage = 100 / totalOverlapping
    const exactLeftPercentage = eventIndex * exactWidthPercentage
    
    // Apply minimum width constraint but keep exact positioning
    const widthPercentage = Math.max(20, exactWidthPercentage)
    const leftPercentage = exactLeftPercentage

    return { 
      top: topOffset, 
      height,
      widthPercentage,
      leftPercentage
    }
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
    const minutesFromStart = (relativeY / slotHeight) * 30 // Start at midnight
    const totalMinutes = Math.max(0, Math.min(24 * 60 - 1, minutesFromStart)) // 0 to 23:59
    
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

    // Use EventConfirmation for new events
    setPendingEventData({
      type: 'event_suggestion',
      eventData: {
        title: 'New Event',
        start: startTime.toISOString(),
        end: endTime.toISOString()
      },
      message: 'Create a new event:'
    })
    setShowEventConfirmation(true)
  }

  // Handle event confirmation
  const handleEventConfirm = async (actions) => {
    try {
      for (const action of actions) {
        if (action.type === 'event_suggestion') {
          const newEvent = await eventsApi.createEvent({
            title: action.eventData.title.trim(),
            start: new Date(action.eventData.start),
            end: new Date(action.eventData.end)
            // color will be randomly assigned by the API
          })
          setEvents(prev => [...prev, newEvent])
          setSuccessMessage('Event created successfully!')
        } else if (action.type === 'event_edit') {
          const updatedEvent = await eventsApi.updateEvent(action.eventData.id, {
            title: action.eventData.title.trim()
          })
          setEvents(prev => prev.map(e => e.id === action.eventData.id ? updatedEvent : e))
          setSuccessMessage('Event updated successfully!')
        } else if (action.type === 'event_rearrangement') {
          // Handle event rearrangements - update existing events with new times
          for (const rearrangement of action.rearrangements) {
            const updatedEvent = await eventsApi.updateEvent(rearrangement.eventId, {
              start: new Date(rearrangement.newStart),
              end: new Date(rearrangement.newEnd)
            })
            setEvents(prev => prev.map(e => e.id === rearrangement.eventId ? updatedEvent : e))
          }
          setSuccessMessage(`Rearranged ${action.rearrangements.length} event${action.rearrangements.length === 1 ? '' : 's'} successfully!`)
        }
      }
      setShowEventConfirmation(false)
      setPendingEventData(null)
    } catch (error) {
      console.error('Failed to process event:', error)
      setError('Failed to process event. Please try again.')
    }
  }

  // Handle event confirmation cancel
  const handleEventCancel = () => {
    setShowEventConfirmation(false)
    setPendingEventData(null)
  }


  // Handle smart action execution
  const handleSmartAction = async (suggestion) => {
    try {
      if (suggestion.type === 'create_event') {
        // Create event directly using eventsApi
        const startDate = new Date(`${suggestion.date}T${suggestion.time}:00`);
        const endDate = new Date(startDate.getTime() + (suggestion.duration * 60000));
        
        const newEvent = await eventsApi.createEvent({
          title: suggestion.title,
          start: startDate,
          end: endDate
          // color will be randomly assigned by the API
        });

        setEvents(prev => [...prev, newEvent]);
        
        // Add success message
        const successMessage = {
          id: Date.now().toString(),
          text: `✅ Created "${suggestion.title}" for ${startDate.toLocaleDateString()} at ${startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
          sender: 'bot',
          timestamp: new Date(),
          isSuccess: true
        };
        setMessages(prev => [...prev, successMessage]);
        
      } else if (suggestion.type === 'move_event') {
        // Find and move existing event
        const existingEvent = events.find(e => 
          e.title.toLowerCase().includes(suggestion.eventTitle.toLowerCase())
        );
        
        if (existingEvent) {
          const newStart = new Date(`${suggestion.newDate}T${suggestion.newTime}:00`);
          const duration = new Date(existingEvent.end) - new Date(existingEvent.start);
          const newEnd = new Date(newStart.getTime() + duration);
          
          const updatedEvent = await eventsApi.updateEvent(existingEvent.id, {
            start: newStart,
            end: newEnd
          });
          
          setEvents(prev => prev.map(e => e.id === existingEvent.id ? updatedEvent : e));
          
          const successMessage = {
            id: Date.now().toString(),
            text: `✅ Moved "${existingEvent.title}" to ${newStart.toLocaleDateString()} at ${newStart.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
            sender: 'bot',
            timestamp: new Date(),
            isSuccess: true
          };
          setMessages(prev => [...prev, successMessage]);
        } else {
          throw new Error(`Could not find event "${suggestion.eventTitle}"`);
        }
      } else if (suggestion.type === 'request_meeting_with_friend') {
        // Send meeting request to friend
        const { data: { session } } = await supabase.auth.getSession()
        
        const response = await fetch('/api/ai/execute-tools', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session?.access_token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            tools: [{
              name: 'request_meeting_with_friend',
              input: {
                friend_name: suggestion.friend_name,
                meeting_title: suggestion.meeting_title,
                message: suggestion.message,
                duration_minutes: suggestion.duration_minutes,
                proposed_times: suggestion.proposed_times
              }
            }],
            userTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
          })
        })
        
        if (response.ok) {
          const result = await response.json()
          const toolResult = result.results[0]
          
          if (toolResult.success) {
            const successMessage = {
              id: Date.now().toString(),
              text: `✅ Meeting request sent to ${suggestion.friend_name}!`,
              sender: 'bot',
              timestamp: new Date(),
              isSuccess: true
            };
            setMessages(prev => [...prev, successMessage]);
            // Refresh events to show any changes
            await loadEvents()
          } else {
            throw new Error(toolResult.error || 'Failed to send meeting request')
          }
        } else {
          throw new Error('Failed to send meeting request')
        }
      }
    } catch (error) {
      console.error('Error executing smart action:', error);
      const errorMessage = {
        id: Date.now().toString(),
        text: `❌ Failed to ${suggestion.type.replace('_', ' ')}: ${error.message}`,
        sender: 'bot',
        timestamp: new Date(),
        isError: true
      };
      setMessages(prev => [...prev, errorMessage]);
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
    console.log(`🔍 DEBUG: updateEventInDatabase called with ID ${eventId}`, updatedData)
    try {
      const updatedEvent = await eventsApi.updateEvent(eventId, updatedData)
      console.log(`🔍 DEBUG: API returned updated event:`, updatedEvent)
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
    
    setPendingEventData({
      type: 'event_edit',
      eventData: {
        id: event.id,
        title: event.title,
        start: event.start,
        end: event.end
      },
      message: 'Edit event:'
    })
    setShowEventConfirmation(true)
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
        const slotHeight = getActualSlotHeight()
        const deltaMinutes = (deltaY / slotHeight) * 30

        // Calculate day difference based on X movement
        const calendarGrid = document.querySelector('.calendar-time-grid')
        if (calendarGrid) {
          const rect = calendarGrid.getBoundingClientRect()
          const columnWidth = (rect.width - 80) / 7
          const deltaX = e.clientX - dragState.startX
          const dayDelta = Math.round(deltaX / columnWidth)

          // Calculate new start time
          const newStart = new Date(dragState.originalStart)
          newStart.setMinutes(newStart.getMinutes() + deltaMinutes)
          newStart.setDate(newStart.getDate() + dayDelta)

          // Calculate duration and new end time
          const duration = dragState.originalEnd - dragState.originalStart
          const newEnd = new Date(newStart.getTime() + duration)

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


  // Enhanced import functions
  const handleFileSelect = (e) => {
    setSelectedFile(e.target.files[0])
    setErrorMessage('')
    setSuccessMessage('')
  }

  const handleFileImport = async () => {
    if (!selectedFile) {
      setErrorMessage('Please select a file first')
      return
    }

    setIsImporting(true)
    setErrorMessage('')
    setSuccessMessage('')

    try {
      // Attach auth token so backend can satisfy RLS rules
      const { data: { session } } = await supabase.auth.getSession()
      const headers = {
        'Authorization': `Bearer ${session?.access_token}`
      }

      const formData = new FormData()
      formData.append('icalFile', selectedFile) // must match field name expected by server

      const response = await fetch('/api/events/import', {
        method: 'POST',
        headers,
        body: formData
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to import file')
      }

      setSuccessMessage(`Successfully imported ${result.successful} events`)
      
      // Refresh events
      await loadEvents()
      
      // Clear form
      setSelectedFile(null)
      
      // Close modal after short delay
      setTimeout(() => {
        setShowImportModal(false)
        setSuccessMessage('')
      }, 3000)

    } catch (error) {
      console.error('File import error:', error)
      setErrorMessage(error.message || 'Failed to import file')
    } finally {
      setIsImporting(false)
    }
  }

  const handleImportFromURL = async () => {
    if (!importUrl.trim()) {
      setErrorMessage('Please enter a calendar URL')
      return
    }

    setIsImporting(true)
    setErrorMessage('')
    setSuccessMessage('')

    try {
      // Get auth headers
      const { data: { session } } = await supabase.auth.getSession()
      const headers = {
        'Authorization': `Bearer ${session?.access_token}`
      }
      
      const formData = new FormData()
      formData.append('url', importUrl.trim())
      
      // Add subscription option
      if (subscribeToCalendar && subscriptionName.trim()) {
        formData.append('subscribe', 'true')
        formData.append('name', subscriptionName.trim())
      }

      const response = await fetch('/api/events/import-url', {
        method: 'POST',
        headers,
        body: formData
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to import calendar')
      }

      setSuccessMessage(result.message || `Successfully imported ${result.successful} events`)
      
      // Refresh events
      await loadEvents()
      if (subscribeToCalendar) {
        fetchCalendarSubscriptions()
      }
      
      // Clear form
      setImportUrl('')
      setSubscriptionName('')
      setSubscribeToCalendar(false)
      
      // Close modal after short delay
      setTimeout(() => {
        setShowImportModal(false)
        setSuccessMessage('')
      }, 3000)

    } catch (error) {
      console.error('URL import error:', error)
      setErrorMessage(error.message || 'Failed to import calendar from URL')
    } finally {
      setIsImporting(false)
    }
  }

  // Invitation functions
  const handleInviteEvent = (eventId) => {
    setInviteEventId(eventId)
    setShowInviteModal(true)
    setInviteEmails([''])
    setInviteMessage('')
  }

  // Meeting request functions
  const handleAcceptMeeting = async (meetingRequestId, proposedTimeIndex) => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      
      // Find the meeting request event to get the proposed time
      const meetingEvent = events.find(e => 
        e.type === 'meeting_request' && 
        e.meetingRequestId === meetingRequestId && 
        e.proposedTimeIndex === proposedTimeIndex
      )
      
      if (!meetingEvent) {
        setError('Meeting request not found')
        return
      }

      const response = await fetch(`/api/meetings/requests/${meetingRequestId}/accept`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session?.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          selected_time: meetingEvent.start instanceof Date ? meetingEvent.start.toISOString() : new Date(meetingEvent.start).toISOString()
        })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to accept meeting request')
      }

      const result = await response.json()
      console.log('✅ Meeting acceptance result:', result)
      
      // Show success message
      setSuccessMessage('Meeting accepted!')
      
      // Refresh events to show the new confirmed event
      setTimeout(async () => {
        await loadEvents()
      }, 500)
      
      // Add a message to the chat
      const startDate = meetingEvent.start instanceof Date ? meetingEvent.start : new Date(meetingEvent.start)
      const systemMessage = {
        id: Date.now().toString(),
        text: `✅ Meeting "${meetingEvent.title.replace(' (proposed by ', ' with ').replace(')', '')}" accepted for ${startDate.toLocaleDateString()} at ${startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
        sender: 'bot',
        timestamp: new Date(),
        isSuccess: true
      }
      setMessages(prev => [...prev, systemMessage])
    } catch (error) {
      console.error('Error accepting meeting:', error)
      setError('Failed to accept meeting request')
    }
  }

  const handleDeclineMeeting = async (meetingRequestId) => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      
      const response = await fetch(`/api/meetings/requests/${meetingRequestId}/decline`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session?.access_token}`
        }
      })

      if (!response.ok) {
        throw new Error('Failed to decline meeting request')
      }

      // Show success message
      setSuccessMessage('Meeting request declined')
      
      // Refresh events to remove the proposed meetings
      await loadEvents()
      
      // Add a message to the chat
      const meetingEvent = events.find(e => 
        e.type === 'meeting_request' && 
        e.meetingRequestId === meetingRequestId
      )
      
      if (meetingEvent) {
        addMessage({
          id: Date.now().toString(),
          content: `❌ Meeting request "${meetingEvent.title.replace(' (proposed by ', ' from ').replace(')', '')}" declined`,
          type: 'system',
          timestamp: new Date()
        })
      }
    } catch (error) {
      console.error('Error declining meeting:', error)
      setError('Failed to decline meeting request')
    }
  }

  const addEmailField = () => {
    setInviteEmails([...inviteEmails, ''])
  }

  const removeEmailField = (index) => {
    if (inviteEmails.length > 1) {
      setInviteEmails(inviteEmails.filter((_, i) => i !== index))
    }
  }

  const updateEmail = (index, value) => {
    const newEmails = [...inviteEmails]
    newEmails[index] = value
    setInviteEmails(newEmails)
  }

  const sendInvitations = async () => {
    const validEmails = inviteEmails.filter(email => email.trim() !== '')
    
    if (validEmails.length === 0) {
      setError('Please enter at least one email address')
      return
    }

    setIsSendingInvites(true)
    setError(null)

    try {
      const result = await eventsApi.sendEventInvitation(inviteEventId, validEmails, inviteMessage)
      
      setImportResult({
        message: result.message,
        successful: result.successful,
        failed: result.failed
      })
      
      setShowInviteModal(false)
      setInviteEventId(null)
      setInviteEmails([''])
      setInviteMessage('')
      
    } catch (error) {
      console.error('Failed to send invitations:', error)
      setError(`Failed to send invitations: ${error.message}`)
    } finally {
      setIsSendingInvites(false)
    }
  }

  // Chat functions
  // Legacy function - now handled by tool-based API
  // Keeping for backwards compatibility but no longer used

  // Legacy functions - now handled by tool-based API
  // Keeping for backwards compatibility but no longer used

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
      // Get current messages for context (simplified - no more action filtering)
      const chatHistory = messages.map(msg => ({
        text: msg.text,
        sender: msg.sender,
        timestamp: msg.timestamp
      }))

      // Get auth headers
      const { data: { session } } = await supabase.auth.getSession()
      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session?.access_token}`
      }

      // Use new streamlined AI endpoint with chat history
      const response = await fetch('/api/ai/smart-chat', {
        method: 'POST',
        headers,
        body: JSON.stringify({ 
          message: messageText,
          chatHistory: messages.slice(-5), // Send last 5 messages for context
          userTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to get AI response')
      }

      const data = await response.json()
      
      // Create bot message with suggestions (buttons)
      const botMessage = {
        id: (Date.now() + 1).toString(),
        text: data.response,
        sender: 'bot',
        timestamp: new Date(),
        suggestions: data.suggestions || [],
        isComplex: data.isComplex || false,
        isStreaming: false
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

  // Add calendar subscription management

  // Fetch calendar subscriptions
  const fetchCalendarSubscriptions = async () => {
    if (!user) return // Don't fetch if not authenticated
    
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const headers = {
        'Authorization': `Bearer ${session?.access_token}`
      }
      
      const response = await fetch('/api/calendar-subscriptions', { headers });
      if (response.ok) {
        const subscriptions = await response.json();
        setCalendarSubscriptions(subscriptions);
      }
    } catch (error) {
      console.error('Error fetching calendar subscriptions:', error);
    }
  };

  // Delete calendar subscription
  const deleteCalendarSubscription = async (subscriptionId) => {
    if (!confirm('This will delete the subscription and all its events. Continue?')) {
      return;
    }

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const headers = { 'Authorization': `Bearer ${session?.access_token}` }
      const response = await fetch(`/api/calendar-subscriptions/${subscriptionId}`, {
        method: 'DELETE',
        headers
      });

      if (response.ok) {
        setSuccessMessage('Calendar subscription deleted');
        fetchCalendarSubscriptions();
        fetchEvents();
      } else {
        throw new Error('Failed to delete subscription');
      }
    } catch (error) {
      setErrorMessage(error.message);
    }
  };

  // Sync calendar subscription
  const syncCalendarSubscription = async (subscriptionId) => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const headers = { 'Authorization': `Bearer ${session?.access_token}` }
      const response = await fetch(`/api/calendar-subscriptions/${subscriptionId}/sync`, {
        method: 'POST',
        headers
      });

      const result = await response.json();

      if (response.ok) {
        setSuccessMessage(result.message);
        fetchEvents();
        fetchCalendarSubscriptions();
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      setErrorMessage(error.message);
    }
  };

  // Load subscriptions when user is authenticated
  useEffect(() => {
    if (user) {
      fetchCalendarSubscriptions();
    }
  }, [user]);

  // Show sign-in prompt if not authenticated
  if (!user) {
    return (
      <div className="app">
        <div className="unauthenticated-view">
          <div className="auth-prompt">
            <h1>Welcome to Tilly Calendar</h1>
            <p>Your AI-powered calendar assistant</p>
            <button
              onClick={() => setShowAuthModal(true)}
              className="get-started-btn"
            >
              Get Started
            </button>
          </div>
        </div>
        <AuthModal 
          isOpen={showAuthModal} 
          onClose={() => setShowAuthModal(false)} 
        />
      </div>
    )
  }

  return (
    <div className="app">
      <div className="app-layout">
        <div className={`calendar-section ${!showAISection ? 'full-width' : ''}`}>
          <div className="calendar-header">
            <div className="user-section">
              {user ? (
                <div className="user-menu">
                  <button
                    onClick={() => setShowUserProfile(!showUserProfile)}
                    className="user-avatar-btn"
                    title={`Signed in as ${user.email}`}
                  >
                    {user.user_metadata?.display_name?.[0]?.toUpperCase() || user.email?.[0]?.toUpperCase() || 'U'}
                  </button>
                  {showUserProfile && (
                    <div className="user-profile-dropdown-container" ref={userProfileRef}>
                      <UserProfile onClose={() => setShowUserProfile(false)} />
                    </div>
                  )}
                </div>
              ) : (
                <button
                  onClick={() => setShowAuthModal(true)}
                  className="sign-in-btn"
                >
                  Sign In
                </button>
              )}
            </div>
            <div className="calendar-controls">
              <button 
                onClick={goToToday}
                className="today-btn"
                title="Go to today's date"
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
              
              <div className="import-dropdown">
                <button
                  onClick={() => setShowDropdown(!showDropdown)}
                  className="import-btn"
                  title="Import calendar"
                >
                  Import
                </button>
                {showDropdown && (
                  <div className="import-dropdown-menu">
                    <button onClick={() => { setShowImportModal(true); setImportMethod('file'); setShowDropdown(false); }}>
                      📁 Upload .ics File
                    </button>
                    <button onClick={() => { setShowImportModal(true); setImportMethod('url'); setShowDropdown(false); }}>
                      🔗 From URL
                    </button>
                    <button onClick={() => { setShowSubscriptions(true); setShowDropdown(false); }}>
                      🔄 Manage Subscriptions
                    </button>
                  </div>
                )}
              </div>
              

            </div>
          </div>

          {/* Hidden file input for import */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".ics,text/calendar"
            onChange={handleFileImport}
            style={{ display: 'none' }}
          />

          {/* Import Modal */}
          {showImportModal && (
            <div className="modal-overlay" onClick={() => setShowImportModal(false)}>
              <div className="modal-content" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                  <h3>📁 Import Calendar</h3>
                  <button className="close-btn" onClick={() => setShowImportModal(false)}>×</button>
                </div>
                
                <div className="modal-body">
                  <div className="import-tabs">
                    <button 
                      className={`tab-btn ${importMethod === 'file' ? 'active' : ''}`}
                      onClick={() => setImportMethod('file')}
                    >
                      📄 Upload File
                    </button>
                    <button 
                      className={`tab-btn ${importMethod === 'url' ? 'active' : ''}`}
                      onClick={() => setImportMethod('url')}
                    >
                      🔗 From URL
                    </button>
                  </div>

                  {importMethod === 'file' && (
                    <div className="import-section">
                      <div className="file-upload-area" onClick={() => document.getElementById('ics-file').click()}>
                        <input
                          type="file"
                          id="ics-file"
                          accept=".ics,.ical"
                          onChange={handleFileSelect}
                          style={{ display: 'none' }}
                        />
                        <div className="upload-icon">📁</div>
                        <p>Click to select .ics file</p>
                        <small>Maximum file size: 5MB</small>
                      </div>

                      {selectedFile && (
                        <div className="selected-file">
                          <span>📄 {selectedFile.name}</span>
                          <button onClick={() => setSelectedFile(null)}>Remove</button>
                        </div>
                      )}

                      <button 
                        className="import-btn" 
                        onClick={handleFileImport}
                        disabled={!selectedFile || isImporting}
                      >
                        {isImporting ? 'Importing...' : 'Import Events'}
                      </button>
                    </div>
                  )}

                  {importMethod === 'url' && (
                    <div className="import-section">
                      <div className="url-import-help">
                        <h4>📋 Getting Your Calendar URL:</h4>
                        <div className="help-section">
                          <strong>iCloud Calendar:</strong>
                          <ol>
                            <li>Open Calendar app or iCloud.com</li>
                            <li>Right-click your calendar → "Share Calendar"</li>
                            <li>Enable "Public Calendar" → Copy the URL</li>
                          </ol>
                        </div>
                        <div className="help-section">
                          <strong>Google Calendar:</strong>
                          <ol>
                            <li>Open Google Calendar</li>
                            <li>Settings → Select your calendar</li>
                            <li>Copy the "Public address in iCal format" URL</li>
                          </ol>
                        </div>
                      </div>

                      <input
                        type="url"
                        placeholder="Paste your calendar URL here..."
                        value={importUrl}
                        onChange={(e) => setImportUrl(e.target.value)}
                        className="url-input"
                      />

                      {/* Subscription Option */}
                      <div className="subscription-option">
                        <label className="checkbox-label">
                          <input
                            type="checkbox"
                            checked={subscribeToCalendar}
                            onChange={(e) => setSubscribeToCalendar(e.target.checked)}
                          />
                          <span className="subscription-icon">🔄</span>
                          <strong>Subscribe for automatic updates</strong>
                          <small>Keep this calendar synced with new events (checks every 30 minutes)</small>
                        </label>
                      </div>

                      {subscribeToCalendar && (
                        <input
                          type="text"
                          placeholder="Calendar name (e.g., 'Work Calendar', 'Family Events')"
                          value={subscriptionName}
                          onChange={(e) => setSubscriptionName(e.target.value)}
                          className="subscription-name-input"
                        />
                      )}

                      <button 
                        className="import-btn" 
                        onClick={handleImportFromURL}
                        disabled={!importUrl.trim() || isImporting || (subscribeToCalendar && !subscriptionName.trim())}
                      >
                        {isImporting ? 'Importing...' : subscribeToCalendar ? 'Subscribe & Import' : 'Import Once'}
                      </button>
                    </div>
                  )}

                  {errorMessage && (
                    <div className="error-message">
                      ❌ {errorMessage}
                    </div>
                  )}

                  {successMessage && (
                    <div className="success-message">
                      ✅ {successMessage}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Invitation Modal */}
          {showInviteModal && (
            <div className="modal-overlay">
              <div className="modal-content">
                <h3>Send Calendar Invitation</h3>
                <p>Send this event as a calendar invitation via email:</p>
                
                <div className="invite-emails-container">
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>
                    Email Addresses:
                  </label>
                  {inviteEmails.map((email, index) => (
                    <div key={index} style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => updateEmail(index, e.target.value)}
                        placeholder="email@example.com"
                        className="url-input"
                        style={{ flex: 1 }}
                        disabled={isSendingInvites}
                      />
                      {inviteEmails.length > 1 && (
                        <button
                          onClick={() => removeEmailField(index)}
                          disabled={isSendingInvites}
                          style={{
                            padding: '8px 12px',
                            backgroundColor: '#ef4444',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer'
                          }}
                        >
                          ×
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    onClick={addEmailField}
                    disabled={isSendingInvites}
                    style={{
                      padding: '8px 12px',
                      backgroundColor: '#4A7C2A',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '14px'
                    }}
                  >
                    + Add Email
                  </button>
                </div>
                
                <div style={{ marginBottom: '16px', marginTop: '16px' }}>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>
                    Optional Message:
                  </label>
                  <textarea
                    value={inviteMessage}
                    onChange={(e) => setInviteMessage(e.target.value)}
                    placeholder="Add a personal message to the invitation..."
                    disabled={isSendingInvites}
                    style={{
                      width: '100%',
                      padding: '12px',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '14px',
                      minHeight: '80px',
                      resize: 'vertical'
                    }}
                  />
                </div>
                
                <div className="modal-help">
                  <strong>How it works:</strong>
                  <ul>
                    <li>Recipients will receive an email with a calendar invitation</li>
                    <li>Apple Mail, Gmail, and other email clients will automatically detect the invite</li>
                    <li>Recipients can click to add the event directly to their calendar</li>
                  </ul>
                </div>

                <div className="modal-actions">
                  <button
                    onClick={sendInvitations}
                    disabled={isSendingInvites || inviteEmails.every(email => !email.trim())}
                    className="import-url-btn"
                  >
                    {isSendingInvites ? '⏳ Sending...' : '📤 Send Invitations'}
                  </button>
                  <button
                    onClick={() => {
                      setShowInviteModal(false)
                      setInviteEventId(null)
                      setInviteEmails([''])
                      setInviteMessage('')
                    }}
                    disabled={isSendingInvites}
                    className="cancel-btn"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="error-message">
              {error}
            </div>
          )}

          {importResult && (
            <div className="success-message">
              ✅ {importResult.message}
              {importResult.failed > 0 && (
                <div className="import-warnings">
                  ⚠️ {importResult.failed} events failed to import
                </div>
              )}
              <button 
                onClick={() => setImportResult(null)}
                className="close-message-btn"
              >
                ×
              </button>
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
                        color: isToday ? '#87A96B' : '#1f2937' 
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
                  {/* Current time indicator */}
                  {(() => {
                    const today = new Date()
                    today.setHours(0, 0, 0, 0)
                    
                    const currentMinutes = currentTime.getHours() * 60 + currentTime.getMinutes()
                    const slotHeight = getActualSlotHeight()
                    const currentTimePosition = (currentMinutes / 30) * slotHeight
                    
                    // Find today's column index
                    const todayColumnIndex = weekDates.findIndex(date => {
                      const compareDate = new Date(date)
                      compareDate.setHours(0, 0, 0, 0)
                      return compareDate.getTime() === today.getTime()
                    })
                    
                    // Only show if today is in the current week view
                    if (todayColumnIndex === -1) return null
                    
                    const columnWidth = 100 / 7
                    const leftPosition = (todayColumnIndex / 7) * 100
                    
                    return (
                      <div
                        style={{
                          position: 'absolute',
                          top: `${currentTimePosition}px`,
                          left: `${leftPosition}%`,
                          width: `${columnWidth}%`,
                          height: '2px',
                          backgroundColor: '#ef4444',
                          zIndex: 200,
                          boxShadow: '0 0 4px rgba(239, 68, 68, 0.5)'
                        }}
                      />
                    )
                  })()}

                  {weekDates.map((date, dayIndex) => {
                    // Show events that overlap with this date (not just events that start on this date)
                    const dayEvents = events.filter(event => {
                      const eventStart = new Date(event.start)
                      const eventEnd = new Date(event.end)
                      const currentDate = new Date(date)
                      
                      // Set times to compare just dates
                      const eventStartDate = new Date(eventStart)
                      eventStartDate.setHours(0, 0, 0, 0)
                      const eventEndDate = new Date(eventEnd)
                      eventEndDate.setHours(0, 0, 0, 0)
                      currentDate.setHours(0, 0, 0, 0)
                      
                      // Event overlaps this date if it starts before or on this date AND ends on or after this date
                      return eventStartDate <= currentDate && eventEndDate >= currentDate
                    })
                    
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
                          const dimensions = calculateEventDimensions(event, date, events)
                          if (!dimensions) return null
                          
                          // Get layout data from hook for overlapping positioning
                          const layoutEvent = eventsWithLayout.find(e => e.id === event.id)
                          const useOverlapLayout = layoutEvent && layoutEvent.width < 95
                          
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
                                left: useOverlapLayout ? `${layoutEvent.left}%` : `${dimensions.leftPercentage}%`,
                                width: useOverlapLayout ? `${layoutEvent.width}%` : `${dimensions.widthPercentage}%`,
                                height: `${dimensions.height}px`,
                                paddingLeft: '2px',
                                paddingRight: '2px',
                                backgroundColor: event.type === 'meeting_request' ? (event.color || '#e8f5e9') : event.color,
                                border: event.type === 'meeting_request' ? `2px solid ${event.borderColor || '#4a6741'}` : 'none',
                                color: (event.type === 'meeting_request' || event.type === 'sent_meeting_request') ? '#1b5e20' : 'white',
                                boxShadow: event.type === 'meeting_request' ? '0 2px 4px rgba(74,103,65,0.3)' : 'none',
                                borderRadius: '4px',
                                padding: '4px 6px',
                                fontSize: '12px',
                                fontWeight: '500',
                                cursor: event.type === 'meeting_request' ? 'pointer' : 'grab',
                                zIndex: isBeingDragged ? 1000 : (useOverlapLayout ? layoutEvent.zIndex : 100),
                                overflow: 'hidden',
                                boxShadow: isBeingDragged 
                                  ? '0 8px 25px rgba(0, 0, 0, 0.3)' 
                                  : '0 1px 3px rgba(0, 0, 0, 0.2)',
                                userSelect: 'none',
                                opacity: isBeingDragged ? 0.8 : 1,
                                transform: isBeingDragged ? 'scale(1.02)' : 'scale(1)',
                                transition: isBeingDragged ? 'none' : 'all 0.2s ease',
                                pointerEvents: 'auto',
                                boxSizing: 'border-box',
                                minWidth: '60px', // Ensure minimum readable width
                                maxWidth: '100%'  // Prevent overflow past column
                              }}
                              onMouseEnter={(e) => {
                                // Bring event to front with higher z-index and enhanced shadow
                                e.currentTarget.style.zIndex = '999'
                                e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.3)'
                                
                                // Show action buttons
                                const deleteBtn = e.currentTarget.querySelector('.delete-button')
                                const inviteBtn = e.currentTarget.querySelector('.invite-button')
                                if (deleteBtn) deleteBtn.style.opacity = '1'
                                if (inviteBtn) inviteBtn.style.opacity = '1'
                              }}
                              onMouseLeave={(e) => {
                                // Reset z-index and shadow
                                e.currentTarget.style.zIndex = isBeingDragged ? '1000' : (useOverlapLayout ? layoutEvent.zIndex : '100')
                                e.currentTarget.style.boxShadow = isBeingDragged 
                                  ? '0 8px 25px rgba(0, 0, 0, 0.3)' 
                                  : '0 1px 3px rgba(0, 0, 0, 0.2)'
                                
                                // Hide action buttons
                                const deleteBtn = e.currentTarget.querySelector('.delete-button')
                                const inviteBtn = e.currentTarget.querySelector('.invite-button')
                                if (deleteBtn) deleteBtn.style.opacity = '0'
                                if (inviteBtn) inviteBtn.style.opacity = '0'
                              }}
                            >
                              {/* Drag area - covers most of the event but leaves space for buttons */}
                              <div
                                onMouseDown={(e) => handleEventMouseDown(e, event)}
                                style={{
                                  position: 'absolute',
                                  top: '4px',
                                  left: '4px',
                                  right: dimensions.widthPercentage > 35 ? '25px' : '18px',
                                  bottom: '6px',
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
                                  left: '2px',
                                  right: '2px',
                                  height: '4px',
                                  cursor: 'ns-resize',
                                  backgroundColor: 'transparent',
                                  zIndex: 15,
                                  transition: 'background-color 0.2s'
                                }}
                              />
                              
                              {/* Title, duration, and buttons container */}
                              <div style={{ 
                                display: 'flex', 
                                alignItems: 'center', 
                                justifyContent: 'space-between',
                                position: 'relative',
                                marginBottom: '2px'
                              }}>
                                {/* Title and duration section - takes available space */}
                                <div style={{ 
                                  flex: 1, 
                                  minWidth: 0, // Allows flex item to shrink below content size
                                  marginRight: '4px'
                                }}>
                                  {editingEventId === event.id ? (
                                    <input
                                      type="text"
                                      value={editingTitle}
                                      onChange={(e) => setEditingTitle(e.target.value)}
                                      onBlur={() => {
                                        if (editingTitle.trim()) {
                                          updateEventInDatabase(event.id, { title: editingTitle.trim() })
                                            .then(updatedEvent => {
                                              setEvents(prev => prev.map(e => e.id === event.id ? updatedEvent : e))
                                            })
                                            .catch(error => {
                                              console.error('Failed to update title:', error)
                                            })
                                        }
                                        setEditingEventId(null)
                                        setEditingTitle('')
                                      }}
                                      onKeyPress={(e) => {
                                        if (e.key === 'Enter') {
                                          if (editingTitle.trim()) {
                                            updateEventInDatabase(event.id, { title: editingTitle.trim() })
                                              .then(updatedEvent => {
                                                setEvents(prev => prev.map(e => e.id === event.id ? updatedEvent : e))
                                              })
                                              .catch(error => {
                                                console.error('Failed to update title:', error)
                                              })
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
                                        border: '1px solid #4A7C2A',
                                        borderRadius: '2px',
                                        backgroundColor: 'white',
                                        color: '#1f2937',
                                        outline: 'none',
                                        width: '100%',
                                        zIndex: 100
                                      }}
                                    />
                                  ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                                      <div 
                                        className="event-title"
                                        onClick={() => {
                                          if (event.type !== 'meeting_request') {
                                            setEditingEventId(event.id)
                                            setEditingTitle(event.title)
                                          }
                                        }}
                                        style={{ 
                                          fontWeight: '600', 
                                          cursor: event.type === 'meeting_request' ? 'default' : 'pointer',
                                          padding: '2px 4px',
                                          borderRadius: '2px',
                                          transition: 'background-color 0.2s',
                                          position: 'relative',
                                          zIndex: 100,
                                          pointerEvents: 'auto',
                                          overflow: 'hidden',
                                          textOverflow: 'ellipsis',
                                          whiteSpace: 'nowrap',
                                          fontSize: '12px',
                                          color: (event.type === 'meeting_request' || event.type === 'sent_meeting_request') ? '#1b5e20' : (event.color === '#F4F1E8' ? '#1f2937' : 'white')
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
                                      <div style={{ 
                                        fontSize: '10px', 
                                        opacity: 0.9, 
                                        paddingLeft: '4px',
                                        color: (event.type === 'meeting_request' || event.type === 'sent_meeting_request') ? '#2e7d32' : (event.color === '#F4F1E8' ? 'rgba(31, 41, 55, 0.7)' : 'rgba(255, 255, 255, 0.9)')
                                      }}>
                                        {eventStart.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        {duration >= 60 && ` - ${eventEnd.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
                                      </div>
                                    </div>
                                  )}
                                </div>
                                
                                {/* Buttons section - fixed width */}
                                <div style={{ 
                                  display: 'flex', 
                                  gap: '2px',
                                  flexShrink: 0 // Prevents buttons from shrinking
                                }}>
                                  {event.type === 'meeting_request' ? (
                                    <>
                                      {/* Accept button */}
                                      <div
                                        className="accept-meeting-button"
                                        onClick={() => {
                                          handleAcceptMeeting(event.meetingRequestId, event.proposedTimeIndex)
                                        }}
                                        style={{
                                          width: '24px',
                                          height: '24px',
                                          backgroundColor: '#22c55e',
                                          borderRadius: '6px',
                                          display: 'flex',
                                          alignItems: 'center',
                                          justifyContent: 'center',
                                          fontSize: '12px',
                                          fontWeight: 'bold',
                                          color: 'white',
                                          cursor: 'pointer',
                                          transition: 'all 0.2s',
                                          zIndex: 20,
                                          pointerEvents: 'auto',
                                          boxShadow: '0 2px 4px rgba(34, 197, 94, 0.4)',
                                          border: '1px solid rgba(255, 255, 255, 0.3)'
                                        }}
                                        onMouseEnter={(e) => {
                                          e.target.style.backgroundColor = '#16a34a'
                                          e.target.style.transform = 'scale(1.1)'
                                        }}
                                        onMouseLeave={(e) => {
                                          e.target.style.backgroundColor = '#22c55e'
                                          e.target.style.transform = 'scale(1)'
                                        }}
                                        title="Accept meeting request"
                                      >
                                        ✓
                                      </div>
                                      {/* Decline button */}
                                      <div
                                        className="decline-meeting-button"
                                        onClick={() => {
                                          handleDeclineMeeting(event.meetingRequestId)
                                        }}
                                        style={{
                                          width: '24px',
                                          height: '24px',
                                          backgroundColor: '#ef4444',
                                          borderRadius: '6px',
                                          display: 'flex',
                                          alignItems: 'center',
                                          justifyContent: 'center',
                                          fontSize: '12px',
                                          fontWeight: 'bold',
                                          color: 'white',
                                          cursor: 'pointer',
                                          transition: 'all 0.2s',
                                          zIndex: 20,
                                          pointerEvents: 'auto',
                                          boxShadow: '0 2px 4px rgba(239, 68, 68, 0.4)',
                                          border: '1px solid rgba(255, 255, 255, 0.3)'
                                        }}
                                        onMouseEnter={(e) => {
                                          e.target.style.backgroundColor = '#dc2626'
                                          e.target.style.transform = 'scale(1.1)'
                                        }}
                                        onMouseLeave={(e) => {
                                          e.target.style.backgroundColor = '#ef4444'
                                          e.target.style.transform = 'scale(1)'
                                        }}
                                        title="Decline meeting request"
                                      >
                                        ×
                                      </div>
                                    </>
                                  ) : (
                                    <>
                                      {dimensions.widthPercentage > 35 && (
                                        <div
                                          className="invite-button"
                                          onClick={() => {
                                            handleInviteEvent(event.id)
                                          }}
                                          style={{
                                            width: '16px',
                                            height: '16px',
                                            backgroundColor: 'rgba(74, 124, 42, 0.8)',
                                            borderRadius: '50%',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            fontSize: '8px',
                                            cursor: 'pointer',
                                            opacity: 0,
                                            transition: 'opacity 0.2s',
                                            zIndex: 20,
                                            pointerEvents: 'auto'
                                          }}
                                          onMouseEnter={(e) => {
                                            e.target.style.backgroundColor = 'rgba(74, 124, 42, 1)'
                                            e.target.style.opacity = '1'
                                          }}
                                          onMouseLeave={(e) => {
                                            e.target.style.backgroundColor = 'rgba(74, 124, 42, 0.8)'
                                            e.target.style.opacity = '0'
                                          }}
                                        >
                                          ✉️
                                        </div>
                                      )}
                                      
                                      <div
                                        className="delete-button"
                                        onClick={() => {
                                          deleteEvent(event.id)
                                        }}
                                        style={{
                                          width: dimensions.widthPercentage > 35 ? '16px' : '14px',
                                          height: dimensions.widthPercentage > 35 ? '16px' : '14px',
                                          backgroundColor: 'rgba(220, 38, 38, 0.8)',
                                          borderRadius: '50%',
                                          display: 'flex',
                                          alignItems: 'center',
                                          justifyContent: 'center',
                                          fontSize: dimensions.widthPercentage > 35 ? '10px' : '8px',
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
                                    </>
                                  )}
                                </div>
                              </div>

                              {/* Bottom resize handle - not for meeting requests */}
                              {event.type !== 'meeting_request' && (
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
                                    left: '2px',
                                    right: '2px',
                                    height: '6px',
                                    cursor: 'ns-resize',
                                    backgroundColor: 'transparent',
                                    zIndex: 15,
                                    transition: 'background-color 0.2s'
                                  }}
                                />
                              )}
                              

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

        {/* AI Toggle Arrow */}
        <div 
          className={`ai-toggle-arrow ${showAISection ? 'open' : 'closed'}`}
          onClick={() => setShowAISection(!showAISection)}
          style={{
            transform: 'translateY(-50%)'
          }}
          title={showAISection ? "Hide AI Assistant" : "Show AI Assistant"}
        >
          {showAISection ? '›' : '‹'}
        </div>

        {showAISection && (
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
              borderBottom: '1px solid #d6ccc2',
              backgroundColor: '#7c9a7e'
            }}>
              <h2 style={{ 
                margin: 0, 
                fontSize: '18px', 
                fontWeight: 600, 
                color: 'white' 
              }}>
                Tilly
              </h2>
              <p style={{ 
                margin: '4px 0 0 0', 
                fontSize: '14px', 
                color: '#edf2eb' 
              }}>
                Ask me about your calendar
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
                      maxWidth: message.isComplex ? '95%' : '85%', // Wider for complex responses
                      wordWrap: 'break-word',
                      marginLeft: message.sender === 'user' ? 'auto' : '0',
                      marginRight: message.sender === 'user' ? '0' : 'auto',
                      backgroundColor: message.isSuccess ? '#a3b18a' : 
                                     message.isError ? '#fee2e2' : 
                                     message.isComplex ? '#dce5dc' : // Light moss for complex queries
                                     message.sender === 'user' ? '#7c9a7e' : '#F4F1E8',
                      color: message.isSuccess ? '#1b1f1e' :
                             message.isError ? '#dc2626' :
                             message.isComplex ? '#1b1f1e' : // Deep charcoal for complex queries
                             message.sender === 'user' ? 'white' : '#1b1f1e',
                      fontSize: '14px',
                      lineHeight: '1.4',
                      border: message.isSuccess ? '1px solid #a3b18a' :
                              message.isError ? '1px solid #fca5a5' : 
                              message.isComplex ? '1px solid #d6ccc2' : 'none' // Bark brown border for complex queries
                    }}
                  >
                    {message.text}
                  </div>
                  
                  {/* Show smart action buttons for AI suggestions */}
                  {message.suggestions && message.suggestions.length > 0 && (
                    <div style={{ 
                      marginTop: '12px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px'
                    }}>
                      {message.suggestions.map((suggestion, index) => {
                        // Determine if this is a friend-related action
                        const isFriendAction = suggestion.buttonText?.toLowerCase().includes('friend') || 
                                             suggestion.buttonText?.toLowerCase().includes('meeting') ||
                                             suggestion.buttonText?.toLowerCase().includes('invite') ||
                                             suggestion.type === 'friend_meeting' ||
                                             suggestion.type === 'request_meeting_with_friend';
                        
                        return (
                          <button
                            key={index}
                            onClick={() => handleSmartAction(suggestion)}
                            style={{
                              background: isFriendAction ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' : '#7c9a7e',
                              color: 'white',
                              border: isFriendAction ? '2px solid #a78bfa' : 'none',
                              borderRadius: '8px',
                              padding: '10px 16px',
                              fontSize: '14px',
                              fontWeight: '500',
                              cursor: 'pointer',
                              transition: 'all 0.2s ease-out',
                              boxShadow: isFriendAction 
                                ? '0 4px 12px rgba(139, 92, 246, 0.3)' 
                                : '0 2px 4px rgba(0, 0, 0, 0.08)',
                              position: 'relative',
                              overflow: 'hidden'
                            }}
                            onMouseEnter={(e) => {
                              e.target.style.transform = 'scale(1.02)';
                              if (isFriendAction) {
                                e.target.style.background = 'linear-gradient(135deg, #4f46e5, #7c3aed)';
                                e.target.style.boxShadow = '0 6px 16px rgba(139, 92, 246, 0.4)';
                              } else {
                                e.target.style.backgroundColor = '#2f5233';
                                e.target.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.12)';
                              }
                            }}
                            onMouseLeave={(e) => {
                              e.target.style.transform = 'scale(1)';
                              if (isFriendAction) {
                                e.target.style.background = 'linear-gradient(135deg, #6366f1, #8b5cf6)';
                                e.target.style.boxShadow = '0 4px 12px rgba(139, 92, 246, 0.3)';
                              } else {
                                e.target.style.backgroundColor = '#7c9a7e';
                                e.target.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.08)';
                              }
                            }}
                          >
                            {isFriendAction && (
                              <span style={{ 
                                marginRight: '6px',
                                fontSize: '12px'
                              }}>👥</span>
                            )}
                            {suggestion.buttonText}
                            {isFriendAction && (
                              <span style={{
                                position: 'absolute',
                                top: '-2px',
                                right: '-2px',
                                width: '8px',
                                height: '8px',
                                background: '#fbbf24',
                                borderRadius: '50%',
                                boxShadow: '0 0 6px rgba(251, 191, 36, 0.6)',
                                animation: 'pulse 2s infinite'
                              }}></span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
              
              {isProcessing && (
                <div style={{
                  padding: '12px',
                  borderRadius: '12px',
                  maxWidth: '85%',
                  backgroundColor: '#F4F1E8',
                  color: '#1b1f1e',
                  fontSize: '14px',
                  fontStyle: 'italic'
                }}>
                  Thinking...
                </div>
              )}
              
              {/* Invisible element for auto-scrolling */}
              <div ref={messagesEndRef} />
            </div>
            
            {/* Input Section */}
            <div style={{ 
              padding: '16px', 
              borderTop: '1px solid #d6ccc2',
              backgroundColor: '#f1f5f3'
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
                    border: '1px solid #d6ccc2',
                    borderRadius: '8px',
                    fontSize: '14px',
                    outline: 'none',
                    backgroundColor: isProcessing ? '#f1f5f3' : 'white',
                    color: '#1b1f1e'
                  }}
                />
                <button
                  onClick={handleSendMessage}
                  disabled={isProcessing || inputMessage.trim() === ''}
                  style={{
                    padding: '10px 16px',
                    backgroundColor: isProcessing || inputMessage.trim() === '' ? '#d6ccc2' : '#7c9a7e',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '14px',
                    cursor: isProcessing || inputMessage.trim() === '' ? 'not-allowed' : 'pointer',
                    fontWeight: 500,
                    transition: 'all 0.2s ease-out'
                  }}
                >
                  Send
                </button>
              </div>
            </div>
          </div>
        </div>
        )}
      </div>

      {/* Event Confirmation Modal */}
      {showEventConfirmation && pendingEventData && (
        <div className="event-confirmation-modal">
          <EventConfirmation
            responseData={pendingEventData}
            onConfirm={handleEventConfirm}
            onCancel={handleEventCancel}
          />
        </div>
      )}


      {/* Import Modal */}
      {showSubscriptions && (
        <div className="modal-overlay" onClick={() => setShowSubscriptions(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>🔄 Calendar Subscriptions</h3>
              <button className="close-btn" onClick={() => setShowSubscriptions(false)}>×</button>
            </div>
            
            <div className="modal-body">
              {calendarSubscriptions.length === 0 ? (
                <div className="no-subscriptions">
                  <p>No calendar subscriptions yet.</p>
                  <p>Use "🔗 From URL" with the subscribe option to add automatic calendar syncing.</p>
                </div>
              ) : (
                <div className="subscriptions-list">
                  {calendarSubscriptions.map(subscription => (
                    <div key={subscription.id} className="subscription-item">
                      <div className="subscription-info">
                        <h4>{subscription.name}</h4>
                        <p className="subscription-url">{subscription.url}</p>
                        <small>
                          Last synced: {subscription.last_sync ? 
                            new Date(subscription.last_sync).toLocaleString() : 
                            'Never'
                          }
                        </small>
                      </div>
                      <div className="subscription-actions">
                        <button 
                          className="sync-btn"
                          onClick={() => syncCalendarSubscription(subscription.id)}
                        >
                          🔄 Sync Now
                        </button>
                        <button 
                          className="delete-btn"
                          onClick={() => deleteCalendarSubscription(subscription.id)}
                        >
                          🗑️ Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {errorMessage && (
                <div className="error-message">
                  ❌ {errorMessage}
                </div>
              )}

              {successMessage && (
                <div className="success-message">
                  ✅ {successMessage}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Authentication Modal */}
      <AuthModal 
        isOpen={showAuthModal} 
        onClose={() => setShowAuthModal(false)} 
      />
    </div>
  )
}

// Loading component for authentication
const AppWithAuth = () => {
  const { loading: authLoading } = useAuth()

  if (authLoading) {
    return (
      <div className="auth-loading">
        <div className="auth-loading-content">
          <div className="auth-loading-spinner"></div>
          <p>Loading...</p>
        </div>
      </div>
    )
  }

  return <App />
}

export default AppWithAuth

