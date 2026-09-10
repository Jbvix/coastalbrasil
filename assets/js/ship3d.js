/*
════════════════════════════════════════════════════════════════════════════════
  PAINEL DE ATITUDE 3D — Coastal Navigator Brasil
════════════════════════════════════════════════════════════════════════════════
  Versão: 1.1.0  ·  Autor: Jossian Brito (Charlie Bravo)  ·  2026-09-10 18:40 UTC

  MODIFICAÇÕES DESTA VERSÃO (1.1.0 — app v2.6.0)
    + corDaLuz()                lê a cor da LUZ da característica ("Fl R 5s")
    + farolEarthSpec()          descrição pura e testável de um farol no globo:
                                foco, alcance efetivo, cor e rótulo
    + updateCesiumLighthouses() desenha os 98 faróis — coluna até a altitude do
                                foco, luz no topo, círculo do alcance no mar
    + toggleCesiumLighthouses() botão 💡, com a escolha gravada no aparelho
    ~ ensureCesium()            restaura a preferência e desenha os faróis

  Extraído de app.html na v2.3.2, quando o arquivo bateu no teto de 3.500 linhas
  que a prova 12.1 guarda. Mesmo caminho já percorrido por nautical.js, report.js
  e mirror.js: o monólito volta a crescer sozinho se ninguém o repartir.

  O QUE VIVE AQUI
    · SHIP_MODELS       registro da frota 3D (arquivo, proa, calado, crédito)
    · vista de Atitude  three.js — jogo, caturro e proa dos sensores de bordo
    · modo Earth        Cesium — o mesmo casco navegando a rota sobre o globo
    · faróis no globo   a Lista DH2 em 3D: foco, cor da luz e alcance efetivo

  DEPENDE DE (globais declaradas em app.html, resolvidas só em tempo de chamada):
    watchMode · navLastFix · shipAttitude · mirrorAttitude · mirrorPos
    waypoints · tripData · calculateDistance

  Os GLB chegam ANCORADOS na linha d'água pela tools/glb/reancorar.mjs. Ver a
  nota em carregarShipModel() antes de mexer em posicionamento — foi ali que
  nasceu o rebocador que afundava no zoom out.
*/

// ═══════════════════════════════════════════════════════════════════════
// PAINEL DE ATITUDE 3D (three.js + sensores do dispositivo)
// ═══════════════════════════════════════════════════════════════════════
/*
Mostra um rebocador 3D que inclina conforme os sensores do celular a bordo
(jogo/caturro) e gira pela proa do GPS. O observador em terra vê a mesma
atitude (recebida na telemetria). three.js + modelo carregados sob demanda.
*/
let s3dInited = false, s3dOpen = false, s3dRaf = null;
let s3dTHREE = null, s3dScene, s3dCamera, s3dRenderer, s3dControls, s3dShip = null;
let s3dLoader = null, s3dWater = null;      // carregador GLTF e plano d'água reaproveitados na troca de casco
let s3dRoll = 0, s3dPitch = 0, s3dHead = 0;        // valores suavizados (graus)
let s3dRawRoll = 0, s3dRawPitch = 0;               // último cru dos sensores
let s3dOffRoll = 0, s3dOffPitch = 0;               // calibração (nivelar)
let s3dMaxRoll = 0, s3dFrame = 0;
let s3dOrientHandler = null;
let ship3dMode = 'attitude';                 // 'attitude' (three.js) ou 'earth' (Cesium)
let mirrorPos = null;                         // última posição recebida (observador)
let cesiumViewer = null, cesiumShip = null;   // estado do modo Earth
let cesiumRouteEntities = [];                 // entidades da rota no globo
let cesiumRouteN = -1;                        // nº de waypoints já desenhados
const CESIUM_CDN = 'https://cdn.jsdelivr.net/npm/cesium@1.115.0/Build/Cesium/';
/* Correção de proa: cada GLB foi modelado com a proa para um lado diferente,
   e cada motor 3D tem a sua convenção de "frente". O Cesium supõe a proa em
   +X; o Rastar 3200 tem a proa em +Z (daí -90°) e o ASD 2810 em -Z, que é o
   oposto — daí +90°. Os valores vivem em SHIP_MODELS.headingOffsetEarth. */

async function openShip3D() {
  document.getElementById('ship3dModal').classList.add('active');
  document.getElementById('ship3dVessel').textContent =
    watchMode ? 'embarcação (espelho)' : (tripData ? tripData.vesselName : 'embarcação');
  s3dOpen = true;
  try {
    if (ship3dMode === 'earth') { await setShip3DMode('earth'); }
    else { await ensureShip3D(); if (!watchMode) await startShip3DSensors(); else setShip3DStatus('Acompanhando a atitude transmitida pela embarcação…'); }
    if (!s3dRaf) s3dLoop();
  } catch (e) {
    setShip3DStatus('⚠️ Falha ao iniciar o 3D: ' + ((e && e.message) || e));
  }
}

