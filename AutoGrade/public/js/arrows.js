/* ══ arrows.js — SVG prerequisite arrows ══ */

function drawArrows(){
  const svg = document.getElementById('svg-layer');
  const track = document.getElementById('track');
  if(!svg || !track) return;
  svg.innerHTML = '';
  svg.style.width = track.scrollWidth + 'px';
  svg.style.height = track.scrollHeight + 'px';
  const tR = track.getBoundingClientRect();
  const statusCache = {};
  DATA[window.G].forEach(s => {statusCache[s.id] = getSub(s.id).status;});
  const edges = new Set();
  DATA[window.G].forEach(sub => {
    (sub.unlocks||[]).forEach(tid => edges.add(sub.id + '→' + tid));
    (sub.pre||[]).forEach(pid => edges.add(pid + '→' + sub.id));
  });
  edges.forEach(edge => {
    const [fromId, toId] = edge.split('→');
    const fromSt = statusCache[fromId] || 'pending';
    const toSt = statusCache[toId] || 'pending';
    const active = s => s === 'pending' || s === 'enrolled';
    if(!active(fromSt) || !active(toSt)) return;
    const e1 = document.getElementById('card-' + fromId);
    const e2 = document.getElementById('card-' + toId);
    if(!e1 || !e2) return;
    const r1 = e1.getBoundingClientRect(), r2 = e2.getBoundingClientRect();
    let d;
    const isV = CFG.orientation === 'v';
    if(isV){
      const x1 = r1.left + r1.width/2 - tR.left, y1 = r1.bottom - tR.top;
      const x2 = r2.left + r2.width/2 - tR.left, y2 = r2.top - tR.top;
      if(y2 <= y1 + 10) return;
      const cp = Math.abs(y2 - y1) * 0.4;
      if(CFG.arrowStyle === 'straight') d = `M${x1} ${y1} L${x2} ${y2}`;
      else if(CFG.arrowStyle === 'step'){const my = (y1+y2)/2; d = `M${x1} ${y1} L${x1} ${my} L${x2} ${my} L${x2} ${y2}`;}
      else d = `M${x1} ${y1} C${x1} ${y1+cp},${x2} ${y2-cp},${x2} ${y2}`;
    } else {
      const x1 = r1.right - tR.left, y1 = r1.top + r1.height/2 - tR.top;
      const x2 = r2.left - tR.left, y2 = r2.top + r2.height/2 - tR.top;
      if(x2 <= x1 + 10) return;
      const cp = Math.abs(x2 - x1) * 0.4;
      if(CFG.arrowStyle === 'straight') d = `M${x1} ${y1} L${x2} ${y2}`;
      else if(CFG.arrowStyle === 'step'){const mx = (x1+x2)/2; d = `M${x1} ${y1} L${mx} ${y1} L${mx} ${y2} L${x2} ${y2}`;}
      else d = `M${x1} ${y1} C${x1+cp} ${y1},${x2-cp} ${y2},${x2} ${y2}`;
    }
    const sw = {thin:1,normal:1.5,thick:3}[CFG.arrowSize] || 1.5;
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    path.setAttribute('class', 'arrow-line');
    path.setAttribute('stroke-width', sw);
    path.setAttribute('data-from', fromId);
    path.setAttribute('data-to', toId);
    svg.appendChild(path);
  });
}

function hlChain(id, on){
  const track = document.getElementById('track');
  if(!on){
    track.classList.remove('dimmed');
    document.querySelectorAll('.card').forEach(c => c.classList.remove('lit'));
    document.querySelectorAll('.arrow-line').forEach(l => {l.classList.remove('active'); l.style.stroke = '';});
    return;
  }
  track.classList.add('dimmed');
  const chain = new Set(), upstream = new Set();
  const fw = cid => {if(chain.has(cid)) return; chain.add(cid); DATA[window.G].find(x => x.id === cid)?.unlocks?.forEach(fw);};
  const bk = cid => {if(upstream.has(cid)) return; upstream.add(cid); const sub = DATA[window.G].find(x => x.id === cid); (sub?.pre||[]).forEach(bk);};
  fw(id); bk(id);
  const all = new Set([...chain, ...upstream]);
  all.forEach(cid => document.getElementById('card-' + cid)?.classList.add('lit'));
  const c = PC[DATA[window.G].find(s => s.id === id)?.period || 1];
  document.querySelectorAll('.arrow-line').forEach(l => {
    const from = l.getAttribute('data-from'), to = l.getAttribute('data-to');
    if(all.has(from) && all.has(to)){l.classList.add('active'); l.style.stroke = c.main;}
  });
}

window.drawArrows = drawArrows;
window.hlChain = hlChain;
