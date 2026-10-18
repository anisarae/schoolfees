const express = require('express');
const { today } = require('../util');
const { listStudentSummaries } = require('../db');

module.exports = function dashboardRoutes({ db, auth, config }) {
  const router = express.Router();

  /** Totals used by both the dashboard and the reports page. */
  function totals() {
    const students = listStudentSummaries(db);
    const expected = students.reduce((a, s) => a + s.totalFees, 0);
    const collected = students.reduce((a, s) => a + s.paid, 0);
    return { studentCount: students.length, expected, collected, outstanding: expected - collected, students };
  }

  router.get('/dashboard', auth.requireRole('admin'), (_req, res) => {
    const t = totals();
    const date = today(config.timezone);
    const att = db.prepare(`
      SELECT COUNT(*) AS marked, COALESCE(SUM(status = 'present'), 0) AS present
      FROM attendance WHERE date = ?`).get(date);
    const byId = new Map(t.students.map((s) => [s.id, s]));
    const recent = db.prepare(`
      SELECT p.receipt_no, p.amount, p.paid_on, p.student_id, s.full_name, s.admission_no
      FROM payments p JOIN students s ON s.id = p.student_id
      ORDER BY p.paid_on DESC, p.id DESC LIMIT 9`).all();
    res.json({
      studentCount: t.studentCount,
      collected: t.collected,
      outstanding: t.outstanding,
      attendanceToday: {
        date,
        marked: att.marked,
        rate: att.marked ? Math.round((att.present / att.marked) * 1000) / 10 : null,
      },
      recentPayments: recent.map((r) => ({
        receiptNo: r.receipt_no,
        studentName: r.full_name,
        admissionNo: r.admission_no,
        amount: r.amount,
        paidOn: r.paid_on,
        feeStatus: byId.get(r.student_id).status,
      })),
    });
  });

  router.get('/reports/summary', auth.requireRole('admin'), (_req, res) => {
    const { studentCount, expected, collected, outstanding } = totals();
    res.json({ studentCount, expected, collected, outstanding });
  });

  return router;
};
