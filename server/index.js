require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const { openDb, seedDemoData, isEmpty } = require('./db');
const { createApp } = require('./app');

const nodeEnv = process.env.NODE_ENV || 'development';

let jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) {
  if (nodeEnv === 'production') {
    console.error('JWT_SECRET must be set in production. Generate one with:\n  node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"');
    process.exit(1);
  }
  jwtSecret = crypto.randomBytes(32).toString('hex');
  console.warn('[dev] JWT_SECRET not set - using a temporary one (everyone is logged out on restart).');
}

const config = {
  nodeEnv,
  jwtSecret,
  port: Number(process.env.PORT) || 3000,
  schoolName: process.env.SCHOOL_NAME || 'FeeFlow School Management System',
  timezone: process.env.SCHOOL_TIMEZONE || 'Africa/Nairobi',
};

const db = openDb(process.env.DB_PATH || './data/feeflow.db');

if (isEmpty(db)) {
  if (process.env.SEED_DEMO_DATA === 'false') {
    console.warn('Database is empty and SEED_DEMO_DATA=false. Create an admin with:  npm run create-admin -- <username> <password>');
  } else {
    seedDemoData(db, {
      adminPassword: process.env.DEMO_ADMIN_PASSWORD || 'Admin@12345',
      studentPassword: process.env.DEMO_STUDENT_PASSWORD || 'Student@12345',
      parentPassword: process.env.DEMO_PARENT_PASSWORD || 'Parent@12345',
    });
    console.log('Empty database - loaded demo data (10 students). Demo logins are in the README.');
  }
}

createApp({ db, config }).listen(config.port, () => {
  console.log(`FeeFlow running at http://localhost:${config.port}`);
});
