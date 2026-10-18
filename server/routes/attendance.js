const express = require('express');
const { HttpError, today, isValidDate } = require('../util');
const { ordinal } = require('../db');

module.exports = function attendanceRoutes({ db, auth, config }) {
  const router = express.Router();
  router.use(auth.requireRole('admin'));

  function register(date) {
    const rows = db.prepare(`
      SELECT s.admission_no, s.full_name, s.year, a.status
      FROM students s
      LEFT JOIN attendance a ON a.student_id = s.id AND a.date = ?
      ORDER BY s.admission_no`).all(date);
    const students = rows.map((r) => ({
      admissionNo: r.admission_no, name: r.full_name, yearLabel: ordinal(r.year), status: r.status || null,
    }));
    const marked = students.filter((s) => s.status);
    const present = marked.filter((s) => s.status === 'present').length;
    return {
      date,
      students,
      summary: {
        total: students.length,
        marked: marked.length,
        present,
        absent: marked.length - present,
        rate: marked.length ? Math.round((present / marked.length) * 1000) / 10 : null,
      },
    };
  }

  router.get('/', (req, res) => {
    const date = req.query.date ? String(req.query.date) : today(config.timezone);
    if (!isValidDate(date)) throw new HttpError(400, 'Date is not valid (use YYYY-MM-DD).');
    res.json(register(date));
  });

  router.put('/', (req, res) => {
    const { date, records } = req.body || {};
    if (!isValidDate(date)) throw new HttpError(400, 'Date is not valid (use YYYY-MM-DD).');
    if (date > today(config.timezone)) throw new HttpError(400, 'You cannot mark attendance for a future date.');
    if (!Array.isArray(records) || records.length === 0) throw new HttpError(400, 'No attendance records were sent.');

    const find = db.prepare('SELECT id FROM students WHERE admission_no = ?');
    const upsert = db.prepare(`
      INSERT INTO attendance (student_id, date, status) VALUES (?,?,?)
      ON CONFLICT(student_id, date) DO UPDATE SET status = excluded.status`);
    db.transaction(() => {
      for (const r of records) {
        if (!r || !['present', 'absent'].includes(r.status)) throw new HttpError(400, 'Status must be "present" or "absent".');
        const s = find.get(String(r.admissionNo));
        if (!s) throw new HttpError(404, `Student ${r.admissionNo} not found.`);
        upsert.run(s.id, date, r.status);
      }
    })();
    res.json(register(date));
  });

  return router;
};
