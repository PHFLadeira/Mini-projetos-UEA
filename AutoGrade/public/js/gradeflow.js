/* ══ gradeflow.js — GradeFlow: Montador de Horários ══ */

pdfjsLib.GlobalWorkerOptions.workerSrc =
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

var GF_DAYS = ['Seg','Ter','Qua','Qui','Sex','Sab'];
var GF_TIMES = ['07:30','08:20','09:10','10:00','10:50','11:40',
                '13:00','13:50','14:40','15:30','16:20','17:10',
                '18:00','18:50','19:40','20:30','21:20'];
var GF_EC = 10;
var GF_COLORS = ['#7c7fff','#34d399','#fbbf24','#d946ef','#60a5fa',
                 '#f87171','#22c55e','#f97316','#8b5cf6','#06b6d4'];

window.S = {
  disciplines: [],
  selected: {},
  conflicts: [],
  colorMap: {},
  priorities: {}
};

function gfSave() {
  try {
    localStorage.setItem('gf_d', JSON.stringify(S.disciplines));
    localStorage.setItem('gf_s', JSON.stringify(S.selected));
    localStorage.setItem('gf_p', JSON.stringify(S.priorities));
    localStorage.setItem('gf_c', JSON.stringify(S.colorMap));
  } catch(e) {}
}
window.save = gfSave;

function loadSaved() {
  try {
    var d = localStorage.getItem('gf_d'); if(d) S.disciplines = JSON.parse(d);
    var s = localStorage.getItem('gf_s'); if(s) S.selected = JSON.parse(s);
    var p = localStorage.getItem('gf_p'); if(p) S.priorities = JSON.parse(p);
    var c = localStorage.getItem('gf_c'); if(c) S.colorMap = JSON.parse(c);
  } catch(e) {}
}

function gfT2m(t) {
  var pts = t.split(':');
  return parseInt(pts[0]) * 60 + parseInt(pts[1]);
}

function getShift(t) {
  var h = parseInt(t.split(':')[0]);
  if(h < 13) return 'manha';
  if(h < 18) return 'tarde';
  return 'noite';
}

function selDiscs() {
  return S.disciplines.filter(function(d){ return !!S.selected[d.code]; });
}

function assignColor(code) {
  if(S.colorMap[code] == null) {
    S.colorMap[code] = Object.keys(S.colorMap).length % GF_EC;
  }
}

function isCodeLike(str) {
  if(!str || str.length < 4) return false;
  if(str.indexOf('_') !== -1) return false;
  var CODE_SKIP = {
    'CT':1,'CH':1,'SAB':1,'NOT':1,'DIA':1,'INT':1,'LAB':1,'PRE':1,
    'CURSO':1,'TURNO':1,'GRADE':1,'SIGLA':1,'DISCIPLINA':1,'VAGAS':1,
    'SALA':1,'HORARIA':1,'PERIODO':1,'TURMA':1,'CURRICULO':1,'RESERVA':1,
    'VAGA':1,'DIA2':1,'HORARIO':1,'COMPARTIL':1,'TROCA':1,'EXTRA':1
  };
  if(CODE_SKIP[str]) return false;
  var m = /^[A-Z]{2,}[0-9]{2,}[A-Z0-9]*$/.exec(str);
  return m !== null;
}

function isValidName(name) {
  if(!name || name.length < 5) return false;
  var n = name.toUpperCase();
  if(n.charAt(0) === 'C' && n.charAt(1) === '/') return false;
  if(n.indexOf('COMPARTILHA') !== -1) return false;
  if(n.indexOf('RESERVA DE') !== -1) return false;
  if(n.indexOf('TROCA') !== -1) return false;
  if(n.charAt(n.length-1) === ')' && n.indexOf('(') === -1) return false;
  if(n.charAt(0) === '(') return false;
  return /[A-Za-zÀ-ÿ]{3,}/.test(name);
}

function isTimeFmt(str) {
  if(!str || str.length < 4 || str.length > 5) return false;
  var idx = str.indexOf(':');
  if(idx < 0) idx = str.indexOf(';');
  if(idx < 1 || idx > 2) return false;
  var h = parseInt(str.substring(0, idx));
  var m = parseInt(str.substring(idx+1));
  return !isNaN(h) && !isNaN(m) && h >= 0 && h <= 23 && m >= 0 && m <= 59;
}

function gfEscHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// PDF PARSING
async function parsePDF(file) {
  var buf = await file.arrayBuffer();
  return parsePDFData(buf, file.name);
}

