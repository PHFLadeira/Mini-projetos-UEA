/* ══ matriculadas.js — aba "Matérias Matriculadas" (status = enrolled) ══ */

function _matEsc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function _matHours(h) {
  var n = parseInt(String(h || '').replace(/\D/g, ''), 10);
  return isNaN(n) ? 0 : n;
}

// disciplinas atualmente cursadas, na grade selecionada
function getEnrolledSubjects() {
  if (typeof DATA === 'undefined' || !DATA[window.G]) return [];
  return DATA[window.G].filter(function (sub) {
    return getSub(sub.id).status === 'enrolled';
  });
}
window.getEnrolledSubjects = getEnrolledSubjects;

// procura horário/sala da disciplina nos PDFs já carregados no Montador
function _matSchedule(code) {
  if (!window.S || !S.disciplines || !code) return null;
  var d = S.disciplines.find(function (x) {
    return x.code && x.code.toUpperCase() === code.toUpperCase();
  });
  if (!d || !d.schedule || !d.schedule.length) return d && d.room && d.room !== '?' ? { room: d.room, slots: [] } : null;
  return { room: d.room && d.room !== '?' ? d.room : '', slots: d.schedule };
}

function updateMatriculadasBadge() {
  var badge = document.getElementById('matriculadas-badge');
  if (!badge) return;
  var n = getEnrolledSubjects().length;
  if (n > 0) { badge.textContent = n; badge.classList.remove('hidden'); }
  else badge.classList.add('hidden');
}
window.updateMatriculadasBadge = updateMatriculadasBadge;

function renderMatriculadas() {
  updateMatriculadasBadge();
  var body = document.getElementById('mat-body');
  var statsEl = document.getElementById('mat-stats');
  if (!body) return;

  var subs = getEnrolledSubjects();

  if (!subs.length) {
    if (statsEl) statsEl.innerHTML = '';
    body.innerHTML =
      '<div class="mat-empty">' +
        '<div class="mat-empty-icon">🎓</div>' +
        '<p>Nenhuma matéria marcada como <b>Cursando</b>.</p>' +
        '<small>Importe seu histórico (o servidor lê as “Disciplinas Matriculadas”) ' +
        'ou marque manualmente na aba <b>Grade Curricular</b>.</small>' +
      '</div>';
    return;
  }

  subs = subs.slice().sort(function (a, b) { return a.period - b.period; });

  var totalCH = 0, semesters = {};
  subs.forEach(function (sub) {
    totalCH += _matHours(sub.hours);
    var sem = getSub(sub.id).semester;
    if (sem) semesters[sem] = true;
  });
  var semList = Object.keys(semesters);

  if (statsEl) {
    statsEl.innerHTML =
      '<div class="mat-stat"><span class="mat-stat-n">' + subs.length + '</span><span class="mat-stat-l">disciplina(s)</span></div>' +
      '<div class="mat-stat"><span class="mat-stat-n">' + totalCH + '</span><span class="mat-stat-l">horas/aula</span></div>' +
      (semList.length ? '<div class="mat-stat"><span class="mat-stat-n">' + _matEsc(semList.join(' · ')) + '</span><span class="mat-stat-l">semestre</span></div>' : '');
  }

  var DAY_ORDER = { Seg: 0, Ter: 1, Qua: 2, Qui: 3, Sex: 4, Sab: 5 };
  var html = '<div class="mat-grid">';
  subs.forEach(function (sub) {
    var d = getSub(sub.id);
    var code = d.realCode || sub.code;
    var name = d.realName || sub.name;
    var c = (typeof PC !== 'undefined' && PC[sub.period]) ? PC[sub.period].main : 'var(--accent2)';
    var sc = _matSchedule(code);
    var schedLine = '';
    if (sc && sc.slots && sc.slots.length) {
      var slots = sc.slots.slice().sort(function (a, b) {
        return (DAY_ORDER[a.day] - DAY_ORDER[b.day]) || (a.start < b.start ? -1 : 1);
      });
      schedLine = slots.map(function (s) {
        return _matEsc(s.day) + ' ' + _matEsc(s.start) + (s.end && s.end !== s.start ? '–' + _matEsc(s.end) : '');
      }).join(' · ');
      if (sc.room) schedLine += '  ·  Sala ' + _matEsc(sc.room);
    }

    html +=
      '<button class="mat-card" onclick="openModal(DATA[window.G].find(function(s){return s.id===\'' + sub.id + '\'}))">' +
        '<span class="mat-card-stripe" style="background:' + c + '"></span>' +
        '<span class="mat-card-code" style="color:' + c + '">' + _matEsc(code) + '</span>' +
        '<span class="mat-card-name">' + _matEsc(name) + '</span>' +
        '<span class="mat-card-tags">' +
          '<span class="mat-tag">' + sub.period + 'º período</span>' +
          (sub.hours && sub.hours !== '—' ? '<span class="mat-tag">' + _matEsc(sub.hours) + '</span>' : '') +
          (d.semester ? '<span class="mat-tag">' + _matEsc(d.semester) + '</span>' : '') +
        '</span>' +
        (schedLine
          ? '<span class="mat-card-sched">🕒 ' + schedLine + '</span>'
          : '<span class="mat-card-sched mat-card-sched-none">Horário não encontrado nos PDFs carregados</span>') +
      '</button>';
  });
  html += '</div>';

  // disciplinas fora da grade (opção externa marcada na importação não é armazenada como matéria) — aviso leve
  html +=
    '<p class="mat-foot">Baseado no que está marcado como <b>Cursando</b> na grade ' +
    _matEsc(window.G === 'CMP_2018' ? 'Computação 2018' : 'ECA ' + window.G) +
    '. Clique numa matéria para abrir os detalhes ou mudar o status.</p>';

  body.innerHTML = html;
}
window.renderMatriculadas = renderMatriculadas;
