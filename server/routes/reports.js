const express = require('express');
const { tablePdf } = require('../pdf');
const { today, prettyDate, money } = require('../util');
const { listStudentSummaries, ordinal } = require('../db');

module.exports = function reportRoutes({ db, auth, config }) {
  const router = express.Router();
  router.use(auth.requireRole('admin'));

  const meta = () => [`Generated ${prettyDate(today(config.timezone))}`];

  router.get('/collection.pdf', (_req, res) => {
    const students = listStudentSummaries(db);
    const sum = (k) => students.reduce((a, s) => a + s[k], 0);
    tablePdf(res, 'fee-collection-report.pdf', {
      school: config.schoolName,
      title: 'Fee Collection Report',
      subtitle: `Summary of all ${students.length} students' payments`,
      meta: meta(),
      columns: [
        { label: 'Adm No', width: 55 }, { label: 'Student', width: 120 }, { label: 'Year', width: 35 },
        { label: 'Total Fees', width: 80, align: 'right' }, { label: 'Paid', width: 80, align: 'right' },
        { label: 'Balance', width: 80, align: 'right' }, { label: 'Status', width: 45 },
      ],
      rows: students.map((s) => [s.admissionNo, s.name, s.yearLabel, money(s.totalFees), money(s.paid), money(s.balance), s.status]),
      totals: [['', 'TOTAL', '', money(sum('totalFees')), money(sum('paid')), money(sum('balance')), '']],
    });
  });

  router.get('/balances.pdf', (_req, res) => {
    const owing = listStudentSummaries(db).filter((s) => s.balance > 0).sort((a, b) => b.balance - a.balance);
    tablePdf(res, 'fee-balances-report.pdf', {
      school: config.schoolName,
      title: 'Fee Balances Report',
      subtitle: 'Outstanding balances, largest first',
      meta: meta(),
      columns: [
        { label: 'Adm No', width: 60 }, { label: 'Student', width: 140 }, { label: 'Year', width: 40 },
        { label: 'Total Fees', width: 85, align: 'right' }, { label: 'Paid', width: 85, align: 'right' },
        { label: 'Balance', width: 85, align: 'right' },
      ],
      rows: owing.map((s) => [s.admissionNo, s.name, s.yearLabel, money(s.totalFees), money(s.paid), money(s.balance)]),
      totals: [['', `${owing.length} students owing`, '', '', '', money(owing.reduce((a, s) => a + s.balance, 0))]],
    });
  });

  router.get('/attendance.pdf', (_req, res) => {
    const rows = db.prepare(`
      SELECT s.admission_no, s.full_name, s.year,
             COUNT(a.status) AS marked,
             COALESCE(SUM(a.status = 'present'), 0) AS present
      FROM students s LEFT JOIN attendance a ON a.student_id = s.id
      GROUP BY s.id ORDER BY s.admission_no`).all();
    tablePdf(res, 'attendance-summary-report.pdf', {
      school: config.schoolName,
      title: 'Attendance Summary',
      subtitle: 'Daily presence and absence log, all recorded days',
      meta: meta(),
      columns: [
        { label: 'Adm No', width: 60 }, { label: 'Student', width: 150 }, { label: 'Year', width: 40 },
        { label: 'Days Marked', width: 70, align: 'right' }, { label: 'Present', width: 60, align: 'right' },
        { label: 'Absent', width: 55, align: 'right' }, { label: 'Rate', width: 60, align: 'right' },
      ],
      rows: rows.map((r) => [
        r.admission_no, r.full_name, ordinal(r.year), r.marked, r.present, r.marked - r.present,
        r.marked ? ((r.present / r.marked) * 100).toFixed(1) + '%' : '--',
      ]),
    });
  });

  return router;
};
