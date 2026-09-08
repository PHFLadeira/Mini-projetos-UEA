/* ══ render.js — ECA grade rendering ══ */

// G is the currently selected grade — always read/write via window.G
window.G = '2014';

function render(){
  const track = document.getElementById('track'); if(!track) return;
  track.innerHTML = '<svg id="svg-layer"></svg>';
  track.classList.toggle('vertical', CFG.orientation === 'v');
  track.style.gap = ({tight:'8px',normal:'15px',loose:'28px'})[CFG.spacing] || '15px';
  const scroll = document.getElementById('scroll');
  if(CFG.orientation === 'v'){
    if(scroll){scroll.style.overflowX = 'hidden';}
    track.style.minWidth = 'unset'; track.style.width = '100%';
  } else {
    if(scroll){scroll.style.overflowX = 'auto';}
    track.style.minWidth = 'max-content'; track.style.width = '';
  }
  const subs = DATA[window.G];
  const nextAvailSet = new Set();
  if(CFG.nextAvail){
    const preOK = pid => (typeof window.preSatisfied === 'function'
      ? window.preSatisfied(pid) : getSub(pid).status === 'done');
    subs.forEach(sub => {
      const d = getSub(sub.id);
      if(d.status !== 'pending') return;
      const allPreDone = (sub.pre||[]).every(preOK);
      if(allPreDone && (sub.pre||[]).length > 0) nextAvailSet.add(sub.id);
    });
  }
  const typeOf = sub => {
    if(sub.code === '—') return 'opt';
    if(sub.name.toLowerCase().startsWith('lab')) return 'lab';
    return 'req';
  };
  for(let p = 1; p <= 10; p++){
    if(CFG.periods.length > 0 && !CFG.periods.includes(p)) continue;
    let periodSubs = subs.filter(s => s.period === p);
    if(CFG.hideOpt) periodSubs = periodSubs.filter(s => s.code !== '—');
    if(CFG.hideDone) periodSubs = periodSubs.filter(s => getSub(s.id).status !== 'done');
    if(periodSubs.length === 0) continue;
    const col = document.createElement('div'); col.className = 'period-col';
    const c = PC[p];
    const isV = CFG.orientation === 'v';
    if(!isV) col.style.width = ({compact:'140px',normal:'160px',large:'195px'})[CFG.cardSize] || '160px';
    const head = document.createElement('div'); head.className = 'period-head';
    head.style.background = c.light; head.style.borderColor = c.main + '35'; head.style.color = c.main;
    head.textContent = isV ? `${p}º` : `${p}º Período`;
    if(isV) head.style.borderRightColor = c.main;
    head.addEventListener('click', () => {
      if(!document.body.classList.contains('select-mode')) return;
      const cards = col.querySelectorAll('.card');
      const allSel = [...cards].every(c => window.selectedIds.has(c.id.replace('card-','')));
      cards.forEach(card => {
        const id = card.id.replace('card-','');
        if(allSel){ window.selectedIds.delete(id); card.classList.remove('sel-pick'); }
        else{ window.selectedIds.add(id); card.classList.add('sel-pick'); }
      });
      window.updateBulkCount();
    });
    col.appendChild(head);
    const cardsContainer = document.createElement('div');
    if(isV) cardsContainer.className = 'v-cards-row';
    const groups = CFG.group ? [['req','Obrigatórias'],['lab','Laboratórios'],['opt','Optativas']] : [['all','']];
    groups.forEach(([gtype, glabel]) => {
      const groupSubs = gtype === 'all' ? periodSubs : periodSubs.filter(s => typeOf(s) === gtype);
      if(groupSubs.length === 0) return;
      if(CFG.group && glabel){
        const sep = document.createElement('div'); sep.className = 'group-sep'; sep.textContent = glabel;
        cardsContainer.appendChild(sep);
      }
      groupSubs.forEach(sub => {
        const d = getSub(sub.id); const isOpt = typeOf(sub) === 'opt';
        let cls = 'card'; if(d.status !== 'pending') cls += ' ' + d.status;
        if(CFG.cardSize === 'compact') cls += ' sz-compact';
        if(CFG.cardSize === 'large') cls += ' sz-large';
        if(nextAvailSet.has(sub.id)) cls += ' next-available';
        if(isOpt) cls += ' is-opt';
        const card = document.createElement('div'); card.className = cls;
        card.id = 'card-' + sub.id; card.style.borderColor = c.main + '25';
        const displayCode = d.realCode || sub.code;
        const displayName = d.realName || sub.name;
        const optBadge = isOpt ? `<span class="opt-badge">OPT</span>` : '';
        const codeHtml = CFG.showCode ? `<div class="card-code" style="color:${c.main}">${displayCode}</div>` : '';
        const hoursHtml = CFG.showHours ? `<div class="card-hours">${sub.hours}</div>` : '';
        let gradeHtml = '';
        if(CFG.showGrade && d.grade && d.status !== 'pending'){
          const gv = parseFloat(d.grade); const gc = gv >= 7 ? 'gg' : gv >= 5 ? 'gk' : 'gb';
          gradeHtml = `<div class="card-grade"><span class="grade-badge ${gc}">${d.grade}</span></div>`;
        }
        card.innerHTML = `<div class="card-stripe" style="background:${c.main}"></div>${codeHtml}<div class="card-name">${displayName}${optBadge}</div>${hoursHtml}${gradeHtml}`;
        if(CFG.arrowVis === 'hover'){
          card.addEventListener('mouseenter', () => {
            document.querySelectorAll('.arrow-line').forEach(l => l.style.opacity = '0');
            hlChain(sub.id, true);
          });
          card.addEventListener('mouseleave', () => {
            document.querySelectorAll('.arrow-line').forEach(l => l.style.opacity = '');
            hlChain(sub.id, false);
          });
        } else {
          card.addEventListener('mouseenter', () => hlChain(sub.id, true));
          card.addEventListener('mouseleave', () => hlChain(sub.id, false));
        }
        card.addEventListener('click', () => {
          if(!selectMode) openModal(sub); else toggleCardSelect(sub.id);
        });
        cardsContainer.appendChild(card);
      });
    });
    if(isV){col.appendChild(cardsContainer);}
    else{Array.from(cardsContainer.children).forEach(el => col.appendChild(el));}
    track.appendChild(col);
  }
  if(CFG.arrowVis === 'never'){
    setTimeout(() => {const sl = document.getElementById('svg-layer'); if(sl) sl.style.display = 'none';}, 130);
  } else {
    setTimeout(() => {const sl = document.getElementById('svg-layer'); if(sl) sl.style.display = ''; drawArrows();}, 120);
  }
  updateStats();
  if(typeof updateSmartBadge === 'function') updateSmartBadge();
}

