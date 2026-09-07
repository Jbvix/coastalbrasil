/* ═══════════════════════════════════════════════════════════════════════════
   BANCO DE PROVAS — Coastal Navigator Brasil
   Extrai as funções puras do app.html e as executa fora do navegador.
   Autor do harness: análise técnica  |  Data: 07/09/2026
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'app.html'), 'utf8');
module.exports = module.exports || {};

/* Extrai o corpo de `function NOME(...) { ... }` por contagem de chaves. */
function extractFn(name) {
  const re = new RegExp('function\\s+' + name + '\\s*\\(');
  const i = SRC.search(re);
  if (i < 0) throw new Error('função não encontrada: ' + name);
  let j = SRC.indexOf('{', i), depth = 0, k = j;
  for (; k < SRC.length; k++) {
    if (SRC[k] === '{') depth++;
    else if (SRC[k] === '}') { depth--; if (depth === 0) { k++; break; } }
  }
  return SRC.slice(i, k);
}

/* Extrai `const NOME = [ ... ];` preservando os comentários internos. */
function extractConst(name) {
  const re = new RegExp('const ' + name + ' = \\[[\\s\\S]*?\\n    \\];');
  const m = SRC.match(re);
  if (!m) throw new Error('const não encontrada: ' + name);
  return m[0];
}

function extractLighthouses() {
  const m = SRC.match(/const lighthouses = \[[\s\S]*?\n    \];/);
  if (!m) throw new Error('database de faróis não encontrada');
  return m[0];
}

const FNS = ['calculateDistance','calculateBearing','eyeHeight','calculateVisibility','effectiveRange',
             'findNearestLighthouse','crossTrackError','elapsedFuel','fmtDuration','fmtCoord',
             'offsetLatLng','getCoastline','distanceFromCoast','escapeXml','escapeHtml',
             'safeFileName'];

const sandboxSrc = extractLighthouses() + '\n' +
  'let _coastline = null;\n' +
  'let tripData = null;\n' +
  'const DEFAULT_EYE_HEIGHT_M = 5;\n' +
  extractConst('FORA_DA_LINHA_DE_COSTA') + '\n' +
  FNS.map(extractFn).join('\n\n') + '\n' +
  'module.exports = { lighthouses, DEFAULT_EYE_HEIGHT_M, setTrip: t => { tripData = t; }, '
  + FNS.join(', ') + ' };';

fs.writeFileSync(path.join(__dirname, '_extracted.js'), sandboxSrc);
module.exports = require('./_extracted.js');
module.exports.SRC = SRC;
