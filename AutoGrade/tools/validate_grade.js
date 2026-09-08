#!/usr/bin/env node
/*
 * validate_grade.js — verifica a integridade de public/js/data.js
 *
 * Uso:  node tools/validate_grade.js
 * Sai com código 1 se encontrar ERROS (não apenas avisos).
 *
 * Checagens:
 *  - ids únicos por grade
 *  - todo id em `pre[]` / `unlocks[]` / `coreq[]` existe na mesma grade
 *  - simetria pre <-> unlocks (aviso)
 *  - period entre 1 e 10
 *  - todo `code` real (≠ '—') aparece no mapa de códigos (CM / CM_2023 / CM_CMP) — aviso
 *  - todo valor dos mapas CM aponta para um id existente
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const dataPath = path.join(__dirname, '..', 'public', 'js', 'data.js');
const src = fs.readFileSync(dataPath, 'utf8');

// data.js usa `window.X = ...` no fim; criamos um sandbox com window.
const sandbox = { window: {}, console };
vm.createContext(sandbox);
try {
  vm.runInContext(src, sandbox, { filename: 'data.js' });
} catch (e) {
  console.error('ERRO ao carregar data.js:', e.message);
  process.exit(1);
}

const { DATA, CM, CM_2023, CM_CMP, OPT_DICT, OPT_CMP } = sandbox.window;
const CODE_MAPS = { '2014': CM, '2023': CM_2023, 'CMP_2018': CM_CMP };
const OPT_MAPS = { '2014': OPT_DICT, '2023': OPT_DICT, 'CMP_2018': OPT_CMP };

let errors = 0;
let warns = 0;
const err = (g, m) => { console.log(`  \x1b[31mERRO\x1b[0m  [${g}] ${m}`); errors++; };
const warn = (g, m) => { console.log(`  \x1b[33maviso\x1b[0m [${g}] ${m}`); warns++; };

for (const grade of Object.keys(DATA)) {
  console.log(`\n── Grade ${grade} (${DATA[grade].length} disciplinas) ──`);
  const subs = DATA[grade];
  const byId = new Map();

  // ids únicos
  for (const s of subs) {
    if (byId.has(s.id)) err(grade, `id duplicado: ${s.id}`);
    byId.set(s.id, s);
    if (!(s.period >= 1 && s.period <= 10)) err(grade, `${s.id}: period inválido (${s.period})`);
  }

  // referências pre / unlocks / coreq
  for (const s of subs) {
    for (const p of (s.pre || []))
      if (!byId.has(p)) err(grade, `${s.id}.pre -> id inexistente: ${p}`);
    for (const u of (s.unlocks || []))
      if (!byId.has(u)) err(grade, `${s.id}.unlocks -> id inexistente: ${u}`);
    for (const c of (s.coreq || []))
      if (!byId.has(c)) err(grade, `${s.id}.coreq -> id inexistente: ${c}`);
  }

  // simetria pre <-> unlocks
  // Disciplinas com muitos pré-requisitos (Estágio, TCC, Tópicos) são "portões"
  // que dependem de quase toda a grade — a assimetria ali é esperada, então
  // só avisamos quando os DOIS lados têm poucas ligações (provável esquecimento).
  const BULK = 12;
  for (const s of subs) {
    if ((s.pre || []).length >= BULK) continue;
    for (const u of (s.unlocks || [])) {
      const t = byId.get(u);
      if (t && (t.pre || []).length < BULK && !(t.pre || []).includes(s.id))
        warn(grade, `${s.id}.unlocks inclui ${u}, mas ${u}.pre não inclui ${s.id}`);
    }
    for (const p of (s.pre || [])) {
      const t = byId.get(p);
      if (t && (t.unlocks || []).length < BULK && !(t.unlocks || []).includes(s.id))
        warn(grade, `${s.id}.pre inclui ${p}, mas ${p}.unlocks não inclui ${s.id}`);
    }
  }

  // códigos vs mapa
  const cmap = CODE_MAPS[grade] || {};
  const omap = OPT_MAPS[grade] || {};
  const mappedIds = new Set(Object.values(cmap));
  for (const s of subs) {
    if (s.code === '—') continue;
    if (!cmap[s.code] && !omap[s.code])
      warn(grade, `${s.id}: code ${s.code} não está em nenhum mapa de códigos`);
  }
  // valores do mapa apontam para id existente
  for (const [code, id] of Object.entries(cmap)) {
    if (id === null) continue;
    if (!byId.has(id)) err(grade, `mapa de códigos: ${code} -> id inexistente: ${id}`);
  }
}

console.log(`\n${'─'.repeat(40)}`);
console.log(`Resultado: ${errors} erro(s), ${warns} aviso(s).`);
process.exit(errors > 0 ? 1 : 0);