async function parsePDFData(buf, filename, courseOverride) {
  var pdf = await pdfjsLib.getDocument({data: buf}).promise;
  var course = courseOverride || guessCourse(filename);
  var results = [];
  var seen = {};
  var globalPeriod = '?';

  for(var pg = 1; pg <= pdf.numPages; pg++) {
    var page = await pdf.getPage(pg);
    var content = await page.getTextContent();
    var items = [];
    for(var k = 0; k < content.items.length; k++) {
      var it = content.items[k];
      var str = it.str.replace(/[ \t]+/g,' ').trim();
      str = str.replace(/^(\d{1,2});(\d{2})$/, '$1:$2');
      if(/^[A-Z]{2,}/.test(str)) {
        str = str.replace(/([A-Z0-9])l([A-Z0-9])/g, '$10$2');
        str = str.replace(/([A-Z0-9])O([0-9])/g, '$100$2');
      }
      if(!str) continue;
      items.push({str: str, x: Math.round(it.transform[4]), y: Math.round(it.transform[5])});
    }

    var codeColX = 0;
    var normalizeStr = function(s) {
      return s.toUpperCase().replace(/Í/g,'I').replace(/É/g,'E').replace(/Ó/g,'O').replace(/Ã/g,'A');
    };
    for(var ii = 0; ii < items.length; ii++) {
      var ns = normalizeStr(items[ii].str);
      if((ns === 'CODIGO' || ns === 'SIGLA') && items[ii].x > 10) { codeColX = items[ii].x; break; }
    }
    if(codeColX === 0) {
      for(var ii2 = 0; ii2 < items.length; ii2++) {
        if(isCodeLike(items[ii2].str) && items[ii2].x > 10) { codeColX = Math.max(codeColX, items[ii2].x - 10); break; }
      }
    }
    var minContentX = codeColX > 0 ? Math.max(10, codeColX - 30) : 200;
    var contentItems = items.filter(function(i){ return i.x >= minContentX; });

    var periodMarkers = [];
    var yBuckets = {};
    for(var ii3 = 0; ii3 < items.length; ii3++) {
      var bk = Math.round(items[ii3].y / 8) * 8;
      if(!yBuckets[bk]) yBuckets[bk] = [];
      yBuckets[bk].push(items[ii3]);
    }

    for(var bkKey in yBuckets) {
      var grp = yBuckets[bkKey];
      var grpNorm = grp.map(function(i){ return normalizeStr(i.str); }).join(' ');
      var grpY = grp[0].y;
      var bkHasTime = grp.some(function(i){ return isTimeFmt(i.str); });
      var bkHasCode = grp.some(function(i){ return isCodeLike(i.str.toUpperCase()); });
      if(grpNorm.indexOf('PERIODO') !== -1 && grpNorm.indexOf('OPTATIVA') === -1 && grpNorm.indexOf('FORA') === -1) {
        var periIdx = grpNorm.indexOf('PERIODO');
        var beforePer = grpNorm.substring(0, periIdx);
        var numM = beforePer.match(/([0-9]+)[^0-9]*$/);
        if(numM && !bkHasTime && !bkHasCode) periodMarkers.push({yPdf: grpY, period: numM[1] + 'º'});
      }
      if(grpNorm.indexOf('OPTATIVA') !== -1 && !bkHasTime && !bkHasCode) {
        periodMarkers.push({yPdf: grpY, period: 'Optativa'});
      }
      if(grpNorm.indexOf('FORA') !== -1 && (grpNorm.indexOf('PERIODO') !== -1 || grpNorm.indexOf('DISCIPLINA') !== -1) && !bkHasTime && !bkHasCode) {
        periodMarkers.push({yPdf: grpY, period: 'Fora de Período'});
      }
    }

    periodMarkers.sort(function(a,b){ return b.yPdf - a.yPdf; });
    if(periodMarkers.length > 0) globalPeriod = periodMarkers[0].period;

    function getPeriodForY(itemY) {
      var best = null;
      for(var mi = 0; mi < periodMarkers.length; mi++) {
        var m = periodMarkers[mi];
        if(m.yPdf >= itemY) {
          if(best === null || m.yPdf < best.yPdf) best = m;
        }
      }
      return best ? best.period : globalPeriod;
    }

    var dayColX = {};
    var dayMap = {'2a':'Seg','3a':'Ter','4a':'Qua','5a':'Qui','6a':'Sex','SAB':'Sab'};
    for(var ri = 0; ri < contentItems.length; ri++) {
      var cs = contentItems[ri].str.replace(/[ªº°]/g,'a');
      if(dayMap[cs]) dayColX[dayMap[cs]] = contentItems[ri].x;
    }

    var dayXValues = Object.values(dayColX);
    var minDayX = dayXValues.length > 0 ? Math.min.apply(null, dayXValues) - 20 : 9999;

    contentItems.sort(function(a,b){ return b.y !== a.y ? b.y - a.y : a.x - b.x; });

    var rows = [];
    var curRow = [], curY = null;
    for(var i = 0; i < contentItems.length; i++) {
      var item = contentItems[i];
      if(curY === null || Math.abs(item.y - curY) < 7) {
        curRow.push(item);
        curY = curY === null ? item.y : (curY * 0.6 + item.y * 0.4);
      } else {
        if(curRow.length) rows.push(curRow);
        curRow = [item]; curY = item.y;
      }
    }
    if(curRow.length) rows.push(curRow);

    var SKIP = {
      'CT':1,'CH':1,'SAB':1,'NOT':1,'DIA':1,'INT':1,'LAB':1,'PRE':1,
      'CURSO':1,'TURNO':1,'GRADE':1,'SIGLA':1,'DISCIPLINA':1,'VAGAS':1,
      'SALA':1,'HORARIA':1,'PERIODO':1,'TURMA':1,'CURRICULO':1,'RESERVA':1,
      'VAGA':1,'DIA2':1,'HORARIO':1,'COMPARTIL':1,'TROCA':1,'EXTRA':1,'CODIGO':1,
      'REQUISITO':1,'PREREQUISITO':1,'GRADE':1,
      'DISCIPLINAS':1,'OPTATIVAS':1,'FORA':1,'BASICO':1,'PRE-':1,'BASICO+PRE-':1,
      'LYCEUM':1,'LYCEU':1,'NOME':1,'PROFESSOR':1
    };

    // Detecta posições das colunas CT e SALA uma vez por página
    var ctColX = codeColX + 280;
    var salaColX = -1;
    for(var hh = 0; hh < contentItems.length; hh++) {
      var hh_x = contentItems[hh].x;
      var hh_str = contentItems[hh].str;
      var hh_ns = normalizeStr(hh_str);
      if(hh_str === 'CT' && hh_x > codeColX && hh_x < codeColX + 500 && ctColX === codeColX + 280) {
        ctColX = hh_x - 10;
      }
      if(hh_ns === 'SALA' && hh_x > ctColX && salaColX === -1) {
        salaColX = hh_x;
      }
    }
    for(var ri2 = 0; ri2 < rows.length; ri2++) {
      var row = rows[ri2];
      var rowY = row[0] ? row[0].y : 0;

      var nameItems = row.filter(function(i){ return i.x >= codeColX && i.x < ctColX && !isTimeFmt(i.str) && Math.abs(i.y - rowY) <= 7; });
      var timeItems = row.filter(function(i){ return i.x >= (minDayX - 20) && isTimeFmt(i.str); });
      // Look-ahead: coleta horários de sub-linhas abaixo da linha da disciplina
      // (PDFs como ECP separam início e fim em linhas distintas)
      for(var lai = ri2 + 1; lai < rows.length; lai++) {
        var laRow = rows[lai];
        var laY = laRow[0] ? laRow[0].y : 0;
        if(rowY - laY > 50) break; // mais de 50 unidades abaixo, para
        var laHasCode = laRow.some(function(i){
          var lt = i.str.trim().toUpperCase();
          return isCodeLike(lt) && !SKIP[lt];
        });
        if(laHasCode) break; // próxima disciplina, para
        var laT = laRow.filter(function(i){ return i.x >= (minDayX - 20) && isTimeFmt(i.str); });
        timeItems = timeItems.concat(laT);
      }

      var code = null;
      for(var ci = 0; ci < row.length; ci++) {
        var tok = row[ci].str.trim().toUpperCase();
        if(isCodeLike(tok) && !SKIP[tok] && !seen[tok]) { code = tok; break; }
      }
      if(!code) continue;

      var nameTokens = [];
      var nameItemsSorted = nameItems.slice().sort(function(a,b){
        if(Math.abs(a.y - b.y) > 4) return b.y - a.y;
        return a.x - b.x;
      });
      for(var ni = 0; ni < nameItemsSorted.length; ni++) {
        var tok2 = nameItemsSorted[ni].str.trim();
        var tok2U = tok2.toUpperCase();
        if(tok2U === code) continue;
        if(isCodeLike(tok2U)) continue;
        if(isTimeFmt(tok2)) continue;
        if(SKIP[tok2U]) continue;
        var allDig = tok2.split('').every(function(c){ return c >= '0' && c <= '9'; });
        if(allDig) continue;
        if(tok2.length === 1 && !/^[A-Za-zÀ-ÿ]$/.test(tok2)) continue;
        if(tok2.length === 0) continue;
        if(/^[A-Z][0-9]+[A-Z]?$/.test(tok2U) && tok2.length <= 4) continue;
        nameTokens.push(tok2);
      }
      var name = nameTokens.join(' ').replace(/  +/g,' ').trim().substring(0, 70);
      if(!isValidName(name)) continue;

      var numZone = row.filter(function(i){ return i.x >= ctColX && i.x <= ctColX + 250 && !isTimeFmt(i.str); });
      var nums = numZone.map(function(i){ return parseInt(i.str); }).filter(function(n){ return !isNaN(n); });
      var ch = 0, ct = 0, vagas = 0;
      for(var ni2 = 0; ni2 < nums.length; ni2++) {
        var n = nums[ni2];
        if(n % 15 === 0 && n >= 15 && n <= 900 && ch === 0) { ch = n; continue; }
        if(n >= 1 && n <= 8 && ct === 0 && n !== ch) { ct = n; continue; }
        if(n >= 5 && n <= 60 && vagas === 0 && n !== ch && n !== ct) { vagas = n; continue; }
      }

      var roomZone;
      if(salaColX > 0) {
        roomZone = row.filter(function(i){ return Math.abs(i.x - salaColX) <= 40 && !isTimeFmt(i.str); });
      } else {
        roomZone = row.filter(function(i){ return i.x >= ctColX + 50 && i.x <= ctColX + 220 && !isTimeFmt(i.str); });
      }
      // Exclui números puros com 4+ dígitos (Nº Lyceum como 16932, 25100)
      roomZone = roomZone.filter(function(i){ return !/^\d{4,}$/.test(i.str.trim()); });
      // Prioriza tokens com dígito (A12, D5) sobre nomes sem dígito (BRUNO)
      roomZone.sort(function(a, b) {
        var aD = /\d/.test(a.str) ? 0 : 1;
        var bD = /\d/.test(b.str) ? 0 : 1;
        return aD !== bD ? aD - bD : a.x - b.x;
      });
      var room = '?';
      for(var rmi = 0; rmi < roomZone.length; rmi++) {
        var rt = roomZone[rmi].str.trim();
        var rtClean = rt.split(' ')[0].split('/')[0].toUpperCase();
        if(rtClean.length >= 2 && rtClean.length <= 8 && /^[A-Z][A-Z0-9]+$/.test(rtClean)) { room = rtClean; break; }
      }

      var prereq = '';
      for(var pri = 0; pri < row.length; pri++) {
        var pt = row[pri].str.trim().toUpperCase();
        if(pt !== code && isCodeLike(pt) && pt.length >= 5) { prereq = pt; break; }
      }

      var schedule = [];
      var hasDayCols = Object.keys(dayColX).length >= 3;

      if(hasDayCols && timeItems.length > 0) {
        var byDay = {};
        for(var ti8 = 0; ti8 < timeItems.length; ti8++) {
          var titem = timeItems[ti8];
          var bestDay = null, bestDist = 999;
          for(var dk in dayColX) {
            var dist = Math.abs(titem.x - dayColX[dk]);
            if(dist < bestDist && dist < 90) { bestDist = dist; bestDay = dk; }
          }
          if(bestDay) {
            if(!byDay[bestDay]) byDay[bestDay] = [];
            byDay[bestDay].push(titem.str);
          }
        }
        for(var dk2 in byDay) {
          var ts = byDay[dk2];
          ts.sort(function(a,b){ return gfT2m(a) - gfT2m(b); });
          if(ts.length >= 2) schedule.push({day: dk2, start: ts[0], end: ts[ts.length-1]});
          else if(ts.length === 1) schedule.push({day: dk2, start: ts[0], end: ts[0]});
        }
      } else if(timeItems.length >= 2) {
        var tlist = timeItems.map(function(i){ return i.str; });
        var didx = 0;
        for(var ti9 = 0; ti9 < tlist.length - 1 && schedule.length < 6; ti9 += 2) {
          if(gfT2m(tlist[ti9+1]) > gfT2m(tlist[ti9])) {
            schedule.push({day: GF_DAYS[didx] || 'Seg', start: tlist[ti9], end: tlist[ti9+1]});
            didx++;
          }
        }
      }

      // Deduplicar por dia+hora e remover sessões idênticas de turmas diferentes
      var schedMap = {};
      for(var si = 0; si < schedule.length; si++) {
        var sl = schedule[si];
        var key = sl.day + '|' + sl.start + '|' + sl.end;
        schedMap[key] = sl;
      }
      schedule = Object.keys(schedMap).map(function(k){ return schedMap[k]; });

      // Remover sessões impossíveis (> 6 horas = turmas mescladas)
      schedule = schedule.filter(function(s) {
        return (gfT2m(s.end) - gfT2m(s.start)) <= 360;
      });

      var period = getPeriodForY(rowY);
      seen[code] = true;
      results.push({code: code, name: name, ct: ct, ch: ch, vagas: vagas, room: room, prereq: prereq, period: period, course: course, schedule: schedule});
    }
  }
  return results;
}

