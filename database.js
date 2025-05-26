const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Create database file in the project directory
const dbPath = path.join(__dirname, 'calendar.db');
const db = new sqlite3.Database(dbPath);

// Initialize database with events table
const initDatabase = () => {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run(`CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        start_time DATETIME NOT NULL,
        end_time DATETIME NOT NULL,
        color TEXT DEFAULT '#3b82f6',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`, (err) => {
        if (err) {
          console.error('Error creating events table:', err);
          reject(err);
        } else {
          console.log('Events table created or already exists');
          resolve();
        }
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
    const { title, start, end, color = '#3b82f6' } = eventData;
    
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

module.exports = {
  initDatabase,
  getAllEvents,
  createEvent,
  updateEvent,
  deleteEvent,
  getEventsByDateRange,
  closeDatabase
}; 