function closeShip3D() {
  s3dOpen = false;
  if (s3dRaf) { cancelAnimationFrame(s3dRaf); s3dRaf = null; }
  stopShip3DSensors();
  if (cesiumViewer) cesiumViewer.useDefaultRenderLoop = false;   // pausa o globo
  if (!watchMode) shipAttitude = null;   // para de transmitir atitude
  document.getElementById('ship3dModal').classList.remove('active');
}

/* Alterna entre a vista de Atitude (three.js) e o globo Earth (Cesium). */
async function setShip3DMode(mode) {
  ship3dMode = mode;
  const ov = document.getElementById('ship3dModal');
  ov.classList.toggle('earth', mode === 'earth');
  document.getElementById('s3dModeAtt').classList.toggle('active', mode === 'attitude');
  document.getElementById('s3dModeEarth').classList.toggle('active', mode === 'earth');
  if (mode === 'earth') {
    try {
      await ensureShip3D();                 // garante three p/ a vista de atitude continuar leve
      await ensureCesium();
      updateCesiumRoute();
      if (cesiumViewer) cesiumViewer.useDefaultRenderLoop = true;
    } catch (e) { setShip3DStatus('⚠️ Earth: ' + ((e && e.message) || e)); }
  } else {
    if (cesiumViewer) cesiumViewer.useDefaultRenderLoop = false;
    await ensureShip3D();
    if (!watchMode) await startShip3DSensors();
    onShip3DResize();
    setShip3DStatus(watchMode ? 'Acompanhando a atitude da embarcação…' : 'Sensores ativos — toque 🎚️ para nivelar.');
  }
}

// ─── Carregadores dinâmicos (script/css) ───
function loadScript(src) {
  return new Promise((res, rej) => {
    if (document.querySelector('script[data-dyn="' + src + '"]')) return res();
    const s = document.createElement('script'); s.src = src; s.async = true;
    s.dataset.dyn = src; s.onload = res; s.onerror = () => rej(new Error('falha ao carregar ' + src));
    document.head.appendChild(s);
  });
}
function loadCss(href) {
  return new Promise((res) => {
    if (document.querySelector('link[data-dyn="' + href + '"]')) return res();
    const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = href;
    l.dataset.dyn = href; l.onload = res; l.onerror = res; document.head.appendChild(l);
  });
}

// ─── Modo Earth (Cesium + Google Photorealistic 3D Tiles) ───
async function ensureCesium() {
  if (cesiumViewer) { return; }
  const token = window.CESIUM_ION_TOKEN;
  if (!token) { setShip3DStatus('🌍 Configure a variável CESIUM_ION_TOKEN no Netlify para habilitar o modo Earth.'); return; }
  setShip3DStatus('Carregando globo 3D (Cesium)…');
  window.CESIUM_BASE_URL = CESIUM_CDN;
  await loadCss(CESIUM_CDN + 'Widgets/widgets.css');
  await loadScript(CESIUM_CDN + 'Cesium.js');
  const Cesium = window.Cesium;
  Cesium.Ion.defaultAccessToken = token;

  cesiumViewer = new Cesium.Viewer('cesiumContainer', {
    animation: false, timeline: false, baseLayerPicker: false, geocoder: false,
    homeButton: false, sceneModePicker: false, navigationHelpButton: false,
    fullscreenButton: false, infoBox: false, selectionIndicator: false
  });
  cesiumViewer.scene.skyAtmosphere.show = true;

  /*
  FAROL DE CÂMERA. O Cesium ilumina pela posição REAL do Sol na hora do
  relógio da cena: abrir o modo Earth às 23h no litoral brasileiro põe o
  rebocador do lado escuro da Terra, e ele aparece chapado, sem relevo —
  o relato de bordo, "parecem sem iluminação". Um farol presoà câmera
  ilumina sempre o que se olha, a qualquer hora. Não falseia navegação: o
  painel é de atitude, não de azimute solar.
  */
  try {
    const farol = new Cesium.DirectionalLight({
      direction: Cesium.Cartesian3.clone(cesiumViewer.scene.camera.directionWC),
      intensity: 2.0
    });
    cesiumViewer.scene.light = farol;
    cesiumViewer.scene.preRender.addEventListener(() => {
      Cesium.Cartesian3.clone(cesiumViewer.scene.camera.directionWC, farol.direction);
    });
  } catch (e) { console.warn('farol de câmera indisponível, mantendo o Sol:', e && e.message); }

  // Google Photorealistic 3D Tiles (via ion). Tenta o helper e, em fallback,
  // carrega o asset 2275207 diretamente por ID. Se nada funcionar, mantém o globo padrão.
  try {
    let tileset;
    try {
      tileset = await Cesium.createGooglePhotorealistic3DTileset();
    } catch (e1) {
      console.warn('helper indisponível, carregando asset 2275207 por ID:', e1 && e1.message);
      tileset = await Cesium.Cesium3DTileset.fromIonAssetId(2275207);
    }
    cesiumViewer.scene.primitives.add(tileset);
    cesiumViewer.scene.globe.show = false;
  } catch (e) { console.warn('Photorealistic 3D Tiles indisponível, usando globo padrão:', e && e.message); }

  // Rebocador como entidade móvel
  cesiumShip = cesiumViewer.entities.add({
    position: new Cesium.CallbackProperty(() => cesiumShipPosition(), false),
    orientation: new Cesium.CallbackProperty(() => cesiumShipOrientation(), false),
    model: { uri: shipModelAtual().arquivo, minimumPixelSize: 80, maximumScale: 400 }
  });
  cesiumViewer.trackedEntity = cesiumShip;
  cesiumRouteN = -1; updateCesiumRoute();   // desenha os segmentos de waypoint
  try { cesiumFaroisVisiveis = localStorage.getItem('cnb_farois_earth') !== '0'; } catch (e) { }
  updateCesiumLighthouses();                // e os faróis da Lista DH2
  const b = document.getElementById('s3dFaroisBtn');
  if (b) b.classList.toggle('off', !cesiumFaroisVisiveis);
  setShip3DStatus(`🌍 Modo Earth ativo — rebocador navegando entre ${lighthouses.length} faróis.`);
}

