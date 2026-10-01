/* ═══════════════════════════════════════════════════════════════════════════
   SUÍTE DE TESTES — Coastal Navigator Brasil v2.0.9
   Executa as funções reais extraídas de app.html.
   ═══════════════════════════════════════════════════════════════════════════ */
const path = require('path');
const ROOT = path.join(__dirname, '..');
const A = require('./harness.js');
const { calculateDistance, calculateBearing, calculateVisibility, effectiveRange,
        crossTrackError, elapsedFuel, fmtDuration, fmtCoord, offsetLatLng,
        distanceFromCoast, lighthouses, setTrip, SRC } = A;

let results = [];
function t(suite, id, desc, fn) {
  let status = 'PASS', detail = '';
  try {
    const r = fn();
    /* PROVA ASSÍNCRONA PASSARIA SEMPRE.                            (v2.16.0)
       Este arranjo é síncrono: ele chama fn() e OLHA O RETORNO. Uma prova
       declarada `async` devolve uma Promise — que não é `{warn}` nem
       `{detail}`, e cujo `throw` acontece depois, longe do try. Resultado:
       verde garantido, falhe o que falhar. É a pior espécie de defeito num
       banco de provas, porque mente para o lado de "está tudo bem".
       Descoberto ao tentar provar aqui o handler do proxy, que é assíncrono.
       A saída não é aceitar Promise — é recusá-la e mandar a prova para onde
       o assíncrono tem casa: a fumaça. */
    if (r && typeof r.then === 'function') {
      /* Neutraliza a Promise ANTES de reprovar. Se ela rejeitar sozinha, o
         Node derruba o processo por rejeição não tratada — e o relatório
         inteiro morre com ele. Já aconteceu ao escrever a prova 27.9: a
         falha era marcada corretamente e ninguém chegava a ler, porque o
         processo caía antes de imprimir. Reprovar sem relatório é quase tão
         inútil quanto aprovar sem verificar. */
      try { r.catch(() => {}); } catch (ignorado) { /* thenable sem catch */ }
      throw new Error('prova assíncrona: este banco é síncrono e daria verde sem verificar nada. ' +
                      'Prove a DECISÃO aqui (pura) e o EFEITO na fumaça.');
    }
    if (r && r.warn) { status = 'WARN'; detail = r.warn; } else if (r && r.detail) detail = r.detail;
  }
  catch (e) { status = 'FAIL'; detail = e.message; }
  results.push({ suite, id, desc, status, detail });
}
/* eq() É NUMÉRICA — e calava sobre texto.                            (v2.16.0)
   `Math.abs('abc' - 'xyz')` é NaN, e `NaN > tol` é FALSO. Logo, qualquer
   eq() comparando textos passava SEMPRE, quaisquer que fossem eles. Uma
   mutação do Sprint A (trocar o primeiro pelo último x-forwarded-for, que é
   o forjável) sobreviveu exatamente por isso.
   Varrido o banco inteiro após o endurecimento: uma única prova usava eq()
   sobre texto — a recém-escrita. A armadilha existia e ninguém a tinha
   pisado. Fica fechada antes que alguém pise. */
function eq(a, b, tol, msg) {
  if (!Number.isFinite(Number(a)) || !Number.isFinite(Number(b))) {
    throw new Error(`${msg || ''} eq() é NUMÉRICO: comparar "${a}" com "${b}" dá NaN e NaN>tol é falso — passaria sempre. Use ok(a === b, …).`);
  }
  if (Math.abs(a - b) > tol) throw new Error(`${msg || ''} esperado ${b} ±${tol}, obtido ${a}`);
}
function ok(cond, msg) { if (!cond) throw new Error(msg); }

/*
VARREDURA DE CÓDIGO LÊ CÓDIGO — os comentários saem antes.

Quatro vezes nesta suíte um comentário respondeu por código e a prova ficou
verde ou vermelha por motivo errado:

  · 19.11 casava a lista IARA_IMPERATIVOS_PROIBIDOS, que contém "reduza";
  · 19.14 tropeçava no comentário que cita initMap() antes da chamada real;
  · 20.15 idem, com a nota sobre o temporizador;
  · 21.15 sobreviveu a trocar Promise.allSettled por Promise.all porque a
    palavra "allSettled" continuava no comentário acima.

O quarto foi a gota. Toda prova que afirma algo sobre o CÓDIGO passa a
recortar o texto por aqui. Comentário é documentação: ele explica o código,
não responde por ele.
*/
/* O netlify.toml comenta com '#', que o removedor de JS não conhece. Foi a
   QUINTA ocorrência da mesma armadilha — e aconteceu no mesmo dia em que o
   removedor foi criado, porque eu escrevi um comentário citando "connect-src"
   logo acima da diretiva connect-src. A lição é sobre a FORMA da varredura,
   não sobre um regex em particular. */
function semComentariosToml(txt) {
  return String(txt || '').replace(/^\s*#.*$/gm, ' ');
}

/* HTML comenta com <!-- -->, que nem o removedor de JS nem o de '#' conhecem.
   Foi a SEXTA ocorrência da mesma armadilha, e de novo no mesmo dia em que o
   removedor nasceu: ao reescrever a janela da vitrine, escrevi um comentário
   HTML explicando que ela ANTES se chamava "Solicitar Acesso" — exatamente a
   frase que a prova 16.10 exige que não exista mais. Sem recortar, a prova
   leria a minha prosa e ficaria vermelha por motivo errado.                 */
function semComentariosHtml(txt) {
  return String(txt || '').replace(/<!--[\s\S]*?-->/g, ' ');
}

function semComentarios(txt) {
  return String(txt || '')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1 ');
}

/* Referência independente: Vincenty inverso (elipsoide WGS-84) */
function vincentyNM(lat1, lon1, lat2, lon2) {
  const a = 6378137, f = 1 / 298.257223563, b = (1 - f) * a;
  const L = (lon2 - lon1) * Math.PI / 180;
  const U1 = Math.atan((1 - f) * Math.tan(lat1 * Math.PI / 180));
  const U2 = Math.atan((1 - f) * Math.tan(lat2 * Math.PI / 180));
  const sU1 = Math.sin(U1), cU1 = Math.cos(U1), sU2 = Math.sin(U2), cU2 = Math.cos(U2);
  let lam = L, lamP, i = 0, sinSig, cosSig, sig, sinAlpha, cos2Alpha, cos2SigM, C;
  do {
    const sl = Math.sin(lam), cl = Math.cos(lam);
    sinSig = Math.sqrt((cU2 * sl) ** 2 + (cU1 * sU2 - sU1 * cU2 * cl) ** 2);
    if (sinSig === 0) return 0;
    cosSig = sU1 * sU2 + cU1 * cU2 * cl;
    sig = Math.atan2(sinSig, cosSig);
    sinAlpha = cU1 * cU2 * sl / sinSig;
    cos2Alpha = 1 - sinAlpha ** 2;
    cos2SigM = cos2Alpha !== 0 ? cosSig - 2 * sU1 * sU2 / cos2Alpha : 0;
    C = f / 16 * cos2Alpha * (4 + f * (4 - 3 * cos2Alpha));
    lamP = lam;
    lam = L + (1 - C) * f * sinAlpha * (sig + C * sinSig * (cos2SigM + C * cosSig * (-1 + 2 * cos2SigM ** 2)));
  } while (Math.abs(lam - lamP) > 1e-12 && ++i < 200);
  const u2 = cos2Alpha * (a * a - b * b) / (b * b);
  const Aa = 1 + u2 / 16384 * (4096 + u2 * (-768 + u2 * (320 - 175 * u2)));
  const B = u2 / 1024 * (256 + u2 * (-128 + u2 * (74 - 47 * u2)));
  const dSig = B * sinSig * (cos2SigM + B / 4 * (cosSig * (-1 + 2 * cos2SigM ** 2) -
    B / 6 * cos2SigM * (-3 + 4 * sinSig ** 2) * (-3 + 4 * cos2SigM ** 2)));
  return b * Aa * (sig - dSig) / 1852;
}

/* ── SUÍTE 1 — GEODÉSIA ─────────────────────────────────────────────────── */
const S1 = '1 · Geodésia';
t(S1, '1.1', 'Distância ponto→mesmo ponto = 0 NM', () => eq(calculateDistance(-3.7, -38.5, -3.7, -38.5), 0, 1e-9));
t(S1, '1.2', '1° de latitude = 60 NM (definição da milha náutica)', () => {
  const d = calculateDistance(-10, -40, -11, -40); eq(d, 60, 0.1, '1° lat:'); return { detail: d.toFixed(4) + ' NM' };
});
t(S1, '1.3', '1° de longitude no equador ≈ 60 NM', () => {
  const d = calculateDistance(0, -40, 0, -41); eq(d, 60, 0.1); return { detail: d.toFixed(4) + ' NM' };
});
t(S1, '1.4', '1° de longitude a 60°S ≈ 30 NM (cos 60° = 0,5)', () => {
  const d = calculateDistance(-60, -40, -60, -41); eq(d, 30, 0.1); return { detail: d.toFixed(4) + ' NM' };
});
t(S1, '1.5', 'Erro vs. Vincenty/WGS-84 ≤ 0,5% (afirmado no docstring)', () => {
  const casos = [[-3.7263,-38.4717,-5.1608,-35.4868],[-23.0,-43.2,-24.05,-46.26],
                 [-0.2568,-48.4032,-33.7463,-53.3768],[-12.9568,-38.3537,-22.8838,-42.0188]];
  let pior = 0, qual = '';
  casos.forEach(c => {
    const h = calculateDistance(...c), v = vincentyNM(...c);
    const err = Math.abs(h - v) / v * 100;
    if (err > pior) { pior = err; qual = `${h.toFixed(1)} vs ${v.toFixed(1)} NM`; }
  });
  ok(pior <= 0.5, `erro máx ${pior.toFixed(3)}% (${qual}) excede 0,5%`);
  return { detail: `erro máx ${pior.toFixed(3)}% (${qual})` };
});
t(S1, '1.6', 'Rumo cardinal exato: N/S no meridiano, E/W no equador', () => {
  eq(calculateBearing(-10,-40,-9,-40), 0, 0.001, 'N:');
  eq(calculateBearing(-10,-40,-11,-40), 180, 0.001, 'S:');
  eq(calculateBearing(0,-40,0,-39), 90, 0.001, 'E:');
  eq(calculateBearing(0,-40,0,-41), 270, 0.001, 'W:');
});
t(S1, '1.9', 'Rumo é ORTODRÔMICO (inicial), não loxodrômico — comportamento correto', () => {
  const sul = calculateBearing(-10,-40,-10,-39);   // hemisfério S: parte a sul de 090
  const norte = calculateBearing(10,-40,10,-39);   // hemisfério N: espelhado
  ok(sul > 90 && norte < 90 && Math.abs((sul-90)+(norte-90)) < 1e-6,
     `assimetria inesperada: S=${sul.toFixed(4)} N=${norte.toFixed(4)}`);
  return { detail: `rumo inicial ${sul.toFixed(3)}° a 10°S (a derrota abaula para o polo) — correto para grande círculo` };
});
t(S1, '1.7', 'Rumo sempre normalizado em [0,360)', () => {
  for (let i = 0; i < 360; i += 7) {
    const p = offsetLatLng(-10, -40, i, 5);
    const b = calculateBearing(-10, -40, p.lat, p.lng);
    ok(b >= 0 && b < 360, `rumo fora de faixa: ${b}`);
  }
});
t(S1, '1.8', 'Distância é simétrica (A→B = B→A)', () => {
  eq(calculateDistance(-3.7,-38.5,-23,-43.2), calculateDistance(-23,-43.2,-3.7,-38.5), 1e-9);
});

/* ── SUÍTE 2 — VISIBILIDADE DE FARÓIS ───────────────────────────────────── */
const S2 = '2 · Visibilidade';
t(S2, '2.1', 'Fórmula d = 2,08·(√h1 + √h2) com olho padrão de 5 m', () => {
  setTrip(null);
  eq(calculateVisibility(40), 2.08 * (Math.sqrt(40) + Math.sqrt(5)), 1e-9);
  return { detail: '40 m + olho 5 m = ' + calculateVisibility(40).toFixed(2) + ' NM' };
});
t(S2, '2.2', 'Exemplos numéricos do docstring conferem com o código', () => {
  setTrip(null);
  const a = calculateVisibility(87);            // Farol de Natal, olho 5 m
  const b = calculateVisibility(87, 20);        // passadiço de navio
  ok(Math.abs(a - 24.1) < 0.1 && Math.abs(b - 28.7) < 0.1,
     `docstring diz 24,1 e 28,7 NM; código devolve ${a.toFixed(1)} e ${b.toFixed(1)}`);
  return { detail: `${a.toFixed(1)} NM (olho 5 m) · ${b.toFixed(1)} NM (olho 20 m)` };
});
t(S2, '2.3', 'Monotonicidade: mais alto ⇒ enxerga mais longe', () => {
  setTrip(null);
  for (let h = 1; h < 330; h += 3) ok(calculateVisibility(h + 3) > calculateVisibility(h), 'quebra em h=' + h);
});
t(S2, '2.4', 'Altitude 0 m = horizonte do próprio observador ≈ 4,65 NM', () => {
  setTrip(null);
  const v = calculateVisibility(0); eq(v, 4.65, 0.02); return { detail: v.toFixed(2) + ' NM' };
});
t(S2, '2.5', 'Altura do olho é parametrizável pelo tripData', () => {
  setTrip({ eyeHeight: 20 });
  const alto = calculateVisibility(87);
  setTrip({ eyeHeight: 2 });
  const baixo = calculateVisibility(87);
  setTrip(null);
  ok(alto > baixo + 3, `passadiço de 20 m (${alto.toFixed(1)} NM) deveria superar lancha de 2 m (${baixo.toFixed(1)} NM)`);
  return { detail: `navio ${alto.toFixed(1)} NM · lancha ${baixo.toFixed(1)} NM · padrão ${calculateVisibility(87).toFixed(1)} NM` };
});
t(S2, '2.6', 'Critério de visibilidade é o MESMO no plano e na navegação', () => {
  const noPlano = /waypoint\.lighthouseVisible = nearest\.distance <= effectiveRange\(/.test(SRC);
  const naNav   = /const range = effectiveRange\(lh\);/.test(SRC);
  ok(noPlano && naNav, 'planejamento e navegação devem chamar a mesma effectiveRange()');
});
t(S2, '2.7', 'Alcance efetivo nunca excede o alcance geográfico', () => {
  setTrip(null);
  const mau = lighthouses.filter(l => effectiveRange(l) > calculateVisibility(l.altitude) + 1e-9);
  ok(mau.length === 0, mau.map(l => l.name).join(', '));
});

/* ── SUÍTE 3 — QUALIDADE DA BASE DE FARÓIS ──────────────────────────────── */
const S3 = '3 · Base de faróis';
const OFICIAIS = lighthouses.filter(l => l.lfId);
const FORA_LF  = lighthouses.filter(l => !l.lfId);

t(S3, '3.1', 'Contagem confere com a documentação', () => {
  const n = lighthouses.length;
  const readme = require('fs').readFileSync(ROOT + '/README.md', 'utf8');
  const m = readme.match(/(\d+)\s+faróis/i);
  ok(m && Number(m[1]) === n, `código tem ${n} faróis; README anuncia ${m ? m[1] : '(nenhum número)'}`);
});
t(S3, '3.2', 'Identificadores únicos (a máquina de alertas indexa por id)', () => {
  const c = {}; lighthouses.forEach(l => c[l.id] = (c[l.id] || 0) + 1);
  const dup = Object.entries(c).filter(([, v]) => v > 1);
  ok(dup.length === 0, 'ids repetidos: ' + dup.map(([k, v]) => `${k} (${v}×)`).join(', '));
});
t(S3, '3.3', 'Nomes repetidos têm ids distintos (dois "Farol de Conceição")', () => {
  const porNome = {};
  lighthouses.forEach(l => (porNome[l.name] = porNome[l.name] || []).push(l.id));
  const maus = Object.entries(porNome).filter(([, ids]) => ids.length > 1 && new Set(ids).size !== ids.length);
  ok(maus.length === 0, JSON.stringify(maus));
  const rep = Object.entries(porNome).filter(([, ids]) => ids.length > 1);
  return { detail: rep.length ? rep.map(([n, i]) => `${n} → ${i.join(' / ')}`).join(' · ') : 'nenhum nome repetido' };
});
t(S3, '3.4', 'Altitudes dentro da faixa física (5 a 350 m)', () => {
  const bad = lighthouses.filter(l => !(l.altitude >= 5 && l.altitude <= 350));
  ok(bad.length === 0, bad.map(l => `${l.name}=${l.altitude}m`).join(' | '));
  const a = lighthouses.map(l => l.altitude).sort((x, y) => x - y);
  return { detail: `${a[0]}..${a[a.length - 1]} m · mediana ${a[Math.floor(a.length / 2)]} m` };
});
t(S3, '3.5', 'Altitudes acima de 200 m vêm da fonte oficial', () => {
  const bad = lighthouses.filter(l => l.altitude > 200 && !l.lfId);
  ok(bad.length === 0, bad.map(l => `${l.name}=${l.altitude}m sem nº de LF`).join(' | '));
  const altos = lighthouses.filter(l => l.altitude > 200);
  return { detail: altos.map(l => `${l.name} ${l.altitude} m (LF nº ${l.lfId})`).join(' · ') || 'nenhum' };
});
t(S3, '3.6', 'Coordenadas dentro da área de interesse do Brasil', () => {
  const bad = lighthouses.filter(l => l.lat > 6 || l.lat < -35 || l.lng > -25 || l.lng < -55);
  ok(bad.length === 0, 'fora da caixa: ' + bad.map(l => l.name).join(', '));
});
t(S3, '3.7', 'Esquema completo e tipado em todos os registros', () => {
  const bad = lighthouses.filter(l =>
    typeof l.id !== 'string' || typeof l.name !== 'string' ||
    !isFinite(l.lat) || !isFinite(l.lng) || !isFinite(l.altitude) ||
    !isFinite(l.rangeLum) || typeof l.character !== 'string' ||
    (l.rangeGeo !== null && !isFinite(l.rangeGeo)) ||
    (l.structHeight !== null && !isFinite(l.structHeight)));
  ok(bad.length === 0, `${bad.length} registros malformados: ` + bad.map(l => l.name).join(', '));
});
t(S3, '3.8', 'Sem faróis coincidentes (< 0,1 NM entre si)', () => {
  const pares = [];
  for (let i = 0; i < lighthouses.length; i++) for (let j = i + 1; j < lighthouses.length; j++) {
    const d = calculateDistance(lighthouses[i].lat, lighthouses[i].lng, lighthouses[j].lat, lighthouses[j].lng);
    if (d < 0.1) pares.push(`${lighthouses[i].name} ↔ ${lighthouses[j].name} (${d.toFixed(2)}NM)`);
  }
  ok(pares.length === 0, pares.join(' | '));
});
t(S3, '3.9', 'Registros fora da LF-40ED estão explicitamente marcados', () => {
  ok(FORA_LF.length <= 4, `${FORA_LF.length} registros sem nº de LF — revisar`);
  return { warn: FORA_LF.length
    ? `${FORA_LF.length} sem respaldo na LF-40ED: ` + FORA_LF.map(l => l.name.replace('Farol ', '')).join(', ')
    : undefined };
});
t(S3, '3.10', 'Cobertura da fonte oficial ≥ 95%', () => {
  const pct = OFICIAIS.length / lighthouses.length * 100;
  ok(pct >= 95, `apenas ${pct.toFixed(1)}% com nº da Lista de Faróis`);
  return { detail: `${OFICIAIS.length}/${lighthouses.length} (${pct.toFixed(1)}%) rastreáveis à LF-40ED` };
});

/* ── SUÍTE 4 — CROSS-TRACK ERROR ────────────────────────────────────────── */
const S4 = '4 · XTE / derrota';
const legA = { lat: -3.7, lng: -38.5 }, legB = { lat: -3.7, lng: -37.5 };
t(S4, '4.1', 'Sobre a derrota ⇒ XTE ≈ 0', () => {
  const p = { lat: -3.7, lng: -38.0 };
  eq(Math.abs(crossTrackError(p.lat,p.lng,legA,legB).xte), 0, 0.01);
});
t(S4, '4.2', 'Sinal correto: ao norte de um rumo 090 ⇒ bombordo (negativo)', () => {
  const ct = crossTrackError(-3.6, -38.0, legA, legB);
  ok(ct.xte < 0, `esperado negativo (BB), obtido ${ct.xte.toFixed(3)}`);
  return { detail: ct.xte.toFixed(3) + ' NM' };
});
t(S4, '4.3', 'Magnitude: 1 NM perpendicular ⇒ |XTE| ≈ 1 NM', () => {
  const p = offsetLatLng(-3.7, -38.0, 180, 1); // 1 NM ao sul
  const ct = crossTrackError(p.lat, p.lng, legA, legB);
  eq(Math.abs(ct.xte), 1, 0.02); return { detail: Math.abs(ct.xte).toFixed(3) + ' NM' };
});
t(S4, '4.4', 'Along-track deve ser NEGATIVO quando o barco está a ré do WP inicial', () => {
  const p = offsetLatLng(legA.lat, legA.lng, 270, 5); // 5 NM antes do início
  const ct = crossTrackError(p.lat, p.lng, legA, legB);
  ok(ct.along < 0, `along = ${ct.along.toFixed(2)} NM (deveria ser ≈ −5); acos() só devolve 0..π, o sinal é perdido`);
});
t(S4, '4.5', 'Along-track no meio da perna ≈ metade do comprimento', () => {
  const legLen = calculateDistance(legA.lat,legA.lng,legB.lat,legB.lng);
  const ct = crossTrackError(-3.7, -38.0, legA, legB);
  eq(ct.along, legLen/2, 0.05); return { detail: `${ct.along.toFixed(2)} / ${legLen.toFixed(2)} NM` };
});


/* Derrota que FAZ CURVA — é o que expõe a escolha de perna. A saída de São
   Luís aponta para o NORTE e a derrota depois desce para sudeste, então o
   rumo do barco para as primeiras pernas passa de 90° de diferença. */
const ROTA_CURVA = [
  { name:'WP01', lat:-2.53, lng:-44.30 }, { name:'WP02', lat:-2.20, lng:-44.25 },
  { name:'WP03', lat:-2.30, lng:-42.70 }, { name:'WP04', lat:-2.70, lng:-41.00 },
  { name:'WP05', lat:-3.00, lng:-39.00 }, { name:'WP06', lat:-3.60, lng:-38.30 },
  { name:'WP07', lat:-4.30, lng:-37.30 }, { name:'WP08', lat:-4.90, lng:-36.20 },
  { name:'WP09', lat:-5.10, lng:-35.20 }, { name:'WP10', lat:-6.00, lng:-34.70 },
  { name:'WP11', lat:-8.39, lng:-34.96 },
];
const meioDaPerna = i => ({
  lat: (ROTA_CURVA[i].lat + ROTA_CURVA[i+1].lat) / 2,
  lng: (ROTA_CURVA[i].lng + ROTA_CURVA[i+1].lng) / 2 });

t(S4, '4.6', 'Iniciar a navegação no MEIO da derrota ancora na perna certa', () => {
  // REGRESSÃO REAL: com o along-track ganhando sinal, o laço de avanço parava
  // na primeira perna e o XTE era medido contra ela — 531 NM de erro lateral
  // num barco que estava exatamente sobre a derrota.
  const b = meioDaPerna(7);
  A.setRota(ROTA_CURVA, 0);
  A.advanceActiveLeg(b.lat, b.lng);
  const leg = A.getLeg();
  ok(leg === 7, `perna ativa ${leg}, esperado 7 (WP08→WP09)`);
  const ct = crossTrackError(b.lat, b.lng, ROTA_CURVA[leg], ROTA_CURVA[leg+1]);
  ok(Math.abs(ct.xte) < 0.1, `XTE ${Math.abs(ct.xte).toFixed(2)} NM sobre a própria derrota`);
  return { detail: `perna ${leg} · XTE ${Math.abs(ct.xte).toFixed(3)} NM` };
});
t(S4, '4.7', 'XTE nunca fica da ordem da distância ao próximo waypoint', () => {
  // O sintoma que o comandante viu: XTE 281,18 NM e "próximo WP" a 281,57 NM.
  // Dois números quase iguais denunciam perna ativa errada.
  let pior = 0, ondePior = -1;
  for (let i = 0; i < ROTA_CURVA.length - 1; i++) {
    const b = meioDaPerna(i);
    A.setRota(ROTA_CURVA, 0);
    A.advanceActiveLeg(b.lat, b.lng);
    const leg = A.getLeg();
    const xte = Math.abs(crossTrackError(b.lat, b.lng, ROTA_CURVA[leg], ROTA_CURVA[leg+1]).xte);
    if (xte > pior) { pior = xte; ondePior = i; }
  }
  ok(pior < 1, `pior XTE ${pior.toFixed(2)} NM na perna ${ondePior}, com o barco sobre a derrota`);
  return { detail: `pior caso ${pior.toFixed(3)} NM em ${ROTA_CURVA.length - 1} pernas` };
});
t(S4, '4.8', 'Progressão normal avança perna a perna', () => {
  A.setRota(ROTA_CURVA, 0);
  const vistas = [];
  for (let i = 0; i < ROTA_CURVA.length - 1; i++) {
    const b = meioDaPerna(i);
    A.advanceActiveLeg(b.lat, b.lng);
    vistas.push(A.getLeg());
  }
  const esperado = ROTA_CURVA.map((_, i) => i).slice(0, ROTA_CURVA.length - 1);
  ok(vistas.join(',') === esperado.join(','), `sequência ${vistas.join(',')}`);
  return { detail: 'pernas ' + vistas.join(' → ') };
});
t(S4, '4.9', 'Desvio legítimo NÃO reancora a perna', () => {
  // 5 NM ao largo, dentro da perna 4: é desvio de rota, não perna errada.
  const b = meioDaPerna(4);
  const brgLeg = calculateBearing(ROTA_CURVA[4].lat, ROTA_CURVA[4].lng,
                                  ROTA_CURVA[5].lat, ROTA_CURVA[5].lng);
  const fora = offsetLatLng(b.lat, b.lng, brgLeg + 90, 5);
  A.setRota(ROTA_CURVA, 4);
  A.advanceActiveLeg(fora.lat, fora.lng);
  ok(A.getLeg() === 4, `reancorou para ${A.getLeg()} num desvio de 5 NM`);
  const ct = crossTrackError(fora.lat, fora.lng, ROTA_CURVA[4], ROTA_CURVA[5]);
  return { detail: `perna mantida · XTE ${Math.abs(ct.xte).toFixed(1)} NM (desvio real)` };
});
t(S4, '4.10', 'Guarda de sanidade tem folga sobre desvio operacional', () => {
  ok(A.RESYNC_NM >= 5 && A.RESYNC_NM <= 30,
     `limiar de reancoragem em ${A.RESYNC_NM} NM — fora da faixa plausível`);
  return { detail: `reancora acima de ${A.RESYNC_NM} NM, e só se houver perna 2× mais perto` };
});
t(S4, '4.11', 'distanceToLeg trava a projeção nas pontas do segmento', () => {
  const a = ROTA_CURVA[4], b = ROTA_CURVA[5];
  // muito antes do início: vale a distância até o waypoint inicial
  const antes = offsetLatLng(a.lat, a.lng,
    (calculateBearing(a.lat, a.lng, b.lat, b.lng) + 180) % 360, 50);
  const d = A.distanceToLeg(antes.lat, antes.lng, a, b);
  eq(d, calculateDistance(antes.lat, antes.lng, a.lat, a.lng), 0.01);
  return { detail: `${d.toFixed(1)} NM = distância ao WP inicial, não à reta infinita` };
});

/* ── SUÍTE 5 — COMBUSTÍVEL / ETA ────────────────────────────────────────── */
const S5 = '5 · Combustível/ETA';
const td = (o={}) => Object.assign({ departureDate: new Date('2026-09-07T12:00:00Z'),
  speedKnots: 10, fuelConsumption: 100, fuelInitial: 5000, fuelAlreadyUsed: 0 }, o);

/* Réplica fiel da cadeia de cálculo de createWaypoint() */
function chain(pts, trip) {
  const wps = [];
  pts.forEach((p) => {
    const w = { lat:p[0], lng:p[1], distance:0, totalDistance:0, eta:null, timeFromPrevious:0,
                fuelUsed:0, fuelRemaining:trip.fuelInitial };
    if (wps.length > 0) {
      const prev = wps[wps.length-1];
      w.distance = calculateDistance(prev.lat, prev.lng, w.lat, w.lng);
      w.totalDistance = prev.totalDistance + w.distance;
      w.timeFromPrevious = w.distance / trip.speedKnots;
      w.eta = new Date(prev.eta.getTime() + w.timeFromPrevious*3600000);
      w.fuelUsed = prev.fuelUsed + w.timeFromPrevious*trip.fuelConsumption;
      w.fuelRemaining = trip.fuelInitial - w.fuelUsed;
      if (w.fuelRemaining < 0) return; // aborta como no app
    } else {
      w.eta = trip.departureDate; w.fuelUsed = trip.fuelAlreadyUsed || 0;
      w.fuelRemaining = trip.fuelInitial - w.fuelUsed;
    }
    wps.push(w);
  });
  return wps;
}
t(S5, '5.1', 'Consumo acumulado = tempo × taxa (10 kt, 100 L/h, 60 NM ⇒ 600 L)', () => {
  const w = chain([[-3.7,-38.5],[-4.7,-38.5]], td());
  eq(w[1].totalDistance, 60, 0.1, 'dist:'); eq(w[1].fuelUsed, 600, 1, 'consumo:');
  return { detail: `${w[1].totalDistance.toFixed(1)} NM / ${w[1].fuelUsed.toFixed(0)} L` };
});
t(S5, '5.2', 'ETA acumula corretamente ao longo de 3 waypoints', () => {
  const trip = td(); const w = chain([[-3.7,-38.5],[-4.7,-38.5],[-5.7,-38.5]], trip);
  const horas = (w[2].eta - trip.departureDate)/3600000;
  eq(horas, w[2].totalDistance/trip.speedKnots, 1e-6);
  return { detail: horas.toFixed(2) + ' h' };
});
t(S5, '5.3', 'elapsedFuel: partida no futuro ⇒ 0 L', () => {
  eq(elapsedFuel(td({departureDate:new Date(Date.now()+86400000)}), Date.now()), 0, 1e-9);
});
t(S5, '5.4', 'elapsedFuel: nunca excede a capacidade do tanque', () => {
  const v = elapsedFuel(td({departureDate:new Date(Date.now()-1000*3600000)}), Date.now());
  eq(v, 5000, 1e-6); return { detail: v.toFixed(0) + ' L (tanque cheio)' };
});
t(S5, '5.5', 'Combustível insuficiente aborta a inclusão do waypoint', () => {
  const w = chain([[-3.7,-38.5],[-13.7,-38.5]], td({fuelInitial:1000})); // 600 NM ⇒ 6000 L
  ok(w.length === 1, `esperado 1 waypoint aceito, obtido ${w.length}`);
});
t(S5, '5.6', 'Percentual de saldo permanece em [0,100] no plano nominal', () => {
  const trip = td(); const w = chain([[-3.7,-38.5],[-4.7,-38.5]], trip);
  const pct = w[1].fuelRemaining/trip.fuelInitial*100; ok(pct>=0 && pct<=100, 'pct='+pct);
});
/* Réplica de deleteWaypoint(): recalcula só se index > 0 */
function deleteWp(wps, index, trip) {
  wps.splice(index,1);
  if (wps.length > 0) {
    if (index === 0) {
      const p = wps[0];
      p.distance = 0; p.totalDistance = 0; p.timeFromPrevious = 0;
      p.eta = trip.departureDate;
      p.fuelUsed = trip.fuelAlreadyUsed || 0;
      p.fuelRemaining = trip.fuelInitial - p.fuelUsed;
    }
    for (let i=Math.max(index,1);i<wps.length;i++){
      const p=wps[i-1], w=wps[i];
      w.distance=calculateDistance(p.lat,p.lng,w.lat,w.lng);
      w.totalDistance=p.totalDistance+w.distance;
      w.timeFromPrevious=w.distance/trip.speedKnots;
      w.eta=new Date(p.eta.getTime()+w.timeFromPrevious*3600000);
      w.fuelUsed=p.fuelUsed+w.timeFromPrevious*trip.fuelConsumption;
      w.fuelRemaining=trip.fuelInitial-w.fuelUsed;
    }
  }
  return wps;
}
t(S5, '5.7', 'Apagar o PRIMEIRO waypoint deve rebasear a rota (dist/ETA/consumo)', () => {
  const trip = td(); let w = chain([[-3.7,-38.5],[-4.7,-38.5],[-5.7,-38.5]], trip);
  w = deleteWp(w, 0, trip);
  ok(w[0].distance === 0 && w[0].totalDistance === 0 && w[0].fuelUsed === (trip.fuelAlreadyUsed||0),
     `novo WP inicial ficou com distance=${w[0].distance.toFixed(1)} NM, ` +
     `totalDistance=${w[0].totalDistance.toFixed(1)} NM e fuelUsed=${w[0].fuelUsed.toFixed(0)} L herdados do waypoint apagado`);
});
t(S5, '5.8', 'Apagar um waypoint do MEIO rebaseia corretamente', () => {
  const trip = td(); let w = chain([[-3.7,-38.5],[-4.7,-38.5],[-5.7,-38.5]], trip);
  w = deleteWp(w, 1, trip);
  eq(w[1].totalDistance, 120, 0.2); return { detail: w[1].totalDistance.toFixed(1)+' NM' };
});

/* ── SUÍTE 6 — GPX ──────────────────────────────────────────────────────── */
const S6 = '6 · GPX';
function buildGPX(wps, trip) { // réplica de exportGPX(): <wpt> + <rte>/<rtept>
  let g = '<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Coastal Navigator Brasil v2.1">\n';
  g += `  <metadata>\n    <name>${trip.vesselName} - ${trip.origin} para ${trip.destination}</name>\n  </metadata>\n`;
  wps.forEach((w,i) => { g += `  <wpt lat="${w.lat}" lon="${w.lng}">\n    <name>WP${String(i+1).padStart(3,'0')}</name>\n  </wpt>\n`; });
  if (wps.length >= 2) {
    g += '  <rte>\n';
    wps.forEach((w,i) => { g += `    <rtept lat="${w.lat}" lon="${w.lng}">\n      <name>WP${String(i+1).padStart(3,'0')}</name>\n    </rtept>\n`; });
    g += '  </rte>\n';
  }
  g += '</gpx>';
  return g;
}
function countImported(gpx) { // réplica de importGPX(): PRECEDÊNCIA, não soma
  const n = tag => (gpx.match(new RegExp('<'+tag+'\\s','g'))||[]).length;
  const rte = n('rtept'), wpt = n('wpt'), trk = n('trkpt');
  return rte || wpt || trk;   // rtept > wpt > trkpt
}
t(S6, '6.1', 'Ida-e-volta GPX: exportar 3 WP e reimportar deve devolver 3 WP', () => {
  const trip = Object.assign(td(), {vesselName:'RT ATLANTICO', origin:'Fortaleza', destination:'Natal'});
  const w = chain([[-3.7,-38.5],[-4.7,-38.5],[-5.7,-38.5]], trip);
  const g = buildGPX(w, trip); const n = countImported(g);
  ok(n === 3, `reimportação gera ${n} waypoints (wpt + trkpt somados) — rota duplicada em zigue-zague`);
});
t(S6, '6.2', 'Nome da embarcação com "&" produz GPX bem-formado', () => {
  const esc = A.escapeXml || (x => x);
  const g = buildGPX(chain([[-3.7,-38.5],[-4.7,-38.5]], td()), 
    Object.assign(td(), {vesselName: esc('SMIT & CIA'), origin: esc('Santos'), destination: esc('Rio')}));
  const solto = g.replace(/&(amp|lt|gt|quot|apos|#\d+);/g,'').includes('&');
  ok(!solto, 'ampersand não escapado no XML → arquivo rejeitado por Navionics/OpenCPN/Garmin');
});
t(S6, '6.3', 'Nome da embarcação com "<" produz GPX bem-formado', () => {
  const esc = A.escapeXml || (x => x);
  const g = buildGPX(chain([[-3.7,-38.5],[-4.7,-38.5]], td()),
    Object.assign(td(), {vesselName: esc('RB <TESTE>'), origin: esc('A'), destination: esc('B')}));
  const dentro = /<name>[^<]*<[^\/]/.test(g.split('<metadata>')[1]||'');
  ok(!dentro, 'caractere "<" cru dentro de <name> quebra o XML');
});
t(S6, '6.4', 'Nomes dos pontos do GPX importado são preservados', () => {
  ok(/function createWaypoint\(lat, lng, nomeOriginal, opts\)/.test(SRC) &&
     /createWaypoint\(lat, lng, nome, \{ deferUI: true, silent: true \}\)/.test(SRC),
     'createWaypoint precisa receber o nome lido do GPX');
});
t(S6, '6.5', 'Importação tem teto de pontos e cria em lote', () => {
  ok(/const MAX_GPX_POINTS = \d+;/.test(SRC), 'sem teto de pontos importados');
  ok(/refreshWaypointUI\(\);/.test(SRC) && /deferUI: true/.test(SRC),
     'a interface deve ser redesenhada uma vez ao final, não a cada ponto');
  const m = SRC.match(/const MAX_GPX_POINTS = (\d+);/);
  return { detail: 'teto de ' + (m ? m[1] : '?') + ' pontos, com redesenho único' };
});
t(S6, '6.6', 'Exportação usa <rte> (rota planejada), não <trk> (trilha gravada)', () => {
  // Mede o que é EMITIDO (gpx += ...), não o que os comentários mencionam.
  const emitido = (SRC.match(/gpx \+= [^\n]*/g) || []).join('\n');
  ok(/<rte>/.test(emitido), 'a rota planejada deve sair como <rte>');
  ok(!/<trkseg>|<trkpt/.test(emitido),
     '<trk> descreve caminho já percorrido; repetir nele os mesmos pontos do <wpt> duplicava a rota na reimportação');
});

/* ── SUÍTE 7 — FORMATAÇÃO ───────────────────────────────────────────────── */
const S7 = '7 · Formatação';
t(S7, '7.1', 'fmtCoord segue o padrão náutico documentado (03°43.6\'S)', () => {
  const r = fmtCoord(-3.7263, 'lat');
  ok(r === "03°43.6'S", `obtido "${r}" — grau sem zero à esquerda, divergindo do próprio docstring`);
});
t(S7, '7.2', 'fmtCoord: hemisfério correto nos quatro quadrantes', () => {
  ok(fmtCoord(4.431,'lat').endsWith('N') && fmtCoord(-3.7,'lat').endsWith('S') &&
     fmtCoord(-38.4,'lng').endsWith('W') && fmtCoord(10,'lng').endsWith('E'), 'hemisfério errado');
});
t(S7, '7.3', 'fmtDuration formata horas e minutos', () => {
  ok(fmtDuration(2.5)==='2h30m' && fmtDuration(0.25)==='15m', fmtDuration(2.5)+' / '+fmtDuration(0.25));
});
t(S7, '7.4', 'fmtCoord arredonda 59,96\' sem gerar 60,0\'', () => {
  const r = fmtCoord(-3.99934, 'lat');
  ok(!r.includes("60.0'"), `obtido "${r}" — deveria virar 04°00.0'S`);
});

/* ── SUÍTE 8 — DATA/HORA ────────────────────────────────────────────────── */
const S8 = '8 · Data/hora';
t(S8, '8.1', 'Data padrão do modal de viagem é hora LOCAL, não UTC', () => {
  // Verifica a COMPENSAÇÃO, não a ausência de toISOString: o método continua
  // sendo usado, mas agora sobre um instante já deslocado para a hora local.
  const bloco = SRC.slice(SRC.indexOf('function openTripModal'),
                          SRC.indexOf('function closeTripModal'));
  ok(/getTimezoneOffset\(\)\s*\*\s*60000/.test(bloco),
     'sem compensação de fuso: em UTC−3 a partida sugerida nasce 3 h adiantada, ' +
     'contaminando ETA, blocos de 12 h e o consumo de viagem em andamento');

  // E confere o comportamento: o valor produzido tem de bater com a hora local.
  const agora = new Date();
  const local = new Date(agora.getTime() - agora.getTimezoneOffset() * 60000);
  const produzido = local.toISOString().slice(0, 16);
  const esperado = `${agora.getFullYear()}-${String(agora.getMonth()+1).padStart(2,'0')}-` +
                   `${String(agora.getDate()).padStart(2,'0')}T${String(agora.getHours()).padStart(2,'0')}:` +
                   `${String(agora.getMinutes()).padStart(2,'0')}`;
  ok(produzido === esperado, `produzido ${produzido}, hora local ${esperado}`);
  return { detail: `${produzido} (fuso local do navegador, offset ${-agora.getTimezoneOffset()/60}h)` };
});
t(S8, '8.2', 'ETA é sempre posterior à partida em rota válida', () => {
  const trip = td(); const w = chain([[-3.7,-38.5],[-4.7,-38.5]], trip);
  ok(w[1].eta > trip.departureDate, 'ETA anterior à partida');
});

/* ── SUÍTE 9 — SEGURANÇA (ANÁLISE ESTÁTICA) ─────────────────────────────── */
const S9 = '9 · Segurança';
t(S9, '9.1', 'Telemetria remota não vira HTML sem escape', () => {
  const cru = /getElementById\('navLighthouse'\)\.innerHTML\s*=\s*h\./.test(SRC);
  const remonta = /function renderLighthouseCard/.test(SRC) &&
                  /renderLighthouseCard\(h\.lighthouse\)/.test(SRC);
  ok(!cru && remonta,
     'o card de farol do observador deve ser remontado de campos tipados, com escape, ' +
     'e nunca receber marcação vinda do canal Realtime');
});
t(S9, '9.2', 'Nenhuma chave service_role exposta no cliente', () => {
  ok(!/service_role|eyJ[A-Za-z0-9_-]{20,}\.eyJ/.test(SRC), 'chave privilegiada no bundle');
});
t(S9, '9.3', 'Nenhuma credencial em texto claro no repositório', () => {
  const fs9 = require('fs');
  const alvos = ['assets/js/admin.js', 'assets/js/gatekeeper.js', 'admin.html', 'index.html'];
  const maus = alvos.filter(f => /pass\s*===\s*['"][^'"]+['"]|password\s*===\s*['"]/.test(
    fs9.readFileSync(ROOT + '/' + f, 'utf8')));
  ok(maus.length === 0, 'comparação com senha literal em: ' + maus.join(', '));
});
t(S9, '9.4', 'O portão administrativo é conferido no servidor, não no navegador', () => {
  /* ═══════════════════════════════════════════════════════════════════════
     AVISO ENCERRADO NA v2.19.0 — E A PROVA ESTAVA VERDE PELO MOTIVO ERRADO.

     Durante dez versões esta prova exigiu que `admin.js` contivesse
     `ADMIN_GATE_HASH` e `SHA-256`, e devolvia um WARN admitindo que isso é
     trinco e não fechadura: o hash viajava para o navegador, e quem tem o
     hash e a página tem tempo infinito para quebrá-lo offline. Pior: a
     ausência da variável ABRIA o painel, com um aviso na tela. Ambiente mal
     configurado virava porta escancarada — o modo de falhar era para o lado
     errado, que é o pior defeito que um portão pode ter.

     A etapa C3 moveu a conferência para /.netlify/functions/licenca, onde
     scrypt compara contra ADMIN_SENHA_HASH, variável que nunca é publicada.
     Sem configuração, agora o portão NEGA.

     ⚠️ E AQUI A LIÇÃO DE BANCADA, a sétima vez que esta casa tropeça nela:
     quando o código foi removido, esta prova CONTINUOU VERDE. Ela lia o
     arquivo CRU, e o comentário que explica a remoção contém as duas
     palavras que ela procurava. A prova estava casando com a explicação do
     conserto, não com o conserto. Varredura de código lê CÓDIGO — por isso
     o `semComentarios` abaixo não é zelo, é a diferença entre provar e
     fingir que provou.
     ═══════════════════════════════════════════════════════════════════════ */
  const adm = semComentarios(require('fs').readFileSync(ROOT + '/assets/js/admin.js', 'utf8'));

  /* O navegador não conhece o segredo, nem em forma de hash. */
  ok(!/ADMIN_GATE_HASH/.test(adm),
     'o painel voltou a ler o hash publicado — segredo no navegador é segredo perdido');

  /* Nem o navegador calcula hash nenhum: se ele calculasse, o veredito
     seria dele, e um veredito do cliente é um veredito do atacante. */
  ok(!/subtle|digest|sha-?256/i.test(adm),
     'o painel voltou a decidir no cliente — quem calcula o veredito manda nele');

  /* A senha vai para o servidor, que é onde existe segredo de verdade. */
  ok(/functions\/licenca/.test(adm),
     'o painel não fala com o servidor — então não há conferência de verdade');

  /* E não fica guardada: memória morre com a aba, localStorage não. */
  ok(!/localStorage|sessionStorage/.test(adm),
     'a frase-senha ficou guardada no navegador — sobrevive à aba e ao dono');

  /* Do outro lado, a fechadura precisa ser cara de testar. scrypt a 16384
     custa ~50 ms por tentativa; SHA-256 cru custa bilhões por segundo. É a
     diferença entre uma amarra e um cabo de varal. */
  const srv = semComentarios(require('fs').readFileSync(ROOT + '/netlify/lib/admin.mjs', 'utf8'));
  ok(/scrypt/.test(srv), 'o servidor não usa scrypt — a derivação ficou barata de atacar');
});
t(S9, '9.5', 'A vitrine não finge autenticar — nem com ressalva', () => {
  /* ═══════════════════════════════════════════════════════════════════════
     ESTA PROVA MUDOU DE EXIGÊNCIA, E PARA MAIS SEVERA.             (v2.17.0)

     Antes ela aceitava o portão de mentira DESDE QUE ele declarasse a
     própria limitação em comentário. Era o possível na época: o código
     fingia validar, e ao menos avisava que fingia.

     O caminho C tornou isso desnecessário e a ressalva, insuficiente: a
     carta fica aberta, não há portão na vitrine, e o que não existe não
     precisa de aviso. A exigência passa a ser a ausência do mecanismo, não
     a honestidade do rótulo — porque um comentário honesto não impedia o
     `innerHTML` que vinha junto do portão de executar script da URL.

     Lição que vale além deste arquivo: declarar uma limitação é melhor que
     escondê-la, mas é pior que remover o código que a cria.
     ═══════════════════════════════════════════════════════════════════════ */
  const gk = semComentarios(require('fs').readFileSync(ROOT + '/assets/js/gatekeeper.js', 'utf8'));

  /* Nenhum mecanismo de validação, nem de mentira: sem leitura de token, sem
     lista de usados, sem veredito sobre quem entra.

     A primeira versão desta prova proibia a palavra "token" e acusou o
     próprio código correto: ele APAGA o parâmetro antigo da barra de
     endereço, que é o oposto de validá-lo. Proibir a palavra confundia ler
     com limpar. A exigência certa é mais fina — toda menção a token precisa
     estar dentro de um `has` ou um `delete`, nunca de um `get`: saber que o
     parâmetro existe, para apagá-lo, não deixa conteúdo nenhum entrar. */
  const mencoes = (gk.match(/token/gi) || []).length;
  const seguras = (gk.match(/searchParams\.(has|delete)\('token'\)/g) || []).length;
  ok(mencoes === seguras,
     `a vitrine menciona token ${mencoes}x e só ${seguras} são has/delete — ` +
     'ela pode apagar o parâmetro antigo, nunca lê-lo');
  ok(!/valid/i.test(gk), 'a vitrine voltou a validar alguma coisa');
  ok(!/localStorage|sessionStorage/.test(gk), 'voltou a guardar estado de acesso no navegador do visitante');
  ok(!/Autorizado|Negado|credencial/i.test(gk), 'a vitrine voltou a emitir veredito de acesso');

  /* E o aplicativo continua sendo alcançado por navegação simples, não por
     liberação: se isto virar uma função que "concede", o portão voltou. */
  ok(/APP_URL/.test(gk), 'a vitrine não sabe mais onde fica o aplicativo');
  ok(!/grant|conceder|liberar/i.test(gk), 'alguma função voltou a "conceder" acesso');
});
t(S9, '9.6', 'Scripts de CDN com Subresource Integrity e versão fixada', () => {
  const tags = SRC.match(/<script[^>]*src="https:\/\/[^"]+"[^>]*>/g) || [];
  const semSri = tags.filter(x => !/integrity="sha\d{3}-/.test(x));
  ok(semSri.length === 0, `${semSri.length} sem integrity: ` +
     semSri.map(x => (x.match(/src="([^"]+)"/) || [])[1]).join(' | '));
  const flutuante = tags.filter(x => /@\d+"|@latest|@next/.test(x));
  ok(flutuante.length === 0, 'versão flutuante é incompatível com SRI: ' + flutuante.join(' | '));
  return { detail: `${tags.length} scripts de CDN, todos lacrados e pinados` };
});
t(S9, '9.7', 'Content-Security-Policy declarada no deploy', () => {
  const nt = require('fs').readFileSync(ROOT + '/netlify.toml', 'utf8');
  ok(/Content-Security-Policy/.test(nt), 'sem CSP no netlify.toml');
  ['default-src', 'object-src', 'frame-ancestors', 'base-uri', 'connect-src'].forEach(d =>
    ok(nt.includes(d), 'diretiva ausente: ' + d));
  return { warn: "script-src ainda admite 'unsafe-inline' (atributos onclick=) e " +
                 "'unsafe-eval' (WebAssembly do Cesium); reduzir depende da modularização" };
});
t(S9, '9.8', 'Token de compartilhamento com entropia adequada (≥ 48 bits)', () => {
  ok(/new Uint8Array\(6\)/.test(SRC), 'esperado 6 bytes de crypto.getRandomValues');
  return { detail: '48 bits via crypto.getRandomValues — adequado' };
});
t(S9, '9.9', 'Relatório HTML escapa os dados digitados pelo usuário', () => {
  ['vesselName', 'origin', 'destination'].forEach(c =>
    ok(!new RegExp('\\$\\{tripData\\.' + c + '\\}').test(SRC),
       `tripData.${c} interpolado cru no HTML do relatório`));
});
t(S9, '9.10', 'GPX exportado escapa entidades XML', () => {
  ok(/function escapeXml/.test(SRC) && /escapeXml\(tripData\.vesselName\)/.test(SRC),
     'nome com "&" produz XML mal-formado, recusado por Navionics/OpenCPN/Garmin');
});
t(S9, '9.11', 'Nome de arquivo baixado é saneado', () => {
  ok(/function safeFileName/.test(SRC) && !/vesselName\.replace\(\/\\s\//.test(SRC),
     'o nome da embarcação ia direto para o atributo download');
});

/* ── SUÍTE 10 — DISTÂNCIA DA COSTA ──────────────────────────────────────── */
const S10 = '10 · Distância da costa';
/*
Até a v2.4.2 a "linha de costa" era a LISTA DE FARÓIS ordenada por latitude: 88
pontos ligados em sequência. Aferida contra a costa em resolução plena, errava
13,4 NM em média e 105 NM no pior caso só no litoral continental — uma reta
entre dois faróis corta baías inteiras. Estas provas medem a linha de verdade.
*/
const COSTA = A.COSTA_BRASIL;
const VERT = COSTA.reduce((n, t) => n + t.length, 0);

t(S10, '10.1', 'A linha de costa tem resolução de carta, não de esboço', () => {
  ok(Array.isArray(COSTA) && COSTA.length > 1, 'COSTA_BRASIL ausente ou vazia');
  ok(VERT > 3000, `${VERT} vértices — poucos para representar o litoral brasileiro`);
  // Do Oiapoque ao Chuí: se faltar ponta, algum trecho do litoral ficou de fora.
  const lats = COSTA.flat().map(p => p[0]);
  ok(Math.max(...lats) > 4, `litoral começa em ${Math.max(...lats).toFixed(1)}° — falta o Amapá`);
  ok(Math.min(...lats) < -33, `litoral termina em ${Math.min(...lats).toFixed(1)}° — falta o Rio Grande do Sul`);
  return { detail: `${COSTA.length} traços · ${VERT.toLocaleString('pt-BR')} vértices · ` +
                   `${Math.max(...lats).toFixed(1)}° a ${Math.min(...lats).toFixed(1)}°` };
});

t(S10, '10.2', 'Todo farol cai sobre a linha de costa', () => {
  /*
  A aferição mais forte que existe com os dados do próprio repositório: um farol
  está em terra, então a distância dele à linha de costa tem de ser ~0. É esta
  prova que denuncia trecho de litoral faltando — foi ela que mostrou que o
  Natural Earth não traz Rocas (81 NM), Abrolhos (30) nem Alcatrazes (18).
  */
  const ds = lighthouses.map(l => ({ nome: l.name, d: distanceFromCoast(l.lat, l.lng) }))
                        .sort((a, b) => b.d - a.d);
  const v = ds.map(x => x.d).sort((a, b) => a - b);
  const mediana = v[v.length >> 1], pior = v[v.length - 1];
  ok(pior < 3, `farol a ${pior.toFixed(1)} NM da costa: ${ds[0].nome} — falta litoral ali`);
  ok(mediana < 0.5, `mediana de ${mediana.toFixed(2)} NM — a linha não acompanha o litoral`);
  ok(v.filter(x => x < 1).length >= v.length * 0.85,
     `só ${v.filter(x => x < 1).length} de ${v.length} faróis a menos de 1 NM da costa`);
  return { detail: `mediana ${mediana.toFixed(2)} NM · pior ${pior.toFixed(2)} NM (${ds[0].nome})` };
});

t(S10, '10.3', 'Ilhas são traços PRÓPRIOS, não emendadas ao continente', () => {
  /*
  A implementação anterior excluía as ilhas de propósito: um farol de ilha
  inserido numa poligonal ordenada por latitude fazia a linha SALTAR para o mar
  entre dois pontos do continente, e a distância saía menor que a real.

  Com geometria de verdade o problema desaparece — cada ilha é um traço fechado
  próprio. E entram por segurança: passando 3 NM ao largo de Abrolhos, dizer ao
  comandante que a terra mais próxima está a 180 NM é pior que não dizer nada.
  */
  const noronha = lighthouses.find(l => l.id === 'fernando-de-noronha');
  const dN = distanceFromCoast(noronha.lat, noronha.lng);
  ok(dN < 3, `Fernando de Noronha a ${dN.toFixed(1)} NM da costa — a ilha não está na linha`);
  // 5 NM ao largo de Noronha: a terra mais próxima é a PRÓPRIA ilha, não o
  // continente a 190 NM. Se esta prova falhar, o número mente sobre onde a
  // terra está — que é o defeito mais perigoso possível neste campo.
  const p = offsetLatLng(noronha.lat, noronha.lng, 45, 5);
  const d5 = distanceFromCoast(p.lat, p.lng);
  ok(d5 < 12, `a 5 NM de Noronha o app diz ${d5.toFixed(0)} NM — está medindo até o continente`);
  return { detail: `sobre Noronha ${dN.toFixed(2)} NM · 5 NM ao largo ${d5.toFixed(1)} NM` };
});

t(S10, '10.4', 'Afastar-se da costa aumenta a distância, sem degrau', () => {
  // Ao largo de Santa Marta o litoral corre reto: bom trecho para conferir
  // monotonicidade sem baía nenhuma atrapalhando.
  const base = { lat: -28.6053, lng: -48.8156 };
  let ant = -1;
  const lidas = [];
  for (const nm of [2, 5, 10, 20, 40]) {
    const p = offsetLatLng(base.lat, base.lng, 90, nm);   // rumo leste, mar aberto
    const d = distanceFromCoast(p.lat, p.lng);
    lidas.push(`${nm}→${d.toFixed(1)}`);
    ok(d > ant, `a ${nm} NM ao largo leu ${d.toFixed(1)} NM, menos que no ponto anterior`);
    ok(Math.abs(d - nm) < nm * 0.5 + 2,
       `a ${nm} NM ao largo leu ${d.toFixed(1)} NM — desvio grande demais para litoral reto`);
    ant = d;
  }
  return { detail: lidas.join(' · ') + ' NM' };
});

t(S10, '10.5', 'A consulta é rápida o bastante para o HUD', () => {
  // 6.218 vértices por chamada seriam caros sem a poda por caixa envolvente.
  // O popup da embarcação chama isto a cada atualização de posição.
  const t0 = Date.now();
  for (let i = 0; i < 300; i++) distanceFromCoast(-5 - (i % 25), -35 - (i % 10));
  const ms = (Date.now() - t0) / 300;
  ok(ms < 3, `${ms.toFixed(2)} ms por consulta — lento para o painel de navegação`);
  return { detail: ms.toFixed(2) + ' ms por consulta' };
});

t(S10, '10.6', 'A linha de costa é gerada, não editada à mão', () => {
  const fs10 = require('fs');
  const js = fs10.readFileSync(ROOT + '/assets/js/coastline.js', 'utf8');
  ok(/N[ÃA]O EDITE/i.test(js), 'o arquivo não avisa que é gerado');
  ok(/Natural Earth/i.test(js), 'o arquivo não declara a fonte');
  ok(fs10.existsSync(ROOT + '/tools/costa/gerar_costa.mjs'),
     'o gerador não está no repositório — a base vira dado órfão');
});

/* ── SUÍTE 11 — CRUZAMENTO COM A BASE OSM DO PRÓPRIO REPOSITÓRIO ────────── */
const S11 = '11 · Cruzamento OSM';
const fs11 = require('fs');
let osmEl = [];
try {
  const buf = fs11.readFileSync(ROOT + '/osm_lighthouses_v2.json');
  osmEl = (JSON.parse(buf.toString('utf8')).elements) || [];
} catch (e) { osmEl = []; }

function pares() {
  const out = [];
  lighthouses.forEach(a => {
    let best = null, bd = Infinity;
    osmEl.forEach(o => {
      const la = o.lat != null ? o.lat : (o.center && o.center.lat);
      const ln = o.lon != null ? o.lon : (o.center && o.center.lon);
      if (la == null) return;
      const d = calculateDistance(a.lat, a.lng, la, ln);
      if (d < bd) { bd = d; best = o; }
    });
    if (best && bd < 1) {
      const tg = best.tags || {};
      const h = parseFloat(tg['height'] || tg['seamark:light:height'] || tg['seamark:landmark:height'] || '');
      if (isFinite(h) && h > 0) out.push({ nome: a.name, app: a.altitude, struct: a.structHeight, osm: h });
    }
  });
  return out;
}
t(S11, '11.1', 'Base OSM de referência é legível como JSON UTF-8', () => {
  const buf = fs11.readFileSync(ROOT + '/osm_lighthouses_v2.json');
  ok(!(buf[0] === 0xFF && buf[1] === 0xFE),
     'arquivo em UTF-16LE com BOM: JSON.parse() padrão falha e exige transcodificação manual');
  const d = JSON.parse(buf.toString('utf8'));
  ok(Array.isArray(d.elements) && d.elements.length > 0, 'estrutura OSM inesperada');
  return { detail: `${d.elements.length} registros · ${(buf.length / 1024).toFixed(0)} KB em UTF-8` };
});
t(S11, '11.2', 'Sem arquivos de dados vazios versionados', () => {
  const vazios = fs11.readdirSync(ROOT)
    .filter(f => /\.(json|csv|jsonl)$/.test(f))
    .filter(f => fs11.statSync(ROOT + '/' + f).size === 0);
  ok(vazios.length === 0, 'arquivos de dados com 0 bytes: ' + vazios.join(', '));
});
t(S11, '11.3', 'Altitude ou altura de estrutura confere com a base OSM', () => {
  // O `height` do OpenStreetMap é inconsistente: em Salinópolis e Morro Branco
  // corresponde à ALTITUDE do foco; em Conchas e Santa Marta, à altura da
  // TORRE. É dado colaborativo, sem a disciplina de colunas da DHN — por isso
  // a prova aceita coincidência com qualquer um dos dois campos publicados.
  // Serve como sanidade secundária; a autoridade é a LF-40ED.
  const p = pares();
  ok(p.length > 0, 'nenhum par comparável — base OSM ilegível');
  const bate = x => Math.abs(x.app - x.osm) <= 15 ||
                    (x.struct != null && Math.abs(x.struct - x.osm) <= 15);
  const div = p.filter(x => !bate(x));
  const taxa = (p.length - div.length) / p.length * 100;
  ok(taxa >= 70, `apenas ${taxa.toFixed(0)}% conferem; ${div.length} fora: ` +
     div.slice(0, 5).map(x => `${x.nome} (alt ${x.app} / estr ${x.struct} vs osm ${x.osm})`).join(' | '));
  return { detail: `${p.length - div.length}/${p.length} (${taxa.toFixed(0)}%) conferem com um dos dois campos` };
});

t(S11, '11.4', 'Altitude do foco nunca é menor que a altura da estrutura', () => {
  // Sanidade física: o foco fica no topo da torre, que por sua vez está sobre
  // o terreno. altitude < structHeight indicaria colunas trocadas de novo.
  const mau = lighthouses.filter(l => l.structHeight != null && l.altitude < l.structHeight - 1);
  ok(mau.length === 0,
     mau.map(l => `${l.name} altitude=${l.altitude}m < estrutura=${l.structHeight}m`).join(' | '));
  const n = lighthouses.filter(l => l.structHeight != null).length;
  return { detail: `${n} faróis com os dois campos publicados, todos coerentes` };
});

/* ── SUÍTE 12 — HIGIENE DE CÓDIGO ───────────────────────────────────────── */
const S12 = '12 · Higiene';
t(S12, '12.1', 'Código repartido em módulos, nenhum arquivo gigante', () => {
  const fs12 = require('fs');
  const linhas = f => fs12.readFileSync(ROOT + '/' + f, 'utf8').split('\n').length;
  const arquivos = ['app.html', 'assets/css/app.css', 'assets/js/lighthouses.js',
                    'assets/js/nautical.js', 'assets/js/report.js', 'assets/js/mirror.js',
                    'assets/js/ship3d.js'];
  arquivos.forEach(f => ok(fs12.existsSync(ROOT + '/' + f), 'ausente: ' + f));
  const grandes = arquivos.filter(f => linhas(f) > 3500);
  ok(grandes.length === 0, 'acima de 3500 linhas: ' +
     grandes.map(f => `${f} (${linhas(f)})`).join(', '));
  return { detail: arquivos.map(f => `${f.split('/').pop()} ${linhas(f)}`).join(' · ') };
});
t(S12, '12.4', 'Os módulos são carregados na ordem de dependência', () => {
  const html = require('fs').readFileSync(ROOT + '/app.html', 'utf8');
  const pos = f => html.indexOf(f);
  ok(pos('assets/js/lighthouses.js') > 0 && pos('assets/js/nautical.js') > 0,
     'módulos não referenciados no app.html');
  ok(pos('assets/js/lighthouses.js') < pos('assets/js/nautical.js'),
     'nautical.js usa `lighthouses`: precisa vir depois de lighthouses.js');
  ok(pos('assets/js/mirror.js') > 0, 'mirror.js não referenciado no app.html');
});
t(S12, '12.2', 'Sem console.log de depuração em caminho quente', () => {
  const bloco = SRC.slice(SRC.indexOf('function createWaypoint'), SRC.indexOf('function getWaypointPopupContent'));
  const n = (bloco.match(/console\.log/g) || []).length;
  ok(n <= 2, `createWaypoint() emite ${n} console.log por waypoint — na importação de uma trilha longa isso domina o tempo de execução`);
});
t(S12, '12.3', 'Laço de importação não chama função que abre modal bloqueante', () => {
  const imp = SRC.slice(SRC.indexOf('function importGPX'), SRC.indexOf('function exportGPX'));
  const cw  = SRC.slice(SRC.indexOf('function createWaypoint'), SRC.indexOf('function getWaypointPopupContent'));
  const emLaco = /allPoints\.forEach[\s\S]*createWaypoint\(lat, lng\)/.test(imp);
  const temAlert = /COMBUSTÍVEL INSUFICIENTE/.test(cw);
  ok(!(emLaco && temAlert),
     'importGPX() chama createWaypoint() dentro de forEach e createWaypoint() dispara alert() a cada ponto sem combustível — ' +
     'a importação vira uma fila de caixas de diálogo até o usuário fechar todas');
});


/* ── SUÍTE 13 — ESPELHO: DIAGNÓSTICO E RECONEXÃO ────────────────────────── */
const S13 = '13 · Espelho';
const CSS = require('fs').readFileSync(ROOT + '/assets/css/app.css', 'utf8');

t(S13, '13.1', 'Falha do canal não vira "erro de conexão" genérico', () => {
  ok(!/setMirrorConn\('erro de conexão'/.test(SRC),
     'a mensagem genérica não diz ao observador se o problema é o aparelho dele, ' +
     'o link ou o servidor — e nenhuma dessas causas tem o mesmo conserto');
});
t(S13, '13.2', 'As causas de falha são distinguidas e explicadas', () => {
  ['sem-rede', 'servidor', 'canal', 'silencio'].forEach(c =>
    ok(new RegExp("'" + c + "':").test(SRC), 'causa não tratada: ' + c));
  ok(/function diagnosticarEspelho/.test(SRC), 'sem função de diagnóstico');
  ok(/navigator\.onLine/.test(SRC), 'não distingue falta de rede do observador');
  const dicas = (SRC.match(/dica: '/g) || []).length;
  ok(dicas >= 4, `apenas ${dicas} orientações escritas`);
  return { detail: `${dicas} causas com rótulo e orientação em linguagem de bordo` };
});
t(S13, '13.3', 'Reconexão automática com espera progressiva', () => {
  const m = SRC.match(/const MIRROR_BACKOFF_MS = \[([^\]]+)\]/);
  ok(m, 'sem tabela de espera progressiva');
  const v = m[1].split(',').map(x => parseInt(x.trim(), 10));
  ok(v.length >= 3, 'poucos degraus de espera');
  for (let i = 1; i < v.length; i++) ok(v[i] > v[i - 1], 'a espera precisa crescer: ' + v.join(','));
  ok(v[0] >= 1000 && v[v.length - 1] <= 60000, 'faixa de espera implausível: ' + v.join(','));
  ok(/function agendarReconexao/.test(SRC), 'sem agendamento de nova tentativa');
  return { detail: v.map(x => x / 1000 + 's').join(' · ') + ' — e o banner mostra a contagem' };
});
t(S13, '13.4', 'Silêncio da embarcação é detectado (não basta estar conectado)', () => {
  ok(/Date\.now\(\) - _mirrorLastMsg/.test(SRC),
     '_mirrorLastMsg era gravado e NUNCA lido: conectado sem receber parecia normal');
  ok(/const MIRROR_SILENCE_MS = \d+/.test(SRC), 'sem limiar de silêncio');
  ok(/function armarVigiaDeSilencio/.test(SRC), 'sem vigia de silêncio');
});
t(S13, '13.5', 'Reconecta ao voltar a rede ou a aba', () => {
  ok(/addEventListener\('online'/.test(SRC), 'não reage à volta da rede');
  ok(/visibilitychange/.test(SRC), 'não reage ao retorno à aba');
  ok(/addEventListener\('offline'/.test(SRC), 'não avisa quando a rede cai');
});
t(S13, '13.6', 'Bloqueio definitivo encerra as tentativas', () => {
  const bloco = SRC.slice(SRC.indexOf('function showMirrorBlocked'),
                          SRC.indexOf('function showMirrorBlocked') + 900);
  ['mirrorRetryTimer', 'mirrorCountdownTimer', 'mirrorStaleTimer'].forEach(tm =>
    ok(bloco.includes(tm), `${tm} continuaria rodando após link revogado/expirado`));
});
t(S13, '13.7', 'Estado "mudo" tem cor própria, distinta de "caiu"', () => {
  ok(/\.mirror-conn\.warn\s*\{/.test(CSS),
     'conectado-sem-receber e conexão-caída não podem ter a mesma cor');
  ok(/\.mirror-conn\.ok\s*\{/.test(CSS) && /\.mirror-conn\.off\s*\{/.test(CSS));
});
t(S13, '13.8', 'Telemetria recebida zera a espera de reconexão', () => {
  const bloco = SRC.slice(SRC.indexOf('function applyMirrorTelemetry'),
                          SRC.indexOf('function applyMirrorTelemetry') + 400);
  ok(/mirrorRetry = 0/.test(bloco), 'sem isso, uma queda antiga mantém a espera longa');
});


t(S13, '13.9', 'Registro do compartilhamento verifica o RETORNO, não só exceção', () => {
  // supabase-js devolve { data, error } e só lança em falha de REDE. Um
  // try/catch sozinho não enxerga erro vindo do servidor — foi assim que
  // links nasceram sem token registrado, e o observador via "Link inválido".
  ok(/function registrarShare/.test(SRC), 'sem função única de registro');
  ok(/const \{ error \} = await supa\.rpc\('create_nav_share'/.test(SRC),
     'o campo `error` do retorno precisa ser checado');
  ok(!/_dbSynced = true;\s*\n\s*try/.test(SRC),
     'marcar como sincronizado ANTES de chamar o servidor produz link morto');
});
t(S13, '13.10', 'Link não registrado é sinalizado ao comandante', () => {
  ok(/AINDA NÃO REGISTRADO/.test(SRC), 'criação sem confirmação precisa avisar');
  ok(/share-pendente/.test(SRC) && /\.share-pendente/.test(CSS),
     'o estado pendente precisa aparecer na lista de compartilhamentos');
  ok(/function ressincronizarShares/.test(SRC), 'sem nova tentativa de registro');
});
t(S13, '13.11', 'Revogação só remove da lista se o servidor confirmar', () => {
  const bloco = SRC.slice(SRC.indexOf('async function revokeShare'),
                          SRC.indexOf('async function revokeShare') + 1800);
  ok(/const \{ error \} = await supa\.rpc\('revoke_nav_share'/.test(bloco),
     'revogação sem verificar o retorno: o item some da lista e o acesso continua de pé');
  ok(/NÃO foi possível revogar/.test(bloco), 'falha de revogação precisa ser dita');
});
t(S13, '13.12', 'Estado de registro sobrevive ao recarregar a página', () => {
  ok(/dbOk: !!x\.dbOk/.test(SRC), 'loadShares precisa restaurar o estado de registro');
  ok(/dbOk: !!s\.dbOk/.test(SRC), 'persistShares precisa gravar o estado de registro');
});
t(S13, '13.13', 'Falha de rede na revalidação NÃO acusa o link do observador', () => {
  /*
  O DEFEITO, e por que ele durou tanto.                             (v2.15.0)

  `startViewerRecheck` roda a cada 30 s enquanto alguém acompanha em terra.
  Ela lia só `data` e descartava `error`. Como `supa.rpc()` RESOLVE com
  `{ data: null, error }` em vez de lançar (§6.1 do tecnica.md), qualquer
  instabilidade de 30 segundos fazia o aplicativo declarar "Link inválido"
  para quem estava com o link certo — e `showMirrorBlocked` é definitivo:
  limpa os três temporizadores e derruba o canal, de modo que a reconexão
  automática morria. Enquanto isso o banner ao lado dizia "servidor fora do
  ar": o aplicativo se contradizia na mesma tela.

  A lição já estava codificada na prova 13.11, para a revogação. O recheck
  era a cópia que tinha perdido a guarda — o padrão clássico de consertar
  onde doeu e não onde o defeito mora.

  VARREDURA DE CÓDIGO LÊ CÓDIGO: o comentário da emenda cita `error` e
  `supa.rpc` de propósito, para explicar. Sem recortar, esta prova ficaria
  verde lendo a minha prosa.
  */
  const LIMPO = semComentarios(SRC);
  const i = LIMPO.indexOf('function startViewerRecheck');
  ok(i > 0, 'não há revalidação periódica do link');
  const bloco = LIMPO.slice(i, i + 700);

  ok(/const \{ data, error \} = await supa\.rpc\('check_nav_share'/.test(bloco),
     'a revalidação não captura `error` — falha de rede vira "link inválido" ' +
     'para quem está com o link certo, e a reconexão morre junto');

  /* A ordem importa: a guarda tem de vir ANTES de olhar `data`, senão
     `data` nulo já decidiu o bloqueio antes de alguém perguntar por quê. */
  const posErro = bloco.indexOf('if (error) return');
  const posData = bloco.indexOf('if (!data || !data.length)');
  ok(posErro > 0, 'sem guarda de erro na revalidação');
  ok(posData > 0, 'a revalidação não trata resposta vazia');
  ok(posErro < posData, 'a guarda de erro vem DEPOIS de decidir por `data` — não guarda nada');

  /* E o bloqueio continua existindo para o caso legítimo: servidor respondeu,
     e respondeu que o link não vale. Uma "correção" que nunca mais bloqueia
     seria trocar um defeito por outro — link revogado seguiria funcionando. */
  ok(/showMirrorBlocked\('invalido'\)/.test(bloco),
     'resposta bem-sucedida e vazia precisa continuar bloqueando');
  ok(/revoked \? 'revogado' : 'expirado'/.test(bloco),
     'link revogado ou expirado precisa continuar bloqueando');
});



/* ── SUÍTE 14 — MANUTENÇÃO AGENDADA ─────────────────────────────────────── */
const S14 = '14 · Manutenção';
const fs14 = require('fs');
const WF = ROOT + '/.github/workflows/manter-supabase-ativo.yml';

t(S14, '14.1', 'Existe rotina para impedir a suspensão do Supabase', () => {
  ok(fs14.existsSync(WF), 'sem workflow de manutenção — o projeto volta a dormir em ~7 dias');
});
t(S14, '14.2', 'A frequência tem folga sobre o limite de suspensão', () => {
  const y = fs14.readFileSync(WF, 'utf8');
  const m = y.match(/cron:\s*'([^']+)'/);
  ok(m, 'sem agendamento cron');
  const dia = m[1].split(/\s+/)[2];              // campo dia-do-mês
  const passo = /^\*\/(\d+)$/.exec(dia);
  ok(passo, 'esperado intervalo em dias, obtido: ' + m[1]);
  const dias = Number(passo[1]);
  ok(dias <= 4, `a cada ${dias} dias é pouca folga para um limite de 7`);
  return { detail: `a cada ${dias} dias · ${m[1]}` };
});
t(S14, '14.3', 'O workflow lê a configuração do código, sem cópia paralela', () => {
  const y = fs14.readFileSync(WF, 'utf8');
  const m = y.match(/ARQ=(\S+)/);
  ok(m, 'o workflow não declara de qual arquivo lê a configuração');
  const arq = ROOT + '/' + m[1];
  ok(fs14.existsSync(arq), `o workflow lê de ${m[1]}, que não existe mais`);
  // O elo frágil: se a constante mudar de formato, o grep do workflow devolve
  // vazio e o ping para de funcionar sem ninguém perceber.
  const src = fs14.readFileSync(arq, 'utf8');
  ok(/SUPA_URL = '[^']+'/.test(src) && /SUPA_KEY = '[^']+'/.test(src),
     `o formato de SUPA_URL/SUPA_KEY em ${m[1]} mudou e quebraria a extração do workflow`);
  return { detail: 'lê de ' + m[1] };
});
t(S14, '14.4', 'Falha do ping vira alarme, não silêncio', () => {
  const y = fs14.readFileSync(WF, 'utf8');
  ok(/::error::/.test(y), 'sem ::error::, a falha não gera notificação do GitHub');
  ok(/exit 1/.test(y), 'o job precisa falhar quando o projeto não responde');
  ok(/workflow_dispatch/.test(y), 'sem disparo manual para verificar sob demanda');
});
t(S14, '14.5', 'Nenhum segredo novo exposto pelo workflow', () => {
  const y = fs14.readFileSync(WF, 'utf8');
  ok(!/sb_secret|service_role|eyJ[A-Za-z0-9_-]{20,}\./.test(y),
     'chave privilegiada no workflow');
  ok(!/sb_publishable_[A-Za-z0-9_]+/.test(y),
     'a chave não deve ser copiada para o workflow — ele a lê do código fonte');
  ok(/add-mask/.test(y), 'a chave deveria ser mascarada no log por higiene');
});


/* ═══════════════════════════════════════════════════════════════════════════
   SUÍTE 15 · Frota 3D                                            (v2.3.0)
   Um casco mal declarado não quebra nada que um teste unitário perceba: o
   navio simplesmente aparece de ré, ou afundado. Estas provas guardam os
   invariantes do registro e a integridade dos arquivos GLB.
   ═══════════════════════════════════════════════════════════════════════════ */
const S15 = '15 · Frota 3D';
const fs15 = require('fs');
const APP15 = fs15.readFileSync(ROOT + '/app.html', 'utf8');       // marcação do painel
const S3D15 = fs15.readFileSync(ROOT + '/assets/js/ship3d.js', 'utf8'); // lógica da frota

/* Extrai o literal SHIP_MODELS do app.html contando colchetes — mesma técnica
   que o harness usa para as funções: lê o código de verdade, não uma cópia. */
function lerShipModels() {
  const i = S3D15.indexOf('const SHIP_MODELS = [');
  if (i < 0) return null;
  let j = S3D15.indexOf('[', i), d = 0, fim = -1;
  for (let k = j; k < S3D15.length; k++) {
    if (S3D15[k] === '[') d++;
    else if (S3D15[k] === ']') { d--; if (d === 0) { fim = k; break; } }
  }
  if (fim < 0) return null;
  return eval(S3D15.slice(j, fim + 1));   // literal fechado, sem chamadas
}
const FROTA = lerShipModels();

t(S15, '15.1', 'O registro da frota existe e traz mais de um casco', () => {
  ok(FROTA, 'SHIP_MODELS não foi encontrado em assets/js/ship3d.js');
  ok(FROTA.length >= 2, `a frota tem ${FROTA ? FROTA.length : 0} casco(s) — o seletor perde o sentido`);
  return { detail: FROTA.map(m => m.id).join(' · ') };
});

t(S15, '15.2', 'Todo casco declara os campos que o motor 3D exige', () => {
  const exigidos = ['id', 'nome', 'classe', 'arquivo', 'loa', 'boca', 'calado',
                    'headingOffset', 'headingOffsetEarth', 'credito'];
  FROTA.forEach(m => exigidos.forEach(c => {
    ok(m[c] !== undefined && m[c] !== null && m[c] !== '',
       `o casco "${m.id}" não declara "${c}"`);
  }));
});

t(S15, '15.3', 'Os arquivos GLB declarados existem no repositório', () => {
  FROTA.forEach(m => {
    const f = ROOT + '/' + m.arquivo;
    ok(fs15.existsSync(f), `o casco "${m.id}" aponta para ${m.arquivo}, que não existe`);
    const b = fs15.readFileSync(f);
    // Cabeçalho glTF binário: mágica "glTF" + versão 2 + tamanho declarado.
    ok(b.slice(0, 4).toString('ascii') === 'glTF', `${m.arquivo} não é um GLB`);
    ok(b.readUInt32LE(4) === 2, `${m.arquivo} não é glTF 2.0`);
    ok(b.readUInt32LE(8) === b.length,
       `${m.arquivo} declara ${b.readUInt32LE(8)} bytes mas tem ${b.length} — arquivo truncado`);
  });
  return { detail: FROTA.map(m => (fs15.statSync(ROOT + '/' + m.arquivo).size / 1048576).toFixed(2) + ' MB').join(' · ') };
});

t(S15, '15.4', 'Nenhum casco pesa a ponto de inviabilizar rede de bordo', () => {
  const LIMITE_MB = 4;   // a bordo a rede é 3G intermitente, não fibra
  FROTA.forEach(m => {
    const mb = fs15.statSync(ROOT + '/' + m.arquivo).size / 1048576;
    ok(mb <= LIMITE_MB, `${m.id} pesa ${mb.toFixed(2)} MB (limite ${LIMITE_MB} MB)`);
  });
});

t(S15, '15.5', 'Identificadores e arquivos não se repetem', () => {
  const ids = FROTA.map(m => m.id), arqs = FROTA.map(m => m.arquivo);
  ok(new Set(ids).size === ids.length, 'há id repetido — localStorage escolheria o errado');
  ok(new Set(arqs).size === arqs.length, 'dois cascos apontam para o mesmo arquivo');
});

/* Lê a caixa envolvente de um GLB pelo JSON, sem descomprimir malha: os
   acessores de POSITION são obrigados pelo glTF a declarar min/max, e o grafo
   de nós dá as transformações. É assim que se confere a ÂNCORA do casco. */
function caixaGLB(caminho) {
  const b = fs15.readFileSync(caminho);
  const tamJson = b.readUInt32LE(12);
  const gltf = JSON.parse(b.subarray(20, 20 + tamJson).toString('utf8'));
  const mul = (A, B) => {                       // 4x4 coluna-maior, como o glTF
    const C = new Array(16).fill(0);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++)
      for (let k = 0; k < 4; k++) C[j * 4 + i] += A[k * 4 + i] * B[j * 4 + k];
    return C;
  };
  const local = (n) => {
    if (n.matrix) return n.matrix.slice();
    const [tx, ty, tz] = n.translation || [0, 0, 0];
    const [sx, sy, sz] = n.scale || [1, 1, 1];
    const [x, y, z, w] = n.rotation || [0, 0, 0, 1];
    const R = [1-2*(y*y+z*z), 2*(x*y+z*w), 2*(x*z-y*w), 0,
               2*(x*y-z*w), 1-2*(x*x+z*z), 2*(y*z+x*w), 0,
               2*(x*z+y*w), 2*(y*z-x*w), 1-2*(x*x+y*y), 0, 0, 0, 0, 1];
    for (let c = 0; c < 3; c++) for (let r = 0; r < 3; r++) R[c*4+r] *= [sx,sy,sz][c];
    R[12] = tx; R[13] = ty; R[14] = tz;
    return R;
  };
  const cx = { min: [1e9,1e9,1e9], max: [-1e9,-1e9,-1e9] };
  const anda = (i, M) => {
    const n = gltf.nodes[i], W = mul(M, local(n));
    if (n.mesh != null) for (const p of gltf.meshes[n.mesh].primitives) {
      const ai = p.attributes && p.attributes.POSITION;
      if (ai == null) continue;
      const a = gltf.accessors[ai];
      if (!a.min || !a.max) continue;
      for (let k = 0; k < 8; k++) {             // os 8 cantos da caixa local
        const v = [k & 1 ? a.max[0] : a.min[0], k & 2 ? a.max[1] : a.min[1], k & 4 ? a.max[2] : a.min[2]];
        for (let r = 0; r < 3; r++) {
          const q = W[r] * v[0] + W[4+r] * v[1] + W[8+r] * v[2] + W[12+r];
          cx.min[r] = Math.min(cx.min[r], q); cx.max[r] = Math.max(cx.max[r], q);
        }
      }
    }
    (n.children || []).forEach(c => anda(c, W));
  };
  const I = [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
  (gltf.scenes[gltf.scene || 0].nodes || []).forEach(i => anda(i, I));
  return cx;
}

t(S15, '15.6', 'A origem do casco está na linha d\'água, não no centro da caixa', () => {
  /*
  ESTA PROVA EXISTE POR CAUSA DE UM DEFEITO REAL. No modo Earth o Cesium
  assenta a ORIGEM do modelo na altitude 0 e, para o navio não sumir ao longe,
  o AMPLIA (minimumPixelSize). Origem fora da linha d'água vira erro
  multiplicado pela ampliação: no ASD 2810 eram 4,96 m que, a 400x, viravam
  quase 2 km de afundamento — sumia o casco e sobrava o mastro.
  Ancorar na linha d'água é o que torna o casco correto em qualquer escala.
  */
  FROTA.forEach(m => {
    const c = caixaGLB(ROOT + '/' + m.arquivo);
    // y=0 tem de cair DENTRO do casco: obra viva abaixo, obra morta acima.
    ok(c.min[1] < 0, `"${m.id}": nada abaixo da linha d'água (min y = ${c.min[1].toFixed(2)}) — casco voando`);
    ok(c.max[1] > 0, `"${m.id}": nada acima da linha d'água (max y = ${c.max[1].toFixed(2)}) — casco submerso`);
    // E o calado declarado tem de bater com o que a geometria mostra.
    ok(Math.abs(-c.min[1] - m.calado) < 0.15,
       `"${m.id}" declara calado ${m.calado} m mas a geometria tem ${(-c.min[1]).toFixed(2)} m sob a linha d'água`);
    // Guinada gira em torno do próprio navio: origem no meio-navio.
    const desX = (c.min[0] + c.max[0]) / 2, desZ = (c.min[2] + c.max[2]) / 2;
    ok(Math.abs(desX) < 0.5 && Math.abs(desZ) < 0.5,
       `"${m.id}" não está centrado: eixo a ${desX.toFixed(2)} m da linha de centro e ${desZ.toFixed(2)} m do meio-navio`);
  });
  return { detail: FROTA.map(m => {
    const c = caixaGLB(ROOT + '/' + m.arquivo);
    return `${m.id} ${(-c.min[1]).toFixed(2)}m sob / ${c.max[1].toFixed(2)}m sobre`;
  }).join(' · ') };
});

t(S15, '15.7', 'Correções de proa são graus válidos e conscientes do motor', () => {
  FROTA.forEach(m => {
    [['headingOffset', m.headingOffset], ['headingOffsetEarth', m.headingOffsetEarth]].forEach(([c, v]) => {
      ok(Number.isFinite(v) && v > -360 && v < 360, `"${m.id}".${c} = ${v} não é um ângulo válido`);
      ok(v % 90 === 0, `"${m.id}".${c} = ${v} — a proa de um GLB cai sempre num múltiplo de 90°`);
    });
  });
});

t(S15, '15.8', 'As dimensões declaradas são de um rebocador, não de um chute', () => {
  FROTA.forEach(m => {
    ok(m.loa > 15 && m.loa < 60, `"${m.id}" tem LOA ${m.loa} m — fora da faixa de rebocador`);
    ok(m.boca > 5 && m.boca < 20, `"${m.id}" tem boca ${m.boca} m — fora da faixa`);
    // Rebocador é curto e gordo: a razão comprimento/boca fica perto de 3.
    const r = m.loa / m.boca;
    ok(r > 2 && r < 4, `"${m.id}" tem L/B = ${r.toFixed(2)}, que não é forma de rebocador`);
  });
});

t(S15, '15.9', 'O casco padrão existe de fato no registro', () => {
  const mp = /const SHIP_MODEL_PADRAO = '([^']+)'/.exec(S3D15);
  ok(mp, 'SHIP_MODEL_PADRAO não foi declarado');
  ok(FROTA.some(m => m.id === mp[1]),
     `o padrão é "${mp[1]}", que não está na frota — o painel cairia no primeiro casco em silêncio`);
  return { detail: 'padrão: ' + mp[1] };
});

t(S15, '15.10', 'A troca de casco libera a memória de vídeo do anterior', () => {
  const i = S3D15.indexOf('async function carregarShipModel');
  ok(i > 0, 'carregarShipModel não existe — a troca recriaria a cena inteira');
  const corpo = S3D15.slice(i, i + 2600);
  // O WebGL não tem coleta de lixo: sem dispose(), cada troca prende dezenas
  // de MB na GPU e a terceira trava um celular.
  ok(/geometry\.dispose\(\)/.test(corpo), 'a geometria antiga não é descartada');
  ok(/mat\.dispose\(\)/.test(corpo), 'o material antigo não é descartado');
  ok(/\[k\]\.dispose\(\)/.test(corpo), 'as texturas antigas não são descartadas');
});

t(S15, '15.11', 'Nenhum caminho de modelo ficou escrito à mão fora do registro', () => {
  // A v2.2.2 tinha 'assets/models/tug.glb' em dois lugares. Se voltar a haver
  // caminho fora de SHIP_MODELS, o seletor deixa de valer para aquele ponto.
  const fora = (APP15 + '\n' + S3D15).split('\n')
    .map((l, n) => [n + 1, l])
    .filter(([, l]) => /assets\/models\/[\w.-]+\.glb/.test(l))
    .filter(([, l]) => !/arquivo:/.test(l));
  ok(fora.length === 0,
     'caminho de modelo fora do registro na(s) linha(s) ' + fora.map(([n]) => n).join(', '));
});

t(S15, '15.12', 'A constante única de proa foi mesmo aposentada', () => {
  ok(!/SHIP_HEADING_OFFSET_DEG/.test(APP15 + S3D15),
     'SHIP_HEADING_OFFSET_DEG ainda existe — um único offset não serve a dois cascos');
  ok(/headingOffsetEarth \|\| 0/.test(S3D15), 'o Cesium não lê o offset do casco escolhido');
  ok(/shipModelAtual\(\)\.arquivo/.test(S3D15), 'o globo não segue o casco escolhido');
});

t(S15, '15.13', 'A escolha do casco sobrevive ao recarregar', () => {
  ok(/SHIP_MODEL_CHAVE = '[^']+'/.test(S3D15), 'não há chave de localStorage para a escolha');
  ok(/localStorage\.setItem\(SHIP_MODEL_CHAVE/.test(S3D15), 'a escolha não é gravada');
  ok(/localStorage\.getItem\(SHIP_MODEL_CHAVE\)/.test(S3D15), 'a escolha não é lida na volta');
  // Uma preferência antiga apontando para um casco removido não pode quebrar o painel.
  ok(/\|\| SHIP_MODELS\[0\]/.test(S3D15), 'sem recuo quando a preferência aponta para casco inexistente');
});

t(S15, '15.14', 'O crédito de cada modelo acompanha o casco exibido', () => {
  FROTA.forEach(m => ok(m.credito.length > 15, `o crédito de "${m.id}" é curto demais para atribuir autoria`));
  ok(/ship3dCredit/.test(APP15), 'o painel não tem elemento de crédito atualizável');
  ok(!/Rastar 3200 tugboat.*CC-BY-4\.0<\/div>/.test(APP15),
     'o crédito continua fixo no HTML e mentiria ao trocar de casco');
});

t(S15, '15.15', 'O seletor está ligado à troca de casco', () => {
  ok(/id="ship3dModelSel"/.test(APP15), 'o seletor não existe no painel');
  ok(/onchange="trocarShipModel\(this\.value\)"/.test(APP15), 'o seletor não dispara a troca');
  ok(/function popularSeletorModelo/.test(S3D15), 'nada preenche as opções do seletor');
});

t(S15, '15.16', 'A proa é normalizada no modelo, não somada ao rumo', () => {
  const i = S3D15.indexOf('async function carregarShipModel');
  const corpo = S3D15.slice(i, i + 4200);
  // Somar graus ao rumo corrige a guinada e deixa caturro e jogo INVERTIDOS:
  // com ordem YXZ a rotação em Y é a mais externa e preserva a altura, então
  // Ry(180°) reposiciona a proa sem desfazer o mergulho. A correção tem de
  // agir no casco, antes de jogo/caturro/rumo.
  ok(/pivoProa/.test(corpo), 'não há pivô de proa — o casco não é normalizado');
  ok(/pivoProa\.rotation\.y = THREE\.MathUtils\.degToRad\(m\.headingOffset/.test(corpo),
     'o pivô não aplica headingOffset ao modelo');
  ok(/pivoProa\.add\(model\)/.test(corpo),
     'o modelo precisa estar DENTRO do pivô, já centrado, para girar no próprio centro');
  ok(/s3dShip\.rotation\.set\(R\(s3dPitch\), R\(-s3dHead\), R\(s3dRoll\)\)/.test(S3D15),
     'o laço de atitude ainda soma correção ao rumo — caturro e jogo ficariam invertidos');
});

t(S15, '15.17', 'Todo casco declara para onde aponta a sua proa no arquivo', () => {
  FROTA.forEach(m => {
    ok(/^[+-][XYZ]$/.test(m.proaEixo || ''), `"${m.id}".proaEixo = ${m.proaEixo} — não é um eixo`);
    // O laço pressupõe a proa em -Z. O giro declarado tem de ser exatamente o
    // que leva proaEixo até lá: 0° para quem já está em -Z, 180° para +Z.
    const esperado = { '-Z': 0, '+Z': 180, '+X': 90, '-X': 270 }[m.proaEixo];
    ok(esperado !== undefined, `"${m.id}" tem proa em ${m.proaEixo}, eixo não previsto`);
    ok(((m.headingOffset % 360) + 360) % 360 === esperado,
       `"${m.id}" tem proa em ${m.proaEixo} e headingOffset ${m.headingOffset}° — ` +
       `para cair em -Z precisaria de ${esperado}°`);
  });
  return { detail: FROTA.map(m => `${m.id} ${m.proaEixo}→${m.headingOffset}°`).join(' · ') };
});

/* ═══════════════════════════════════════════════════════════════════════════
   SUÍTE 16 · Coerência da vitrine                                (v2.3.1)
   A página inicial é a única parte do produto que ninguém executa — e por isso
   a que envelhece sem avisar. Ela chegou a anunciar "70 faróis" com 98 na base
   e a exibir TRÊS versões diferentes ao mesmo tempo (2.0.5 no selo, 2.2.0 no
   rodapé, 2.3.0 no aplicativo). Estas provas fecham essa porta.
   ═══════════════════════════════════════════════════════════════════════════ */
const S16 = '16 · Coerência da vitrine';
const fs16 = require('fs');
const APP16 = fs16.readFileSync(ROOT + '/app.html', 'utf8');
const IDX16 = fs16.readFileSync(ROOT + '/index.html', 'utf8');
const RDM16 = fs16.readFileSync(ROOT + '/README.md', 'utf8');

// A versão canônica é a do cabeçalho do app.html; tudo mais deve concordar.
const VER = (/^\s*Versão:\s*(\d+\.\d+\.\d+)\s*$/m.exec(APP16) || [])[1];

t(S16, '16.1', 'Existe uma versão canônica declarada no app.html', () => {
  ok(VER, 'o cabeçalho do app.html não declara "Versão: X.Y.Z"');
  return { detail: 'v' + VER };
});

t(S16, '16.2', 'Todas as versões visíveis ao usuário concordam', () => {
  // Cada uma destas aparece numa tela diferente. Divergir é o defeito original.
  const pontos = [
    ['app.html · <title>',        APP16, new RegExp('<title>Coastal Navigator Brasil v(\\d+\\.\\d+\\.\\d+)')],
    ['app.html · cabeçalho',      APP16, /<span class="version">v(\d+\.\d+\.\d+)<\/span>/],
    ['app.html · console',        APP16, /Coastal Navigator Brasil v(\d+\.\d+\.\d+) - Inicializado/],
    ['index.html · selo',         IDX16, /class="version-badge">Versão (\d+\.\d+\.\d+)/],
    ['index.html · rodapé',       IDX16, /Coastal Navigator Brasil v(\d+\.\d+\.\d+)<br>/],
    ['README.md · título',        RDM16, /^# Coastal Navigator Brasil v(\d+\.\d+\.\d+)/m],
  ];
  const divergentes = [];
  pontos.forEach(([nome, src, re]) => {
    const m = re.exec(src);
    if (!m) divergentes.push(`${nome}: não declara versão`);
    else if (m[1] !== VER) divergentes.push(`${nome}: v${m[1]} (canônica é v${VER})`);
  });
  ok(divergentes.length === 0, 'versões em desacordo — ' + divergentes.join(' · '));
  return { detail: `${pontos.length} pontos, todos em v${VER}` };
});

t(S16, '16.3', 'A vitrine não anuncia contagem de faróis diferente da base', () => {
  const real = lighthouses.length;
  // A página cita a contagem de duas formas, e as duas podem envelhecer:
  //   · o TOTAL ("98 faróis"), em vários lugares;
  //   · o RATEIO por trecho de costa (6 + 35 + 10 + 28 + 19).
  // Um rateio que não fecha com o total é tão errado quanto um total errado —
  // e foi exatamente o que aconteceu: a página trazia 5+32+19+14 = 70.
  const citados = [...IDX16.matchAll(/(\d{1,4})\s*[Ff]ar[óo]is/g)].map(m => +m[1]);
  ok(citados.length > 0, 'a vitrine não menciona a base de faróis');

  const totais = citados.filter(n => n === real);
  const parciais = citados.filter(n => n !== real);
  ok(totais.length > 0, `nenhuma menção ao total real de ${real} faróis`);

  const soma = parciais.reduce((a, b) => a + b, 0);
  ok(parciais.length === 0 || soma === real,
     `o rateio por trecho de costa soma ${soma} (${parciais.join('+')}), ` +
     `mas a base tem ${real} faróis`);
  return { detail: `total ${real} citado ${totais.length}x · rateio ${parciais.join('+')}=${soma}` };
});

t(S16, '16.4', 'A vitrine não deixou versões antigas para trás', () => {
  // Um "use a versão 2.0.5" esquecido manda o usuário procurar algo que não existe.
  /* O visitante não lê comentário de HTML — e o histórico às vezes precisa
     citar uma versão antiga para explicar o que mudou. Recortar antes de
     varrer é o que separa "a página mostra versão velha" de "o código
     documenta de onde veio". Sexta vez que esta armadilha aparece. */
  const antigas = [...semComentariosHtml(IDX16).matchAll(/[Vv]ers[ãa]o\s+(\d+\.\d+\.\d+)|v(\d+\.\d+\.\d+)/g)]
    .map(m => m[1] || m[2])
    .filter(v => v !== VER);
  ok(antigas.length === 0, 'versão obsoleta citada na página: ' + [...new Set(antigas)].join(', '));
});

t(S16, '16.5', 'A vitrine anuncia a procedência da base, não só o número', () => {
  // "98 faróis" sem dizer de onde é propaganda; com a fonte, é informação náutica.
  ok(/Lista de Far[óo]is DH2/.test(IDX16), 'a página não cita a Lista de Faróis DH2');
  ok(/40[ªa]\s*edi[çc][ãa]o/.test(IDX16), 'a página não cita a edição da publicação');
  ok(/DHN/.test(IDX16), 'a página não cita a origem (DHN)');
});

t(S16, '16.6', 'Recursos entregues estão anunciados na vitrine', () => {
  // Funcionalidade que existe e não aparece na vitrine é trabalho jogado fora.
  const exigidos = [
    ['painel 3D',      /3D/],
    ['seleção de casco', /ASD 2810|Rastar/],
    ['espelhamento',   /[Ee]spelho|em terra/],
    ['navegação/XTE',  /XTE/],
  ];
  const ausentes = exigidos.filter(([, re]) => !re.test(IDX16)).map(([n]) => n);
  ok(ausentes.length === 0, 'recurso entregue mas não anunciado: ' + ausentes.join(', '));
});

t(S16, '16.7', 'O manual da vitrine cobre navegação e espelhamento', () => {
  const secoes = (IDX16.match(/class="manual-section"/g) || []).length;
  ok(secoes >= 12, `o manual tem ${secoes} seções — navegação e espelhamento não cabem`);
  ok(/manual-header/.test(IDX16) && (IDX16.match(/class="manual-content"/g) || []).length === secoes,
     'cabeçalhos e conteúdos do manual não se emparelham');
  return { detail: secoes + ' seções' };
});

t(S16, '16.8', 'A ressalva de finalidade educativa continua na página', () => {
  // Some numa refatoração de layout e ninguém nota — mas é o que separa uma
  // ferramenta de estudo de algo que alguém usaria no lugar da carta náutica.
  ok(/FINALIDADE ESTRITAMENTE EDUCATIVA/i.test(IDX16), 'a ressalva educativa sumiu da vitrine');
  ok(/carta[s]? n[áa]utica/i.test(IDX16), 'sumiu o aviso de que não substitui a carta náutica');
});

t(S16, '16.0', 'O recortador de comentário HTML recorta mesmo', () => {
  /* ═══════════════════════════════════════════════════════════════════════
     PROVAR A FERRAMENTA, NÃO TORCER PARA UMA MUTAÇÃO EXERCITÁ-LA.

     Mutei a vitrine para que "Abrir o aplicativo" existisse só dentro de um
     comentário HTML, esperando que a 16.10 acusasse. Ela SOBREVIVEU — e o
     motivo é instrutivo: o rodapé traz "ABRIR O APLICATIVO" e a expressão é
     indiferente a maiúsculas, então a 16.10 continuava satisfeita por outro
     caminho. A mutação era INÓCUA (a página segue oferecendo o aplicativo),
     mas deixava o recortador sem prova nenhuma.

     Lição: quando uma mutação não distingue, não se force o teste — prove a
     ferramenta de frente. Varredura que depende de um removedor só vale o
     que o removedor valer.
     ═══════════════════════════════════════════════════════════════════════ */
  eq(semComentariosHtml('<p>visível</p><!-- escondido -->').includes('escondido') ? 1 : 0, 0, 0,
     'comentário de uma linha sobreviveu ao recorte');
  eq(semComentariosHtml('<!--\n  Solicitar Acesso\n  v2.16.0\n-->ok').includes('Solicitar') ? 1 : 0, 0, 0,
     'comentário de VÁRIAS linhas sobreviveu — e é essa a forma que eu escrevo');
  ok(semComentariosHtml('<p>fica</p><!-- sai -->').includes('fica'),
     'o recortador comeu o conteúdo visível junto');
  /* Dois comentários no mesmo arquivo: um regex guloso comeria tudo entre o
     primeiro <!-- e o último -->, apagando o código do meio. */
  const dois = semComentariosHtml('<!--a--><b>MEIO</b><!--c-->');
  ok(dois.includes('MEIO'), 'o recorte é guloso e apagou o que estava ENTRE dois comentários');
  eq((dois.match(/a|c/g) || []).length, 0, 0, 'sobrou conteúdo de comentário');
});

t(S16, '16.10', 'A vitrine NÃO promete um portão que não existe', () => {
  /* ═══════════════════════════════════════════════════════════════════════
     O CAMINHO C, decidido em 01/10/2026: a carta fica aberta e cobra-se pelo
     que roda em servidor e custa. Logo a vitrine não pode anunciar portão.

     Até a v2.16.0 ela se contradizia dentro de si mesma: no topo, um botão
     "Acesso: Leitor LinkedIn" e uma janela "Solicitar Acesso" que pedia nome
     e e-mail para o administrador liberar um link; no rodapé, um link cru
     para app.html. O link nunca existiu — app.html sempre abriu direto.

     Consequência, que é o que esta prova guarda: a pessoa HONESTA pedia e
     ficava esperando; a outra digitava o endereço e entrava. Promessa de
     segurança que não se cumpre é pior que ausência de segurança, porque
     pune justamente quem respeita a regra.
     ═══════════════════════════════════════════════════════════════════════ */
  const V = semComentariosHtml(IDX16);

  ok(!/Solicitar Acesso/i.test(V), 'a vitrine ainda oferece "Solicitar Acesso" — não há acesso a solicitar');
  ok(!/Acesso:\s*Leitor/i.test(V), 'ainda há botão de "Acesso:" para um público específico');
  ok(!/link de acesso/i.test(V), 'a vitrine ainda fala em "link de acesso"');

  /* E diz o que é verdade: o aplicativo abre. */
  ok(/Abrir o aplicativo/i.test(V), 'a vitrine não oferece abrir o aplicativo em lugar nenhum');
  ok(/href="app\.html"/.test(V), 'a vitrine não liga para o aplicativo');
  /* O botão do alto, por id: é dele que a fumaça depende, e é ele que o
     visitante vê antes de rolar a página. Exigir o id, e não só o texto,
     impede que a oferta exista apenas no rodapé. */
  ok(/id="btn-abrir-app"/.test(V), 'o botão do topo sumiu — a oferta ficaria só no rodapé');

  /* A ressalva que sustenta o caminho C: o que é livre e o que custa.
     Sem ela, "abrir o aplicativo" vira promessa de que tudo é gratuito
     para sempre — e o tempo e o espelho saem do bolso do autor. */
  ok(/custeados pelo autor|custeado pelo autor/i.test(V),
     'a vitrine não diz que os serviços de servidor saem do bolso do autor');
  ok(/sem cadastro/i.test(V), 'a vitrine não deixa claro que o aplicativo abre sem cadastro');
});

t(S16, '16.11', 'A vitrine não lê a URL para dentro da página — a injeção morreu com o portão', () => {
  /* ═══════════════════════════════════════════════════════════════════════
     O BURACO QUE O PORTÃO DE MENTIRA ABRIA.                        (v2.17.0)

     O `?user=` ia direto para innerHTML:

         const userMdg = `Bem-vindo, ${decodeURIComponent(this.username)}!`;
         document.body.innerHTML = `…<h1>${userMdg}</h1>…`;

     Medido em Chromium antes da emenda: `?user=<img src=x onerror=alert(1)>`
     EXECUTOU. Injeção de script na origem do aplicativo — a mesma origem que
     guarda a derrota no localStorage e fala com o Supabase.

     E o vetor é o que agrava: a página ensinava o usuário a ESPERAR links
     `?token=…&user=…` chegando por WhatsApp. O ritual de acesso do produto
     era o veículo de entrega do ataque.

     A emenda não foi escapar o parâmetro — foi parar de lê-lo. Código que
     não existe não tem defeito.
     ═══════════════════════════════════════════════════════════════════════ */
  const G = semComentarios(fs16.readFileSync(ROOT + '/assets/js/gatekeeper.js', 'utf8'));

  ok(!/innerHTML/.test(G), 'a vitrine voltou a escrever innerHTML — era por aí que a injeção entrava');
  ok(!/decodeURIComponent/.test(G), 'voltou a decodificar parâmetro de URL para dentro da página');
  ok(!/searchParams\.get|params\.get/.test(G), 'voltou a LER parâmetro da URL');

  /* O portão de mentira inteiro tem de estar fora. */
  ['validateAndRedirect', 'burnToken', 'isTokenUsed', 'grantLinkedInAccess'].forEach(f =>
    ok(!new RegExp(f).test(G), `o portão de mentira sobreviveu: ${f}`));

  /* E nada de localStorage fingindo controlar acesso: a lista de "usados"
     morava no navegador do próprio visitante, que a apagava quando quisesse. */
  ok(!/localStorage/.test(G), 'a vitrine voltou a guardar estado de acesso no navegador do visitante');
});

t(S16, '16.12', 'Link antigo (?token=…) não quebra, não acusa e não fica na barra', () => {
  /* Links no formato antigo continuam circulando em conversas de WhatsApp e
     em capturas de tela. Três coisas não podem acontecer com eles:

       · o visitante NÃO pode ler "Acesso Negado" por um token que nunca foi
         verificado de verdade — seria recusar alguém por um motivo inventado;
       · os parâmetros não podem ser lidos para dentro da página (16.11);
       · não podem ficar na barra de endereço, para não serem recompartilhados
         e não voltarem pelo botão "voltar". */
  const G = semComentarios(fs16.readFileSync(ROOT + '/assets/js/gatekeeper.js', 'utf8'));
  const V = semComentariosHtml(IDX16);

  ok(!/Acesso Negado/i.test(G) && !/Acesso Negado/i.test(V),
     'o visitante ainda pode ser acusado por um token que ninguém validou');
  ok(/replaceState/.test(G), 'os parâmetros antigos não são apagados da barra de endereço');
  ok(/searchParams\.delete\('token'\)/.test(G) && /searchParams\.delete\('user'\)/.test(G),
     'nem todos os parâmetros do link antigo são removidos');
  /* `replaceState` e não `assign`: trocar sem recarregar e sem empilhar
     histórico, senão o botão "voltar" devolve o visitante ao link antigo. */
  ok(!/location\.assign|location\.replace\(/.test(G),
     'a limpeza recarrega a página em vez de trocar o endereço em silêncio');
});

t(S16, '16.9', 'O número de provas anunciado na vitrine é o real', () => {
  // Anunciar "122 provas" e ter 90 é propaganda. Conta as chamadas t(...) do
  // próprio arquivo de provas — a fonte, não uma nota à parte que diverge.
  const suite = fs16.readFileSync(__dirname + '/suite.js', 'utf8');
  const reais = (suite.match(/^t\(S\d+,\s*'/gm) || []).length;
  const m = /(\d{2,4})\s*provas automatizadas/.exec(IDX16);
  ok(m, 'a vitrine não anuncia o número de provas');
  ok(+m[1] === reais, `a vitrine anuncia ${m[1]} provas, mas existem ${reais}`);
  const m2 = /passa por (\d{2,4}) provas/.exec(IDX16);
  ok(!m2 || +m2[1] === reais, `o manual cita ${m2 && m2[1]} provas, mas existem ${reais}`);
  return { detail: reais + ' provas, anunciadas corretamente' };
});

/* ═══════════════════════════════════════════════════════════════════════════
   SUÍTE 17 · Painel de navegação: aplicabilidade a bordo        (v2.3.3)
   Achado de bordo: um HUD com XTE de 0,01 NM e "no rumo" exibindo 628.616 L de
   "perda por desvio" — 23x a distância realmente percorrida. A causa não era o
   cálculo do combustível: era o botão de SIMULAÇÃO ao lado do botão mais usado
   do painel, sem guarda contra estar navegando de verdade.
   ═══════════════════════════════════════════════════════════════════════════ */
const S17 = '17 · Painel de navegação';
const fs17 = require('fs');
const APP17 = fs17.readFileSync(ROOT + '/app.html', 'utf8');
const CSS17 = fs17.readFileSync(ROOT + '/assets/css/app.css', 'utf8');

t(S17, '17.1', 'Fixo real do GPS é ignorado durante a simulação', () => {
  /* Sem esta guarda, o watchPosition e o simulador gravam no MESMO estado e se
     alternam. Como navDistTraveled soma a distância entre fixos consecutivos,
     cada alternância soma o salto inteiro entre a posição real e a fabricada. */
  const i = APP17.indexOf('function onPositionUpdate');
  ok(i > 0, 'onPositionUpdate não existe');
  const corpo = APP17.slice(i, i + 1400);
  const guarda = corpo.indexOf('if (navSimActive) return;');
  const chamada = corpo.indexOf('processFix(');
  ok(guarda > 0, 'onPositionUpdate aceita fixo real durante a simulação');
  ok(guarda < chamada, 'a guarda tem de vir ANTES de processFix, não depois');
});

t(S17, '17.2', 'Simular durante navegação real exige confirmação', () => {
  const i = APP17.indexOf('function toggleSimulation');
  const corpo = APP17.slice(i, i + 2200);
  ok(/if \(navActive\)/.test(corpo), 'o botão não distingue navegação real de planejamento');
  ok(/confirm\(/.test(corpo), 'não há confirmação antes de descartar o GPS real');
  // O aviso tem de nomear as consequências, não só perguntar "tem certeza?".
  ok(/GPS/.test(corpo), 'o aviso não diz que o GPS deixa de ser usado');
  ok(/terra|acompanhando/i.test(corpo), 'o aviso não diz que quem acompanha em terra é afetado');
});

t(S17, '17.3', 'A simulação zera os contadores em vez de misturar milhas', () => {
  const i = APP17.indexOf('function toggleSimulation');
  const corpo = APP17.slice(i, i + 2600);
  ok(/navDistTraveled = 0/.test(corpo), 'milhas reais e simuladas se somariam no mesmo balanço');
  ok(/navAccumFuel = 0/.test(corpo), 'o consumo real e o simulado se somariam');
});

t(S17, '17.4', 'A telemetria declara quando é simulação', () => {
  /* Um espelho que não distingue simulação de realidade não é espelho: é fonte
     de informação falsa para quem confia nela em terra. */
  const i = APP17.indexOf('function broadcastTelemetry');
  const corpo = APP17.slice(i, i + 1800);
  ok(/sim:\s*!!navSimActive/.test(corpo), 'o payload não carrega marca de simulação');
  ok(/p\.sim/.test(APP17), 'o observador não lê a marca de simulação');
});

t(S17, '17.5', 'O observador vê faixa de SIMULAÇÃO, e ela salta aos olhos', () => {
  ok(/id="mirrorSimBanner"/.test(APP17), 'não há faixa de simulação no painel do observador');
  ok(/N[ÃA]O é a posição real/i.test(APP17), 'a faixa não diz que a posição não é real');
  ok(/\.mirror-sim-banner/.test(CSS17), 'a faixa não tem estilo próprio');
  ok(/\.mirror-sim-banner\.active/.test(CSS17), 'a faixa não tem estado visível/oculto');
  // Aparece ANTES de posição, rumo e ETA na leitura: posição fixa no topo.
  const bloco = CSS17.slice(CSS17.indexOf('.mirror-sim-banner'), CSS17.indexOf('.mirror-sim-banner') + 700);
  ok(/position:\s*fixed/.test(bloco) && /top:\s*0/.test(bloco), 'a faixa não fica fixa no topo');
});

t(S17, '17.6', 'Distância percorrida rejeita salto fisicamente impossível', () => {
  /* O critério tem de ser a VELOCIDADE implícita do trecho, não a distância:
     um passo grande com muito tempo entre fixos é navegação; um passo grande em
     um segundo é salto de GPS ou troca de fonte de posição. */
  const i = APP17.indexOf('function processFix');
  const corpo = APP17.slice(i, i + 3000);
  ok(/plausivel/.test(corpo), 'não há filtro de salto na acumulação de distância');
  ok(/segNM \/ dtH/.test(corpo), 'o filtro não usa a velocidade implícita do trecho');
  ok(/navDistTraveled \+= segNM/.test(corpo) && /&& plausivel/.test(corpo),
     'a distância ainda é somada sem passar pelo filtro');
  ok(/navSaltos\+\+/.test(corpo), 'saltos descartados não são contabilizados');
});

t(S17, '17.7', 'Há como zerar a singradura sem encerrar a navegação', () => {
  ok(/function zerarSingradura/.test(APP17), 'não existe forma de zerar os contadores');
  const i = APP17.indexOf('function zerarSingradura');
  const corpo = APP17.slice(i, i + 1400);
  ok(/confirm\(/.test(corpo), 'zerar contadores não pede confirmação');
  ['navDistTraveled = 0', 'navAccumFuel = 0', 'navSaltos = 0'].forEach(c =>
    ok(corpo.includes(c), `zerarSingradura não limpa ${c}`));
  ok(/id="navResetBtn"/.test(APP17), 'o botão de zerar não está na barra');
});

t(S17, '17.8', 'Alvo de toque de passadiço: 44 px', () => {
  /* Mão molhada, navio jogando e às vezes luva. 24 px erra — e o vizinho do 🎯,
     o botão mais usado, era o 🧪 da simulação. */
  const i = CSS17.indexOf('.nav-icon-btn {');
  const bloco = CSS17.slice(i, i + 700);
  const mw = /min-width:\s*(\d+)px/.exec(bloco);
  const mh = /min-height:\s*(\d+)px/.exec(bloco);
  ok(mw && +mw[1] >= 44, `alvo de toque com ${mw ? mw[1] : '?'} px de largura (mínimo 44)`);
  ok(mh && +mh[1] >= 44, `alvo de toque com ${mh ? mh[1] : '?'} px de altura (mínimo 44)`);
});

t(S17, '17.9', 'Estado dos botões por cor, não por transparência', () => {
  /* Sob sol no passadiço, a diferença entre opacity 1,0 e 0,4 num emoji some —
     e o comandante não descobre que o mapa parou de acompanhar o barco. */
  ok(/\.nav-icon-btn\.off/.test(CSS17), 'não há estado "desligado" com marca própria');
  const bloco = CSS17.slice(CSS17.indexOf('.nav-icon-btn.off'), CSS17.indexOf('.nav-icon-btn.off') + 400);
  ok(/box-shadow|background/.test(bloco), 'o estado desligado não muda cor nem moldura');
  ok(!/b\.style\.opacity = navFollow/.test(APP17), 'o 🎯 ainda sinaliza estado por opacidade');
  ok(/function pintarBotoesNav/.test(APP17), 'não há rotina única que reflete o estado dos botões');
});

t(S17, '17.10', 'Som e seguimento sobrevivem ao recarregar', () => {
  /* Estado de segurança não pode ser esquecido a cada recarga: um comandante que
     recarrega e ACHA que o alerta sonoro está ligado é pior que um silencioso. */
  ok(/NAV_PREFS_CHAVE = '[^']+'/.test(APP17), 'não há chave de armazenamento das preferências');
  ok(/localStorage\.setItem\(NAV_PREFS_CHAVE/.test(APP17), 'as preferências não são gravadas');
  ok(/localStorage\.getItem\(NAV_PREFS_CHAVE\)/.test(APP17), 'as preferências não são lidas na volta');
  ok(/try \{[\s\S]{0,200}NAV_PREFS_CHAVE/.test(APP17),
     'o acesso ao armazenamento precisa tolerar aparelho que o bloqueia');

  /* E o estado tem de ser PINTADO mesmo quando o mapa não carrega. O Leaflet vem
     de CDN; a bordo, sem sinal, initMap() falha e uma exceção ali matava o resto
     do bloco de inicialização. O sintoma era o pior possível: preferências lidas
     (alertas silenciados) e botão mostrando 🔊 — comandante confiando num ícone
     que mente sobre o alerta de farol. */
  const bloco = APP17.slice(APP17.indexOf("addEventListener('DOMContentLoaded'"), APP17.indexOf("addEventListener('DOMContentLoaded'") + 1600);
  const iPinta = bloco.indexOf('pintarBotoesNav()');
  const iMapa = bloco.indexOf('initMap()');
  ok(iPinta > 0 && iMapa > 0, 'inicialização não chama pintarBotoesNav ou initMap');
  ok(iPinta < iMapa,
     'pintarBotoesNav() vem DEPOIS de initMap(): se o mapa falhar, o botão de som mente');
});

t(S17, '17.11', 'Todo botão da barra tem rótulo e ação declarados', () => {
  // Fatia o CABEÇALHO inteiro, não o trecho entre dois ids: o ▾ de recolher
  // mudou de lugar (saiu da fileira de ferramentas para junto do título) e um
  // recorte por id quebra ao primeiro rearranjo de marcação.
  const ini = APP17.indexOf('class="nav-hud-header"');
  const fim = APP17.indexOf('class="nav-hud-body"');
  ok(ini > 0 && fim > ini, 'cabeçalho da barra de navegação não encontrado');
  const barra = APP17.slice(ini, fim);
  const botoes = barra.match(/<button[^>]*class="nav-icon-btn"[^>]*>/g) || [];
  ok(botoes.length >= 8, `o cabeçalho tem ${botoes.length} botões — esperados ao menos 8`);
  const semTitulo = botoes.filter(b => !/title="/.test(b));
  ok(semTitulo.length === 0, `${semTitulo.length} botão(ões) sem title — ninguém adivinha o ícone`);
  // Todo botão com ação precisa impedir que o toque recolha o painel inteiro.
  const comAcao = botoes.filter(b => /onclick=/.test(b));
  const semStop = comAcao.filter(b => !/event\.stopPropagation\(\)/.test(b));
  ok(semStop.length === 0, `${semStop.length} botão(ões) recolheriam o painel ao serem tocados`);
  return { detail: `${botoes.length} botões, ${comAcao.length} com ação` };
});

/* ═══════════════════════════════════════════════════════════════════════════
   SUÍTE 18 · Faróis no globo 3D                                   (v2.6.0)

   O modo Earth mostrava o rebocador e a rota sobre o terreno do Google, e mais
   nada. Ora — a Lista de Faróis DH2 é o coração deste programa: 98 luzes com
   posição, altitude do foco, característica e alcance. Deixá-las de fora do
   globo era mostrar o mar sem os olhos que o vigiam.

   POR QUE ESTA SUÍTE EXISTE COM ESTA FORMA. Esta bancada NÃO alcança o Cesium
   ion nem os ladrilhos do Google — não há como renderizar e conferir com os
   olhos. A resposta não foi "então não se testa": foi separar a DESCRIÇÃO do
   farol (altura, alcance, cor, rótulo — aritmética pura) do DESENHO (chamadas
   ao Cesium). A descrição é provada aqui, número a número; ao Cesium sobra
   transcrever. É a mesma disciplina de bordo: o cálculo de estabilidade se
   confere na mesa antes de se confiar no navio.
   ═══════════════════════════════════════════════════════════════════════════ */
const S18 = '18 · Faróis no globo 3D';
const { corDaLuz, farolEarthSpec } = A;
const fs18 = require('fs');
const APP18 = fs18.readFileSync(ROOT + '/app.html', 'utf8');
const CSS18 = fs18.readFileSync(ROOT + '/assets/css/app.css', 'utf8');
const S3D18 = fs18.readFileSync(ROOT + '/assets/js/ship3d.js', 'utf8');

t(S18, '18.1', 'A cor no globo é a cor da LUZ, lida da característica', () => {
  /* Na ponte, a cor não é enfeite: é o primeiro dado que identifica a luz.
     A letra vem isolada na característica — "Fl W 10s", "Oc(2) R 6s". */
  ok(corDaLuz('Fl R 5s').nome === 'vermelha', 'R não virou vermelha');
  ok(corDaLuz('Oc(2) G 6s').nome === 'verde', 'G não virou verde');
  ok(corDaLuz('Fl Y 4s').nome === 'amarela', 'Y não virou amarela');
  ok(corDaLuz('Fl W 10s').nome === 'branca', 'W não virou branca');
  ok(corDaLuz('Fl(3)R 15s').nome === 'vermelha', 'sem espaço após o parêntese a cor se perde');
  // O que NÃO pode acontecer: pegar a letra de dentro de outra palavra.
  ok(corDaLuz('LFl W 30s').nome === 'branca', 'a G de "Fl" ou letra interna virou cor');
  ok(corDaLuz('').nome === 'branca', 'sem característica o padrão tem de ser branca');
  ok(corDaLuz(null).nome === 'branca', 'característica nula quebrou a leitura');
  const cores = {};
  lighthouses.forEach(l => { const n = corDaLuz(l.character).nome; cores[n] = (cores[n] || 0) + 1; });
  return { detail: Object.entries(cores).map(([k, v]) => `${v} ${k}(s)`).join(', ') };
});

t(S18, '18.2', 'A coluna sobe até a ALTITUDE DO FOCO, não até o topo da torre', () => {
  /* Distinção que a Lista de Faróis faz e o desenho tem de respeitar: quem
     manda no alcance geográfico é a altura da LUZ acima do nível do mar.
     Desenhar a torre inteira mentiria sobre o alcance. */
  let piores = [];
  for (const lh of lighthouses) {
    const f = farolEarthSpec(lh);
    if (f.focoM !== Math.max(1, Number(lh.altitude) || 1)) piores.push(lh.id);
    if (!isFinite(f.focoM) || f.focoM <= 0) piores.push(lh.id + '(inválido)');
  }
  ok(piores.length === 0, `${piores.length} farol(óis) com foco errado: ${piores.slice(0, 3)}`);
  const alt = lighthouses.map(l => farolEarthSpec(l).focoM);
  return { detail: `foco entre ${Math.min(...alt)} m e ${Math.max(...alt)} m` };
});

t(S18, '18.3', 'O círculo nunca promete mais do que o horizonte permite', () => {
  /* alcanceM = MENOR(alcance luminoso, alcance geográfico) x 1852.
     Um farol de 46 NM luminosos visto de um bote não se enxerga a 46 NM: a
     curvatura da Terra o esconde antes. Desenhar 46 NM seria convidar a
     confiar numa luz que não vai aparecer. */
  const mentirosos = lighthouses.filter(lh => {
    const f = farolEarthSpec(lh);
    const geo = calculateVisibility(lh.altitude);
    return f.alcanceNM > geo + 1e-9;
  });
  ok(mentirosos.length === 0, `${mentirosos.length} círculo(s) além do horizonte`);
  // E a conversão para metros é a milha náutica exata, não 1800 nem 2000.
  const f0 = farolEarthSpec(lighthouses[0]);
  eq(f0.alcanceM, f0.alcanceNM * 1852, 1e-6, 'milha náutica errada no raio');
  return { detail: `${lighthouses.length} círculos dentro do horizonte` };
});

t(S18, '18.4', 'O círculo é do OBSERVADOR: sobe a ponte, cresce o alcance', () => {
  /* Esta é a parte que um mapa estático não faz. O alcance geográfico depende
     de DUAS alturas — a do foco e a do olho: d = 2,08 · (√h₁ + √h₂). O mesmo
     farol alcança mais visto do passadiço de um AHTS que da capa de um bote.
     Prova: com o olho a 1 m, dezenas de luzes passam a ser limitadas pelo
     horizonte; com o olho na altura normal, voltam a valer o alcance luminoso. */
  setTrip({ eyeHeight: 1 });
  const baixo = lighthouses.map(l => farolEarthSpec(l).alcanceNM);
  setTrip({ eyeHeight: 30 });
  const alto = lighthouses.map(l => farolEarthSpec(l).alcanceNM);
  setTrip(null);
  const cresceram = baixo.filter((v, i) => alto[i] > v + 1e-9).length;
  ok(cresceram > 0, 'a altura do olho não muda nada — o círculo não é do observador');
  const encolheu = baixo.filter((v, i) => alto[i] < v - 1e-9).length;
  ok(encolheu === 0, `${encolheu} farol(óis) ENCOLHERAM ao subir o olho — sinal trocado`);
  return { detail: `${cresceram} de ${lighthouses.length} faróis alcançam mais do passadiço alto` };
});

t(S18, '18.5', 'Todo farol vira uma descrição completa e desenhável', () => {
  const ruins = [];
  for (const lh of lighthouses) {
    const f = farolEarthSpec(lh);
    if (!isFinite(f.lat) || !isFinite(f.lng)) ruins.push(f.id + ':coord');
    if (f.lat < -35.5 || f.lat > 6.5 || f.lng < -56 || f.lng > -28) ruins.push(f.id + ':fora do Brasil');
    if (!isFinite(f.alcanceM) || f.alcanceM <= 0) ruins.push(f.id + ':alcance');
    if (!/^#[0-9A-Fa-f]{6}$/.test(f.cor)) ruins.push(f.id + ':cor');
    // O rótulo tem de dizer o que a carta diria: nome, característica, alcance.
    if (!f.rotulo.includes(lh.name)) ruins.push(f.id + ':rótulo sem nome');
    if (!/NM/.test(f.rotulo)) ruins.push(f.id + ':rótulo sem alcance');
  }
  ok(ruins.length === 0, `${ruins.length} descrição(ões) inválida(s): ${ruins.slice(0, 3)}`);
  return { detail: `${lighthouses.length} faróis descritos sem falha` };
});

t(S18, '18.6', 'O globo não vira sopa de rótulos: há corte por distância', () => {
  /* 98 nomes e 98 círculos desenhados o tempo todo deixariam o globo ilegível
     no zoom out — exatamente quando o navegador quer ver a costa inteira.
     Rótulo só de perto, círculo de média distância, coluna sempre. */
  const i = S3D18.indexOf('function updateCesiumLighthouses');
  ok(i > 0, 'updateCesiumLighthouses não existe');
  const corpo = S3D18.slice(i, S3D18.indexOf('function toggleCesiumLighthouses'));
  const cortes = (corpo.match(/DistanceDisplayCondition/g) || []).length;
  ok(cortes >= 2, `apenas ${cortes} corte(s) por distância — rótulo e círculo precisam de um cada`);
  ok(/label:/.test(corpo) && /ellipse:/.test(corpo) && /cylinder:/.test(corpo),
     'faltou um dos três elementos: coluna, luz/rótulo, círculo de alcance');
  return { detail: `${cortes} cortes por distância` };
});

t(S18, '18.7', 'Redesenhar não acumula entidades no globo', () => {
  /* Ligar e desligar os faróis dez vezes não pode deixar 2.940 entidades
     empilhadas. O mesmo motivo do dispose() dos cascos: o WebGL não tem
     faxineiro. Quem cria, remove. */
  const i = S3D18.indexOf('function updateCesiumLighthouses');
  const corpo = S3D18.slice(i, S3D18.indexOf('function toggleCesiumLighthouses'));
  const remove = corpo.indexOf('entities.remove');
  const add = corpo.indexOf('entities.add');
  ok(remove > 0, 'nada é removido antes de redesenhar — vazamento de entidades');
  ok(remove < add, 'a remoção tem de vir ANTES da criação, não depois');
  ok(/cesiumFarolEntities = \[\]/.test(corpo), 'a lista de entidades não é zerada');
  // E o desligado sai cedo, sem desenhar nada.
  ok(/if \(!cesiumFaroisVisiveis\) return;/.test(corpo), 'desligado ainda desenharia');
});

t(S18, '18.8', 'A escolha de ver ou não os faróis sobrevive ao recarregar', () => {
  /* Quem desliga é porque quer o globo limpo. Voltar tudo aceso a cada abertura
     é obrigar o comandante a repetir a mesma decisão toda vez. */
  ok(/localStorage\.setItem\('cnb_farois_earth'/.test(S3D18), 'a escolha não é gravada');
  ok(/localStorage\.getItem\('cnb_farois_earth'/.test(S3D18), 'a escolha não é lida na abertura');
  const iE = S3D18.indexOf('async function ensureCesium');
  const corpoE = S3D18.slice(iE, iE + 4000);
  const leitura = corpoE.indexOf("getItem('cnb_farois_earth'");
  const desenho = corpoE.indexOf('updateCesiumLighthouses()');
  ok(leitura > 0 && desenho > leitura, 'a preferência é lida DEPOIS de desenhar — abre errado');
});

t(S18, '18.9', 'O botão 💡 existe, é alcançável pelo dedo e está ligado à ação', () => {
  const i = APP18.indexOf('id="ship3dModal"');
  const fim = APP18.indexOf('class="ship3d-view"');
  ok(i > 0 && fim > i, 'painel 3D não encontrado');
  const cab = APP18.slice(i, fim);
  const btn = /<button[^>]*id="s3dFaroisBtn"[^>]*>/.exec(cab);
  ok(btn, 'o botão dos faróis não existe no cabeçalho do painel 3D');
  ok(/class="nav-icon-btn"/.test(btn[0]), 'o botão não usa o alvo de 44 px do passadiço');
  ok(/title="/.test(btn[0]), 'botão sem title — ninguém adivinha um 💡');
  ok(/onclick="toggleCesiumLighthouses\(\)"/.test(btn[0]), 'o botão não chama a ação');
  // Em Atitude não há globo: um botão inerte na tela confunde mais que ajuda.
  ok(/\.ship3d-overlay:not\(\.earth\) #s3dFaroisBtn\s*\{\s*display:\s*none/.test(CSS18),
     'o 💡 continua visível na vista de Atitude, onde não faz nada');
});

t(S18, '18.10', 'A fileira do cabeçalho 3D quebra linha em vez de espremer', () => {
  /* HONESTIDADE SOBRE O QUE ESTA PROVA GARANTE. A lição veio da v2.4.2, onde
     um botão a mais numa fileira rígida CORTOU o 🚢. Aqui o defeito não é o
     mesmo, e foi medido: este cabeçalho ocupa a largura inteira da tela e tem
     itens que encolhem (título e seletor), então o excesso vira APERTO, não
     recorte — a 320 px o seletor de casco caía de 108 px para 94 px com a
     fileira rígida, e "ASD 2810 “SAAM Aguia”" não cabe em 94 px.

     Portanto: esta prova não impede um corte (não havia corte a impedir); ela
     mantém a fileira capaz de quebrar linha, que é o que devolveu os 108 px e
     o que segura o PRÓXIMO botão. A medida real está na prova de fumaça, em
     navegador de verdade, a 320/375/768 px. */
  const i = CSS18.indexOf('.ship3d-header {');
  ok(i > 0, '.ship3d-header não encontrado');
  const bloco = CSS18.slice(i, CSS18.indexOf('}', i));
  ok(/flex-wrap:\s*wrap/.test(bloco), '.ship3d-header não quebra linha — o seletor volta a ser espremido');
  const j = CSS18.indexOf('.ship3d-actions {');
  const blocoA = CSS18.slice(j, CSS18.indexOf('}', j));
  ok(/flex-wrap:\s*wrap/.test(blocoA), '.ship3d-actions não quebra linha');
  // O título encolhe com base pequena para não empurrar a fileira para baixo.
  const k = CSS18.indexOf('.ship3d-title {');
  const blocoT = CSS18.slice(k, CSS18.indexOf('}', k));
  ok(/flex:\s*1\s+1\s+\d+px/.test(blocoT), 'o título não tem base de encolhimento');
  ok(/text-overflow:\s*ellipsis/.test(blocoT), 'nome comprido de embarcação não vira reticências');
});

/* ═══════════════════════════════════════════════════════════════════════════
   SUÍTE 19 · IARA — assistente de viagem por voz (Sprint 0)        (v2.7.0)

   POR QUE ESTA SUÍTE EXISTE COM ESTA FORMA. Esta bancada não tem microfone,
   não tem alto-falante e não tem nenhuma voz instalada — `speechSynthesis`
   simplesmente não existe aqui. A resposta não foi "então não se testa": foi
   separar a DECISÃO do EFEITO. Qual voz escolher, que estado mostrar, falar
   ou calar, o que descartar — tudo isso é aritmética e regra, e é provado
   aqui. Ao navegador sobra emitir o som.

   É a mesma disciplina do farolEarthSpec() na v2.6.0, e pelo mesmo motivo: o
   cálculo se confere na mesa antes de se confiar no navio.
   ═══════════════════════════════════════════════════════════════════════════ */
const S19 = '19 · Iara (voz)';
const { escolherVoz, visualIara, emManobra, podeFalar, enfileirarFala,
        limparVencidas, textoApresentacao, violaRegra6, duracaoFaladaS,
        IARA_NOME, IARA_VALIDADE_MS, IARA_ROT_LIMITE, IARA_TETO_S } = A;
const fs19 = require('fs');
const APP19 = fs19.readFileSync(ROOT + '/app.html', 'utf8');
const CSS19 = fs19.readFileSync(ROOT + '/assets/css/app.css', 'utf8');
const IARA19 = fs19.readFileSync(ROOT + '/assets/js/iara.js', 'utf8');

/* Fábrica de vozes falsas, no formato do SpeechSynthesisVoice. */
const voz = (name, lang, localService, def) =>
  ({ name, lang, localService: !!localService, default: !!def, voiceURI: name });

t(S19, '19.1', 'A voz preferida é a que FALA NO MAR — local vence remota bonita', () => {
  /* A decisão mais importante desta função, e ela é operacional, não estética.
     Uma voz "de nuvem" soa melhor no cais e EMUDECE a 30 NM da costa, que é
     exatamente onde a Iara importa. Entre uma voz feminina remota e uma comum
     local, a escolha de bordo é a que continua falando sem sinal. */
  const escolhida = escolherVoz([
    voz('Luciana (Premium)', 'pt-BR', false),      // feminina, linda, REMOTA
    voz('pt-br-x-pte-local', 'pt-BR', true)        // comum, mas LOCAL
  ]);
  ok(escolhida.localService === true,
     `escolheu a voz remota "${escolhida.name}" — ela cala quando a costa some`);
});

t(S19, '19.2', 'Nunca escolhe voz de outra língua, nem na falta de pt-BR', () => {
  /* Um assistente de bordo que se apresenta em inglês com sotaque americano
     lendo "Cabo Frio" não é um defeito cosmético: os nomes de farol e de porto
     ficam irreconhecíveis, e o relatório perde a utilidade inteira. */
  ok(escolherVoz([voz('Samantha', 'en-US', true, true), voz('Daniel', 'en-GB', true)]) === null,
     'escolheu voz estrangeira em vez de admitir que não há pt');
  ok(escolherVoz([]) === null, 'lista vazia devia devolver null');
  ok(escolherVoz(null) === null, 'lista nula quebrou a escolha');
  // pt-PT serve de recuo, mas perde para pt-BR.
  const br = escolherVoz([voz('Joana', 'pt-PT', true), voz('Maria', 'pt-BR', true)]);
  ok(br.lang === 'pt-BR', `preferiu ${br.lang} a pt-BR`);
});

t(S19, '19.3', 'Entre iguais, escolhe a feminina — foi o que se pediu', () => {
  const e = escolherVoz([voz('Ricardo', 'pt-BR', true), voz('Francisca', 'pt-BR', true)]);
  ok(/Francisca/.test(e.name), `escolheu "${e.name}" em vez da voz feminina`);
  // O código curto do Google Android ("afs" = female, "ams" = male) também conta.
  const g = escolherVoz([voz('pt-br-x-ams#male_1-local', 'pt-BR', true),
                         voz('pt-br-x-afs#female_1-local', 'pt-BR', true)]);
  ok(/afs|female/.test(g.name), `escolheu "${g.name}" — não leu o código de gênero do Android`);
});

t(S19, '19.4', 'O gosto de quem ouve oito horas vence a minha heurística', () => {
  const manual = escolherVoz([voz('Francisca', 'pt-BR', true), voz('Ricardo', 'pt-BR', true)], 'Ricardo');
  ok(manual.name === 'Ricardo', 'a escolha manual do usuário foi ignorada');
});

t(S19, '19.5', 'Os estados do microfone são distinguíveis por TRÊS canais', () => {
  /* Ícone, classe (cor+moldura) e aria. Três porque um vai falhar: o ícone
     some sob reflexo, a cor lava no sol, a moldura desaparece para quem tem
     daltonismo. Se dois estados compartilham qualquer canal, o canal não
     distingue nada. */
  const estados = ['off', 'ouvindo', 'processando', 'respondendo'];
  const vs = estados.map(e => visualIara(e, false)).concat([visualIara('off', true)]);
  for (const campo of ['icone', 'classe', 'aria']) {
    const vistos = new Set(vs.map(v => v[campo]));
    ok(vistos.size === vs.length,
       `dois estados compartilham o mesmo "${campo}" — ${vs.length - vistos.size} colisão(ões)`);
  }
  /* E o aria tem de DIZER se o microfone está aberto. Um dia alguém vai operar
     isto com a tela apagada para poupar bateria, e "ouvindo" precisa ser
     inequívoco em palavras, não só em vermelho. */
  ok(/ABERTO/.test(visualIara('ouvindo', false).aria), 'o estado "ouvindo" não diz que o microfone está ABERTO');
  ['off', 'processando', 'respondendo'].forEach(e =>
    ok(/FECHADO|fechado/.test(visualIara(e, false).aria), `o estado "${e}" não afirma que o microfone está fechado`));
  ok(/fechado/i.test(visualIara('off', true).aria), 'muda não afirma microfone fechado');
});

t(S19, '19.6', 'Manobra cala a Iara: guinada e chegada a waypoint', () => {
  /* Não existe sensor de "manobra"; existem dois sintomas. Um ASD guina rápido
     — é para isso que os azimutais servem — e quem está no leme nessa hora não
     quer ouvir consumo acumulado. */
  /* VALORES ABSOLUTOS, DE PROPÓSITO. A primeira versão desta prova usava
     `IARA_ROT_LIMITE + 1` como entrada — ou seja, a entrada andava junto com a
     constante sob prova, e afrouxar o limiar para 999°/min passava despercebido.
     Prova que se move com o defeito não é prova. 15°/min é manobra num
     rebocador, ponto final, independente de como a constante esteja hoje. */
  ok(emManobra({ rotGrausMin: 15 }).manobra, 'guinada de 15°/min não calou a Iara');
  ok(emManobra({ rotGrausMin: -20 }).manobra, 'guinada de 20°/min a bombordo não calou (erro de sinal)');
  ok(IARA_ROT_LIMITE >= 5 && IARA_ROT_LIMITE <= 15,
     `limiar de guinada em ${IARA_ROT_LIMITE}°/min está fora da faixa defensável (5 a 15)`);
  ok(!emManobra({ rotGrausMin: 2 }).manobra, 'derrota estável foi tomada por manobra');
  ok(emManobra({ distProxWpNM: 0.2 }).manobra, 'chegada ao waypoint não calou');
  ok(!emManobra({ distProxWpNM: 4 }).manobra, '4 NM do waypoint não é manobra');
  ok(!emManobra({}).manobra && !emManobra(null).manobra, 'contexto vazio virou manobra');
});

t(S19, '19.7', 'REGRA 1 — o mudo é soberano, e DESCARTA em vez de guardar', () => {
  /* Cala até a emergência: quem mandou calar tem motivo, e o motivo pode ser o
     VHF chamando. E descarta em vez de enfileirar, porque desmudar depois de
     uma hora não pode despejar doze relatórios velhos de uma vez na cara de
     quem acabou de voltar à ponte. */
  for (const p of ['rotina', 'evento', 'resposta', 'critica']) {
    const d = podeFalar({ muda: true, prioridade: p });
    ok(d.acao === 'descartar', `prioridade "${p}" furou o mudo com acao=${d.acao}`);
  }
});

t(S19, '19.8', 'REGRAS 2,3,4 — alarme, manobra e a própria voz enfileiram', () => {
  ok(podeFalar({ alertaAtivo: true }).acao === 'enfileirar', 'falaria por cima do alarme do app');
  ok(podeFalar({ falando: true }).acao === 'enfileirar', 'interromperia a si mesma');
  ok(podeFalar({ manobrando: true }).acao === 'enfileirar', 'falaria durante a manobra');
  // Segurança fura manobra — mas não fura alarme nem mudo.
  ok(podeFalar({ manobrando: true, prioridade: 'critica' }).acao === 'falar',
     'um aviso CRÍTICO ficou preso na manobra');
  ok(podeFalar({ alertaAtivo: true, prioridade: 'critica' }).acao === 'enfileirar',
     'o crítico atropelou o alarme do app — dois sons ao mesmo tempo não se entende');
  ok(podeFalar({}).acao === 'falar', 'com tudo livre ela não falaria');
});

t(S19, '19.9', 'REGRA 5 — relatório velho não é atrasado, é ERRADO', () => {
  /* A 10 nós o barco anda 3,3 NM em 20 minutos. Dizer "faltam 4 milhas" quando
     faltam 0,7 é pior que ficar calado: é induzir a erro com a voz mansa de
     quem tem certeza. */
  ok(podeFalar({ venceEm: -1 }).acao === 'descartar', 'diria uma fala já vencida');
  ok(podeFalar({ venceEm: 30000 }).acao === 'falar', 'descartou fala ainda válida');
  // E a limpeza da fila faz o mesmo.
  const agora = 1000000;
  const fila = [
    { texto: 'velha', prioridade: 'rotina', nascidaEm: agora - IARA_VALIDADE_MS.rotina - 1 },
    { texto: 'nova', prioridade: 'rotina', nascidaEm: agora - 1000 }
  ];
  const limpa = limparVencidas(fila, agora);
  ok(limpa.length === 1 && limpa[0].texto === 'nova', `sobrou ${limpa.length}, esperado só a nova`);
  // Rotina vence mais rápido que evento: o próximo relatório vem logo.
  ok(IARA_VALIDADE_MS.rotina < IARA_VALIDADE_MS.critica, 'rotina dura mais que o crítico');
  ok(IARA_VALIDADE_MS.resposta < IARA_VALIDADE_MS.rotina,
     'resposta a pergunta dura mais que relatório — se demorou, o comandante já resolveu sozinho');
});

t(S19, '19.10', 'A fila põe a RESPOSTA na frente do relatório', () => {
  /* O comandante acabou de apertar o botão e falar. Se ele espera e ouve um
     relatório de waypoint em vez da resposta, conclui — com razão — que a Iara
     não o escutou. Confiança numa ponte se perde uma vez só. */
  let f = [];
  f = enfileirarFala(f, { texto: 'rotina', prioridade: 'rotina', nascidaEm: 1 });
  f = enfileirarFala(f, { texto: 'evento', prioridade: 'evento', nascidaEm: 2 });
  f = enfileirarFala(f, { texto: 'resposta', prioridade: 'resposta', nascidaEm: 3 });
  f = enfileirarFala(f, { texto: 'critica', prioridade: 'critica', nascidaEm: 4 });
  const ordem = f.map(x => x.texto).join(',');
  ok(ordem === 'critica,resposta,evento,rotina', 'ordem da fila errada: ' + ordem);
  // Empate de prioridade resolve por chegada, não por sorteio.
  let g = enfileirarFala([], { texto: 'b', prioridade: 'rotina', nascidaEm: 20 });
  g = enfileirarFala(g, { texto: 'a', prioridade: 'rotina', nascidaEm: 10 });
  ok(g[0].texto === 'a', 'empate de prioridade não respeitou a ordem de chegada');
});

t(S19, '19.11', 'REGRA 6 — a Iara SUGERE, nunca manda no navio', () => {
  /* Uma voz feminina, simpática e segura é MUITO convincente. Se ela disser
     "reduza para mil e duzentas rotações", alguém reduz sem pensar. E a Iara
     não enxerga o tráfego, não sente o cabo, não sabe que o rebocado está
     guinando. O imperativo fica para quem está no leme. */
  ok(violaRegra6('Reduza para 1200 rotações').length > 0, 'a prova não pega um imperativo óbvio');
  ok(violaRegra6('Dá pra fazer o ETA com 1.480 rotações, se quiser').length === 0,
     'a prova acusa uma sugestão legítima');
  /* E agora o corpo de texto REAL da Iara. ATENÇÃO AO QUE SE VARRE: a primeira
     versão desta prova casava qualquer trecho entre aspas do arquivo e engolia
     COMENTÁRIOS e a própria lista de imperativos proibidos — ficava verde ou
     vermelha por motivo errado, que é pior que não existir. Agora tira os
     comentários, tira a declaração da lista, e varre só o que a Iara DIZ:
     os argumentos de iaraDizer() e o texto da apresentação. */
  /* TODOS OS MÓDULOS QUE PRODUZEM FALA, e não só este.

     A mutação denunciou: plantar "reduza a rotação" em consumo.js passava
     limpo, porque esta varredura só olhava iara.js — o arquivo onde a regra
     nasceu. Mas a Iara hoje fala textos gerados em quatro módulos, e uma
     regra que vigia um arquivo não é uma regra, é um hábito local.

     A lição é a mesma do orçamento de fala: o que vale para a Iara vale para
     TUDO que sai pela boca dela, venha do módulo que vier. */
  const FONTES_DE_FALA = ['assets/js/iara.js', 'assets/js/relatorio_voz.js',
                          'assets/js/tempo.js', 'assets/js/consumo.js',
                          'assets/js/conversa.js'];
  const bruto = FONTES_DE_FALA.map(f => fs19.readFileSync(ROOT + '/' + f, 'utf8')).join('\n');
  const semComentario = bruto.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
  const semLista = semComentario.replace(/const IARA_IMPERATIVOS_PROIBIDOS = \[[\s\S]*?\];/, ' ');
  /* Casar só `iaraDizer(<literal>` perderia as falas dentro de um ternário —
     e é justamente lá que mora a mensagem de "estou sem internet". Então
     varre-se TODO literal em prosa (4 palavras ou mais) do arquivo já limpo.
     Pegar de lambuja um console.warn não faz mal: ele também não pode mandar
     no navio. */
  const falas = (semLista.match(/(?:`[^`]*`|'[^']*')/g) || [])
    .filter(f => f.slice(1, -1).trim().split(/\s+/).length >= 4)
    .concat([textoApresentacao()]);
  ok(falas.length >= 25, `só ${falas.length} fala(s) nos ${FONTES_DE_FALA.length} módulos — a varredura encolheu`);
  const sujas = falas.filter(f => violaRegra6(f).length > 0);
  ok(sujas.length === 0, `${sujas.length} fala(s) mandam no navio: ${sujas.slice(0, 2)}`);
  ok(violaRegra6(textoApresentacao()).length === 0, 'a própria apresentação manda no navio');
});

t(S19, '19.12', 'A apresentação diz as três coisas que não podem faltar', () => {
  const t0 = textoApresentacao();
  // 1. QUEM ELA É — consultora e especialista, não leitora de números. É o que
  //    autoriza o comandante a perguntar coisas técnicas.
  ok(/especialista|consultora/i.test(t0), 'não se apresenta como especialista em navegação');
  ok(new RegExp(IARA_NOME, 'i').test(t0), 'não diz o próprio nome');
  // 2. QUEM DECIDE — dita em voz alta, na primeira frase que ela diz na vida.
  ok(/quem decide é você|você.{0,12}decide/i.test(t0), 'não estabelece que quem decide é o comandante');
  // 3. O CONTRATO DO MICROFONE — privacidade anunciada em voz alta vale mais
  //    que privacidade escrita em rodapé que ninguém lê.
  ok(/só escuto quando/i.test(t0), 'não anuncia que o microfone só abre quando chamado');
  ok(/mudo/i.test(t0), 'não diz como calá-la');
  ok(/hora em hora/i.test(t0) && /waypoint/i.test(t0), 'não explica os relatórios automáticos');
  /* E TEM TETO. A primeira versão desta apresentação tinha 42 segundos falados
     — ninguém numa ponte quer parágrafo, e foi esta prova que denunciou. */
  const seg = duracaoFaladaS(t0);
  ok(seg <= IARA_TETO_S.apresentacao,
     `a apresentação leva ${seg.toFixed(0)} s — o teto é ${IARA_TETO_S.apresentacao} s`);
  return { detail: `${t0.length} caracteres, ~${seg.toFixed(0)} s falados` };
});

t(S19, '19.13', 'O botão da Iara existe, é alcançável e NÃO usa onclick inline', () => {
  const i = APP19.indexOf('class="nav-hud-header"');
  const fim = APP19.indexOf('class="nav-hud-body"');
  const barra = APP19.slice(i, fim);
  const btn = /<button[^>]*id="iaraBtn"[^>]*>/.exec(barra);
  ok(btn, 'o botão da Iara não está no cabeçalho da navegação');
  ok(/class="nav-icon-btn/.test(btn[0]), 'não usa o alvo de 44 px do passadiço');
  ok(/title="/.test(btn[0]), 'sem title');
  ok(/aria-label="/.test(btn[0]), 'sem aria-label — quem usa leitor de tela fica sem saber do microfone');
  /* CSP: o aviso 9.7 conta 58 atributos onclick=, e são eles que obrigam a
     script-src a aceitar 'unsafe-inline'. Código novo não aumenta a dívida. */
  ok(!/onclick=/.test(btn[0]), 'o botão novo usa onclick inline e piora a CSP');
  ok(/addEventListener\('click'/.test(IARA19), 'a ligação por evento não existe');
  ok(/stopPropagation/.test(IARA19),
     'sem stopPropagation, perguntar à Iara RECOLHE o painel na cara do comandante');
});

t(S19, '19.14', 'A Iara nasce antes do mapa (a lição da prova 17.10)', () => {
  /* O initMap() depende do Leaflet vindo de CDN; quando a CDN falha ele estoura
     e leva embora o resto do DOMContentLoaded. Botão de microfone nascido morto
     por causa de um mapa que não carregou é defeito que já aconteceu neste
     arquivo, com outro botão. */
  /* Comparar contra o PRIMEIRO 'initMap()' do arquivo casava com a DEFINIÇÃO
     da função, lá em cima — a prova ficava verde com a ordem invertida. O que
     importa é a ordem das CHAMADAS dentro do arranque, então recorta-se o
     arranque primeiro. */
  const bruto = APP19.slice(APP19.indexOf("pintarBotoesNav();   // reflete as preferências"));
  /* E TIRA OS COMENTÁRIOS. Terceira vez nesta suíte que texto de comentário
     entra numa varredura e responde por código: aqui era o MEU PRÓPRIO
     comentário — "o initMap() depende do Leaflet" — que aparece antes da
     chamada real e invertia a ordem medida. Varredura de código lê código. */
  const arranque = bruto.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
  ok(arranque.length > 100, 'bloco de arranque não encontrado');
  const ini = arranque.indexOf('iaraInit()');
  const mapa = arranque.indexOf('initMap()');
  ok(ini >= 0, 'iaraInit() nunca é chamada no arranque');
  ok(mapa >= 0, 'initMap() não foi encontrada no arranque');
  ok(ini < mapa, 'a Iara é inicializada DEPOIS do mapa — some se a CDN do Leaflet falhar');
});

t(S19, '19.15', 'Estado do microfone por cor e moldura, nunca por transparência', () => {
  /* Sob sol de passadiço, opacidade 0,4 e 1,0 são a mesma coisa. E aqui o custo
     de errar é maior que num botão comum: "o microfone está aberto" não pode
     ficar ambíguo. */
  for (const cls of ['iara-off', 'iara-ouvindo', 'iara-processando', 'iara-respondendo', 'iara-muda']) {
    const i = CSS19.indexOf('.nav-icon-btn.' + cls + ' {');
    ok(i > 0, `falta a regra CSS de .${cls}`);
    const bloco = CSS19.slice(i, CSS19.indexOf('}', i));
    ok(/box-shadow:\s*inset/.test(bloco), `.${cls} não tem moldura própria`);
    ok(/background:/.test(bloco), `.${cls} não tem fundo próprio`);
    ok(!/opacity:/.test(bloco), `.${cls} sinaliza estado por transparência — some no sol`);
  }
  // Movimento só no OUVINDO: é o que o olho periférico capta sem a cabeça virar.
  ok(/\.nav-icon-btn\.iara-ouvindo[^}]*animation:/.test(CSS19), 'o microfone aberto não pulsa');
  ok(/prefers-reduced-motion[\s\S]{0,200}iara-ouvindo[^}]*animation:\s*none/.test(CSS19),
     'ignora quem pediu menos movimento no sistema');
});

t(S19, '19.16', 'O relatório automático NÃO depende de ouvir — a regra estrutural', () => {
  /* Verificado antes de escrever o módulo: falar usa vozes do APARELHO e
     funciona offline; ouvir manda áudio à NUVEM e morre sem sinal. A 30 NM da
     costa não há 4G. Logo o caminho da fala automática não pode encostar em
     reconhecimento — e quando o reconhecimento falhar por rede, ela tem de
     DIZER isso, não fingir que não entendeu. */
  const iDizer = IARA19.indexOf('function iaraDizer');
  const iEmitir = IARA19.indexOf('function iaraEmitir');
  const iDrenar = IARA19.indexOf('function iaraDrenarFila');
  ok(iDizer > 0 && iEmitir > 0 && iDrenar > 0, 'o caminho da fala automática não existe');
  const caminho = [[iDizer, 'iaraDizer'], [iEmitir, 'iaraEmitir'], [iDrenar, 'iaraDrenarFila']];
  for (const [ini, nome] of caminho) {
    const corpo = IARA19.slice(ini, IARA19.indexOf('\n}', ini));
    ok(!/SpeechRecognition|iaraRec|iaraOuvir/.test(corpo),
       `${nome}() encosta em reconhecimento de voz — o relatório morreria offshore`);
  }
  // A falha de rede tem resposta honesta e nomeada, não um "não entendi".
  ok(/'network'/.test(IARA19), 'a falha de rede do reconhecimento não é tratada por nome');
  ok(/sem internet/i.test(IARA19), 'não avisa o comandante de que ficou sem ouvir por falta de sinal');
  // E o microfone nunca fica aberto sozinho (Chromium 40324711 e bom senso).
  ok(/continuous = false/.test(IARA19), 'o microfone poderia ficar aberto continuamente');
});

/* ═══════════════════════════════════════════════════════════════════════════
   SUÍTE 20 · Relatórios falados da Iara (Sprint 1)                 (v2.8.0)

   Duas teses sustentam este módulo, e são elas que esta suíte defende:

   1. O TEXTO PARA O OLHO NÃO É O TEXTO PARA O OUVIDO. O painel mostra
      `03°43.6'S` e `Fl(3) W 15s`; um sintetizador lê isso como lixo. Existe
      um formatador só para a fala, e ele é provado caractere a caractere.

   2. RELATÓRIO POR EXCEÇÃO. O que se repete toda hora vira ruído de fundo em
      dois dias — e aí ninguém escuta na hora em que havia algo diferente.
      Aqui se prova não só o que é DITO, mas o que é deliberadamente OMITIDO.
   ═══════════════════════════════════════════════════════════════════════════ */
const S20 = '20 · Relatórios falados';
const { falarRumo, falarNum, falarHora, falarCoord, falarDuracao, falarCaracteristica,
        deveDizerXte, deveDizerFarol, deveDizerCombustivel, prefixoSimulacao,
        montarRelatorioHora, montarRelatorioWaypoint,
        REL_XTE_MENCIONA_NM, REL_XTE_PREOCUPA_NM, REL_COMBUSTIVEL_A_CADA, REL_TETO_S } = A;
const fs20 = require('fs');
const APP20 = fs20.readFileSync(ROOT + '/app.html', 'utf8');
const REL20 = semComentarios(fs20.readFileSync(ROOT + '/assets/js/relatorio_voz.js', 'utf8'));

/* Estado típico: 14h, ao largo de Cabo Frio, rumo 048, 9,5 nós. */
const EST = () => ({
  quando: new Date(2026, 8, 20, 14, 0), lat: -23.0917, lng: -41.8833,
  cog: 48, sog: 9.5, sequencia: 2,
  proxWp: { nome: 'Cabo Frio', distNM: 12.4, brg: 52, eta: new Date(2026, 8, 20, 15, 20) }
});

t(S20, '20.1', 'Rumo se fala dígito a dígito, como no rádio', () => {
  /* "Quarenta e oito" e "cento e quarenta e oito" se confundem num alto-falante
     ruim; "quatro oito" e "um quatro oito" não. Dígito isolado sobrevive a
     ruído e a sotaque — é por isso que o rádio marítimo faz assim. */
  ok(falarRumo(48) === 'zero quatro oito', falarRumo(48));
  ok(falarRumo(148) === 'um quatro oito', falarRumo(148));
  ok(falarRumo(0) === 'zero zero zero', falarRumo(0));
  ok(falarRumo(360) === 'zero zero zero', `360° devia normalizar para 000, deu ${falarRumo(360)}`);
  ok(falarRumo(-10) === 'três cinco zero', `rumo negativo não normalizou: ${falarRumo(-10)}`);
  ok(falarRumo(359.7) === 'zero zero zero', `arredondamento errado: ${falarRumo(359.7)}`);
  // E NUNCA pode sair dígito solto colado, que o sintetizador lê como número.
  ok(!/\d/.test(falarRumo(123)), 'sobrou algarismo no rumo falado — vira "cento e vinte e três"');
});

t(S20, '20.2', 'Número decimal com VÍRGULA — em pt-BR o ponto vira outra coisa', () => {
  /* "9.5" é lido como "nove ponto cinco" em alguns motores e "noventa e cinco"
     em outros. A vírgula é a forma correta e a única segura. */
  ok(falarNum(9.5) === '9,5', falarNum(9.5));
  ok(falarNum(0.42, 2) === '0,42', falarNum(0.42, 2));
  ok(!/\./.test(falarNum(1234.56, 2)), 'sobrou ponto decimal: ' + falarNum(1234.56, 2));
  ok(falarNum(NaN) === '—' && falarNum(undefined) === '—', 'número inválido não virou travessão');
});

t(S20, '20.3', 'Hora se fala como hora, não como dois números', () => {
  ok(falarHora(new Date(2026, 8, 20, 15, 20)) === '15 e 20', falarHora(new Date(2026, 8, 20, 15, 20)));
  // "quinze e zero zero" é sofrível; hora cheia ganha "em ponto".
  ok(/em ponto/.test(falarHora(new Date(2026, 8, 20, 15, 0))), falarHora(new Date(2026, 8, 20, 15, 0)));
  ok(falarHora(new Date(2026, 8, 20, 9, 5)) === '9 e 05', falarHora(new Date(2026, 8, 20, 9, 5)));
  ok(falarHora(null) === '—' && falarHora(new Date('x')) === '—', 'data inválida não virou travessão');
  ok(!/:/.test(falarHora(new Date(2026, 8, 20, 15, 20))), 'sobrou dois-pontos na hora falada');
});

t(S20, '20.4', 'Posição em graus e minutos, com o hemisfério certo', () => {
  const sul = falarCoord(-23.0917, -41.8833);
  ok(/sul/.test(sul) && /oeste/.test(sul), sul);
  ok(!/°|'/.test(sul), 'sobrou símbolo de grau ou minuto na posição falada: ' + sul);
  const norte = falarCoord(3.5, 10.25);
  ok(/norte/.test(norte) && /leste/.test(norte), norte);
  /* 59,6' arredonda para 60 — tem de virar o grau, não dizer "60 minutos".
     É o mesmo defeito que a prova 7.2 pegou no fmtCoord da tela, em 2026. */
  const virada = falarCoord(-23.999, -41.999);
  ok(!/ 60 /.test(virada), 'disse "60 minutos" em vez de virar o grau: ' + virada);
  ok(/24 graus/.test(virada), 'não virou o grau ao arredondar: ' + virada);
});

t(S20, '20.5', 'A característica do farol é DITA, não soletrada', () => {
  /* `Fl(3) W 15s` é notação de carta. No sintetizador sai "efe éle abre
     parênteses três..." e o vigia não sabe o que procurar no horizonte.
     Todo navegante lê isso em voz alta, e sempre soube: "três lampejos
     brancos a cada 15 segundos". */
  ok(falarCaracteristica('Fl(3) W 15s') === 'três lampejos brancos a cada 15 segundos',
     falarCaracteristica('Fl(3) W 15s'));
  ok(falarCaracteristica('LFl W 30s') === 'lampejo longo branco a cada 30 segundos',
     falarCaracteristica('LFl W 30s'));
  ok(falarCaracteristica('Mo(A) W 8s') === 'morse alfa branco a cada 8 segundos',
     falarCaracteristica('Mo(A) W 8s'));
  // Notação desconhecida: diz como está, em vez de inventar.
  ok(falarCaracteristica('Coisa Estranha') === 'Coisa Estranha', 'inventou tradução para notação desconhecida');
  ok(falarCaracteristica('') === '' && falarCaracteristica(null) === '', 'característica vazia quebrou');
  /* E A BASE REAL INTEIRA. 98 faróis da DHN — se um só ficar sem tradução, o
     vigia ouve sigla em vez de descrição justamente no farol que ele tem pela
     proa. */
  const cruas = lighthouses.filter(l => falarCaracteristica(l.character) === l.character);
  ok(cruas.length === 0, `${cruas.length} farol(óis) sem tradução: ${cruas.slice(0, 3).map(l => l.character)}`);
  return { detail: `${lighthouses.length} características traduzidas` };
});

t(S20, '20.6', 'Concordância de gênero e número — são palavras ditas no passadiço', () => {
  /* "dois ocultações vermelhos" e "luz fixa vermelho" foram as duas primeiras
     versões desta tabela. Um assistente que fala errado perde autoridade na
     terceira frase — e autoridade é o que faz o comandante ouvir o aviso de
     fora de rumo quando ele vier. */
  ok(falarCaracteristica('Oc(2) R 6s') === 'duas ocultações vermelhas a cada 6 segundos',
     falarCaracteristica('Oc(2) R 6s'));
  ok(falarCaracteristica('F R') === 'luz fixa vermelha', falarCaracteristica('F R'));
  ok(falarCaracteristica('Fl(2) W 10s') === 'dois lampejos brancos a cada 10 segundos',
     falarCaracteristica('Fl(2) W 10s'));
  // "a cada 1 segundos" não é português — e cintilante de 1 s existe.
  ok(/a cada 1 segundo$/.test(falarCaracteristica('Q W 1s')), falarCaracteristica('Q W 1s'));
  // Varredura da base real: nenhum numeral masculino antes de substantivo feminino.
  const erradas = lighthouses.map(l => falarCaracteristica(l.character))
    .filter(f => /\b(dois|três|quatro|cinco|seis|sete|oito|nove)\s+(ocultações|luzes)\s+\w+os?\b/.test(f)
              || /\bdois\s+(ocultações|luzes)/.test(f));
  ok(erradas.length === 0, `${erradas.length} concordância(s) errada(s): ${erradas.slice(0, 2)}`);
});

t(S20, '20.7', 'Fora de rumo só acima do ruído do GPS', () => {
  /* O GPS de um tablet acerta em 5 a 10 m. 0,1 NM são 185 m — uma ordem de
     grandeza acima do ruído. Anunciar abaixo disso ensina o comandante a
     ignorar o aviso, que é o pior resultado possível. */
  ok(!deveDizerXte(0.05).dizer, '0,05 NM (93 m) é ruído de GPS e foi anunciado');
  ok(deveDizerXte(0.15).dizer, '0,15 NM não foi anunciado');
  ok(deveDizerXte(-0.5).dizer, 'desvio a bombordo (negativo) não foi anunciado');
  ok(!deveDizerXte(0.2).preocupa, '0,2 NM não devia ser tratado como preocupante');
  ok(deveDizerXte(0.4).preocupa, '0,4 NM devia preocupar');
  ok(!deveDizerXte(NaN).dizer, 'XTE indisponível virou anúncio');
  ok(REL_XTE_MENCIONA_NM < REL_XTE_PREOCUPA_NM, 'os dois limiares estão trocados');
});

t(S20, '20.8', 'Farol só entra quando pode ser VISTO daqui', () => {
  /* "Farol de Cabo Frio a 60 milhas" é informação inútil, e gera o hábito de
     ignorar. O critério é o alcance efetivo — o menor entre o luminoso e o
     geográfico, e o geográfico depende da altura do olho DESTE passadiço. */
  ok(deveDizerFarol({ distNM: 14, alcanceNM: 22 }), 'farol dentro do alcance ficou de fora');
  ok(!deveDizerFarol({ distNM: 60, alcanceNM: 22 }), 'anunciou farol a 60 NM com alcance de 22');
  ok(deveDizerFarol({ distNM: 22, alcanceNM: 22 }), 'exatamente no alcance devia entrar');
  ok(!deveDizerFarol(null) && !deveDizerFarol({}), 'farol ausente virou anúncio');
});

t(S20, '20.9', 'Combustível de 4 em 4 horas — mas na falta, na hora', () => {
  ok(deveDizerCombustivel(1, false), 'o primeiro relatório devia trazer o combustível');
  ok(!deveDizerCombustivel(2, false) && !deveDizerCombustivel(3, false), 'repetiu consumo sem necessidade');
  ok(deveDizerCombustivel(1 + REL_COMBUSTIVEL_A_CADA, false), 'perdeu a cadência de 4 em 4');
  // Saldo que não fecha a rota fura a cadência: é para ser dito no instante.
  ok(deveDizerCombustivel(3, true), 'saldo insuficiente esperou a vez na cadência');
});

t(S20, '20.10', 'SIMULAÇÃO se anuncia SEMPRE, e na primeira frase', () => {
  /* Foi um simulador ligado ao lado do botão mais usado que produziu
     "628.616 L de perda por desvio" na v2.3.3. Dizer números simulados EM VOZ
     ALTA, com o aplomb de uma assistente e sem avisar, é a forma mais perigosa
     desse defeito: voz convence mais que tela e não deixa rastro para reler. */
  const sim = Object.assign(EST(), { simulacao: true });
  for (const r of [montarRelatorioHora(sim), montarRelatorioWaypoint(Object.assign(sim, { wpAlcancado: 'Búzios' }))]) {
    ok(/^Atenção: isto é simulação/.test(r.texto), 'relatório simulado não abre avisando: ' + r.texto.slice(0, 40));
    ok(r.partes.includes('simulacao'), 'a simulação não foi registrada nas partes');
  }
  // E o relatório real NUNCA carrega o aviso — senão ele vira ruído e some.
  const real = montarRelatorioHora(EST());
  ok(!/simula/i.test(real.texto), 'relatório real mencionou simulação');
  ok(prefixoSimulacao(false) === '', 'o prefixo vaza quando não há simulação');
});

t(S20, '20.11', 'O relatório TÍPICO é curto — é ele que decide se alguém escuta', () => {
  /* Medido, não estimado: hora, posição, rumo, próximo waypoint e ETA levam
     14 s. É o caso comum, e é o comum que determina se o comandante ainda
     presta atenção no terceiro dia de viagem. */
  const r = montarRelatorioHora(EST());
  const seg = duracaoFaladaS(r.texto);
  ok(seg <= REL_TETO_S.tipico, `relatório típico leva ${seg.toFixed(0)} s, teto ${REL_TETO_S.tipico} s`);
  // E traz o essencial, sem exceção nenhuma disparada.
  ['hora', 'posicao', 'rumo', 'proximo-wp', 'eta'].forEach(p =>
    ok(r.partes.includes(p), `faltou "${p}" no relatório típico`));
  ['xte', 'farol', 'combustivel'].forEach(p =>
    ok(!r.partes.includes(p), `"${p}" entrou sem motivo — o relatório por exceção não está filtrando`));
  return { detail: `${seg.toFixed(0)} s, partes: ${r.partes.join(',')}` };
});

t(S20, '20.12', 'Quando três coisas importam ao mesmo tempo, as três são ditas', () => {
  /* Poderia forçar tudo em 15 s cortando conteúdo. Não se faz: quando fora de
     rumo, farol à vista e combustível merecem atenção JUNTOS, é exatamente a
     hora em que o comandante quer ouvir os três. Um relatório que se cala
     sobre o farol porque "já falou demais" troca incômodo por risco. */
  const cheio = Object.assign(EST(), {
    sequencia: 1, xteNM: -0.42,
    farol: { nome: 'de Cabo Frio', distNM: 14.2, caracteristica: 'Fl(3) W 15s', alcanceNM: 22 },
    combustivel: { usadoL: 1340, restanteL: 2100, insuficiente: false }
  });
  const r = montarRelatorioHora(cheio);
  ['xte-preocupa', 'farol', 'combustivel'].forEach(p =>
    ok(r.partes.includes(p), `a exceção "${p}" foi engolida`));
  const seg = duracaoFaladaS(r.texto);
  ok(seg <= REL_TETO_S.excecional, `relatório excepcional leva ${seg.toFixed(0)} s, teto ${REL_TETO_S.excecional} s`);
  // A característica entra falada, não soletrada.
  ok(/lampejos brancos/.test(r.texto), 'a característica do farol foi soletrada no relatório');
  return { detail: `${seg.toFixed(0)} s, ${r.partes.length} partes` };
});

t(S20, '20.13', 'Sem GPS e sem rota, ela diz isso — não diz "undefined"', () => {
  /* Um relatório que fala "próximo waypoint undefined, NaN milhas" é pior que
     silêncio: quem ouve conclui que o aplicativo quebrou e para de confiar em
     tudo, inclusive no que estava certo. */
  for (const e of [{}, null, { quando: new Date(2026, 8, 20, 14, 0) }]) {
    const r = montarRelatorioHora(e);
    ok(!/undefined|NaN|null|\[object/.test(r.texto), 'vazou valor cru: ' + r.texto);
    ok(r.texto.length > 10, 'relatório vazio demais: ' + r.texto);
  }
  const semNada = montarRelatorioHora({ quando: new Date(2026, 8, 20, 14, 0) });
  ok(semNada.partes.includes('sem-gps'), 'não avisou que está sem GPS');
  ok(semNada.partes.includes('sem-rota'), 'não avisou que está sem rota');
});

t(S20, '20.14', 'Chegada a waypoint fala da PERNA NOVA, não da posição', () => {
  /* Neste instante o comandante está guinando. Ele quer duas coisas: que a
     perna fechou, e os números da perna nova. Posição e combustível agora
     seriam ruído em cima de uma manobra. */
  const r = montarRelatorioWaypoint(Object.assign(EST(), { wpAlcancado: 'Búzios' }));
  ok(/Chegamos em Búzios/.test(r.texto), r.texto);
  ok(/rumo zero cinco dois/.test(r.texto), 'não deu o rumo da perna nova: ' + r.texto);
  ok(r.partes.includes('nova-perna') && !r.partes.includes('posicao'), 'partes erradas: ' + r.partes);
  ok(r.prioridade === 'evento', 'chegada devia ter prioridade de evento, não de rotina');
  ok(duracaoFaladaS(r.texto) <= REL_TETO_S.waypoint, 'relatório de waypoint longo demais');
  // Último waypoint da rota: ela percebe e se despede, em vez de dizer "sem rota".
  const fim = montarRelatorioWaypoint({ wpAlcancado: 'Santos' });
  ok(fim.partes.includes('fim-de-rota'), 'não reconheceu o fim da rota');
  ok(/último waypoint/i.test(fim.texto), fim.texto);
});

t(S20, '20.15', 'O relatório nasce na HORA CHEIA, não 60 minutos depois', () => {
  /* Diferença que parece cosmética e não é. Um temporizador de 60 em 60
     minutos dispara às 14h07, 15h07 — e o relatório deixa de casar com o
     registro do diário de bordo, que é feito na hora cheia. Alinhados, o
     falado e o escrito contam a mesma história na mesma linha do tempo. */
  const i = REL20.indexOf('function agendarProximaHora');
  ok(i > 0, 'agendarProximaHora não existe');
  const corpo = REL20.slice(i, REL20.indexOf('\n}', i));
  // O [^)]* não atravessava o ")" de getHours() — a prova falhava por erro
  // dela, não do código. Casa a chamada inteira com [\s\S].
  ok(/setHours\([\s\S]{0,40}\+ 1, 0, 0, 0\)/.test(corpo), 'não alinha na hora cheia');
  ok(!/60 \* 60 \* 1000|3600000\s*\)/.test(corpo), 'usa intervalo fixo de 1 h em vez da hora cheia');
  // E se reagenda sozinho, senão para no primeiro relatório.
  ok(/agendarProximaHora\(\)/.test(corpo), 'não reagenda o próximo relatório');
});

t(S20, '20.16', 'A troca de perna é OBSERVADA, não decidida de novo', () => {
  /* Duas fontes de verdade sobre "chegamos" sempre acabam divergindo — e aí o
     relatório falado contradiz o painel na frente do comandante. A Iara lê o
     navActiveLeg que o app já avançou. */
  const i = REL20.indexOf('function verificarTrocaDePerna');
  ok(i > 0, 'verificarTrocaDePerna não existe');
  const corpo = REL20.slice(i, REL20.indexOf('\n}', i));
  ok(!/ARRIVAL_RADIUS|calculateDistance/.test(corpo),
     'a Iara está recalculando a chegada em vez de observar o navActiveLeg');
  // E o app chama a observação DEPOIS de avançar a perna.
  const av = APP20.indexOf('advanceActiveLeg(lat, lng);');
  const ver = APP20.indexOf('verificarTrocaDePerna();');
  ok(av > 0 && ver > av, 'a verificação não vem logo depois de advanceActiveLeg');
});

t(S20, '20.17', 'O mesmo relatório chega a quem acompanha em terra', () => {
  /* Pelo canal de telemetria que já existe: nenhuma chamada de rede a mais.
     E texto vindo do canal NUNCA vai para innerHTML — mesma regra do cartão
     de farol. */
  ok(/rel: relatorioParaEspelho\(\)/.test(APP20), 'o relatório não segue no pacote de telemetria');
  const i = APP20.indexOf('if (p.rel && typeof p.rel.txt');
  ok(i > 0, 'o observador não recebe o relatório');
  const corpo = APP20.slice(i, i + 900);
  ok(/textContent/.test(corpo), 'o relatório recebido não usa textContent');
  ok(!/innerHTML/.test(corpo), 'texto vindo do canal foi para innerHTML — injeção');
  // E só aparece no espelho: a bordo o comandante já ouviu.
  ok(/body\.mirror-mode \.mirror-rel\.active/.test(
       fs20.readFileSync(ROOT + '/assets/css/app.css', 'utf8')),
     'o painel de relatório apareceria também a bordo, ocupando espaço do XTE');
});

t(S20, '20.18', 'O PRÓXIMO waypoint é o de VANTE, não o que ficou pra trás', () => {
  /* navActiveLeg é o índice do waypoint de ORIGEM da perna ativa — o app usa
     legStart = waypoints[navActiveLeg] e legEnd = waypoints[navActiveLeg+1].
     Escrevi `wps[leg]` na primeira versão: a Iara teria anunciado o waypoint
     JÁ ULTRAPASSADO, com a distância caindo a zero e depois crescendo. Na voz,
     isso soa como o barco andando de ré — e o comandante acreditaria, porque
     o número é coerente consigo mesmo.

     Esta prova existe porque a mutação encontrou o buraco: o defeito vivia na
     função que lê as globais, que eu não estava exercitando. */
  const rota = [{ name: 'Búzios', lat: -22.75, lng: -41.88 },
                { name: 'Cabo Frio', lat: -22.88, lng: -41.99 },
                { name: 'Arraial', lat: -22.97, lng: -42.02 }];
  A.setRota(rota, 0);
  A.setFix({ lat: -22.80, lng: -41.90, cog: 200, sog: 9 });
  const e0 = A.estadoAtualParaRelatorio();
  ok(e0.proxWp && e0.proxWp.nome === 'Cabo Frio',
     `na perna 0 o próximo WP devia ser Cabo Frio, veio "${e0.proxWp && e0.proxWp.nome}"`);
  // Avançando a perna, o alvo tem de andar junto.
  A.setRota(rota, 1);
  const e1 = A.estadoAtualParaRelatorio();
  ok(e1.proxWp && e1.proxWp.nome === 'Arraial',
     `na perna 1 o próximo WP devia ser Arraial, veio "${e1.proxWp && e1.proxWp.nome}"`);
  // E o XTE tem de existir de verdade: crossTrackError recebe OBJETOS nas duas
  // pontas, não seis números. Chamado errado devolvia NaN em silêncio, e o
  // "fora de rumo" simplesmente nunca apareceria no relatório.
  ok(isFinite(e0.xteNM), 'o XTE não foi calculado — a chamada está com a assinatura errada');
  // Última perna: não há mais "próximo", e isso não pode virar undefined falado.
  A.setRota(rota, 2);
  const e2 = A.estadoAtualParaRelatorio();
  ok(!e2.proxWp, 'na última perna ainda apontou um próximo waypoint inexistente');
  ok(!/undefined/.test(montarRelatorioHora(e2).texto), 'vazou "undefined" no fim da rota');
  A.setRota([], 0); A.setFix(null);
  return { detail: `perna 0 → Cabo Frio (${e0.proxWp.distNM.toFixed(1)} NM), perna 1 → Arraial` };
});

t(S20, '20.19', 'O histórico já guarda o lugar da onda do Sprint 5', () => {
  /* A comparação entre a onda MEDIDA pelos sensores e a PREVISTA pelo modelo
     só tem valor com série temporal. Dado que não foi gravado hoje não volta
     amanhã — o campo nasce vazio agora, custa um `null`, e evita perder meses
     de observação. */
  const i = REL20.indexOf('function registrarRelatorio');
  ok(i > 0, 'registrarRelatorio não existe');
  const corpo = REL20.slice(i, REL20.indexOf('\n}', i));
  /* O ARCO SE FECHA. No Sprint 1 este campo nascia `onda: null`, e a nota
     dizia: "a comparação entre onda medida e prevista só tem valor com série
     temporal, e dado que não foi gravado hoje não volta amanhã". Três sprints
     depois ele guarda observação de verdade — e é por isso que a série
     começou a existir três sprints ANTES de haver o que gravar nela. */
  ok(/onda: \(e\.mar/.test(corpo), 'o histórico não guarda mais a onda medida');
  ['Hs:', 'Troll:', 'gm:', 'HsPrevisto:'].forEach(c =>
    ok(corpo.includes(c), `o registro da onda perdeu o campo ${c}`));
  ok(/HsPrevisto/.test(corpo),
     'não guarda o previsto junto do medido — sem os dois lado a lado não há calibração possível');
  /* O campo `tempo` era reservado no Sprint 1 e passou a ser PREENCHIDO no
     Sprint 2 — a prova acompanha. E guarda-se o dado BRUTO do modelo, não a
     frase: a frase se regenera a qualquer momento, a observação não. */
  ok(/tempo: e\.tempo/.test(corpo), 'o histórico não guarda mais o tempo observado');
  ok(/ar: e\.tempo\.ar/.test(corpo) && /mar: e\.tempo\.mar/.test(corpo),
     'guarda a frase em vez do dado bruto do modelo — a frase se regenera, a observação não');
  ok(/lat|lng/.test(corpo) && /sim:/.test(corpo),
     'o histórico não guarda posição e procedência — série temporal inútil sem isso');
});

/* ═══════════════════════════════════════════════════════════════════════════
   SUÍTE 21 · Tempo, vento e corrente (Sprint 2)                    (v2.9.0)

   A PERGUNTA QUE ESTE MÓDULO PRECISA RESPONDER PARA EXISTIR:
   "Se o GPS já mede a SOG, e a SOG já CONTÉM a corrente, para que serve a
    corrente prevista?"

   Na perna ATUAL, para nada — o GPS já sabe. Nas pernas QUE AINDA NÃO SE
   NAVEGOU, para tudo: a mesma corrente age de forma completamente diferente
   conforme o RUMO da perna. Dois nós para o sul tiram dois nós de quem vai ao
   norte e quase nada de quem guina para leste no waypoint seguinte. O GPS só
   mede o que já aconteceu; o modelo prevê o que vai acontecer.

   A prova 21.6 é essa tese, em número.
   ═══════════════════════════════════════════════════════════════════════════ */
const S21 = '21 · Tempo e corrente';
const { nosDeKmh, rumoCardeal, beaufort, trianguloDaCorrente, etaComCorrente,
        tendenciaBarometrica, idadeDoTempo, falarTempo, falarNos,
        TEMPO_FRESCO_MIN, TEMPO_VELHO_MIN, TEMPO_RAJADA_DELTA,
        TEMPO_MAR_NM, TEMPO_CORRENTE_NOS } = A;
const fs21 = require('fs');
const PROXY21 = semComentarios(fs21.readFileSync(ROOT + '/netlify/functions/tempo.mjs', 'utf8'));
const TEMPO21 = semComentarios(fs21.readFileSync(ROOT + '/assets/js/tempo.js', 'utf8'));
const NETL21 = semComentariosToml(fs21.readFileSync(ROOT + '/netlify.toml', 'utf8'));

t(S21, '21.1', 'A chave paga NUNCA aparece no cliente nem na resposta', () => {
  /* O Open-Meteo só aceita a chave como parâmetro de URL e NÃO oferece
     restrição por domínio. Numa página estática, chave embutida é chave
     pública — e esta é paga: quem copiar usa a licença comercial alheia. */
  for (const f of ['assets/js/tempo.js', 'app.html', 'scripts/build-config.js']) {
    const txt = fs21.readFileSync(ROOT + '/' + f, 'utf8');
    ok(!/OPEN_METEO_API_KEY|apikey=/i.test(txt), `${f} menciona a chave do Open-Meteo`);
  }
  // O cliente fala com o proxy, e só.
  ok(/\/\.netlify\/functions\/tempo/.test(TEMPO21), 'o cliente não usa o proxy');
  ok(!/open-meteo\.com/.test(TEMPO21), 'o cliente chama o Open-Meteo direto, contornando o proxy');
  // E a função mascara a chave se ela escapar numa mensagem de erro — porque
  // o erro do Open-Meteo pode conter a URL, e a URL contém a chave.
  ok(/replace\(\/apikey=/.test(PROXY21), 'o proxy repassaria a chave num erro cru');
});

t(S21, '21.2', 'O proxy é mesma origem — a CSP não afrouxa', () => {
  /* Ganho que não era o objetivo: a CSP não lista open-meteo.com em
     connect-src, então chamada direta já seria bloqueada hoje, com ou sem
     chave. O proxy é 'self' e portanto é a ÚNICA opção que não mexe na
     política. O aviso 9.7 não piora. */
  const cs = /connect-src([^;]*);/.exec(NETL21);
  ok(cs, 'connect-src não encontrada na CSP');
  ok(!/open-meteo/.test(cs[1]), 'a CSP foi afrouxada para o Open-Meteo — o proxy existe para evitar isso');
  ok(/'self'/.test(cs[1]), "connect-src perdeu o 'self', que é o que autoriza o proxy");
});

t(S21, '21.3', 'Sem chave, o proxy NÃO cai no plano gratuito por conta própria', () => {
  /* O plano livre é de uso NÃO COMERCIAL e este app roda num rebocador de
     trabalho. Resolver o técnico abrindo o jurídico é decisão do dono, não do
     código. Falhar declarando o motivo deixa a escolha com quem é dela. */
  const i = PROXY21.indexOf('if (!apikey)');
  ok(i > 0, 'o proxy não trata a ausência da chave');
  /* Recorta só o BLOCO do if. A primeira versão desta prova pegava 400
     caracteres a partir dali e invadia a construção das URLs logo abaixo —
     falhava por erro do recorte, não do código. */
  const corpo = PROXY21.slice(i, PROXY21.indexOf('\n  }', i));
  ok(/502/.test(corpo), 'devia falhar com 502, não seguir adiante');
  ok(/return new Response/.test(corpo), 'não interrompe: seguiria para a busca sem chave');
  ok(!/open-meteo/.test(corpo), 'cai em algum endpoint do Open-Meteo sem chave');
  // E a nota que explica a decisão continua no arquivo, para quem for mexer.
  ok(/não comercial/i.test(fs21.readFileSync(ROOT + '/netlify/functions/tempo.mjs', 'utf8')),
     'sumiu a nota de por que não se cai no plano gratuito');
});

t(S21, '21.4', 'O teto de 10 variáveis por requisição é respeitado', () => {
  /* A cobrança do Open-Meteo é fracionária: acima de 10 variáveis a
     requisição conta como MAIS DE UMA chamada. Quem acrescentar a décima
     primeira dobra a conta sem perceber. */
  const mar = /const VARS_MAR = \[([\s\S]*?)\];/.exec(PROXY21);
  const ar = /const VARS_AR = \[([\s\S]*?)\];/.exec(PROXY21);
  ok(mar && ar, 'as listas de variáveis não foram encontradas');
  const conta = m => (m[1].match(/'/g) || []).length / 2;
  ok(conta(mar) <= 10, `${conta(mar)} variáveis marinhas — acima de 10 a chamada conta dobrado`);
  ok(conta(ar) <= 10, `${conta(ar)} variáveis de ar — acima de 10 a chamada conta dobrado`);
  // E as que importam estão lá.
  ok(/ocean_current_velocity/.test(mar[1]) && /ocean_current_direction/.test(mar[1]),
     'a corrente ficou de fora, e ela é o coração deste sprint');
  return { detail: `${conta(mar)} marinhas + ${conta(ar)} de ar` };
});

t(S21, '21.5', 'O triângulo da corrente bate com o que se resolve na carta', () => {
  /* Três casos que qualquer navegante confere de cabeça, e é assim que se
     valida isto: na mesa, antes de confiar no navio. Navio a 10 nós na água. */
  // Corrente de través: caranguejeia contra ela e perde pouca velocidade.
  let r = trianguloDaCorrente({ rumoDesejado: 0, velAgua: 10, setCorrente: 90, drift: 2 });
  eq(r.proa, 348.46, 0.05, 'proa a governar com corrente de través');
  eq(r.sog, 9.798, 0.01, 'SOG com corrente de través');
  // Corrente de proa: não precisa corrigir rumo, só perde velocidade.
  r = trianguloDaCorrente({ rumoDesejado: 0, velAgua: 10, setCorrente: 180, drift: 2 });
  eq(r.correcao, 0, 0.001, 'corrigiu rumo com corrente de proa');
  eq(r.sog, 8, 0.001, 'SOG com corrente de proa');
  // Corrente de popa: ganha tudo.
  r = trianguloDaCorrente({ rumoDesejado: 0, velAgua: 10, setCorrente: 0, drift: 2 });
  eq(r.sog, 12, 0.001, 'SOG com corrente de popa');
  /* O SINAL, que é onde mora o perigo. `ocean_current_direction` é PARA ONDE a
     corrente vai (confirmado na documentação do Open-Meteo), ao contrário de
     vento e onda, que são DE ONDE vêm. Tratar a corrente como "de onde vem"
     inverteria o vetor em 180° e jogaria a correção de proa para o BORDO
     ERRADO — o navio sairia da derrota justamente ao tentar segurá-la.
     Corrente indo para LESTE empurra para boreste, logo governa-se a BOMBORDO. */
  r = trianguloDaCorrente({ rumoDesejado: 0, velAgua: 10, setCorrente: 90, drift: 2 });
  ok(r.correcao < 0, `corrente para leste devia mandar governar a bombordo, deu ${r.correcao.toFixed(1)}°`);
  r = trianguloDaCorrente({ rumoDesejado: 0, velAgua: 10, setCorrente: 270, drift: 2 });
  ok(r.correcao > 0, `corrente para oeste devia mandar governar a boreste, deu ${r.correcao.toFixed(1)}°`);
});

t(S21, '21.6', 'A TESE DO SPRINT: a mesma corrente age diferente em cada rumo', () => {
  /* Esta é a prova que justifica o módulo inteiro. Dois nós de corrente para
     o SUL, três pernas de 20 milhas, navio a 10 nós na água. O GPS mediria a
     mesma SOG de agora e projetaria as três pernas iguais. Estão longe disso. */
  const corrente = { setGraus: 180, driftNos: 2 };
  const perna = rumo => etaComCorrente([{ nome: 'x', rumo, distNM: 20 }], 10, corrente).pernas[0];
  const norte = perna(0), leste = perna(90), sul = perna(180);
  eq(norte.sog, 8, 0.01, 'perna ao norte, contra a corrente');
  eq(sul.sog, 12, 0.01, 'perna ao sul, com a corrente');
  eq(leste.sog, 9.798, 0.01, 'perna a leste, corrente de través');
  // 20 NM: 150 min contra, 122 de través, 100 a favor. O ingênuo diria 120 nas três.
  const min = p => p.horas * 60;
  ok(min(norte) > 145 && min(norte) < 155, `perna ao norte: ${min(norte).toFixed(0)} min`);
  ok(min(sul) > 95 && min(sul) < 105, `perna ao sul: ${min(sul).toFixed(0)} min`);
  ok(min(norte) - min(sul) > 45,
     'a diferença entre ir contra e ir a favor sumiu — o efeito do rumo não está sendo calculado');
  return { detail: `norte ${min(norte).toFixed(0)} min · través ${min(leste).toFixed(0)} · sul ${min(sul).toFixed(0)} (ingênuo: 120)` };
});

t(S21, '21.7', 'Corrente forte demais para a derrota é DITA, não engolida', () => {
  /* Se |Vc·sen(α)| > Vb o arcsen não existe. Não é erro de conta: é o mar
     dizendo que ESTA DERROTA NÃO SE MANTÉM com esta velocidade. Devolver NaN
     em silêncio esconderia justamente a informação mais grave que esta função
     pode produzir. */
  const r = trianguloDaCorrente({ rumoDesejado: 0, velAgua: 4, setCorrente: 90, drift: 5 });
  ok(r.possivel === false, 'corrente de 5 nós de través com navio de 4 foi dada como possível');
  ok(/não se mantém/.test(r.motivo), 'não explicou por quê: ' + r.motivo);
  ok(!isFinite(r.proa), 'devolveu uma proa que não existe');
  // E a rota inteira registra a perna impossível em vez de inventar um ETA.
  const e = etaComCorrente([{ nome: 'Ruim', rumo: 0, distNM: 10 }], 4, { setGraus: 90, driftNos: 5 });
  ok(e.impossiveis.length === 1, 'a perna impossível não foi registrada');
  ok(isFinite(e.horas) && e.horas > 0, 'o ETA total virou NaN por causa de uma perna');
  // Corrente que anula o avanço: SOG zero não pode virar divisão por zero.
  const parado = etaComCorrente([{ nome: 'Parado', rumo: 0, distNM: 10 }], 2, { setGraus: 180, driftNos: 2 });
  ok(parado.impossiveis.length === 1, 'SOG nula não foi tratada');
  ok(isFinite(parado.horas), 'SOG nula produziu ETA infinito');
});

t(S21, '21.8', 'Sem corrente conhecida, a conta não inventa nada', () => {
  const r = trianguloDaCorrente({ rumoDesejado: 47, velAgua: 9 });
  ok(r.possivel && r.semCorrente, 'sem corrente devia seguir possível');
  eq(r.sog, 9, 1e-9, 'inventou ganho sem corrente');
  eq(r.proa, 47, 1e-9, 'corrigiu a proa sem corrente para corrigir');
  ok(!trianguloDaCorrente({ velAgua: 10 }).possivel, 'sem rumo devia falhar');
  ok(!trianguloDaCorrente({ rumoDesejado: 0, velAgua: 0 }).possivel, 'navio parado devia falhar');
});

t(S21, '21.9', 'km/h vira nó pela milha náutica exata, e o rumo vira palavra', () => {
  /* A corrente é a única variável que o Open-Meteo não entrega em nó — o
     vento entrega. 1 NM = 1852 m exatos, não 1800 nem 2000. */
  eq(nosDeKmh(1.852), 1, 1e-9, 'conversão km/h -> nó');
  eq(nosDeKmh(18.52), 10, 1e-9, 'conversão km/h -> nó');
  ok(!isFinite(nosDeKmh(null)), 'valor ausente virou número');
  // Na ponte ninguém diz "vento de 042 graus": diz "vento de nordeste".
  ok(rumoCardeal(0) === 'norte' && rumoCardeal(90) === 'leste', rumoCardeal(90));
  ok(rumoCardeal(45) === 'nordeste' && rumoCardeal(225) === 'sudoeste', rumoCardeal(225));
  ok(rumoCardeal(359) === 'norte', `359° devia dar norte, deu ${rumoCardeal(359)}`);
  ok(rumoCardeal(-45) === 'noroeste', `-45° devia dar noroeste, deu ${rumoCardeal(-45)}`);
  ok(rumoCardeal(NaN) === '', 'rumo inválido virou palavra');
});

t(S21, '21.10', 'Beaufort: "força 6" diz mais ao comandante que "23 nós"', () => {
  /* Um número de nós é medida; a força Beaufort é uma DESCRIÇÃO DO MAR que se
     compara com o que se vê pela janela. Limites da escala, em nós. */
  ok(beaufort(0).f === 0 && beaufort(23).f === 6 && beaufort(35).f === 8,
     `23 nós deu força ${beaufort(23).f}, esperado 6`);
  ok(beaufort(16).f === 4 && beaufort(17).f === 5, 'a fronteira 16/17 nós está errada');
  ok(beaufort(100).f === 12, 'ventos de furacão saíram da escala');
  ok(beaufort(-1) === null && beaufort(NaN) === null, 'vento inválido entrou na escala');
  // A escala é monotônica: força nunca cai quando o vento sobe.
  let ant = -1;
  for (let v = 0; v <= 70; v++) { const f = beaufort(v).f; ok(f >= ant, `força caiu em ${v} nós`); ant = f; }
});

t(S21, '21.11', 'O barômetro que o tablet não tem, em hPa por 3 horas', () => {
  /* O Galaxy Tab S10 FE NÃO tem barômetro — verificado nas especificações. "O
     barômetro está caindo" é o aviso de mau tempo mais antigo que existe, e
     aqui ele só pode ser PREVISTO, nunca medido. */
  const base = Date.now();
  const serie = h => [{ t: base, hPa: 1015 }, { t: base + 3 * 3600000, hPa: 1015 + h }];
  ok(tendenciaBarometrica(serie(-6)).sentido === 'caindo', 'queda não detectada');
  ok(tendenciaBarometrica(serie(+6)).sentido === 'subindo', 'subida não detectada');
  eq(tendenciaBarometrica(serie(-6)).por3h, -6, 0.01, 'taxa por 3 h errada');
  ok(tendenciaBarometrica(serie(-0.2)).sentido === '', 'variação desprezível virou tendência');
  // Queda de 3 hPa em 3 h num rebocador costeiro é para prestar atenção.
  ok(tendenciaBarometrica(serie(-3.4)).atencao, 'queda de 3,4 hPa/3h não acendeu atenção');
  ok(!tendenciaBarometrica(serie(-1.0)).atencao, 'queda leve acendeu atenção à toa');
  // Série curta não vira tendência — extrapolar 10 minutos para 3 horas mente.
  ok(tendenciaBarometrica([{ t: base, hPa: 1015 }]) === null, 'uma amostra virou tendência');
  ok(tendenciaBarometrica([{ t: base, hPa: 1015 }, { t: base + 60000, hPa: 1014 }]) === null,
     'um minuto de série virou tendência de 3 horas');
  ok(tendenciaBarometrica(null) === null, 'série nula quebrou');
});

t(S21, '21.12', 'Dado velho é ROTULADO como velho, não escondido nem descartado', () => {
  /* A decisão aprovada: quando o proxy falha, serve-se o último valor
     conhecido DIZENDO A IDADE, em vez de cair no plano gratuito. Dado velho
     rotulado vale mais que dado fresco de procedência duvidosa, e quem decide
     se ainda serve é o comandante. */
  const agora = Date.now();
  const em = min => new Date(agora - min * 60000).toISOString();
  ok(idadeDoTempo(em(10), agora).rotulo === '', 'dado de 10 min ganhou rótulo à toa');
  ok(idadeDoTempo(em(10), agora).fresco, '10 min não foi considerado fresco');
  const velho = idadeDoTempo(em(90), agora);
  ok(/90 minutos/.test(velho.rotulo), velho.rotulo);
  const antigo = idadeDoTempo(em(500), agora);
  ok(antigo.velho && /horas/.test(antigo.rotulo), antigo.rotulo);
  ok(idadeDoTempo('não é data') === null, 'data inválida não virou null');
  ok(TEMPO_FRESCO_MIN < TEMPO_VELHO_MIN, 'os dois limiares estão trocados');
  /* E o cliente NÃO joga fora o valor bom quando a busca falha — é isso que
     permite o rótulo existir. */
  const i = TEMPO21.indexOf('catch (e) {', TEMPO21.indexOf('async function buscarTempo'));
  const corpo = TEMPO21.slice(i, i + 420);
  ok(!/tempoAtual = null/.test(corpo), 'a falha apaga o último valor bom — aí não há o que rotular');
});

t(S21, '21.13', 'O tempo também entra por exceção — o que se repete ninguém escuta', () => {
  const ar = { wind_speed_10m: 12, wind_direction_10m: 45, wind_gusts_10m: 14, pressure_msl: 1015 };
  // Vento calmo, mar baixo, sem rajada: só a frase do vento.
  let r = falarTempo({ ar, mar: { wave_height: 0.6, wave_direction: 90 } });
  ok(r.partes.includes('vento'), 'o vento devia ser dito sempre');
  ok(!r.partes.includes('mar'), `mar de 0,6 m não merecia frase: ${r.texto}`);
  ok(!r.partes.includes('rajada'), 'rajada de 2 nós acima da média virou frase');
  // Rajada de verdade: num rebocador com cabo na água, isso decide manobra.
  r = falarTempo({ ar: Object.assign({}, ar, { wind_gusts_10m: 12 + TEMPO_RAJADA_DELTA + 1 }) });
  ok(r.partes.includes('rajada'), 'rajada de 9 nós acima da média foi engolida');
  // Mar que já faz o navio trabalhar.
  r = falarTempo({ ar, mar: { wave_height: TEMPO_MAR_NM + 0.1, wave_direction: 90, wave_period: 8 } });
  ok(r.partes.includes('mar'), 'mar de 1,6 m não foi mencionado');
  // Corrente irrelevante não vira frase; relevante vira.
  r = falarTempo({ ar, correnteEfeito: { driftNos: 0.4, setGraus: 180, ganhoNos: -0.1 } });
  ok(!r.partes.includes('corrente-atrapalha'), 'efeito de 0,1 nó virou frase');
  r = falarTempo({ ar, correnteEfeito: { driftNos: 1.2, setGraus: 180, ganhoNos: -0.9 } });
  ok(r.partes.includes('corrente-atrapalha'), 'efeito de 0,9 nó foi engolido');
  ok(TEMPO_CORRENTE_NOS > 0 && TEMPO_CORRENTE_NOS < 1, 'o limiar da corrente saiu da faixa defensável');
});

t(S21, '21.14', 'Nó no singular, e o Beaufort não repete a palavra "vento"', () => {
  /* "Corrente 1,0 nós" não é português, e num relatório falado o deslize
     salta. E "Vento de nordeste, 24 nós, vento muito fresco" soa a máquina
     travada — o nome Beaufort já começa com "vento". */
  ok(falarNos(1) === '1 nó', falarNos(1));
  ok(falarNos(24) === '24 nós', falarNos(24));
  ok(falarNos(0.85) === '0,8 nós' || falarNos(0.85) === '0,9 nós', falarNos(0.85));
  ok(!/24,0/.test(falarNos(24)), 'número inteiro saiu com decimal');
  const r = falarTempo({ ar: { wind_speed_10m: 23.5, wind_direction_10m: 42, wind_gusts_10m: 25 } });
  ok(!/vento.*vento/i.test(r.texto), 'repetiu "vento": ' + r.texto);
  ok(/força 6/.test(r.texto), 'perdeu a força Beaufort: ' + r.texto);
});

t(S21, '21.16', 'O tempo CHEGA ao relatório falado — a conta ligada à voz', () => {
  /* As provas 21.5 a 21.14 medem a aritmética; a suíte 20 mede o relatório
     dado um estado. Faltava a costura: a mutação mostrou que dava para
     desligar o bloco de tempo inteiro sem nenhuma prova reclamar. Conta certa
     que não chega à ponte não serve para nada. */
  const base = { quando: new Date(2026, 8, 20, 14, 0), lat: -23.09, lng: -41.88,
                 cog: 48, sog: 9.5, sequencia: 2,
                 proxWp: { nome: 'Cabo Frio', distNM: 12.4, brg: 52, eta: new Date(2026, 8, 20, 15, 20) } };
  const tempo = {
    ar: { wind_speed_10m: 23.5, wind_direction_10m: 42, wind_gusts_10m: 25, pressure_msl: 1009 },
    mar: { wave_height: 2.1, wave_direction: 71, wave_period: 6 },
    idade: { minutos: 8, rotulo: '' },
    barometro: { hPa: 1009, por3h: -3.4, sentido: 'caindo', texto: 'caindo', atencao: true },
    correnteEfeito: { driftNos: 1.0, setGraus: 233, ganhoNos: -0.85 }
  };
  const r = montarRelatorioHora(Object.assign({}, base, { tempo }));
  ['vento', 'mar', 'corrente-atrapalha', 'barometro-atencao'].forEach(x =>
    ok(r.partes.includes(x), `"${x}" não chegou ao relatório falado`));
  ok(/força 6/.test(r.texto), 'a força Beaufort não chegou: ' + r.texto);
  ok(/sudoeste/.test(r.texto), 'a direção da corrente não chegou');
  // E continua dentro do teto excepcional, mesmo com tudo disparando.
  const seg = duracaoFaladaS(r.texto);
  ok(seg <= REL_TETO_S.excecional, `com tempo o relatório foi a ${seg.toFixed(0)} s, teto ${REL_TETO_S.excecional}`);
  // Sem tempo nenhum (offline desde o início), o relatório não quebra nem mente.
  const semTempo = montarRelatorioHora(base);
  ok(!/vento|corrente|barômetro/i.test(semTempo.texto), 'inventou tempo sem dado: ' + semTempo.texto);
  return { detail: `${seg.toFixed(0)} s com tempo, ${r.partes.length} partes` };
});

t(S21, '21.17', 'O ETA da rota corrigido só fala quando a diferença vale a frase', () => {
  /* Abaixo de 10 min sobre a rota inteira a correção cabe na incerteza do
     próprio modelo — anunciá-la daria ares de precisão a um palpite. */
  const base = { quando: new Date(2026, 8, 20, 14, 0), cog: 48, sog: 9.5, sequencia: 2,
                 proxWp: { nome: 'Cabo Frio', distNM: 12.4, brg: 52 } };
  const com = h => montarRelatorioHora(Object.assign({}, base, { etaRota: { ganhoHoras: h, impossiveis: [] } }));
  ok(!com(0.1).partes.includes('eta-rota-perde') && !com(0.1).partes.includes('eta-rota-ganha'),
     '6 minutos de correção viraram frase');
  ok(com(-0.75).partes.includes('eta-rota-perde'), '45 min de atraso pela corrente foram engolidos');
  ok(com(0.75).partes.includes('eta-rota-ganha'), '45 min de ganho pela corrente foram engolidos');
  ok(/cobra/.test(com(-0.75).texto), com(-0.75).texto);
  // Perna que a corrente não deixa cumprir é avisada, sempre.
  const r = montarRelatorioHora(Object.assign({}, base, {
    etaRota: { ganhoHoras: 0, impossiveis: [{ nome: 'Arraial', motivo: 'sem avanço no fundo' }] } }));
  ok(r.partes.includes('perna-impossivel'), 'perna impossível não foi anunciada');
  ok(/Arraial/.test(r.texto), 'não disse QUAL perna: ' + r.texto);
});

t(S21, '21.18', 'A busca de tempo começa e termina junto com a navegação', () => {
  /* Um módulo perfeito que ninguém liga é código morto com boa consciência. */
  const app = semComentarios(fs21.readFileSync(ROOT + '/app.html', 'utf8'));
  ok(/<script src="assets\/js\/tempo\.js">/.test(fs21.readFileSync(ROOT + '/app.html', 'utf8')),
     'o módulo do tempo não é carregado');
  const iniN = app.indexOf('iniciarRelatorios()');
  const iniT = app.indexOf('iniciarTempo(');
  ok(iniT > 0, 'iniciarTempo() nunca é chamada — o tempo nunca seria buscado');
  ok(Math.abs(iniT - iniN) < 600, 'a busca de tempo não arranca junto com a navegação');
  ok(/pararTempo\(\)/.test(app), 'a busca de tempo nunca para — gastaria cota com o navio atracado');
  // E o ponto de posição é o fixo do GPS, não um lugar fixo qualquer.
  ok(/iniciarTempo\(\(\) => navLastFix\)/.test(app), 'o tempo não segue a posição da embarcação');
});

t(S21, '21.15', 'O proxy arredonda à grade e serve todo mundo com uma busca', () => {
  /* Sem arredondar, cada requisição traria coordenada diferente (o barco anda)
     e o cache nunca acertaria. 0,05° ≈ 3 NM está DENTRO da resolução dos
     próprios modelos (8 a 25 km) — a precisão que se "perde" já não existia no
     dado de origem. E a 10 nós o rebocador cruza 3 NM em 18 min, quase o TTL.
     Ganho concreto: cada observador do espelho gastaria uma chamada da cota;
     com o proxy, gastam zero. */
  ok(/const GRADE = 0\.05;/.test(PROXY21), 'a grade de arredondamento mudou sem revisão da nota');
  ok(/TTL_MS = 15 \* 60 \* 1000/.test(PROXY21), 'o TTL não acompanha o passo de 15 min do modelo');
  // A MESMA coordenada arredondada vai ao Open-Meteo e vira chave do cache:
  // guardar sob uma chave e buscar por outra é marcar a posição no diário e
  // plotar outra na carta.
  ok(/latitude=\$\{la\}&longitude=\$\{ln\}/.test(PROXY21), 'pede coordenada crua e guarda arredondada');
  ok(/Cache-Control/.test(PROXY21), 'sem Cache-Control a CDN não guarda nada');
  // E as duas fontes são independentes: num estuário o mar devolve null e o
  // vento continua válido. Meia informação correta vale mais que nenhuma.
  ok(/allSettled/.test(PROXY21), 'uma fonte que falhe derrubaria a outra');
});

/* ═══════════════════════════════════════════════════════════════════════════
   SUÍTE 22 · Referências de terra (Sprint 3)                      (v2.10.0)

   "Estou em 23°05'S 041°53'W" não diz nada a ninguém. "Estou 12 milhas a
   leste de Cabo Frio" diz tudo. É esse o trabalho deste módulo.

   E é também onde mora a tentação que produziu o pior defeito deste projeto:
   na v2.4 a "linha de costa" era a lista de faróis ordenada por latitude —
   conveniente, plausível, errada em 48 NM na média. O defeito não foi de
   código, foi de PROCEDÊNCIA: aceitou-se um dado por estar à mão e deu-se a
   ele um nome que prometia mais do que ele era.

   A prova 22.9 existe para impedir a reincidência: porto não é abrigo.
   ═══════════════════════════════════════════════════════════════════════════ */
const S22 = '22 · Referências de terra';
const { referenciaMaisProxima, referenciasDoPonto, fraseDeReferencia,
        REFERENCIAS_TERRA, REF_MESMO_LUGAR_NM, REF_ALCANCE_MAX_NM } = A;
const fs22 = require('fs');
const REF22 = fs22.readFileSync(ROOT + '/assets/js/referencias.js', 'utf8');
const GER22 = fs22.readFileSync(ROOT + '/tools/terra/gerar_referencias.mjs', 'utf8');
const APP22 = semComentarios(fs22.readFileSync(ROOT + '/app.html', 'utf8'));

t(S22, '22.1', 'A base existe, é do Brasil e tem forma válida', () => {
  ok(REFERENCIAS_TERRA && Array.isArray(REFERENCIAS_TERRA.cidades), 'base ausente ou malformada');
  const { cidades, portos } = REFERENCIAS_TERRA;
  ok(cidades.length >= 60, `só ${cidades.length} cidades — a costa brasileira tem mais que isso`);
  ok(portos.length >= 18, `só ${portos.length} portos`);
  const ruins = [];
  for (const [la, ln, nome, uf] of cidades) {
    if (!isFinite(la) || !isFinite(ln)) ruins.push(nome + ':coord');
    if (la < -35.5 || la > 6.5 || ln < -56 || ln > -28) ruins.push(nome + ':fora da caixa');
    if (!nome || typeof nome !== 'string') ruins.push('sem nome');
    if (typeof uf !== 'string') ruins.push(nome + ':uf');
  }
  ok(ruins.length === 0, `${ruins.length} registro(s) inválido(s): ${ruins.slice(0, 3)}`);
  return { detail: `${cidades.length} cidades, ${portos.length} portos` };
});

t(S22, '22.2', 'Só cidades LITORÂNEAS — o interior não orienta ninguém no mar', () => {
  /* Uma cidade a 200 milhas do litoral não orienta quem está navegando. O
     gerador corta em 25 NM da linha de costa da v2.5.0 — e é a própria linha
     de costa, medida de verdade, que faz esse corte. */
  let pior = null, piorD = -1;
  for (const [la, ln, nome] of REFERENCIAS_TERRA.cidades) {
    const d = distanceFromCoast(la, ln);
    if (d > piorD) { piorD = d; pior = nome; }
  }
  ok(piorD <= 30, `"${pior}" está a ${piorD.toFixed(1)} NM da costa — é cidade de interior`);
  return { detail: `a mais interiorana é ${pior}, a ${piorD.toFixed(1)} NM da costa` };
});

t(S22, '22.3', 'Marcação, não só distância — é o que orienta de verdade', () => {
  /* "Cabo Frio a 12 milhas" deixa o navegante girando a cabeça. "12 milhas a
     leste de Cabo Frio" o orienta. E a marcação é DO PONTO PARA a referência:
     é para onde olhar, não de onde se veio. */
  const r = referenciasDoPonto(-23.05, -41.90);
  ok(r.cidade, 'não achou cidade ao largo de Cabo Frio');
  ok(/Cabo Frio/.test(r.cidade.nome), `achou "${r.cidade.nome}"`);
  ok(isFinite(r.cidade.brg) && r.cidade.brg >= 0 && r.cidade.brg < 360, 'marcação inválida');
  // Estando a SUDESTE da cidade, olha-se para NOROESTE para vê-la.
  ok(/noroeste|oeste|norte/.test(r.cidade.rumo),
     `de sudeste de Cabo Frio a marcação devia apontar ao quadrante NW, deu "${r.cidade.rumo}"`);
  eq(r.cidade.distNM, calculateDistance(-23.05, -41.90, r.cidade.lat, r.cidade.lng), 1e-9,
     'a distância devolvida não é a distância calculada');
});

t(S22, '22.4', 'Além de 120 milhas, silêncio — nome de terra implica relevância', () => {
  /* A primeira versão respondia "Campos a 399 milhas" no meio do Atlântico.
     Tecnicamente correto e pior que o silêncio: um nome de terra numa frase
     IMPLICA relevância, e quem ouve passa a procurar referência que não há. */
  const longe = referenciasDoPonto(-25.0, -35.0);
  ok(!longe.cidade && !longe.porto, 'nomeou referência a centenas de milhas da costa');
  ok(fraseDeReferencia(longe) === '', 'produziu frase onde devia calar');
  // E perto continua respondendo.
  ok(referenciasDoPonto(-23.05, -41.90).cidade, 'calou onde devia falar');
  ok(REF_ALCANCE_MAX_NM >= 60 && REF_ALCANCE_MAX_NM <= 200, 'o corte saiu da faixa defensável');
});

t(S22, '22.5', 'Cidade e porto no mesmo lugar são ditos UMA vez', () => {
  /* Na costa brasileira a cidade quase sempre cresceu em volta do porto.
     "Santos, e também Santos" é a Iara conversando sozinha. */
  const santos = referenciasDoPonto(-24.05, -46.30);
  const f = fraseDeReferencia(santos);
  ok((f.match(/Santos/g) || []).length === 1, 'repetiu o nome: ' + f);
  // Já onde são lugares diferentes, os dois aparecem — a cidade situa, o porto
  // informa o que existe por perto.
  const cf = fraseDeReferencia(referenciasDoPonto(-23.05, -41.90));
  ok(/Cabo Frio/.test(cf) && /porto/.test(cf), 'perdeu o porto quando ele é outro lugar: ' + cf);
  ok(REF_MESMO_LUGAR_NM > 0 && REF_MESMO_LUGAR_NM <= 5, 'o limiar de "mesmo lugar" saiu da faixa');
});

t(S22, '22.6', 'Toda a costa continental acha referência — e as ilhas não', () => {
  /* A prova que a v2.5.0 ensinou a escrever: não basta funcionar em Cabo Frio.

     A PRIMEIRA VERSÃO DESTA PROVA ESTAVA ERRADA e acusou um buraco falso.
     Ela sintetizava pontos ao largo varrendo longitude de 0,25 em 0,25 grau —
     que a 20°S são ~14 NM por passo. A faixa procurada (8 a 14 NM da costa)
     cabe DENTRO de um passo, então a varredura pulava a costa continental e
     ia parar em TRINDADE, a 600 milhas, onde de fato não há cidade nenhuma.
     Prova de resolução grossa não encontra defeito: inventa um.

     Agora varre-se a costa pelos 98 faróis da DHN, que já estão exatamente
     onde interessa e cobrem o litoral inteiro. E o resultado se valida
     sozinho: os ÚNICOS faróis sem referência de terra têm de ser as cinco
     ilhas oceânicas — porque lá realmente não há cidade, e dizer que há seria
     o defeito. Se um farol de costa continental aparecer nessa lista, a prova
     o nomeia. */
  const ILHAS_OCEANICAS = ['Fernando de Noronha', 'Rocas', 'São Pedro e São Paulo',
                           'Martin Vaz', 'Trindade'];
  const sem = [], longe = [];
  let pior = 0, piorEm = null;
  for (const lh of lighthouses) {
    const r = referenciasDoPonto(lh.lat, lh.lng);
    const d = Math.min(r.cidade ? r.cidade.distNM : Infinity,
                       r.porto ? r.porto.distNM : Infinity);
    if (!isFinite(d)) { sem.push(lh.name); continue; }
    if (d > pior) { pior = d; piorEm = lh.name; }
    if (d > 90) longe.push(`${lh.name} (${d.toFixed(0)} NM)`);
  }
  const inesperados = sem.filter(n => !ILHAS_OCEANICAS.some(i => n.includes(i)));
  ok(inesperados.length === 0,
     `${inesperados.length} farol(óis) de costa sem referência de terra: ${inesperados.slice(0, 4)}`);
  ok(sem.length === ILHAS_OCEANICAS.length,
     `${sem.length} sem referência, esperados ${ILHAS_OCEANICAS.length} (só as ilhas oceânicas)`);
  /* 90 NM é o teto do continente. O trecho Pará–Maranhão é genuinamente
     despovoado e chega a 74 NM — isso é a costa, não a base. */
  ok(longe.length === 0, `referência longe demais: ${longe.slice(0, 3)}`);
  const ds = lighthouses.map(lh => {
    const r = referenciasDoPonto(lh.lat, lh.lng);
    return Math.min(r.cidade ? r.cidade.distNM : Infinity, r.porto ? r.porto.distNM : Infinity);
  }).filter(isFinite).sort((a, b) => a - b);
  return { detail: `mediana ${ds[Math.floor(ds.length / 2)].toFixed(1)} NM · pior ${pior.toFixed(0)} NM (${piorEm}) · ${sem.length} ilhas oceânicas sem referência` };
});

t(S22, '22.7', 'O arquivo é GERADO, não editado à mão', () => {
  /* Mesma disciplina de coastline.js. Edição manual em arquivo gerado se
     perde na próxima geração — e ninguém descobre até o dado sumir. */
  ok(/GERADO por tools\/terra\/gerar_referencias\.mjs/.test(REF22), 'não declara a procedência');
  ok(/NÃO EDITAR À MÃO/.test(REF22), 'não avisa que é gerado');
  ok(/Natural Earth/.test(REF22), 'não declara a fonte');
  ok(fs22.existsSync(ROOT + '/tools/terra/gerar_referencias.mjs'), 'o gerador não existe');
});

t(S22, '22.8', 'A LACUNA é declarada, não disfarçada', () => {
  /* A Natural Earth traz 20 portos brasileiros e FALTAM Suape, Itaqui,
     Sepetiba, São Sebastião, Angra, Itajaí e outros — conferido um a um, e
     nenhum deles aparece como cidade na NE nem como farol na LF-40ED.
     ANTAQ inacessível, IBGE sem coordenadas.

     Declarar a falta é o que separa uma base honesta de uma que mente por
     omissão: quem lê o arquivo sabe exatamente onde ele é cego. */
  for (const termo of ['Suape', 'Itaqui', 'São Sebastião', 'Itajaí']) {
    ok(REF22.includes(termo), `o arquivo não declara que falta ${termo}`);
  }
  ok(/FALTAM|faltam/i.test(REF22), 'não há seção declarando a lacuna');
  // E a emenda tem de ser trivial, com procedência obrigatória.
  ok(/PORTOS_EXTRA/.test(GER22), 'não há lugar previsto para emendar a lista');
  ok(/procedência/i.test(GER22), 'a emenda não exige declarar de onde veio a coordenada');
  ok(/não invento|NÃO SE INVENTA/i.test(GER22), 'o gerador não registra a regra de não inventar coordenada');
});

t(S22, '22.9', 'PORTO NÃO É ABRIGO — a ressalva que impede a reincidência', () => {
  /* A v2.4 chamou uma lista de faróis de "linha de costa". A tentação aqui é
     chamar o porto mais próximo de ABRIGO. Escolher fundeadouro exige carta,
     tenedouro, proteção de QUAL quadrante, profundidade e acesso noturno —
     nada disso está em nenhuma base pública ao alcance. Um aplicativo que
     sussurra "abrigo a 12 milhas" com vento de 40 nós está mandando o navio
     para um lugar que ele não conhece. */
  ok(/NÃO É INDICAÇÃO DE ABRIGO/i.test(REF22), 'o arquivo gerado não traz a ressalva');
  ok(/carta náutica|tenedouro/i.test(REF22), 'a ressalva não explica o que falta para ser abrigo');
  const naut = fs22.readFileSync(ROOT + '/assets/js/nautical.js', 'utf8');
  ok(/NÃO SIGNIFICA ABRIGO|não é abrigo/i.test(naut), 'o código de consulta não repete a ressalva');
  // E a palavra "abrigo" NÃO pode aparecer como rótulo no que o usuário lê.
  const frase = fraseDeReferencia(referenciasDoPonto(-23.05, -41.90));
  ok(!/abrigo|refúgio|seguro/i.test(frase), 'a frase ao usuário promete abrigo: ' + frase);
  const rel = fs22.readFileSync(ROOT + '/assets/js/relatorio_voz.js', 'utf8');
  ok(!/abrigo/i.test(rel), 'o relatório falado usa a palavra "abrigo"');
});

t(S22, '22.10', 'A referência chega ao painel de waypoints e ao espelho', () => {
  /* O pedido de bordo foi literal: "relacionar cada waypoint a uma cidade ou
     porto mais próximo, além do farol". Módulo que ninguém liga é código
     morto com boa consciência. */
  ok(/ref: fraseDeReferencia\(referenciasDoPonto\(w\.lat, w\.lng\)\)/.test(APP22),
     'o painel de waypoints não calcula a referência');
  ok(/rf: fraseDeReferencia/.test(APP22), 'a referência não segue para o observador em terra');
  ok(/ref: w\.rf/.test(APP22), 'o espelho recebe mas não usa a referência');
  // Texto vindo do canal escapado — mesma regra do cartão de farol.
  const i = APP22.indexOf('const ref = w.ref');
  ok(i > 0, 'a linha da referência não é montada');
  ok(/escapeHtml\(w\.ref\)/.test(APP22.slice(i, i + 200)), 'a referência entra sem escape — injeção');
  ok(/<script src="assets\/js\/referencias\.js">/.test(
       fs22.readFileSync(ROOT + '/app.html', 'utf8')), 'a base não é carregada');
});

t(S22, '22.11', 'A Iara diz a referência na chegada, e cala quando é redundante', () => {
  /* Um waypoint costuma ter nome de rota ("WP 3") que não diz onde é — é na
     CHEGADA que interessa saber a que altura da costa se está. Mas na costa
     brasileira o waypoint quase sempre TEM o nome da cidade, e aí dizer
     "próximo waypoint Macaé… agora a referência é Macaé" é conversar sozinha. */
  const wp = montarRelatorioWaypoint({ wpAlcancado: 'Búzios',
    referencia: 'Cabo Frio a 12,3 milhas para noroeste',
    proxWp: { nome: 'Macaé', distNM: 28, brg: 35 } });
  ok(wp.partes.includes('referencia'), 'a chegada não menciona a referência de terra');
  ok(/Cabo Frio/.test(wp.texto), wp.texto);
  // Marco de singradura: só quando MUDA, e só quando não é redundante.
  const base = { quando: new Date(2026, 8, 20, 17, 0), lat: -22.3, lng: -41.7, cog: 35, sog: 9, sequencia: 3 };
  const redundante = montarRelatorioHora(Object.assign({}, base,
    { proxWp: { nome: 'Macaé', distNM: 8, brg: 35 }, referencia: 'Macaé, 6,2 milhas a noroeste', referenciaMudou: true }));
  ok(!redundante.partes.includes('referencia-mudou'), 'repetiu o nome do waypoint como referência');
  const util = montarRelatorioHora(Object.assign({}, base,
    { proxWp: { nome: 'WP 4', distNM: 18, brg: 35 }, referencia: 'Macaé, 6,2 milhas a noroeste', referenciaMudou: true }));
  ok(util.partes.includes('referencia-mudou'), 'engoliu o marco de singradura quando ele era útil');
  // E não repete de hora em hora: só no instante da mudança.
  const parada = montarRelatorioHora(Object.assign({}, base,
    { proxWp: { nome: 'WP 4', distNM: 18, brg: 35 }, referencia: 'Macaé, 6,2 milhas a noroeste' }));
  ok(!parada.partes.includes('referencia-mudou'), 'anuncia a referência toda hora — vira ruído');
});

t(S22, '22.12', 'Zero à direita some da fala: "28 milhas", não "28,0"', () => {
  /* "vinte e oito vírgula zero" faz o ouvido tropeçar numa sílaba que não
     carrega informação. Na tela o zero alinha colunas; no ouvido, não serve
     para nada. */
  ok(falarNum(28) === '28', falarNum(28));
  ok(falarNum(9) === '9', falarNum(9));
  ok(falarNum(9.5) === '9,5', falarNum(9.5));
  ok(falarNum(0.42, 2) === '0,42', 'as casas pedidas foram cortadas: ' + falarNum(0.42, 2));
  ok(falarNum(1.0, 2) === '1', falarNum(1.0, 2));
  const r = montarRelatorioHora({ quando: new Date(2026, 8, 20, 17, 0), cog: 35, sog: 9, sequencia: 2,
                                  proxWp: { nome: 'WP', distNM: 28, brg: 35 } });
  ok(!/,0\b/.test(r.texto), 'sobrou zero à direita no relatório: ' + r.texto);
});

/* ═══════════════════════════════════════════════════════════════════════════
   SUÍTE 23 · Faixa econômica de rotação (Sprint 4)                (v2.11.0)

   Conselho de rotação que chega errado custa combustível ou custa ETA — e a
   voz da Iara é convincente. Por isso esta suíte confere a física contra
   casos que se resolvem na mesa, e não só a coerência do código consigo mesmo.

   A prova 23.6 é a mais importante: o ótimo de 1,5×Vc contra corrente NÃO foi
   codificado como piso. Ele EMERGE da minimização numérica — e emerge certo
   também nos casos de corrente de través, que nenhuma regra de bolso cobre.
   ═══════════════════════════════════════════════════════════════════════════ */
const S23 = '23 · Faixa econômica de RPM';
const { fracaoMCR, curvaDoMotor, velocidadeDoRpm, rpmDaVelocidade, velocidadeDeCasco,
        consumoHora, consumoPorMilha, combustivelAteDestino, faixaEconomica,
        diagnosticoDeCarga, aprenderCurva, montarFalaComOrcamento,
        MOTOR_PADRAO, CONSUMO_MCR_BAIXA, CONSUMO_TOLERANCIA,
        CONSUMO_MIN_AMOSTRAS, REL_PRIORIDADE } = A;
const fs23 = require('fs');
const CONS23 = semComentarios(fs23.readFileSync(ROOT + '/assets/js/consumo.js', 'utf8'));
const APP23 = semComentarios(fs23.readFileSync(ROOT + '/app.html', 'utf8'));

/* O ASD 2810 de Charlie Bravo: lenta 650, cruzeiro 1250, máxima 1800.
   Ancorado em 11 nós e 180 L/h no cruzeiro. */
const CURVA = () => curvaDoMotor({ speedKnots: 11, fuelConsumption: 180, loa: 28.67 });

t(S23, '23.1', 'A lei da hélice: −10% de rotação = −27% por hora, −19% por milha', () => {
  /* P ∝ n³ e V ∝ n, logo L/h ∝ n³ e L/NM ∝ n². São os números que sustentam
     o sprint inteiro; se eles saírem errados, todo conselho sai errado. */
  const c = CURVA();
  eq(consumoHora(1125, c) / consumoHora(1250, c), 0.729, 0.001, 'consumo por hora a −10% de rotação');
  eq(consumoPorMilha(1125, c) / consumoPorMilha(1250, c), 0.810, 0.001, 'consumo por milha a −10%');
  eq(velocidadeDoRpm(1125, c) / velocidadeDoRpm(1250, c), 0.9, 0.001, 'velocidade a −10%');
  // A curva passa pelo ponto declarado — se não passar, tudo está deslocado.
  eq(velocidadeDoRpm(1250, c), 11, 1e-9, 'a curva não passa pela velocidade declarada');
  eq(consumoHora(1250, c), 180, 1e-9, 'a curva não passa pelo consumo declarado');
  eq(rpmDaVelocidade(11, c), 1250, 1e-9, 'a inversa não fecha com a direta');
});

t(S23, '23.2', 'Este rebocador CRUZA a 33% da MCR — e isso não é defeito', () => {
  /* O motor é dimensionado para o TIRO À POSTE, não para o trânsito: 100% da
     MCR acontece com o navio quase parado, puxando. É por isso que o "piso de
     SFOC em 70–85% da MCR", que vale para um cargueiro, NÃO se aplica aqui —
     aplicá-lo proibiria o próprio regime de cruzeiro. */
  eq(fracaoMCR(1800, MOTOR_PADRAO), 1, 1e-9, 'a máxima devia ser 100% da MCR');
  eq(fracaoMCR(1250, MOTOR_PADRAO) * 100, 33.5, 0.5, 'carga no cruzeiro');
  ok(fracaoMCR(650, MOTOR_PADRAO) < 0.06, 'carga na marcha lenta ficou alta demais');
  // Monotônica e cúbica: dobrar a rotação multiplica a carga por oito.
  eq(fracaoMCR(900, MOTOR_PADRAO) / fracaoMCR(450, MOTOR_PADRAO), 8, 1e-6, 'não é cúbica');
});

t(S23, '23.3', 'A velocidade de casco existe, e além dela o L/NM dispara', () => {
  /* A primeira versão previa 15,8 nós a 1800 rotações. Um ASD 2810 não faz
     isso: num casco de deslocamento, a partir da velocidade de casco o navio
     sobe na própria onda de proa e a resistência vai ao céu. */
  const vh = velocidadeDeCasco(28.67);
  ok(vh > 12 && vh < 15, `velocidade de casco de um casco de 28,7 m deu ${vh.toFixed(1)} nós`);
  const c = CURVA();
  // A velocidade PARA de crescer, mas o consumo continua com n³.
  eq(velocidadeDoRpm(1800, c), velocidadeDoRpm(1650, c), 0.05, 'a velocidade não travou no teto');
  ok(consumoPorMilha(1800, c) > consumoPorMilha(1650, c) * 1.2,
     'forçar rotação além da velocidade de casco devia disparar o L/NM');
  // Sem LOA declarada não há teto — e essa é a consequência documentada.
  ok(!isFinite(velocidadeDeCasco(null)), 'inventou teto sem comprimento declarado');
  ok(velocidadeDoRpm(1800, curvaDoMotor({ speedKnots: 11, fuelConsumption: 180 })) > 15,
     'sem LOA a curva devia extrapolar — o comportamento está documentado');
  return { detail: `teto de ${vh.toFixed(1)} nós para 28,67 m de LOA` };
});

t(S23, '23.4', 'Sem pressa e sem corrente, o mais econômico é o mais devagar', () => {
  const r = faixaEconomica({ curva: CURVA(), distNM: 100 });
  ok(r.possivel, 'não achou solução');
  eq(r.rpmSugerido, MOTOR_PADRAO.lenta, MOTOR_PADRAO.lenta * 0.02,
     `sem restrição o ótimo devia ser a marcha lenta, deu ${r.rpmSugerido}`);
  ok(r.pisoQueManda === 'consumo', `quem manda devia ser o consumo, deu "${r.pisoQueManda}"`);
});

t(S23, '23.5', 'O relógio manda quando manda, e ele DIZ que está mandando', () => {
  /* Conselho sem motivo é ordem, e a regra 6 diz que a Iara sugere. Saber
     QUEM manda no número é o que permite ao comandante discordar com base. */
  const c = CURVA();
  const r = faixaEconomica({ curva: c, distNM: 100, horasDisponiveis: 10, rpmAtual: 1250 });
  ok(r.pisoQueManda === 'eta', `com 100 NM em 10 h quem manda é o relógio, deu "${r.pisoQueManda}"`);
  ok(r.rpmSugerido > r.rpmOtimoSemEta, 'o ETA devia empurrar a rotação para cima do ótimo puro');
  ok(r.litros > r.litrosOtimoSemEta, 'o relógio devia custar combustível');
  // E quando nem a máxima chega, isso é AVISO, não conselho.
  const imp = faixaEconomica({ curva: c, distNM: 100, horasDisponiveis: 4, rpmAtual: 1250 });
  ok(imp.pisoQueManda === 'maxima', 'não reconheceu ETA inalcançável');
  ok(imp.avisos.some(a => a.tipo === 'eta-inalcancavel'), 'não avisou que o horário é impossível');
});

t(S23, '23.6', 'O ótimo de 1,5×Vc EMERGE — não foi codificado como piso', () => {
  /* Esta é a prova que justifica ter minimizado numericamente em vez de
     colar um piso. Minimizando n³/(c·n − Vc) a derivada zera em V = 1,5·Vc.
     Um piso escrito à mão valeria só para corrente de proa; o otimizador
     acerta também de través, onde o navio caranguejeia e a conta muda. */
  const c = CURVA();
  /* Só onde o ótimo CABE na faixa do motor. Com 3 nós de corrente o ótimo
     teórico seriam 4,5 nós, que pedem 511 rotações — abaixo da marcha lenta
     de 650. Aí quem manda é o motor, não a conta, e exigir 1,5×Vc seria
     cobrar da fórmula uma rotação que não existe. */
  for (const vc of [4, 5]) {
    const r = faixaEconomica({ curva: c, distNM: 200, rumo: 0, setCorrente: 180, driftNos: vc });
    const vOtima = velocidadeDoRpm(r.rpmOtimoSemEta, c);
    ok(rpmDaVelocidade(1.5 * vc, c) > MOTOR_PADRAO.lenta, `o caso de ${vc} nós saiu da faixa do motor`);
    eq(vOtima, 1.5 * vc, 0.15, `corrente contrária de ${vc} nós: V ótima devia ser ${1.5 * vc}`);
  }
  /* E quando o ótimo fica abaixo da marcha lenta, a resposta correta é a
     marcha lenta — não uma rotação inventada. */
  const fraca = faixaEconomica({ curva: c, distNM: 200, rumo: 0, setCorrente: 180, driftNos: 3 });
  ok(rpmDaVelocidade(4.5, c) < MOTOR_PADRAO.lenta, 'premissa do caso mudou');
  eq(fraca.rpmOtimoSemEta, MOTOR_PADRAO.lenta, MOTOR_PADRAO.lenta * 0.02,
     'com o ótimo abaixo da lenta, a resposta devia ser a própria marcha lenta');
  // Corrente A FAVOR não tem fundo: mais devagar é sempre melhor.
  const favor = faixaEconomica({ curva: c, distNM: 200, rumo: 0, setCorrente: 0, driftNos: 3 });
  eq(favor.rpmOtimoSemEta, MOTOR_PADRAO.lenta, MOTOR_PADRAO.lenta * 0.02,
     'com corrente a favor o ótimo devia ser a marcha lenta');
  return { detail: '1,5×Vc reproduzido em 4 e 5 nós; em 3 nós manda a marcha lenta' };
});

t(S23, '23.7', 'Corrente que anula o avanço não vira divisão por zero', () => {
  /* SOG nula não é "muito devagar": é NÃO CHEGAR NUNCA. A divisão explodiria
     em silêncio e o ETA sairia como Infinity, que a fala leria como nada. */
  const c = CURVA();
  const r = faixaEconomica({ curva: c, distNM: 50, rumo: 0, setCorrente: 180, driftNos: 7, rpmAtual: 1250 });
  ok(r.possivel, 'desistiu quando ainda havia rotações viáveis');
  ok(isFinite(r.litros) && r.litros > 0, 'o combustível saiu infinito ou nulo');
  ok(r.avisos.some(a => a.tipo === 'corrente-forte'), 'não avisou que abaixo de certa rotação não se avança');
  // E o caso em que NENHUMA rotação vence a corrente.
  const perdido = faixaEconomica({ curva: c, distNM: 50, rumo: 0, setCorrente: 180, driftNos: 20 });
  ok(!perdido.possivel, 'disse que dá para vencer 20 nós de corrente com um navio de 11');
  // Uma amostra isolada também precisa se defender.
  const s = combustivelAteDestino(700, c, { distNM: 50, rumo: 0, setCorrente: 180, driftNos: 20 });
  ok(s && !s.possivel, 'combustivelAteDestino devolveu conta com corrente invencível');
});

t(S23, '23.8', 'Marcha lenta prolongada é AVISO de máquinas, não piso de consumo', () => {
  /* A conta do consumo empurra sempre para baixo. Mas rodar horas em carga
     muito baixa suja turbo, molha camisa e enche o escape de óleo não
     queimado — e isso não aparece no totalizador de combustível. A Iara não
     vê a cor do escape nem sente o cheiro da praça. O chefe vê. Por isso aqui
     não há PISO: há um aviso, e a decisão fica com quem pode tomá-la. */
  const r = faixaEconomica({ curva: CURVA(), distNM: 100 });
  ok(r.rpmSugerido === MOTOR_PADRAO.lenta,
     'virou piso: a conta devia continuar podendo sugerir a marcha lenta');
  ok(r.avisos.some(a => a.tipo === 'carga-baixa'), 'não avisou sobre carga baixa prolongada');
  const aviso = r.avisos.find(a => a.tipo === 'carga-baixa');
  ok(/máquinas/i.test(aviso.texto), 'o aviso não devolve a decisão a quem é dela: ' + aviso.texto);
  ok(CONSUMO_MCR_BAIXA > 0.05 && CONSUMO_MCR_BAIXA < 0.33,
     'o limiar de carga baixa invadiu o regime de cruzeiro deste rebocador');
});

t(S23, '23.9', 'O conselho pode ser ACELERAR, e os sinais são declarados', () => {
  /* A primeira versão só sabia mandar reduzir e devolvia "economia −485 L,
     atraso −140 min": correto e ilegível. Número negativo com rótulo positivo
     é a forma mais eficiente de fazer alguém entender o contrário. */
  const c = CURVA();
  const acelera = faixaEconomica({ curva: c, distNM: 100, rumo: 0, setCorrente: 180,
                                   driftNos: 4, horasDisponiveis: 12, rpmAtual: 1250 });
  ok(acelera.recomendacao === 'aumentar', `devia mandar acelerar, deu "${acelera.recomendacao}"`);
  ok(acelera.economiaL < 0, 'acelerar devia custar combustível (economia negativa)');
  ok(acelera.atrasoMin < 0, 'acelerar devia chegar mais cedo (atraso negativo)');
  const reduz = faixaEconomica({ curva: c, distNM: 100, horasDisponiveis: 14, rpmAtual: 1250 });
  ok(reduz.recomendacao === 'reduzir' && reduz.economiaL > 0 && reduz.atrasoMin > 0, 'sinais trocados ao reduzir');
  // E não cutuca por diferença pequena.
  const perto = faixaEconomica({ curva: c, distNM: 100, horasDisponiveis: 9.2, rpmAtual: 1250 });
  ok(perto.recomendacao === 'manter', `${perto.rpmSugerido} vs 1250 não devia virar conselho`);
  ok(CONSUMO_TOLERANCIA > 0.01 && CONSUMO_TOLERANCIA < 0.15, 'tolerância fora da faixa defensável');
});

t(S23, '23.10', 'Carga lida vs. esperada: a discrepância é medida e nomeada', () => {
  /* A curva livre prevê carga = (n/n_máx)³. Mais que isso na mesma rotação
     significa que o navio trabalha mais do que trabalharia solto: reboque,
     casco sujo, mar de proa, água rasa. A Iara NÃO escolhe entre elas — ela
     mede a diferença e entrega a lista ao chefe. */
  const d = diagnosticoDeCarga(1250, 52, MOTOR_PADRAO);
  eq(d.esperadaPct, 33.5, 0.5, 'carga esperada no cruzeiro');
  ok(d.situacao === 'pesado', `52% contra 33% esperados devia ser "pesado", deu "${d.situacao}"`);
  ok(/reboque|casco|mar de proa/i.test(d.texto), 'não nomeia as causas possíveis');
  ok(!/avaria grave|pare|reduza/i.test(d.texto), 'a Iara escolheu um diagnóstico em vez de listar');
  ok(diagnosticoDeCarga(1250, 34, MOTOR_PADRAO).situacao === 'normal', '34% contra 33,5% virou anormal');
  ok(diagnosticoDeCarga(1250, 20, MOTOR_PADRAO).situacao === 'leve', 'não reconheceu motor mais leve');
  // Perto da marcha lenta a razão explode — e aí não se diz nada.
  ok(diagnosticoDeCarga(200, 30, MOTOR_PADRAO) === null, 'produziu diagnóstico onde a razão é instável');
  ok(diagnosticoDeCarga(1250, 0, MOTOR_PADRAO) === null, 'carga zero virou diagnóstico');
});

t(S23, '23.11', 'A curva se reancora no casco REAL, com guardas contra ruído', () => {
  /* Reancora-se o PONTO, não o expoente: a lei da hélice é física e não se
     mede com meia dúzia de pontos ruidosos. Ajustar expoente com poucos dados
     é o caminho curto para uma curva que descreve lindamente o ruído de ontem
     e erra o de amanhã. */
  const base = CURVA();
  // Um casco 10% mais lento que o plano, com espalhamento de rotação.
  const am = [{ rpm: 1000, sog: 7.9, lh: 92 }, { rpm: 1150, sog: 9.1, lh: 140 },
              { rpm: 1250, sog: 9.9, lh: 180 }, { rpm: 1400, sog: 11.1, lh: 253 }];
  const nova = aprenderCurva(am, base);
  ok(nova, 'não aprendeu com quatro amostras espalhadas');
  ok(nova.origem === 'aprendida', 'a procedência não viaja junto');
  eq(nova.vRef, 9.9, 0.15, 'a velocidade reancorada não bate com o medido');
  ok(nova.desvioV < 0.95, 'não percebeu que o casco está mais lento que o plano');
  // GUARDAS: poucas amostras, ou todas na mesma rotação, não ensinam nada.
  ok(aprenderCurva(am.slice(0, CONSUMO_MIN_AMOSTRAS - 1), base) === null, 'aprendeu com amostras de menos');
  ok(aprenderCurva([{ rpm: 1250, sog: 9.9, lh: 180 }, { rpm: 1252, sog: 9.9, lh: 181 },
                    { rpm: 1248, sog: 9.8, lh: 179 }, { rpm: 1250, sog: 10, lh: 180 }], base) === null,
     'quatro pontos na mesma rotação não dizem nada sobre a CURVA, só sobre o ponto');
  // Mediana, não média: um fixo de GPS ruim não pode mover a curva.
  const comRuido = am.concat([{ rpm: 1250, sog: 40, lh: 180 }]);
  const r2 = aprenderCurva(comRuido, base);
  ok(Math.abs(r2.vRef - nova.vRef) < 1.2, 'um único ponto absurdo deslocou a curva — não está usando mediana');
});

t(S23, '23.12', 'ORÇAMENTO DE FALA: 58 s de monólogo não acontecem duas vezes', () => {
  /* Com o Sprint 4 o relatório passou a ter quinze fontes de exceção. No pior
     caso realista todas dispararam e o resultado foram 58 SEGUNDOS — o teto
     era 30. Cortar frase por frase não resolveria: o problema não é uma frase
     longa, é a soma de quinze coisas legítimas. */
  const segs = [
    { chave: 'hora', texto: 'Quatorze horas em ponto.' },
    { chave: 'posicao', texto: 'Posição vinte e três graus e cinco sul, quarenta e um graus e cinquenta e três oeste.' },
    { chave: 'xte-preocupa', texto: 'Atenção: zero vírgula quatro dois milhas fora de rumo, pra bombordo.' },
    { chave: 'rpm-reduzir', texto: 'Dá pra fazer o horário com oitocentas e quinze rotações economizando novecentos e quarenta e um litros e chegando quatro horas mais tarde.' },
    { chave: 'mar', texto: 'Mar de lés-nordeste, dois vírgula um metros, período de seis segundos, com ondulação longa de sudeste vindo de muito longe.' },
    { chave: 'barometro', texto: 'Barômetro mil e nove, estável, sem novidade nenhuma no horizonte por enquanto.' }
  ];
  /* 16 s, e não 12: com 12 nem a espinha cabia, e aí o corte chegava ao aviso
     de fora de rumo por falta de alternativa — o que mediria a aperto do teto,
     não a ordem de prioridade. A prova precisa de folga para provar a ORDEM. */
  const r = montarFalaComOrcamento(segs, 16);
  ok(duracaoFaladaS(r.texto) <= 16 + 2, `estourou o teto: ${duracaoFaladaS(r.texto).toFixed(0)} s`);
  // A ESPINHA nunca cai.
  ok(r.partes.includes('hora') && r.partes.includes('posicao'), 'cortou a espinha do relatório');
  // Segurança sobrevive à economia.
  ok(r.partes.includes('xte-preocupa'), 'cortou o aviso de fora de rumo e manteve coisa menos urgente');
  ok(!r.partes.includes('rpm-reduzir'), 'manteve o conselho de economia em vez de algo mais urgente');
  /* E CORTAR EM SILÊNCIO SERIA PIOR QUE FALAR DEMAIS: quem ouve precisa saber
     que houve mais, senão confia num retrato incompleto sem saber que é. */
  ok(r.cortados.length > 0 && /Tem mais \d+ no painel/.test(r.texto), 'cortou sem avisar: ' + r.texto);
  /* E COM ORÇAMENTO IMPOSSÍVEL A ESPINHA RESISTE. Um teto de 3 s não cabe nem
     a hora e a posição — e a resposta certa é entregar a espinha estourando o
     teto, não devolver um relatório sem posição. Um retrato sem posição não é
     um retrato curto: é outra coisa. */
  const apertado = montarFalaComOrcamento(segs, 3);
  ok(apertado.partes.includes('hora') && apertado.partes.includes('posicao'),
     'com teto impossível o orçamento comeu a espinha: ' + apertado.partes);
  ok(apertado.partes.every(k => REL_PRIORIDADE[k] === 0),
     'sobrou algo fora da espinha num teto de 3 s: ' + apertado.partes);
  // Ordem de LEITURA preservada: cortar não pode embaralhar.
  const pos = r.partes.map(k => segs.findIndex(x => x.chave === k));
  ok(pos.every((v, i) => i === 0 || v > pos[i - 1]), 'a ordem de leitura foi embaralhada pelo corte');
  return { detail: `${r.partes.length} mantidos, ${r.cortados.length} cortados` };
});

t(S23, '23.13', 'A prioridade é de PASSADIÇO, não de sprint', () => {
  /* O conselho de rotação é a entrega deste sprint e fica em penúltimo lugar.
     Economia de combustível é valiosa e NUNCA é urgente; "você está fora de
     rumo" e "o barômetro está caindo" são. E o conselho continua inteiro no
     painel, onde se lê com calma. */
  const p = k => REL_PRIORIDADE[k];
  ok(p('hora') === 0 && p('posicao') === 0 && p('proximo-wp') === 0, 'a espinha não está protegida');
  ok(p('xte-preocupa') < p('rpm-reduzir'), 'economia na frente de estar fora de rumo');
  ok(p('carga-pesado') < p('rpm-reduzir'), 'economia na frente do diagnóstico de máquinas');
  ok(p('barometro-atencao') < p('vento'), 'vento comum na frente de barômetro caindo');
  ok(p('combustivel-alerta') < p('combustivel'), 'saldo insuficiente com a mesma urgência do consumo de rotina');
  ok(p('rpm-aumentar') < p('rpm-reduzir'), 'perder o ETA tem a mesma urgência que economizar');
  // Todas as chaves que o relatório produz têm prioridade declarada.
  const REL = semComentarios(fs23.readFileSync(ROOT + '/assets/js/relatorio_voz.js', 'utf8'));
  /* Descarta o prefixo computado `pus('carga-' + situacao, …)`, que o regex
     enxerga como a chave "carga-". As duas chaves que ele produz de fato são
     conferidas logo abaixo, uma a uma. */
  const chaves = [...new Set((REL.match(/pus\('([a-z-]+)'/g) || []).map(m => m.slice(5, -1)))]
    .filter(k => !k.endsWith('-'));
  ['carga-pesado', 'carga-leve'].forEach(k =>
    ok(REL_PRIORIDADE[k] != null, `a chave computada ${k} não tem prioridade declarada`));
  const semPrio = chaves.filter(k => REL_PRIORIDADE[k] == null);
  ok(semPrio.length === 0, `sem prioridade declarada: ${semPrio} — cairiam no padrão sem ninguém decidir`);
  return { detail: `${chaves.length} chaves, todas com prioridade` };
});

t(S23, '23.14', '"Tem mais no painel" tem de ser VERDADE', () => {
  /* O Sprint 2 pôs vento, mar e corrente só na FALA. Quando o orçamento
     começou a cortar dizendo "tem mais no painel", a frase virou mentira: não
     havia painel nenhum para essas coisas. Ou se apagava a frase, ou se
     tornava verdade — e é mais útil torná-la verdade. */
  ok(/id="navTempo"/.test(fs23.readFileSync(ROOT + '/app.html', 'utf8')),
     'não há linha de tempo no painel, mas a fala promete que há');
  ok(/id="navEco"/.test(fs23.readFileSync(ROOT + '/app.html', 'utf8')), 'não há linha de conselho no painel');
  ok(/atualizarPainelTempo\(\)/.test(APP23), 'a linha de tempo nunca é preenchida');
  ok(/atualizarPainelEco\(\)/.test(APP23), 'a linha de conselho nunca é preenchida');
  // E a linha do painel traz o que a fala cortaria: vento, mar, corrente, pressão.
  const fn = semComentarios(fs23.readFileSync(ROOT + '/assets/js/tempo.js', 'utf8'));
  const i = fn.indexOf('function linhaDeTempoNoPainel');
  const corpo = fn.slice(i, fn.indexOf('\n}', i));
  ['wind_speed_10m', 'wave_height', 'ocean_current_velocity', 'pressure_msl'].forEach(v =>
    ok(corpo.includes(v), `a linha do painel não mostra ${v}`));
});

t(S23, '23.15', 'Os campos de máquinas existem e rejeitam dedo escorregado', () => {
  const app = fs23.readFileSync(ROOT + '/app.html', 'utf8');
  for (const id of ['navRpm', 'navCarga']) {
    const m = new RegExp('<input[^>]*id="' + id + '"[^>]*>').exec(app);
    ok(m, `o campo ${id} não existe`);
    ok(/inputmode="numeric"/.test(m[0]), `${id} não abre o teclado numérico no tablete`);
    ok(/aria-label="/.test(m[0]), `${id} sem rótulo para leitor de tela`);
    ok(!/onchange=|oninput=/.test(m[0]), `${id} usa manipulador inline e piora a CSP (aviso 9.7)`);
  }
  ok(/addEventListener\('change', lerMaquinas\)/.test(CONS23), 'os campos não estão ligados por evento');
  /* E a ligação acontece no CARREGAMENTO, não no arranque da navegação. A
     prova de fumaça pegou os campos inertes até alguém apertar "navegar", e
     duas navegações seguidas empilhavam ouvintes no mesmo campo. */
  const arranque = APP23.slice(APP23.indexOf("pintarBotoesNav();"));
  ok(/ligarCamposDeMaquinas\(\)/.test(arranque), 'os campos só são ligados ao iniciar a navegação');
  ok(arranque.indexOf('ligarCamposDeMaquinas()') < arranque.indexOf('initMap()'),
     'os campos são ligados depois do mapa — somem se a CDN falhar');
  // Valor absurdo é ignorado em silêncio: não pode virar conselho de rotação.
  const i = CONS23.indexOf('function lerMaquinas');
  const corpo = CONS23.slice(i, CONS23.indexOf('\n}', i));
  ok(/<= 3000/.test(corpo) && /<= 110/.test(corpo), 'não há faixa de validade para rotação e carga');
  ok(/localStorage\.setItem/.test(corpo), 'o que o chefe anotou não sobrevive ao recarregar');
});

t(S23, '23.16', 'Uma amostra por RELATÓRIO, não por fixo de GPS', () => {
  /* Colher a cada atualização de posição daria milhares de pontos
     correlacionados, todos do mesmo minuto de máquina, e a mediana ganharia
     uma confiança que ela não tem. */
  const REL = semComentarios(fs23.readFileSync(ROOT + '/assets/js/relatorio_voz.js', 'utf8'));
  ok(/colherAmostraDeMaquina\(/.test(REL), 'a amostra nunca é colhida');
  const iProc = APP23.indexOf('function processFix');
  const corpoFix = APP23.slice(iProc, iProc + 4000);
  ok(!/colherAmostraDeMaquina/.test(corpoFix), 'está colhendo amostra a cada fixo de GPS');
  // E sem rotação informada não há par (rpm, velocidade): o ponto não serve.
  const i = CONS23.indexOf('function colherAmostraDeMaquina');
  const corpo = CONS23.slice(i, CONS23.indexOf('\n}', i));
  ok(/if \(!maqRpm/.test(corpo), 'colheria amostra sem rotação informada');
});

/* ═══════════════════════════════════════════════════════════════════════════
   SUÍTE 24 · Ondas e estabilidade pelos sensores (Sprint 5)        (v2.12.0)

   Não há como verificar um espectro de ondas sem ir ao mar — a não ser
   fabricando um mar de Hs e Tp conhecidos e cobrando o algoritmo de volta.
   É o que tests/mar_sintetico.js faz, e é o que esta suíte usa.

   A prova 24.9 é a mais importante de todo o projeto: o GM estimado pelo
   período de balanço. Não porque seja a mais difícil, mas porque é a única
   que, se estiver errada, pode contribuir para emborcar um rebocador. Por
   isso ela confere o número E as três ressalvas que o acompanham.
   ═══════════════════════════════════════════════════════════════════════════ */
const S24 = '24 · Ondas e estabilidade';
const { fft, densidadeEspectral, espectroDeHeave, momentos, alturaSignificativa,
        parametrosDeMar, comprimentoDeOnda, confiabilidadeDaOnda, coeficienteC,
        gmDoPeriodo, periodoDeBalanco, periodoDeEncontro, alertaDeRessonancia,
        qualidadeDoBalanco, aceleracaoVerticalDoModulo, alimentarSensorDeMar,
        estadoDoMarMedido, tendenciaDoGm, recortePotenciaDe2,
        ONDA_F_MIN, ONDA_F_MAX, ONDA_G, ONDA_TAXA_HZ, ONDA_JANELA,
        ONDA_MIN_JANELA, ONDA_RESSONANCIA_TOL, ONDA_GM_QUEDA_ALERTA } = A;
const { marSintetico } = require('./mar_sintetico.js');
const fs24 = require('fs');
const OND24 = semComentarios(fs24.readFileSync(ROOT + '/assets/js/ondas.js', 'utf8'));
const APP24 = semComentarios(fs24.readFileSync(ROOT + '/app.html', 'utf8'));
const DT = 1 / ONDA_TAXA_HZ;

/* Aceleração de uma senoide de elevação: ä = −a·ω²·sen(ωt). */
const senoide = (N, T, amp) =>
  Array.from({ length: N }, (_, i) => -amp * Math.pow(2 * Math.PI / T, 2) * Math.sin(2 * Math.PI * i * DT / T));

t(S24, '24.1', 'A FFT é uma FFT — conferida contra o que se calcula à mão', () => {
  /* Antes de confiar num espectro de ondas, confia-se na transformada. Uma
     senoide de 4 ciclos em 16 pontos tem de pôr TODA a energia no bin 4. */
  const n = 16, k0 = 4;
  const x = Array.from({ length: n }, (_, i) => Math.cos(2 * Math.PI * k0 * i / n));
  const { re, im } = fft(x);
  eq(re[k0], n / 2, 1e-9, 'a energia não caiu no bin certo');
  for (let k = 1; k < n / 2; k++) {
    if (k === k0) continue;
    ok(Math.hypot(re[k], im[k]) < 1e-9, `vazou energia para o bin ${k}`);
  }
  // Constante -> tudo no bin 0.
  const c = fft(new Array(8).fill(3));
  eq(c.re[0], 24, 1e-9, 'a média não caiu no bin zero');
  // Comprimento que não é potência de 2 tem de ESTOURAR, não devolver lixo.
  let estourou = false;
  try { fft([1, 2, 3]); } catch (e) { estourou = true; }
  ok(estourou, 'aceitou comprimento que não é potência de 2 — devolveria espectro sem sentido');
  // E o recorte descarta o COMEÇO: o fim é o presente.
  const r = recortePotenciaDe2([1, 2, 3, 4, 5]);
  ok(r.length === 4 && r[3] === 5, 'o recorte jogou fora o presente em vez do passado');
});

t(S24, '24.2', 'Hs de uma senoide é 2,83·a — e a definição é essa mesma', () => {
  /* Hs = 4√m₀ é a definição espectral (Hm0) e vale para mar aleatório. Para
     onda REGULAR ela não dá a altura: uma senoide de amplitude a tem altura
     H = 2a mas m₀ = a²/2, logo Hs = 2,83·a = 1,41·H. Não é erro do código: é
     a definição, e quem conferir com senoide precisa esperar isso. */
  const p = parametrosDeMar(espectroDeHeave(senoide(2048, 9, 1.0), DT));
  eq(p.Hs, 2 * Math.SQRT2, 0.01, 'Hs de senoide de amplitude 1');
  eq(p.Tp, 9, 0.2, 'período de pico');
  // E o pipeline é exato em qualquer comprimento — 256 amostras inclusive.
  [1024, 512, 256].forEach(N => {
    const q = parametrosDeMar(espectroDeHeave(senoide(N, 9, 1.0), DT));
    ok(Math.abs(q.Hs / (2 * Math.SQRT2) - 1) < 0.02, `N=${N}: erro de ${(100 * (q.Hs / 2.828 - 1)).toFixed(1)}%`);
  });
});

t(S24, '24.3', 'Mar Pierson-Moskowitz: recupera Hs e Tp DA ACELERAÇÃO', () => {
  /* A prova central do espectro. Fabrica-se um mar de Hs conhecido, integra-se
     mentalmente para aceleração, e cobra-se o Hs de volta. Se isto fecha, a
     divisão por ω⁴, a janela de Hann, a correção 8/3 e os momentos estão
     todos certos ao mesmo tempo. */
  const erros = [];
  for (const [hs, tp] of [[2.5, 9], [1.2, 6], [4.0, 12]]) {
    const m = marSintetico({ Hs: hs, Tp: tp, n: 2048, dt: DT, semente: Math.round(hs * 1000) });
    const q = parametrosDeMar(espectroDeHeave(Array.from(m.acel), DT));
    const erro = q.Hs / m.HsReal - 1;
    erros.push(`${hs}m: ${(100 * erro).toFixed(1)}%`);
    ok(Math.abs(erro) < 0.08, `Hs de ${hs} m saiu com ${(100 * erro).toFixed(1)}% de erro`);
    ok(Math.abs(q.Tp / tp - 1) < 0.15, `Tp de ${tp} s saiu ${q.Tp.toFixed(1)}`);
    /* Tz/Tp de um Pierson-Moskowitz fica perto de 0,71–0,75. Sai de graça e
       é uma conferência independente: se o m₂ estivesse errado, esta razão
       denunciaria mesmo com o Hs certo. */
    ok(q.Tz / q.Tp > 0.6 && q.Tz / q.Tp < 0.9, `Tz/Tp = ${(q.Tz / q.Tp).toFixed(2)} fora do esperado`);
  }
  return { detail: erros.join(' · ') };
});

t(S24, '24.4', 'A banda corta o que a divisão por ω⁴ tornaria absurdo', () => {
  /* Em 0,01 Hz o fator 1/ω⁴ é 2,5 milhões de vezes maior que em 0,3 Hz. Sem
     o corte, a deriva do acelerômetro vira um "mar" de dezenas de metros —
     medido: a energia descartada abaixo de 0,03 Hz chega a ser 99% do total
     bruto. */
  const N = 2048;
  const lenta = Array.from({ length: N }, (_, i) => 0.002 * Math.sin(2 * Math.PI * i * DT / 300));
  const p = parametrosDeMar(espectroDeHeave(lenta, DT));
  ok(!p || !isFinite(p.Hs) || p.Hs < 0.2,
     `uma oscilação de 300 s virou mar de ${p && p.Hs ? p.Hs.toFixed(1) : '?'} m`);
  // E uma deriva pura (rampa) não pode virar onda nenhuma.
  const deriva = Array.from({ length: N }, (_, i) => 0.01 * i / N);
  const d = parametrosDeMar(espectroDeHeave(deriva, DT));
  ok(!d || !isFinite(d.Hs) || d.Hs < 0.2, 'viés do acelerômetro virou onda');
  ok(ONDA_F_MIN > 0.01 && ONDA_F_MIN < 0.06, 'a borda inferior da banda saiu da faixa defensável');
  ok(ONDA_F_MAX >= 0.4 && ONDA_F_MAX <= 1, 'a borda superior da banda saiu da faixa defensável');
});

t(S24, '24.5', 'A JANELA MÍNIMA É A INTEIRA — e isso foi medido, não arbitrado', () => {
  /* Com meia janela o algoritmo perdia 13% do Hs. A causa: num registro curto
     parte da variância do deslocamento aparece abaixo de 0,03 Hz, onde a
     banda a descarta com razão. Não é defeito do espectro — com senoides
     puras ele é exato a 0,0% até em 256 amostras (prova 24.2). É que um mar
     real, olhado por pouco tempo, tem deriva lenta que não se distingue de
     onda longa. Boia de onda usa 20 a 30 minutos pelo mesmo motivo. */
  ok(ONDA_MIN_JANELA === ONDA_JANELA,
     `a janela mínima (${ONDA_MIN_JANELA}) é menor que a inteira (${ONDA_JANELA}) — volta o erro de 13%`);
  const minutos = ONDA_JANELA / ONDA_TAXA_HZ / 60;
  ok(minutos >= 15 && minutos <= 35, `janela de ${minutos.toFixed(0)} min fora da prática de boia`);
  // E enquanto não encher, NÃO se devolve número: diz quanto falta.
  A.zerarMar();
  const e = estadoDoMarMedido(10, 0);
  ok(e && e.pronto === false, 'devolveu estado de mar com a janela vazia');
  ok(e.faltamS > 0, 'não diz quanto falta para medir');
  return { detail: `${minutos.toFixed(0)} min a ${ONDA_TAXA_HZ} Hz` };
});

t(S24, '24.6', '|a|−g aguenta o navio jogando — foi escolhido por medição', () => {
  /* Havia dois caminhos: girar o vetor pela atitude fundida, ou tomar o
     módulo e subtrair g. O primeiro é teoricamente melhor e depende de
     acertar a convenção de sinais do DeviceOrientation, que varia com
     aparelho e montagem — e um sinal trocado ali não aparece como erro,
     aparece como espectro plausível e errado. O segundo é imune a convenção.
     Mediu-se, e o módulo se segura em ±0,5% até 20° de jogo. */
  const N = 2048, g = ONDA_G;
  const m = marSintetico({ Hs: 2.5, Tp: 9, n: N, dt: DT, semente: 7 });
  for (const rollAmp of [0, 10, 20]) {
    const mod = [];
    for (let i = 0; i < N; i++) {
      const phi = rollAmp * Math.PI / 180 * Math.sin(2 * Math.PI * i * DT / 6.3);
      const ez = g + m.acel[i];
      mod.push(aceleracaoVerticalDoModulo(0, -ez * Math.sin(phi), ez * Math.cos(phi)));
    }
    const hs = parametrosDeMar(espectroDeHeave(mod, DT)).Hs;
    ok(Math.abs(hs / m.HsReal - 1) < 0.05,
       `com ${rollAmp}° de jogo o Hs saiu com ${(100 * (hs / m.HsReal - 1)).toFixed(1)}% de erro`);
  }
  eq(aceleracaoVerticalDoModulo(0, 0, ONDA_G), 0, 1e-9, 'parado devia dar aceleração vertical nula');
  /* A PROVA DECISIVA, e a que faltava: PARADO E ADERNADO tem de ler ZERO.
     Com o eixo z cru, um navio adernado 20° em água parada acusa −0,59 m/s²
     — 6% de g de viés permanente, oscilando no período de BALANÇO, que cai
     bem no meio da banda de onda. Vira mar do nada. A tolerância de 5% no Hs
     não pegava isso; esta pega. */
  for (const grau of [10, 20, 30]) {
    const phi = grau * Math.PI / 180;
    const lido = aceleracaoVerticalDoModulo(0, -ONDA_G * Math.sin(phi), ONDA_G * Math.cos(phi));
    ok(Math.abs(lido) < 1e-6,
       `parado e adernado ${grau}° o sensor acusou ${lido.toFixed(3)} m/s² de aceleração vertical`);
  }
});

t(S24, '24.7', 'De ponta a ponta: 60 Hz de aparelho até o Hs e o GM', () => {
  /* A prova que exercita o caminho inteiro — decimação, relógio, espectro,
     balanço e estabilidade — como acontece a bordo. */
  /* Alimenta-se EXATAMENTE a duração de uma janela. Alimentar de sobra
     mascarava a deriva do relógio: o excedente reenchia o que a deriva
     perdia, e 2004 amostras viravam 2048 pelo caminho errado. */
  const g = ONDA_G, dtDisp = 1 / 60;
  /* Uma janela MAIS UM PASSO: a primeira chamada só ancora o relógio e não
     emite amostra, então alimentar exatamente 1024 s deixa o buffer com 2047. */
  const nDisp = Math.round(60 * (ONDA_JANELA / ONDA_TAXA_HZ + 1 / ONDA_TAXA_HZ));
  A.setCasco({ loa: 28.6, boca: 10.2, calado: 4.80 });
  A.setTempoAtual({ mar: { wave_height: 2.4, wave_direction: 90 } });
  const m = marSintetico({ Hs: 2.5, Tp: 9, n: nDisp, dt: dtDisp, semente: 11 });
  A.zerarMar();
  let t0 = 0;
  for (let i = 0; i < nDisp; i++) {
    t0 += dtDisp * 1000;
    const phi = 8 * Math.PI / 180 * Math.sin(2 * Math.PI * (i * dtDisp) / 6.3);
    const ez = g + m.acel[i];
    alimentarSensorDeMar(aceleracaoVerticalDoModulo(0, -ez * Math.sin(phi), ez * Math.cos(phi)),
                         phi * 180 / Math.PI, t0);
  }
  const e = estadoDoMarMedido(10, 0);
  ok(e.pronto, 'não encheu a janela em 18 minutos de sensor a 60 Hz');
  /* O RELÓGIO AVANÇA POR PASSO, NÃO PELA CHEGADA. `marUltimoT = t` produzia
     1,97 Hz em vez de 2 e retinha 2004 amostras onde cabiam 2048 — e o
     recorte por potência de 2 caía para 1024, metade do registro. */
  ok(e.janelaS >= ONDA_JANELA / ONDA_TAXA_HZ - 1,
     `a janela encolheu para ${e.janelaS} s — o relógio do coletor está derivando`);
  ok(Math.abs(e.Hs / m.HsReal - 1) < 0.08,
     `Hs de ponta a ponta com ${(100 * (e.Hs / m.HsReal - 1)).toFixed(1)}% de erro`);
  eq(e.balanco.periodoS, 6.3, 0.25, 'período de balanço recuperado do jogo simulado');
  ok(e.gm && e.gm.gm > 1 && e.gm.gm < 3, `GM implausível: ${e.gm && e.gm.gm}`);
  return { detail: `janela ${e.janelaS} s · Hs ${e.Hs.toFixed(2)} (${(100 * (e.Hs / m.HsReal - 1)).toFixed(1)}%) · T_roll ${e.balanco.periodoS.toFixed(2)} s · GM ${e.gm.gm.toFixed(2)} m` };
});

t(S24, '24.8', 'O tablet mede o NAVIO, não o mar — e o rótulo vem junto', () => {
  /* λ = 1,56·T². Um rebocador de 28 m é boia sensível às ondas longas e surda
     às curtas. Não se corrige — corrigir exigiria o RAO deste casco, que
     ninguém levantou, e inventar um RAO seria o mesmo pecado de chamar lista
     de faróis de linha de costa. Rotula-se. */
  eq(comprimentoDeOnda(10), 156, 1, 'comprimento de onda de 10 s');
  eq(comprimentoDeOnda(4), 25, 1, 'comprimento de onda de 4 s');
  ok(confiabilidadeDaOnda(10, 28.6).nivel === 'boa', 'onda de 156 m devia ser confiável num casco de 28 m');
  ok(confiabilidadeDaOnda(4, 28.6).nivel === 'ruim', 'onda de 25 m devia ser marcada como pouco confiável');
  ok(/subestima/.test(confiabilidadeDaOnda(4, 28.6).texto), 'o rótulo não diz para que lado erra');
  ok(confiabilidadeDaOnda(10, null) === null, 'inventou confiabilidade sem comprimento de navio');
});

t(S24, '24.14', 'Jogo se mede em AMPLITUDE, não em altura', () => {
  /* Para onda usa-se Hs = 4√m₀ porque interessa a ALTURA, de cava a crista.
     Para balanço o marinheiro fala em AMPLITUDE, de prumo a bordo: "jogando
     10 graus" quer dizer 10 para cada lado. Usar a fórmula da onda daria
     18,7° para um jogo cuja amplitude dominante é 6,5° — quase o triplo, e
     seria lido como um mar muito pior do que o que está lá fora. */
  const N = 2048, dom = 6.5, sec = 1.2;
  const roll = Array.from({ length: N }, (_, i) =>
    dom * Math.sin(2 * Math.PI * i * DT / 6.3) + sec * Math.sin(2 * Math.PI * i * DT / 4.1 + 1));
  const b = periodoDeBalanco(roll, DT);
  eq(b.periodoS, 6.3, 0.1, 'período de balanço do jogo sintético');
  const esperado = 2 * Math.sqrt((dom * dom + sec * sec) / 2);      // 2·σ = 9,34°
  eq(b.amplitudeGraus, esperado, 0.3,
     `amplitude de jogo: ${b.amplitudeGraus.toFixed(1)}° contra ${esperado.toFixed(1)}° esperados`);
  ok(b.amplitudeGraus < dom * 2,
     'a amplitude saiu maior que o dobro da dominante — está usando a fórmula da ALTURA de onda');
  return { detail: `${b.amplitudeGraus.toFixed(1)}° de amplitude para dominante de ${dom}°` };
});

t(S24, '24.9', '⚠️ GM PELO PERÍODO DE BALANÇO — o número e as três ressalvas', () => {
  /* A prova mais importante do projeto, e não por ser difícil: é a única que,
     errada, pode contribuir para emborcar um rebocador.

        T_R = 2·C·B/√GM   ->   GM = (2·C·B/T_R)²
        C = 0,373 + 0,023·(B/d) − 0,043·(L/100)

     Para o ASD 2810 (B 10,43 · L 28,67 · d 4,8): C = 0,4106, 2CB = 8,57. */
  const B = 10.43, L = 28.67, d = 4.8;
  const cc = coeficienteC(B, L, d);
  eq(cc.c, 0.4106, 0.001, 'coeficiente C da IMO');
  ok(cc.plausivel, 'C fora da faixa plausível para este casco');
  // Os quatro pontos da tabela do manual.
  [[5, 2.94], [6, 2.04], [7, 1.50], [8, 1.15]].forEach(([T, gmEsperado]) =>
    eq(gmDoPeriodo(T, B, L, d).gm, gmEsperado, 0.02, `GM para T_R = ${T} s`));

  /* RESSALVA 1 — SENSIBILIDADE QUADRÁTICA. dGM/GM = −2·dT/T: 10% de erro no
     período vira 20% no GM. Quem recebe um GM sem saber disso confia demais. */
  const g6 = gmDoPeriodo(6, B, L, d);
  ok(g6.sensibilidade === 2, 'a sensibilidade quadrática não viaja junto do número');
  ok(g6.faixa && g6.faixa.min < g6.gm && g6.faixa.max > g6.gm, 'não devolve faixa de incerteza');
  ok(Math.abs((g6.faixa.max - g6.faixa.min) / g6.gm - 0.4) < 0.1,
     '±10% no período devia abrir ~±20% no GM — a faixa devolvida não reflete isso');

  /* RESSALVA 2 — SÓ VALE COM BALANÇO LIVRE. Se o encontro está perto do
     natural, o navio balança FORÇADO e o período medido é o do MAR. */
  const bal = { periodoS: 6.3, amplitudeGraus: 9 };
  ok(!qualidadeDoBalanco(bal, 6.3).confiavel, 'aceitou período de balanço forçado pela onda');
  ok(/forçado/.test(qualidadeDoBalanco(bal, 6.3).motivo), 'não explica por que recusou');
  ok(qualidadeDoBalanco(bal, 12).confiavel, 'recusou balanço livre sem motivo');
  // Balanço pequeno demais não tem pico: o "período" dali é sorteio.
  ok(!qualidadeDoBalanco({ periodoS: 6.3, amplitudeGraus: 0.4 }, 12).confiavel,
     'extraiu período de um balanço de 0,4 grau');
  ok(!qualidadeDoBalanco(null, 12).confiavel, 'sem sinal de balanço devolveu confiança');

  /* RESSALVA 3 — O C É EMPÍRICO. Casco fora da faixa devolve aviso em vez de
     um número com cara de certo. */
  ok(coeficienteC(10.43, 28.67, 0.5).plausivel === false, 'não marcou C implausível num calado absurdo');
  ok(coeficienteC(0, 28, 4) === null && coeficienteC(10, 28, null) === null, 'aceitou dimensão inválida');
  ok(gmDoPeriodo(0, B, L, d) === null, 'período zero produziu GM');
});

t(S24, '24.10', 'A TENDÊNCIA do GM vale mais que o número — e não depende de C', () => {
  /* O valor absoluto depende do coeficiente empírico e pode estar deslocado.
     A tendência não depende de C nenhum: se o balanço alonga, o GM caiu, e
     isso é verdade qualquer que seja o coeficiente.

     Um GM de 1,8 m não diz muita coisa sozinho. Um GM que foi de 2,0 para 1,3
     em duas horas diz que alguma coisa mudou a bordo e ninguém percebeu — e é
     isso que emborca rebocador: superfície livre, água no convés, peso que
     subiu, o puxão do cabo na cintura. */
  const base = Date.now() - 3 * 3600000;
  const h = [0, 1, 2, 3].map(i => ({ t: base + i * 3600000, gm: 2.0 - i * 0.25 }));
  const tend = tendenciaDoGm(h);
  ok(tend && tend.caindo, 'queda de 2,0 para 1,25 m em 3 h não acendeu alerta');
  ok(/conferir tanques/.test(tend.texto), 'não diz o que fazer: ' + tend.texto);
  eq(tend.de, 2.0, 1e-9, 'origem da tendência'); eq(tend.para, 1.25, 1e-9, 'valor atual');
  // Variação pequena não vira alarme.
  const estavel = tendenciaDoGm([0, 1, 2, 3].map(i => ({ t: base + i * 3600000, gm: 2.0 - i * 0.02 })));
  ok(estavel && !estavel.caindo, 'variação de 3% em 3 h virou alerta');
  // Série curta não extrapola.
  ok(tendenciaDoGm([{ t: base, gm: 2 }, { t: base + 60000, gm: 1.2 }]) === null,
     'um minuto de série virou tendência de horas');
  ok(tendenciaDoGm([]) === null && tendenciaDoGm(null) === null, 'série vazia quebrou');
  ok(ONDA_GM_QUEDA_ALERTA > 0.05 && ONDA_GM_QUEDA_ALERTA < 0.5, 'limiar de queda fora da faixa defensável');
});

t(S24, '24.11', 'Período de encontro e as duas ressonâncias que derrubam navio', () => {
  /* Te = T/|1 − V·cos μ/c|, c = gT/2π. Em mar de POPA o encontro ESTICA — a
     10 nós numa onda de 8 s vai a 13,6 s, e é aí que mora o perigo clássico. */
  const popa = periodoDeEncontro(8, 10, 0), proa = periodoDeEncontro(8, 10, 180);
  eq(popa.Te, 13.61, 0.05, 'período de encontro em mar de popa');
  eq(proa.Te, 5.67, 0.05, 'período de encontro em mar de proa');
  eq(periodoDeEncontro(8, 10, 90).Te, 8, 0.01, 'de través o encontro devia ser o próprio período');
  eq(popa.c * 1.94384, 24.3, 0.1, 'celeridade da onda de 8 s');
  // Surfe: quando o navio anda na velocidade da onda, o encontro tende ao infinito.
  ok(periodoDeEncontro(8, 24.3, 0).surfando, 'não reconheceu o navio andando com a onda');

  /* SÍNCRONO: cada onda chega no tempo exato de empurrar o balanço.
     PARAMÉTRICO: a estabilidade varia duas vezes por ciclo — cresce rápido e
     pega de surpresa porque o mar não parece perigoso. */
  ok(alertaDeRessonancia(6, 6.2).tipo === 'sincrono', 'não viu balanço síncrono');
  ok(alertaDeRessonancia(6, 3.1).tipo === 'parametrico', 'não viu balanço paramétrico');
  ok(alertaDeRessonancia(6, 9) === null, 'alarme falso com encontro longe');
  ok(alertaDeRessonancia(6, 4.5) === null, 'alarme falso entre os dois casos');
  ok(ONDA_RESSONANCIA_TOL > 0.05 && ONDA_RESSONANCIA_TOL < 0.3,
     'a tolerância saiu da faixa: larga demais vira o alarme que se ignora');
});

t(S24, '24.12', 'Ressonância e GM caindo são SEGURANÇA na fila da fala', () => {
  /* São os dois caminhos pelos quais um rebocador emborca, e nenhum deles
     avisa duas vezes. Não esperam a vez atrás de um relatório de consumo. */
  const p = k => REL_PRIORIDADE[k];
  ok(p('ressonancia') <= 1, `ressonância com prioridade ${p('ressonancia')}`);
  ok(p('gm-caindo') <= 1, `GM caindo com prioridade ${p('gm-caindo')}`);
  ok(p('ressonancia') < p('rpm-reduzir') && p('gm-caindo') < p('mar-medido'), 'ordem de urgência trocada');
  // E o mar medido só fala quando DISCORDA do modelo — senão vira ruído.
  const REL = semComentarios(fs24.readFileSync(ROOT + '/assets/js/relatorio_voz.js', 'utf8'));
  const i = REL.indexOf("pus('mar-medido'");
  ok(i > 0, 'o mar medido nunca chega à fala');
  const contexto = REL.slice(Math.max(0, i - 400), i);
  ok(/razao < 0\.7 \|\| razao > 1\.3/.test(contexto),
     'o mar medido é anunciado mesmo confirmando o modelo — repetir confirmação é ruído');
});

t(S24, '24.13', 'Os sensores rodam a navegação inteira, não só com o 3D aberto', () => {
  /* 17 minutos de janela não se juntam com o painel 3D aberto de vez em
     quando. E param ao encerrar, porque acelerômetro ligado com o navio
     atracado é bateria queimada à toa. */
  ok(/iniciarSensoresDeMar\(\)/.test(APP24), 'os sensores de mar nunca são ligados');
  ok(/pararSensoresDeMar\(\)/.test(APP24), 'os sensores nunca param — gastariam bateria atracado');
  const i = APP24.indexOf('iniciarSensoresDeMar()');
  const j = APP24.indexOf('iniciarRelatorios()');
  ok(i > 0 && j > 0 && Math.abs(i - j) < 900, 'os sensores não arrancam junto com a navegação');
  // devicemotion, e não deviceorientation: são eventos diferentes.
  ok(/'devicemotion'/.test(OND24), 'não escuta o acelerômetro');
  ok(/accelerationIncludingGravity/.test(OND24),
     'usa `acceleration` em vez de `accelerationIncludingGravity`, que muitos aparelhos não entregam');
  // E a linha do mar medido aparece no painel.
  ok(/id="navMarMedido"/.test(fs24.readFileSync(ROOT + '/app.html', 'utf8')), 'o mar medido não tem onde aparecer');
  ok(/atualizarPainelMar\(\)/.test(APP24), 'a linha do mar nunca é preenchida');
});

/* ═══════════════════════════════════════════════════════════════════════════
   SUÍTE 25 · A conversa — gramática de intenções (Sprint 6a)      (v2.13.0)

   Registrei esta discordância na proposta e ela continua valendo: NUMA PONTE,
   UM ASSISTENTE LIMITADO QUE ESTÁ SEMPRE CERTO VALE MAIS QUE UM ILIMITADO QUE
   ÀS VEZES ERRA COM CONFIANÇA.

   E é justamente por ser gramática, e não modelo de linguagem, que ela PODE
   ser provada assim: com um corpus de frases reais de passadiço, cada uma
   exigida a rotear para a intenção certa — e um segundo corpus, de perguntas
   que ela NÃO deve responder, exigida a recusar.
   ═══════════════════════════════════════════════════════════════════════════ */
const S25 = '25 · Conversa';
const { normalizar, reconhecerIntencao, responder, respostaDeFalha, textoDeAjuda,
        INTENCOES, CONVERSA_LIMIAR, CONVERSA_MARGEM } = A;
const fs25 = require('fs');
const CONV25 = semComentarios(fs25.readFileSync(ROOT + '/assets/js/conversa.js', 'utf8'));
const IARA25 = semComentarios(fs25.readFileSync(ROOT + '/assets/js/iara.js', 'utf8'));

/* Estado cheio, para as respostas terem de onde sair. */
const CHEIO = () => ({
  quando: new Date(2026, 8, 21, 14, 0), lat: -23.0917, lng: -41.8833, cog: 48, sog: 9.5,
  proxWp: { nome: 'Cabo Frio', distNM: 12.4, brg: 52, eta: new Date(2026, 8, 21, 15, 20) },
  xteNM: -0.42, xteLado: 'bombordo', referencia: 'Cabo Frio a 12,3 milhas para noroeste',
  farol: { nome: 'de Cabo Frio', distNM: 14.2, caracteristica: 'Fl(3) W 15s', alcanceNM: 22 },
  combustivel: { usadoL: 1340, restanteL: 2100, insuficiente: false },
  tempo: { ar: { wind_speed_10m: 23.5, wind_direction_10m: 42, wind_gusts_10m: 31 },
           mar: { wave_height: 2.1, wave_direction: 71 },
           correnteEfeito: { driftNos: 1, setGraus: 233, ganhoNos: -0.85 } }
});

t(S25, '25.1', 'O CORPUS: toda frase real de passadiço roteia certo', () => {
  /* Cada intenção declara exemplos que são frases como se fala numa ponte, e
     não como se escreve. É o corpus da prova, não documentação — e foi ele
     que denunciou, de uma vez, 17 de 61 erros na primeira versão. */
  const erros = [];
  let total = 0;
  for (const i of INTENCOES) {
    ok(i.exemplos && i.exemplos.length >= 2, `a intenção "${i.chave}" tem menos de 2 exemplos`);
    for (const f of i.exemplos) {
      total++;
      const r = reconhecerIntencao(f);
      if (r.chave !== i.chave) erros.push(`"${f}" -> ${r.chave || r.motivo} (esperado ${i.chave})`);
    }
  }
  ok(erros.length === 0, `${erros.length} de ${total}: ${erros.slice(0, 4).join(' | ')}`);
  ok(total >= 50, `só ${total} frases no corpus — cobertura fina demais para confiar`);
  return { detail: `${total} frases, ${INTENCOES.length} intenções` };
});

t(S25, '25.2', 'O CONTRA-CORPUS: o que ela não sabe, ela RECUSA', () => {
  /* Um assistente que improvisa é pior que um que cala. "Quem ganhou o jogo"
     respondia a amplitude de balanço na primeira versão, porque o gatilho
     "o jogo" tinha dois pontos e passava o limiar. GATILHO CURTO E GENÉRICO É
     FALSO POSITIVO ESPERANDO ACONTECER. */
  const FORA = ['qual o preco do diesel', 'vai chover amanha em Santos',
    'quem ganhou o jogo', 'qual o resultado do jogo', 'me fala uma piada',
    'qual a capital da Franca', 'abre o guincho', 'liga o radar',
    'manda mensagem pro armador', 'quanto custa o reboque',
    'quem e o comandante', 'toca uma musica'];
  const falsos = FORA.filter(f => reconhecerIntencao(f).chave);
  ok(falsos.length === 0, `${falsos.length} falso(s) positivo(s): ${falsos.map(f =>
    `"${f}" -> ${reconhecerIntencao(f).chave}`).slice(0, 3)}`);
  // E a recusa devolve o cardápio, em vez de só "não entendi".
  const r = respostaDeFalha({ motivo: 'nao-entendi' });
  ok(/nao sei responder|não sei responder/i.test(r), r);
  ok(r.length > 60, 'a recusa não oferece caminho: ' + r);
  return { detail: `${FORA.length} perguntas fora do escopo, ${falsos.length} improvisadas` };
});

t(S25, '25.3', 'Fala de passadiço: "tá", "tô", "pra" — e não o português escrito', () => {
  /* Escrevi os gatilhos em português correto e 17 de 61 frases falharam de
     uma vez. Ninguém fala "como está o tempo" numa ponte. As contrações são
     normalizadas na entrada E nos gatilhos, para a comparação acontecer num
     dialeto só. */
  ok(normalizar('Como tá o tempo?') === 'como esta o tempo', normalizar('Como tá o tempo?'));
  ok(normalizar('Tô no rumo') === 'estou no rumo', normalizar('Tô no rumo'));
  ok(normalizar('pra onde a gente vai') === 'para onde a gente vai', normalizar('pra onde a gente vai'));
  // A troca é por PALAVRA INTEIRA: sem isso, o "ta" de "estabilidade" quebraria.
  ok(normalizar('a estabilidade') === 'a estabilidade', normalizar('a estabilidade'));
  ok(reconhecerIntencao('qual a estabilidade').chave === 'estabilidade',
     'a normalização das contrações comeu a palavra "estabilidade"');
  // Acento e pontuação somem; caixa também.
  ok(normalizar('QUANTO FALTA???') === 'quanto falta', normalizar('QUANTO FALTA???'));
  ok(normalizar('') === '' && normalizar(null) === '', 'entrada vazia quebrou');
});

t(S25, '25.4', 'Os gatilhos passam pela MESMA normalização que a fala', () => {
  /* Era um defeito: eu normalizava só a entrada, e o gatilho 'pra onde a
     gente vai' nunca casava porque a entrada já tinha virado 'para onde'.
     Escrever "pra" no gatilho, que parecia esperto, era o que o desligava. */
  const cru = INTENCOES.flatMap(i => i.gatilhos);
  const naoNormais = cru.filter(g => normalizar(g) !== g);
  // Não se exige que estejam escritos normalizados — exige-se que FUNCIONEM.
  for (const g of naoNormais.slice(0, 8)) {
    const dono = INTENCOES.find(i => i.gatilhos.includes(g));
    const r = reconhecerIntencao(g);
    ok(r.chave === dono.chave || r.motivo === 'ambiguo',
       `o gatilho "${g}" de ${dono.chave} não dispara a própria intenção (deu ${r.chave || r.motivo})`);
  }
  return { detail: `${cru.length} gatilhos, ${naoNormais.length} escritos como se fala` };
});

t(S25, '25.5', 'Pontuação por especificidade, e empate vira PERGUNTA', () => {
  /* Com casamento por primeira regra, a ORDEM DA LISTA decidiria a resposta —
     e a ordem da lista não é conhecimento sobre a pergunta, é acidente de
     quem escreveu. Aqui a expressão longa vence a curta, porque a longa é
     específica e a curta aparece em meia dúzia de perguntas. */
  ok(reconhecerIntencao('estou no rumo').chave === 'rumo-certo',
     'a expressão longa não venceu a palavra solta');
  ok(reconhecerIntencao('qual o proximo waypoint').chave === 'proximo-wp', 'especificidade falhou');
  // Palavra solta abaixo do limiar não vira resposta.
  ok(!reconhecerIntencao('rumo').chave, '"rumo" sozinho virou resposta — é ambíguo demais');
  ok(CONVERSA_LIMIAR >= 2, 'o limiar caiu para 1: qualquer palavra solta viraria intenção');
  /* EMPATE É PERGUNTA, NÃO SORTEIO. Responder a mais bem colocada por um
     ponto é chutar com cara de certeza — o defeito que esta gramática existe
     justamente para não ter. */
  ok(CONVERSA_MARGEM >= 1, 'sem margem de desempate, um ponto de diferença vira certeza');
  /* E o COMPORTAMENTO, não só a constante. A mutação mostrou que provar o
     valor de CONVERSA_MARGEM não prova que ele é usado: desligar o desempate
     inteiro passava limpo. A frase abaixo é construída de propósito para
     empatar — "qual o vento" e "qual a corrente" valem três pontos cada. */
  const empatada = reconhecerIntencao('qual o vento qual a corrente');
  ok(empatada.motivo === 'ambiguo',
     `empate devia virar pergunta, deu "${empatada.chave || empatada.motivo}"`);
  ok(empatada.candidatos && empatada.candidatos.length === 2, 'o empate não devolve os dois candidatos');
  const amb = respostaDeFalha({ motivo: 'ambiguo',
    candidatos: [{ chave: 'vento' }, { chave: 'mar' }] });
  ok(/vento/.test(amb) && /mar/.test(amb), 'o desempate não oferece as duas opções: ' + amb);
  ok(/repetir|repita/i.test(amb), 'não pede para repetir: ' + amb);
});

t(S25, '25.6', 'As três formas de não entender são TRÊS, e não uma', () => {
  /* "não te ouvi" e "não sei responder isso" pedem reações diferentes do
     comandante. Tratar as duas como a mesma coisa perde informação que ele
     tem como usar. */
  const vazio = respostaDeFalha({ motivo: 'vazio' });
  const naoSei = respostaDeFalha({ motivo: 'nao-entendi' });
  const amb = respostaDeFalha({ motivo: 'ambiguo', candidatos: [{ chave: 'vento' }, { chave: 'mar' }] });
  ok(vazio !== naoSei && naoSei !== amb && vazio !== amb, 'as três falhas dão a mesma resposta');
  ok(/ouvir|ouvi/i.test(vazio), 'a falha de áudio não menciona ter ouvido: ' + vazio);
  ok(reconhecerIntencao('').motivo === 'vazio', 'entrada vazia não foi classificada');
  ok(reconhecerIntencao('   ').motivo === 'vazio', 'só espaços não foi classificado');
});

t(S25, '25.7', 'Toda intenção declarada TEM resposta — nenhuma cai no vazio', () => {
  /* Uma intenção reconhecida sem resposta seria o pior dos mundos: a Iara
     entende a pergunta e devolve silêncio. */
  const est = CHEIO();
  const mudas = INTENCOES.filter(i => {
    const r = responder(i.chave, est);
    return !r || typeof r !== 'string' || r.trim().length < 5;
  }).map(i => i.chave);
  ok(mudas.length === 0, `intenção(ões) sem resposta: ${mudas}`);
  // E nenhuma resposta vaza valor cru.
  const sujas = INTENCOES.map(i => [i.chave, responder(i.chave, est)])
    .filter(([, r]) => /undefined|NaN|\[object|null/.test(r));
  ok(sujas.length === 0, `vazou valor cru em: ${sujas.map(x => x[0])}`);
  return { detail: `${INTENCOES.length} intenções, todas respondem` };
});

t(S25, '25.8', 'Sem dado ela diz que não tem — e diz POR QUÊ', () => {
  /* "Não sei" sem motivo faz o comandante achar que o aplicativo quebrou, e
     aí ele para de confiar também no que estava certo. */
  const vazio = { quando: new Date(2026, 8, 21, 14, 0) };
  const mudas = [];
  for (const i of INTENCOES) {
    const r = responder(i.chave, vazio);
    if (!r || /undefined|NaN|\[object/.test(r)) mudas.push(i.chave);
  }
  ok(mudas.length === 0, `com estado vazio quebrou em: ${mudas}`);
  ok(/rota planejada/.test(responder('falta', vazio)), responder('falta', vazio));
  ok(/GPS/.test(responder('posicao', vazio)), responder('posicao', vazio));
  // A hora funciona mesmo sem navegação nenhuma — não depende de estado.
  ok(/14 horas/.test(responder('hora', vazio)), responder('hora', vazio));
  // E "ajuda" também: é o caminho de volta de quem se perdeu.
  ok(textoDeAjuda().length > 80 && /perguntar/.test(textoDeAjuda()), 'a ajuda não lista o que dá para perguntar');
});

t(S25, '25.9', 'As respostas obedecem à REGRA 6 — sugerem, não mandam', () => {
  /* A varredura da prova 19.11 já cobre os quatro módulos de fala, e
     conversa.js entrou neles. Aqui se confere o caminho inverso: as respostas
     GERADAS, com estado real, também não podem sair mandando. */
  const est = CHEIO();
  const sujas = INTENCOES.map(i => [i.chave, responder(i.chave, est)])
    .filter(([, r]) => violaRegra6(r).length > 0);
  ok(sujas.length === 0, `resposta(s) mandando no navio: ${sujas.map(x => x[0])}`);
  // E o módulo está na lista de fontes de fala da prova 19.11.
  const SUITE = fs25.readFileSync(ROOT + '/tests/suite.js', 'utf8');
  ok(/assets\/js\/conversa\.js/.test(SUITE.slice(SUITE.indexOf('FONTES_DE_FALA'),
     SUITE.indexOf('FONTES_DE_FALA') + 400)),
     'conversa.js ficou de fora da varredura da regra 6 — regra que vigia um arquivo não é regra');
});

t(S25, '25.10', 'A resposta sai da MESMA fonte que o relatório', () => {
  /* Resposta e relatório saírem do mesmo estado é o que impede a Iara de se
     contradizer: perguntar "quanto falta" e ouvir 12 milhas, e um minuto
     depois o relatório dizer 8, destruiria a confiança de uma vez. */
  ok(/estadoAtualParaRelatorio/.test(CONV25),
     'a conversa monta estado próprio em vez de usar o do relatório');
  ok(/montarRelatorioHora/.test(CONV25), 'o pedido de relatório não usa o relatório real');
  const est = CHEIO();
  const rel = montarRelatorioHora(est);
  const resp = responder('falta', est);
  const milhas = /(\d+),(\d+) milhas/.exec(resp);
  ok(milhas && rel.texto.includes(milhas[0]),
     `a resposta diz "${milhas && milhas[0]}" e o relatório não confirma`);
});

t(S25, '25.11', 'A gramática substituiu o improviso do Sprint 0', () => {
  /* Até a v2.12 a Iara repetia o que ouvia e admitia não saber responder —
     era a verdade daquele momento e valia mais que fingir. Agora encaminha
     para a gramática. */
  ok(/conversar\(/.test(IARA25), 'iaraResponder não chama a conversa');
  ok(!/Ainda tô aprendendo a responder/.test(IARA25), 'o texto provisório do Sprint 0 ficou para trás');
  ok(/<script src="assets\/js\/conversa\.js">/.test(fs25.readFileSync(ROOT + '/app.html', 'utf8')),
     'o módulo da conversa não é carregado');
  /* Toda resposta sai com prioridade 'resposta', que a fila põe na frente do
     relatório de rotina: o comandante acabou de perguntar. */
  ok(/iaraDizer\(texto, 'resposta'\)/.test(CONV25), 'a resposta não entra na fila com prioridade de resposta');
  ok(A.IARA_PRIORIDADE.resposta < A.IARA_PRIORIDADE.rotina,
     'resposta não vem antes de relatório de rotina na fila');
});

t(S25, '25.12', 'A lista do que ela sabe é LEGÍVEL — e é o ponto', () => {
  /* Se alguém precisar saber o que a Iara responde, lê a lista. É
     exatamente isso que um modelo de linguagem não permite fazer, e é a razão
     de a gramática vir primeiro. */
  ok(INTENCOES.length >= 15, `só ${INTENCOES.length} intenções — cobertura fina demais`);
  const chaves = INTENCOES.map(i => i.chave);
  ok(new Set(chaves).size === chaves.length, 'há intenções com a mesma chave');
  // As perguntas de bordo mais óbvias estão cobertas.
  ['falta', 'posicao', 'tempo', 'vento', 'mar', 'consumo', 'rotacao',
   'farol', 'estabilidade', 'ajuda'].forEach(k =>
    ok(chaves.includes(k), `falta a intenção essencial "${k}"`));
  // E nenhuma intenção fica sem gatilho.
  const semGatilho = INTENCOES.filter(i => !i.gatilhos || i.gatilhos.length < 2).map(i => i.chave);
  ok(semGatilho.length === 0, `intenção(ões) com menos de 2 gatilhos: ${semGatilho}`);
  const totalGat = INTENCOES.reduce((s, i) => s + i.gatilhos.length, 0);
  return { detail: `${INTENCOES.length} intenções, ${totalGat} gatilhos` };
});

/* ═══════════════════════════════════════════════════════════════════════════
   SUÍTE 26 · INTEGRAÇÃO CONTÍNUA
   ═══════════════════════════════════════════════════════════════════════════

   POR QUE ESTA SUÍTE EXISTE

   Em 21/09/2026, ao ligar o banco de provas a um workflow de pull request,
   descobriu-se que `node tests/suite.js` SEMPRE saía com código 0 — inclusive
   com FAIL na tela. O relatório imprimia a falha em vermelho, escrevia o
   results.json e terminava dizendo "tudo bem".

   Isso nunca doeu enquanto um humano lia a saída: o olho vê o ✘. Mas uma
   máquina de integração não lê, ela consulta o código de saída. Ligado assim,
   o CI seria um alarme com a lâmpada desligada do circuito: acende verde
   sempre, e ensina a tripulação a confiar numa luz que não mede nada. Pior
   que não ter alarme nenhum, porque substitui a desconfiança por certeza
   falsa.

   A correção separa a DECISÃO do EFEITO — a mesma disciplina que permitiu
   provar `podeFalar()` sem alto-falante:

     · `codigoDeSaida(resultados)` decide, é pura e é provada aqui;
     · `process.exitCode = ...` no relatório executa, e é só um efeito.

   E a regra que a decisão implementa tem razão de bordo: só FAIL derruba a
   obra. Os WARN são defeitos conhecidos e documentados. Derrubar o CI por
   eles seria acender a luz vermelha todo dia por um motivo que ninguém pode
   resolver hoje — e uma luz que acende todo dia deixa de ser vista. Alarme
   que toca sempre é alarme desligado.
   ═══════════════════════════════════════════════════════════════════════════ */
const S26 = '26 · Integração contínua';
const fs26 = require('fs');
const WF26_CAMINHO = ROOT + '/.github/workflows/provas.yml';
const WF26_BRUTO = fs26.existsSync(WF26_CAMINHO) ? fs26.readFileSync(WF26_CAMINHO, 'utf8') : '';
/* YAML comenta com '#', igual ao TOML — o mesmo removedor serve, e serve pelo
   mesmo motivo: este arquivo de workflow é longo e MUITO comentado. Sem
   recortar, qualquer varredura aqui estaria lendo a minha prosa em vez de
   ler a configuração. */
const WF26 = semComentariosToml(WF26_BRUTO);

t(S26, '26.1', 'O workflow de provas existe e dispara em pull request', () => {
  ok(WF26_BRUTO, 'não há .github/workflows/provas.yml — as provas voltaram a depender de memória humana');
  ok(/^on:/m.test(WF26), 'o workflow não declara gatilho');
  ok(/pull_request:/.test(WF26), 'não dispara em pull request — que é o ponto inteiro');
  ok(/branches:\s*\[\s*main\s*\]/.test(WF26), 'o gatilho de pull request não aponta para a main');
  ok(/workflow_dispatch:/.test(WF26), 'não dá para disparar à mão pela aba Actions');
  return { detail: `${WF26_BRUTO.split('\n').length} linhas` };
});

t(S26, '26.2', 'O workflow roda O BANCO E A FUMAÇA — são provas diferentes', () => {
  /* As duas pegam coisas distintas e nenhuma substitui a outra. O banco roda
     as funções fora do navegador: pega erro de CÁLCULO. A fumaça abre o app
     num Chromium de verdade: pega erro de CARREGAMENTO — ordem de <script>,
     caminho de módulo, hash SRI, CSS que não chega. Ligar só o banco daria a
     impressão de cobertura com metade do casco fora d'água. */
  ok(/node tests\/suite\.js/.test(WF26), 'o workflow não executa o banco de provas');
  ok(/npm run smoke|node tests\/smoke\.js/.test(WF26), 'o workflow não executa a fumaça em navegador');
  ok(/playwright install/.test(WF26), 'a fumaça precisa de Chromium e o workflow não o instala');
});

t(S26, '26.2.1', 'O CI prova o ESQUEMA executando, não varrendo', () => {
  /* ═══════════════════════════════════════════════════════════════════════
     POR QUE ESTE JOB EXISTE, E POR QUE ELE É DIFERENTE DOS OUTROS DOIS.

     A primeira versão do supabase/licenca.sql trazia:

         revoke execute on function public.create_license(...) from anon;

     Lido, parece certo. Executado, não faz NADA: o Postgres concede EXECUTE
     a `public` por padrão, e revogar de `anon` revoga uma concessão direta
     que nunca existiu. Medido num Postgres 16, com o papel anon assumido, o
     `anon` EMITIU uma licença de 99 dias para si mesmo.

     Varredura de texto NÃO pegaria — o texto estava correto. É o limite
     duro da varredura, e a razão de o esquema rodar de verdade.

     Esta prova é, ela própria, uma varredura — e sabe disso. Ela não
     verifica o esquema; verifica que ALGUÉM o verifica.
     ═══════════════════════════════════════════════════════════════════════ */
  const WF = semComentariosToml(fs26.readFileSync(WF26_CAMINHO, 'utf8'));
  ok(/esquema:/.test(WF), 'o CI não tem job de esquema');
  ok(/image:\s*postgres/.test(WF), 'o job de esquema não sobe um Postgres');
  ok(/tests\/esquema_provas\.sql/.test(WF), 'o CI não executa as provas do esquema');
  ok(/supabase\/licenca\.sql/.test(WF), 'o CI não carrega o arquivo da licença');

  /* ON_ERROR_STOP é o que transforma prova falha em job vermelho: sem ele o
     psql imprime o erro e sai com ZERO. Mesma família do defeito do código
     de saída da v2.14.0 — mecanismo de prova que falha para o lado do verde. */
  ok(/ON_ERROR_STOP=1 -f tests\/esquema_provas\.sql/.test(WF),
     'as provas do esquema rodam sem ON_ERROR_STOP — falhariam em silêncio, com saída zero');

  /* E nunca no banco do cliente. */
  ok(!/supabase\.co/.test(WF), 'o CI aponta para um banco hospedado — prova de esquema não toca produção');

  const prov = fs26.readFileSync(ROOT + '/tests/esquema_provas.sql', 'utf8');
  ok(/anon EMITE a própria licença/.test(prov),
     'a prova do defeito real de 01/10/2026 sumiu do arquivo');
  return { detail: `${prov.split('\n').length} linhas de prova de esquema` };
});

t(S26, '26.3', 'FAIL derruba a obra — o defeito que quase passou despercebido', () => {
  /* Esta é a prova que não existia em 21/09/2026 e cuja ausência deixou o
     banco de provas sair com código 0 mesmo falhando. */
  eq(codigoDeSaida([{ status: 'FAIL' }]), 1, 0, 'uma falha isolada não derrubou');
  eq(codigoDeSaida([{ status: 'PASS' }, { status: 'FAIL' }, { status: 'PASS' }]), 1, 0,
     'falha no meio de aprovações não derrubou');
  eq(codigoDeSaida([{ status: 'WARN' }, { status: 'FAIL' }]), 1, 0, 'falha junto de aviso não derrubou');
  /* E o efeito: o relatório tem de USAR a decisão. Uma função pura correta que
     ninguém chama é exatamente o defeito original com nome novo. */
  const EU = semComentarios(fs26.readFileSync(ROOT + '/tests/suite.js', 'utf8'));
  ok(/process\.exitCode\s*=\s*codigoDeSaida\(/.test(EU),
     'o relatório não liga a decisão ao código de saída — a função pura ficaria decorativa');
});

t(S26, '26.4', 'Aviso conhecido NÃO derruba a obra', () => {
  /* Os três WARN de hoje (3.9, 9.4, 9.7) são defeitos documentados que
     dependem de decisão do autor, não de correção pendente. Se derrubassem o
     CI, todo pull request nasceria vermelho e a cor perderia o significado. */
  eq(codigoDeSaida([{ status: 'PASS' }]), 0, 0, 'aprovação pura derrubou a obra');
  eq(codigoDeSaida([{ status: 'WARN' }]), 0, 0, 'aviso derrubou a obra — alarme que toca sempre é alarme desligado');
  eq(codigoDeSaida([{ status: 'PASS' }, { status: 'WARN' }, { status: 'WARN' }]), 0, 0,
     'aprovações com avisos derrubaram a obra');
  eq(codigoDeSaida([]), 0, 0, 'lista vazia derrubou a obra');
  const w = results.filter(r => r.status === 'WARN').length;
  return { detail: `${w} aviso(s) conhecido(s) nesta execução` };
});

t(S26, '26.5', 'O workflow não pede segredo e usa a menor permissão', () => {
  /* Um workflow que dispara em pull_request pode ser acionado por código que
     ainda não foi revisado. Se tivesse acesso a `secrets`, bastaria um pull
     request para extrair a chave paga do Open-Meteo. Ele não tem — e as provas
     rodam inteiras sem nenhum segredo, o que é a razão de isto ser seguro e
     não apenas prudente. */
  ok(!/\bsecrets\./.test(WF26), 'o workflow referencia secrets — em pull_request isso expõe a chave a qualquer um');
  ok(/permissions:/.test(WF26), 'o workflow não declara permissões, herdando as amplas do repositório');
  ok(/contents:\s*read/.test(WF26), 'a permissão de conteúdo não está limitada a leitura');
  ok(!/contents:\s*write|packages:\s*write|id-token:/.test(WF26), 'o workflow pede permissão de escrita sem precisar');
  /* E a fumaça tem de continuar podendo rodar sem o token Cesium: ela serve um
     cesium-config.js vazio de propósito. Se isso sumir, o CI passa a exigir
     segredo e a prova 26.5 vira mentira. */
  const SMOKE = semComentarios(fs26.readFileSync(ROOT + '/tests/smoke.js', 'utf8'));
  ok(/CESIUM_ION_TOKEN\s*=\s*""/.test(SMOKE),
     'a fumaça não serve mais um token Cesium vazio — passaria a depender de segredo');
});

/* ═══════════════════════════════════════════════════════════════════════════
   SUÍTE 27 · GUARDA DO PROXY (Sprint A do controle de acesso)      (v2.16.0)
   ═══════════════════════════════════════════════════════════════════════════

   POR QUE ESTA SUÍTE É DIFERENTE DAS OUTRAS SOBRE O PROXY

   Até aqui, tudo que se afirmava sobre `netlify/functions/tempo.mjs` era
   provado por VARREDURA DE TEXTO (suíte 21): regex no código-fonte. É a forma
   mais fraca que existe, e esta bancada já apanhou cinco vezes de comentário
   respondendo por código.

   A guarda é a decisão com dinheiro em jogo. Varrer um `if` não prova que ele
   decide certo — prova que ele está escrito. Então aqui a guarda é
   EXECUTADA: as decisões moram em `netlify/lib/guarda.mjs`, que é ESM puro,
   e o Node 22 permite `require()` de ESM sem alarde.

   Separar decisão de efeito, de novo: as funções puras decidem e são provadas
   número a número; o `tempo.mjs` só liga os fios, e disso cuidam a 27.7
   (ordem, por varredura) e os passos da FUMAÇA (o handler de verdade).
   ═══════════════════════════════════════════════════════════════════════════ */
const S27 = '27 · Guarda do proxy';
let G27 = null, G27ERRO = '';
try { G27 = require(ROOT + '/netlify/lib/guarda.mjs'); }
catch (e) { G27ERRO = (e && e.message) || String(e); }

t(S27, '27.0', 'A guarda é executável pelo banco de provas', () => {
  /* Se esta cair, TODAS as 27.x abaixo caem juntas, e é importante que a
     causa apareça aqui e não disfarçada oito vezes. `require()` de ESM exige
     Node >= 22.12; o CI fixa node-version '22'. */
  ok(G27, 'não foi possível carregar netlify/lib/guarda.mjs — ' + G27ERRO);
  ok(typeof G27.origemDeConfianca === 'function', 'sem origemDeConfianca');
  return { detail: 'guarda v' + G27.GUARDA_VERSAO + ' · Node ' + process.version };
});

t(S27, '27.1', 'Quem pode chamar: a tabela inteira, medida', () => {
  const lista = G27.GUARDA_HOSTS_PADRAO;
  const h = o => (n => o[n]);                     // vira a função (nome)=>valor
  const dec = o => G27.origemDeConfianca(h(o), lista);

  /* O navegador garante o Sec-Fetch-Site: é nome de cabeçalho PROIBIDO, e
     nenhuma página consegue escrevê-lo por JavaScript. */
  ok(dec({ 'sec-fetch-site': 'same-origin' }).ok, 'a própria página foi barrada — isto derruba o app');
  ok(!dec({ 'sec-fetch-site': 'cross-site' }).ok, 'site de terceiro passou: pendura o endpoint e gasta a chave');
  ok(!dec({ 'sec-fetch-site': 'same-site' }).ok, 'subdomínio irmão passou — não é o aplicativo');
  ok(!dec({ 'sec-fetch-site': 'none' }).ok, 'endereço digitado na barra passou');

  /* O tablete velho, sem Sec-Fetch-*: cai para a lista de hosts. */
  ok(dec({ referer: 'https://coastalbrasil.netlify.app/app.html' }).ok,
     'navegador antigo da própria origem foi barrado');
  ok(dec({ referer: 'https://deploy-preview-31--coastalbrasil.netlify.app/app.html' }).ok,
     'Deploy Preview foi barrado — o CI e a conferência de bordo param');
  ok(!dec({ referer: 'https://site-de-outro.com/pagina.html' }).ok, 'referer de fora passou');
  ok(!dec({}).ok, 'curl cru, sem cabeçalho nenhum, passou');

  /* Sec-Fetch-Site MANDA sobre o Referer: referer forjado não resgata uma
     chamada que o navegador já declarou de fora. */
  ok(!dec({ 'sec-fetch-site': 'cross-site',
            referer: 'https://coastalbrasil.netlify.app/app.html' }).ok,
     'referer forjado venceu o veredito do navegador');
});

t(S27, '27.2', 'Curinga só serve para Deploy Preview, e "*" é recusado', () => {
  const P = G27.hostPermitido;
  ok(P('deploy-preview-7--coastalbrasil.netlify.app', ['*--coastalbrasil.netlify.app']), 'preview barrado');
  ok(P('coastalbrasil.netlify.app', ['*--coastalbrasil.netlify.app']), 'o host base devia valer');
  ok(!P('coastalbrasil.netlify.app.mau.com', ['coastalbrasil.netlify.app']),
     'sufixo malicioso passou — host tem de bater inteiro');
  ok(!P('--coastalbrasil.netlify.app', ['*--coastalbrasil.netlify.app']),
     'curinga casou com prefixo VAZIO');
  /* Lista que aceita tudo não é lista. Um dia alguém configuraria '*' sem
     perceber que desligou a guarda; melhor que não funcione. */
  ok(!P('qualquer.coisa.com', ['*']), 'o curinga solto desligou a guarda');
  ok(!P('', ['coastalbrasil.netlify.app']), 'host vazio passou');
});

t(S27, '27.3', 'Limite por chamador: janela DESLIZANTE, não balde por hora', () => {
  const e = G27.novoEstado();
  const T0 = Date.UTC(2026, 9, 1, 10, 0, 0), JAN = 3600000, TETO = 60;
  for (let i = 0; i < TETO; i++) {
    const r = G27.limiteDeTaxa(e, T0 + i, 'ip-a', TETO, JAN);
    ok(r.ok, `a ${i + 1}ª chamada legítima foi barrada`);
  }
  ok(!G27.limiteDeTaxa(e, T0 + 999, 'ip-a', TETO, JAN).ok, `a ${TETO + 1}ª passou dentro da janela`);
  /* Outro chamador não herda a punição do primeiro. */
  ok(G27.limiteDeTaxa(e, T0 + 1000, 'ip-b', TETO, JAN).ok, 'um IP barrou o outro');
  /* O ponto da janela deslizante: no balde por hora cheia, 60 às 10h59 e
     outras 60 às 11h01 passariam. Aqui a mais velha precisa CADUCAR. */
  ok(!G27.limiteDeTaxa(e, T0 + JAN - 1, 'ip-a', TETO, JAN).ok, 'liberou antes de a janela correr');
  ok(G27.limiteDeTaxa(e, T0 + JAN + 2, 'ip-a', TETO, JAN).ok, 'não liberou depois de a mais velha caducar');

  /* ─────────────────────────────────────────────────────────────────────
     O CASO QUE DISTINGUE as duas implementações — e que faltava.

     Uma mutação trocou a janela deslizante por balde de hora cheia e
     SOBREVIVEU a tudo acima. O motivo é constrangedor e vale registrar: as
     chamadas de prova começavam numa hora UTC cravada, que é exatamente a
     borda do balde. Nessa posição as duas implementações concordam em todos
     os pontos medidos. A prova confirmava o código que eu tinha em mente em
     vez de separar um comportamento do outro.

     O abuso que a janela deslizante existe para impedir é este: encostar no
     teto no FIM de uma hora e recomeçar no COMEÇO da seguinte — 120 chamadas
     em 100 milissegundos. No balde, passa. Na janela, não.
     ───────────────────────────────────────────────────────────────────── */
  const e2 = G27.novoEstado();
  const fim = T0 + JAN - 100;                 // 100 ms antes da virada da hora
  for (let i = 0; i < TETO; i++) {
    ok(G27.limiteDeTaxa(e2, fim + i, 'ip-c', TETO, JAN).ok, `a ${i + 1}ª no fim da hora foi barrada`);
  }
  ok(!G27.limiteDeTaxa(e2, T0 + JAN + 1, 'ip-c', TETO, JAN).ok,
     'cruzou a hora e liberou outras 60: isto é balde por hora cheia, não janela deslizante — ' +
     '120 chamadas em 100 ms passariam');
});

t(S27, '27.4', 'O fusível conta o que a FATURA conta, e abre antes de gastar', () => {
  const e = G27.novoEstado();
  const T = Date.UTC(2026, 9, 1, 3, 0, 0), TETO = 10;
  /* 2 por busca, porque são duas chamadas lá fora: mar e ar. */
  for (let i = 0; i < 5; i++) ok(G27.pedirGasto(e, T, 2, TETO).ok, `busca ${i + 1} barrada antes do teto`);
  const estourou = G27.pedirGasto(e, T, 2, TETO);
  ok(!estourou.ok, 'o fusível não abriu no teto');
  eq(estourou.usados, TETO, 0, 'contagem errada ao abrir');
  /* E, aberto, NÃO pode continuar contando: gasto recusado não aconteceu. */
  eq(e.gasto.n, TETO, 0, 'o fusível contou um gasto que ele próprio recusou');
  /* Vira o dia UTC e o fusível rearma sozinho. */
  const amanha = T + 24 * 3600000;
  ok(G27.pedirGasto(e, amanha, 2, TETO).ok, 'o fusível não rearmou na virada do dia');
  eq(e.gasto.n, 2, 0, 'a contagem do dia novo não começou do zero');
  /* O dia é UTC de propósito: a função pode mudar de região, e fusível que
     zera em horário diferente conforme o servidor ninguém audita. */
  ok(/^\d{4}-\d{2}-\d{2}$/.test(G27.diaUtc(T)), 'diaUtc não devolve AAAA-MM-DD');
  ok(G27.diaUtc(Date.UTC(2026, 9, 1, 23, 59)) !== G27.diaUtc(Date.UTC(2026, 9, 2, 0, 1)),
     'a virada de dia UTC não é detectada');
});

t(S27, '27.5', 'Configuração inválida cai no padrão, nunca desliga a guarda', () => {
  const C = G27.lerConfig;
  eq(C({}).tetoDiario, G27.GUARDA_TETO_DIARIO, 0, 'sem ambiente, o padrão não valeu');
  eq(C({ TEMPO_TETO_DIARIO: 'abc' }).tetoDiario, G27.GUARDA_TETO_DIARIO, 0,
     'texto virou teto — um dia isto seria teto zero ou infinito');
  eq(C({ TEMPO_TETO_DIARIO: '0' }).tetoDiario, G27.GUARDA_TETO_DIARIO, 0, 'zero virou teto e travaria tudo');
  eq(C({ TEMPO_TETO_DIARIO: '-5' }).tetoDiario, G27.GUARDA_TETO_DIARIO, 0, 'negativo virou teto');
  eq(C({ TEMPO_TETO_DIARIO: '500' }).tetoDiario, 500, 0, 'valor legítimo foi ignorado');
  eq(C({ TEMPO_LIMITE_IP: '10' }).limiteIp, 10, 0, 'limite por IP não é configurável');
  /* Domínio próprio entra por ambiente, SEM perder os padrões. */
  const cfg = C({ TEMPO_HOSTS: 'coastal.com.br , www.coastal.com.br' });
  ok(cfg.hosts.includes('coastal.com.br') && cfg.hosts.includes('www.coastal.com.br'),
     'host do ambiente não entrou');
  ok(cfg.hosts.includes('coastalbrasil.netlify.app'), 'o host padrão foi perdido ao acrescentar outro');
});

t(S27, '27.6', 'Quem é o chamador: o IP do Netlify manda, e o encadeado não mente', () => {
  const h = o => (n => o[n]);
  /* COMPARAÇÃO DE TEXTO VAI DE ok(), NÃO DE eq().                  (v2.16.0)
     Escrevi estas três com eq() e a mutação do x-forwarded-for sobreviveu:
     eq() é numérica, e sobre texto vira NaN > 0, que é falso. Passava sempre. */
  const IP = o => G27.enderecoDoCliente(h(o));
  ok(IP({ 'x-nf-client-connection-ip': '200.1.2.3' }) === '200.1.2.3',
     'o IP real do Netlify foi ignorado');
  /* Do x-forwarded-for só vale o PRIMEIRO: os seguintes são acrescentados por
     quem repassou e podem ser inventados pelo próprio cliente. */
  ok(IP({ 'x-forwarded-for': '9.9.9.9, 10.0.0.1, 172.16.0.1' }) === '9.9.9.9',
     'pegou um endereço forjável da cadeia: o cliente escolheria o próprio balde de limite');
  ok(IP({ 'x-nf-client-connection-ip': '200.1.2.3', 'x-forwarded-for': '1.1.1.1' }) === '200.1.2.3',
     'o cabeçalho forjável venceu o confiável');
  ok(G27.enderecoDoCliente(h({})) === 'desconhecido', 'sem IP, devolveu vazio em vez de chave estável');
});

t(S27, '27.7', 'No proxy, a guarda vem ANTES do gasto e a recusa não é cacheada', () => {
  /* VARREDURA DE CÓDIGO LÊ CÓDIGO: os comentários desta emenda citam
     'no-store', 'fusível' e 'pedirGasto' de propósito, para explicar. */
  const P = semComentarios(fs21.readFileSync(ROOT + '/netlify/functions/tempo.mjs', 'utf8'));

  const iOrigem  = P.indexOf('origemDeConfianca(');
  const iTaxa    = P.indexOf('limiteDeTaxa(');
  const iFusivel = P.indexOf('pedirGasto(');
  ok(iOrigem > 0, 'o proxy não consulta a origem');
  ok(iTaxa > 0, 'o proxy não aplica limite por chamador');
  ok(iFusivel > 0, 'o proxy não tem fusível');
  ok(iOrigem < iTaxa, 'a origem é verificada depois do limite de taxa');

  /* O fusível tem de ser pedido ANTES da chamada que custa. Contar depois do
     gasto é contar o que já queimou. */
  const iChamada = P.indexOf('Promise.allSettled');
  ok(iChamada > 0, 'as duas buscas em paralelo sumiram');
  ok(iFusivel < iChamada, 'o fusível é pedido DEPOIS de chamar o Open-Meteo');

  /* E a armadilha que daria apagão: recusa herdando o cache de 15 min faria a
     CDN devolver 403 a quem tem direito por até 75 minutos. */
  ok(/no-store/.test(P), 'as recusas não desligam o cache');
  const bloco403 = P.slice(iOrigem, iOrigem + 400);
  ok(/403/.test(bloco403) && /semCache/.test(bloco403),
     'a recusa de origem não usa cabeçalho sem cache');
  ok(!/status: 403, headers: cabecalhos/.test(P), 'uma recusa ainda sai com o cabeçalho cacheável');
});

t(S27, '27.8', 'O guarda não vaza memória numa instância de vida longa', () => {
  /* Sem varredura, o Map de chamadores cresce para sempre — vazamento lento,
     do tipo que só se descobre quando a função morre por memória às 3h da
     manhã, que é quando o rebocador está no mar. */
  const e = G27.novoEstado();
  const T = Date.UTC(2026, 9, 1, 0, 0, 0), JAN = 3600000;
  for (let i = 0; i < 500; i++) G27.limiteDeTaxa(e, T, 'ip-' + i, 60, JAN);
  eq(e.porCliente.size, 500, 0, 'nem registrou os chamadores');
  const removidos = G27.limparOciosos(e, T + JAN + 1, JAN);
  eq(removidos, 500, 0, 'a varredura não removeu os ociosos');
  eq(e.porCliente.size, 0, 0, 'o Map continuou crescendo');
  /* Mas quem ainda está dentro da janela NÃO pode ser esquecido, senão o
     limite se reinicia sozinho e deixa de limitar. */
  G27.limiteDeTaxa(e, T, 'ip-vivo', 60, JAN);
  G27.limparOciosos(e, T + 10, JAN);
  eq(e.porCliente.size, 1, 0, 'a varredura apagou um chamador ativo e zerou o limite dele');
});

t(S27, '27.9', 'O banco recusa prova assíncrona, que passaria sempre', () => {
  /* Descoberto nesta sprint: `t()` é síncrono e olha o RETORNO de fn(). Uma
     prova `async` devolve Promise — nem {warn} nem {detail} — e o throw dela
     acontece depois, longe do try. Verde garantido, falhe o que falhar.
     É a pior espécie de defeito num banco de provas: mente para o lado bom. */
  const antes = results.length;
  t('·sonda·', 'sonda', 'prova assíncrona de mentira', async () => { throw new Error('nunca vista'); });
  const sonda = results.pop();              // tira a sonda do relatório final
  eq(results.length, antes, 0, 'a sonda ficou no relatório');
  ok(sonda.status === 'FAIL', 'uma prova assíncrona que falha foi dada como aprovada');
  ok(/assíncrona/.test(sonda.detail), 'a mensagem não explica por que foi recusada');
});

/* ═══════════════════════════════════════════════════════════════════════════
   SUÍTE 28 · PAINEL ADMINISTRATIVO (etapa C3)                     (v2.19.0)
   ═══════════════════════════════════════════════════════════════════════════

   O aviso 9.4 dizia: "o portão administrativo compara hash, não senha
   literal". O próprio admin.js descrevia o que era — "um trinco, não uma
   fechadura" — e a comparação acontecia NO NAVEGADOR.

   Pior que o trinco era a primeira linha dele:

       if (!esperado) { this.createSession('Administrador', true); … }

   ambiente sem a variável = painel ABERTO. Deploy mal configurado virava
   balcão público.

   Aqui as decisões do portão são EXECUTADAS, como a guarda do proxy na
   suíte 27. O efeito — o handler respondendo 401/403/429 — vai para a
   fumaça, que é onde o assíncrono tem casa (prova 27.9).
   ═══════════════════════════════════════════════════════════════════════════ */
const S28 = '28 · Painel administrativo';
let A28 = null, A28ERRO = '';
try { A28 = require(ROOT + '/netlify/lib/admin.mjs'); }
catch (e) { A28ERRO = (e && e.message) || String(e); }

t(S28, '28.0', 'As decisões do portão são executáveis', () => {
  ok(A28, 'não foi possível carregar netlify/lib/admin.mjs — ' + A28ERRO);
  ok(typeof A28.conferirSenha === 'function', 'sem conferirSenha');
  return { detail: 'admin v' + A28.ADMIN_VERSAO + ' · scrypt N=' + A28.SCRYPT_N };
});

t(S28, '28.1', 'A senha é conferida com scrypt, e a tabela inteira é medida', () => {
  const h = A28.gerarHashDeSenha('frase-de-bordo-longa');
  ok(/^scrypt\$[0-9a-f]+\$[0-9a-f]+$/.test(h), 'o hash não declara o algoritmo nem o sal');

  ok(A28.conferirSenha('frase-de-bordo-longa', h).ok, 'a senha certa foi recusada');
  ok(!A28.conferirSenha('frase-de-bordo-long', h).ok, 'uma senha quase certa passou');
  ok(!A28.conferirSenha('', h).ok, 'senha vazia passou');

  /* ESTA É A INVERSÃO QUE MAIS IMPORTA. O admin.js antigo abria o painel
     quando a variável estava ausente. Agora falta de configuração NEGA. */
  const semConfig = A28.conferirSenha('qualquer', '');
  ok(!semConfig.ok, 'SEM HASH CONFIGURADO O PORTÃO ABRIU — era o defeito do admin.js antigo');
  ok(/não configurado/.test(semConfig.motivo), 'o motivo não distingue ausência de erro de senha');

  /* Hash torto não pode virar "senha certa" nem derrubar a função. */
  ['sha256$a$b', 'scrypt$só-duas', 'scrypt$zz$ww', 'lixo'].forEach(ruim =>
    ok(!A28.conferirSenha('x', ruim).ok, 'hash malformado aceito: ' + ruim));

  /* Sal diferente a cada geração: dois hashes da MESMA senha não podem ser
     iguais, senão uma tabela arco-íris serve para todos. */
  ok(A28.gerarHashDeSenha('igual') !== A28.gerarHashDeSenha('igual'),
     'o sal não é aleatório — dois hashes da mesma senha saíram idênticos');

  /* ───────────────────────────────────────────────────────────────────
     COMPARAÇÃO EM TEMPO CONSTANTE — e esta asserção FALTAVA.

     Uma mutação trocou `timingSafeEqual` por `===` e sobreviveu a tudo
     acima: as duas devolvem o mesmo veredito, e o teste só olhava o
     veredito. A diferença está no TEMPO — `===` para na primeira
     diferença, e quem mede a resposta descobre quantos caracteres
     acertou, um a um. É ataque sutil, real, e invisível para qualquer
     prova que só compare resultados.

     Cronometrar é ruim aqui (ruído de máquina compartilhada derrubaria a
     prova ao acaso), então a exigência é sobre o MECANISMO. É varredura,
     e ela sabe disso — mas varredura é melhor que asserção nenhuma. */
  const FONTE = semComentarios(fs16.readFileSync(ROOT + '/netlify/lib/admin.mjs', 'utf8'));
  ok(/timingSafeEqual\(/.test(FONTE),
     'a senha voltou a ser comparada sem tempo constante — o tempo da resposta vaza acertos');
  ok(!/obtido\s*===\s*esperado|esperado\s*===\s*obtido/.test(FONTE),
     'há comparação direta de senha além da de tempo constante');
});

t(S28, '28.2', 'scrypt é LENTO de propósito, e isso é a defesa', () => {
  /* SHA-256 faz bilhões por segundo numa placa de vídeo. scrypt não — e é
     exatamente o que se quer numa senha. Se alguém "otimizar" os parâmetros
     um dia, esta prova acusa. */
  ok(A28.SCRYPT_N >= 16384, `N=${A28.SCRYPT_N} é baixo demais para senha`);
  const t0 = Date.now();
  A28.derivar('medindo-o-custo', 'a'.repeat(32));
  const custo = Date.now() - t0;
  ok(custo >= 10, `derivação levou só ${custo} ms — rápido demais para resistir a dicionário`);
  return { detail: `N=${A28.SCRYPT_N} · ${custo} ms por tentativa` };
});

t(S28, '28.3', 'As faixas são as combinadas, e o que não está na lista não sai', () => {
  const agora = Date.UTC(2026, 9, 1, 12, 0, 0);
  const h = 3600e3, d = 24 * h;
  [['24h', 24 * h], ['72h', 72 * h], ['7d', 7 * d], ['15d', 15 * d]].forEach(([f, ms]) => {
    const v = A28.vencimentoDaFaixa(f, agora);
    ok(v, 'faixa combinada recusada: ' + f);
    eq(v.getTime() - agora, ms, 0, 'a faixa ' + f + ' não dá o prazo certo');
  });

  /* Faixa livre convidaria ao engano de digitação: "150" em vez de "15"
     emitiria cinco meses sem ninguém notar. O que não está na lista não sai. */
  ['30d', '1y', '', null, '15', 'd15', '24H '].forEach(ruim =>
    ok(A28.vencimentoDaFaixa(ruim, agora) === null, 'faixa fora da lista aceita: ' + JSON.stringify(ruim)));
});

t(S28, '28.4', 'O token tem 256 bits e o banco só vê o resumo', () => {
  const t1 = A28.gerarToken(), t2 = A28.gerarToken();
  ok(/^[0-9a-f]{64}$/.test(t1), 'o token não são 32 bytes em hexadecimal');
  ok(t1 !== t2, 'dois tokens saíram iguais — a fonte de aleatoriedade está quebrada');

  const r = A28.resumoDoToken(t1);
  ok(/^[0-9a-f]{64}$/.test(r), 'o resumo não é SHA-256 em hexadecimal');
  ok(r !== t1, 'o resumo é igual ao token — não houve resumo nenhum');
  eq(A28.resumoDoToken(t1) === r ? 1 : 0, 1, 0, 'o resumo não é estável');
  ok(A28.resumoDoToken(t2) !== r, 'tokens diferentes deram o mesmo resumo');
});

t(S28, '28.5', 'O pedido de emissão é validado ANTES de tocar no banco', () => {
  const bom = A28.validarEmissao({ vessel: '  SAAM ORION  ', faixa: '15d', devices: 3, contact: ' 5585 ' });
  ok(bom.ok, 'um pedido legítimo foi recusado: ' + bom.motivo);
  ok(bom.vessel === 'SAAM ORION', 'os espaços das pontas não foram removidos');
  ok(bom.contact === '5585', 'o contato não foi limpo');

  const ruins = [
    [{ faixa: '15d' }, 'sem embarcação'],
    [{ vessel: '   ', faixa: '15d' }, 'embarcação só com espaços'],
    [{ vessel: 'X'.repeat(61), faixa: '15d' }, 'nome longo demais'],
    [{ vessel: 'X', faixa: '30d' }, 'faixa fora da lista'],
    [{ vessel: 'X', faixa: '' }, 'faixa vazia'],
    [{ vessel: 'X', faixa: '15d', devices: 0 }, 'zero aparelhos'],
    [{ vessel: 'X', faixa: '15d', devices: 21 }, 'aparelhos demais'],
    [{ vessel: 'X', faixa: '15d', devices: 2.5 }, 'aparelhos fracionários'],
    [{ vessel: 'X', faixa: '15d', contact: 'c'.repeat(121) }, 'contato longo demais']
  ];
  ruins.forEach(([pedido, oque]) =>
    ok(!A28.validarEmissao(pedido).ok, 'passou o que devia ser recusado: ' + oque));

  /* Sem dispositivos informados vale o padrão, não um erro: o campo é
     opcional no painel. */
  ok(A28.validarEmissao({ vessel: 'X', faixa: '24h' }).devices === 3,
     'o padrão de 3 aparelhos se perdeu');
});

t(S28, '28.6', 'O cliente não confere senha, não guarda senha e não escreve innerHTML', () => {
  const C = semComentarios(fs16.readFileSync(ROOT + '/assets/js/admin.js', 'utf8'));

  /* O aviso 9.4 em uma linha: nada de comparar hash no navegador. */
  ok(!/ADMIN_GATE_HASH/.test(C), 'o cliente voltou a ler o hash do portão');
  ok(!/sha256|scrypt|digest/i.test(C), 'o cliente voltou a calcular hash de senha');
  ok(/\.netlify\/functions\/licenca/.test(C), 'o cliente não fala com o servidor');

  /* Senha em localStorage sobreviveria ao fechar o navegador, ao aparelho
     compartilhado e a um XSS — e acabamos de tirar um XSS desta origem. */
  ok(!/localStorage|sessionStorage|document\.cookie/.test(C),
     'a senha (ou a sessão) voltou a ser guardada fora da memória');

  /* innerHTML foi o vetor do XSS da C1, e aqui a mensagem vem do servidor. */
  ok(!/innerHTML/.test(C), 'o painel voltou a escrever innerHTML');
  ok(/textContent/.test(C), 'as mensagens não vão por textContent');

  /* E o painel não pode mais emitir link de acesso: a C1 matou esse caminho. */
  ok(!/\?token=|gen-url|generateToken/.test(C),
     'o painel voltou a gerar links de acesso, que não abrem porta nenhuma');
});

t(S28, '28.7', 'O servidor nega sem configuração e não vaza a chave de serviço', () => {
  const F = semComentarios(fs16.readFileSync(ROOT + '/netlify/functions/licenca.mjs', 'utf8'));

  ok(/conferirSenha\(/.test(F), 'a função não confere a senha');
  ok(/ADMIN_SENHA_HASH/.test(F), 'a função não lê o hash do ambiente');
  ok(/SUPABASE_SERVICE_KEY/.test(F), 'a função não usa a chave de serviço');

  /* Sem chave, NÃO cair num caminho degradado — mesma regra do tempo.mjs. */
  ok(/não configurada no ambiente/.test(F), 'sem chave de serviço a função não declara o motivo');

  /* A guarda de origem vem ANTES da senha: sem isso, um varredor esgotaria
     as tentativas por hora e trancaria o administrador para fora. */
  const iOrigem = F.indexOf('origemDeConfianca('), iTaxa = F.indexOf('limiteDeTaxa(');
  const iSenha = F.indexOf('conferirSenha(');
  ok(iOrigem > 0 && iTaxa > 0 && iSenha > 0, 'falta origem, taxa ou senha no caminho');
  ok(iOrigem < iTaxa && iTaxa < iSenha,
     'a ordem está errada: origem e limite têm de vir antes de gastar uma tentativa de senha');

  /* O erro do PostgREST pode ecoar cabeçalho, e cabeçalho contém a chave.

     ESTA ASSERÇÃO ERA FRACA e uma mutação provou: ela exigia que a palavra
     `mascarar(` existisse no arquivo — e a DEFINIÇÃO da função já satisfaz
     isso. Removi a CHAMADA no catch e a prova continuou verde.

     Exigir que a ferramenta exista não é exigir que ela seja usada. Agora a
     prova olha o bloco do catch, que é onde o erro vira resposta. */
  const iCatch = F.lastIndexOf('catch');
  ok(iCatch > 0, 'a função não trata falha do banco');
  const blocoCatch = F.slice(iCatch);
  ok(/mascarar\(/.test(blocoCatch),
     'o erro do banco vai CRU para o cliente — pode conter a chave de serviço');
  ok(!/motivo:\s*\(e && e\.message\)/.test(blocoCatch),
     'a mensagem crua do banco ainda chega ao cliente');
  ok(/'no-store'|"no-store"/.test(F), 'as respostas do painel podem ser cacheadas');

  /* Teto apertado: aqui o limite protege uma SENHA, não uma fatura. */
  const m = /TETO_ADMIN_HORA\s*=\s*(\d+)/.exec(F);
  ok(m, 'não há teto declarado para tentativas no painel');
  ok(Number(m[1]) <= 20, `teto de ${m[1]}/h é frouxo demais para proteger senha`);
  return { detail: `teto ${m[1]} tentativas/h` };
});

t(S28, '28.8', 'O painel administrativo não tem mais manipulador inline', () => {
  /* O aviso 9.7 conta `onclick=` e irmãos, que são o que obriga a CSP a
     aceitar 'unsafe-inline'. Código novo não aumenta a dívida — e aqui ela
     zerou neste arquivo. */
  const H = semComentariosHtml(fs16.readFileSync(ROOT + '/admin.html', 'utf8'));
  const inline = (H.match(/\son(click|submit|change|input|load)=/gi) || []).length;
  eq(inline, 0, 0, `ainda há ${inline} manipulador(es) inline no admin.html`);
  /* E nada pode chamar o objeto que deixou de existir. */
  ok(!/accessManager/.test(H), 'o HTML ainda chama accessManager, que não existe mais');
  return { detail: 'zero manipuladores inline' };
});

/* ══════════════════════════════════════════════════════════════════════════
   29 · LICENÇA NO CAMINHO DO SERVIÇO                        (C4 · v2.20.0)
   ══════════════════════════════════════════════════════════════════════════
   A etapa inteira cabe numa tabela de decisão, e é a tabela que estas provas
   atacam. O que se prova aqui não é "o código roda" — é que cada CRUZAMENTO
   de modo × veredito produz o resultado certo, inclusive os dois que um leitor
   desatento chamaria de furo (indisponível atende; observar atende sempre).
   ══════════════════════════════════════════════════════════════════════════ */
const S29 = '29 · Licença no serviço';
let L29 = null, L29ERRO = '';
try { L29 = require(ROOT + '/netlify/lib/licenca.mjs'); }
catch (e) { L29ERRO = (e && e.message) || String(e); }

t(S29, '29.0', 'As decisões da licença são executáveis', () => {
  ok(L29, 'não foi possível carregar netlify/lib/licenca.mjs — ' + L29ERRO);
  ok(typeof L29.decidirAtendimento === 'function', 'sem decidirAtendimento');
  return { detail: 'licenca v' + L29.LICENCA_VERSAO + ' · TTL ' +
                   (L29.VEREDITO_TTL_MS / 60000) + ' min' };
});

t(S29, '29.1', 'A TABELA INTEIRA de modo × veredito, cruzamento por cruzamento', () => {
  const { MODO, ESTADO, decidirAtendimento: d } = L29;
  const valida   = { ok: true,  estado: ESTADO.VALIDA };
  const vencida  = { ok: false, estado: ESTADO.VENCIDA,  motivo: 'licença vencida' };
  const ausente  = { ok: false, estado: ESTADO.AUSENTE,  motivo: 'nenhuma' };
  const revogada = { ok: false, estado: ESTADO.REVOGADA, motivo: 'revogada' };
  const indisp   = { ok: false, estado: ESTADO.INDISPONIVEL };

  /* Esta é a prova central da C4. Cada linha é um cruzamento da tabela do
     cabeçalho de licenca.mjs, escrita aqui de forma INDEPENDENTE do código —
     se alguém reescrever decidirAtendimento, a tabela continua sendo o
     contrato. É a diferença entre testar o que o código faz e testar o que
     ele DEVE fazer. */
  const esperado = [
    //  modo              veredito    atende  degradado
    [MODO.DESLIGADO, valida,   true,  false, 'desligado atende quem tem'],
    [MODO.DESLIGADO, ausente,  true,  false, 'desligado NÃO muda nada — é o padrão'],
    [MODO.DESLIGADO, vencida,  true,  false, 'desligado ignora vencimento'],
    [MODO.DESLIGADO, indisp,   true,  false, 'desligado nem consulta'],

    [MODO.OBSERVAR,  valida,   true,  false, 'observar atende'],
    [MODO.OBSERVAR,  ausente,  true,  false, 'observar atende MESMO sem licença'],
    [MODO.OBSERVAR,  vencida,  true,  false, 'observar atende vencida — só anota'],
    [MODO.OBSERVAR,  revogada, true,  false, 'observar atende revogada — só anota'],

    [MODO.EXIGIR,    valida,   true,  false, 'exigir atende quem tem'],
    [MODO.EXIGIR,    ausente,  false, false, 'exigir NEGA sem licença'],
    [MODO.EXIGIR,    vencida,  false, false, 'exigir NEGA vencida'],
    [MODO.EXIGIR,    revogada, false, false, 'exigir NEGA revogada'],
    /* 🔴 A LINHA QUE PARECE FURO E NÃO É. Ver o cabeçalho de licenca.mjs:
       negar previsão porque o VERIFICADOR caiu seria transformar o Supabase
       — que já dormiu três dias em setembro — em ponto único de falha de um
       dado de segurança da navegação. */
    [MODO.EXIGIR,    indisp,   true,  true,  'exigir ATENDE quando o verificador falha']
  ];

  for (const [modo, ver, atende, degradado, porque] of esperado) {
    const r = d(modo, ver);
    ok(r.atende === atende,
       `${modo} × ${ver.estado}: esperava atende=${atende}, veio ${r.atende} — ${porque}`);
    ok(!!r.degradado === degradado,
       `${modo} × ${ver.estado}: esperava degradado=${degradado}, veio ${!!r.degradado}`);
  }

  /* O código HTTP da recusa importa: 402 diz "falta licença", 403 diria
     "você não deveria estar aqui". A embarcação DEVERIA estar aqui. */
  eq(d(MODO.EXIGIR, ausente).status, 402, 0,
     'a recusa por licença deve ser 402, não 403 — ela tem direito ao aplicativo');

  return { detail: esperado.length + ' cruzamentos, todos conferidos' };
});

t(S29, '29.2', 'O modo desconhecido cai para DESLIGADO, não para exigir', () => {
  const { MODO, lerModo } = L29;
  /* Erro de digitação no painel do Netlify não pode barrar a frota. Aqui o
     padrão seguro aponta para o lado PERMISSIVO — ao contrário do portão
     administrativo, e pelo motivo explicado em licenca.mjs. */
  for (const bruto of ['', 'exijir', 'EXIGIR ', 'sim', 'true', '1', undefined, null, '  ']) {
    const m = lerModo({ LICENCA_MODO: bruto });
    if (String(bruto).trim().toLowerCase() === 'exigir') continue;   // 'EXIGIR ' é válido
    ok(m === MODO.DESLIGADO,
       `LICENCA_MODO=${JSON.stringify(bruto)} virou "${m}" — um erro de digitação barraria a frota`);
  }
  /* E os dois válidos funcionam, inclusive com caixa e espaço. */
  eq(lerModo({ LICENCA_MODO: 'EXIGIR ' })   === MODO.EXIGIR   ? 1 : 0, 1, 0, 'EXIGIR com caixa alta falhou');
  eq(lerModo({ LICENCA_MODO: ' observar' }) === MODO.OBSERVAR ? 1 : 0, 1, 0, 'observar com espaço falhou');
  eq(lerModo({})                            === MODO.DESLIGADO ? 1 : 0, 1, 0, 'ambiente vazio não caiu em desligado');
});

t(S29, '29.3', 'Revogada vence vencida — a mensagem manda a pessoa ao lugar certo', () => {
  const { ESTADO, vereditoDaLinha } = L29;
  const agora = Date.parse('2026-10-01T12:00:00Z');
  const h = n => new Date(agora + n * 3600000).toISOString();

  /* Uma licença revogada E já vencida deve dizer REVOGADA. Se dissesse
     "vencida", o comandante pediria renovação quando o acesso foi CORTADO —
     a mensagem errada manda a pessoa para o caminho errado, e ela só descobre
     depois de esperar. */
  const r = vereditoDaLinha({ vessel: 'SAAM ORION', expires_at: h(-48), revoked_at: h(-72) }, agora);
  ok(r.estado === ESTADO.REVOGADA, `revogada+vencida virou "${r.estado}" — devia ser revogada`);

  ok(vereditoDaLinha({ vessel: 'X', expires_at: h(-1),  revoked_at: null }, agora).estado === ESTADO.VENCIDA,
     'vencida há uma hora não foi reconhecida');
  ok(vereditoDaLinha({ vessel: 'X', expires_at: h(+1),  revoked_at: null }, agora).ok,
     'válida por mais uma hora foi recusada');
  ok(vereditoDaLinha(null, agora).estado === ESTADO.DESCONHECIDA,
     'linha ausente devia ser desconhecida');

  /* Data ilegível é tratada como vencida: o custo é pedir renovação, e o
     custo do contrário seria acesso indevido e perpétuo. */
  ok(vereditoDaLinha({ vessel: 'X', expires_at: 'banana', revoked_at: null }, agora).estado === ESTADO.VENCIDA,
     'data ilegível devia recusar, não liberar');

  /* A borda exata: vencer AGORA é estar vencida, não válida. */
  ok(!vereditoDaLinha({ vessel: 'X', expires_at: new Date(agora).toISOString(), revoked_at: null }, agora).ok,
     'uma licença que vence neste instante não pode valer');

  /* Horas restantes alimentam o aviso "sua licença vence em N h". */
  eq(vereditoDaLinha({ vessel: 'X', expires_at: h(9.5), revoked_at: null }, agora).horasRestantes, 9, 0,
     'horas restantes arredondou para cima — avisaria tarde demais');
});

t(S29, '29.4', 'O código viaja em cabeçalho, nunca em URL', () => {
  const { CABECALHO_LICENCA, extrairLicenca } = L29;
  eq(CABECALHO_LICENCA === 'x-licenca' ? 1 : 0, 1, 0, 'o nome do cabeçalho mudou');

  /* Normaliza o que chega colado de WhatsApp: espaço nas pontas e caixa. */
  const cod = 'A'.repeat(0) + 'abcdef0123456789'.repeat(4);
  eq(extrairLicenca(n => n === 'x-licenca' ? ('  ' + cod.toUpperCase() + ' ') : null) === cod ? 1 : 0, 1, 0,
     'não normalizou espaço e caixa — o código colado de WhatsApp seria recusado');
  eq(extrairLicenca(() => null) === '' ? 1 : 0, 1, 0, 'ausência devia virar string vazia, não null');

  /* E o proxy NÃO pode aceitar a licença por parâmetro de URL: URL vai para
     log de CDN, histórico e Referer. Varredura de código, declarada. */
  const F = semComentarios(fs16.readFileSync(ROOT + '/netlify/functions/tempo.mjs', 'utf8'));
  ok(!/searchParams\.get\(\s*['"]licenca['"]/.test(F),
     'o proxy voltou a aceitar licença por URL — ela vazaria em log e Referer');
  ok(/extrairLicenca\(/.test(F), 'o proxy não lê a licença do cabeçalho');
});

t(S29, '29.5', 'Formato é conferido ANTES de gastar viagem de rede', () => {
  const { formatoDeLicenca } = L29;
  const bom = 'abcdef0123456789'.repeat(4);                 // 64 hex
  ok(formatoDeLicenca(bom), 'um código legítimo foi recusado pelo formato');
  for (const ruim of ['', 'abc', bom.slice(0, 63), bom + 'a', bom.toUpperCase(),
                      bom.slice(0, 63) + 'g', null, undefined, 123]) {
    ok(!formatoDeLicenca(ruim), `"${String(ruim).slice(0, 12)}…" passou pelo formato e iria ao banco à toa`);
  }
});

t(S29, '29.6', 'O cache guarda o resumo, nunca o código — e nunca o indisponível', () => {
  const { ESTADO, novoCacheVeredito, lerVeredito, guardarVeredito, VEREDITO_TTL_MS } = L29;
  const cod = 'abcdef0123456789'.repeat(4);
  const agora = 1759330000000;
  const c = novoCacheVeredito();

  guardarVeredito(c, cod, { ok: true, estado: ESTADO.VALIDA }, agora);
  ok(lerVeredito(c, cod, agora), 'o veredito guardado não foi encontrado');

  /* A chave é o SHA-256: um despejo de memória não entrega licença de
     ninguém. Mesma disciplina com que o banco guarda só o resumo. */
  const chaves = [...c.keys()];
  ok(!chaves.includes(cod), '🔴 o cache guardou o CÓDIGO em claro');
  ok(/^[0-9a-f]{64}$/.test(chaves[0]) && chaves[0] !== cod, 'a chave do cache não é o resumo');

  /* Expira. Um segundo DEPOIS do TTL já não vale. */
  ok(!lerVeredito(c, cod, agora + VEREDITO_TTL_MS + 1), 'o veredito venceu e continuou valendo');

  /* INDISPONÍVEL nunca entra: guardá-lo prenderia a embarcação ao modo
     degradado por cinco minutos depois de o banco já ter voltado. */
  const c2 = novoCacheVeredito();
  guardarVeredito(c2, cod, { ok: false, estado: ESTADO.INDISPONIVEL }, agora);
  eq(c2.size, 0, 0, 'o cache guardou um "indisponível" — a degradação ficaria presa 5 min');

  /* Negativo legítimo É guardado: sem isso, um código digitado errado bateria
     no banco a cada busca de tempo. */
  const c3 = novoCacheVeredito();
  guardarVeredito(c3, cod, { ok: false, estado: ESTADO.VENCIDA }, agora);
  eq(c3.size, 1, 0, 'o cache não guardou um veredito negativo legítimo — um engano de digitação viraria enxurrada');
});

t(S29, '29.7', 'O proxy desligado não toca no Supabase, e o degrau fica no lugar certo', () => {
  const F = semComentarios(fs16.readFileSync(ROOT + '/netlify/functions/tempo.mjs', 'utf8'));

  /* Em modo desligado a C4 custa ZERO: sem leitura de cabeçalho, sem rede.
     Uma etapa que pesa mesmo desligada é uma etapa que ninguém deixa
     desligada em paz. */
  ok(/if\s*\(\s*modo\s*!==\s*MODO\.DESLIGADO\s*\)/.test(F),
     'o proxy consulta licença mesmo com o modo desligado — custo onde devia haver zero');

  /* ORDEM, que é a defesa inteira. A licença tem de ficar DEPOIS do limite de
     taxa (senão um laço de requisições sem licença bateria no Supabase sem
     freio) e ANTES do cache (senão bastaria pedir logo após uma embarcação
     licenciada para pegar carona). */
  /* ⚠️ ESTA PROVA JÁ NASCEU ERRADA UMA VEZ, e a lição é a mesma da 28.7,
     repetida por mim duas horas depois de corrigi-la lá.

     A primeira versão procurava `doCache(chave)` e acusava o código CORRETO.
     Motivo: `function doCache(chave)` — a DEFINIÇÃO, no topo do arquivo —
     casa com o mesmo texto da chamada, e vem antes de tudo. A prova estava
     medindo a posição da declaração e chamando aquilo de ordem de execução.

     Oitava vez que esta casa tropeça na família "a varredura casou com a
     coisa errada". A emenda é ancorar na linha de CHAMADA, que é única e
     carrega a atribuição. */
  const iTaxa  = F.indexOf('limiteDeTaxa(guarda');
  const iLic   = F.indexOf('decidirAtendimento(modo');
  const iCache = F.indexOf('const guardado = doCache(chave)');
  const iFus   = F.indexOf('pedirGasto(guarda');
  ok(iTaxa > 0 && iLic > 0 && iCache > 0 && iFus > 0, 'não encontrei os quatro degraus no proxy');
  ok(iTaxa < iLic,
     'a licença é conferida ANTES do limite de taxa — um laço bateria no Supabase sem freio');
  ok(iLic < iCache,
     'a licença é conferida DEPOIS do cache — daria carona a quem pedir logo após um licenciado');
  ok(iCache < iFus, 'o fusível deixou de ser o último portão antes do Open-Meteo');

  /* A recusa nunca é cacheada pela CDN: um 402 guardado na borda negaria
     serviço a quem acabou de comprar licença. Mesmo defeito que a v2.16.0
     corrigiu para o 403. */
  const trecho = F.slice(F.indexOf('402'), F.indexOf('402') + 400);
  ok(/semCache/.test(trecho), 'a recusa 402 pode ser cacheada pela CDN — negaria quem acabou de licenciar');
});

t(S29, '29.8', 'O selo de licença não entra no cache compartilhado', () => {
  const F = semComentarios(fs16.readFileSync(ROOT + '/netlify/functions/tempo.mjs', 'utf8'));
  /* `guardar(chave, dado)` tem de receber o dado PURO. Se o selo fosse junto,
     a próxima embarcação herdaria o estado de licença da anterior — vazamento
     silencioso clássico de cache compartilhado. */
  /* ⚠️ E ESTA PROVA TAMBÉM NASCEU ERRADA — nona vez na mesma família, segunda
     vez no mesmo dia, e desta vez numa prova escrita JUSTAMENTE sobre o
     perigo de varredura casar com a coisa errada.

     A versão anterior exigia a presença de `guardar(chave, dado)`. Mutei o
     código para `guardar(chave, Object.assign({}, dado, selo))` — contaminando
     o cache compartilhado, que é exatamente o defeito que esta prova existe
     para impedir — e ela seguiu VERDE. Motivo: `function guardar(chave, dado)`,
     a DECLARAÇÃO lá em cima, satisfaz o padrão sozinha.

     Não basta exigir que a chamada certa exista; é preciso exigir que a
     ERRADA não exista. Uma prova que só procura o bom nunca vê o mau que foi
     acrescentado ao lado. */
  ok(/\n\s+guardar\(chave, dado\);/.test(F),
     'a chamada que guarda no cache mudou de forma — confira se o selo não foi junto');
  ok(!/guardar\(chave,\s*Object\.assign/.test(F),
     '🔴 o selo de licença está indo para o CACHE COMPARTILHADO — a próxima embarcação herdaria o estado de licença da anterior');
  ok(/return new Response\(JSON\.stringify\(Object\.assign\(\{\},\s*dado,\s*selo\)\)/.test(F),
     'o selo não é anexado por cópia só na resposta');
});

t(S29, '29.9', 'O cliente manda em cabeçalho, não deixa o código na tela, e não usa innerHTML', () => {
  const C = semComentarios(fs16.readFileSync(ROOT + '/assets/js/tempo.js', 'utf8'));

  ok(/'x-licenca'/.test(C), 'o cliente não envia o cabeçalho da licença');
  ok(!/licenca=\$\{|[?&]licenca=/.test(C), 'o cliente voltou a mandar a licença na URL');

  /* Depois de guardar, o campo é limpo: 64 caracteres de licença numa tela
     que pode estar sendo espelhada ou fotografada é a licença entregue. */
  ok(/campo\.value\s*=\s*''/.test(C), 'o código fica na tela depois de guardado');

  /* O eco do estado vai para textContent. A C1 já pagou o preço de escrever
     entrada de usuário como HTML — não se repete. */
  ok(!/innerHTML/.test(C), '🔴 innerHTML voltou ao cliente do tempo');

  /* E a ligação é por addEventListener: cada atributo onclick= a menos é um
     passo para fechar o aviso 9.7. */
  ok(/addEventListener/.test(C), 'o campo foi ligado por atributo embutido, piorando o 9.7');
  const H = semComentariosHtml(fs16.readFileSync(ROOT + '/app.html', 'utf8'));
  ok(/id="licencaCodigo"/.test(H), 'o campo de licença não existe no formulário');
  ok(!/id="licencaGuardar"[^>]*onclick/.test(H), 'o botão da licença usa onclick embutido');
});

t(S29, '29.10', '402 é tratado como "falta licença", não como "servidor caiu"', () => {
  const C = semComentarios(fs16.readFileSync(ROOT + '/assets/js/tempo.js', 'utf8'));
  /* Confundir os dois manda o comandante procurar sinal de rádio quando o que
     ele precisa é mandar uma mensagem pelo WhatsApp. */
  ok(/r\.status\s*===\s*402/.test(C), 'o cliente não distingue 402 de falha de serviço');

  /* ⚠️ ÂNCORA AMBÍGUA — esta prova nasceu frágil e a C5 cobrou.
     A versão anterior fazia `C.indexOf('402')` e examinava os 500 caracteres
     seguintes. Funcionou enquanto só existia um 402 no arquivo. A C5 trouxe
     `if (st === 402) return 'licenca'` no classificador, que aparece ANTES —
     e a prova passou a examinar o trecho errado, acusando código correto.

     Décima ocorrência da mesma família nesta casa: a varredura casou com a
     coisa errada. Agora a âncora é o texto ÚNICO do tratamento da resposta,
     não um número que pode se repetir. */
  const i = C.indexOf('if (r.status === 402)');
  ok(i > 0, 'não encontrei o tratamento do 402 na resposta');
  const trecho = C.slice(i, i + 500);
  ok(/tempoLicenca\s*=/.test(trecho),
     'o cliente não registra o estado da licença ao receber 402');
  /* E não apaga o último bom conhecido: o dado velho rotulado continua
     servindo, que é a decisão já aprovada para falha de tempo. */
  ok(!/\btempoAtual\s*=\s*null/.test(trecho),
     'o 402 apagou o último tempo conhecido — o passadiço ficaria sem nada');
});

/* ══════════════════════════════════════════════════════════════════════════
   30 · DIAGNÓSTICO HONESTO DA FALTA DE PREVISÃO           (C5 · v2.21.0)
   ══════════════════════════════════════════════════════════════════════════
   Até a v2.20.0 a linha do painel devolvia STRING VAZIA quando não havia
   dado. Quatro causas completamente diferentes, com quatro ações diferentes,
   produziam a MESMA tela em branco.

   Estas provas EXECUTAM a classificação e a linha do painel — não varrem o
   texto delas. É a diferença entre provar que a lâmpada acende e conferir se
   alguém escreveu "lâmpada" no esquema elétrico.
   ══════════════════════════════════════════════════════════════════════════ */
const S30 = '30 · Diagnóstico de previsão';
const { classificarFalhaDeTempo: cls30, rotuloDeFalhaDeTempo: rot30,
        dicaDeFalhaDeTempo: dica30, TEMPO_DIAG: DIAG30,
        setTempoFalha: setFalha30, setTempoAtual: setTempo30 } = A;

t(S30, '30.0', 'A classificação é executável e a tabela está completa', () => {
  ok(typeof cls30 === 'function', 'classificarFalhaDeTempo não foi extraída');
  const chaves = Object.keys(DIAG30 || {});
  ok(chaves.length >= 8, `a tabela tem só ${chaves.length} causas`);
  /* Toda entrada precisa de rótulo curto, dica longa e ATRIBUIÇÃO DE CULPA.
     A culpa é o campo que decide se o comandante age ou espera — uma entrada
     sem ela é uma mensagem que não diz o que fazer. */
  for (const k of chaves) {
    const d = DIAG30[k];
    ok(d.rotulo && d.rotulo.length <= 30, `"${k}": rótulo ausente ou longo demais para o HUD`);
    ok(d.dica && d.dica.length >= 40, `"${k}": dica curta demais para explicar`);
    ok(['licenca', 'autor', 'servico', 'aparelho'].includes(d.culpa),
       `"${k}": culpa inválida (${d.culpa}) — sem isso a mensagem não diz o que fazer`);
  }
  return { detail: chaves.length + ' causas, todas com rótulo, dica e culpa' };
});

t(S30, '30.1', 'Cada resposta do servidor cai na causa certa', () => {
  /* Tabela escrita de forma INDEPENDENTE do código: se alguém reescrever o
     classificador, isto continua sendo o contrato. */
  const casos = [
    [{ status: 402, online: true }, 'licenca',    'falta licença'],
    [{ status: 429, online: true }, 'taxa',       'muitas consultas'],
    [{ status: 400, online: true }, 'coordenada', 'GPS sem fixo'],
    [{ status: 403, online: true }, 'origem',     'origem recusada'],
    [{ status: 200, online: true }, 'servico',    'resposta estranha'],
    [{ status: 418, online: true }, 'servico',    'código desconhecido cai em serviço'],

    /* 503 tem DOIS casos, e confundi-los seria o erro clássico: um é a cota do
       autor esgotada, o outro é portão mal configurado. Ações diferentes. */
    [{ status: 503, motivo: 'teto diário de consultas atingido (2000/2000)', online: true }, 'cota', 'fusível'],
    [{ status: 503, motivo: 'portão não configurado', online: true }, 'sem-chave', 'má configuração'],

    /* 502 também tem dois: chave ausente (culpa do autor) e provedor caído
       (culpa de terceiro). O número sozinho não distingue. */
    [{ status: 502, motivo: 'OPEN_METEO_API_KEY não configurada no ambiente', online: true }, 'sem-chave', 'chave ausente'],
    [{ status: 502, motivo: 'Open-Meteo respondeu 500', online: true }, 'servico', 'provedor caído'],

    /* Sem rede vence QUALQUER status: não houve resposta, então nada do que eu
       observei é confiável. */
    [{ status: 502, online: false }, 'sem-rede', 'offline vence o status'],
    [{ status: 0,   online: false }, 'sem-rede', 'nada chegou'],
    [{ status: 0,   online: true  }, 'servico',  'não chegou, mas há rede']
  ];
  for (const [info, esperado, porque] of casos) {
    const r = cls30(info);
    ok(r === esperado,
       `status ${info.status}${info.motivo ? ' "' + info.motivo.slice(0, 24) + '"' : ''}` +
       ` online=${info.online}: esperava "${esperado}", veio "${r}" — ${porque}`);
  }
  return { detail: casos.length + ' respostas classificadas' };
});

t(S30, '30.2', 'A culpa é atribuída a quem realmente é — e isso é a mensagem', () => {
  /* ═══════════════════════════════════════════════════════════════════════
     ESTA É A PROVA CENTRAL DA C5, e não é sobre texto bonito.

     O comandante que lê "cota diária esgotada" sem saber que a cota é do AUTOR
     passa a madrugada mexendo no aparelho. O que lê "sem internet" sabe que
     tem de subir ao convés. Mesma falta de previsão, ações opostas.

     Por isso a culpa é PROVADA, não revisada: é a parte da mensagem que muda o
     que acontece a bordo.
     ═══════════════════════════════════════════════════════════════════════ */
  const esperado = {
    'licenca':    'licenca',    // o comandante resolve, por WhatsApp
    'cota':       'autor',      // 🔴 NÃO é o aparelho dele
    'sem-chave':  'autor',      // falha de implantação
    'origem':     'autor',      // defeito de configuração
    'servico':    'servico',    // terceiro; ninguém a bordo resolve
    'sem-rede':   'aparelho',   // ele resolve, subindo ao convés
    'taxa':       'aparelho',
    'coordenada': 'aparelho'
  };
  for (const [causa, culpa] of Object.entries(esperado)) {
    eq(dica30(causa).culpa === culpa ? 1 : 0, 1, 0,
       `"${causa}" deveria ser culpa de "${culpa}", veio "${dica30(causa).culpa}"`);
  }

  /* A cota é do autor, e a dica tem de DIZER isso com estas letras. Sem a
     negativa explícita, o comandante assume que o limite é dele. */
  const cota = dica30('cota').dica.toLowerCase();
  ok(/não é o seu aparelho|nao é o seu aparelho/.test(cota),
     'a dica da cota não diz que NÃO é o aparelho do comandante — ele vai procurar defeito onde não há');
  ok(/nada a fazer a bordo|não há nada a fazer/.test(cota),
     'a dica da cota não diz que não há ação a bordo');

  /* E a de serviço precisa descartar as três causas vizinhas, senão o
     comandante testa uma por uma. */
  const serv = dica30('servico').dica.toLowerCase();
  ok(/não é o seu aparelho/.test(serv) && /licença/.test(serv) && /cota/.test(serv),
     'a dica de serviço não descarta aparelho, licença e cota — sobra diagnóstico para o passadiço fazer');

  /* Só a de licença traz link, porque só ela tem ação imediata. */
  ok(dica30('licenca').link && /wa\.me/.test(dica30('licenca').link),
     'a causa "licenca" não traz o contato — é a única com solução imediata');
  ok(!dica30('cota').link, 'a cota traz link como se o comandante pudesse resolver');
});

t(S30, '30.3', '🔴 O PAINEL NUNCA MAIS FICA EM SILÊNCIO', () => {
  /* ═══════════════════════════════════════════════════════════════════════
     O DEFEITO QUE A C5 FECHA, provado por EXECUÇÃO.

     `linhaDeTempoNoPainel()` devolvia '' sem dado. Esta prova chama a função
     de verdade, com cada causa, e exige frase — não varre o código em busca de
     um `return ''` ausente, porque ausência de texto não prova presença de
     comportamento.
     ═══════════════════════════════════════════════════════════════════════ */
  setTempo30(null);

  /* Sem dado e sem falha = primeira busca em andamento. Nem isso pode ser
     branco: "buscando" é informação, branco não é. */
  setFalha30(null);
  const buscando = A.linhaDeTempoNoPainel();
  ok(buscando && buscando.length > 0,
     '🔴 o painel voltou a ficar EM BRANCO durante a primeira busca');
  ok(/buscando/i.test(buscando), `a linha inicial não diz que está buscando: "${buscando}"`);

  /* E com cada causa, o motivo aparece. */
  for (const causa of Object.keys(DIAG30)) {
    setFalha30(causa);
    const linha = A.linhaDeTempoNoPainel();
    ok(linha && linha.length > 0, `🔴 painel EM BRANCO com a causa "${causa}"`);
    ok(linha.includes(rot30(causa)),
       `a linha não traz o motivo "${rot30(causa)}" — veio: "${linha}"`);
    ok(/sem previsão/.test(linha),
       `a linha não diz que não há previsão — veio: "${linha}"`);
  }
  setFalha30(null); setTempo30(null);
  return { detail: Object.keys(DIAG30).length + ' causas, nenhuma em branco' };
});

t(S30, '30.4', 'Dado velho e motivo aparecem JUNTOS, não um ou outro', () => {
  /* Separados, cada um conta meia verdade: "40 min" não diz por que parou, e
     "fora do ar" não diz que ainda há número bom na tela. O comandante precisa
     das duas para decidir se confia no número. */
  setTempo30({
    ok: true, emitidoEm: new Date(Date.now() - 47 * 60000).toISOString(),
    ar: { wind_speed_10m: 12.5, wind_direction_10m: 228, wind_gusts_10m: 15.9, pressure_msl: 1009.6 },
    mar: { wave_height: 1.3, wave_period: 8.4 }
  });

  setFalha30('servico');
  const comFalha = A.linhaDeTempoNoPainel();
  ok(/12 kt|13 kt/.test(comFalha), `o dado bom desapareceu: "${comFalha}"`);
  ok(/47 min/.test(comFalha), `a idade desapareceu: "${comFalha}"`);
  ok(comFalha.includes('serviço fora do ar'), `o motivo não entrou: "${comFalha}"`);

  /* E quando volta a funcionar, o aviso SAI. Um aviso que não sai é um aviso
     que se aprende a ignorar — e aí o próximo, verdadeiro, também é ignorado. */
  setFalha30(null);
  const semFalha = A.linhaDeTempoNoPainel();
  ok(!/⚠️/.test(semFalha), `o aviso ficou grudado depois de a busca voltar: "${semFalha}"`);
  ok(/12 kt|13 kt/.test(semFalha), 'o dado desapareceu quando a falha foi limpa');
  setTempo30(null);
});

t(S30, '30.5', 'O relatório diz por que não há previsão, em vez de omitir a seção', () => {
  /* Antes, `tempoParaRelatorio` devolvia null sem dado e a seção de tempo
     simplesmente não existia — silêncio em papel. Um relatório que omite faz
     o leitor pensar que ninguém olhou o tempo. */
  setTempo30(null);

  setFalha30(null);
  eq(A.tempoParaRelatorio(0, 10) === null ? 1 : 0, 1, 0,
     'sem dado E sem falha o relatório deveria devolver null — não há o que dizer ainda');

  setFalha30('licenca');
  const r = A.tempoParaRelatorio(0, 10);
  ok(r && r.semPrevisao === true, 'o relatório voltou a omitir a seção de tempo');
  ok(r.causa === 'licenca' && r.culpa === 'licenca', `causa/culpa erradas: ${r.causa}/${r.culpa}`);
  ok(r.dica && r.dica.length > 40, 'o relatório não leva a explicação');
  ok(r.link && /wa\.me/.test(r.link), 'o relatório não leva o contato na causa que tem solução');

  /* Com dado bom E falha corrente, o relatório diz AS DUAS coisas. */
  setTempo30({ ok: true, emitidoEm: new Date().toISOString(),
               ar: { wind_speed_10m: 10 }, mar: { wave_height: 1 } });
  setFalha30('cota');
  const r2 = A.tempoParaRelatorio(0, 10);
  ok(r2 && !r2.semPrevisao, 'havendo dado, o relatório não deveria declarar ausência');
  ok(r2.falhaCorrente && r2.falhaCorrente.causa === 'cota',
     'o relatório não registra que a busca está falhando apesar de haver dado velho');
  ok(r2.falhaCorrente.culpa === 'autor', 'a culpa da cota não chegou ao relatório');
  setFalha30(null); setTempo30(null);
});

t(S30, '30.7', 'A dica é construída com nós do DOM, nunca com innerHTML', () => {
  const C = semComentarios(fs16.readFileSync(ROOT + '/assets/js/tempo.js', 'utf8'));
  const i = C.indexOf('function pintarDicaDeTempo');
  ok(i > 0, 'pintarDicaDeTempo desapareceu');
  const fn = C.slice(i, i + 1400);

  /* A C1 encontrou um XSS em produção num lugar onde "o texto é nosso" parecia
     bastar. Regra que admite exceção por conveniência deixa de ser regra. */
  ok(!/innerHTML|insertAdjacentHTML|outerHTML/.test(fn),
     '🔴 a dica voltou a ser escrita como HTML');
  ok(/textContent/.test(fn), 'a dica não usa textContent');
  ok(/createElement\('a'\)/.test(fn), 'o link não é criado como nó — provavelmente virou marcação');
  ok(/rel = 'noopener'/.test(fn), 'o link abre em nova aba sem noopener');

  /* Faixa permanente é faixa invisível: a dica tem de SAIR, não ficar cinza. */
  ok(/box\.hidden = true/.test(fn), 'a dica não desaparece quando a busca volta');

  /* E a linha é própria, não o navGpsStatus — que já é do GPS e do espelho. */
  const H = semComentariosHtml(fs16.readFileSync(ROOT + '/app.html', 'utf8'));
  ok(/id="navTempoDica"/.test(H), 'a linha da dica não existe no painel');
  ok(!/navGpsStatus/.test(fn), 'a dica disputa o espaço do GPS — duas verdades no mesmo lugar');
});

t(S30, '30.6', 'A classificação acontece onde o status existe, não no catch', () => {
  const C = semComentarios(fs16.readFileSync(ROOT + '/assets/js/tempo.js', 'utf8'));
  /* Classificar só no `catch` perderia o número HTTP — e o número é metade do
     diagnóstico. Foi exatamente assim que a tela em branco nasceu: a
     informação existia no momento da resposta e era descartada. */
  const iResp = C.indexOf('if (!j || !j.ok) {');
  ok(iResp > 0, 'o tratamento da resposta não-ok mudou de forma');
  ok(/classificarFalhaDeTempo\(\{/.test(C.slice(iResp, iResp + 400)),
     'a resposta não-ok não é classificada onde o status ainda existe');
  ok(/status:\s*r\.status/.test(C.slice(iResp, iResp + 400)),
     'o status HTTP não entra na classificação — metade do diagnóstico se perde');

  /* O catch classifica só o que nunca teve resposta, e NÃO sobrescreve. */
  const iCatch = C.lastIndexOf('} catch (e) {');
  ok(/if \(!tempoFalhaAtual\)/.test(C.slice(iCatch, iCatch + 400)),
     'o catch sobrescreve um diagnóstico melhor, feito com o status na mão');

  /* ⚠️ E O SUCESSO LIMPA — asserção que nasceu inútil, DÉCIMA PRIMEIRA vez
     que esta casa cai na mesma família.

     A versão anterior era `/tempoFalhaAtual = null;/.test(C)`, varrendo o
     arquivo inteiro. A DECLARAÇÃO `let tempoFalhaAtual = null;` satisfaz esse
     padrão sozinha — então removi a limpeza no caminho de sucesso e a prova
     seguiu verde, deixando o aviso grudado para sempre. Um aviso que não sai é
     um aviso que se aprende a ignorar, e aí o próximo, verdadeiro, também é.

     O engodo mudou de forma (antes `function guardar(chave, dado)`, agora um
     `let`), a armadilha é a mesma: o padrão existe em dois lugares e só um
     deles é o comportamento. A âncora agora é o bloco de SUCESSO, identificado
     por `tempoFalhas = 0;`, que só existe lá. */
  /* 🔴 E A PRIMEIRA EMENDA TAMBÉM ERROU — décima segunda ocorrência, cometida
     ao consertar a décima primeira.

     Ancorei em `tempoFalhas = 0;`. Esse texto aparece DUAS vezes: na
     declaração `let tempoFalhas = 0;` e no bloco de sucesso. A declaração vem
     primeiro, e logo ao lado dela está `let tempoFalhaAtual = null;` — então
     os 200 caracteres examinados eram os das DECLARAÇÕES, e a mutação
     sobreviveu de novo.

     A lição que faltava: **medir quantas vezes a âncora aparece ANTES de
     confiar nela**. Por isso a contagem abaixo é parte da prova, e não um
     comentário pedindo cuidado. Comentário não executa; asserção executa. */
  const ocorrencias = (C.match(/tempoAtual = j;/g) || []).length;
  eq(ocorrencias, 1, 0,
     `a âncora "tempoAtual = j;" aparece ${ocorrencias}x — âncora ambígua não prova ordem nenhuma`);

  const iOk = C.indexOf('tempoAtual = j;');
  ok(/tempoFalhaAtual = null/.test(C.slice(iOk, iOk + 200)),
     'o sucesso não limpa o diagnóstico — o aviso fica grudado e se aprende a ignorá-lo');
});

/* ═══ RELATÓRIO ═══ */
const byStatus = s => results.filter(r=>r.status===s).length;
const ICON = { PASS:'\x1b[32m✔\x1b[0m', FAIL:'\x1b[31m✘\x1b[0m', WARN:'\x1b[33m▲\x1b[0m' };
let cur='';
results.forEach(r => {
  if (r.suite!==cur){ cur=r.suite; console.log(`\n\x1b[1m── SUÍTE ${cur} ${'─'.repeat(Math.max(0,52-cur.length))}\x1b[0m`); }
  console.log(` ${ICON[r.status]} ${r.id}  ${r.desc}`);
  if (r.detail) console.log(`      \x1b[90m${r.detail}\x1b[0m`);
});
console.log('\n' + '═'.repeat(74));
console.log(`TOTAL: ${results.length}   \x1b[32mPASS ${byStatus('PASS')}\x1b[0m   \x1b[31mFAIL ${byStatus('FAIL')}\x1b[0m   \x1b[33mWARN ${byStatus('WARN')}\x1b[0m`);
console.log('═'.repeat(74));
require('fs').writeFileSync(__dirname+'/results.json', JSON.stringify(results,null,2));

/* ═══════════════════════════════════════════════════════════════════════════
   CÓDIGO DE SAÍDA — a decisão, separada do efeito

   Quem lê a saída na tela enxerga o ✘ vermelho. Quem NÃO lê — a máquina de
   integração, um `&&` num script, um gancho de commit — só consulta o código
   de saída do processo. Até 21/09/2026 esse código era sempre 0, e portanto
   o banco de provas mentia para todo mundo que não tivesse olhos.

   A regra, em uma frase: só FAIL derruba a obra.

   Comportamento da função conforme a lista recebida:
     ·  []                              → 0   (nada a reprovar)
     ·  [PASS, PASS]                    → 0
     ·  [PASS, WARN, WARN]              → 0   (avisos são conhecidos e documentados)
     ·  [FAIL]                          → 1
     ·  [PASS, FAIL, WARN]              → 1   (basta uma falha)

   `some` e não `filter().length` porque a pergunta é "existe alguma?", e a
   primeira falha já responde — a contagem interessa ao relatório, não à
   decisão.

   Provada na suíte 26 (26.3 e 26.4), que é também onde está registrado por
   que um alarme que toca todo dia deixa de ser um alarme. */
function codigoDeSaida(resultados) {
  return (resultados || []).some(r => r && r.status === 'FAIL') ? 1 : 0;
}

/* `process.exitCode` e não `process.exit()`: atribuir deixa o Node terminar de
   escoar stdout e o results.json antes de encerrar. `process.exit()` corta a
   saída no meio quando o terminal está lento — e um relatório truncado é
   exatamente o que ninguém quer ler depois de um CI vermelho. */
process.exitCode = codigoDeSaida(results);
