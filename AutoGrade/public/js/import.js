/* ══ import.js — PDF histórico import ══ */

let pendingImport = [];
let importGrade = '2014';

// ── Servidor Python local (pdfplumber — lê qualquer tipo de PDF) ──────────────
// null = não testado ainda | true = ativo | false = offline
let _pyUp = null;

async function checkPyServer(){
  if(_pyUp !== null) return _pyUp;
  try {
    const ctl = new AbortController();
    const tid = setTimeout(() => ctl.abort(), 700);
    const r = await fetch('http://localhost:5001/', {signal: ctl.signal});
    clearTimeout(tid);
    _pyUp = r.ok;
  } catch(_){ _pyUp = false; }
  return _pyUp;
}

function applyGradeFromCurriculo(curriculo){
  if(!curriculo) return;
  if(curriculo === 'EMA_2023') importGrade = '2023';
  else if(curriculo.startsWith('CMP_')) importGrade = 'CMP_2018';
  else importGrade = '2014';
  document.querySelectorAll('.import-grade-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('igbtn-' + importGrade)?.classList.add('active');
}

function setImportGrade(grade, btn){
  importGrade = grade;
  document.querySelectorAll('.import-grade-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  resetImport();
}

function openImport(){
  importGrade = window.G;
  document.querySelectorAll('.import-grade-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('igbtn-' + G)?.classList.add('active');
  document.getElementById('import-overlay')?.classList.add('open');
  resetImport();
}

function closeImport(){
  document.getElementById('import-overlay')?.classList.remove('open');
}

function resetImport(){
  const prog = document.getElementById('import-progress'); if(prog) prog.classList.remove('show');
  const res = document.getElementById('import-results'); if(res) res.innerHTML = '';
  const btn = document.getElementById('import-confirm-btn'); if(btn) btn.classList.remove('show');
  const st = document.getElementById('import-status'); if(st) st.innerHTML = '';
  pendingImport = [];
}

function handleDrop(e){
  e.preventDefault();
  document.getElementById('drop-zone')?.classList.remove('drag-over');
  const f = e.dataTransfer.files[0]; if(f) processFile(f);
}

function handleFileSelect(e){
  const f = e.target.files[0]; if(f) processFile(f);
}

// ── Extração de texto via streams brutos do PDF (sem OCR, sem CDN) ──
// Funciona para PDFs com WinAnsiEncoding / Latin-1 sem mapa ToUnicode
async function tryRawExtract(pdf, statusEl){
  try {
    if(statusEl) statusEl.innerHTML =
      `<span style="color:var(--ecaaccent)">🔎 Lendo estrutura interna do PDF...</span>`;
    const bytes = await pdf.getData();
    const latin1 = new TextDecoder('latin1').decode(bytes);
    let allText = '';

    // Localiza todos os blocos stream...endstream pelo índice de bytes
    let searchFrom = 0;
    while(true){
      const si = latin1.indexOf('stream\n', searchFrom);
      if(si === -1) break;
      const contentStart = si + 7;
      const ei = latin1.indexOf('endstream', contentStart);
      if(ei === -1) break;

      const streamBytes = bytes.slice(contentStart, ei);

      // Tenta descomprimir com DEFLATE (FlateDecode é o mais comum em PDFs)
      try {
        const ds = new DecompressionStream('deflate-raw');
        const dec = await new Response(
          new Blob([streamBytes]).stream().pipeThrough(ds)
        ).text();

        // Extrai texto de operadores PDF: (texto)Tj, (texto)TJ, <hex>Tj, [(...)...]TJ
        const re = /\(([^)\\]*(?:\\.[^)\\]*)*)\)\s*T[jJ]|<([0-9A-Fa-f]{2,})>\s*T[jJ]|\[([^\]]*)\]\s*TJ/g;
        let m;
        while((m = re.exec(dec)) !== null){
          if(m[1] !== undefined){
            // String literal: decodifica escapes PDF
            allText += m[1]
              .replace(/\\n/g, '\n').replace(/\\r/g, '\r')
              .replace(/\\t/g, '\t')
              .replace(/\\\(/g, '(').replace(/\\\)/g, ')')
              .replace(/\\\\/g, '\\')
              .replace(/\\(\d{3})/g, (_,o) => String.fromCharCode(parseInt(o,8)));
          } else if(m[2] !== undefined){
            // Hex string: converte par a par
            for(let i=0;i<m[2].length;i+=2)
              allText += String.fromCharCode(parseInt(m[2].substr(i,2),16));
          } else if(m[3] !== undefined){
            // Array TJ: extrai strings dentro
            const inner = m[3].matchAll(/\(([^)\\]*(?:\\.[^)\\]*)*)\)/g);
            for(const im of inner) allText += im[1];
          }
          allText += ' ';
        }
        allText += '\n';
      } catch(_){ /* stream não é DEFLATE — pula */ }

      searchFrom = ei + 9;
    }

    // Valida: se encontrou pelo menos 1 código de disciplina, retorna o texto
    if(/EST[A-Z]{2,6}\d{3}/.test(allText)){
      console.log('[import] raw-extract OK — linhas:', allText.split('\n').filter(Boolean).length);
      return allText;
    }
  } catch(e){ console.warn('[import] raw-extract falhou:', e); }
  return null; // fallback para OCR
}

