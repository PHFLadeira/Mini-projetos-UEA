/* ══ consulta.js — Consulta de Horários ══ */

var CONSULTA_DAYS = ['Seg','Ter','Qua','Qui','Sex','Sab'];
var CONSULTA_SLOTS = [
  ['07:30','08:20'],['08:20','09:10'],['09:10','10:00'],['10:00','10:50'],
  ['10:50','11:40'],['11:40','12:30'],['13:00','13:50'],['13:50','14:40'],
  ['14:40','15:30'],['15:30','16:20'],['16:20','17:10'],['17:10','18:00'],
  ['18:00','18:50'],['18:50','19:40'],['19:40','20:30'],['20:30','21:20'],
  ['21:20','22:10']
];
var CONSULTA_COLORS = [
  '#7c7fff','#34d399','#fbbf24','#d946ef','#60a5fa',
  '#f87171','#22c55e','#f97316','#8b5cf6','#06b6d4'
];

function getConsultaDiscs() {
  return (window.S && window.S.disciplines) ? window.S.disciplines : [];
}

function getDiscShift(disc) {
  if(!disc.schedule || !disc.schedule.length) return '';
  var h = parseInt(disc.schedule[0].start.split(':')[0]);
  if(h < 13) return 'manha';
  if(h < 18) return 'tarde';
  return 'noite';
}

function cEsc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function updateConsultaFilters(discs) {
  var courseSelect = document.getElementById('consulta-course-filter');
  var periodSelect = document.getElementById('consulta-period-filter');
  if(!courseSelect || !periodSelect) return;
  var cc = courseSelect.value, cp = periodSelect.value;
  var courses = [], periods = [];
  discs.forEach(function(d) {
    (d.courses || [d.course]).forEach(function(c){ if(courses.indexOf(c) === -1) courses.push(c); });
    var allPeriods = d.periodsByCourse ? Object.values(d.periodsByCourse) : [d.period];
    allPeriods.forEach(function(p){ if(p && periods.indexOf(p) === -1) periods.push(p); });
  });
  courses.sort();
  periods.sort(function(a, b) { return (parseInt(a) || 999) - (parseInt(b) || 999); });
  courseSelect.innerHTML = '<option value="all">Todos os cursos</option>';
  courses.forEach(function(c) {
    var o = document.createElement('option');
    o.value = c; o.textContent = c;
    if(c === cc) o.selected = true;
    courseSelect.appendChild(o);
  });
  periodSelect.innerHTML = '<option value="all">Todos os períodos</option>';
  periods.forEach(function(p) {
    var o = document.createElement('option');
    o.value = p; o.textContent = p;
    if(p === cp) o.selected = true;
    periodSelect.appendChild(o);
  });
}

