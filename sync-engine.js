const ical = require('ical.js');
const crypto = require('crypto');
const { supabase } = require('./supabase');

class CalendarSyncEngine {
  constructor() {
    this.fetchCache = new Map();
    this.cacheTimeout = 15 * 60 * 1000; // 15 minutes
  }

  async syncSubscription(subscription, userId) {
    try {
      console.log(`Starting sync for subscription ${subscription.id} (${subscription.name})`);
      
      // Check if calendar has changed using HEAD request
      const hasChanged = await this.hasCalendarChanged(subscription);
      if (!hasChanged && subscription.last_sync) {
        console.log(`Subscription ${subscription.id} has no changes, skipping sync`);
        return { 
          skipped: true, 
          reason: 'No changes detected',
          subscriptionId: subscription.id 
        };
      }

      // Fetch calendar data
      console.log(`Fetching calendar data for ${subscription.url}`);
      const icalData = await this.fetchCalendar(subscription.url);
      
      // Parse iCal data
      const parsedEvents = this.parseICalData(icalData);
      console.log(`Parsed ${parsedEvents.length} events from calendar`);

      // Process events (DO NOT expand recurring events here)
      const events = parsedEvents.map(event => this.transformEvent(event, subscription, userId));

      // Upsert all events
      const upsertResult = await this.upsertEvents(events);
      
      // Remove deleted events
      const deleteResult = await this.removeDeletedEvents(
        subscription.id, 
        userId,
        events.map(e => e.source_event_uid)
      );

      // Update subscription last sync metadata
      await this.updateSyncMetadata(subscription.id, icalData.etag, icalData.lastModified);

      return {
        success: true,
        subscriptionId: subscription.id,
        inserted: upsertResult.inserted,
        updated: upsertResult.updated,
        deleted: deleteResult.deleted,
        total: events.length
      };
    } catch (error) {
      console.error(`Sync failed for subscription ${subscription.id}:`, error);
      return {
        success: false,
        subscriptionId: subscription.id,
        error: error.message
      };
    }
  }

  async hasCalendarChanged(subscription) {
    try {
      const response = await fetch(subscription.url, {
        method: 'HEAD',
        headers: {
          'User-Agent': 'Tilly Calendar Sync/1.0'
        }
      });

      const etag = response.headers.get('etag');
      const lastModified = response.headers.get('last-modified');

      // If we have no previous sync data, always sync
      if (!subscription.last_etag && !subscription.last_modified) {
        return true;
      }

      // Check if either etag or last-modified has changed
      return (etag !== subscription.last_etag) || 
             (lastModified !== subscription.last_modified);
    } catch (error) {
      // If HEAD fails, assume calendar has changed
      console.log(`HEAD request failed for ${subscription.url}, assuming changes`);
      return true;
    }
  }

  async fetchCalendar(url) {
    // Check cache first
    const cached = this.fetchCache.get(url);
    if (cached && (Date.now() - cached.timestamp < this.cacheTimeout)) {
      console.log(`Using cached calendar data for ${url}`);
      return cached.data;
    }

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Tilly Calendar Sync/1.0'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch calendar: ${response.status} ${response.statusText}`);
    }

    const text = await response.text();
    const data = {
      content: text,
      etag: response.headers.get('etag'),
      lastModified: response.headers.get('last-modified')
    };

    // Cache the result
    this.fetchCache.set(url, {
      data,
      timestamp: Date.now()
    });

