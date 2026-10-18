(async () => {
  await App.init({ roles: ['admin'], active: 'receipts.html' });
  const { payments } = await App.api('/api/payments');
  App.fillRows(
    document.getElementById('rows'),
    payments.map((p) => `
      <tr>
        <td>${App.esc(p.receiptNo)}</td>
        <td>${App.esc(p.admissionNo)}</td>
        <td>${App.esc(p.studentName)}</td>
        <td>${App.esc(p.yearLabel)}</td>
        <td>${App.money(p.amount)}</td>
        <td>${App.esc(p.mode)}</td>
        <td>${App.prettyDate(p.paidOn)}</td>
        <td><a class="btn btn-outline" target="_blank" rel="noopener" href="receipt.html?no=${encodeURIComponent(p.receiptNo)}">Print Receipt</a></td>
      </tr>`),
    8,
    'No receipts issued yet.'
  );
})().catch((e) => e.message !== 'redirecting' && App.toast(e.message, true));