function renderConsultaGrid(body, discs) {
  function t2m(t) { var p = t.split(':'); return parseInt(p[0]) * 60 + parseInt(p[1]); }

  var slotMap = {}, activeDays = {}, activeSlots = {};
  var colorIdx = {};
  var ci = 0;

  discs.forEach(function(d) {
    if(!d.schedule || !d.schedule.length) return;
    if(!colorIdx.hasOwnProperty(d.code)) colorIdx[d.code] = ci++ % CONSULTA_COLORS.length;
    d.schedule.forEach(function(s) {
      activeDays[s.day] = true;
      var sStart = t2m(s.start), sEnd = t2m(s.end);
      for(var si = 0; si < CONSULTA_SLOTS.length; si++) {
        var slStart = t2m(CONSULTA_SLOTS[si][0]), slEnd = t2m(CONSULTA_SLOTS[si][1]);
        if(slStart >= sStart && slEnd <= sEnd) {
          var key = si + '|' + s.day;
          activeSlots[si] = true;
          if(!slotMap[key]) slotMap[key] = [];
          if(!slotMap[key].some(function(x) { return x.code === d.code; })) slotMap[key].push(d);
        }
      }
    });
  });

  var usedDays = CONSULTA_DAYS.filter(function(d) { return activeDays[d]; });
  if(!usedDays.length) usedDays = CONSULTA_DAYS.slice(0, 5);
  var usedSlots = [];
  for(var si2 = 0; si2 < CONSULTA_SLOTS.length; si2++) { if(activeSlots[si2]) usedSlots.push(si2); }

  if(!usedSlots.length) {
    body.innerHTML = '<div class="consulta-empty"><div style="font-size:1.5rem;margin-bottom:8px;">📋</div><div style="color:#7a82a0;font-size:.8rem;">' + discs.length + ' disciplina(s) encontrada(s), mas nenhuma com horário definido.</div></div>';
    return;
  }

  var h = '<div class="cg-grid" style="grid-template-columns:60px repeat(' + usedDays.length + ',1fr);">';
  h += '<div class="cg-corner">Horário</div>';
  usedDays.forEach(function(d) { h += '<div class="cg-day-hdr">' + d + '</div>'; });

  usedSlots.forEach(function(si3) {
    h += '<div class="cg-time">' + CONSULTA_SLOTS[si3][0] + '<br><span style="opacity:.5">' + CONSULTA_SLOTS[si3][1] + '</span></div>';
    usedDays.forEach(function(day) {
      var key = si3 + '|' + day;
      var items = slotMap[key] || [];
      h += '<div class="cg-cell">';
      items.forEach(function(d) {
        var color = CONSULTA_COLORS[colorIdx[d.code] || 0];
        var titleText = d.name + '\n' + d.code + ' — ' + d.course + '\nSala: ' + d.room + '\n' +
          d.schedule.map(function(s) { return s.day + ' ' + s.start + '-' + s.end; }).join(', ');
        h += '<div class="cg-ev" style="background:' + color + '18;border-left-color:' + color + ';color:' + color + ';" title="' + cEsc(titleText) + '">' +
          '<div class="cg-ev-name">' + cEsc(d.name) + '</div>' +
          '<div class="cg-ev-meta">' + cEsc(d.code) + ' · ' + cEsc(d.room) + '</div></div>';
      });
      h += '</div>';
    });
  });
  h += '</div>';

  // No-schedule disciplines
  var noSched = discs.filter(function(d) { return !d.schedule || !d.schedule.length; });
  if(noSched.length) {
    h += '<div style="margin-top:16px;padding:12px 14px;background:rgba(251,191,36,.05);border:1px solid rgba(251,191,36,.12);border-radius:9px;">';
    h += '<div style="font-size:.72rem;font-weight:700;color:#fbbf24;margin-bottom:6px;">⚠ ' + noSched.length + ' disciplina(s) sem horário definido</div>';
    noSched.forEach(function(d) {
      h += '<div style="font-size:.65rem;color:#7a82a0;margin-bottom:2px;">• <span style="color:#e8eaf0;">' + cEsc(d.name) + '</span> <span style="opacity:.6;">(' + cEsc(d.code) + ' — ' + cEsc(d.course) + ')</span></div>';
    });
    h += '</div>';
  }

  // Legend
  h += '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:12px;">';
  var seen = {};
  discs.forEach(function(d) {
    if(!d.schedule || !d.schedule.length || seen[d.code]) return;
    seen[d.code] = true;
    var color = CONSULTA_COLORS[colorIdx[d.code] || 0];
    h += '<div style="display:flex;align-items:center;gap:4px;font-size:.62rem;color:#7a82a0;">' +
      '<div style="width:8px;height:8px;border-radius:2px;background:' + color + '33;border-left:2px solid ' + color + ';"></div>' +
      cEsc(d.name.substring(0, 30)) + '</div>';
  });
  h += '</div>';

  body.innerHTML = h;
}

function renderConsultaTable(body, discs) {
  if(!discs.length) {
    body.innerHTML = '<div class="consulta-empty"><div style="color:#7a82a0;font-size:.8rem;">Nenhuma disciplina encontrada.</div></div>';
    return;
  }
  var h = '<table class="ct-table"><thead><tr><th>Código</th><th>Disciplina</th><th>Curso</th><th>Período</th><th>CH</th><th>Horário</th><th>Sala</th><th>Vagas</th></tr></thead><tbody>';
  discs.forEach(function(d) {
    var sched = d.schedule && d.schedule.length
      ? d.schedule.map(function(s) { return s.day + ' ' + s.start + '-' + s.end; }).join(', ')
      : '<span style="color:#7a82a0;font-style:italic;">Sem horário</span>';
    var shift = getDiscShift(d);
    var shiftLabel = shift === 'manha' ? 'Manhã' : shift === 'tarde' ? 'Tarde' : shift === 'noite' ? 'Noite' : '';
    h += '<tr><td><span class="ct-code">' + cEsc(d.code) + '</span></td>' +
      '<td><span class="ct-name">' + cEsc(d.name) + '</span></td>' +
      '<td><span class="ct-tag ct-course-tag">' + cEsc(d.course) + '</span></td>' +
      '<td>' + (d.period && d.period !== '?' ? '<span class="ct-tag ct-period-tag">' + cEsc(d.period) + '</span>' : '—') + '</td>' +
      '<td>' + (d.ch || '—') + '</td>' +
      '<td class="ct-sched">' + sched + (shiftLabel ? ' <span class="ct-tag ct-shift-tag">' + shiftLabel + '</span>' : '') + '</td>' +
      '<td>' + cEsc(d.room || '?') + '</td>' +
      '<td>' + (d.vagas || '—') + '</td></tr>';
  });
  h += '</tbody></table>';
  body.innerHTML = h;
}

