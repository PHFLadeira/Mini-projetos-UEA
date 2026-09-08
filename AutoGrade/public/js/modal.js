/* ══ modal.js — ECA card modal and bulk select ══ */

let activeSub = null;
let selectMode = false;
let selectedIds = new Set();

// ── ECA Toast ──
let _ecaTT;
function showEcaToast(msg, type=''){
  const t = document.getElementById('eca-toast');
  if(!t) return;
  t.textContent = msg; t.className = 'eca-toast show' + (type ? ' ' + type : '');
  clearTimeout(_ecaTT); _ecaTT = setTimeout(() => t.classList.remove('show'), 2800);
}

// ── Card Modal ──
function openModal(sub){
  activeSub = sub;
  const d = getSub(sub.id);
  const c = PC[sub.period];
  const mt = document.getElementById('modal-top');
  if(mt) mt.style.background = `linear-gradient(135deg,${c.main}28,${c.light})`;
  const setText = (id,v) => {const e = document.getElementById(id); if(e) e.textContent = v;};
  setText('m-period', `${sub.period}º Período`);
  const mp = document.getElementById('m-period'); if(mp) mp.style.color = c.main;
  setText('m-title', d.realName || sub.name);
  setText('m-code', d.realCode || sub.code);
  setText('m-hours', sub.hours);
  const gc = document.getElementById('m-gc'), sc = document.getElementById('m-sc');
  if(d.grade){
    if(gc) gc.style.display = 'block';
    const gv = parseFloat(d.grade); const gcls = gv >= 7 ? 'gg' : gv >= 5 ? 'gk' : 'gb';
    const mg = document.getElementById('m-grade');
    if(mg) mg.innerHTML = `<span class="grade-badge ${gcls}">${d.grade}</span>`;
  } else if(gc) gc.style.display = 'none';
  if(d.semester){if(sc) sc.style.display = 'block'; setText('m-sem', d.semester);}
  else if(sc) sc.style.display = 'none';
  const slabels = {done:'✓ Concluída',enrolled:'▶ Cursando',failed:'↺ Já reprovei',pending:'⬜ Pendente'};
  const scolors = {done:'var(--green)',enrolled:'var(--accent)',failed:'var(--yellow)',pending:'var(--muted)'};
  const sb = document.getElementById('m-sbadge');
  if(sb){
    sb.textContent = slabels[d.status];
    sb.style.cssText = `background:${scolors[d.status]}22;color:${scolors[d.status]};border:1px solid ${scolors[d.status]}44;font-size:.6rem;padding:2px 7px;border-radius:4px;`;
  }
  ['pending','enrolled','done','failed'].forEach(s => {
    const el = document.getElementById('st-' + s); if(el) el.className = 'st-btn' + (d.status === s ? ' s-' + s : '');
  });
  const gn = id => DATA[window.G].find(x => x.id === id)?.name || id;
  const mp2 = document.getElementById('m-pre');
  if(mp2) mp2.innerHTML = (sub.pre||[]).length ? sub.pre.map(p => `<span class="chip pre">${gn(p)}</span>`).join('') : '<span class="chip none">Nenhum pré-requisito</span>';
  const mco = document.getElementById('m-coreq'), mcot = document.getElementById('m-coreq-title');
  if(mco && mcot){
    const hasCo = (sub.coreq||[]).length > 0;
    mco.style.display = mcot.style.display = hasCo ? '' : 'none';
    if(hasCo) mco.innerHTML = sub.coreq.map(p => `<span class="chip pre">${gn(p)}</span>`).join('');
  }
  const mpo = document.getElementById('m-post');
  if(mpo) mpo.innerHTML = (sub.unlocks||[]).length ? sub.unlocks.map(p => `<span class="chip post">${gn(p)}</span>`).join('') : '<span class="chip none">Não libera outras</span>';
  const mt2 = document.getElementById('m-teachers'); if(mt2) mt2.value = d.teachers || '';
  const mm = document.getElementById('m-materials'); if(mm) mm.value = d.materials || '';
  const mn = document.getElementById('m-notes'); if(mn) mn.value = d.notes || '';
  const isOpt = sub.code === '—';
  const optSec = document.getElementById('m-opt-section');
  if(optSec) optSec.style.display = isOpt ? '' : 'none';
  if(isOpt){ const on = document.getElementById('m-opt-name'); if(on) on.value = d.realName || ''; }
  const ov = document.getElementById('eca-overlay'); if(ov) ov.classList.add('open');
}

function closeModal(){
  const ov = document.getElementById('eca-overlay'); if(ov) ov.classList.remove('open');
  activeSub = null;
}

