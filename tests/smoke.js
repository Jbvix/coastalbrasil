/*
 * Teste de fumaça em navegador real.
 * Autor: Jossian Brito (Charlie Bravo)
 *
 *   npm i -D playwright && npx playwright install chromium
 *   npm run smoke
 *
 * O banco de provas (npm test) executa as funções fora do navegador, sem DOM.
 * Ele não pega regressão de CARREGAMENTO: ordem de <script>, caminho errado de
 * módulo, hash de SRI inválido, CSS que não chega. Este arquivo abre o app de
 * verdade, percorre o fluxo completo — configurar viagem, criar e apagar
 * waypoints, exportar GPX, gerar relatório — e falha se aparecer um único erro
 * de console.
 *
 * SEM SAÍDA PARA A INTERNET: coloque leaflet.js, leaflet.css e supabase.js em
 * tests/fixtures/ e eles serão servidos no lugar das CDNs. Como são os mesmos
 * bytes de que os hashes SRI foram calculados, o navegador ainda valida a
 * integridade — se um hash estiver errado, o teste acusa.
 */
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');

const ROOT = path.join(__dirname, '..');
const FIXTURES = path.join(__dirname, 'fixtures');
const MIME = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css',
               '.json':'application/json', '.glb':'model/gltf-binary', '.png':'image/png' };

const srv = http.createServer((req, res) => {
  let f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (f.endsWith('/')) f += 'index.html';
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) {
    // cesium-config.js só existe após o build; simula ausência benigna
    if (req.url.startsWith('/cesium-config.js')) {
      res.writeHead(200, {'Content-Type':'text/javascript'});
      return res.end('window.CESIUM_ION_TOKEN="";window.ADMIN_GATE_HASH="";');
    }
    res.writeHead(404); return res.end('404');
  }
  res.writeHead(200, {'Content-Type': MIME[path.extname(f)] || 'application/octet-stream'});
  fs.createReadStream(f).pipe(res);
});