// ── OCR fallback via Tesseract.js v2 (usado apenas se raw-extract falhar) ──
async function runOcr(pdf, statusEl){
  const T_CDN  = 'https://unpkg.com/tesseract.js@2.1.1/dist/';
  const C_CDN  = 'https://unpkg.com/tesseract.js-core@2.2.0/tesseract-core.wasm.js';
  const L_CDN  = 'https://tessdata.projectnaptha.com/4.0.0';

  if(!window.Tesseract){
    if(statusEl) statusEl.innerHTML =
      `<span style="color:var(--ecaaccent)">⏳ Baixando OCR (~8 MB, apenas 1ª vez — aguarde)...</span>`;
    await new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = T_CDN + 'tesseract.min.js';
      s.onload  = res;
      s.onerror = () => rej(new Error('Sem internet. Verifique a conexão e tente novamente.'));
      document.head.appendChild(s);
    });
  }

  if(typeof Tesseract === 'undefined' || typeof Tesseract.createWorker !== 'function')
    throw new Error('Tesseract.js não inicializou. Recarregue e tente novamente.');

  const OPTS = {
    workerPath: T_CDN + 'worker.min.js',
    corePath:   C_CDN,
    langPath:   L_CDN,
    logger:     () => {}
  };

  if(statusEl) statusEl.innerHTML =
    `<span style="color:var(--ecaaccent)">⚙️ Inicializando OCR...</span>`;

  // API explícita v2: createWorker (síncrono) → load → loadLanguage → initialize
  const worker = Tesseract.createWorker(OPTS);
  await worker.load();
  await worker.loadLanguage('por');
  await worker.initialize('por');

  let text = '';
  for(let p = 1; p <= pdf.numPages; p++){
    if(statusEl) statusEl.innerHTML =
      `<span style="color:var(--ecaaccent)">🔍 OCR — página ${p} de ${pdf.numPages} (~20 s)...</span>`;
    const page = await pdf.getPage(p);
    const vp = page.getViewport({scale: 2.0});
    const cvs = document.createElement('canvas');
    cvs.width = vp.width; cvs.height = vp.height;
    await page.render({canvasContext: cvs.getContext('2d'), viewport: vp}).promise;
    const {data: {text: pt}} = await worker.recognize(cvs);
    text += pt + '\n';
  }
  await worker.terminate();
  return text;
}