function updateStats(){
  const subs = DATA[window.G]; let done = 0, enr = 0, fail = 0, pend = 0;
  subs.forEach(s => {
    const st = getSub(s.id).status;
    if(st === 'done') done++; else if(st === 'enrolled') enr++;
    else if(st === 'failed') fail++; else pend++;
  });
  const total = subs.length, pct = Math.round(done / total * 100);
  const setText = (id, v) => {const e = document.getElementById(id); if(e) e.textContent = v;};
  setText('s-done', done); setText('s-enr', enr); setText('s-fail', fail); setText('s-pend', pend);
  setText('s-pct', pct + '%');
  const pf = document.getElementById('prog-fill'); if(pf) pf.style.width = pct + '%';
  if(typeof getAvailableSubjects === 'function'){
    const avail = getAvailableSubjects();
    setText('s-avail', avail.length);
  }
}

function doSearch(q){
  q = q.toLowerCase().trim();
  const track = document.getElementById('track');
  if(!q){track.classList.remove('dimmed');document.querySelectorAll('.card').forEach(c => c.classList.remove('lit'));return;}
  track.classList.add('dimmed');
  document.querySelectorAll('.card').forEach(card => {
    const n = card.querySelector('.card-name')?.textContent.toLowerCase() || '';
    const co = card.querySelector('.card-code')?.textContent.toLowerCase() || '';
    card.classList.toggle('lit', n.includes(q) || co.includes(q));
  });
}

window.render = render;
window.updateStats = updateStats;
window.doSearch = doSearch;
