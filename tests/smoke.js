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
  await espelho.screenshot({ path: path.join(__dirname, 'smoke-espelho.png') });
  await espelho.close();

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
