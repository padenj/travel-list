const bcrypt = require('bcrypt');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.resolve(__dirname, '../../travel-list.sqlite');
const NEW_PASSWORD = process.env.NEW_PASSWORD || 'test123!@#';
const SALT_ROUNDS = 10; // matches hashPasswordSync in server/auth.ts

console.log(`Using DB: ${DB_PATH}`);
console.log('Hashing password...');
const hash = bcrypt.hashSync(NEW_PASSWORD, SALT_ROUNDS);

const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READWRITE, (err) => {
  if (err) {
    console.error('Failed to open database:', err.message);
    process.exit(1);
  }
});

function finish(success) {
  db.close((err) => {
    if (err) console.error('Error closing DB:', err.message);
    process.exit(success ? 0 : 1);
  });
}

function updateUser(user) {
  const now = new Date().toISOString();
  const sql = `UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?`;
  db.run(sql, [hash, now, user.id], function(err) {
    if (err) {
      console.error('Failed to update user password:', err.message);
      finish(false);
      return;
    }
    console.log(`Updated password for user id=${user.id} username=${user.username} role=${user.role}`);
    finish(true);
  });
}

function findSystemAdmin() {
  db.get(`SELECT id, username, role FROM users WHERE username = 'admin' AND deleted_at IS NULL LIMIT 1`, [], (err, row) => {
    if (err) {
      console.error('Error querying users table:', err.message);
      finish(false);
      return;
    }
    if (row) {
      console.log('Found user with username "admin". Updating that account.');
      updateUser(row);
      return;
    }

    // Fallback: first SystemAdmin
    db.get(`SELECT id, username, role FROM users WHERE role = 'SystemAdmin' AND deleted_at IS NULL LIMIT 1`, [], (err2, row2) => {
      if (err2) {
        console.error('Error querying for SystemAdmin:', err2.message);
        finish(false);
        return;
      }
      if (!row2) {
        console.error('No admin user found (username "admin" or role "SystemAdmin"). Aborting.');
        finish(false);
        return;
      }
      console.log('No username "admin" found; updating first SystemAdmin account.');
      updateUser(row2);
    });
  });
}

// Start
findSystemAdmin();
