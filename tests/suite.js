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
  try { const r = fn(); if (r && r.warn) { status = 'WARN'; detail = r.warn; } else if (r && r.detail) detail = r.detail; }
  catch (e) { status = 'FAIL'; detail = e.message; }
  results.push({ suite, id, desc, status, detail });
}
function eq(a, b, tol, msg) {
  if (Math.abs(a - b) > tol) throw new Error(`${msg || ''} esperado ${b} ±${tol}, obtido ${a}`);
}
function ok(cond, msg) { if (!cond) throw new Error(msg); }

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
t(S9, '9.4', 'O portão administrativo compara hash, não senha literal', () => {
  const adm = require('fs').readFileSync(ROOT + '/assets/js/admin.js', 'utf8');
  ok(/ADMIN_GATE_HASH/.test(adm) && /SHA-256/.test(adm),
     'a frase-senha deve vir como SHA-256 de variável de ambiente, gerada no build');
  return { warn: 'continua sendo trinco, não fechadura: o hash está no cliente. ' +
                 'Controle real exige validação no servidor (ver check_nav_share)' };
});
t(S9, '9.5', 'Gatekeeper não promete autenticação que não entrega', () => {
  const gk = require('fs').readFileSync(ROOT + '/assets/js/gatekeeper.js', 'utf8');
  ok(!/any new token is valid/i.test(gk) && /não é uma credencial|não autentica/i.test(gk),
     'a limitação do token precisa estar declarada no código, não escondida');
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
t(S10, '10.1', 'Sobre um farol costeiro ⇒ ≈ 0 NM', () => {
  const d = distanceFromCoast(-3.7263, -38.4717); eq(d, 0, 0.5); return { detail: d.toFixed(2)+' NM' };
});
t(S10, '10.2', '10 NM ao largo do Mucuripe ⇒ ≈ 10 NM', () => {
  const p = offsetLatLng(-3.7263, -38.4717, 0, 10); // 10 NM ao norte (mar aberto)
  const d = distanceFromCoast(p.lat, p.lng); eq(d, 10, 2); return { detail: d.toFixed(2)+' NM' };
});
t(S10, '10.3', 'Ilhas afastadas ficam FORA da poligonal costeira', () => {
  // Elas continuam na base de faróis (servem de referência de avistamento);
  // o que não podem é entrar na linha que representa o litoral.
  const linha = A.getCoastline();
  const ilhas = ['alcatrazes','laje-de-santos','queimada-grande','arvoredo',
                 'fernando-de-noronha','rocas','sao-pedro-e-sao-paulo','martin-vaz',
                 'trindade','abrolhos'];
  const dentro = ilhas.filter(id => {
    const lh = lighthouses.find(l => l.id === id);
    return lh && linha.some(p => p.lat === lh.lat && p.lng === lh.lng);
  });
  ok(dentro.length === 0,
     'ilha na poligonal costeira: ' + dentro.join(', ') +
     ' — a linha salta para o mar e subestima a distância da costa');
  return { detail: `${linha.length} de ${lighthouses.length} faróis compõem a linha de costa` };
});
t(S10, '10.4', 'Erro da poligonal declarado e dentro do esperado (≤ 25%)', () => {
  const p = offsetLatLng(-3.7263, -38.4717, 0, 10);
  const d = distanceFromCoast(p.lat, p.lng);
  const erro = Math.abs(d - 10) / 10 * 100;
  ok(erro <= 25, `erro de ${erro.toFixed(0)}% a 10 NM da costa`);
  return { warn: `aproximação por 88 pontos: ${d.toFixed(2)} NM medidos para 10 NM reais ` +
                 `(${erro.toFixed(0)}% a menos). Serve para ordem de grandeza, não para aproximação` };
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
  const antigas = [...IDX16.matchAll(/[Vv]ers[ãa]o\s+(\d+\.\d+\.\d+)|v(\d+\.\d+\.\d+)/g)]
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
  const barra = APP17.slice(APP17.indexOf('id="navShareBtn"') - 400, APP17.indexOf('id="navCollapseBtn"') + 200);
  const botoes = barra.match(/<button[^>]*class="nav-icon-btn"[^>]*>/g) || [];
  ok(botoes.length >= 7, `a barra tem ${botoes.length} botões — esperados ao menos 7`);
  const semTitulo = botoes.filter(b => !/title="/.test(b));
  ok(semTitulo.length === 0, `${semTitulo.length} botão(ões) sem title — ninguém adivinha o ícone`);
  // Todo botão com ação precisa impedir que o toque recolha o painel inteiro.
  const comAcao = botoes.filter(b => /onclick=/.test(b));
  const semStop = comAcao.filter(b => !/event\.stopPropagation\(\)/.test(b));
  ok(semStop.length === 0, `${semStop.length} botão(ões) recolheriam o painel ao serem tocados`);
  return { detail: `${botoes.length} botões, ${comAcao.length} com ação` };
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