function renderConsultaPDF(body, discs) {
  if(!discs.length) {
    body.innerHTML = '<div class="consulta-empty"><div style="color:#7a82a0;font-size:.8rem;">Nenhuma disciplina encontrada.</div></div>';
    return;
  }

  var ALL_DAYS = ['Seg','Ter','Qua','Qui','Sex','Sab'];
  var DAY_HDR  = {'Seg':'2ª','Ter':'3ª','Qua':'4ª','Qui':'5ª','Sex':'6ª','Sab':'Sáb'};

  var activeDaysMap = {};
  discs.forEach(function(d) {
    if(d.schedule) d.schedule.forEach(function(s) { activeDaysMap[s.day] = true; });
  });
  var usedDays = ALL_DAYS.filter(function(d) { return activeDaysMap[d]; });
  if(!usedDays.length) usedDays = ALL_DAYS.slice(0,5);

  var groups = {};
  discs.forEach(function(d) {
    var c = d.course || 'Sem curso';
    var p = d.period  || '?';
    if(!groups[c]) groups[c] = {};
    if(!groups[c][p]) groups[c][p] = [];
    groups[c][p].push(d);
  });

  function periodLabel(p) {
    if(p === 'Opt.' || p === 'Optativa' || p === 'Optativas') return 'DISCIPLINAS OPTATIVAS';
    if(p === 'Extra' || p === 'Fora de Período') return 'DISCIPLINAS FORA DO PERÍODO';
    if(!p || p === '?') return 'SEM PERÍODO DEFINIDO';
    return p.replace(/^(\d+)/, '$1º PERÍODO');
  }

  function periodOrder(p) {
    var n = parseInt(p);
    if(!isNaN(n)) return n;
    if(p === 'Opt.' || p === 'Optativa' || p === 'Optativas') return 900;
    if(p === 'Extra' || p === 'Fora de Período') return 950;
    return 999;
  }

  var h = '';
  Object.keys(groups).sort().forEach(function(course) {
    h += '<div class="cpdf-course">';
    h += '<div class="cpdf-course-hdr">' + cEsc(course.toUpperCase()) + '</div>';

    var periodMap = groups[course];
    Object.keys(periodMap).sort(function(a,b){ return periodOrder(a) - periodOrder(b); }).forEach(function(period) {
      var rows = periodMap[period];

      h += '<div class="cpdf-period">';
      h += '<div class="cpdf-period-hdr">' + periodLabel(period) + '</div>';
      h += '<div class="cpdf-tbl-wrap"><table class="cpdf-tbl"><thead><tr>';
      h += '<th class="cpdf-th-code">SIGLA</th>';
      h += '<th class="cpdf-th-name">DISCIPLINA</th>';
      h += '<th class="cpdf-th-num">CT</th>';
      h += '<th class="cpdf-th-num">CH</th>';
      h += '<th class="cpdf-th-pre">PRÉ-REQ</th>';
      h += '<th class="cpdf-th-num">VAGAS</th>';
      h += '<th class="cpdf-th-room">SALA</th>';
      usedDays.forEach(function(day) {
        h += '<th class="cpdf-th-day">' + (DAY_HDR[day]||day) + '</th>';
      });
      h += '</tr></thead><tbody>';

      rows.forEach(function(d, ri) {
        var byDay = {};
        if(d.schedule) d.schedule.forEach(function(s){ byDay[s.day] = s; });
        var hasClass = d.schedule && d.schedule.length > 0;
        h += '<tr class="cpdf-row' + (ri%2===1?' cpdf-row-alt':'') + '">';
        h += '<td class="cpdf-td-code">' + cEsc(d.code) + '</td>';
        h += '<td class="cpdf-td-name">' + cEsc(d.name) + '</td>';
        h += '<td class="cpdf-td-num">' + (d.ct||'—') + '</td>';
        h += '<td class="cpdf-td-num">' + (d.ch||'—') + '</td>';
        h += '<td class="cpdf-td-pre">' + cEsc(d.prereq||'—') + '</td>';
        h += '<td class="cpdf-td-num">' + (d.vagas||'—') + '</td>';
        h += '<td class="cpdf-td-room">' + cEsc(d.room||'?') + '</td>';
        usedDays.forEach(function(day) {
          var s = byDay[day];
          if(s) {
            h += '<td class="cpdf-td-day cpdf-active">' + cEsc(s.start) + '<br>' + cEsc(s.end) + '</td>';
          } else {
            h += '<td class="cpdf-td-day"></td>';
          }
        });
        h += '</tr>';
      });

      h += '</tbody></table></div></div>';
    });
    h += '</div>';
  });
  body.innerHTML = h;
}