    return data;
  }

  parseICalData(icalData) {
    const events = [];
    const jcalData = ical.parse(icalData.content);
    const comp = new ical.Component(jcalData);
    const vevents = comp.getAllSubcomponents('vevent');

    for (const vevent of vevents) {
      try {
        const event = new ical.Event(vevent);
        
        // Extract core event data
        const eventData = {
          uid: event.uid,
          summary: event.summary || 'Untitled Event',
          description: event.description,
          location: event.location,
          start: event.startDate ? event.startDate.toJSDate() : null,
          end: event.endDate ? event.endDate.toJSDate() : null,
          sequence: parseInt(vevent.getFirstPropertyValue('sequence') || '0'),
        };

        // Handle recurring events - store RRULE as string
        const rruleProp = vevent.getFirstProperty('rrule');
        if (rruleProp) {
          eventData.rrule = rruleProp.toICALString();
          eventData.dtstart = eventData.start; // Store original start for RRULE
        }

        // Calculate duration
        if (eventData.start && eventData.end) {
          eventData.duration = Math.floor((eventData.end - eventData.start) / 1000);
        }

        events.push(eventData);
      } catch (error) {
        console.error(`Failed to parse event: ${error.message}`);
      }
    }

    return events;
  }

  transformEvent(parsedEvent, subscription, userId) {
    const eventHash = this.generateHash(parsedEvent);
    
    return {
      source_event_uid: parsedEvent.uid,
      source_calendar_id: subscription.id,
      user_id: userId,
      title: parsedEvent.summary,
      description: parsedEvent.description,
      location: parsedEvent.location,
      start_time: parsedEvent.start,
      end_time: parsedEvent.end,
      rrule: parsedEvent.rrule || null,
      dtstart: parsedEvent.dtstart || parsedEvent.start,
      duration: parsedEvent.duration || 0,
      sequence_number: parsedEvent.sequence || 0,
      event_hash: eventHash,
      last_modified: new Date(),
      all_day: this.isAllDayEvent(parsedEvent),
      color: subscription.color
    };
  }

  generateHash(event) {
    const content = JSON.stringify({
      summary: event.summary,
      description: event.description,
      location: event.location,
      start: event.start?.toISOString(),
      end: event.end?.toISOString(),
      rrule: event.rrule,
      sequence: event.sequence
    });
    return crypto.createHash('sha256').update(content).digest('hex').substring(0, 16);
  }

  isAllDayEvent(event) {
    if (!event.start || !event.end) return false;
    
    const start = new Date(event.start);
    const end = new Date(event.end);
    
    // Check if times are at midnight and duration is in whole days
    const isStartMidnight = start.getHours() === 0 && start.getMinutes() === 0;
    const isEndMidnight = end.getHours() === 0 && end.getMinutes() === 0;
    const durationMs = end - start;
    const durationDays = durationMs / (24 * 60 * 60 * 1000);
    
    return isStartMidnight && isEndMidnight && Number.isInteger(durationDays);
  }

  async upsertEvents(events) {
    if (events.length === 0) {
      return { inserted: 0, updated: 0 };
    }

    // Batch upsert with ON CONFLICT
    const { data, error } = await supabase
      .from('events')
      .upsert(events, {
        onConflict: 'source_calendar_id,source_event_uid,user_id',
        ignoreDuplicates: false
      })
      .select();

    if (error) {
      console.error('Upsert error:', error);
      throw error;
    }

    // Count inserted vs updated based on last_modified comparison
    const now = new Date();
    const recentThreshold = new Date(now - 1000); // Events modified in last second are new
    
    const inserted = data?.filter(e => new Date(e.last_modified) > recentThreshold).length || 0;
    const updated = (data?.length || 0) - inserted;

    return { inserted, updated };
  }

  async removeDeletedEvents(subscriptionId, userId, currentEventUids) {
    // Find events that exist in DB but not in current sync
    const { data: existingEvents } = await supabase
      .from('events')
      .select('id, source_event_uid')
      .eq('source_calendar_id', subscriptionId)
      .eq('user_id', userId);

    if (!existingEvents || existingEvents.length === 0) {
      return { deleted: 0 };
    }

    const uidsToDelete = existingEvents
      .filter(e => !currentEventUids.includes(e.source_event_uid))
      .map(e => e.source_event_uid);

    if (uidsToDelete.length === 0) {
      return { deleted: 0 };
    }

    const { error } = await supabase
      .from('events')
      .delete()
      .eq('source_calendar_id', subscriptionId)
      .eq('user_id', userId)
      .in('source_event_uid', uidsToDelete);

    if (error) {
      console.error('Delete error:', error);
      throw error;
    }

    console.log(`Deleted ${uidsToDelete.length} events from subscription ${subscriptionId}`);
    return { deleted: uidsToDelete.length };
  }

  async updateSyncMetadata(subscriptionId, etag, lastModified) {
    const { error } = await supabase
      .from('subscriptions')
      .update({
        last_sync: new Date(),
        last_etag: etag,
        last_modified: lastModified
      })
      .eq('id', subscriptionId);

    if (error) {
      console.error('Failed to update sync metadata:', error);
    }
  }

  // Batch sync multiple subscriptions
  async syncAllSubscriptions(subscriptions, userId) {
    const results = [];
    
    // Process subscriptions in parallel batches of 3
    const batchSize = 3;
    for (let i = 0; i < subscriptions.length; i += batchSize) {
      const batch = subscriptions.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(sub => this.syncSubscription(sub, userId))
      );
      results.push(...batchResults);
    }

    return results;
  }

  // Clear cache
  clearCache() {
    this.fetchCache.clear();
  }
}

module.exports = CalendarSyncEngine;