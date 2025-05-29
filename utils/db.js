const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '../chat.db');

const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,           -- 'chat' or 'system'
      username TEXT,                -- nullable for system messages
      text TEXT NOT NULL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
});

function saveMessage({ type = 'chat', username = null, text }) {
  db.run(
    'INSERT INTO messages (type, username, text) VALUES (?, ?, ?)',
    [type, username, text],
    (err) => {
      if (err) console.error('DB insert error:', err);
    }
  );
}

function getRecentMessages(limit = 100) {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT type, username, text, timestamp FROM messages ORDER BY id DESC LIMIT ?`,
      [limit],
      (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(
            rows
              .reverse()
              .map((row) => ({
                type: row.type,
                username: row.username,
                text: row.text,
                timestamp: row.timestamp,
              }))
          );
        }
      }
    );
  });
}

module.exports = {
  saveMessage,
  getRecentMessages,
};