function guessCourse(fn) {
  var u = fn.toUpperCase()
    .replace(/[AÁÀÂÃ]/g,'A').replace(/[EÉÈÊ]/g,'E').replace(/[IÍÌÎ]/g,'I')
    .replace(/[OÓÒÔÕ]/g,'O').replace(/[UÚÙÛ]/g,'U').replace(/C[Ç]/g,'C');
  var map = [
    ['ELETRONICA','Eng. Eletronica'],['ELETRICA','Eng. Eletrica'],
    ['CONTROLE','Eng. Controle e Automacao'],['CIVIL','Eng. Civil'],
    ['NAVAL','Eng. Naval'],['MECANICA','Eng. Mecanica'],
    ['PRODUCAO','Eng. Producao'],['MATERIAIS','Eng. Materiais'],
    ['COMPUTACAO','Eng. Computacao'],['QUIMICA','Eng. Quimica'],
    ['SISTEMAS','Sistemas de Informacao'],['LICENCIATURA','Lic. Computacao'],
    ['METEOROLOGIA','Meteorologia']
  ];
  for(var i = 0; i < map.length; i++) {
    if(u.indexOf(map[i][0]) !== -1) return map[i][1];
  }
  return fn.replace(/\.pdf$/i,'').replace(/_/g,' ').substring(0, 30);
}

// AUTO-LOAD PDFs from pdfs/manifest.json
var _autoLoaded = false;

function _gfApplyDiscs(newDiscs) {
  var total = 0;
  for(var i = 0; i < newDiscs.length; i++) {
    var d = newDiscs[i];
    if(!d.code || !d.name) continue;
    var idx = S.disciplines.findIndex(function(x){ return x.code === d.code; });
    if(idx === -1) {
      S.disciplines.push(d); total++;
    } else {
      var ex = S.disciplines[idx];
      var betterName = !ex.name || /^DISCIPLINAS/i.test(ex.name) || ex.name.length < d.name.length;
      // Merge multi-course fields
      var mergedCourses = (ex.courses || [ex.course]).slice();
      (d.courses || [d.course]).forEach(function(c){ if(mergedCourses.indexOf(c) === -1) mergedCourses.push(c); });
      var mergedSBC  = Object.assign({}, ex.schedulesByCourse || {}, d.schedulesByCourse || {});
      var mergedPBC  = Object.assign({}, ex.periodsByCourse   || {}, d.periodsByCourse   || {});
      var mergedNBC  = Object.assign({}, ex.namesByCourse     || {}, d.namesByCourse     || {});
      var upd = Object.assign({}, ex, {
        course: d.course,
        courses: mergedCourses,
        namesByCourse: mergedNBC,
        schedulesByCourse: mergedSBC,
        periodsByCourse: mergedPBC,
        period: d.period || ex.period,
        prereq: d.prereq || ex.prereq,
        vagas: d.vagas || ex.vagas,
        room: (d.room && d.room !== '?') ? d.room : ex.room,
        schedule: (d.schedule && d.schedule.length) ? d.schedule : ex.schedule,
      });
      if(betterName) Object.assign(upd, {name: d.name, ch: d.ch, ct: d.ct});
      S.disciplines[idx] = upd;
      total++;
    }
  }
  return total;
}

function _gfFinishLoad(count, statusBar) {
  if(count > 0) {
    renderDiscList();
    gfRenderAll();
    gfSave();
    if(typeof updateSmartBadge === 'function') updateSmartBadge();
    if(typeof updateBridgeBar === 'function') updateBridgeBar();
    if(typeof renderAvailableSidebar === 'function') renderAvailableSidebar();
    if(typeof renderConsulta === 'function') {
      var cv = document.getElementById('view-consulta');
      if(cv && cv.classList.contains('active')) renderConsulta();
    }
  }
  if(statusBar) {
    if(count > 0) {
      statusBar.textContent = '✅ ' + count + ' disciplina(s) carregadas';
      setTimeout(function(){ statusBar.style.display = 'none'; }, 3000);
    } else {
      statusBar.style.display = 'none';
    }
  }
}

