const express = require('express');
const { HttpError, today, prettyDate, money } = require('../util');
const { getStudentSummary, getStudentSummaryById, listStudentSummaries } = require('../db');
const { tablePdf } = require('../pdf');

module.exports = function portalRoutes({ db, auth, config }) {
  const router = express.Router();
  router.use(auth.requireLogin);

  const paymentsFor = (studentId) =>
    db.prepare('SELECT receipt_no, amount, mode, reference, paid_on FROM payments WHERE student_id = ? ORDER BY paid_on DESC, id DESC')
      .all(studentId)
      .map((p) => ({ receiptNo: p.receipt_no, amount: p.amount, mode: p.mode, reference: p.reference, paidOn: p.paid_on }));

  function attendanceFor(studentId) {
    const date = today(config.timezone);
    const todayRow = db.prepare('SELECT status FROM attendance WHERE student_id = ? AND date = ?').get(studentId, date);
    const agg = db.prepare("SELECT COUNT(*) AS marked, COALESCE(SUM(status='present'),0) AS present FROM attendance WHERE student_id = ?").get(studentId);
    return {
      today: todayRow ? todayRow.status : null,
      daysMarked: agg.marked,
      rate: agg.marked ? Math.round((agg.present / agg.marked) * 1000) / 10 : null,
    };
  }

  /** Student portal. Students see themselves; admins can preview any student with ?adm= */
  router.get('/student', auth.requireRole('student', 'admin'), (req, res) => {
    let student;
    if (req.user.role === 'student') {
      student = getStudentSummaryById(db, req.user.student_id);
    } else {
      student = req.query.adm ? getStudentSummary(db, String(req.query.adm)) : listStudentSummaries(db)[0];
    }
    if (!student) throw new HttpError(404, 'Student not found.');
    res.json({ student, payments: paymentsFor(student.id), attendance: attendanceFor(student.id) });
  });

  /** Parent portal. Parents see their linked children; admins can preview one student with ?adm= */
  router.get('/parent', auth.requireRole('parent', 'admin'), (req, res) => {
    let children;
    if (req.user.role === 'parent') {
      const ids = db.prepare('SELECT student_id FROM parent_students WHERE user_id = ?').all(req.user.id).map((r) => r.student_id);
      children = ids.map((id) => getStudentSummaryById(db, id));
    } else {
      const s = req.query.adm ? getStudentSummary(db, String(req.query.adm)) : listStudentSummaries(db)[0];
      children = s ? [s] : [];
    }
    res.json({
      children: children.map((c) => ({ ...c, attendance: attendanceFor(c.id), payments: paymentsFor(c.id) })),
    });
  });

  /** Fee statement PDF for one student. */
  router.get('/statement/:adm.pdf', (req, res) => {
    const student = getStudentSummary(db, req.params.adm);
    if (!student || !auth.canAccessStudent(req.user, student.id)) throw new HttpError(404, 'Student not found.');
    const payments = paymentsFor(student.id);
    tablePdf(res, `fee-statement-${student.admissionNo}.pdf`, {
      school: config.schoolName,
      title: 'Fee Statement',
      subtitle: `${student.name}  |  ${student.admissionNo}  |  ${student.yearLabel} year`,
      meta: [
        `Generated ${prettyDate(today(config.timezone))}`,
        `Total fees: ${money(student.totalFees)}    Paid: ${money(student.paid)}    Balance: ${money(student.balance)}`,
      ],
      columns: [
        { label: 'Receipt No.', width: 110 }, { label: 'Date', width: 100 },
        { label: 'Payment Mode', width: 140 }, { label: 'Amount', width: 145, align: 'right' },
      ],
      rows: payments.map((p) => [p.receiptNo, prettyDate(p.paidOn), p.mode, money(p.amount)]),
      totals: [['TOTAL PAID', '', '', money(student.paid)], ['BALANCE', '', '', money(student.balance)]],
    });
  });

  return router;
};
