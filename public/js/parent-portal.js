(async () => {
  const me = await App.init({ roles: ['parent', 'admin'], active: 'parent-portal.html' });
  const { api, esc, money } = App;
  const $ = (id) => document.getElementById(id);

  async function load(adm) {
    const { children } = await api('/api/portal/parent' + (adm ? '?adm=' + encodeURIComponent(adm) : ''));
    $('hdr').textContent = children.length
      ? 'Linked Student' + (children.length > 1 ? 's' : '') + ': ' + children.map((c) => `${c.name} (${c.admissionNo})`).join(', ')
      : 'No linked students';
    App.fillRows(
      $('rows'),
      children.map((c) => `
        <tr>
          <td>${esc(c.admissionNo)}</td>
          <td>${esc(c.name)}</td>
          <td>${esc(c.yearLabel)}</td>
          <td>${money(c.totalFees)}</td>
          <td>${money(c.balance)}</td>
          <td>${c.attendance.rate === null ? '--' : c.attendance.rate + '%'}</td>
          <td>${App.feeBadge(c.status)}</td>
          <td><a class="btn btn-outline" href="/api/portal/statement/${encodeURIComponent(c.admissionNo)}.pdf">View Statement</a></td>
        </tr>`),
      8,
      'No children are linked to your account yet. Please contact the school office.'
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
