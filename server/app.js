const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const path = require('path');
const { makeAuth } = require('./middleware');
const { HttpError } = require('./util');

function createApp({ db, config }) {
  const app = express();
  if (config.nodeEnv === 'production') app.set('trust proxy', 1); // behind Render/Railway/etc.
  app.disable('x-powered-by');

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"], // the original pages use inline style=""
          imgSrc: ["'self'", 'data:'],
          frameAncestors: ["'none'"],
          // Only force https in production; on http://localhost it breaks Safari.
          upgradeInsecureRequests: config.nodeEnv === 'production' ? [] : null,
        },
      },
    })
  );
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  const auth = makeAuth({ db, jwtSecret: config.jwtSecret });
  app.use(auth.attachUser);

  const ctx = { db, auth, config };
  app.use('/api/auth', require('./routes/auth')(ctx));
  app.use('/api/students', require('./routes/students')(ctx));
  app.use('/api/attendance', require('./routes/attendance')(ctx));
  app.use('/api/reports', require('./routes/reports')(ctx));
  app.use('/api/portal', require('./routes/portal')(ctx));
  app.use('/api', require('./routes/payments')(ctx));
  app.use('/api', require('./routes/dashboard')(ctx));
  app.get('/api/health', (_req, res) => res.json({ ok: true }));

  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Not found.')));

  // Frontend
  app.get('/', (_req, res) => res.redirect('/login.html'));
  app.use(express.static(path.join(__dirname, '..', 'public'), { index: false, extensions: ['html'] }));

  // Errors -> JSON
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON.' });
    const status = err.status || 500;
    if (status >= 500) console.error(err);
    res.status(status).json({ error: status >= 500 ? 'Something went wrong on the server.' : err.message });
  });

  return app;
}

module.exports = { createApp };