window.autoLoadPDFs = async function(force) {
  if(_autoLoaded && !force) return;
  _autoLoaded = true;

  var statusBar = document.getElementById('autoload-bar');
  if(statusBar) { statusBar.textContent = '⏳ Carregando horários...'; statusBar.style.display = 'block'; }

  // Tenta carregar disciplines.json pré-processado (Python)
  try {
    var djResp = await fetch('pdfs/disciplines.json');
    if(djResp.ok) {
      var djData = await djResp.json();
      if(Array.isArray(djData) && djData.length > 0) {
        var added = _gfApplyDiscs(djData);
        // Corrige nomes de curso e propaga campos multi-curso do localStorage
        var codeMap = {};
        djData.forEach(function(d){ if(d.code) codeMap[d.code] = d; });
        S.disciplines.forEach(function(d){
          var src = codeMap[d.code];
          if(!src) return;
          d.course = src.course;
          if(src.courses)           d.courses           = src.courses;
          if(src.namesByCourse)     d.namesByCourse     = src.namesByCourse;
          if(src.schedulesByCourse) d.schedulesByCourse = src.schedulesByCourse;
          if(src.periodsByCourse)   d.periodsByCourse   = src.periodsByCourse;
        });
        _gfFinishLoad(added, statusBar);
        return; // não precisa parsear PDFs
      }
    }
  } catch(e) { /* disciplines.json ausente – cai no parser PDF */ }

  // Fallback: parser PDF via manifest
  var resp;
  try { resp = await fetch('pdfs/manifest.json'); } catch(e) {
    if(statusBar) statusBar.style.display = 'none';
    return;
  }
  if(!resp.ok) { if(statusBar) statusBar.style.display = 'none'; return; }

  var manifest;
  try { manifest = await resp.json(); } catch(e) { if(statusBar) statusBar.style.display = 'none'; return; }

  var pdfs = (manifest.pdfs || []).filter(function(p){ return p.file; });
  if(!pdfs.length) { if(statusBar) statusBar.style.display = 'none'; return; }

  if(statusBar) statusBar.textContent = '⏳ Analisando ' + pdfs.length + ' PDF(s)...';

  var totalAdded = 0;
  for(var pi = 0; pi < pdfs.length; pi++) {
    var entry = pdfs[pi];
    try {
      var r = await fetch('pdfs/' + encodeURIComponent(entry.file));
      if(!r.ok) continue;
      var buf = await r.arrayBuffer();
      var discs = await parsePDFData(buf, entry.file, entry.course);
      totalAdded += _gfApplyDiscs(discs);
    } catch(e) { console.error('[GradeFlow] Erro no PDF ' + entry.file + ':', e); }
  }

  _gfFinishLoad(totalAdded, statusBar);
};

// FILE HANDLING
window.doDrop = function(e) {
  e.preventDefault();
  document.getElementById('upzone').classList.remove('drag');
  handleFiles(e.dataTransfer.files);
};

window.handleFiles = async function(files) {
  for(var i = 0; i < files.length; i++) {
    var file = files[i];
    if(!file.name.toLowerCase().endsWith('.pdf')) continue;
    var pid = addFilePill(file.name);
    try {
      var discs = await parsePDF(file);
      var added = 0;
      for(var j = 0; j < discs.length; j++) {
        var d = discs[j];
        if(!S.disciplines.some(function(x){ return x.code === d.code; })) {
          S.disciplines.push(d); added++;
        }
      }
      updateFilePill(pid, added > 0 ? 'ok' : 'er', added > 0 ? added + ' disciplinas' : 'Nenhuma extraida');
      if(added > 0) {
        showGFToast(added + ' disciplina(s) adicionada(s)!');
        sbGo('discs');
      } else {
        showGFToast('PDF sem dados extraiveis. Use o metodo manual.', true);
      }
    } catch(err) {
      updateFilePill(pid, 'er', 'Erro ao ler');
      showGFToast('Erro no PDF. Tente o metodo manual.', true);
    }
    renderDiscList();
    gfSave();
    if(typeof updateSmartBadge === 'function') updateSmartBadge();
    if(typeof updateBridgeBar === 'function') updateBridgeBar();
    if(typeof renderAvailableSidebar === 'function') {
      var hv = document.getElementById('view-horario');
      if(hv && hv.classList.contains('active')) renderAvailableSidebar();
    }
    if(typeof renderConsulta === 'function') {
      var cv = document.getElementById('view-consulta');
      if(cv && cv.classList.contains('active')) renderConsulta();
    }
  }
};

var pillCount = 0;
function addFilePill(name) {
  var id = 'fp' + (++pillCount);
  var short = name.replace(/_-_Publicacao\.pdf$/i,'').replace(/\.pdf$/i,'').replace(/_/g,' ').substring(0, 34);
  var el = document.createElement('div');
  el.className = 'fp'; el.id = id;
  el.innerHTML = '<span>&#128196;</span>' +
    '<span class="fp-name">' + gfEscHtml(short) + '</span>' +
    '<span class="fp-st s-ld" id="' + id + '-st">Lendo...</span>' +
    '<button class="fp-rm" onclick="document.getElementById(\'' + id + '\').remove()">x</button>';
  document.getElementById('file-list').appendChild(el);
  return id;
}

function updateFilePill(id, cls, text) {
  var el = document.getElementById(id + '-st'); if(!el) return;
  el.className = 'fp-st ' + (cls === 'ok' ? 's-ok' : cls === 'er' ? 's-er' : 's-ld');
  el.textContent = text;
}

// PASTE FALLBACK
window.parsePaste = function() {
  var text = document.getElementById('paste-area').value.trim();
  var course = document.getElementById('paste-course').value.trim() || 'Manual';
  if(!text) { showGFToast('Cole o texto primeiro!', true); return; }

  var lines = text.split('\n');
  var results = [];
  var seenLocal = {};
  var period = '?';

  for(var i = 0; i < lines.length; i++) {
    var line = lines[i].trim(); if(!line) continue;
    var lineUp = line.toUpperCase().replace(/Í/g,'I').replace(/É/g,'E');
    if(lineUp.indexOf('PERIODO') !== -1) {
      var numM = line.match(/([0-9]+)/); if(numM) period = numM[1] + 'º'; continue;
    }
    var tokens = line.split(/\s+/);
    var code = null;
    for(var j = 0; j < tokens.length; j++) { if(isCodeLike(tokens[j])) { code = tokens[j]; break; } }
    if(!code || seenLocal[code]) continue;
    var timesFound = [];
    var tparts = line.split(/\s+/);
    for(var tp = 0; tp < tparts.length; tp++) { if(isTimeFmt(tparts[tp])) timesFound.push(tparts[tp]); }
    var ch = 0;
    for(var np = 0; np < tparts.length; np++) {
      var n = parseInt(tparts[np]);
      if(!isNaN(n) && n % 15 === 0 && n >= 15 && n <= 900) { ch = n; break; }
    }
    var nameTokens = [];
    for(var ntp = 0; ntp < tokens.length; ntp++) {
      var tok = tokens[ntp];
      if(isCodeLike(tok)) continue; if(isTimeFmt(tok)) continue;
      var allDig = true;
      for(var nc = 0; nc < tok.length; nc++) { var cc = tok.charCodeAt(nc); if(cc < 48 || cc > 57) { allDig = false; break; } }
      if(allDig) continue; if(tok.length > 3) nameTokens.push(tok);
    }
    var name = nameTokens.join(' ').substring(0, 70).trim();
    if(!isValidName(name)) continue;
    var schedule = [];
    for(var ti = 0; ti < timesFound.length - 1 && schedule.length < 6; ti += 2) {
      if(gfT2m(timesFound[ti+1]) > gfT2m(timesFound[ti])) {
        schedule.push({day: GF_DAYS[schedule.length] || 'Seg', start: timesFound[ti], end: timesFound[ti+1]});
      }
    }
    seenLocal[code] = true;
    results.push({code: code, name: name, ct: 0, ch: ch, vagas: 0, room: '?', prereq: '', period: period, course: course, schedule: schedule});
  }

  if(!results.length) { showGFToast('Nao foi possivel interpretar. Use o formulario.', true); return; }
  for(var ri = 0; ri < results.length; ri++) {
    var d = results[ri];
    if(!S.disciplines.some(function(x){ return x.code === d.code; })) S.disciplines.push(d);
  }
  gfSave(); renderDiscList();
  document.getElementById('paste-area').value = '';
  showGFToast(results.length + ' disciplina(s) adicionada(s)!');
  sbGo('discs');
};

// MANUAL FORM
function buildDayPicker() {
  var wrap = document.getElementById('day-picker'); if(!wrap) return;
  wrap.innerHTML = '';
  GF_DAYS.forEach(function(d){
    var b = document.createElement('div');
    b.className = 'tg'; b.textContent = d; b.dataset.day = d;
    b.onclick = function(){ b.classList.toggle('on'); updateSchedPrev(); };
    wrap.appendChild(b);
  });
}

