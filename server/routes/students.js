const express = require('express');
const bcrypt = require('bcryptjs');
const { HttpError, tempPassword } = require('../util');
const { listStudentSummaries, getStudentSummary } = require('../db');

module.exports = function studentRoutes({ db, auth }) {
  const router = express.Router();
  router.use(auth.requireRole('admin'));

  router.get('/', (_req, res) => {
    res.json({ students: listStudentSummaries(db) });
  });

  /**
   * Adds a student, creates the student's login, and (optionally) a parent login.
   * Temporary passwords are returned ONCE in this response and never stored in plain text.
   */
  router.post('/', (req, res) => {
    const b = req.body || {};
    const admissionNo = String(b.admissionNo || '').trim().toUpperCase();
    const name = String(b.name || '').trim();
    const year = Number(b.year);
    const totalFees = Number(b.totalFees);
    const parentEmail = String(b.parentEmail || '').trim().toLowerCase();

    if (!/^[A-Z0-9-]{3,20}$/.test(admissionNo)) throw new HttpError(400, 'Admission number must be 3-20 letters/numbers (e.g. STU011).');
    if (name.length < 2 || name.length > 100) throw new HttpError(400, 'Enter the student\'s full name.');
    if (!Number.isInteger(year) || year < 1 || year > 8) throw new HttpError(400, 'Year of study must be a whole number from 1 to 8.');
    if (!Number.isInteger(totalFees) || totalFees < 0 || totalFees > 100000000) throw new HttpError(400, 'Total fees must be a whole number of shillings (0 or more).');
    if (parentEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(parentEmail)) throw new HttpError(400, 'Parent email is not valid.');
    if (db.prepare('SELECT 1 FROM students WHERE admission_no = ?').get(admissionNo)) {
      throw new HttpError(409, `Admission number ${admissionNo} already exists.`);
    }
    if (db.prepare('SELECT 1 FROM users WHERE username = ?').get(admissionNo)) {
      throw new HttpError(409, `A login named ${admissionNo} already exists.`);
    }

    const credentials = {};
    db.transaction(() => {
      const studentId = db
        .prepare('INSERT INTO students (admission_no, full_name, year, total_fees) VALUES (?,?,?,?)')
        .run(admissionNo, name, year, totalFees).lastInsertRowid;

      const sPass = tempPassword();
      db.prepare(
        'INSERT INTO users (username, password_hash, role, full_name, student_id, must_change_password) VALUES (?,?,?,?,?,1)'
      ).run(admissionNo, bcrypt.hashSync(sPass, 10), 'student', name, studentId);
      credentials.student = { username: admissionNo, password: sPass };

      if (parentEmail) {
        let parent = db.prepare("SELECT id FROM users WHERE email = ? AND role = 'parent'").get(parentEmail);
        if (!parent) {
          if (db.prepare('SELECT 1 FROM users WHERE username = ? OR email = ?').get(parentEmail, parentEmail)) {
            throw new HttpError(409, 'That parent email is already used by a non-parent account.');
          }
          const pPass = tempPassword();
          const id = db.prepare(
            'INSERT INTO users (username, email, password_hash, role, full_name, must_change_password) VALUES (?,?,?,?,?,1)'
          ).run(parentEmail, parentEmail, bcrypt.hashSync(pPass, 10), 'parent', `Parent of ${name}`).lastInsertRowid;
          parent = { id };
          credentials.parent = { username: parentEmail, password: pPass };
        } else {
          credentials.parent = { username: parentEmail, password: null, note: 'Existing parent account linked.' };
        }
        db.prepare('INSERT OR IGNORE INTO parent_students (user_id, student_id) VALUES (?,?)').run(parent.id, studentId);
      }
    })();

    res.status(201).json({ student: getStudentSummary(db, admissionNo), credentials });
  });

  return router;
};
