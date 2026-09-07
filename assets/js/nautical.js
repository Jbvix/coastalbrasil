/*
 * Coastal Navigator Brasil — algoritmos náuticos
 * Autor: Jossian Brito (Charlie Bravo)
 *
 * Distância ortodrômica, rumo verdadeiro, alcance de faróis, erro lateral de
 * derrota (XTE), consumo por tempo decorrido, formatação náutica e escape de
 * saída. Depende de `lighthouses` (assets/js/lighthouses.js), carregado antes.
 *
 * Estas funções são o alvo do banco de provas: `npm test` as extrai deste
 * arquivo e as executa fora do navegador, sem DOM. Toda mudança aqui precisa
 * passar pelas suítes 1, 2, 4, 5, 7 e 9.
 */

let _coastline = null;

/*
Faróis que NÃO integram a linha de costa.

A poligonal costeira é montada ligando os faróis em ordem de latitude. Um
farol em ilha afastada puxa a linha para o mar aberto e faz a poligonal
zigzaguear: o app passa a "achar" costa onde só há água, e subestima a
distância do navegante ao litoral.

Além das oceânicas, entram aqui as ilhas costeiras afastadas: Alcatrazes
(~20 NM de São Sebastião), Laje de Santos (~20 NM de Santos), Queimada
Grande (~18 NM de Itanhaém) e Arvoredo (~6 NM da costa catarinense).

LIMITE CONHECIDO: derivar o litoral de 90 pontos é aproximação grosseira. A
corda entre dois faróis distantes corta reentrâncias — medido a 10 NM ao
largo do Mucuripe, o resultado é ~8,6 NM, cerca de 15% a menos. Serve para
ordem de grandeza no popup da embarcação, não para decisão de aproximação.
*/
const FORA_DA_LINHA_DE_COSTA = [
  // Oceânicas
  'fernando-de-noronha', 'rocas', 'sao-pedro-e-sao-paulo', 'martin-vaz', 'trindade', 'abrolhos',
  // Ilhas costeiras afastadas
  'alcatrazes', 'laje-de-santos', 'queimada-grande', 'arvoredo'
];

/*
ALGORITMO: Alcance Geográfico (horizonte visível)

FÓRMULA: d = 2,08 × (√h₁ + √h₂)
  d  = alcance geográfico em milhas náuticas
  h₁ = ALTITUDE do foco do farol acima do nível médio do mar, em metros
  h₂ = altura do olho do observador acima da linha d'água, em metros
  2,08 = constante que já incorpora a refração atmosférica padrão

COMPORTAMENTO SEGUNDO AS VARIÁVEIS:
- A relação é de raiz quadrada, não linear: dobrar a altitude do farol
  aumenta o alcance em apenas ~41%.
- Altitude 87 m (Farol de Natal) com olho a 5 m  -> 24,1 NM
- A mesma altitude com olho a 20 m (passadiço de navio) -> 28,7 NM
- Altitude 0 m devolve 4,65 NM, que é o horizonte do próprio observador.

A altura do olho deixou de ser constante: um passadiço de rebocador ASD fica
entre 5 e 7 m, o de um navio-tanque passa de 20 m e uma lancha fica em 2 m.
O valor vem de tripData.eyeHeight; 5 m é o padrão quando não informado.
*/
const DEFAULT_EYE_HEIGHT_M = 5;

/*
ALGORITMO: HAVERSINE - Cálculo de Distância Ortodrômica

Fórmula que calcula distância entre dois pontos na esfera terrestre.

VARIÁVEIS:
- lat1, lng1: Coordenadas do primeiro ponto (graus)
- lat2, lng2: Coordenadas do segundo ponto (graus)
- R: Raio da Terra em milhas náuticas (3440.065 NM)

COMPORTAMENTO:
1. Converte graus para radianos
2. Calcula diferenças de latitude e longitude
3. Aplica fórmula haversine: a = sin²(Δlat/2) + cos(lat1) × cos(lat2) × sin²(Δlng/2)
4. Calcula distância angular: c = 2 × atan2(√a, √(1−a))
5. Converte para distância linear: d = R × c

COMPLEXIDADE: O(1) - tempo constante
PRECISÃO: ±0.5% para distâncias < 1000 NM
*/
function calculateDistance(lat1, lng1, lat2, lng2) {
  const R = 3440.065; // Raio da Terra em milhas náuticas
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;

  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;

  return distance;
}

