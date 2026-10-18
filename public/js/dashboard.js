(async () => {
  await App.init({ roles: ['admin'], active: 'index.html' });
  const d = await App.api('/api/dashboard');
  const $ = (id) => document.getElementById(id);

  $('st-students').textContent = d.studentCount.toLocaleString('en-US');
  $('st-collected').textContent = App.money(d.collected);
  $('st-outstanding').textContent = App.money(d.outstanding);
  $('st-attendance').textContent = d.attendanceToday.rate === null ? 'Not marked' : d.attendanceToday.rate + '%';

  App.fillRows(
    $('recent'),
    d.recentPayments.map((p) => `
      <tr>
        <td>${App.esc(p.studentName)}</td>
        <td>${App.esc(p.admissionNo)}</td>
        <td>${App.money(p.amount)}</td>
        <td>${App.prettyDate(p.paidOn)}</td>
        <td>${App.feeBadge(p.feeStatus)}</td>
      </tr>`),
    5,
    'No payments recorded yet.'
  );
})().catch((e) => e.message !== 'redirecting' && App.toast(e.message, true));