(async () => {
  await new Promise(r => srv.listen(8099, r));
  /* O Chromium pode estar em PLAYWRIGHT_BROWSERS_PATH com revisão diferente
     da que este Playwright espera. Em vez de baixar outro, localiza o que
     existe. CHROMIUM_PATH força um caminho específico. */
  const acharChromium = () => {
    if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
    const base = process.env.PLAYWRIGHT_BROWSERS_PATH;
    if (!base || !fs.existsSync(base)) return undefined;
    const dir = fs.readdirSync(base).filter(d => /^chromium-\d+$/.test(d)).sort().pop();
    if (!dir) return undefined;
    const bin = path.join(base, dir, 'chrome-linux', 'chrome');
    return fs.existsSync(bin) ? bin : undefined;
  };
  const browser = await chromium.launch({
    args: ['--no-sandbox'],
    executablePath: acharChromium()   // undefined = usa o do próprio Playwright
  });
  const ctx = await browser.newContext({ timezoneId: 'America/Sao_Paulo', locale: 'pt-BR' });
  const page = await ctx.newPage();

  /* O navegador desta caixa não tem saída direta para as CDNs. As requisições
     são atendidas com os MESMOS bytes usados para calcular os hashes SRI — se
     o hash estiver errado, o Chromium recusa o arquivo e o teste acusa. */
  const LOCAIS = {
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js':  [path.join(FIXTURES, 'leaflet.js'),  'text/javascript'],
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css': [path.join(FIXTURES, 'leaflet.css'), 'text/css'],
    'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.115.0/dist/umd/supabase.js':
                                                        [path.join(FIXTURES, 'supabase.js'), 'text/javascript'],
  };
  await ctx.route('**/*', route => {
    const u = route.request().url();
    if (LOCAIS[u] && fs.existsSync(LOCAIS[u][0])) {
      const [f, tipo] = LOCAIS[u];
      return route.fulfill({ status: 200, contentType: tipo, body: fs.readFileSync(f) });
    }
    if (LOCAIS[u]) return route.continue();   // sem fixture: busca na CDN
    if (/^https?:\/\/(?!localhost)/.test(u)) return route.abort();   // fontes, tiles, badge
    return route.continue();
  });

  const erros = [], falhas = [];
  const RUIDO = /Failed to load resource|ERR_FAILED|ERR_CONNECTION|net::/;
  page.on('console', m => { if (m.type() === 'error' && !RUIDO.test(m.text())) erros.push(m.text().slice(0, 200)); });
  page.on('pageerror', e => erros.push('PAGEERROR: ' + e.message.slice(0, 200)));
  page.on('requestfailed', r => {
    const u = r.url();
    if (/fonts\.g|visitorbadge|tile\.|tiles\./.test(u)) return;   // abortados de propósito
    falhas.push(u.slice(0, 90) + ' — ' + (r.failure() || {}).errorText);
  });

  const passo = [];
  const ok = (nome, cond, extra) => passo.push({ nome, ok: !!cond, extra: extra || '' });

  await page.goto('http://localhost:8099/app.html', { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(3500);

  // 1. Bibliotecas e módulos carregaram?
  const est = await page.evaluate(() => ({
    leaflet: typeof L !== 'undefined',
    supabase: typeof window.supabase !== 'undefined',
    farois: typeof lighthouses !== 'undefined' ? lighthouses.length : -1,
    nautical: typeof calculateDistance === 'function' && typeof effectiveRange === 'function',
    report: typeof generateReport === 'function',
    mapa: typeof map !== 'undefined' && map !== null,
    css: getComputedStyle(document.body).fontFamily,
  }));
  ok('Leaflet carregado (SRI)', est.leaflet);
  ok('Supabase carregado (SRI)', est.supabase);
  ok('lighthouses.js: 98 faróis', est.farois === 98, est.farois + ' faróis');
  ok('nautical.js: algoritmos', est.nautical);
  ok('report.js: gerador', est.report);
  ok('Mapa Leaflet instanciado', est.mapa);
  ok('app.css aplicado', /Rajdhani|Orbitron/.test(est.css), est.css.slice(0, 40));

  if (!est.leaflet || !est.mapa) {
    console.log('\n══ DIAGNÓSTICO (carregamento falhou) ══');
    passo.forEach(p => console.log(` ${p.ok ? 'OK ' : 'X  '} ${p.nome} ${p.extra}`));
    console.log('\n ERROS:'); erros.slice(0,12).forEach(e => console.log('  · ' + e));
    console.log('\n FALHAS DE REQUISIÇÃO:'); falhas.slice(0,12).forEach(f => console.log('  · ' + f));
    await browser.close(); srv.close(); process.exit(1);
  }

  // 2. Fluxo real: configurar viagem
  await page.click('#configBtn').catch(() => {});
  await page.evaluate(() => openTripModal());
  await page.waitForTimeout(300);
  const dataPadrao = await page.inputValue('#departureDate');
  const horaLocal = await page.evaluate(() => {
    const d = new Date();
    return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  });
  ok('Data de partida em hora local', dataPadrao.slice(11) === horaLocal, dataPadrao + ' vs ' + horaLocal);

  await page.fill('#vesselName', 'RB SMIT & CIA <TESTE>');
  await page.fill('#origin', 'Fortaleza');
  await page.fill('#destination', 'Natal');
  await page.fill('#speedKnots', '10');
  await page.fill('#fuelConsumption', '100');
  await page.fill('#fuelInitial', '50000');
  page.once('dialog', d => d.accept());
  await page.evaluate(() => document.getElementById('tripForm').requestSubmit
    ? document.getElementById('tripForm').requestSubmit()
    : saveTripData(new Event('submit')));
  await page.waitForTimeout(600);
  ok('Viagem configurada', await page.evaluate(() => !!tripData));

  // 3. Criar waypoints e conferir a cadeia de cálculo
  const calc = await page.evaluate(() => {
    createWaypoint(-3.7263, -38.4717, 'Mucuripe');
    createWaypoint(-4.7263, -38.4717, 'Largo');
    createWaypoint(-5.1608, -35.4868, 'Calcanhar');
    const u = waypoints[waypoints.length - 1];
    return { n: waypoints.length, nome: waypoints[0].name,
             total: u.totalDistance, fuel: u.fuelUsed,
             eta: u.eta instanceof Date && !isNaN(u.eta) };
  });
  ok('3 waypoints criados com nome preservado', calc.n === 3 && calc.nome === 'Mucuripe', calc.nome);
  ok('Distância acumulada calculada', calc.total > 100, calc.total.toFixed(1) + ' NM');
  ok('Consumo e ETA coerentes', calc.fuel > 0 && calc.eta, calc.fuel.toFixed(0) + ' L');

  // 4. Apagar o PRIMEIRO waypoint deve rebasear
  const rebase = await page.evaluate(() => {
    deleteWaypoint(waypoints[0].id);
    const p = waypoints[0];
    // A partida foi marcada para "agora"; alguns segundos depois já há consumo
    // decorrido. O rebase reancora NELE, não em zero absoluto.
    return { dist: p.distance, total: p.totalDistance, fuel: p.fuelUsed,
             decorrido: tripData.fuelAlreadyUsed || 0, n: waypoints.length };
  });
  ok('Rebase ao apagar o primeiro waypoint',
     rebase.dist === 0 && rebase.total === 0 &&
     Math.abs(rebase.fuel - rebase.decorrido) < 1e-9 && rebase.n === 2,
     `dist ${rebase.dist} · total ${rebase.total} · fuel ${rebase.fuel.toFixed(2)} = decorrido ${rebase.decorrido.toFixed(2)} L`);

  // 5. GPX: escape de XML e formato <rte>
  const gpx = await page.evaluate(() => {
    let capturado = null;
    const origCreate = URL.createObjectURL;
    URL.createObjectURL = b => { capturado = b; return 'blob:fake'; };
    const origClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {};
    const origAlert = window.alert; window.alert = () => {};
    exportGPX();
    URL.createObjectURL = origCreate;
    HTMLAnchorElement.prototype.click = origClick;
    window.alert = origAlert;
    return capturado ? capturado.text() : null;
  });
  ok('GPX gerado', !!gpx);
  if (gpx) {
    const solto = gpx.replace(/&(amp|lt|gt|quot|apos|#\d+);/g, '').includes('&');
    ok('GPX escapa "&" do nome da embarcação', !solto);
    ok('GPX usa <rte>, não <trk>', gpx.includes('<rte>') && !gpx.includes('<trkseg>'));
    const wellFormed = await page.evaluate(x =>
      !new DOMParser().parseFromString(x, 'text/xml').querySelector('parsererror'), gpx);
    ok('GPX é XML bem-formado', wellFormed);
  }

  // 6. Relatório: escape de HTML
  const rep = await page.evaluate(() => {
    let capturado = null;
    const origCreate = URL.createObjectURL;
    URL.createObjectURL = b => { capturado = b; return 'blob:fake'; };
    const origClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {};
    const origAlert = window.alert; window.alert = () => {};
    generateReport();
    URL.createObjectURL = origCreate;
    HTMLAnchorElement.prototype.click = origClick;
    window.alert = origAlert;
    return capturado ? capturado.text() : null;
  });
  ok('Relatório gerado', !!rep);
  if (rep) ok('Relatório escapa "<" do nome da embarcação',
              rep.includes('&lt;TESTE&gt;') && !rep.includes('CIA <TESTE>'));

  // 6b. Numeração dos marcadores acompanha a posição na rota
  const rotulos = await page.evaluate(() =>
    waypoints.map(wp => {
      const wm = waypointMarkers.find(m => m.id === wp.id);
      const el = wm && wm.marker.getElement();
      return el && el.firstElementChild ? el.firstElementChild.textContent : '?';
    }));
  ok('Marcadores renumerados após remoção',
     rotulos.join(',') === rotulos.map((_, i) => i + 1).join(','), rotulos.join(','));

  // 7. Faróis no mapa e coordenada náutica
  const extra = await page.evaluate(() => ({
    coord: fmtCoord(-3.7263, 'lat'),
    coord60: fmtCoord(-3.99934, 'lat'),
    alcance: effectiveRange(lighthouses.find(l => l.id === 'natal')).toFixed(1),
    marcadores: document.querySelectorAll('.lighthouse-marker, .leaflet-interactive').length
  }));
  ok("fmtCoord no padrão 03°43.6'S", extra.coord === "03°43.6'S", extra.coord);
  ok("fmtCoord sem 60,0'", !extra.coord60.includes("60.0'"), extra.coord60);
  ok('Alcance efetivo de Natal', +extra.alcance > 20 && +extra.alcance < 30, extra.alcance + ' NM');
  ok('Faróis desenhados no mapa', extra.marcadores > 50, extra.marcadores + ' elementos');

  // 8. MODO ESPELHO com o backend inalcançável.
  //    Este ambiente bloqueia saída externa, o que reproduz exatamente o
  //    cenário do projeto Supabase suspenso: o observador em terra abre o
  //    link e nada chega. O banner tem de dizer QUAL é a causa e mostrar que
  //    está tentando de novo — não um "erro de conexão" mudo.
  // A interceptação está no CONTEXTO, então esta aba herda as mesmas fixtures.
  const espelho = await ctx.newPage();
  await espelho.goto('http://localhost:8099/app.html?watch=ab457fdc1428',
                     { waitUntil: 'load', timeout: 30000 });
  /* O ciclo completo leva tempo por construção: ~6 s de limite no diagnóstico
     + ~10 s até o canal declarar TIMED_OUT. Só então a reconexão é agendada e
     a contagem aparece. Esperar menos testaria um estado intermediário. */
  await espelho.waitForFunction(
    () => /nova tentativa em \d+s/.test(
      (document.getElementById('mirrorBannerStatus') || {}).textContent || ''),
    null, { timeout: 45000 }
  ).catch(() => {});
  const esp = await espelho.evaluate(() => ({
    banner: (document.getElementById('mirrorBannerStatus') || {}).textContent || '',
    dica:   (document.getElementById('navGpsStatus') || {}).textContent || '',
    token:  (document.getElementById('mirrorBannerToken') || {}).textContent || '',
    modo:   document.body.classList.contains('mirror-mode')
  }));
  ok('Modo espelho reconhece o token da URL', esp.modo && esp.token.includes('ab457fdc1428'), esp.token);
  ok('Banner nomeia a causa em vez de "erro de conexão"',
     /servidor fora do ar|sem internet|reconectando/.test(esp.banner) && !/^erro de conexão$/.test(esp.banner),
     esp.banner);
  ok('Banner mostra que está tentando de novo', /nova tentativa em \d+s/.test(esp.banner), esp.banner);
  ok('Linha de status orienta o observador', esp.dica.length > 30 && esp.dica !== 'Aguardando GPS…',
     esp.dica.slice(0, 74));
  /* O RELATÓRIO DA IARA CHEGANDO EM TERRA.                           (v2.8.0)
     O banco de provas garante que o texto SAI no pacote e que é aplicado com
     textContent. O que só o navegador diz é se o painel realmente aparece no
     espelho — e se ele NÃO aparece a bordo, onde tomaria o espaço do XTE. */
  const relEsp = await espelho.evaluate(() => {
    const cx = document.getElementById('mirrorRelatorio');
    if (!cx) return { existe: false };
    // Simula a chegada de um relatório pelo canal, com texto hostil de propósito.
    cx.querySelector('.mirror-rel-hora').textContent = '14:00';
    cx.querySelector('.mirror-rel-txt').textContent = '<img src=x onerror=alert(1)> Rumo zero quatro oito.';
    cx.classList.add('active');
    const visivelEspelho = cx.getBoundingClientRect().height > 0;
    const temTag = !!cx.querySelector('img');
    document.body.classList.remove('mirror-mode');
    const visivelBordo = cx.getBoundingClientRect().height > 0;
    document.body.classList.add('mirror-mode');
    return { existe: true, visivelEspelho, visivelBordo, temTag,
             texto: cx.querySelector('.mirror-rel-txt').textContent.slice(0, 24) };
  });
  ok('Relatório da Iara aparece para quem está em terra',
     relEsp.existe && relEsp.visivelEspelho, relEsp.existe ? relEsp.texto : 'painel não existe');
  ok('E NÃO aparece a bordo (espaço é do XTE)', relEsp.existe && !relEsp.visivelBordo,
     relEsp.visivelBordo ? 'apareceria a bordo também' : 'só no espelho');
  ok('Texto do canal não vira marcação', relEsp.existe && !relEsp.temTag,
     relEsp.temTag ? 'a <img> foi interpretada — injeção' : 'escapado');

  /* SENSORES DE MAR NO NAVEGADOR.                                  (v2.12.0)
     O banco de provas mede o espectro contra mar sintetizado. O que só o
     navegador diz é se o `devicemotion` é escutado de verdade e se a linha do
     mar medido existe para receber o resultado. */
  const mar = await page.evaluate(() => {
    const el = document.getElementById('navMarMedido');
    if (!el) return { existe: false };
    const ligou = iniciarSensoresDeMar();
    // Injeta eventos de acelerômetro como o aparelho faria.
    let entrou = 0;
    for (let i = 0; i < 200; i++) {
      if (alimentarSensorDeMar(0.3 * Math.sin(i / 8), 2, Date.now() + i * 500)) entrou++;
    }
    atualizarPainelMar();
    const txt = el.textContent;
    pararSensoresDeMar();
    return { existe: true, ligou, entrou, txt };
  });
  ok('Sensores de mar ligam e aceitam amostras', mar.existe && mar.entrou > 150,
     mar.existe ? `${mar.entrou} amostras decimadas` : 'linha do mar não existe');
  ok('Com janela curta ele DIZ que está medindo, não inventa número',
     mar.existe && /medindo o mar/.test(mar.txt), mar.txt || '(vazio)');

  /* MÁQUINAS NO PAINEL.                                            (v2.11.0)
     O banco de provas mede a conta; o navegador diz se os campos existem, se
     aceitam número e se o conselho aparece. */
  const maq = await page.evaluate(() => {
    const hud = document.getElementById('navHud'); hud.classList.add('active');
    const r = document.getElementById('navRpm'), cg = document.getElementById('navCarga');
    if (!r || !cg) return { existe: false };
    const alt = Math.round(r.getBoundingClientRect().height);
    r.value = '1250'; cg.value = '52';
    r.dispatchEvent(new Event('change', { bubbles: true }));
    const eco = document.getElementById('navEco');
    return { existe: true, alt, tipo: r.type, modo: r.getAttribute('inputmode'),
             lido: typeof maqRpm !== 'undefined' ? maqRpm : null,
             cargaLida: typeof maqCarga !== 'undefined' ? maqCarga : null,
             temEco: !!eco };
  });
  ok('Campos de máquinas existem e são numéricos',
     maq.existe && maq.tipo === 'number' && maq.modo === 'numeric',
     maq.existe ? `${maq.tipo}/${maq.modo}, ${maq.alt} px` : 'não existem');
  ok('O que o chefe digita é lido', maq.lido === 1250 && maq.cargaLida === 52,
     `rpm=${maq.lido} carga=${maq.cargaLida}`);
  ok('Há linha de conselho e de tempo no painel', maq.temEco, 'presentes');

  /* A REFERÊNCIA DE TERRA NO PAINEL DE WAYPOINTS.                  (v2.10.0)
     O banco de provas garante a conta e o escape; o que só o navegador diz é
     se a linha aparece de fato no painel que o comandante abre no 🔷 ℹ️. */
  const refPainel = await page.evaluate(() => {
    openWaypointsInfo();
    const corpo = document.getElementById('waypointsInfoBody');
    const txt = corpo.textContent;
    const html = corpo.innerHTML;
    closeWaypointsInfo();
    return { temEmoji: /🏙️/.test(txt), txt: txt.slice(0, 160),
             // Nenhuma marcação veio do dado: se um nome trouxesse "<b>",
             // ele tem de aparecer escapado.
             temTagInjetada: /<b>|<img/i.test(html) };
  });
  ok('Waypoints mostram a referência de terra', refPainel.temEmoji,
     refPainel.temEmoji ? refPainel.txt.replace(/\s+/g, ' ').slice(0, 90) : 'sem 🏙️ no painel');
  ok('Referência não injeta marcação', !refPainel.temTagInjetada, 'escapado');

  await espelho.screenshot({ path: path.join(__dirname, 'smoke-espelho.png') });
  await espelho.close();

  /* ── A BARRA DE BOTÕES CABE NA TELA? ──────────────────────────────────────
     Esta verificação é de LAYOUT e por isso vive aqui, não no banco de provas:
     nenhuma asserção sobre o código-fonte pegaria o defeito que a motivou.

     Na v2.3.3 os botões passaram a 44 px de alvo de toque (correto) e entrou
     mais um. A fileira passou a precisar de 366 px num painel de 290, e o
     excedente foi SIMPLESMENTE CORTADO: a bordo sumiram o 🚢, o ℹ️ e até o ▾ de
     recolher, sem nenhum sinal de que existiam. O CSS estava "válido", as 134
     provas passavam, e o botão não estava lá.

     Aqui se abre o painel em larguras reais de telefone e tablete e se confere
     que TODO botão está dentro dos limites do painel. */
  for (const [nomeTela, larg, alt] of [['telefone 320', 320, 568], ['telefone 375', 375, 667], ['tablete 768', 768, 1024]]) {
    const tela = await browser.newPage({ viewport: { width: larg, height: alt }, isMobile: true, hasTouch: true });
    await tela.goto('http://localhost:8099/app.html', { waitUntil: 'domcontentloaded' });
    await tela.waitForTimeout(600);
    const fora = await tela.evaluate(() => {
      const hud = document.getElementById('navHud');
      hud.classList.add('active');
      const cx = hud.getBoundingClientRect();
      return [...hud.querySelectorAll('.nav-hud-header .nav-icon-btn')]
        .filter(e => { const b = e.getBoundingClientRect();
          return b.width < 1 || b.height < 1 || b.right > cx.right + 0.5 || b.left < cx.left - 0.5; })
        .map(e => e.id || e.textContent.trim());
    });
    ok(`Botões da barra cabem no painel (${nomeTela})`, fora.length === 0,
       fora.length ? 'cortados: ' + fora.join(', ') : 'todos dentro');
    // O alvo de toque tem de continuar em 44 px: encolher para caber seria
    // trocar um defeito por outro.
    const pequenos = await tela.evaluate(() =>
      [...document.querySelectorAll('#navHud .nav-hud-header .nav-icon-btn')]
        .filter(e => { const b = e.getBoundingClientRect(); return b.width < 44 || b.height < 44; })
        .map(e => e.id));
    ok(`Alvo de toque mantém 44 px (${nomeTela})`, pequenos.length === 0,
       pequenos.length ? 'menores: ' + pequenos.join(', ') : 'todos ≥ 44 px');

    /* O MESMO EXAME NO CABEÇALHO DO PAINEL 3D.                        (v2.6.0)
       Ele acaba de receber o 💡 dos faróis e já carregava título, o par
       Atitude/Earth, o seletor de casco, o 🎚️ e o ✕. A conta a 375 px é a
       mesma que cortou o 🚢 na v2.3.3 — e o botão que sumiria aqui seria o ✕,
       deixando o comandante preso na tela cheia sem saída visível. Abre-se o
       painel no modo Earth (onde o 💡 existe) e confere-se cada filho. */
    const fora3d = await tela.evaluate(() => {
      const ov = document.getElementById('ship3dModal');
      ov.classList.add('active', 'earth');
      // Com o seletor VAZIO mede-se outra tela: ele nasce sem opções e só é
      // preenchido ao abrir o painel. Medir vazio foi por pouco o erro desta
      // própria verificação — o seletor aparecia com 34 px e nada acusava.
      popularSeletorModelo();
      document.getElementById('ship3dVessel').textContent = 'REBOCADOR CHARLIE BRAVO';
      const cab = ov.querySelector('.ship3d-header');
      const cx = cab.getBoundingClientRect();
      // Elemento ESCONDIDO de propósito (display:none) não é botão cortado: o
      // 🎚️ some no globo, o 💡 some na Atitude, ambos por regra explícita.
      // Cortado é o que continua desenhado e cai FORA da caixa — foi assim que
      // o 🚢 sumiu na v2.3.3, com tamanho normal e posição além da borda.
      return [...cab.querySelectorAll('button, select')]
        .filter(e => e.offsetParent !== null)
        .filter(e => { const b = e.getBoundingClientRect();
          return b.right > cx.right + 0.5 || b.left < cx.left - 0.5 ||
                 b.bottom > cx.bottom + 0.5 || b.top < cx.top - 0.5; })
        .map(e => e.id || e.textContent.trim());
    });
    ok(`Cabeçalho 3D cabe na tela (${nomeTela})`, fora3d.length === 0,
       fora3d.length ? 'cortados: ' + fora3d.join(', ') : 'todos dentro');
    const peq3d = await tela.evaluate(() =>
      [...document.querySelectorAll('#ship3dModal .ship3d-header .nav-icon-btn')]
        .filter(e => e.offsetParent !== null)
        .filter(e => { const b = e.getBoundingClientRect(); return b.width < 44 || b.height < 44; })
        .map(e => e.id));
    ok(`Botões do painel 3D com 44 px (${nomeTela})`, peq3d.length === 0,
       peq3d.length ? 'menores: ' + peq3d.join(', ') : 'todos ≥ 44 px');
    /* O SELETOR DE CASCO NÃO PODE SER ESPREMIDO ATÉ SUMIR O NOME.
       Aqui nada é CORTADO — este cabeçalho ocupa a largura toda da tela e tem
       itens que encolhem (título, seletor), então o excesso vira aperto, não
       recorte. Mas apertado também engana: "ASD 2810 “SAAM Aguia”" tem 21
       caracteres a 0,72 rem e some dentro de um seletor estreito. Medido: com
       a fileira rígida o seletor cai a 94 px a 320 px de tela; com quebra de
       linha ele mantém os 108 px de projeto. O piso é esse. */
    const selW = await tela.evaluate(() => {
      const ov = document.getElementById('ship3dModal');
      ov.classList.add('active', 'earth');
      const w = document.getElementById('ship3dModelSel').getBoundingClientRect().width;
      ov.classList.remove('active', 'earth');
      return Math.round(w);
    });
    ok(`Seletor de casco legível (${nomeTela})`, selW >= 100, selW + ' px');

    /* A IARA NO NAVEGADOR DE VERDADE.                                (v2.7.0)
       O banco de provas mede a DECISÃO (que estado, falar ou calar). O que só
       um navegador diz é se o botão nasceu, se o ícone realmente troca, e se
       o toque não recolhe o painel — que era o defeito mais provável, porque
       o cabeçalho inteiro do HUD recolhe ao clique. */
    const iara = await tela.evaluate(() => {
      const hud = document.getElementById('navHud');
      hud.classList.add('active');
      const b = document.getElementById('iaraBtn');
      if (!b) return { existe: false };
      const r0 = b.getBoundingClientRect();
      const antes = { icone: b.textContent.trim(), classe: b.className, aria: b.getAttribute('aria-label') };
      // Percorre os quatro estados pela função real do módulo.
      const vistos = ['off', 'ouvindo', 'processando', 'respondendo'].map(e => {
        iaraEstado = e; pintarIara();
        return { e, icone: b.textContent.trim(), classe: b.className };
      });
      // E o toque NÃO pode recolher o painel.
      const recolhidoAntes = hud.classList.contains('collapsed');
      b.click();
      const recolhidoDepois = hud.classList.contains('collapsed');
      iaraEstado = 'off'; pintarIara();
      return { existe: true, largura: Math.round(r0.width), altura: Math.round(r0.height),
               antes, vistos, recolheu: !recolhidoAntes && recolhidoDepois };
    });
    ok(`Botão da Iara existe e tem 44 px (${nomeTela})`,
       iara.existe && iara.largura >= 44 && iara.altura >= 44,
       iara.existe ? `${iara.largura}x${iara.altura}` : 'não existe');
    ok(`Ícone da Iara troca nos 4 estados (${nomeTela})`,
       iara.existe && new Set(iara.vistos.map(v => v.icone)).size === 4 &&
       new Set(iara.vistos.map(v => v.classe)).size === 4,
       iara.existe ? iara.vistos.map(v => v.e + '=' + v.icone).join(' ') : '—');
    ok(`Perguntar à Iara não recolhe o painel (${nomeTela})`, iara.existe && !iara.recolheu,
       iara.recolheu ? 'o toque recolheu o HUD' : 'painel continua aberto');

    // E o 💡 só existe onde há globo: em Atitude tem de sumir de fato.
    const lampada = await tela.evaluate(() => {
      const ov = document.getElementById('ship3dModal');
      ov.classList.add('active');            // o painel precisa estar aberto
      ov.classList.remove('earth');
      const b = document.getElementById('s3dFaroisBtn').getBoundingClientRect();
      const visivel = b.width > 0 && b.height > 0;
      ov.classList.add('earth');
      const b2 = document.getElementById('s3dFaroisBtn').getBoundingClientRect();
      ov.classList.remove('active', 'earth');
      return { atitude: visivel, earth: b2.width > 0 && b2.height > 0 };
    });
    ok(`💡 aparece no globo e some em Atitude (${nomeTela})`,
       lampada.earth && !lampada.atitude,
       `earth=${lampada.earth} atitude=${lampada.atitude}`);
    await tela.close();
  }

  await page.screenshot({ path: path.join(__dirname, 'smoke.png'), fullPage: false });
  await browser.close(); srv.close();

  console.log('\n══ FUMAÇA EM NAVEGADOR REAL ══');
  passo.forEach(p => console.log(` ${p.ok ? '\x1b[32m✔\x1b[0m' : '\x1b[31m✘\x1b[0m'} ${p.nome}${p.extra ? '  \x1b[90m' + p.extra + '\x1b[0m' : ''}`));
  console.log(`\n ${passo.filter(p => p.ok).length}/${passo.length} passos`);
  if (erros.length) { console.log('\n ERROS DE CONSOLE:'); erros.slice(0, 10).forEach(e => console.log('  · ' + e)); }
  else console.log('\n Nenhum erro de console.');
  if (falhas.length) { console.log('\n REQUISIÇÕES FALHAS:'); falhas.slice(0, 10).forEach(f => console.log('  · ' + f)); }
  process.exit(passo.every(p => p.ok) && !erros.length ? 0 : 1);
})();