function buildTimePickers() {
  var s1 = document.getElementById('f-start');
  var s2 = document.getElementById('f-end');
  if(!s1 || !s2) return;
  s1.innerHTML = ''; s2.innerHTML = '';
  GF_TIMES.forEach(function(t){
    var o1 = document.createElement('option'); o1.value = o1.textContent = t; s1.appendChild(o1);
    var o2 = document.createElement('option'); o2.value = o2.textContent = t; s2.appendChild(o2);
  });
  s2.value = '10:50';
  s1.onchange = s2.onchange = updateSchedPrev;
}

function updateSchedPrev() {
  var days = [].slice.call(document.querySelectorAll('#day-picker .tg.on')).map(function(b){ return b.dataset.day; });
  var s1 = document.getElementById('f-start');
  var s2 = document.getElementById('f-end');
  var prev = document.getElementById('sched-preview');
  if(!prev || !s1 || !s2) return;
  if(!days.length) { prev.textContent = 'Selecione pelo menos um dia'; return; }
  prev.textContent = days.map(function(d){ return d + ' ' + s1.value + '-' + s2.value; }).join(' / ');
}

window.addManual = function() {
  var code = (document.getElementById('f-code').value || '').trim().toUpperCase();
  var name = (document.getElementById('f-name').value || '').trim();
  var course = (document.getElementById('f-course').value || '').trim() || 'Manual';
  var ch = parseInt(document.getElementById('f-ch').value) || 0;
  var period = (document.getElementById('f-period').value || '').trim() || '?';
  var room = (document.getElementById('f-room').value || '').trim() || '?';
  var vagas = parseInt(document.getElementById('f-vagas').value) || 0;
  var prereq = (document.getElementById('f-prereq').value || '').trim();
  if(!code || !name) { showGFToast('Preencha ao menos codigo e nome!', true); return; }
  if(S.disciplines.some(function(d){ return d.code === code; })) { showGFToast('Codigo ja existe!', true); return; }
  var days = [].slice.call(document.querySelectorAll('#day-picker .tg.on')).map(function(b){ return b.dataset.day; });
  var start = (document.getElementById('f-start') || {}).value || '';
  var end = (document.getElementById('f-end') || {}).value || '';
  var schedule = days.map(function(day){ return {day: day, start: start, end: end}; });
  S.disciplines.push({code: code, name: name, ct: 0, ch: ch, vagas: vagas, room: room, prereq: prereq, period: period, course: course, schedule: schedule});
  gfSave(); renderDiscList();
  ['f-code','f-name','f-ch','f-period','f-room','f-vagas','f-prereq'].forEach(function(id){
    var el = document.getElementById(id); if(el) el.value = '';
  });
  [].slice.call(document.querySelectorAll('#day-picker .tg.on')).forEach(function(b){ b.classList.remove('on'); });
  var prev = document.getElementById('sched-preview'); if(prev) prev.textContent = '';
  showGFToast('"' + name + '" adicionada!');
  sbGo('discs');
};

// DISC LIST
function renderDiscList() {
  var list = document.getElementById('disc-list'); if(!list) return;
  if(!S.disciplines.length) {
    list.innerHTML = '<div class="empty"><div class="empty-icon">&#128228;</div><p>Carregue PDFs para ver as disciplinas</p></div>';
    renderCourseFilters(); renderPeriodFilters(); return;
  }
  var searchEl = document.getElementById('disc-search');
  var search = searchEl ? searchEl.value.trim().toLowerCase() : '';
  var schedOnly = document.getElementById('pref-sched') ? document.getElementById('pref-sched').classList.contains('on') : false;
  var chMax = document.getElementById('ch-max') ? (parseInt(document.getElementById('ch-max').value) || 300) : 300;
  var activeTurnos = [].slice.call(document.querySelectorAll('[data-pref="turno"].on')).map(function(b){ return b.dataset.val; });
  var activeDias = [].slice.call(document.querySelectorAll('[data-pref="dias"].on')).map(function(b){ return b.dataset.val; });
  var activeCourses = [];
  if(S.courseFilter) { Object.keys(S.courseFilter).forEach(function(c){ if(S.courseFilter[c] !== false) activeCourses.push(c); }); }
  var activePeriods = [];
  if(S.periodFilter) { Object.keys(S.periodFilter).forEach(function(p){ if(S.periodFilter[p] !== false) activePeriods.push(p); }); }
  var discs = S.disciplines.slice();
  if(search) {
    discs = discs.filter(function(d){
      return d.name.toLowerCase().indexOf(search) !== -1 ||
             d.code.toLowerCase().indexOf(search) !== -1 ||
             d.course.toLowerCase().indexOf(search) !== -1 ||
             (d.period && d.period.toLowerCase().indexOf(search) !== -1);
    });
  }
  if(schedOnly) discs = discs.filter(function(d){ return d.schedule && d.schedule.length > 0; });
  if(activeTurnos.length > 0 && activeTurnos.length < 3) {
    discs = discs.filter(function(d){
      if(!d.schedule.length) return false;
      return d.schedule.some(function(s){ return activeTurnos.indexOf(getShift(s.start)) !== -1; });
    });
  }
  if(activeDias.length > 0 && activeDias.length < 6) {
    discs = discs.filter(function(d){
      if(!d.schedule.length) return false;
      return d.schedule.some(function(s){ return activeDias.indexOf(s.day) !== -1; });
    });
  }
  var someCourseOff = S.courseFilter && Object.values(S.courseFilter).some(function(v){ return v === false; });
  if(someCourseOff && activeCourses.length > 0) {
    discs = discs.filter(function(d){ return activeCourses.indexOf(d.course) !== -1; });
  }
  var somePeriodsOff = S.periodFilter && Object.values(S.periodFilter).some(function(v){ return v === false; });
  if(somePeriodsOff && activePeriods.length > 0) {
    discs = discs.filter(function(d){ return activePeriods.indexOf(d.period) !== -1; });
  }
  var selCH = selDiscs().reduce(function(a,d){ return a + d.ch; }, 0);
  if(!discs.length) {
    list.innerHTML = '<div class="empty"><div class="empty-icon">&#128269;</div><p>Nenhuma disciplina encontrada</p>' +
      (search ? '<small>Tente outro termo de busca</small>' : '') + '</div>';
    renderCourseFilters(); renderPeriodFilters(); return;
  }
  var byCourse = {};
  discs.forEach(function(d){ if(!byCourse[d.course]) byCourse[d.course] = []; byCourse[d.course].push(d); });
  list.innerHTML = '';
  Object.keys(byCourse).forEach(function(course){
    var cds = byCourse[course];
    var hdr = document.createElement('div'); hdr.className = 'ghdr';
    hdr.textContent = course + ' (' + cds.length + ')';
    list.appendChild(hdr);
    cds.forEach(function(d){
      var isSel = !!S.selected[d.code];
      var hasCf = S.conflicts.some(function(c){ return c.a.code === d.code || c.b.code === d.code; });
      var schedText = d.schedule.length ? d.schedule.map(function(s){ return s.day + ' ' + s.start; }).join(' / ') : 'Sem horario';
      var shiftLabel = '';
      if(d.schedule.length) {
        var sh = getShift(d.schedule[0].start);
        shiftLabel = sh === 'manha' ? 'Manha' : sh === 'tarde' ? 'Tarde' : 'Noite';
      }
      var wouldExceed = !isSel && (selCH + d.ch) > chMax;
      var el = document.createElement('div');
      el.className = 'disc-item' + (isSel ? ' sel' : '');
      el.innerHTML =
        '<div class="disc-chk">' + (isSel ? '&#10003;' : '') + '</div>' +
        '<div style="flex:1;min-width:0;">' +
          '<div class="disc-name">' + (hasCf ? '! ' : '') + gfEscHtml(d.name) + '</div>' +
          '<div class="disc-meta">' +
            '<span class="dtag">' + gfEscHtml(d.code) + '</span>' +
            (function(){
              if(!d.period || d.period === '?') return '';
              if(d.period === 'Optativa') return '<span class="dtag" style="background:rgba(251,191,36,.15);color:#fbbf24;">Optativa</span>';
              if(d.period === 'Fora de Período') return '<span class="dtag" style="background:rgba(248,113,113,.15);color:#f87171;">Fora de Período</span>';
              return '<span class="dtag" style="background:rgba(124,127,255,.15);color:var(--accent2);">' + gfEscHtml(d.period) + ' per.</span>';
            })() +
            '<span class="dtag">CH:' + d.ch + '</span>' +
            (d.room !== '?' ? '<span class="dtag">' + gfEscHtml(d.room) + '</span>' : '') +
            '<span class="dtag' + (d.schedule.length ? ' dtag-g' : '') + '">' + (shiftLabel ? shiftLabel + ' - ' : '') + gfEscHtml(schedText) + '</span>' +
            (d.prereq ? '<span class="dtag dtag-y">Req: ' + gfEscHtml(d.prereq) + '</span>' : '') +
            (wouldExceed ? '<span class="dtag dtag-y">Excede CH max.</span>' : '') +
          '</div>' +
        '</div>';
      el.onclick = function(){ toggleDisc(d.code); };
      list.appendChild(el);
    });
  });
  renderCourseFilters(); renderPeriodFilters();
}

