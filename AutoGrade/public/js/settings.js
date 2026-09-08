/* ══ settings.js — ECA configuration/settings ══ */

const CFG_KEY='eca_cfg_v1';
let CFG={
  theme:'dark',colorMode:'period',hideDone:false,nextAvail:false,hideOpt:false,
  periods:[],showCode:true,showHours:true,showGrade:true,planEnrolled:true,
  arrowVis:'always',arrowStyle:'curve',arrowAnim:'flow',arrowSize:'normal',
  orientation:'h',cardSize:'normal',spacing:'normal',group:false
};

function loadCfg(){try{const s=localStorage.getItem(CFG_KEY);if(s)CFG={...CFG,...JSON.parse(s)};}catch{}}
function saveCfg(){localStorage.setItem(CFG_KEY,JSON.stringify(CFG));}

function applyCfgOnLoad(){
  loadCfg();
  if(CFG.theme==='light')document.body.classList.add('theme-light');
  if(CFG.theme==='hc')document.body.classList.add('theme-hc');
  if(CFG.colorMode==='status')document.body.classList.add('color-status');
  if(CFG.colorMode==='mono')document.body.classList.add('color-mono');
}

function syncCfgUI(){
  const chk=(id,v)=>{const e=document.getElementById(id);if(e)e.checked=v;};
  chk('cfg-hide-done',CFG.hideDone);chk('cfg-next-avail',CFG.nextAvail);chk('cfg-hide-opt',CFG.hideOpt);
  chk('cfg-plan-enrolled',CFG.planEnrolled!==false);
  chk('cfg-show-code',CFG.showCode);chk('cfg-show-hours',CFG.showHours);chk('cfg-show-grade',CFG.showGrade);
  document.querySelectorAll('.period-chip').forEach(chip=>{
    const p=parseInt(chip.dataset.p||'0');
    chip.classList.toggle('active',CFG.periods.length===0?p===0:CFG.periods.includes(p));
  });
}

function applyCfg(){
  const chk=id=>(document.getElementById(id)||{}).checked||false;
  CFG.hideDone=chk('cfg-hide-done');CFG.nextAvail=chk('cfg-next-avail');CFG.hideOpt=chk('cfg-hide-opt');
  CFG.planEnrolled=chk('cfg-plan-enrolled');
  CFG.showCode=chk('cfg-show-code');CFG.showHours=chk('cfg-show-hours');CFG.showGrade=chk('cfg-show-grade');
  saveCfg();render();
  if(typeof renderAvailableSidebar==='function')renderAvailableSidebar();
  if(typeof updateBridgeBar==='function')updateBridgeBar();
}

function togglePeriod(p){
  if(p===0){CFG.periods=[];}else{
    const idx=CFG.periods.indexOf(p);
    if(idx>=0)CFG.periods.splice(idx,1);else CFG.periods.push(p);
    if(CFG.periods.length===0||CFG.periods.length===10)CFG.periods=[];
  }
  syncCfgUI();saveCfg();render();
}

function setTheme(t,btn){
  CFG.theme=t;document.body.classList.remove('theme-light','theme-hc');
  if(t==='light')document.body.classList.add('theme-light');
  if(t==='hc')document.body.classList.add('theme-hc');
  btn.closest('.cfg-seg').querySelectorAll('button').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');saveCfg();
}

function setColorMode(m,btn){
  CFG.colorMode=m;document.body.classList.remove('color-status','color-mono');
  if(m==='status')document.body.classList.add('color-status');
  if(m==='mono')document.body.classList.add('color-mono');
  btn.closest('.cfg-seg').querySelectorAll('button').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');saveCfg();
}

function setArrowVis(v,btn){
  CFG.arrowVis=v;
  btn.closest('.cfg-seg').querySelectorAll('button').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');saveCfg();
  const sl=document.getElementById('svg-layer');
  if(v==='never'&&sl)sl.style.display='none';else{if(sl)sl.style.display='';drawArrows();}
}

function setArrowStyle(s,btn){
  CFG.arrowStyle=s;
  btn.closest('.cfg-seg').querySelectorAll('button').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');saveCfg();drawArrows();
}

function setArrowAnim(a,btn){
  CFG.arrowAnim=a;
  btn.closest('.cfg-seg').querySelectorAll('button').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');saveCfg();
}

function setArrowSize(s,btn){
  CFG.arrowSize=s;
  btn.closest('.cfg-seg').querySelectorAll('button').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');saveCfg();drawArrows();
}

function setOrientation(o,btn){
  CFG.orientation=o;
  btn.closest('.cfg-seg').querySelectorAll('button').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');saveCfg();render();
}

function setCardSize(s,btn){
  CFG.cardSize=s;
  btn.closest('.cfg-seg').querySelectorAll('button').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');saveCfg();render();
}

function setSpacing(s,btn){
  CFG.spacing=s;
  btn.closest('.cfg-seg').querySelectorAll('button').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');saveCfg();
  const track=document.getElementById('track');
  if(track)track.style.gap=({tight:'8px',normal:'15px',loose:'28px'})[s]||'15px';
  setTimeout(drawArrows,60);
}

function resetCfg(){
  if(!confirm('Restaurar padrões?'))return;
  CFG={theme:'dark',colorMode:'period',hideDone:false,nextAvail:false,hideOpt:false,periods:[],showCode:true,showHours:true,showGrade:true,planEnrolled:true,arrowVis:'always',arrowStyle:'curve',arrowAnim:'flow',arrowSize:'normal',orientation:'h',cardSize:'normal',spacing:'normal',group:false};
  saveCfg();document.body.classList.remove('theme-light','theme-hc','color-status','color-mono');
  syncCfgUI();render();showEcaToast('Configurações restauradas.');
}

function openCfg(){syncCfgUI();document.getElementById('cfg-overlay')?.classList.add('open');}
function closeCfg(){document.getElementById('cfg-overlay')?.classList.remove('open');}

window.CFG = CFG;
window.loadCfg = loadCfg;
window.saveCfg = saveCfg;
window.applyCfgOnLoad = applyCfgOnLoad;
window.syncCfgUI = syncCfgUI;
window.applyCfg = applyCfg;
window.togglePeriod = togglePeriod;
window.setTheme = setTheme;
window.setColorMode = setColorMode;
window.setArrowVis = setArrowVis;
window.setArrowStyle = setArrowStyle;
window.setArrowAnim = setArrowAnim;
window.setArrowSize = setArrowSize;
window.setOrientation = setOrientation;
window.setCardSize = setCardSize;
window.setSpacing = setSpacing;
window.resetCfg = resetCfg;
window.openCfg = openCfg;
window.closeCfg = closeCfg;