async function processFile(f){
  const prog = document.getElementById('import-progress');
  const statusEl = document.getElementById('import-status');
  if(prog) prog.classList.add('show');
  if(statusEl) statusEl.innerHTML = `<span style="color:var(--ecaaccent)">📄 Lendo PDF...</span>`;
  try {

    // ── Caminho 1: Servidor Python local (pdfplumber — lê qualquer PDF) ────────
    if(await checkPyServer()){
      if(statusEl) statusEl.innerHTML =
        `<span style="color:var(--ecaaccent)">🐍 Extraindo via Python (pdfplumber)...</span>`;
      try {
        const fd = new FormData();
        fd.append('file', f);
        const resp = await fetch('http://localhost:5001/parse', {method:'POST', body:fd});
        const data = await resp.json();
        if(data.ok && data.text){
          applyGradeFromCurriculo(data.curriculo);
          if(statusEl) statusEl.innerHTML =
            `<span style="color:var(--ecaaccent)">🔍 Analisando disciplinas (grade ${importGrade})...</span>`;
          parseHistorico(data.text);
          return; // ← saída rápida: não precisa de pdfjsLib nem OCR
        }
        if(!data.ok) throw new Error(data.error || 'Servidor retornou erro');
      } catch(pyErr){
        console.warn('[import] Python server error:', pyErr);
        // Se o servidor falhou por outro motivo (não timeout), mostra aviso
        if(!(pyErr instanceof TypeError)){
          if(statusEl) statusEl.innerHTML =
            `<span style="color:#fdcb6e">⚠ Servidor Python: ${pyErr.message} — tentando fallback...</span>`;
          await new Promise(r => setTimeout(r, 1200));
        }
        _pyUp = false; // não tenta de novo nesta sessão
      }
    }

    // ── Caminho 2: pdfjsLib (fallback se servidor offline) ─────────────────────
    const arrayBuffer = await f.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({data: arrayBuffer}).promise;
    if(statusEl) statusEl.innerHTML =
      `<span style="color:var(--ecaaccent)">📄 PDF carregado (${pdf.numPages} pág.) — extraindo texto...</span>`;

    let fullText = '';
    let totalRawItems = 0;

    // Tenta extração de texto nativa do PDF
    for(let pageNum = 1; pageNum <= pdf.numPages; pageNum++){
      const page = await pdf.getPage(pageNum);
      const content = await page.getTextContent();
      totalRawItems += content.items.length;
      // Agrupa itens por linha (y ± 5px) e ordena por x dentro de cada linha
      const lineMap = new Map();
      content.items.forEach(item => {
        if(!item.str.trim()) return;
        const y = Math.round(item.transform[5] / 5) * 5;
        if(!lineMap.has(y)) lineMap.set(y, []);
        lineMap.get(y).push({x: item.transform[4], text: item.str});
      });
      [...lineMap.keys()].sort((a,b) => b - a).forEach(y => {
        const sorted = lineMap.get(y).sort((a,b) => a.x - b.x);
        fullText += sorted.map(it => it.text).join(' ') + '\n';
      });
    }

    // PDF sem texto extraível (texto como vetor) → tenta raw-extract, depois OCR
    if(totalRawItems === 0){
      const rawText = await tryRawExtract(pdf, statusEl);
      if(rawText){
        fullText = rawText;
      } else {
        fullText = await runOcr(pdf, statusEl);
      }
    }

    // ── Normalização (PDFs com espaçamento Lyceum + variantes OCR) ──

    // 1. Colapsa curriculum: "E M A _2 0 2 3" | "EMA 2014" | "EMA_2014" → "EMA_2014"
    fullText = fullText.replace(/\bE\s*M\s*A\s*[_\s]\s*(\d)\s*(\d)\s*(\d)\s*(\d)\b/g, 'EMA_$1$2$3$4');
    fullText = fullText.replace(/\bC\s*M\s*P\s*[_\s]\s*(\d)\s*(\d)\s*(\d)\s*(\d)\b/g, 'CMP_$1$2$3$4');

    // 2. Colapsa período espaçado: "2 0 2 2 / 1" → "2022/1"
    fullText = fullText.replace(/(\d)\s+(\d)\s+(\d)\s+(\d)\s*[\/\\]\s*(\d)\b/g, '$1$2$3$4/$5');

    // 3. Colapsa códigos espaçados (formato Lyceum): "E ST BA S0 0 7" → "ESTBAS007"
    fullText = fullText.replace(/E(?:\s+[A-Z0-9]{1,3}){4,14}/g, function(m){
      const c = m.replace(/\s+/g,'').toUpperCase();
      if(/^(EST[A-Z]{2,6}\d{3,}[A-Z0-9]*|EEN\d{2,})$/.test(c)) return c;
      return m;
    });

    // 4. Colapsa status espaçados (Lyceum) e variantes OCR
    fullText = fullText
      .replace(/A\s+prov\b/g,'Aprov')
      .replace(/D\s+is\s*p?\s*e\b/g,'Dispe')
      .replace(/Re\s*p\s+N\b/g,'Rep N')
      .replace(/Re\s*p\s+F\b/g,'Rep F')
      .replace(/M\s*a\s*t\s*r\s*i\s*c\s*u\s*l\s*a\s*d\s*o\b/gi,'Matriculado')
      .replace(/C\s*a\s*n\s*c\s*e\b/g,'Cance')
      .replace(/T\s*r\s*a\s*n\s*c\b/g,'Tranc');

    // 5. Auto-detecta currículo (cobre underscore, espaço ou traço — variantes OCR)
    const curricM = fullText.match(/Curr[íi]culo\s*:?\s*([A-Z]{3,})[_\s-](\d{4})/i);
    if(curricM) applyGradeFromCurriculo((curricM[1] + '_' + curricM[2]).toUpperCase());

    if(statusEl) statusEl.innerHTML =
      `<span style="color:var(--ecaaccent)">🔍 Analisando disciplinas (grade ${importGrade})...</span>`;
    parseHistorico(fullText);
  } catch(err){
    const st = document.getElementById('import-status');
    const msg = err?.message || String(err) || 'Erro desconhecido';
    if(st) st.innerHTML = `<span style="color:#ff6b6b">❌ ${msg}</span>`;
    console.error('[import]', err);
  }
}

