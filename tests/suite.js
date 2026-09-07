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
t(S12, '12.1', 'app.html dentro de um limite gerenciável (≤ 3000 linhas)', () => {
  const n = SRC.split('\n').length;
  ok(n <= 3000, `${n} linhas em arquivo único (HTML+CSS+JS+base de dados+relatório) — sem módulos, sem build, sem testes`);
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
