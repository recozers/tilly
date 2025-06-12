const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Create database file in the project directory
const dbPath = path.join(__dirname, 'calendar.db');
const db = new sqlite3.Database(dbPath);

// Initialize database with events table
const initDatabase = () => {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      // Create events table
      db.run(`CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        start_time DATETIME NOT NULL,
        end_time DATETIME NOT NULL,
                      color TEXT DEFAULT '#4A7C2A',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        source_calendar_id INTEGER DEFAULT NULL,
        source_event_uid TEXT DEFAULT NULL
      )`, (err) => {
        if (err) {
          console.error('Error creating events table:', err);
          return reject(err);
        }
        
        // Create calendar subscriptions table
        db.run(`CREATE TABLE IF NOT EXISTS calendar_subscriptions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          url TEXT NOT NULL UNIQUE,
          color TEXT DEFAULT '#4A7C2A',
          last_sync DATETIME DEFAULT NULL,
          sync_enabled BOOLEAN DEFAULT 1,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`, (err) => {
          if (err) {
            console.error('Error creating calendar_subscriptions table:', err);
            reject(err);
          } else {
            console.log('Events and calendar_subscriptions tables created or already exist');
            resolve();
          }
        });
      });
    });
  });
};

// Get all events
const getAllEvents = () => {
  return new Promise((resolve, reject) => {
    db.all('SELECT * FROM events ORDER BY start_time', (err, rows) => {
      if (err) {
        reject(err);
      } else {
        // Convert database format to frontend format
        const events = rows.map(row => ({
          id: row.id,
          title: row.title,
          start: new Date(row.start_time),
          end: new Date(row.end_time),
          color: row.color
        }));
        resolve(events);
      }
    });
  });
};

// Create a new event
const createEvent = (eventData) => {
  return new Promise((resolve, reject) => {
    const { title, start, end, color = '#4A7C2A' } = eventData;
    
    db.run(
      'INSERT INTO events (title, start_time, end_time, color) VALUES (?, ?, ?, ?)',
      [title, start.toISOString(), end.toISOString(), color],
      function(err) {
        if (err) {
          reject(err);
        } else {
          // Return the created event with the new ID
          resolve({
            id: this.lastID,
            title,
            start,
            end,
            color
          });
        }
      }
    );
  });
};

// Update an existing event
const updateEvent = (id, eventData) => {
  return new Promise((resolve, reject) => {
    const { title, start, end, color } = eventData;
    
    db.run(
      'UPDATE events SET title = ?, start_time = ?, end_time = ?, color = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [title, start.toISOString(), end.toISOString(), color, id],
      function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({
            id,
            title,
            start,
            end,
            color
          });
        }
      }
    );
  });
};

// Delete an event
const deleteEvent = (id) => {
  return new Promise((resolve, reject) => {
    db.run('DELETE FROM events WHERE id = ?', [id], function(err) {
      if (err) {
        reject(err);
      } else {
        resolve({ deletedId: id, changes: this.changes });
      }
    });
  });
};

// Get events within a date range
const getEventsByDateRange = (startDate, endDate) => {
  return new Promise((resolve, reject) => {
    db.all(
      'SELECT * FROM events WHERE start_time >= ? AND start_time <= ? ORDER BY start_time',
      [startDate.toISOString(), endDate.toISOString()],
      (err, rows) => {
        if (err) {
          reject(err);
        } else {
          const events = rows.map(row => ({
            id: row.id,
            title: row.title,
            start: new Date(row.start_time),
            end: new Date(row.end_time),
            color: row.color
          }));
          resolve(events);
        }
      }
    );
  });
};

// Search events by title/content
const searchEvents = (searchTerm, timeframe = null) => {
  return new Promise((resolve, reject) => {
    let query = 'SELECT * FROM events WHERE LOWER(title) LIKE LOWER(?)';
    let params = [`%${searchTerm}%`];
    
    if (timeframe) {
      query += ' AND start_time >= ? AND start_time <= ?';
      params.push(timeframe.start.toISOString(), timeframe.end.toISOString());
    }
    
    query += ' ORDER BY start_time';
    
    db.all(query, params, (err, rows) => {
      if (err) {
        reject(err);
      } else {
        const events = rows.map(row => ({
          id: row.id,
          title: row.title,
          start: new Date(row.start_time),
          end: new Date(row.end_time),
          color: row.color
        }));
        resolve(events);
      }
    });
  });
};

// Get upcoming events (next N events from now)
const getUpcomingEvents = (limit = 10) => {
  return new Promise((resolve, reject) => {
    const now = new Date().toISOString();
    db.all(
      'SELECT * FROM events WHERE start_time >= ? ORDER BY start_time LIMIT ?',
      [now, limit],
      (err, rows) => {
        if (err) {
          reject(err);
        } else {
          const events = rows.map(row => ({
            id: row.id,
            title: row.title,
            start: new Date(row.start_time),
            end: new Date(row.end_time),
            color: row.color
          }));
          resolve(events);
        }
      }
    );
  });
};