function shipEarthState() {
  let lon, lat, heading, pitch, roll;
  if (watchMode) {
    if (mirrorPos) { lon = mirrorPos.lng; lat = mirrorPos.lat; }
    const a = mirrorAttitude || {}; heading = a.heading || 0; pitch = a.pitch || 0; roll = a.roll || 0;
  } else {
    if (navLastFix) { lon = navLastFix.lng; lat = navLastFix.lat; }
    const a = shipAttitude || {};
    heading = (navLastFix && navLastFix.cog != null) ? navLastFix.cog : (a.heading || 0);
    pitch = a.pitch || 0; roll = a.roll || 0;
  }
  if (lon == null) { lon = -38.50; lat = -13.00; }   // padrão: Baía de Todos os Santos
  return { lon, lat, heading, pitch, roll };
}
function cesiumShipPosition() {
  const Cesium = window.Cesium; const s = shipEarthState();
  return Cesium.Cartesian3.fromDegrees(s.lon, s.lat, 0);
}
function cesiumShipOrientation() {
  const Cesium = window.Cesium; const s = shipEarthState();
  const pos = Cesium.Cartesian3.fromDegrees(s.lon, s.lat, 0);
  const hpr = new Cesium.HeadingPitchRoll(
    Cesium.Math.toRadians(s.heading + (shipModelAtual().headingOffsetEarth || 0)),
    Cesium.Math.toRadians(s.pitch), Cesium.Math.toRadians(s.roll));
  return Cesium.Transforms.headingPitchRollQuaternion(pos, hpr);
}

// ─── Rota (segmentos de waypoint) no globo Cesium ───
function getRouteForCesium() {
  if (watchMode) return (mirrorWaypoints || []).map(w => ({ name: w.n, lat: w.lat, lng: w.lng }));
  return waypoints.map(w => ({ name: w.name, lat: w.lat, lng: w.lng }));
}
/*
════════════════════════════════════════════════════════════════════════════════
  FARÓIS NO GLOBO — o que se desenha e por quê                        (v2.6.0)
════════════════════════════════════════════════════════════════════════════════
  Um farol num globo 3D não é enfeite. O que interessa a quem navega são três
  coisas, e cada uma vira um elemento:

    1. ONDE ESTÁ            um ponto na posição exata da DHN;
    2. QUÃO ALTO É O FOCO   uma coluna do terreno até a ALTITUDE DO FOCO — que é
                            a altura da LUZ, não a da torre, e é ela que manda no
                            alcance geográfico pela fórmula 2,08·(√h₁ + √h₂);
    3. ATÉ ONDE SE VÊ       um círculo no mar com o raio do alcance efetivo, que
                            é o MENOR entre o luminoso e o geográfico. Um farol
                            de 39 NM de alcance luminoso mas 22 de geográfico
                            some no horizonte antes de a luz enfraquecer.

  A COR É A COR DA LUZ. Vem da característica ("Fl W 10s" -> branco, "Fl R 5s"
  -> vermelho). Não é decoração: é o que o vigia vê na ponte.

  CLUTTER. São 98 faróis. Rótulo e círculo de alcance em todos, o tempo todo,
  tornariam o globo ilegível — por isso ambos usam distância de exibição: o
  rótulo aparece de perto, o círculo de média distância, e a coluna sempre.
*/

