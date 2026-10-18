const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS students (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  admission_no TEXT NOT NULL UNIQUE COLLATE NOCASE,
  full_name    TEXT NOT NULL,
  year         INTEGER NOT NULL CHECK (year BETWEEN 1 AND 8),
  total_fees   INTEGER NOT NULL CHECK (total_fees >= 0),
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  username             TEXT NOT NULL UNIQUE COLLATE NOCASE,
  email                TEXT UNIQUE COLLATE NOCASE,
  password_hash        TEXT NOT NULL,
  role                 TEXT NOT NULL CHECK (role IN ('admin','student','parent')),
  full_name            TEXT NOT NULL,
  student_id           INTEGER REFERENCES students(id),
  must_change_password INTEGER NOT NULL DEFAULT 0,
  created_at           TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS parent_students (
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, student_id)
);

CREATE TABLE IF NOT EXISTS payments (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  receipt_no  TEXT NOT NULL UNIQUE,
  student_id  INTEGER NOT NULL REFERENCES students(id),
  amount      INTEGER NOT NULL CHECK (amount > 0),
  mode        TEXT NOT NULL,
  reference   TEXT,
  paid_on     TEXT NOT NULL,
  recorded_by INTEGER REFERENCES users(id),
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_payments_student ON payments(student_id);

CREATE TABLE IF NOT EXISTS attendance (
  student_id INTEGER NOT NULL REFERENCES students(id),
  date       TEXT NOT NULL,
  status     TEXT NOT NULL CHECK (status IN ('present','absent')),
  PRIMARY KEY (student_id, date)
);
`;

function openDb(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  return db;
}

/* ---------- Demo data (taken from the original static pages) ---------- */
const DEMO_STUDENTS = [
  ['STU001', 'Brian Mwangi', 3, 111400],
  ['STU002', 'Amina Juma', 2, 111200],
  ['STU003', 'Kevin Otieno', 4, 114000],
  ['STU004', 'Faith Cheptoo', 1, 100000],
  ['STU005', 'David Kiprono', 3, 115000],
  ['STU006', 'Grace Wanjiku', 2, 115000],
  ['STU007', 'Emmanuel Ochieng', 4, 112000],
  ['STU008', 'Mercy Mutheu', 1, 112000],
  ['STU009', 'Baraka Juma', 3, 80000],
  ['STU010', 'Sharon Jerotich', 2, 115000],
];
// [receipt, admission, amount, mode, date]
const DEMO_PAYMENTS = [
  ['RCT-2026-081', 'STU001', 45000, 'Bank Deposit', '2026-10-10'],
  ['RCT-2026-082', 'STU002', 100000, 'M-Pesa', '2026-10-09'],
  ['RCT-2026-083', 'STU003', 50000, 'Bank Deposit', '2026-10-10'],
  ['RCT-2026-084', 'STU004', 20000, 'M-Pesa', '2026-10-08'],
  ['RCT-2026-085', 'STU005', 30000, 'Bank Deposit', '2026-10-07'],
  ['RCT-2026-086', 'STU006', 57500, 'M-Pesa', '2026-10-10'],
  ['RCT-2026-088', 'STU008', 64000, 'Bank Deposit', '2026-10-09'],
  ['RCT-2026-089', 'STU009', 45000, 'M-Pesa', '2026-10-05'],
  ['RCT-2026-090', 'STU010', 45000, 'Bank Deposit', '2026-10-10'],
];
const DEMO_ABSENT_10_OCT = ['STU004', 'STU007'];

function seedDemoData(db, { adminPassword, studentPassword, parentPassword }) {
  const hash = (p) => bcrypt.hashSync(p, 10);
  const tx = db.transaction(() => {
    const insStudent = db.prepare('INSERT INTO students (admission_no, full_name, year, total_fees) VALUES (?,?,?,?)');
    const ids = {};
    for (const [adm, name, year, fees] of DEMO_STUDENTS) ids[adm] = insStudent.run(adm, name, year, fees).lastInsertRowid;

    const insUser = db.prepare(
      'INSERT INTO users (username, email, password_hash, role, full_name, student_id) VALUES (?,?,?,?,?,?)'
    );
    const adminId = insUser.run('admin', 'admin@feeflow.edu', hash(adminPassword), 'admin', 'Administrator', null).lastInsertRowid;
    insUser.run('STU001', 'brian.mwangi@feeflow.edu', hash(studentPassword), 'student', 'Brian Mwangi', ids.STU001);
    const parentId = insUser.run('parent1', 'parent1@feeflow.edu', hash(parentPassword), 'parent', 'Parent of Brian Mwangi', null).lastInsertRowid;
    db.prepare('INSERT INTO parent_students (user_id, student_id) VALUES (?,?)').run(parentId, ids.STU001);

    const insPay = db.prepare(
      'INSERT INTO payments (receipt_no, student_id, amount, mode, paid_on, recorded_by) VALUES (?,?,?,?,?,?)'
    );
    for (const [rno, adm, amt, mode, date] of DEMO_PAYMENTS) insPay.run(rno, ids[adm], amt, mode, date, adminId);

    const insAtt = db.prepare('INSERT INTO attendance (student_id, date, status) VALUES (?,?,?)');
    for (const [adm] of DEMO_STUDENTS) {
      insAtt.run(ids[adm], '2026-10-10', DEMO_ABSENT_10_OCT.includes(adm) ? 'absent' : 'present');
    }
  });
  tx();
}

function isEmpty(db) {
  return db.prepare('SELECT COUNT(*) AS n FROM users').get().n === 0;
}

/* ---------- Shared fee calculations ---------- */
function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function feeStatus(total, paid) {
  return total - paid <= 0 ? 'Cleared' : 'Pending';
}

const SUMMARY_SQL = `
  SELECT s.id, s.admission_no, s.full_name, s.year, s.total_fees,
         COALESCE((SELECT SUM(amount) FROM payments p WHERE p.student_id = s.id), 0) AS paid
  FROM students s`;

function toSummary(r) {
  const balance = r.total_fees - r.paid;
  return {
    id: r.id,
    admissionNo: r.admission_no,
    name: r.full_name,
    year: r.year,
    yearLabel: ordinal(r.year),
    totalFees: r.total_fees,
    paid: r.paid,
    balance,
    status: feeStatus(r.total_fees, r.paid),
  };
}

function listStudentSummaries(db) {
  return db.prepare(SUMMARY_SQL + ' ORDER BY s.admission_no').all().map(toSummary);
}

function getStudentSummary(db, admissionNo) {
  const r = db.prepare(SUMMARY_SQL + ' WHERE s.admission_no = ?').get(admissionNo);
  return r ? toSummary(r) : null;
}

function getStudentSummaryById(db, id) {
  const r = db.prepare(SUMMARY_SQL + ' WHERE s.id = ?').get(id);
  return r ? toSummary(r) : null;
}

module.exports = {
  openDb, seedDemoData, isEmpty, ordinal, feeStatus,
  listStudentSummaries, getStudentSummary, getStudentSummaryById,
};