// Get events for specific periods (today, tomorrow, this week, etc.)
const getEventsForPeriod = (period) => {
  return new Promise((resolve, reject) => {
    const now = new Date();
    let startDate, endDate;
    
    switch (period.toLowerCase()) {
      case 'today':
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
        break;
      case 'tomorrow':
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
        endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2);
        break;
      case 'this_week':
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - now.getDay());
        startOfWeek.setHours(0, 0, 0, 0);
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 7);
        startDate = startOfWeek;
        endDate = endOfWeek;
        break;
      case 'next_week':
        const nextWeekStart = new Date(now);
        nextWeekStart.setDate(now.getDate() - now.getDay() + 7);
        nextWeekStart.setHours(0, 0, 0, 0);
        const nextWeekEnd = new Date(nextWeekStart);
        nextWeekEnd.setDate(nextWeekStart.getDate() + 7);
        startDate = nextWeekStart;
        endDate = nextWeekEnd;
        break;
      default:
        reject(new Error(`Unknown period: ${period}`));
        return;
    }
    
    getEventsByDateRange(startDate, endDate)
      .then(resolve)
      .catch(reject);
  });
};

// Check if user is free at a specific time
const isTimeSlotFree = (startTime, endTime) => {
  return new Promise((resolve, reject) => {
    db.all(
      'SELECT * FROM events WHERE (start_time < ? AND end_time > ?) OR (start_time < ? AND end_time > ?) OR (start_time >= ? AND start_time < ?)',
      [endTime.toISOString(), startTime.toISOString(), startTime.toISOString(), startTime.toISOString(), startTime.toISOString(), endTime.toISOString()],
      (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows.length === 0);
        }
      }
    );
  });
};

// Get calendar statistics
const getCalendarStats = (period = 'this_week') => {
  return new Promise(async (resolve, reject) => {
    try {
      const events = await getEventsForPeriod(period);
      const stats = {
        totalEvents: events.length,
        totalHours: events.reduce((total, event) => {
          const duration = (new Date(event.end) - new Date(event.start)) / (1000 * 60 * 60);
          return total + duration;
        }, 0),
        eventsByDay: {},
        busiestDay: null
      };
      
      // Group events by day
      events.forEach(event => {
        const day = new Date(event.start).toLocaleDateString('en-US', { weekday: 'long' });
        if (!stats.eventsByDay[day]) {
          stats.eventsByDay[day] = 0;
        }
        stats.eventsByDay[day]++;
      });
      
      // Find busiest day
      let maxEvents = 0;
      Object.entries(stats.eventsByDay).forEach(([day, count]) => {
        if (count > maxEvents) {
          maxEvents = count;
          stats.busiestDay = day;
        }
      });
      
      resolve(stats);
    } catch (error) {
      reject(error);
    }
  });
};

// Close database connection
const closeDatabase = () => {
  return new Promise((resolve) => {
    db.close((err) => {
      if (err) {
        console.error('Error closing database:', err);
      } else {
        console.log('Database connection closed');
      }
      resolve();
    });
  });
};

// Batch import events (for iCal import)
const importEvents = (eventsData) => {
  return new Promise((resolve, reject) => {
    if (!eventsData || eventsData.length === 0) {
      return resolve({
        imported: [],
        errors: [],
        total: 0,
        successful: 0,
        failed: 0
      });
    }

    db.serialize(() => {
      db.run('BEGIN TRANSACTION');
      
      const stmt = db.prepare('INSERT INTO events (title, start_time, end_time, color) VALUES (?, ?, ?, ?)');
      const importedEvents = [];
      const errors = [];
      let completed = 0;
      
      const processResults = () => {
        if (completed === eventsData.length) {
          stmt.finalize((err) => {
            if (err) {
              console.error('Error finalizing statement:', err);
              db.run('ROLLBACK');
              reject(err);
            } else {
              db.run('COMMIT', (commitErr) => {
                if (commitErr) {
                  console.error('Error committing transaction:', commitErr);
                  reject(commitErr);
                } else {
                  resolve({
                    imported: importedEvents,
                    errors: errors,
                    total: eventsData.length,
                    successful: importedEvents.length,
                    failed: errors.length
                  });
                }
              });
            }
          });
        }
      };
      
      eventsData.forEach((eventData, index) => {
        const { title, start, end, color = '#10b981' } = eventData;
        
        stmt.run([title, start.toISOString(), end.toISOString(), color], function(err) {
          completed++;
          
          if (err) {
            console.error(`Error importing event ${index + 1} (${title}):`, err);
            errors.push({ 
              index: index + 1, 
              error: err.message, 
              title: title || 'Untitled Event' 
            });
          } else {
            importedEvents.push({
              id: this.lastID,
              title,
              start,
              end,
              color
            });
          }
          
          processResults();
        });
      });
    });
  });
};

