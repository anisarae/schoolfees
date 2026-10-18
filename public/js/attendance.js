(async () => {
  const me = await App.init({ roles: ['admin'], active: 'attendance.html' });
  const { api, esc, toast } = App;
  const dateInput = document.getElementById('date');
  const tbody = document.getElementById('rows');
  dateInput.value = me.today;
  dateInput.max = me.today;
  let students = [];

  function renderSummary() {
    const marked = students.filter((s) => s.status);
    const present = marked.filter((s) => s.status === 'present').length;
    document.getElementById('sum-present').textContent = present;
    document.getElementById('sum-absent').textContent = marked.length - present;
    document.getElementById('sum-rate').textContent = marked.length ? (Math.round((present / marked.length) * 1000) / 10) + '%' : '--';
    document.getElementById('date-label').textContent = App.prettyDate(dateInput.value);
  }

  function render() {
    App.fillRows(
      tbody,
      students.map((s, i) => {
        const cls = s.status === 'present' ? 'present' : s.status === 'absent' ? 'absent' : 'unmarked';
        const label = s.status ? s.status[0].toUpperCase() + s.status.slice(1) : 'Not marked';
        return `
          <tr>
            <td>${esc(s.admissionNo)}</td>
            <td>${esc(s.name)}</td>
            <td>${esc(s.yearLabel)}</td>
            <td><button class="badge toggle ${cls}" data-i="${i}">${label}</button></td>
          </tr>`;
      }),
      4,
      'No students yet.'
    );
    renderSummary();
  }

  async function load() {
    const data = await api('/api/attendance?date=' + encodeURIComponent(dateInput.value));
    students = data.students;
    render();
  }

  tbody.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-i]');
    if (!btn) return;
    const s = students[Number(btn.dataset.i)];
    s.status = s.status === 'present' ? 'absent' : 'present';
    render();
  });

  document.getElementById('btn-all-present').addEventListener('click', () => {
    students.forEach((s) => { s.status = 'present'; });
    render();
  });

  dateInput.addEventListener('change', () => { if (dateInput.value) load().catch((e) => toast(e.message, true)); });

  document.getElementById('btn-save').addEventListener('click', async () => {
    const records = students.filter((s) => s.status).map((s) => ({ admissionNo: s.admissionNo, status: s.status }));
    if (!records.length) return toast('Mark at least one student first.', true);
    const btn = document.getElementById('btn-save');
    btn.disabled = true;
    try {
      const data = await api('/api/attendance', { method: 'PUT', body: { date: dateInput.value, records } });
      students = data.students;
      render();
      const left = students.filter((s) => !s.status).length;
      toast(left ? `Attendance saved. ${left} student(s) still not marked.` : 'Attendance saved.');
    } catch (e) { toast(e.message, true); }
    finally { btn.disabled = false; }
  });

  await load();
})().catch((e) => e.message !== 'redirecting' && App.toast(e.message, true));
