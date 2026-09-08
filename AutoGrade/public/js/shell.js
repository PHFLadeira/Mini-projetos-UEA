/* ══ shell.js — Navigation, ECA↔GradeFlow Bridge, ecaInit ══ */

// ── Shell Tab Switching (3 tabs) ──────────────────────────────────────
window.shellSwitch = function(tab) {
  document.querySelectorAll('.tab-view').forEach(function(v){ v.classList.remove('active'); });
  document.querySelectorAll('.shell-tab').forEach(function(t){ t.classList.remove('active'); });
  var viewMap = { grade: 'view-grade', horario: 'view-horario', consulta: 'view-consulta' };
  var viewId = viewMap[tab] || 'view-grade';
  var tabId = 'stab-' + tab;
  var view = document.getElementById(viewId);
  var tabEl = document.getElementById(tabId);
  if(view) view.classList.add('active');
  if(tabEl) tabEl.classList.add('active');
  if(tab === 'horario') {
    if(typeof autoLoadPDFs === 'function') autoLoadPDFs();
    if(typeof renderAvailableSidebar === 'function') renderAvailableSidebar();
    if(typeof updateBridgeBar === 'function') updateBridgeBar();
  }
  if(tab === 'consulta') {
    if(typeof renderConsulta === 'function') renderConsulta();
  }
};

// ── ECA Grade switch ──────────────────────────────────────────────────
function switchGrade(g, btn) {
  G = g; window.G = g;
  try { localStorage.setItem('eca_grade', g); } catch(e) {}
  document.querySelectorAll('.tab-btn').forEach(function(b){ b.classList.remove('active'); });
  btn.classList.add('active');
  var s = document.getElementById('search'); if(s) s.value = '';
  render();
  if(typeof updateSmartBadge === 'function') updateSmartBadge();
}
window.switchGrade = switchGrade;

// ── Pré-requisito cumprido? ───────────────────────────────────────────
// "done" sempre conta. "enrolled" (Cursando) conta para PLANEJAR o próximo
// semestre — pois o que você cursa agora estará concluído até lá — a menos
// que o usuário desligue isso em Config.
function preSatisfied(pid) {
  var st = getSub(pid).status;
  if(st === 'done') return true;
  if(st === 'enrolled' && (typeof CFG === 'undefined' || CFG.planEnrolled !== false)) return true;
  return false;
}
window.preSatisfied = preSatisfied;

// ── Bridge: get subjects student can currently enroll in ──────────────
function getAvailableSubjects() {
  if(typeof DATA === 'undefined') return [];
  var subs = DATA[window.G];
  return subs.filter(function(sub) {
    if(sub.code === '—') return false; // optative placeholder
    var d = getSub(sub.id);
    if(d.status === 'done' || d.status === 'enrolled') return false;
    if(!(sub.pre || []).every(preSatisfied)) return false;
    // co-requisitos: ok se concluído, em curso, ou também disponível neste semestre
    return (sub.coreq || []).every(function(cid) {
      var cs = getSub(cid).status;
      if(cs === 'done' || cs === 'enrolled') return true;
      var csub = subs.find(function(x){ return x.id === cid; });
      return !!csub && (csub.pre || []).every(preSatisfied);
    });
  });
}
window.getAvailableSubjects = getAvailableSubjects;