/* Cor da luz a partir da característica da Lista de Faróis. */
function corDaLuz(caracteristica) {
  const c = String(caracteristica || '');
  // A letra da cor vem isolada entre espaços: "Fl W 10s", "Oc(2) R 6s".
  if (/\bR\b/.test(c)) return { css: '#FF5252', nome: 'vermelha' };
  if (/\bG\b/.test(c)) return { css: '#4CAF50', nome: 'verde' };
  if (/\bY\b/.test(c)) return { css: '#FFD54F', nome: 'amarela' };
  return { css: '#FFFDE7', nome: 'branca' };   // W, ou não declarada
}

/*
Descrição pura de como um farol aparece no globo. Separada de propósito: o
navegador desta bancada não alcança o Cesium ion, então a lógica que decide
altura, alcance, cor e rótulo é testada fora dele, e o que sobra para o Cesium
é só transcrever números.
*/
function farolEarthSpec(lh) {
  const alcanceNM = effectiveRange(lh);
  const cor = corDaLuz(lh.character);
  return {
    id: lh.id,
    nome: lh.name,
    lat: lh.lat,
    lng: lh.lng,
    // Altitude do foco em metros: é a altura da LUZ acima do nível do mar.
    focoM: Math.max(1, Number(lh.altitude) || 1),
    alcanceNM,
    alcanceM: alcanceNM * 1852,
    cor: cor.css,
    corNome: cor.nome,
    // O rótulo diz o que a carta diria: nome, característica e alcance efetivo.
    rotulo: `${lh.name}\n${lh.character || '—'} · ${alcanceNM.toFixed(0)} NM`
  };
}

let cesiumFarolEntities = [];
let cesiumFaroisVisiveis = true;

/* Desenha (ou remove) os faróis no globo. */
function updateCesiumLighthouses() {
  if (!cesiumViewer) return;
  const Cesium = window.Cesium;
  cesiumFarolEntities.forEach(e => cesiumViewer.entities.remove(e));
  cesiumFarolEntities = [];
  if (!cesiumFaroisVisiveis) return;

  for (const lh of lighthouses) {
    const f = farolEarthSpec(lh);
    const cor = Cesium.Color.fromCssColorString(f.cor);

    // Coluna do terreno até o foco: mostra a altura que gera o alcance.
    cesiumFarolEntities.push(cesiumViewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(f.lng, f.lat, f.focoM / 2),
      cylinder: {
        length: f.focoM, topRadius: 6, bottomRadius: 14,
        material: cor.withAlpha(0.55),
        outline: true, outlineColor: Cesium.Color.BLACK.withAlpha(0.4)
      }
    }));

    // A luz, no topo da coluna.
    cesiumFarolEntities.push(cesiumViewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(f.lng, f.lat, f.focoM),
      point: { pixelSize: 10, color: cor, outlineColor: Cesium.Color.BLACK.withAlpha(0.6), outlineWidth: 2,
               disableDepthTestDistance: Number.POSITIVE_INFINITY },
      label: {
        text: f.rotulo, font: '11px sans-serif', fillColor: Cesium.Color.WHITE,
        showBackground: true, backgroundColor: Cesium.Color.fromCssColorString('rgba(10,25,41,0.78)'),
        pixelOffset: new Cesium.Cartesian2(0, -20), scale: 0.92,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        // Rótulo só de perto: 98 nomes ao mesmo tempo tornam o globo ilegível.
        distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 150000)
      }
    }));

    // Círculo de alcance efetivo, rente ao mar.
    cesiumFarolEntities.push(cesiumViewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(f.lng, f.lat, 0),
      ellipse: {
        semiMajorAxis: f.alcanceM, semiMinorAxis: f.alcanceM,
        material: cor.withAlpha(0.06),
        outline: true, outlineColor: cor.withAlpha(0.45), outlineWidth: 1,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 600000)
      }
    }));
  }
}

/* Liga e desliga os faróis do globo, guardando a escolha no aparelho. */
function toggleCesiumLighthouses() {
  cesiumFaroisVisiveis = !cesiumFaroisVisiveis;
  try { localStorage.setItem('cnb_farois_earth', cesiumFaroisVisiveis ? '1' : '0'); } catch (e) { }
  const b = document.getElementById('s3dFaroisBtn');
  if (b) {
    b.classList.toggle('off', !cesiumFaroisVisiveis);
    b.title = cesiumFaroisVisiveis ? 'Faróis no globo — tocar para ocultar'
                                   : 'Faróis OCULTOS no globo — tocar para mostrar';
  }
  updateCesiumLighthouses();
  setShip3DStatus(cesiumFaroisVisiveis
    ? `🌍 ${lighthouses.length} faróis no globo — coluna na altitude do foco, círculo no alcance efetivo.`
    : '🌍 Faróis ocultos.');
}