/*
ALGORITMO: Rumo Verdadeiro (Forward Azimuth)

Calcula o rumo inicial (em graus, 0-360 a partir do Norte verdadeiro)
do ponto 1 para o ponto 2.

FÓRMULA: θ = atan2( sinΔλ·cosφ2 , cosφ1·sinφ2 − sinφ1·cosφ2·cosΔλ )

USO: COG (fallback quando o GPS não fornece heading), rumo para o
próximo waypoint e marcação para faróis.
*/
function calculateBearing(lat1, lng1, lat2, lng2) {
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δλ = (lng2 - lng1) * Math.PI / 180;

  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) -
    Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);

  const θ = Math.atan2(y, x);
  return (θ * 180 / Math.PI + 360) % 360; // Normaliza 0-360
}

function eyeHeight() {
  const h = tripData && Number(tripData.eyeHeight);
  return (isFinite(h) && h > 0) ? h : DEFAULT_EYE_HEIGHT_M;
}

function calculateVisibility(altitudeM, observerHeightM) {
  const h1 = Number(altitudeM);
  const h2 = (observerHeightM != null) ? Number(observerHeightM) : eyeHeight();
  if (!isFinite(h1) || h1 < 0) return 0;
  return 2.08 * (Math.sqrt(h1) + Math.sqrt(h2));
}

/*
ALCANCE EFETIVO DE UM FAROL

Um farol deixa de ser avistado pelo que vier primeiro: a luz ficar fraca
demais (alcance luminoso) ou a curvatura da Terra esconder o foco (alcance
geográfico). O efetivo é o MENOR dos dois.

Antes desta revisão o planejamento usava só o alcance geográfico e a
navegação usava o mínimo — o mesmo farol podia constar "visível" no plano
de derrota e nunca disparar alerta durante a viagem.
*/
function effectiveRange(lh) {
  const geo = calculateVisibility(lh.altitude);
  const lum = Number(lh.rangeLum);
  return (isFinite(lum) && lum > 0) ? Math.min(lum, geo) : geo;
}

/*
ALGORITMO: Busca de Farol Mais Próximo

Encontra o farol mais próximo de uma posição dada.

MÉTODO: Busca linear
COMPLEXIDADE: O(n) onde n = 98 faróis

COMPORTAMENTO:
1. Calcula distância até todos os 98 faróis
2. Encontra o mínimo
3. Retorna farol e distância
*/
function findNearestLighthouse(lat, lng) {
  let minDistance = Infinity;
  let nearest = null;

  lighthouses.forEach(lh => {
    const dist = calculateDistance(lat, lng, lh.lat, lh.lng);
    if (dist < minDistance) {
      minDistance = dist;
      nearest = lh;
    }
  });

  return {
    lighthouse: nearest,
    distance: minDistance
  };
}

/*
Cross-Track Error (great-circle).
  xte   > 0 = à direita (estibordo) da derrota · < 0 = à esquerda (bombordo)
  along = distância projetada ao longo da perna (along-track)
*/
function crossTrackError(lat, lng, start, end) {
  const R = 3440.065; // NM
  const d13 = calculateDistance(start.lat, start.lng, lat, lng) / R; // angular
  const θ13 = calculateBearing(start.lat, start.lng, lat, lng) * Math.PI / 180;
  const θ12 = calculateBearing(start.lat, start.lng, end.lat, end.lng) * Math.PI / 180;

  const xtAng = Math.asin(Math.sin(d13) * Math.sin(θ13 - θ12));
  let atAng = Math.acos(Math.cos(d13) / Math.cos(xtAng));
  if (isNaN(atAng)) atAng = 0;

  /*
  SINAL DO ALONG-TRACK — defeito corrigido.

  Math.acos() devolve apenas 0..π, então a projeção ao longo da perna saía
  SEMPRE positiva. Um barco 5 NM a RÉ do waypoint de partida marcava
  +5,00 NM em vez de −5,00: contava como progresso o que ainda faltava
  percorrer. O percentual de rota cumprida e a distância restante saíam
  otimistas, e advanceActiveLeg() podia pular uma perna cedo demais.

  A componente ao longo da derrota é positiva enquanto a diferença angular
  entre o rumo até o barco (θ13) e o rumo da perna (θ12) estiver dentro de
  ±90°. Fora disso o barco está atrás do início e o sinal se inverte.
  */
  const difRumo = ((θ13 - θ12) * 180 / Math.PI + 540) % 360 - 180; // -180..180
  const sentido = Math.abs(difRumo) <= 90 ? 1 : -1;

  return { xte: xtAng * R, along: sentido * atAng * R };
}

