(async () => {
  await App.init({ roles: ['admin'], active: 'reports.html' });
  const s = await App.api('/api/reports/summary');
  const $ = (id) => document.getElementById(id);
  $('lbl-expected').textContent = `Total Expected Fees (${s.studentCount} Students)`;
  $('rep-count').textContent = `Summary of all ${s.studentCount} students' payments`;
  $('rep-expected').textContent = App.money(s.expected);
  $('rep-collected').textContent = App.money(s.collected);
  $('rep-outstanding').textContent = App.money(s.outstanding);
})().catch((e) => e.message !== 'redirecting' && App.toast(e.message, true));