function updateCesiumRoute() {
  if (!cesiumViewer) return;
  const Cesium = window.Cesium;
  const pts = getRouteForCesium().filter(p => p.lat != null && p.lng != null);
  if (pts.length === cesiumRouteN) return;   // nada mudou
  cesiumRouteN = pts.length;
  cesiumRouteEntities.forEach(e => cesiumViewer.entities.remove(e));
  cesiumRouteEntities = [];
  if (pts.length < 1) return;
  if (pts.length >= 2) {
    const line = cesiumViewer.entities.add({
      polyline: {
        positions: Cesium.Cartesian3.fromDegreesArray([].concat(...pts.map(p => [p.lng, p.lat]))),
        width: 4, clampToGround: true,
        material: new Cesium.PolylineOutlineMaterialProperty({
          color: Cesium.Color.fromCssColorString('#FFA726'),
          outlineColor: Cesium.Color.fromCssColorString('#5D2E00'), outlineWidth: 1
        })
      }
    });
    cesiumRouteEntities.push(line);
  }
  pts.forEach((p, i) => {
    const e = cesiumViewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(p.lng, p.lat, 0),
      point: { pixelSize: 9, color: Cesium.Color.fromCssColorString('#1976D2'), outlineColor: Cesium.Color.WHITE, outlineWidth: 2, heightReference: Cesium.HeightReference.CLAMP_TO_GROUND },
      label: {
        text: p.name || ('WP' + (i + 1)), font: '12px sans-serif', fillColor: Cesium.Color.WHITE,
        showBackground: true, backgroundColor: Cesium.Color.fromCssColorString('rgba(10,25,41,0.7)'),
        pixelOffset: new Cesium.Cartesian2(0, -16), scale: 0.9, disableDepthTestDistance: Number.POSITIVE_INFINITY
      }
    });
    cesiumRouteEntities.push(e);
  });
}

function setShip3DStatus(t) { const el = document.getElementById('ship3dStatus'); if (el) el.textContent = t; }

/*
───────────────────────────────────────────────────────────────────────────
FROTA 3D — registro dos cascos disponíveis                    (v2.3.0)
───────────────────────────────────────────────────────────────────────────
Cada rebocador é um GLB próprio. O registro guarda, além do arquivo, os
três números que só se descobrem OLHANDO o modelo — e que, se errados,
põem o navio de ré ou afundado:

  proaEixo   Para que lado do modelo aponta a PROA, em coordenadas do
             próprio arquivo. O laço de animação faz rotation.y = -rumo,
             e essa convenção só fecha se a proa estiver em -Z. Um casco
             modelado com a proa em +Z navegaria de ré a 000°.
             Aqui é só documentação; quem corrige é headingOffset.

  headingOffset      Graus de giro aplicados AO MODELO, na vista de
             Atitude (three.js), para trazer a sua proa até -Z. NÃO é um
             somatório no rumo: um somatório corrigiria a guinada e
             deixaria caturro e jogo invertidos, porque a rotação em Y é
             a mais externa das três e preserva a altura. Ver o cálculo em
             carregarShipModel().
  headingOffsetEarth Graus somados ao rumo NO GLOBO (Cesium). Aqui é
             somatório mesmo: o Cesium carrega o GLB por conta própria e
             supõe a proa em +X, então não há pivô onde interferir.

  calado     Calado em METROS, medido do ponto mais baixo do modelo até a
             linha d'água. Desde a v2.3.2 é DOCUMENTAÇÃO, não parâmetro de
             desenho: o GLB já chega ancorado com a origem na linha d'água
             (tools/glb/reancorar.mjs), e a água fica em y=0 nos dois
             motores. O valor fica aqui porque é o número que se passa ao
             reancorar o casco — mude-o e é preciso reancorar de novo, não
             basta recarregar a página.

             Cuidado ao medir: no ASD 2810 o ponto mais baixo é a ponta do
             SKEG (y=-10,31, meia-boca 0,13 m — uma lâmina), não a quilha,
             que só começa em y=-8,50. Medir "do fundo" sem notar isso foi o
             que deixou o rebocador afundado na vista de Atitude.
*/
const SHIP_MODELS = [
  {
    id: 'asd2810',
    nome: 'ASD 2810 “Aguia”',
    classe: 'ASD — Azimuth Stern Drive',
    arquivo: 'assets/models/tug-asd2810.glb',
    loa: 28.6, boca: 10.2, calado: 4.80,
    proaEixo: '-Z', headingOffset: 0, headingOffsetEarth: 90,
    credito: 'Modelo ASD 2810 — texturas PBR 4K remontadas, identidade “AGUIA/BRASIL” e conversão FBX→glTF por Jossian Brito'
  },
  {
    /*
    Mesmo casco do ASD 2810, outra libré: azul e amarelo, no padrão da frota
    SAAM. Entra como terceiro casco em vez de substituir o vermelho — um
    simulador que mostra duas librés reais de rebocador brasileiro vale mais
    que um que mostra uma. Geometria idêntica, então proa, calado e âncora
    repetem os valores do irmão vermelho.
    */
    id: 'asd2810saam',
    nome: 'ASD 2810 “SAAM Aguia”',
    classe: 'ASD — Azimuth Stern Drive',
    arquivo: 'assets/models/tug-asd2810-saam.glb',
    loa: 28.6, boca: 10.2, calado: 4.80,
    proaEixo: '-Z', headingOffset: 0, headingOffsetEarth: 90,
    credito: 'Modelo ASD 2810 — libré azul e amarelo, identidade “SAAM AGUIA / RIO DE JANEIRO” e texturas PBR remontadas por Jossian Brito'
  },
  {
    id: 'rastar3200',
    nome: 'Rastar 3200',
    classe: 'Rebocador portuário convencional',
    arquivo: 'assets/models/tug.glb',
    loa: 32.9, boca: 13.5, calado: 4.62,
    proaEixo: '+Z', headingOffset: 180, headingOffsetEarth: -90,
    credito: 'Modelo: “Rastar 3200 tugboat” por David Broutian — CC-BY-4.0'
  }
];
const SHIP_MODEL_PADRAO = 'asd2810';
const SHIP_MODEL_CHAVE = 'cnb_modelo3d';

