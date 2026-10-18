// Usage: npm run create-admin -- <username> <password> ["Full Name"]
require('dotenv').config({ quiet: true });
const bcrypt = require('bcryptjs');
const { openDb } = require('../server/db');

const [username, password, fullName] = process.argv.slice(2);
if (!username || !password) {
  console.error('Usage: npm run create-admin -- <username> <password> ["Full Name"]');
  process.exit(1);
}
if (password.length < 8) {
  console.error('Password must be at least 8 characters.');
  process.exit(1);
}
const db = openDb(process.env.DB_PATH || './data/feeflow.db');
try {
  const email = username.includes('@') ? username : null;
  db.prepare('INSERT INTO users (username, email, password_hash, role, full_name) VALUES (?,?,?,?,?)')
    .run(username, email, bcrypt.hashSync(password, 10), 'admin', fullName || 'Administrator');
  console.log(`Admin "${username}" created.`);
} catch (e) {
  console.error('Could not create admin:', e.message);
  process.exit(1);
}
