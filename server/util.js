const crypto = require('crypto');

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/** Today's date (YYYY-MM-DD) in the school's timezone. */
function today(tz) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

function isValidDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function prettyDate(s) {
  if (!s) return '--';
  const [y, m, d] = s.split('-');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${d} ${months[Number(m) - 1]} ${y}`;
}

function money(n) {
  return 'KSh ' + Number(n).toLocaleString('en-US');
}

/** Random temporary password, e.g. "kP7x-Qm2a-Ru9z" (no look-alike characters). */
function tempPassword() {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(12);
  let out = '';
  for (let i = 0; i < 12; i++) {
    out += chars[bytes[i] % chars.length];
    if (i % 4 === 3 && i < 11) out += '-';
  }
  return out;
}

const PAYMENT_MODES = ['M-Pesa', 'Bank Deposit', 'Cash', 'Cheque'];

module.exports = { HttpError, today, isValidDate, prettyDate, money, tempPassword, PAYMENT_MODES };