/* Devolve o registro do casco escolhido, caindo no padrão se a preferência
   salva apontar para um modelo que não existe mais. */
function shipModelAtual() {
  let id = SHIP_MODEL_PADRAO;
  try { id = localStorage.getItem(SHIP_MODEL_CHAVE) || SHIP_MODEL_PADRAO; } catch (e) { }
  return SHIP_MODELS.find(m => m.id === id) || SHIP_MODELS[0];
}

/* Preenche o seletor do cabeçalho e marca o casco em uso. */
function popularSeletorModelo() {
  const sel = document.getElementById('ship3dModelSel');
  if (!sel || sel.options.length) return;
  SHIP_MODELS.forEach(m => {
    const o = document.createElement('option');
    o.value = m.id; o.textContent = m.nome;
    sel.appendChild(o);
  });
  sel.value = shipModelAtual().id;
}

/* Troca de casco sem recriar a cena: só o modelo é descartado e recarregado.
   A câmera é reenquadrada porque um casco de 28 m e outro de 33 m não cabem
   no mesmo raio de órbita. */
async function trocarShipModel(id) {
  const m = SHIP_MODELS.find(x => x.id === id);
  if (!m) return;
  try { localStorage.setItem(SHIP_MODEL_CHAVE, id); } catch (e) { }
  if (s3dInited) {
    try { await carregarShipModel(m); } catch (e) {
      setShip3DStatus('⚠️ Falha ao carregar o modelo: ' + ((e && e.message) || e));
      return;
    }
  }
  // No globo, o casco é uma entidade do Cesium — refaz a que já está lá.
  if (cesiumShip) {
    cesiumShip.model.uri = m.arquivo;
    cesiumRouteN = -1;
  }
  setShip3DStatus('Casco em uso: ' + m.nome + ' — ' + m.loa.toFixed(1) + ' m × ' + m.boca.toFixed(1) + ' m.');
}

/* Baixa e monta um casco na cena, devolvendo-o já centrado no eixo de giro.
   Descarta a geometria e as texturas do casco anterior — sem isso cada troca
   deixaria dezenas de MB de VRAM presos, e três trocas travariam o celular. */