/* Desloca um ponto por dNM milhas náuticas num dado rumo (aprox. plana). */
function offsetLatLng(lat, lng, brg, dNM) {
  const rad = brg * Math.PI / 180;
  const dLat = (dNM / 60) * Math.cos(rad);
  const dLng = (dNM / 60) * Math.sin(rad) / Math.cos(lat * Math.PI / 180);
  return { lat: lat + dLat, lng: lng + dLng };
}

function fmtDuration(hours) {
  const totalMin = Math.round(hours * 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h}h${m.toString().padStart(2, '0')}m` : `${m}m`;
}

/* Formata a data/hora de chegada (ETA): "27/06 16:30". */
function fmtEtaDateTime(d) {
  const data = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return `${data} ${hora}`;
}

/* Formata coordenada em graus e minutos decimais (padrão náutico): 03°43.6'S. */
function fmtCoord(value, type) {
  /*
  DEFEITOS CORRIGIDOS:
  1. Os minutos eram arredondados DEPOIS de o grau ser fixado, então
     −3,99934° saía como "3°60.0'S" — sessenta minutos não existem. O
     arredondamento agora acontece primeiro e transborda para o grau.
  2. O grau não recebia zero à esquerda, divergindo do exemplo do próprio
     comentário. Latitude usa 2 dígitos, longitude usa 3, como na carta.
  */
  const hemi = type === 'lat' ? (value >= 0 ? 'N' : 'S') : (value >= 0 ? 'E' : 'W');
  const abs = Math.abs(value);
  let deg = Math.floor(abs);
  let min = Math.round((abs - deg) * 600) / 10;   // décimo de minuto
  if (min >= 60) { min -= 60; deg += 1; }
  const largura = type === 'lat' ? 2 : 3;
  return `${String(deg).padStart(largura, '0')}°` +
         `${min.toFixed(1).padStart(4, '0')}'${hemi}`;
}

/*
Combustível JÁ consumido quando a viagem começou antes de "agora"
(partida em data/hora anterior ou viagem já em andamento).
= (agora − partida) horas × consumo L/h, limitado ao tanque.
Para partidas no futuro (planejamento normal) retorna 0.
*/
function elapsedFuel(td, nowMs) {
  if (!td || !td.departureDate) return 0;
  const horas = Math.max(0, (nowMs - td.departureDate.getTime()) / 3600000);
  return Math.min(horas * td.fuelConsumption, td.fuelInitial);
}

function getCoastline() {
  if (!_coastline) {
    _coastline = lighthouses
      .filter(lh => !FORA_DA_LINHA_DE_COSTA.includes(lh.id))
      .map(lh => ({ lat: lh.lat, lng: lh.lng }))
      .sort((a, b) => a.lat - b.lat);
  }
  return _coastline;
}

function distanceFromCoast(lat, lng) {
  const pts = getCoastline();
  const cosL = Math.cos(lat * Math.PI / 180);
  const xy = (la, ln) => ({ x: (ln - lng) * 60 * cosL, y: (la - lat) * 60 }); // NM rel. ao ponto
  const segDist = (a, b) => {
    const dx = b.x - a.x, dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    let t = len2 ? -(a.x * dx + a.y * dy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    const px = a.x + t * dx, py = a.y + t * dy;
    return Math.sqrt(px * px + py * py);
  };
  let min = Infinity;
  for (let i = 1; i < pts.length; i++) {
    min = Math.min(min, segDist(xy(pts[i - 1].lat, pts[i - 1].lng), xy(pts[i].lat, pts[i].lng)));
  }
  return min;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/*
Escapa texto para dentro de um documento XML.

Sem isto, um nome de embarcação corriqueiro no mercado brasileiro — "SMIT &
CIA", "REBOCADORES & SERVIÇOS" — produz XML mal-formado, e o arquivo é
recusado por Navionics, OpenCPN e Garmin sem explicação útil ao usuário.
*/
function escapeXml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

/*
Reduz um texto livre a um nome de arquivo seguro.

O nome da embarcação é digitado pelo usuário e ia direto para o atributo
`download`. Barras, dois-pontos e caracteres de controle não pertencem a um
nome de arquivo e variam de comportamento entre sistemas.
*/
function safeFileName(str, padrao) {
  const limpo = String(str == null ? '' : str)
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\-. ]+/g, '').trim().replace(/\s+/g, '-').slice(0, 60);
  return limpo || padrao;
}
