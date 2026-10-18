(async () => {
  const me = await App.init({ roles: ['admin', 'student', 'parent'], active: '' });
  const no = new URLSearchParams(location.search).get('no');
  const box = document.getElementById('receipt');
  if (!no) { box.innerHTML = '<p class="muted">No receipt number given.</p>'; return; }
  try {
    const { receipt: r } = await App.api('/api/receipts/' + encodeURIComponent(no));
    document.title = `Receipt ${r.receiptNo} - FeeFlow`;
    const e = App.esc;
    box.innerHTML = `
      <h1>${e(r.school)}</h1>
      <p class="receipt-title">Official Payment Receipt</p>
      <dl>
        <dt>Receipt No.</dt><dd>${e(r.receiptNo)}</dd>
        <dt>Date</dt><dd>${App.prettyDate(r.paidOn)}</dd>
        <dt>Student</dt><dd>${e(r.studentName)}</dd>
        <dt>Admission No.</dt><dd>${e(r.admissionNo)}</dd>
        <dt>Year</dt><dd>${e(r.yearLabel)}</dd>
        <dt>Payment mode</dt><dd>${e(r.mode)}</dd>
        ${r.reference ? `<dt>Reference</dt><dd>${e(r.reference)}</dd>` : ''}
        <dt>Total fees</dt><dd>${App.money(r.totalFees)}</dd>
        <dt>Balance after</dt><dd>${App.money(r.balanceAfter)}</dd>
        ${r.recordedBy ? `<dt>Received by</dt><dd>${e(r.recordedBy)}</dd>` : ''}
      </dl>
      <div class="amount-line"><span>Amount paid</span><span>${App.money(r.amount)}</span></div>
      <div class="receipt-actions no-print">
        <button class="btn" id="btn-print">Print</button>
        <button class="btn btn-outline" id="btn-back">Back</button>
      </div>
      <p class="thanks">Thank you for your payment.</p>`;
    document.getElementById('btn-print').addEventListener('click', () => window.print());
    document.getElementById('btn-back').addEventListener('click', () => {
      if (window.history.length > 1 && !window.opener) history.back();
      else if (window.opener) window.close();
      else location.href = me.user.home;
    });
  } catch (err) {
    box.innerHTML = `<p class="form-error">${App.esc(err.message)}</p>`;
  }
})().catch((e) => e.message !== 'redirecting' && App.toast(e.message, true));