// ── HTML escape helper for bridge ────────────────────────────────────
function escAvail(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── Render available subjects sidebar in GradeFlow tab ───────────────
function renderAvailableSidebar() {
  var list = document.getElementById('avail-list');
  var subTitle = document.getElementById('avail-sub');
  if(!list) return;

  var available = getAvailableSubjects();
  if(!available.length) {
    list.innerHTML = '<div class="avail-empty">Importe seu histórico na aba<br>Grade Curricular para ver<br>as matérias disponíveis</div>';
    if(subTitle) subTitle.textContent = 'Nenhuma ainda';
    return;
  }

  // Group by period
  var byPeriod = {};
  available.forEach(function(sub) {
    var p = sub.period;
    if(!byPeriod[p]) byPeriod[p] = [];
    byPeriod[p].push(sub);
  });

  var gfDiscs = (window.S && window.S.disciplines) ? window.S.disciplines : [];
  var totalWithSched = 0;

  list.innerHTML = '';
  Object.keys(byPeriod).sort(function(a, b){ return +a - +b; }).forEach(function(period) {
    var subs = byPeriod[period];
    var div = document.createElement('div');
    div.className = 'avail-divider';
    div.textContent = period + 'º Período';
    list.appendChild(div);

    subs.forEach(function(sub) {
      var found = gfDiscs.find(function(d) {
        return d.code && sub.code && d.code.toUpperCase() === sub.code.toUpperCase();
      });
      var hasSched = found && found.schedule && found.schedule.length > 0;
      var isAdded = window.S && window.S.selected && window.S.selected[sub.code];
      if(hasSched) totalWithSched++;

      var el = document.createElement('div');
      el.className = 'avail-item' + (isAdded ? ' added' : '') + (!hasSched ? ' no-sched' : '');

      var schedText = hasSched
        ? found.schedule.slice(0, 2).map(function(s){ return s.day + ' ' + s.start; }).join(' / ')
        : 'Sem horário nos PDFs';

      el.innerHTML =
        '<div class="avail-chk">' + (isAdded ? '✓' : '') + '</div>' +
        '<div style="flex:1;min-width:0;">' +
          '<div class="avail-name">' + escAvail(sub.name) + '</div>' +
          '<div class="avail-meta">' +
            '<span class="avail-tag t-per">' + sub.period + 'º</span>' +
            '<span class="avail-tag">' + sub.code + '</span>' +
            (hasSched
              ? '<span class="avail-tag t-sched">' + escAvail(schedText) + '</span>'
              : '<span class="avail-tag t-none">Sem horário</span>') +
          '</div>' +
        '</div>';

      el.onclick = function() {
        if(!found) {
          if(typeof showEcaToast === 'function') showEcaToast('Matéria não encontrada nos PDFs carregados', false);
          return;
        }
        if(isAdded) {
          if(typeof window.removeDisc === 'function') window.removeDisc(sub.code);
        } else {
          if(typeof window.toggleDisc === 'function') window.toggleDisc(sub.code);
        }
        setTimeout(renderAvailableSidebar, 50);
      };
      list.appendChild(el);
    });
  });

  if(subTitle) subTitle.textContent = available.length + ' matéria(s) disponíveis';
  if(typeof updateSmartBadge === 'function') updateSmartBadge();
}
window.renderAvailableSidebar = renderAvailableSidebar;

// ── Update bridge bar ─────────────────────────────────────────────────
function updateBridgeBar() {
  var autoBtn = document.getElementById('bridge-auto-btn');
  var available = getAvailableSubjects();
  if(!available.length) {
    if(autoBtn) autoBtn.classList.add('hidden');
    return;
  }
  var gfDiscs = (window.S && window.S.disciplines) ? window.S.disciplines : [];
  var withSched = available.filter(function(sub) {
    return gfDiscs.some(function(d) {
      return d.code && sub.code && d.code.toUpperCase() === sub.code.toUpperCase() && d.schedule && d.schedule.length > 0;
    });
  });
  if(autoBtn) {
    if(withSched.length > 0) autoBtn.classList.remove('hidden');
    else autoBtn.classList.add('hidden');
  }
}
window.updateBridgeBar = updateBridgeBar;

// ── Update smart button in shell nav ──────────────────────────────────
function updateSmartBadge() {
  var available = getAvailableSubjects();
  var gfDiscs = (window.S && window.S.disciplines) ? window.S.disciplines : [];
  var withSched = available.filter(function(sub) {
    return gfDiscs.some(function(d) {
      return d.code && sub.code && d.code.toUpperCase() === sub.code.toUpperCase() && d.schedule && d.schedule.length > 0;
    });
  });
  var smartBtn = document.getElementById('smart-btn');
  var smartCnt = document.getElementById('smart-cnt');
  var badge = document.getElementById('horario-badge');
  if(smartBtn) {
    if(withSched.length > 0) {
      smartBtn.classList.remove('hidden');
      if(smartCnt) smartCnt.textContent = withSched.length;
    } else {
      smartBtn.classList.add('hidden');
    }
  }
  if(badge) {
    if(withSched.length > 0) {
      badge.classList.remove('hidden');
      badge.textContent = withSched.length;
    } else {
      badge.classList.add('hidden');
    }
  }
}
window.updateSmartBadge = updateSmartBadge;

// ── Smart action: switch to montador and auto-schedule ────────────────
window.smartAction = function() {
  shellSwitch('horario');
  setTimeout(function(){ if(typeof window.autoSchedule === 'function') window.autoSchedule(); }, 200);
};

// ── Auto-Schedule (greedy algorithm) ─────────────────────────────────
window.autoSchedule = function() {
  var available = getAvailableSubjects();
  if(!available.length) {
    if(typeof showEcaToast === 'function') showEcaToast('Nenhuma matéria disponível — importe seu histórico primeiro', false);
    return;
  }
  var gfDiscs = (window.S && window.S.disciplines) ? window.S.disciplines : [];
  if(!gfDiscs.length) {
    if(typeof showEcaToast === 'function') showEcaToast('Carregue os PDFs de horários primeiro', false);
    return;
  }

  function toMin(t) {
    var sep = t.indexOf(':') !== -1 ? ':' : ';';
    var parts = t.split(sep);
    return parseInt(parts[0]) * 60 + parseInt(parts[1]);
  }
  function shiftOf(t) {
    if(typeof getShift === 'function') return getShift(t);
    var h = parseInt(t.split(':')[0]); return h < 13 ? 'manha' : h < 18 ? 'tarde' : 'noite';
  }

  // ── Lê os Filtros da barra lateral do Montador (aba "Filtros") ──
  var on = function(sel){ return [].slice.call(document.querySelectorAll(sel)).map(function(b){ return b.dataset.val; }); };
  var okTurnos = on('[data-pref="turno"].on');
  var okDias   = on('[data-pref="dias"].on');
  var chMaxEl  = document.getElementById('ch-max');
  var chMax    = chMaxEl ? (parseInt(chMaxEl.value) || 9999) : 9999;
  var prio     = (window.S && window.S.priorities) ? window.S.priorities : {};
  var prioRank = { high: 0, med: 1, low: 2 };

  function fitsFilters(disc) {
    for(var i = 0; i < disc.schedule.length; i++) {
      var s = disc.schedule[i];
      if(okDias.length && okDias.length < 6 && okDias.indexOf(s.day) === -1) return false;
      if(okTurnos.length && okTurnos.length < 3 && okTurnos.indexOf(shiftOf(s.start)) === -1) return false;
    }
    return true;
  }

  var candidates = [], noSched = [], filteredOut = [];
  available.forEach(function(sub) {
    var disc = gfDiscs.find(function(d) {
      return d.code && sub.code && d.code.toUpperCase() === sub.code.toUpperCase();
    });
    if(!disc || !disc.schedule || !disc.schedule.length) { noSched.push(sub); return; }
    if(!fitsFilters(disc)) { filteredOut.push({ sub: sub, disc: disc }); return; }
    candidates.push({ sub: sub, disc: disc });
  });

  if(!candidates.length) {
    if(typeof showEcaToast === 'function') showEcaToast(
      filteredOut.length ? 'Nenhuma matéria passou nos Filtros — afrouxe turno/dias na aba Filtros.'
                         : 'Nenhuma matéria disponível tem horário nos PDFs carregados', false);
    return;
  }

  // Clear current GF selection
  if(window.S) {
    window.S.selected = {};
    window.S.colorMap = {};
    window.S.conflicts = [];
  }

  // Ordena: prioridade (Alta→Baixa) > período (menor primeiro) > CH (menor primeiro)
  candidates.sort(function(a, b) {
    var pa = prioRank[prio[a.disc.code]] != null ? prioRank[prio[a.disc.code]] : 1;
    var pb = prioRank[prio[b.disc.code]] != null ? prioRank[prio[b.disc.code]] : 1;
    if(pa !== pb) return pa - pb;
    if(a.sub.period !== b.sub.period) return a.sub.period - b.sub.period;
    return (a.disc.ch || 0) - (b.disc.ch || 0);
  });

  var occupied = []; // [{day, start, end}]
  function hasConflict(disc) {
    for(var si = 0; si < disc.schedule.length; si++) {
      var s = disc.schedule[si];
      var s0 = toMin(s.start), s1 = toMin(s.end);
      for(var oi = 0; oi < occupied.length; oi++) {
        var o = occupied[oi];
        if(o.day === s.day && s0 < o.end && o.start < s1) return true;
      }
    }
    return false;
  }

  var scheduled = [], skippedConflict = [], skippedCH = [], totalCH = 0;
  for(var ci = 0; ci < candidates.length; ci++) {
    var sub = candidates[ci].sub, disc = candidates[ci].disc;
    if(hasConflict(disc)) {
      skippedConflict.push({ sub: sub, disc: disc });
      continue;
    }
    if(totalCH + (disc.ch || 0) > chMax) {
      skippedCH.push({ sub: sub, disc: disc });
      continue;
    }
    window.S.colorMap[disc.code] = Object.keys(window.S.colorMap).length % 10;
    window.S.selected[disc.code] = true;
    totalCH += (disc.ch || 0);
    disc.schedule.forEach(function(s) {
      occupied.push({ day: s.day, start: toMin(s.start), end: toMin(s.end) });
    });
    scheduled.push({ sub: sub, disc: disc });
  }
  if(skippedCH.length) skippedConflict = skippedConflict.concat(skippedCH.map(function(x){
    return { sub: x.sub, disc: x.disc, reason: 'CH máx.' };
  }));

  if(typeof window.detectConflicts === 'function') window.detectConflicts();
  if(typeof window.renderAll === 'function') window.renderAll();
  if(typeof window.gfSave === 'function') window.gfSave();
  if(typeof window.mainGo === 'function') window.mainGo('grade');

  renderAvailableSidebar();
  updateBridgeBar();

  var totalCH = scheduled.reduce(function(acc, item){ return acc + (item.disc.ch || 0); }, 0);
  if(typeof showEcaToast === 'function') showEcaToast('⚡ Grade montada! ' + scheduled.length + ' matérias, ' + totalCH + ' h/a', false);

  showAutoResultPanel(scheduled, noSched, skippedConflict);
};

// ── Show auto-schedule result panel ──────────────────────────────────
function showAutoResultPanel(scheduled, noSched, skippedConflict) {
  var existing = document.getElementById('auto-result-banner');
  if(existing) existing.remove();

  var banner = document.createElement('div');
  banner.id = 'auto-result-banner';
  banner.style.cssText = 'background:rgba(52,211,153,.06);border:1px solid rgba(52,211,153,.2);border-radius:10px;padding:12px 16px;margin:10px 16px 0;font-size:12px;';

  var totalCH = scheduled.reduce(function(a, item){ return a + (item.disc.ch || 0); }, 0);
  var html = '<div style="font-weight:700;color:#34d399;margin-bottom:5px;">✓ Grade montada automaticamente</div>';
  html += '<div style="color:#8888a8;margin-bottom:8px;">' + scheduled.length + ' matéria(s) sem conflito · ' + totalCH + ' h/aula total</div>';

  if(noSched.length) {
    html += '<div style="background:rgba(251,191,36,.08);border:1px solid rgba(251,191,36,.15);border-radius:7px;padding:8px 10px;margin-bottom:6px;">';
    html += '<div style="color:#fbbf24;font-weight:600;margin-bottom:3px;">⚠ ' + noSched.length + ' matéria(s) sem horário nos PDFs:</div>';
    noSched.forEach(function(sub){ html += '<div style="color:#8888a8;font-size:11px;">• ' + escAvail(sub.name) + ' (' + sub.code + ')</div>'; });
    html += '<div style="color:#8888a8;font-size:10px;margin-top:4px;">Carregue mais PDFs de horários para incluí-las.</div>';
    html += '</div>';
  }

  if(skippedConflict.length) {
    html += '<div style="background:rgba(248,113,113,.07);border:1px solid rgba(248,113,113,.15);border-radius:7px;padding:8px 10px;margin-bottom:6px;">';
    html += '<div style="color:#f87171;font-weight:600;margin-bottom:3px;">⚔ ' + skippedConflict.length + ' não adicionada(s) (conflito ou CH máx.):</div>';
    skippedConflict.forEach(function(item){ html += '<div style="color:#8888a8;font-size:11px;">• ' + escAvail(item.sub.name) + (item.reason ? ' <span style="opacity:.6">— ' + item.reason + '</span>' : '') + '</div>'; });
    html += '</div>';
  }

  html += '<div style="display:flex;gap:7px;margin-top:8px;">';
  html += '<button onclick="if(typeof mainGo===\'function\')mainGo(\'grade\')" style="padding:5px 11px;border-radius:6px;background:#7c7fff;color:#fff;border:none;font-size:11px;font-weight:600;cursor:pointer;">Ver Grade</button>';
  html += '<button onclick="document.getElementById(\'auto-result-banner\').remove()" style="padding:5px 11px;border-radius:6px;background:transparent;color:#8888a8;border:1px solid rgba(255,255,255,.1);font-size:11px;cursor:pointer;">Fechar</button>';
  html += '</div>';
  banner.innerHTML = html;

  var gradeWrap = document.getElementById('view-grade-gf');
  var montMain = document.querySelector('.mont-main, .main');
  if(gradeWrap) {
    gradeWrap.insertBefore(banner, gradeWrap.firstChild);
  } else if(montMain) {
    montMain.insertBefore(banner, montMain.firstChild);
  }
}

// ── Hook: update bridge when GF save fires ────────────────────────────
document.addEventListener('DOMContentLoaded', function() {
  setTimeout(function() {
    if(typeof window.gfSave === 'function') {
      var origSave = window.gfSave;
      window.gfSave = function() {
        origSave();
        if(typeof updateSmartBadge === 'function') updateSmartBadge();
        var hv = document.getElementById('view-horario');
        if(hv && hv.classList.contains('active')) {
          if(typeof renderAvailableSidebar === 'function') renderAvailableSidebar();
          if(typeof updateBridgeBar === 'function') updateBridgeBar();
        }
      };
      // Also patch window.save alias in gradeflow.js
      window.save = window.gfSave;
    }
  }, 800);
});

// ── Legend builder (depends on PC from data.js) ───────────────────────
function buildLegend() {
  var l = document.getElementById('eca-legend-bar'); if(!l) return;
  l.innerHTML = PC.slice(1).map(function(c, i){
    return '<div class="legend-item"><div class="legend-dot" style="background:' + c.main + '"></div>' + (i+1) + 'º Per.</div>';
  }).join('') +
  '<div class="legend-item" style="margin-left:8px"><div class="legend-dot" style="background:var(--green)"></div>Concluída</div>' +
  '<div class="legend-item"><div class="legend-dot" style="background:var(--accent)"></div>Cursando</div>' +
  '<div class="legend-item"><div class="legend-dot" style="background:var(--yellow)"></div>Reprovada</div>';
}
window.buildLegend = buildLegend;

// ── ECA App Init ──────────────────────────────────────────────────────
function ecaInit() {
  applyCfgOnLoad();
  // Restaura a grade escolhida na sessão anterior (ou de um backup restaurado)
  try {
    var sg = localStorage.getItem('eca_grade');
    if(sg && typeof DATA !== 'undefined' && DATA[sg]) {
      window.G = sg;
      document.querySelectorAll('.tab-btn').forEach(function(b){
        b.classList.toggle('active', (b.getAttribute('onclick')||'').indexOf("'"+sg+"'") !== -1);
      });
    }
  } catch(e) {}
  buildLegend();
  var chipsEl = document.getElementById('period-chips');
  if(chipsEl) {
    for(var p = 1; p <= 10; p++) {
      var chip = document.createElement('div');
      chip.className = 'period-chip';
      chip.textContent = p + 'º';
      chip.dataset.p = p;
      (function(period){
        chip.onclick = function(){ togglePeriod(period); };
      })(p);
      chipsEl.appendChild(chip);
    }
    var allChip = chipsEl.querySelector('.all-chip');
    if(allChip) allChip.dataset.p = 0;
  }
  render();
  window.addEventListener('resize', drawArrows);
  var sc = document.getElementById('scroll');
  if(sc) sc.addEventListener('scroll', drawArrows);
}
window.ecaInit = ecaInit;

window.addEventListener('load', function() {
  ecaInit();
});
