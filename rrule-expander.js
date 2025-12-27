const { RRule, rrulestr } = require('rrule');

class RRuleExpander {
  constructor() {
    // Cache for expanded instances to avoid re-computation
    this.expansionCache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
  }

  /**
   * Expands a recurring event into instances within a date range
   * @param {Object} event - Event with rrule property
   * @param {Date} startDate - Start of the range
   * @param {Date} endDate - End of the range
   * @param {number} maxInstances - Maximum number of instances to generate (default 365)
   * @returns {Array} Array of event instances
   */
  expandForRange(event, startDate, endDate, maxInstances = 365) {
    // If no RRULE, return the event as-is if it's in range
    if (!event.rrule) {
      const eventStart = new Date(event.start_time);
      const eventEnd = new Date(event.end_time || event.start_time);
      
      if (eventEnd >= startDate && eventStart <= endDate) {
        return [event];
      }
      return [];
    }

    // Check cache
    const cacheKey = this.getCacheKey(event, startDate, endDate);
    const cached = this.expansionCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < this.cacheTimeout)) {
      return cached.instances;
    }

    try {
      // Parse the RRULE
      const dtstart = new Date(event.dtstart || event.start_time);
      const rule = this.parseRRule(event.rrule, dtstart);

      if (!rule) {
        console.error(`Failed to parse RRULE for event ${event.id}: ${event.rrule}`);
        return [event]; // Return original event as fallback
      }

      // Get occurrences within the range
      const occurrences = rule.between(startDate, endDate, true);
      
      // Limit occurrences to prevent memory issues
      const limitedOccurrences = occurrences.slice(0, maxInstances);

      // Create event instances
      const instances = limitedOccurrences.map((date, index) => {
        const duration = event.duration || 3600; // Default 1 hour if no duration
        const instanceEnd = new Date(date.getTime() + duration * 1000);
        
        return {
          ...event,
          id: `${event.id}_${date.toISOString()}`, // Unique ID for instance
          start_time: date,
          end_time: instanceEnd,
          is_recurring_instance: true,
          parent_event_id: event.id,
          instance_date: date,
          instance_index: index
        };
      });

      // Cache the result
      this.expansionCache.set(cacheKey, {
        instances,
        timestamp: Date.now()
      });

      // Clean old cache entries
      this.cleanCache();

      return instances;
    } catch (error) {
      console.error(`Error expanding recurring event ${event.id}:`, error);
      // Return original event as fallback
      return [event];
    }
  }

  /**
   * Parse an RRULE string with a given start date
   */
  parseRRule(rruleString, dtstart) {
    try {
      // Handle different RRULE formats
      if (rruleString.startsWith('RRULE:')) {
        rruleString = rruleString.substring(6);
      }

      // Parse the RRULE with dtstart
      const rule = rrulestr(rruleString, {
        dtstart: dtstart
      });

      return rule;
    } catch (error) {
      console.error(`Failed to parse RRULE: ${rruleString}`, error);
      
      // Try to create a basic RRule from the string
      try {
        const options = this.parseRRuleOptions(rruleString);
        if (options) {
          options.dtstart = dtstart;
          return new RRule(options);
        }
      } catch (secondError) {
        console.error(`Failed to create RRule from options:`, secondError);
      }
      
      return null;
    }
  }

  /**
   * Parse RRULE string into options object
   */
  parseRRuleOptions(rruleString) {
    const parts = rruleString.split(';');
    const options = {};

    for (const part of parts) {
      const [key, value] = part.split('=');
      
      switch (key) {
        case 'FREQ':
          options.freq = RRule[value];
          break;
        case 'INTERVAL':
          options.interval = parseInt(value);
          break;
        case 'COUNT':
          options.count = parseInt(value);
          break;
        case 'UNTIL':
          options.until = this.parseDate(value);
          break;
        case 'BYDAY':
          options.byweekday = this.parseWeekdays(value);
          break;
        case 'BYMONTHDAY':
          options.bymonthday = value.split(',').map(v => parseInt(v));
          break;
        case 'BYMONTH':
          options.bymonth = value.split(',').map(v => parseInt(v));
          break;
      }
    }

    return options.freq ? options : null;
  }

  /**
   * Parse date string from RRULE
   */
  parseDate(dateStr) {
    // Handle different date formats
    if (dateStr.includes('T')) {
      return new Date(dateStr.replace(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/, '$1-$2-$3T$4:$5:$6'));
    } else {
      return new Date(dateStr.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3'));
    }
  }

  /**
   * Parse weekday string from RRULE
   */
  parseWeekdays(weekdayStr) {
    const weekdayMap = {
      'SU': RRule.SU,
      'MO': RRule.MO,
      'TU': RRule.TU,
      'WE': RRule.WE,
      'TH': RRule.TH,
      'FR': RRule.FR,
      'SA': RRule.SA
    };

    return weekdayStr.split(',').map(day => {
      // Handle numbered weekdays like 1MO, -1FR
      const match = day.match(/^([+-]?\d+)?([A-Z]{2})$/);
      if (match) {
        const [, nth, weekday] = match;
        const rruleWeekday = weekdayMap[weekday];
        return nth ? rruleWeekday.nth(parseInt(nth)) : rruleWeekday;
      }
      return weekdayMap[day];
    }).filter(Boolean);
  }

  /**
   * Get the next occurrence of a recurring event
   */
  getNextOccurrence(event, afterDate = new Date()) {
    if (!event.rrule) {
      const eventStart = new Date(event.start_time);
      return eventStart > afterDate ? eventStart : null;
    }

    try {
      const dtstart = new Date(event.dtstart || event.start_time);
      const rule = this.parseRRule(event.rrule, dtstart);
      
      if (!rule) return null;

      const next = rule.after(afterDate, true);
      return next;
    } catch (error) {
      console.error(`Error getting next occurrence for event ${event.id}:`, error);
      return null;
    }
  }

  /**
   * Check if an event occurs on a specific date
   */
  occursOnDate(event, date) {
    if (!event.rrule) {
      const eventStart = new Date(event.start_time);
      const eventEnd = new Date(event.end_time || event.start_time);
      const dayStart = new Date(date);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(date);
      dayEnd.setHours(23, 59, 59, 999);
      
      return eventEnd >= dayStart && eventStart <= dayEnd;
    }

    try {
      const dtstart = new Date(event.dtstart || event.start_time);
      const rule = this.parseRRule(event.rrule, dtstart);
      
      if (!rule) return false;

      const dayStart = new Date(date);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(date);
      dayEnd.setHours(23, 59, 59, 999);
      
      const occurrences = rule.between(dayStart, dayEnd, true);
      return occurrences.length > 0;
    } catch (error) {
      console.error(`Error checking occurrence for event ${event.id}:`, error);
      return false;
    }
  }

  /**
   * Generate cache key for expanded instances
   */
  getCacheKey(event, startDate, endDate) {
    return `${event.id}_${startDate.toISOString()}_${endDate.toISOString()}`;
  }

  /**
   * Clean old cache entries
   */
  cleanCache() {
    const now = Date.now();
    for (const [key, value] of this.expansionCache.entries()) {
      if (now - value.timestamp > this.cacheTimeout) {
        this.expansionCache.delete(key);
      }
    }
  }

  /**
   * Clear all cache
   */
  clearCache() {
    this.expansionCache.clear();
  }
}

module.exports = RRuleExpander;