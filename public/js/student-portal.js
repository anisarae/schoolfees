(async () => {
  const me = await App.init({ roles: ['student', 'admin'], active: 'student-portal.html' });
  const { api, esc, money } = App;
  const $ = (id) => document.getElementById(id);

  async function load(adm) {
    const d = await api('/api/portal/student' + (adm ? '?adm=' + encodeURIComponent(adm) : ''));
    const s = d.student;
    document.querySelector('.page-title p').textContent = `Welcome back, ${s.name}`;
    $('hdr').textContent = `${s.yearLabel} Year | Adm: ${s.admissionNo}`;
    $('lbl-total').textContent = `Total Fees (${s.yearLabel} Year)`;
    $('p-total').textContent = money(s.totalFees);
    $('p-paid').textContent = money(s.paid);
    $('p-balance').textContent = money(s.balance);

    const t = d.attendance.today;
    $('p-att').innerHTML = t
      ? `<span class="badge ${t === 'present' ? 'present' : 'absent'}">${t === 'present' ? 'Present Today' : 'Absent Today'}</span>`
      : '<span class="badge unmarked">Not marked today</span>';
    $('p-rate').textContent = d.attendance.rate === null ? '' : `Overall: ${d.attendance.rate}% over ${d.attendance.daysMarked} day(s)`;

    $('btn-statement').href = `/api/portal/statement/${encodeURIComponent(s.admissionNo)}.pdf`;
    App.fillRows(
      $('rows'),
      d.payments.map((p) => `
        <tr>
          <td>${esc(p.receiptNo)}</td>
          <td>${money(p.amount)}</td>
          <td>${esc(p.mode)}</td>
          <td>${App.prettyDate(p.paidOn)}</td>
          <td><a class="btn btn-outline" target="_blank" rel="noopener" href="receipt.html?no=${encodeURIComponent(p.receiptNo)}">View Receipt</a></td>
        </tr>`),
      5,
      'No payments recorded yet.'
    );
  }

  if (me.user.role === 'admin') {
    const { students } = await api('/api/students');
    $('admin-preview').hidden = false;
    const pick = $('pick');
    pick.innerHTML = students.map((s) => `<option value="${esc(s.admissionNo)}">${esc(s.admissionNo)} - ${esc(s.name)}</option>`).join('');
    pick.addEventListener('change', () => load(pick.value).catch((e) => App.toast(e.message, true)));
    if (students.length) await load(pick.value);
  } else {
    await load();
  }
})().catch((e) => e.message !== 'redirecting' && App.toast(e.message, true));