function parseHistorico(text){
  const resultsEl = document.getElementById('import-results');
  const statusEl = document.getElementById('import-status');
  if(resultsEl) resultsEl.innerHTML = '';
  pendingImport = [];
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const codeRe = /\b(EST[A-Z]{2,6}\d{3,6}[A-Z0-9]*|ESTECP\d{3}|EEN\d{2,})\b/i;
  const APROV   = ['Aprov','Dispe','Dispensado','Aprovado'];
  const REPROV  = ['Rep N','Rep F','RepN','RepF','Reprovado','Rep. N','Rep. F'];
  const MATRIC  = ['Matriculado'];
  const SKIP_ST = ['Cance','Tranc','Cancelado','Trancado'];
  const matched = new Map();
  const unmatched = [];
  let currentSemester = '';
  const processedLines = new Set();
  const codeMap = importGrade === 'CMP_2018' ? CM_CMP : (importGrade === '2023' ? CM_2023 : CM);

  for(let i = 0; i < lines.length; i++){
    const line = lines[i];
    // Detecta período em qualquer posição (inclui "|" — OCR pode confundir "/" com "|")
    const semM = line.match(/\b(\d{4})\s*[\/\\|]\s*(\d)\b/);
    if(semM) currentSemester = semM[1] + '/' + semM[2];
    const codeMatch = line.match(codeRe); if(!codeMatch) continue;
    const code = codeMatch[1].toUpperCase();
    if(processedLines.has(code + currentSemester)) continue;
    let windowLines = [line];
    let foundStatus = [...APROV,...REPROV,...MATRIC,...SKIP_ST].some(s => line.includes(s));
    if(!foundStatus){
      for(let j = i+1; j < lines.length && j < i+60; j++){
        if(lines[j].match(codeRe)) break;
        windowLines.push(lines[j]);
        if([...APROV,...REPROV,...MATRIC,...SKIP_ST].some(s => lines[j].includes(s))){foundStatus = true; break;}
      }
    }
    if(!foundStatus) continue;
    const windowN = windowLines.join(' ');
    if(SKIP_ST.some(s => windowN.includes(s))) continue;
    let status = '';
    if(APROV.some(s => windowN.includes(s))) status = 'done';
    else if(REPROV.some(s => windowN.includes(s))) status = 'failed';
    else if(MATRIC.some(s => windowN.includes(s))) status = 'enrolled';
    if(!status) continue;
    processedLines.add(code + currentSemester);
    let grade = '';
    const gradeRe = /\b(\d{1,2}[.,]\d{1,2})\s*(?:Aprov|Rep|Dispe)/i;
    const gm = windowN.match(gradeRe); if(gm) grade = gm[1].replace(',','.');
    const semester = currentSemester;
    let subId = codeMap.hasOwnProperty(code) ? codeMap[code] : undefined;
    let realName = undefined, realCode = undefined;
    if(subId === undefined){const found = DATA[importGrade].find(s => s.code === code); if(found) subId = found.id;}
    const optCatalog = importGrade === 'CMP_2018' ? OPT_CMP : OPT_DICT;
    const optEntry = optCatalog[code];
    if(subId === undefined && optEntry){
      realCode = code; realName = optEntry.name || optEntry;
      const optSuffix = importGrade === 'CMP_2018' ? '_cp' : (importGrade === '2014' ? '_14' : '_23');
      for(let k = 1; k <= 10; k++){
        const testId = `opt${k}${optSuffix}`;
        if(getSub(testId).realCode === code){subId = testId; break;}
      }
      if(!subId){
        for(let k = 1; k <= 10; k++){
          const testId = `opt${k}${optSuffix}`;
          const isSlotFree = getSub(testId).status === 'pending' && !getSub(testId).realCode;
          const notInImport = ![...matched.values()].some(m => m.subId === testId);
          if(isSlotFree && notInImport){subId = testId; break;}
        }
      }
    }
    if(subId && subId !== null){
      const existing = matched.get(subId);
      const priority = {done:3,enrolled:2,failed:1};
      const np = priority[status] || 0, ep = existing ? priority[existing.status] || 0 : 0;
      if(!existing || np > ep) matched.set(subId, {subId, code: realCode || code, realName, status, grade, semester});
    } else if(subId !== null){
      if(!unmatched.find(u => u.code === code)) unmatched.push({code, status, grade});
    }
  }

  if(resultsEl){
    matched.forEach(({subId, code, status, grade, realName}) => {
      const name = realName || DATA[importGrade].find(s => s.id === subId)?.name || subId;
      const icon = status === 'done' ? '✓' : status === 'enrolled' ? '▶' : '↺';
      const cls = status === 'failed' ? 'unmatched' : 'matched';
      resultsEl.innerHTML += `<div class="iri ${cls}">${icon} <strong>${code}</strong> <span class="sub-name">${name}</span>${grade ? ` <span style="color:var(--muted);margin-left:auto">${grade}</span>` : ''}</div>`;
    });
    if(unmatched.length > 0){
      resultsEl.innerHTML += `<div style="margin-top:9px;padding:7px 9px;border-radius:6px;background:rgba(255,255,255,.02);border:1px solid rgba(255,255,255,.07);"><div style="font-size:.6rem;color:#7a82a0;font-weight:700;text-transform:uppercase;letter-spacing:.1em;margin-bottom:4px">Fora da grade ${importGrade}</div>`;
      unmatched.forEach(({code, grade}) => {
        resultsEl.innerHTML += `<div class="iri unmatched" style="background:transparent;margin-bottom:2px;opacity:.7">⚠ <strong>${code}</strong>${grade ? ` <span style="margin-left:auto">${grade}</span>` : ''}</div>`;
      });
      resultsEl.innerHTML += `</div>`;
    }
  }

  pendingImport = [...matched.values()];
  const total = pendingImport.length;
  if(total > 0){
    if(statusEl) statusEl.innerHTML = `<span style="color:#26de81">✓ ${total} matéria(s) identificada(s) na grade ${importGrade}</span>${unmatched.length > 0 ? ` <span style="color:#7a82a0;font-size:.7rem">+ ${unmatched.length} externa(s)</span>` : ''}`;
    const btn = document.getElementById('import-confirm-btn'); if(btn) btn.classList.add('show');
  } else {
    const foundCodes = [...text.matchAll(/\b(EST[A-Z]{2,6}\d{3,})\b/gi)].map(m => m[1]).slice(0,5);
    if(statusEl) statusEl.innerHTML = `<span style="color:#fdcb6e">⚠ Nenhuma matéria da grade ${importGrade} identificada.</span><br><small style="opacity:.6">Códigos: ${foundCodes.join(', ') || 'nenhum'}</small>`;
  }
}