function renderConsulta() {
  var discs = getConsultaDiscs();
  var body = document.getElementById('consulta-body');
  var statsEl = document.getElementById('consulta-stats');
  if(!body) return;

  if(!discs.length) {
    body.innerHTML = '<div class="consulta-empty"><div style="font-size:2.5rem;margin-bottom:12px;">📄</div>' +
      '<div style="font-size:1rem;font-weight:600;color:#e8eaf0;margin-bottom:6px;">Nenhum horário carregado</div>' +
      '<div style="color:#7a82a0;font-size:.8rem;line-height:1.6;">Carregue PDFs de horários acadêmicos na aba<br>' +
      '<b style="color:#9a9bff;">Montador de Horários</b> → aba PDFs<br>para visualizá-los aqui.</div></div>';
    if(statsEl) statsEl.innerHTML = '';
    updateConsultaFilters(discs);
    return;
  }

  var search = (document.getElementById('consulta-search') || {}).value || '';
  search = search.toLowerCase().trim();
  var courseFilter = (document.getElementById('consulta-course-filter') || {}).value || 'all';
  var periodFilter = (document.getElementById('consulta-period-filter') || {}).value || 'all';
  var shiftFilter = (document.getElementById('consulta-shift-filter') || {}).value || 'all';
  var viewMode = (document.getElementById('consulta-view-mode') || {}).value || 'grid';

  var filtered = discs.filter(function(d) {
    if(search) {
      var haystack = ((d.courses || [d.course]).join(' ') + ' ' + d.name + ' ' + d.code).toLowerCase();
      if(haystack.indexOf(search) === -1) return false;
    }
    if(courseFilter !== 'all') {
      var dc = d.courses || [d.course];
      if(dc.indexOf(courseFilter) === -1) return false;
    }
    if(periodFilter !== 'all') {
      var allP = d.periodsByCourse ? Object.values(d.periodsByCourse) : [d.period];
      if(allP.indexOf(periodFilter) === -1) return false;
    }
    if(shiftFilter !== 'all') {
      if(getDiscShift(d) !== shiftFilter) return false;
    }
    return true;
  });

  // Adapt name/schedule/period to the selected course
  if(courseFilter !== 'all') {
    filtered = filtered.map(function(d) {
      var name   = (d.namesByCourse     && d.namesByCourse[courseFilter])     || d.name;
      var sched  = (d.schedulesByCourse && d.schedulesByCourse[courseFilter]) || d.schedule;
      var period = (d.periodsByCourse   && d.periodsByCourse[courseFilter])   || d.period;
      return Object.assign({}, d, {name: name, schedule: sched, period: period, course: courseFilter});
    });
  }

  updateConsultaFilters(discs);

  var withSched = filtered.filter(function(d) { return d.schedule && d.schedule.length > 0; });
  var totalCH = filtered.reduce(function(a, d) { return a + (d.ch || 0); }, 0);
  var courses = {};
  filtered.forEach(function(d) { courses[d.course] = true; });
  if(statsEl) {
    statsEl.innerHTML =
      '<div class="cs-item"><span class="cs-val">' + filtered.length + '</span> disciplinas</div>' +
      '<div class="cs-item"><span class="cs-val">' + withSched.length + '</span> com horário</div>' +
      '<div class="cs-item"><span class="cs-val">' + totalCH + '</span> h/a total</div>' +
      '<div class="cs-item"><span class="cs-val">' + Object.keys(courses).length + '</span> curso(s)</div>' +
      (filtered.length !== discs.length ? '<div class="cs-item" style="color:#fbbf24;">Filtrado de ' + discs.length + '</div>' : '');
  }

  if(viewMode === 'table') renderConsultaTable(body, filtered);
  else if(viewMode === 'grid') renderConsultaGrid(body, filtered);
  else renderConsultaPDF(body, filtered);
}

function filterConsulta() { renderConsulta(); }

window.renderConsulta = renderConsulta;
window.filterConsulta = filterConsulta;
