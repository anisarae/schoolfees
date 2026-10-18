const express = require('express');
const { HttpError, today, isValidDate, PAYMENT_MODES } = require('../util');
const { getStudentSummary, ordinal } = require('../db');

const PAYMENT_SELECT = `
  SELECT p.id, p.receipt_no, p.amount, p.mode, p.reference, p.paid_on, p.created_at,
         s.id AS student_id, s.admission_no, s.full_name, s.year, s.total_fees,
         u.full_name AS recorded_by
  FROM payments p
  JOIN students s ON s.id = p.student_id
  LEFT JOIN users u ON u.id = p.recorded_by`;

function shape(r) {
  return {
    receiptNo: r.receipt_no,
    admissionNo: r.admission_no,
    studentName: r.full_name,
    yearLabel: ordinal(r.year),
    amount: r.amount,
    mode: r.mode,
    reference: r.reference,
    paidOn: r.paid_on,
  };
}

function nextReceiptNo(db, year) {
  const prefix = `RCT-${year}-`;
  const row = db
    .prepare('SELECT MAX(CAST(SUBSTR(receipt_no, ?) AS INTEGER)) AS n FROM payments WHERE receipt_no LIKE ?')
    .get(prefix.length + 1, prefix + '%');
  return prefix + String((row.n || 0) + 1).padStart(3, '0');
}

module.exports = function paymentRoutes({ db, auth, config }) {
  const router = express.Router();

  /** List of issued receipts (admin only), newest first. */
  router.get('/payments', auth.requireRole('admin'), (req, res) => {
    const adm = req.query.admissionNo;
    const rows = adm
      ? db.prepare(PAYMENT_SELECT + ' WHERE s.admission_no = ? ORDER BY p.paid_on DESC, p.id DESC').all(adm)
      : db.prepare(PAYMENT_SELECT + ' ORDER BY p.paid_on DESC, p.id DESC').all();
    res.json({ payments: rows.map(shape) });
  });

  /** Record a new payment (admin only). */
  router.post('/payments', auth.requireRole('admin'), (req, res) => {
    const b = req.body || {};
    const admissionNo = String(b.admissionNo || '').trim();
    const amount = Number(b.amount);
    const mode = String(b.mode || '').trim();
    const reference = String(b.reference || '').trim().slice(0, 60) || null;
    const todayStr = today(config.timezone);
    const paidOn = b.paidOn ? String(b.paidOn) : todayStr;

    if (!Number.isInteger(amount) || amount <= 0) throw new HttpError(400, 'Amount must be a whole number of shillings greater than 0.');
    if (!PAYMENT_MODES.includes(mode)) throw new HttpError(400, `Payment mode must be one of: ${PAYMENT_MODES.join(', ')}.`);
    if (!isValidDate(paidOn)) throw new HttpError(400, 'Payment date is not valid.');
    if (paidOn > todayStr) throw new HttpError(400, 'Payment date cannot be in the future.');

    let receiptNo;
    db.transaction(() => {
      const student = getStudentSummary(db, admissionNo);
      if (!student) throw new HttpError(404, 'Student not found.');
      if (student.balance <= 0) throw new HttpError(409, `${student.name} has no outstanding balance.`);
      if (amount > student.balance) {
        throw new HttpError(409, `Amount exceeds the outstanding balance of KSh ${student.balance.toLocaleString('en-US')}.`);
      }
      receiptNo = nextReceiptNo(db, paidOn.slice(0, 4));
      db.prepare(
        'INSERT INTO payments (receipt_no, student_id, amount, mode, reference, paid_on, recorded_by) VALUES (?,?,?,?,?,?,?)'
      ).run(receiptNo, student.id, amount, mode, reference, paidOn, req.user.id);
    })();

    res.status(201).json({ receiptNo, student: getStudentSummary(db, admissionNo) });
  });

  /** One receipt, for printing. Admin: any. Student/parent: only their own. */
  router.get('/receipts/:no', auth.requireLogin, (req, res) => {
    const r = db.prepare(PAYMENT_SELECT + ' WHERE p.receipt_no = ?').get(req.params.no);
    // Same message for "missing" and "not yours" so receipt numbers can't be probed.
    if (!r || !auth.canAccessStudent(req.user, r.student_id)) throw new HttpError(404, 'Receipt not found.');
    const { total: paidUpTo } = db
      .prepare('SELECT COALESCE(SUM(amount),0) AS total FROM payments WHERE student_id = ? AND id <= ?')
      .get(r.student_id, r.id);
    res.json({
      receipt: {
        ...shape(r),
        recordedBy: r.recorded_by,
        totalFees: r.total_fees,
        balanceAfter: r.total_fees - paidUpTo,
        school: config.schoolName,
      },
    });
  });

  return router;
};