function confirmImport(){
  pendingImport.forEach(({subId, status, grade, semester, code, realName}) => {
    const upd = {status, grade: grade || '', semester: semester || ''};
    if(realName){upd.realCode = code; upd.realName = realName;}
    setSub(subId, upd);
  });
  if(importGrade !== window.G){
    window.G = importGrade;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    const targetBtn = [...document.querySelectorAll('.tab-btn')].find(b => (b.getAttribute('onclick')||'').includes(importGrade));
    if(targetBtn) targetBtn.classList.add('active');
  }
  render(); closeImport();
  showEcaToast(`✓ ${pendingImport.length} matérias importadas na grade ${importGrade}!`, 'ok');
  if(typeof updateSmartBadge === 'function') updateSmartBadge();
}

function exportToPNG(){
  const trackElement = document.getElementById('track'); if(!trackElement) return;
  showEcaToast('📸 Gerando imagem...', 'ok');
  const bgColor = '#0d0f14';
  const currentPct = document.getElementById('s-pct')?.textContent || '0%';
  const currentDone = document.getElementById('s-done')?.textContent || '0';
  const currentTotal = DATA[window.G].length;
  html2canvas(trackElement, {scale:3, backgroundColor:bgColor, useCORS:true, logging:false, windowWidth:trackElement.scrollWidth, windowHeight:trackElement.scrollHeight}).then(originalCanvas => {
    const headerH = 100;
    const finalCanvas = document.createElement('canvas');
    finalCanvas.width = Math.max(originalCanvas.width, 1600);
    finalCanvas.height = originalCanvas.height + headerH;
    const ctx = finalCanvas.getContext('2d');
    ctx.fillStyle = bgColor; ctx.fillRect(0, 0, finalCanvas.width, finalCanvas.height);
    const grad = ctx.createLinearGradient(0, 0, finalCanvas.width, 0);
    grad.addColorStop(0,'transparent'); grad.addColorStop(0.3,'#4f8ef7');
    grad.addColorStop(0.7,'#4f8ef7'); grad.addColorStop(1,'transparent');
    ctx.fillStyle = grad; ctx.fillRect(0, headerH-2, finalCanvas.width, 2);
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    const pad = 40;
    ctx.fillStyle = '#e8eaf0'; ctx.font = `bold 38px Arial,sans-serif`;
    const gradeLabel = G === 'CMP_2018' ? 'Computação 2018' : `ECA — Grade ${G}`;
    ctx.fillText(gradeLabel, pad, headerH/2 - 15);
    ctx.fillStyle = '#4f8ef7'; ctx.font = `600 24px Arial,sans-serif`;
    ctx.fillText(`Progresso: ${currentPct} · ${currentDone} de ${currentTotal} matérias`, pad, headerH/2 + 18);
    const xOffset = Math.max(0, (finalCanvas.width - originalCanvas.width) / 2);
    ctx.drawImage(originalCanvas, xOffset, headerH);
    const link = document.createElement('a');
    link.download = `Matriz_ECA_${G}.png`;
    link.href = finalCanvas.toDataURL('image/png', 1.0);
    link.click(); showEcaToast('✅ PNG exportado!', 'ok');
  }).catch(() => showEcaToast('❌ Erro ao exportar.', ''));
}

function clearAll(){
  if(!confirm('Remover todas as marcações?')) return;
  localStorage.removeItem(window.SK || 'eca_data_v2');
  if(typeof ecaSave === 'function') ecaSave({});
  render(); showEcaToast('Histórico limpo.');
}

window.pendingImport = pendingImport;
window.importGrade = importGrade;
window.setImportGrade = setImportGrade;
window.openImport = openImport;
window.closeImport = closeImport;
window.resetImport = resetImport;
window.handleDrop = handleDrop;
window.handleFileSelect = handleFileSelect;
window.processFile = processFile;
window.parseHistorico = parseHistorico;
window.confirmImport = confirmImport;
window.exportToPNG = exportToPNG;
window.clearAll = clearAll;
