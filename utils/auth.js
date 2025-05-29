const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcrypt');

const dbPath = path.join(__dirname, '../accounts.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS accounts (
      username TEXT PRIMARY KEY,
      password_hash TEXT NOT NULL
    )
  `);
});

/**
 * Register a new user.
 * @param {string} username
 * @param {string} password
 * @returns {Promise<boolean>} true if registered, false if username exists
 */
function registerUser(username, password) {
  return new Promise((resolve, reject) => {
    db.get('SELECT username FROM accounts WHERE username = ?', username, async (err, row) => {
      if (err) return reject(err);
      if (row) return resolve(false);

      try {
        const hash = await bcrypt.hash(password, 10);
        db.run(
          'INSERT INTO accounts (username, password_hash) VALUES (?, ?)',
          [username, hash],
          function (err) {
            if (err) return reject(err);
            resolve(true);
          }
        );
      } catch (hashErr) {
        reject(hashErr);
      }
    });
  });
}

/**
 * Authenticate a user.
 * @param {string} username
 * @param {string} password
 * @returns {Promise<boolean>} true if authenticated, false otherwise
 */
function authenticateUser(username, password) {
  return new Promise((resolve, reject) => {
    db.get('SELECT password_hash FROM accounts WHERE username = ?', username, async (err, row) => {
      if (err) return reject(err);
      if (!row) return resolve(false);

      try {
        const match = await bcrypt.compare(password, row.password_hash);
        resolve(match);
      } catch (compareErr) {
        reject(compareErr);
      }
    });
  });
}

module.exports = {
  registerUser,
  authenticateUser,
};
