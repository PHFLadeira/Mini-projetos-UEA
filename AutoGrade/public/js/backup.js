/* ══ backup.js — exportar / importar todo o progresso local (JSON) ══ */

// Chaves do localStorage que compõem o "estado do usuário".
var BACKUP_KEYS = [
  'eca_data_v2',  // histórico / status das matérias (ECA + Comp)
  'eca_cfg_v1',   // preferências de exibição
  'gf_d',         // GradeFlow: disciplinas carregadas dos PDFs
  'gf_s',         // GradeFlow: disciplinas selecionadas
  'gf_p',         // GradeFlow: prioridades
  'gf_c'          // GradeFlow: mapa de cores
];

function _pad(n){ return n < 10 ? '0' + n : '' + n; }

function exportProgress() {
  var payload = { app: 'autograde', version: 1, exportedAt: new Date().toISOString(), keys: {} };
  var found = 0;
  BACKUP_KEYS.forEach(function(k) {
    var v = null;
    try { v = localStorage.getItem(k); } catch(e) {}
    if(v !== null) { payload.keys[k] = v; found++; }
  });
  try { payload.grade = window.G || localStorage.getItem('eca_grade') || '2014'; } catch(e) {}

  var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  var d = new Date();
  var name = 'autograde-backup-' + d.getFullYear() + '-' + _pad(d.getMonth()+1) + '-' + _pad(d.getDate()) + '.json';
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(function(){ URL.revokeObjectURL(a.href); }, 2000);

  var msg = found > 0
    ? '💾 Backup exportado (' + found + ' seção(ões)) — ' + name
    : '⚠ Nada salvo ainda para exportar.';
  if(typeof showEcaToast === 'function') showEcaToast(msg, found > 0 ? 'ok' : '');
}

function _applyBackup(payload) {
  if(!payload || payload.app !== 'autograde' || typeof payload.keys !== 'object')
    throw new Error('Arquivo não parece um backup do AutoGrade.');

  var restored = 0;
  Object.keys(payload.keys).forEach(function(k) {
    if(BACKUP_KEYS.indexOf(k) === -1) return;         // ignora chaves desconhecidas
    var val = payload.keys[k];
    if(typeof val !== 'string') return;
    try { JSON.parse(val); } catch(e) { return; }      // só aceita JSON válido
    try { localStorage.setItem(k, val); restored++; } catch(e) {}
  });
  if(payload.grade) { try { localStorage.setItem('eca_grade', payload.grade); } catch(e) {} }
  return restored;
}

function importProgressFile(file) {
  if(!file) return;
  var reader = new FileReader();
  reader.onload = function() {
    var payload;
    try { payload = JSON.parse(reader.result); }
    catch(e) {
      if(typeof showEcaToast === 'function') showEcaToast('❌ JSON inválido.', '');
      return;
    }
    var counts = {};
    Object.keys(payload.keys || {}).forEach(function(k){
      if(BACKUP_KEYS.indexOf(k) !== -1) counts[k] = true;
    });
    var n = Object.keys(counts).length;
    if(!confirm('Restaurar este backup? Isso substitui seus dados atuais ('
        + n + ' seção(ões) no arquivo' + (payload.exportedAt ? ', de ' + payload.exportedAt.slice(0,10) : '') + ').')) return;
    try {
      var restored = _applyBackup(payload);
      if(typeof showEcaToast === 'function') showEcaToast('✓ ' + restored + ' seção(ões) restaurada(s). Recarregando...', 'ok');
      setTimeout(function(){ location.reload(); }, 900);
    } catch(e) {
      if(typeof showEcaToast === 'function') showEcaToast('❌ ' + e.message, '');
    }
  };
  reader.readAsText(file);
}

function openBackup(){ document.getElementById('backup-overlay')?.classList.add('open'); }
function closeBackup(){ document.getElementById('backup-overlay')?.classList.remove('open'); }
function pickBackupFile(){ document.getElementById('backup-file-input')?.click(); }

window.exportProgress = exportProgress;
window.importProgressFile = importProgressFile;
window.openBackup = openBackup;
window.closeBackup = closeBackup;
window.pickBackupFile = pickBackupFile;