function renderCourseFilters() {
  var wrap = document.getElementById('course-filters'); if(!wrap) return;
  var courses = [];
  S.disciplines.forEach(function(d){ if(courses.indexOf(d.course) === -1) courses.push(d.course); });
  if(courses.length <= 1) { wrap.innerHTML = ''; return; }
  if(!S.courseFilter) S.courseFilter = {};
  wrap.innerHTML = '';
  courses.forEach(function(c){
    var isOn = S.courseFilter[c] !== false;
    var b = document.createElement('div');
    b.className = 'cf-btn' + (isOn ? ' on' : ''); b.dataset.course = c;
    b.textContent = c.replace('Eng. ','');
    b.onclick = function(){ S.courseFilter[c] = !isOn; renderDiscList(); };
    wrap.appendChild(b);
  });
}

function renderPeriodFilters() {
  var wrap = document.getElementById('period-filters'); if(!wrap) return;
  var periods = [];
  S.disciplines.forEach(function(d){
    if(d.period && d.period !== '?' && periods.indexOf(d.period) === -1) periods.push(d.period);
  });
  periods.sort(function(a,b){ var na = parseInt(a) || 999, nb = parseInt(b) || 999; return na - nb; });
  if(periods.length <= 1) { wrap.innerHTML = ''; return; }
  if(!S.periodFilter) S.periodFilter = {};
  wrap.innerHTML = '<span style="font-size:10px;color:var(--text3);margin-right:4px;align-self:center;">Per:</span>';
  periods.forEach(function(p){
    var isOn = S.periodFilter[p] !== false;
    var b = document.createElement('div');
    b.className = 'cf-btn pf-btn' + (isOn ? ' on' : ''); b.dataset.period = p; b.textContent = p;
    b.onclick = function(){ S.periodFilter[p] = !isOn; renderDiscList(); };
    wrap.appendChild(b);
  });
}

function toggleDisc(code) {
  if(S.selected[code]) { delete S.selected[code]; }
  else { assignColor(code); S.selected[code] = true; }
  detectConflicts(); gfRenderAll(); gfSave();
}
window.toggleDisc = toggleDisc;

function detectConflicts() {
  S.conflicts = [];
  var sel = selDiscs();
  for(var i = 0; i < sel.length; i++) {
    for(var j = i + 1; j < sel.length; j++) {
      var a = sel[i], b = sel[j];
      var over = [];
      for(var ai = 0; ai < a.schedule.length; ai++) {
        for(var bi = 0; bi < b.schedule.length; bi++) {
          var sa = a.schedule[ai], sb = b.schedule[bi];
          if(sa.day !== sb.day) continue;
          var a0 = gfT2m(sa.start), a1 = gfT2m(sa.end);
          var b0 = gfT2m(sb.start), b1 = gfT2m(sb.end);
          if(a0 < b1 && b0 < a1) { over.push({day: sa.day, timeA: sa.start + '-' + sa.end, timeB: sb.start + '-' + sb.end}); }
        }
      }
      if(over.length) S.conflicts.push({a: a, b: b, over: over});
    }
  }
}
window.detectConflicts = detectConflicts;

function gfRenderAll() {
  renderDiscList(); renderGrade(); renderConflictsList();
  renderListView(); renderPriorities(); updateGFStats();
}
window.renderAll = gfRenderAll;

function updateGFStats() {
  var sel = selDiscs();
  var ch = sel.reduce(function(a,d){ return a + d.ch; }, 0);
  var daysSet = {};
  sel.forEach(function(d){ d.schedule.forEach(function(s){ daysSet[s.day] = true; }); });
  var nc = S.conflicts.length;
  var setText = function(id, val){ var el = document.getElementById(id); if(el) el.textContent = val; };
  setText('st-tot', sel.length); setText('st-ch', ch);
  setText('st-days', Object.keys(daysSet).length); setText('st-cf', nc);
  setText('nv-d', sel.length); setText('nv-h', ch);
  var badge = document.getElementById('cf-badge');
  var navCf = document.getElementById('nv-cf-wrap');
  if(nc > 0) {
    if(badge) { badge.textContent = nc; badge.classList.remove('hidden'); }
    if(navCf) { navCf.classList.remove('hidden'); setText('nv-cn', nc); }
  } else {
    if(badge) badge.classList.add('hidden');
    if(navCf) navCf.classList.add('hidden');
  }
}

