const jwt = require('jsonwebtoken');
const { HttpError } = require('./util');

const COOKIE = 'ff_token';

function makeAuth({ db, jwtSecret }) {
  /** Reads the login cookie and attaches req.user (or leaves it undefined). */
  function attachUser(req, _res, next) {
    const token = req.cookies && req.cookies[COOKIE];
    if (token) {
      try {
        const payload = jwt.verify(token, jwtSecret);
        const user = db
          .prepare('SELECT id, username, email, role, full_name, student_id, must_change_password FROM users WHERE id = ?')
          .get(payload.uid);
        if (user) req.user = user;
      } catch (_) { /* invalid or expired token: treat as logged out */ }
    }
    next();
  }

  function requireLogin(req, _res, next) {
    if (!req.user) return next(new HttpError(401, 'Please log in.'));
    next();
  }

  function requireRole(...roles) {
    return (req, _res, next) => {
      if (!req.user) return next(new HttpError(401, 'Please log in.'));
      if (!roles.includes(req.user.role)) return next(new HttpError(403, 'You do not have access to this.'));
      next();
    };
  }

  function sign(userId) {
    return jwt.sign({ uid: userId }, jwtSecret, { expiresIn: '8h' });
  }

  /** Can this logged-in user see data for this student? */
  function canAccessStudent(user, studentId) {
    if (user.role === 'admin') return true;
    if (user.role === 'student') return user.student_id === studentId;
    if (user.role === 'parent') {
      return !!db
        .prepare('SELECT 1 FROM parent_students WHERE user_id = ? AND student_id = ?')
        .get(user.id, studentId);
    }
    return false;
  }

  return { attachUser, requireLogin, requireRole, sign, canAccessStudent };
}

module.exports = { makeAuth, COOKIE };