function setStatus(st){
  if(!activeSub) return;
  setSub(activeSub.id, {status: st});
  const card = document.getElementById('card-' + activeSub.id);
  if(card){card.classList.remove('done','enrolled','failed'); if(st !== 'pending') card.classList.add(st);}
  openModal(activeSub); updateStats();
  if(typeof updateSmartBadge === 'function') updateSmartBadge();
  const msgs = {done:'✓ Marcada como concluída!',enrolled:'▶ Marcada como cursando!',failed:'↺ Marcada como reprovada!',pending:'⬜ Status removido'};
  showEcaToast(msgs[st], st === 'done' ? 'ok' : '');
  setTimeout(drawArrows, 80);
}

function saveExtra(){
  if(!activeSub) return;
  const g = id => (document.getElementById(id) || {}).value || '';
  const upd = {teachers: g('m-teachers'), materials: g('m-materials'), notes: g('m-notes')};
  if(activeSub.code === '—'){
    upd.realName = g('m-opt-name') || '';
    const newTitle = upd.realName || activeSub.name;
    const mt = document.getElementById('m-title'); if(mt) mt.textContent = newTitle;
    const card = document.getElementById('card-' + activeSub.id);
    if(card){ const cn = card.querySelector('.card-name'); if(cn) cn.innerHTML = newTitle + '<span class="opt-badge">OPT</span>'; }
  }
  setSub(activeSub.id, upd);
  showEcaToast('💾 Salvo!', 'ok');
}

// ── Bulk Select ──
function toggleSelectMode(){
  selectMode = !selectMode; selectedIds.clear();
  const btn = document.getElementById('btn-select');
  const bar = document.getElementById('bulk-bar');
  if(selectMode){
    document.body.classList.add('select-mode');
    if(btn) btn.classList.add('selecting');
    if(btn) btn.textContent = 'Selecionando...';
    if(bar) bar.classList.add('open');
    updateBulkCount(); rebindCards();
  } else {
    document.body.classList.remove('select-mode');
    if(btn) btn.classList.remove('selecting');
    if(btn) btn.innerHTML = '&#9638; Selecionar';
    if(bar) bar.classList.remove('open');
    document.querySelectorAll('.card.sel-pick').forEach(c => c.classList.remove('sel-pick'));
    render();
  }
}

function rebindCards(){
  document.querySelectorAll('.card').forEach(card => {
    const id = card.id.replace('card-','');
    const clone = card.cloneNode(true);
    clone.addEventListener('click', e => {e.stopPropagation(); toggleCardSelect(id);});
    card.parentNode.replaceChild(clone, card);
  });
}

function toggleCardSelect(id){
  const card = document.getElementById('card-' + id); if(!card) return;
  if(selectedIds.has(id)){selectedIds.delete(id); card.classList.remove('sel-pick');}
  else{selectedIds.add(id); card.classList.add('sel-pick');}
  updateBulkCount();
}

function updateBulkCount(){
  const el = document.getElementById('bulk-count'); if(!el) return;
  el.textContent = selectedIds.size;
  el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
  setTimeout(() => el.classList.remove('bump'), 200);
}

function bulkSelectAll(){
  const allCards = document.querySelectorAll('.card');
  const allIds = [...allCards].map(c => c.id.replace('card-',''));
  const allSelected = allIds.every(id => selectedIds.has(id));
  if(allSelected){
    allIds.forEach(id => {selectedIds.delete(id); document.getElementById('card-' + id)?.classList.remove('sel-pick');});
  } else {
    allIds.forEach(id => {selectedIds.add(id); document.getElementById('card-' + id)?.classList.add('sel-pick');});
  }
  updateBulkCount();
}

function applyBulk(status){
  if(selectedIds.size === 0){showEcaToast('Nenhuma matéria selecionada.'); return;}
  const count = selectedIds.size;
  selectedIds.forEach(id => setSub(id, {status}));
  const labels = {done:'✓ Concluída',enrolled:'▶ Cursando',failed:'↺ Reprovada',pending:'⬜ Pendente'};
  showEcaToast(`${labels[status]} — ${count} atualizada(s)!`, 'ok');
  toggleSelectMode();
}

document.addEventListener('keydown', e => {
  if(e.key === 'Escape'){closeModal(); closeImport(); closeCfg(); if(typeof closeBackup==='function')closeBackup();}
});

window.activeSub = activeSub;
window.selectMode = selectMode;
window.selectedIds = selectedIds;
window.showEcaToast = showEcaToast;
window.openModal = openModal;
window.closeModal = closeModal;
window.setStatus = setStatus;
window.saveExtra = saveExtra;
window.toggleSelectMode = toggleSelectMode;
window.rebindCards = rebindCards;
window.toggleCardSelect = toggleCardSelect;
window.updateBulkCount = updateBulkCount;
window.bulkSelectAll = bulkSelectAll;
window.applyBulk = applyBulk;