function renderGrade() {
  var sel = selDiscs();
  var empty = document.getElementById('grade-empty');
  var ok = document.getElementById('grade-ok');
  if(!empty || !ok) return;
  if(!sel.length) { empty.classList.remove('hidden'); ok.classList.add('hidden'); return; }
  empty.classList.add('hidden'); ok.classList.remove('hidden');
  var setText = function(id, val){ var el = document.getElementById(id); if(el) el.textContent = val; };
  setText('gf-grade-sub', sel.length + ' disciplina(s) - ' + sel.reduce(function(a,d){ return a+d.ch; },0) + ' h/aula');
  var dayFilter = document.getElementById('day-filter') ? document.getElementById('day-filter').value : 'all';
  var ALL_SLOTS = [
    ['07:30','08:20'],['08:20','09:10'],['09:10','10:00'],['10:00','10:50'],
    ['10:50','11:40'],['11:40','12:30'],['13:00','13:50'],['13:50','14:40'],
    ['14:40','15:30'],['15:30','16:20'],['16:20','17:10'],['17:10','18:00'],
    ['18:00','18:50'],['18:50','19:40'],['19:40','20:30'],['20:30','21:20'],['21:20','22:10']
  ];
  function expandSlots(start, end) {
    var s = gfT2m(start), e = gfT2m(end);
    var result = [];
    for(var i = 0; i < ALL_SLOTS.length; i++) {
      var sl = ALL_SLOTS[i];
      if(gfT2m(sl[0]) >= s && gfT2m(sl[1]) <= e) result.push(sl);
    }
    if(!result.length) result.push([start, end]);
    return result;
  }
  var occupied = {};
  sel.forEach(function(d){
    d.schedule.forEach(function(s){
      if(dayFilter !== 'all' && s.day !== dayFilter) return;
      var expanded = expandSlots(s.start, s.end);
      expanded.forEach(function(sl){
        var key = sl[0] + '|' + sl[1];
        if(!occupied[key]) occupied[key] = {};
        if(!occupied[key][s.day]) occupied[key][s.day] = [];
        occupied[key][s.day].push(d);
      });
    });
  });
  var activeDays = GF_DAYS.filter(function(d){
    return sel.some(function(disc){ return disc.schedule.some(function(s){ return s.day === d; }); });
  });
  if(!activeDays.length) activeDays = GF_DAYS.slice(0,5);
  if(dayFilter !== 'all') activeDays = [dayFilter];
  var activeSlots = ALL_SLOTS.filter(function(sl){
    var key = sl[0] + '|' + sl[1];
    if(!occupied[key]) return false;
    return activeDays.some(function(day){ return occupied[key][day] && occupied[key][day].length; });
  });
  var grid = document.getElementById('grid-tbl'); if(!grid) return;
  grid.style.gridTemplateColumns = '68px repeat(' + activeDays.length + ', 1fr)';
  grid.innerHTML = '';
  var corner = document.createElement('div'); corner.className = 'gh'; corner.textContent = 'Horario'; grid.appendChild(corner);
  activeDays.forEach(function(d){ var h = document.createElement('div'); h.className = 'gh'; h.textContent = d; grid.appendChild(h); });
  var prevDisc = {};
  activeDays.forEach(function(d){ prevDisc[d] = null; });
  activeSlots.forEach(function(sl){
    var key = sl[0] + '|' + sl[1];
    var tc = document.createElement('div'); tc.className = 'gt'; tc.textContent = sl[0]; grid.appendChild(tc);
    activeDays.forEach(function(day){
      var cell = document.createElement('div'); cell.className = 'gc';
      var discsHere = (occupied[key] && occupied[key][day]) ? occupied[key][day] : [];
      if(discsHere.length === 0) { prevDisc[day] = null; grid.appendChild(cell); return; }
      discsHere.forEach(function(d, idx){
        var hasCf = S.conflicts.some(function(c){
          return (c.a.code === d.code || c.b.code === d.code) && c.over.some(function(o){ return o.day === day; });
        });
        var colCls = 'ec' + ((S.colorMap[d.code] || 0) % GF_EC);
        var ev = document.createElement('div');
        var isContinuation = (prevDisc[day] === d.code);
        if(discsHere.length > 1) {
          ev.className = 'mev ' + colCls + (hasCf ? ' cf-ev' : '');
          var w = 100 / discsHere.length;
          ev.style.left = (idx * w) + '%'; ev.style.width = w + '%';
        } else {
          ev.className = 'gevent ' + colCls + (hasCf ? ' cf-ev' : '');
        }
        if(isContinuation) {
          ev.style.opacity = '0.75'; ev.style.borderTop = 'none'; ev.style.borderRadius = '0 0 3px 3px';
          ev.innerHTML = '<span style="font-size:8px;opacity:0.6;">&#9660;</span>';
        } else {
          var words = d.name.split(' '); ev.textContent = words.slice(0, 3).join(' ');
        }
        ev.title = d.name + '\n' + d.code + '\n' + d.schedule.filter(function(s){ return s.day===day; }).map(function(s){ return s.start+'-'+s.end; }).join(', ') + '\nSala: ' + d.room;
        (function(disc){ ev.onclick = function(e){ e.stopPropagation(); showDetail(disc); }; })(d);
        cell.appendChild(ev);
      });
      prevDisc[day] = discsHere[0].code;
      grid.appendChild(cell);
    });
  });
  var legend = document.getElementById('gf-legend');
  if(legend) {
    legend.innerHTML = '';
    sel.forEach(function(d){
      var ci = (S.colorMap[d.code] || 0) % GF_EC;
      var li = document.createElement('div'); li.className = 'li';
      var dot = document.createElement('div'); dot.className = 'ldot';
      dot.style.background = GF_COLORS[ci] + '33'; dot.style.borderLeft = '3px solid ' + GF_COLORS[ci];
      li.appendChild(dot);
      li.appendChild(document.createTextNode(d.name.substring(0, 28) + (d.name.length > 28 ? '...' : '')));
      legend.appendChild(li);
    });
  }
  var cwBox = document.getElementById('cf-warn-box');
  if(cwBox) {
    if(S.conflicts.length > 0) { cwBox.classList.remove('hidden'); setText('gf-cf-warn-n', S.conflicts.length); }
    else cwBox.classList.add('hidden');
  }
}

function renderConflictsList() {
  var container = document.getElementById('cf-list'); if(!container) return;
  if(!S.conflicts.length) { container.innerHTML = '<div class="empty"><div class="empty-icon">&#9989;</div><p>Nenhum conflito!</p></div>'; return; }
  container.innerHTML = '';
  S.conflicts.forEach(function(cf){
    var pa = S.priorities[cf.a.code] || 'med';
    var pb = S.priorities[cf.b.code] || 'med';
    var overText = cf.over.map(function(o){ return '<b>' + o.day + '</b>: ' + o.timeA + ' vs ' + o.timeB; }).join('<br/>');
    var card = document.createElement('div'); card.className = 'cf-card';
    card.innerHTML = '<h4>Conflito: ' + gfEscHtml(cf.a.name) + ' x ' + gfEscHtml(cf.b.name) + '</h4>' +
      '<p>Sobreposicao em:<br/>' + overText + '</p>' +
      '<p style="margin-top:6px;font-size:11px;opacity:.7;">Prioridade: ' + cf.a.code + ' = ' + pa + ' / ' + cf.b.code + ' = ' + pb + '</p>' +
      '<div class="cf-actions">' +
        '<button class="btn btn-r btn-xs" onclick="removeDisc(\'' + cf.b.code + '\')">Remover ' + gfEscHtml(cf.b.name.split(' ')[0]) + '</button>' +
        '<button class="btn btn-r btn-xs" onclick="removeDisc(\'' + cf.a.code + '\')">Remover ' + gfEscHtml(cf.a.name.split(' ')[0]) + '</button>' +
        '<button class="btn btn-g btn-xs" onclick="mainGo(\'grade\')">Manter ambas</button>' +
      '</div>';
    container.appendChild(card);
  });
}

window.removeDisc = function(code) {
  delete S.selected[code]; detectConflicts(); gfRenderAll(); gfSave();
  showGFToast('Disciplina removida da grade.');
};

function renderListView() {
  var sel = selDiscs();
  var setText = function(id, val){ var el = document.getElementById(id); if(el) el.textContent = val; };
  setText('gf-list-sub', sel.length ? sel.length + ' disciplina(s) - ' + sel.reduce(function(a,d){ return a+d.ch; },0) + ' h/aula' : 'Nenhuma disciplina selecionada');
  var container = document.getElementById('list-tbl'); if(!container) return;
  if(!sel.length) { container.innerHTML = '<div class="empty"><div class="empty-icon">&#128203;</div><p>Selecione disciplinas na barra lateral</p></div>'; return; }
  var totalCH = sel.reduce(function(a,d){ return a + d.ch; }, 0);
  var table = document.createElement('table'); table.className = 'ltable';
  table.innerHTML = '<thead><tr><th>Codigo</th><th>Disciplina</th><th>Curso</th><th>CH</th><th>Per.</th><th>Horario</th><th>Sala</th><th></th></tr></thead>' +
    '<tbody id="ltbody"></tbody>' +
    '<tfoot><tr><td colspan="3" style="padding:8px 10px;font-weight:600;">TOTAL</td><td style="padding:8px 10px;font-weight:600;">' + totalCH + ' h/a</td><td colspan="4"></td></tr></tfoot>';
  container.innerHTML = ''; container.appendChild(table);
  var tbody = document.getElementById('ltbody');
  sel.forEach(function(d){
    var hasCf = S.conflicts.some(function(c){ return c.a.code === d.code || c.b.code === d.code; });
    var sched = d.schedule.map(function(s){ return s.day + ' ' + s.start; }).join(', ') || '-';
    var tr = document.createElement('tr');
    tr.innerHTML = '<td><code style="font-size:11px;color:var(--text2)">' + gfEscHtml(d.code) + '</code></td>' +
      '<td style="font-weight:500">' + (hasCf ? '! ' : '') + gfEscHtml(d.name) + '</td>' +
      '<td style="color:var(--text2)">' + gfEscHtml(d.course) + '</td>' +
      '<td>' + d.ch + '</td><td>' + gfEscHtml(d.period || '?') + '</td>' +
      '<td style="font-size:11px;color:var(--text2)">' + gfEscHtml(sched) + '</td>' +
      '<td>' + gfEscHtml(d.room) + '</td>' +
      '<td><button class="btn btn-r btn-xs" onclick="removeDisc(\'' + d.code + '\')">x</button></td>';
    tbody.appendChild(tr);
  });
}

