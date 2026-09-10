/* ═══════════════════════════════════════════════════════════════════════════
   BANCO DE PROVAS — Coastal Navigator Brasil
   Extrai as funções puras do app.html e as executa fora do navegador.
   Autor do harness: análise técnica  |  Data: 07/09/2026
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

/*
 * A partir da v2.2.0 os algoritmos e a base de faróis vivem em módulos
 * separados. As provas continuam medindo o CÓDIGO REAL: o harness concatena
 * app.html com os arquivos extraídos e recorta as funções dali, por contagem
 * de chaves — não há reimplementação em lugar nenhum.
 */
const MODULOS = ['assets/js/lighthouses.js', 'assets/js/coastline.js',
                 'assets/js/nautical.js',
                 'assets/js/report.js', 'assets/js/mirror.js',
                 'assets/js/ship3d.js'];
const SRC = [path.join(ROOT, 'app.html'), ...MODULOS.map(m => path.join(ROOT, m))]
  .map(f => fs.readFileSync(f, 'utf8')).join('\n');
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
  // A indentação mudou ao extrair para módulo: aceita 0 ou 4 espaços.
  const re = new RegExp('const ' + name + ' = \\[[\\s\\S]*?\\n *\\];');
  const m = SRC.match(re);
  if (!m) throw new Error('const não encontrada: ' + name);
  return m[0];
}

function extractLighthouses() {
  const m = SRC.match(/const lighthouses = \[[\s\S]*?\n *\];/);
  if (!m) throw new Error('database de faróis não encontrada');
  return m[0];
}

const FNS = ['calculateDistance','calculateBearing','eyeHeight','calculateVisibility','effectiveRange',
             'findNearestLighthouse','crossTrackError','elapsedFuel','fmtDuration','fmtCoord',
             'offsetLatLng','getCoastline','distanceFromCoast','escapeXml','escapeHtml',
             'safeFileName','distanceToLeg','nearestLegIndex','advanceActiveLeg',
             // Faróis no globo (v2.6.0): a descrição do que se desenha é pura de
             // propósito — esta bancada não alcança o Cesium ion, então o que
             // decide altura do foco, alcance, cor e rótulo é provado FORA dele.
             'corDaLuz','farolEarthSpec'];

const sandboxSrc = extractLighthouses() + '\n' +
  'let _coastline = null;\n' +
  'let tripData = null;\n' +
  'let waypoints = [];\n' +
  'let navActiveLeg = 0;\n' +
  'const ARRIVAL_RADIUS_NM = 0.3;\n' +
  'const DEFAULT_EYE_HEIGHT_M = 5;\n' +
  extractConst('FORA_DA_LINHA_DE_COSTA') + '\n' +
  // A linha de costa é grande (6.054 vértices) mas precisa estar na caixa de
  // areia: sem ela, distanceFromCoast cai no recuo pelos faróis e as provas
  // medem o código antigo achando que medem o novo.
  extractConst('COSTA_BRASIL') + '\n' +
  'const RESYNC_NM = ' + (SRC.match(/const RESYNC_NM = (\\d+)/) || [,'10'])[1] + ';\n' +
  FNS.map(extractFn).join('\n\n') + '\n' +
  'module.exports = { lighthouses, COSTA_BRASIL, DEFAULT_EYE_HEIGHT_M, RESYNC_NM,\n'
  + '  setTrip: t => { tripData = t; },\n'
  + '  setRota: (r, leg) => { waypoints = r; navActiveLeg = leg || 0; },\n'
  + '  getLeg: () => navActiveLeg, '
  + FNS.join(', ') + ' };';

fs.writeFileSync(path.join(__dirname, '_extracted.js'), sandboxSrc);
module.exports = require('./_extracted.js');
module.exports.SRC = SRC;