async function carregarShipModel(m) {
  const THREE = s3dTHREE;
  setShip3DStatus('Carregando ' + m.nome + '…');
  const gltf = await new Promise((res, rej) => s3dLoader.load(m.arquivo, res,
    (e) => { if (e.total) setShip3DStatus('Carregando ' + m.nome + '… ' + Math.round(e.loaded / e.total * 100) + '%'); }, rej));

  if (s3dShip) {
    s3dScene.remove(s3dShip);
    s3dShip.traverse(n => {
      if (n.isMesh) {
        n.geometry.dispose();
        for (const mat of [].concat(n.material)) {
          for (const k of ['map', 'normalMap', 'metalnessMap', 'roughnessMap', 'emissiveMap', 'aoMap']) {
            if (mat[k]) mat[k].dispose();
          }
          mat.dispose();
        }
      }
    });
    s3dShip = null;
  }

  const model = gltf.scene;
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());

  /*
  NADA A RECENTRAR — deliberado. Até a v2.3.1 recentrávamos pelo centro da
  caixa e púnhamos a água em -altura*calado: funcionava na Atitude e
  QUEBRAVA no globo, onde o Cesium assenta a ORIGEM do modelo na altitude 0.
  Pior, o `minimumPixelSize` AMPLIA o modelo ao afastar a câmera e multiplica
  o erro — no ASD 2810 eram 4,96 m de origem fora do lugar, que a 400x viram
  quase 2 km de afundamento: some o casco, sobra o mastro.
  Agora os GLB chegam ancorados com a origem NA LINHA D'ÁGUA e centrados no
  meio-navio (tools/glb/reancorar.mjs). Âncora na geometria vale para todo
  motor e toda escala; um offset no código teria de perseguir a escala do
  Cesium a cada quadro. Recentrar aqui traria o defeito de volta.
  */
  s3dWater.position.y = 0;                    // a superfície é a própria origem

  /*
  NORMALIZAÇÃO DA PROA — num pivô, não somando graus ao rumo. O laço usa
  ordem YXZ: R = Ry(-rumo)·Rx(caturro)·Rz(jogo). O casco é PRIMEIRO
  inclinado no próprio eixo e só depois guinado; somar 180° ao rumo gira o
  conjunto já inclinado em torno da vertical, e rotação em Y PRESERVA a
  altura. Com a proa em +Z: Rx(θ)·(0,0,1) = (0,-sen θ,cos θ) — para caturro
  positivo sai y<0, a proa MERGULHA, e Ry(180°) não toca nesse y. Com a
  proa em -Z dá (0,+sen θ,-cos θ): sobe. Daí girar o CASCO até a proa cair
  em -Z, num pivô próprio, ANTES de jogo/caturro/rumo. O pivô é necessário
  porque a matriz local do three.js é T·R·S: girar o modelo direto o faria
  rodar em torno de um ponto que não é o seu centro.
  */
  const pivoProa = new THREE.Group();
  pivoProa.add(model);
  pivoProa.rotation.y = THREE.MathUtils.degToRad(m.headingOffset || 0);

  s3dShip = new THREE.Group(); s3dShip.rotation.order = 'YXZ'; s3dShip.add(pivoProa); s3dScene.add(s3dShip);

  const maxDim = Math.max(size.x, size.y, size.z);
  // Com a origem na linha d'água, mirar em y=0 deixaria o mastro fora de
  // quadro. Miramos um pouco acima do convés — sem passar de 4 m, para o
  // Rastar (mastro de 18 m) não empurrar o alvo para o céu.
  const alvoY = Math.min(size.y * 0.16, 4);
  s3dControls.minDistance = maxDim * 0.7; s3dControls.maxDistance = maxDim * 4;
  s3dCamera.position.set(maxDim * 0.95, alvoY + maxDim * 0.30, maxDim * 1.35);
  s3dControls.target.set(0, alvoY, 0); s3dControls.update();

  const cred = document.getElementById('ship3dCredit');
  if (cred) cred.textContent = m.credito;
  const sel = document.getElementById('ship3dModelSel');
  if (sel) sel.value = m.id;
}

async function ensureShip3D() {
  if (s3dInited) { onShip3DResize(); return; }
  setShip3DStatus('Carregando biblioteca 3D e modelo…');
  const THREE = await import('three');
  const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
  const { DRACOLoader } = await import('three/addons/loaders/DRACOLoader.js');
  const { OrbitControls } = await import('three/addons/controls/OrbitControls.js');
  s3dTHREE = THREE;
  const canvas = document.getElementById('ship3dCanvas');
  s3dRenderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  s3dRenderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  // O ASD 2810 traz texturas PBR em sRGB; sem estes dois ajustes o casco
  // vermelho sai lavado e o metal do guincho vira um borrão branco.
  s3dRenderer.outputColorSpace = THREE.SRGBColorSpace;
  s3dRenderer.toneMapping = THREE.ACESFilmicToneMapping;
  s3dRenderer.toneMappingExposure = 1.1;
  s3dScene = new THREE.Scene();
  s3dScene.add(new THREE.HemisphereLight(0xcfe8ff, 0x16344d, 1.8));
  const dir = new THREE.DirectionalLight(0xffffff, 2.2); dir.position.set(6, 12, 8); s3dScene.add(dir);
  const fill = new THREE.DirectionalLight(0xffffff, 0.6); fill.position.set(-8, 4, -6); s3dScene.add(fill);
  s3dCamera = new THREE.PerspectiveCamera(45, 1, 0.1, 2000);

  s3dWater = new THREE.Mesh(
    new THREE.CircleGeometry(160, 48),
    new THREE.MeshStandardMaterial({ color: 0x0b3a5c, transparent: true, opacity: 0.55, roughness: 0.95 })
  );
  s3dWater.rotation.x = -Math.PI / 2; s3dScene.add(s3dWater);

  s3dControls = new OrbitControls(s3dCamera, canvas);
  s3dControls.enableDamping = true; s3dControls.enablePan = false;

  const draco = new DRACOLoader();
  draco.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/libs/draco/gltf/');
  s3dLoader = new GLTFLoader(); s3dLoader.setDRACOLoader(draco);

  popularSeletorModelo();
  await carregarShipModel(shipModelAtual());

  s3dInited = true;
  onShip3DResize();
  window.addEventListener('resize', onShip3DResize);
}