// Add calendar subscription
const addCalendarSubscription = (subscriptionData) => {
  return new Promise((resolve, reject) => {
    const { name, url, color = '#4A7C2A' } = subscriptionData;
    
    db.run(
      'INSERT INTO calendar_subscriptions (name, url, color) VALUES (?, ?, ?)',
      [name, url, color],
      function(err) {
        if (err) {
          if (err.code === 'SQLITE_CONSTRAINT') {
            reject(new Error('Calendar URL already subscribed'));
          } else {
            reject(err);
          }
        } else {
          resolve({
            id: this.lastID,
            name,
            url,
            color,
            sync_enabled: 1,
            created_at: new Date()
          });
        }
      }
    );
  });
};

// Get all calendar subscriptions
const getCalendarSubscriptions = () => {
  return new Promise((resolve, reject) => {
    db.all('SELECT * FROM calendar_subscriptions ORDER BY created_at', (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
};

// Update calendar subscription sync time
const updateCalendarSync = (subscriptionId, lastSync = new Date()) => {
  return new Promise((resolve, reject) => {
    db.run(
      'UPDATE calendar_subscriptions SET last_sync = ? WHERE id = ?',
      [lastSync.toISOString(), subscriptionId],
      function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ updated: this.changes });
        }
      }
    );
  });
};

// Delete calendar subscription and its events
const deleteCalendarSubscription = (subscriptionId) => {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run('BEGIN TRANSACTION');
      
      // Delete events from this calendar
      db.run('DELETE FROM events WHERE source_calendar_id = ?', [subscriptionId], (err) => {
        if (err) {
          db.run('ROLLBACK');
          return reject(err);
        }
        
        // Delete the subscription
        db.run('DELETE FROM calendar_subscriptions WHERE id = ?', [subscriptionId], (err) => {
          if (err) {
            db.run('ROLLBACK');
            reject(err);
          } else {
            db.run('COMMIT', (err) => {
              if (err) {
                reject(err);
              } else {
                resolve({ deleted: true });
              }
            });
          }
        });
      });
    });
  });
};

// Import events with calendar subscription tracking
const importEventsFromSubscription = (subscriptionId, eventsData) => {
  return new Promise((resolve, reject) => {
    if (!eventsData || eventsData.length === 0) {
      return resolve({
        imported: [],
        updated: 0,
        errors: [],
        total: 0,
        successful: 0,
        failed: 0
      });
    }

    db.serialize(() => {
      db.run('BEGIN TRANSACTION');
      
      // First, delete existing events from this calendar to avoid duplicates
      db.run('DELETE FROM events WHERE source_calendar_id = ?', [subscriptionId], (err) => {
        if (err) {
          db.run('ROLLBACK');
          return reject(err);
        }
        
        // Now import new events
        const stmt = db.prepare('INSERT INTO events (title, start_time, end_time, color, source_calendar_id, source_event_uid) VALUES (?, ?, ?, ?, ?, ?)');
        const importedEvents = [];
        const errors = [];
        let completed = 0;
        
        const processResults = () => {
          if (completed === eventsData.length) {
            stmt.finalize((err) => {
              if (err) {
                console.error('Error finalizing statement:', err);
                db.run('ROLLBACK');
                reject(err);
              } else {
                db.run('COMMIT', (commitErr) => {
                  if (commitErr) {
                    console.error('Error committing transaction:', commitErr);
                    reject(commitErr);
                  } else {
                    resolve({
                      imported: importedEvents,
                      errors: errors,
                      total: eventsData.length,
                      successful: importedEvents.length,
                      failed: errors.length
                    });
                  }
                });
              }
            });
          }
        };
        
        eventsData.forEach((eventData, index) => {
          const { title, start, end, color, uid } = eventData;
          
          stmt.run([title, start.toISOString(), end.toISOString(), color, subscriptionId, uid || null], function(err) {
            completed++;
            
            if (err) {
              console.error(`Error importing event ${index + 1} (${title}):`, err);
              errors.push({ 
                index: index + 1, 
                error: err.message, 
                title: title || 'Untitled Event' 
              });
            } else {
              importedEvents.push({
                id: this.lastID,
                title,
                start,
                end,
                color,
                source_calendar_id: subscriptionId
              });
            }
            
            processResults();
          });
        });
      });
    });
  });
};

module.exports = {
  initDatabase,
  getAllEvents,
  createEvent,
  updateEvent,
  deleteEvent,
  getEventsByDateRange,
  searchEvents,
  getUpcomingEvents,
  getEventsForPeriod,
  isTimeSlotFree,
  getCalendarStats,
  closeDatabase,
  importEvents,
  addCalendarSubscription,
  getCalendarSubscriptions,
  updateCalendarSync,
  deleteCalendarSubscription,
  importEventsFromSubscription
}; 