function renderPriorities() {
  var list = document.getElementById('prio-list'); if(!list) return;
  var sel = selDiscs();
  if(!sel.length) { list.innerHTML = '<div class="empty"><div class="empty-icon">&#127942;</div><p>Selecione disciplinas primeiro</p></div>'; return; }
  list.innerHTML = '';
  sel.forEach(function(d, i){
    var prio = S.priorities[d.code] || 'med';
    var div = document.createElement('div'); div.className = 'prio-item';
    div.innerHTML = '<span class="prio-rank">' + (i+1) + '</span>' +
      '<span style="flex:1;font-size:12px;">' + gfEscHtml(d.name.substring(0, 26)) + '</span>' +
      '<select style="font-size:11px;padding:3px 6px;background:var(--bg4);border:1px solid var(--border2);color:var(--text);border-radius:4px;width:auto;outline:none;"' +
        ' onchange="S.priorities[\'' + d.code + '\']=this.value;gfSave()">' +
        '<option value="high"' + (prio==='high'?' selected':'') + '>Alta</option>' +
        '<option value="med"' + (prio==='med'?' selected':'') + '>Media</option>' +
        '<option value="low"' + (prio==='low'?' selected':'') + '>Baixa</option>' +
      '</select>';
    list.appendChild(div);
  });
}

function showDetail(d) {
  var isSel = !!S.selected[d.code];
  var setText = function(id, val){ var el = document.getElementById(id); if(el) el.textContent = val; };
  setText('modal-title', d.name);
  var body = document.getElementById('modal-body');
  if(body) {
    body.innerHTML = '<b>' + gfEscHtml(d.code) + '</b> - ' + gfEscHtml(d.course) + ' - ' + gfEscHtml(d.period || '?') + ' periodo<br/>' +
      'CH: ' + d.ch + ' h/a - CT: ' + (d.ct || '?') + ' - Vagas: ' + (d.vagas || '?') + '<br/>' +
      'Sala: ' + gfEscHtml(d.room) + '<br/>' +
      (d.prereq ? 'Pre-req: <code style="font-size:11px;background:var(--bg3);padding:1px 4px;border-radius:3px;">' + gfEscHtml(d.prereq) + '</code><br/>' : '') +
      'Horario: ' + (d.schedule.map(function(s){ return s.day+' '+s.start+'-'+s.end; }).join(' / ') || 'A definir');
  }
  var acts = document.getElementById('modal-acts');
  if(acts) {
    acts.innerHTML = '<button class="btn ' + (isSel ? 'btn-r' : 'btn-p') + ' btn-sm" onclick="toggleDisc(\'' + d.code + '\');closeGFModal()">' +
      (isSel ? 'Remover da grade' : 'Adicionar a grade') + '</button>';
  }
  var ov = document.getElementById('gf-overlay'); if(ov) ov.classList.remove('hidden');
}

window.closeGFModal = function() {
  var ov = document.getElementById('gf-overlay'); if(ov) ov.classList.add('hidden');
};

window.exportGrade = function() {
  var sel = selDiscs();
  if(!sel.length) { showGFToast('Selecione disciplinas primeiro!', true); return; }
  mainGo('grade');
  var target = document.getElementById('grade-ok');
  if(!target) { showGFToast('Grade nao encontrada.', true); return; }
  showGFToast('Gerando imagem...');
  var titleBar = document.createElement('div');
  titleBar.style.cssText = 'padding:14px 18px 10px;background:#13131e;border-bottom:1px solid rgba(255,255,255,0.07);margin-bottom:0;';
  titleBar.innerHTML = '<div style="font-family:Inter,sans-serif;font-size:15px;font-weight:600;color:#eeeef5;">Grade Academica 2025/2</div>' +
    '<div style="font-family:Inter,sans-serif;font-size:12px;color:#8888a8;margin-top:3px;">' +
      sel.length + ' disciplina(s) &nbsp;·&nbsp; ' + sel.reduce(function(a,d){ return a+d.ch; },0) + ' h/aula' +
      (S.conflicts.length ? ' &nbsp;·&nbsp; <span style=\'color:#f87171\'>' + S.conflicts.length + ' conflito(s)</span>' : '') +
    '</div>';
  target.insertBefore(titleBar, target.firstChild);
  html2canvas(target, {backgroundColor:'#0d0d14',scale:2,useCORS:true,logging:false}).then(function(canvas) {
    target.removeChild(titleBar);
    var link = document.createElement('a');
    link.download = 'grade_academica_2025_2.png';
    link.href = canvas.toDataURL('image/png');
    link.click(); showGFToast('Imagem baixada!');
  }).catch(function(err) { target.removeChild(titleBar); showGFToast('Erro ao gerar imagem.', true); console.error(err); });
};

window.confirmClearGF = function() {
  if(!confirm('Limpar todos os dados?')) return;
  window.S = {disciplines:[], selected:{}, conflicts:[], colorMap:{}, priorities:{}, periodFilter:{}, courseFilter:{}};
  ['gf_d','gf_s','gf_p','gf_c'].forEach(function(k){ localStorage.removeItem(k); });
  _autoLoaded = false;
  var fl = document.getElementById('file-list'); if(fl) fl.innerHTML = '';
  gfRenderAll(); sbGo('upload'); showGFToast('Tudo limpo!');
  if(typeof autoLoadPDFs === 'function') autoLoadPDFs();
};

function showGFToast(msg, isErr) {
  var el = document.getElementById('gf-toast'); if(!el) return;
  el.textContent = msg;
  el.style.borderColor = isErr ? 'rgba(248,113,113,.3)' : 'var(--border2)';
  el.classList.remove('hide','hidden');
  clearTimeout(el._t);
  el._t = setTimeout(function(){ el.classList.add('hide'); setTimeout(function(){ el.classList.add('hidden'); }, 300); }, 3200);
}
window.toast = showGFToast;

window.sbGo = function(tab) {
  ['upload','discs','prefs','prio'].forEach(function(t){
    var sb = document.getElementById('sb-'+t); var sbt = document.getElementById('sbt-'+t);
    if(sb) sb.classList.add('hidden'); if(sbt) sbt.classList.remove('active');
  });
  var sb = document.getElementById('sb-'+tab); var sbt = document.getElementById('sbt-'+tab);
  if(sb) sb.classList.remove('hidden'); if(sbt) sbt.classList.add('active');
};

window.mainGo = function(tab) {
  ['grade','cf','list','info'].forEach(function(t){
    var v = document.getElementById(t==='grade'?'view-grade-gf':'view-'+t);
    var mt = document.getElementById('gf-mt-'+t);
    if(v) v.classList.add('hidden'); if(mt) mt.classList.remove('active');
  });
  var v = document.getElementById(tab==='grade'?'view-grade-gf':'view-'+tab);
  var mt = document.getElementById('gf-mt-'+tab);
  if(v) v.classList.remove('hidden'); if(mt) mt.classList.add('active');
};

window.ftGo = function(tab) {
  ['paste','form'].forEach(function(t){
    var fb = document.getElementById('fb-'+t); var ft = document.getElementById('ft-'+t);
    if(fb) fb.classList.add('hidden'); if(ft) ft.classList.remove('active');
  });
  var fb = document.getElementById('fb-'+tab); var ft = document.getElementById('ft-'+tab);
  if(fb) fb.classList.remove('hidden'); if(ft) ft.classList.add('active');
};

window.tgToggle = function(btn) { btn.classList.toggle('on'); renderDiscList(); };

window.gfSave = gfSave;
window.renderDiscList = renderDiscList;
window.renderGrade = renderGrade;
window.showGFToast = showGFToast;

window.addEventListener('load', function(){
  loadSaved();
  buildDayPicker();
  buildTimePickers();
  if(Object.keys(S.selected).length) detectConflicts();
  gfRenderAll();
  if(S.disciplines.length) sbGo('discs');
});