function onShip3DResize() {
  if (!s3dRenderer) return;
  const c = document.getElementById('ship3dCanvas');
  const w = c.clientWidth || window.innerWidth;
  const h = c.clientHeight || (window.innerHeight - 170);
  s3dRenderer.setSize(w, h, false);
  s3dCamera.aspect = w / h; s3dCamera.updateProjectionMatrix();
}

// ─── Sensores (lado embarcação) ───
async function startShip3DSensors() {
  try {
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
      const perm = await DeviceOrientationEvent.requestPermission();
      if (perm !== 'granted') { setShip3DStatus('Permissão de sensores negada — exibindo sem atitude.'); return; }
    }
  } catch (e) { }
  if (typeof DeviceOrientationEvent === 'undefined') { setShip3DStatus('Dispositivo sem sensor de orientação.'); return; }
  s3dOrientHandler = (ev) => {
    if (ev.beta == null && ev.gamma == null) return;
    const a = (screen.orientation && screen.orientation.angle) || window.orientation || 0;
    const beta = ev.beta || 0, gamma = ev.gamma || 0;
    let roll, pitch;
    if (a === 90) { roll = beta; pitch = -gamma; }
    else if (a === 270 || a === -90) { roll = -beta; pitch = gamma; }
    else if (a === 180) { roll = -gamma; pitch = -beta; }
    else { roll = gamma; pitch = beta; }
    s3dRawRoll = roll; s3dRawPitch = pitch;
  };
  window.addEventListener('deviceorientation', s3dOrientHandler, true);
  setShip3DStatus('Sensores ativos — toque 🎚️ para nivelar a referência.');
}
function stopShip3DSensors() {
  if (s3dOrientHandler) { window.removeEventListener('deviceorientation', s3dOrientHandler, true); s3dOrientHandler = null; }
}
function calibrateShip3D() {
  s3dMaxRoll = 0;
  if (watchMode) return;
  s3dOffRoll = s3dRawRoll; s3dOffPitch = s3dRawPitch;
  setShip3DStatus('Referência nivelada ✓');
}

function s3dLoop() {
  s3dRaf = requestAnimationFrame(s3dLoop);
  if (!s3dInited) return;
  let tRoll, tPitch, tHead;
  if (watchMode) {
    const a = mirrorAttitude || {};
    tRoll = a.roll || 0; tPitch = a.pitch || 0; tHead = (a.heading != null ? a.heading : s3dHead);
  } else {
    tRoll = s3dRawRoll - s3dOffRoll;
    tPitch = s3dRawPitch - s3dOffPitch;
    tHead = (navLastFix && navLastFix.cog != null) ? navLastFix.cog : s3dHead;
    shipAttitude = { roll: +tRoll.toFixed(1), pitch: +tPitch.toFixed(1), heading: +(tHead || 0).toFixed(0) };
  }
  const k = 0.15;
  s3dRoll += (tRoll - s3dRoll) * k;
  s3dPitch += (tPitch - s3dPitch) * k;
  const dh = ((tHead - s3dHead + 540) % 360) - 180; s3dHead += dh * k;

  const R = s3dTHREE.MathUtils.degToRad;
  // Sem correção aqui: carregarShipModel() já entregou o casco com a proa
  // em -Z, que é o que esta linha pressupõe para os TRÊS eixos.
  s3dShip.rotation.set(R(s3dPitch), R(-s3dHead), R(s3dRoll));
  s3dMaxRoll = Math.max(s3dMaxRoll, Math.abs(s3dRoll));
  if (ship3dMode === 'attitude') {   // no modo Earth quem renderiza é o Cesium
    if (s3dControls) s3dControls.update();
    s3dRenderer.render(s3dScene, s3dCamera);
  }

  if ((s3dFrame++ % 6) === 0) {
    const rEl = document.getElementById('s3dRoll'), pEl = document.getElementById('s3dPitch');
    rEl.textContent = s3dRoll.toFixed(0) + '°'; rEl.className = Math.abs(s3dRoll) >= 20 ? 'warn' : '';
    pEl.textContent = s3dPitch.toFixed(0) + '°';
    const hasHead = watchMode ? (mirrorAttitude && mirrorAttitude.heading != null) : (navLastFix && navLastFix.cog != null);
    document.getElementById('s3dHead').textContent = hasHead ? Math.round((s3dHead + 360) % 360).toString().padStart(3, '0') + '°' : '--';
    document.getElementById('s3dMax').textContent = s3dMaxRoll.toFixed(0) + '°';
  }
}
