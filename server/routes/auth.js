const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const { HttpError, today } = require('../util');
const { COOKIE } = require('../middleware');

// Used so that "unknown user" takes about as long as "wrong password".
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

const HOME = { admin: 'index.html', student: 'student-portal.html', parent: 'parent-portal.html' };

module.exports = function authRoutes({ db, auth, config }) {
  const router = express.Router();

  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => config.nodeEnv === 'test',
    message: { error: 'Too many login attempts. Please try again in 15 minutes.' },
  });

  const publicUser = (u) => ({
    id: u.id,
    username: u.username,
    name: u.full_name,
    role: u.role,
    mustChangePassword: !!u.must_change_password,
    home: HOME[u.role],
  });

  router.post('/login', loginLimiter, (req, res) => {
    const { username, password } = req.body || {};
    if (typeof username !== 'string' || typeof password !== 'string' || !username.trim() || !password) {
      throw new HttpError(400, 'Enter your username/email and password.');
    }
    const id = username.trim();
    const user = db.prepare('SELECT * FROM users WHERE username = ? OR email = ?').get(id, id);
    const ok = bcrypt.compareSync(password, user ? user.password_hash : DUMMY_HASH);
    if (!user || !ok) throw new HttpError(401, 'Incorrect username or password.');

    res.cookie(COOKIE, auth.sign(user.id), {
      httpOnly: true,
      sameSite: 'strict',
      secure: config.nodeEnv === 'production',
      maxAge: 8 * 60 * 60 * 1000,
    });
    res.json({ user: publicUser(user) });
  });

  router.post('/logout', (_req, res) => {
    res.clearCookie(COOKIE);
    res.json({ ok: true });
  });

  router.get('/me', auth.requireLogin, (req, res) => {
    res.json({ user: publicUser(req.user), today: today(config.timezone) });
  });

  router.post('/change-password', auth.requireLogin, (req, res) => {
    const { currentPassword, newPassword } = req.body || {};
    if (typeof currentPassword !== 'string' || typeof newPassword !== 'string') {
      throw new HttpError(400, 'Current and new password are required.');
    }
    if (newPassword.length < 8) throw new HttpError(400, 'New password must be at least 8 characters.');
    if (newPassword === currentPassword) throw new HttpError(400, 'New password must be different from the current one.');

    const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);
    if (!bcrypt.compareSync(currentPassword, row.password_hash)) throw new HttpError(400, 'Current password is incorrect.');

    db.prepare('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?')
      .run(bcrypt.hashSync(newPassword, 10), req.user.id);
    res.json({ ok: true });
  });

  return router;
};
