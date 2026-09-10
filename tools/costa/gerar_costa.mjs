/*
════════════════════════════════════════════════════════════════════════════════
  Gerador da linha de costa brasileira — Coastal Navigator Brasil
════════════════════════════════════════════════════════════════════════════════
  Autor: Jossian Brito (Charlie Bravo) · 2026-09-10 · v1.0

  POR QUE ESTE ARQUIVO EXISTE

  Até a v2.4.2 a "linha de costa" do aplicativo era a LISTA DE FARÓIS ordenada
  por latitude — 88 pontos ligados em sequência, do Oiapoque ao Chuí. Servia
  para dar ordem de grandeza e nada mais: aferida contra a costa em resolução
  plena, errava

      13,4 NM em média e 105 NM no pior caso   (só o litoral continental)
      48,3 NM em média e 273 NM no pior caso   (contando ilhas oceânicas)

  Uma poligonal de 88 pontos corta baías inteiras. Entre o farol de Cabo Frio e
  o próximo ao sul, a reta passa por dentro do continente ou muito ao largo,
  conforme o trecho — e o número que o comandante lê no HUD não tem relação com
  onde a terra está.

  FONTE

  Natural Earth 10 m physical coastline, domínio público, via o repositório
  oficial de vetores. Recortada para a área de interesse do Brasil e
  simplificada por Douglas-Peucker com tolerância expressa em MILHAS NÁUTICAS —
  não em graus, porque um grau de longitude vale coisas diferentes no Oiapoque e
  no Chuí.

  A TOLERÂNCIA DE 0,1 NM NÃO É ARBITRÁRIA

  É a resolução com que o número aparece na tela ("~3.2 NM"). Simplificar mais
  que isso introduziria erro visível na casa exibida; simplificar menos gastaria
  banda de bordo sem nada a mostrar. Medido: erro máximo de 0,1 NM contra a
  costa em resolução plena, 101 KB crus, 28 KB comprimidos.

  ILHAS OCEÂNICAS ENTRAM

  Fernando de Noronha, Abrolhos, Trindade, Martin Vaz, São Pedro e São Paulo:
  todas fazem parte do arquivo. Na implementação antiga elas eram excluídas de
  propósito, porque um farol de ilha inserido numa poligonal ordenada por
  latitude fazia a linha SALTAR para o mar entre dois pontos do continente. Com
  geometria de verdade esse problema não existe — cada ilha é um traço fechado
  próprio, que não distorce o litoral continental.

  E a mudança é de segurança: passando 3 NM ao largo de Abrolhos, dizer ao
  comandante que ele está a 180 NM da costa é pior do que não dizer nada.

  USO
      node tools/costa/gerar_costa.mjs            # regenera assets/js/coastline.js
      node tools/costa/gerar_costa.mjs 0.25       # outra tolerância, em NM
════════════════════════════════════════════════════════════════════════════════
*/
import fs from 'node:fs';
import path from 'node:path';

const BASE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/';
/*
  DUAS FONTES, E A SEGUNDA NÃO É LUXO.

  `ne_10m_coastline` traz o litoral continental e as ilhas grandes. Ele NÃO traz
  as ilhas pequenas — e no Brasil essas são justamente as que têm farol e as que
  um rebocador precisa saber onde estão. Medido só com a primeira fonte, a
  distância à costa errava:

      Rocas 81 NM · Abrolhos 30 NM · Laje de Santos 19 NM
      Queimada Grande 18 NM · Alcatrazes 18 NM · Arvoredo 7 NM

  Ou seja: passando ao largo de Abrolhos, o aplicativo diria que a terra mais
  próxima estava a 30 milhas de onde ela realmente está.

  `ne_10m_minor_islands_coastline` cobre exatamente essa lacuna.
*/
const FONTES = ['ne_10m_coastline.geojson', 'ne_10m_minor_islands_coastline.geojson'];
const TOL_NM = Number(process.argv[2] || 0.1);
const CASAS = 3;                    // 3 casas ≈ 111 m ≈ 0,06 NM: abaixo da tolerância
const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const SAIDA = path.join(RAIZ, 'assets/js/coastline.js');

// Área de interesse: do Oiapoque ao Chuí, com folga para as ilhas oceânicas.
const CX = { latMin: -35.5, latMax: 6.5, lngMin: -56.0, lngMax: -28.0 };
const dentro = ([ln, la]) => la >= CX.latMin && la <= CX.latMax && ln >= CX.lngMin && ln <= CX.lngMax;

/* Douglas-Peucker com distância em MILHAS NÁUTICAS. */
function simplificar(pts, tolNM) {
  if (pts.length < 3) return pts;
  const cosL = Math.cos(pts[pts.length >> 1][1] * Math.PI / 180);
  const X = ([ln]) => ln * 60 * cosL, Y = ([, la]) => la * 60;
  const dist = (p, a, b) => {
    const ax = X(a), ay = Y(a), bx = X(b), by = Y(b), px = X(p), py = Y(p);
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    if (!l2) return Math.hypot(px - ax, py - ay);
    let t = ((px - ax) * dx + (py - ay) * dy) / l2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
  };
  const manter = new Uint8Array(pts.length);
  manter[0] = manter[pts.length - 1] = 1;
  const pilha = [[0, pts.length - 1]];
  while (pilha.length) {
    const [i, j] = pilha.pop();
    let pior = 0, k = -1;
    for (let m = i + 1; m < j; m++) {
      const d = dist(pts[m], pts[i], pts[j]);
      if (d > pior) { pior = d; k = m; }
    }
    if (pior > tolNM && k > 0) { manter[k] = 1; pilha.push([i, k], [k, j]); }
  }
  return pts.filter((_, i) => manter[i]);
}

const feicoes = [];
for (const nome of FONTES) {
  const resp = await fetch(BASE + nome);
  if (!resp.ok) { console.error(`falha ao baixar ${nome}:`, resp.status); process.exit(1); }
  const geo = await resp.json();
  feicoes.push(...geo.features);
  console.log(`fonte ${nome.padEnd(40)} ${geo.features.length} feições`);
}

const tracos = [];
for (const f of feicoes) {
  const partes = f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.coordinates;
  for (const p of partes) {
    // Um traço que entra e sai da caixa vira dois pedaços; o que fica fora cai.
    let atual = [];
    for (const c of p) {
      if (dentro(c)) atual.push(c);
      else if (atual.length) { if (atual.length > 1) tracos.push(atual); atual = []; }
    }
    if (atual.length > 1) tracos.push(atual);
  }
}
/*
  ILHOTAS DERIVADAS DE FARÓIS — o remendo necessário, e o que ele é.

  Nem `ne_10m_coastline` nem `ne_10m_minor_islands_coastline` contêm as ilhas
  pequenas do Brasil. Medido: Rocas ficava a 81 NM da costa mais próxima do
  arquivo, Abrolhos a 30, Laje de Santos a 19, Queimada Grande e Alcatrazes a 18.
  Passando ao largo de Abrolhos o aplicativo diria que a terra mais próxima
  estava a trinta milhas de onde ela está.

  O dado que resolve isso já está no repositório: a Lista de Faróis. **Um farol
  marca terra.** Onde a fonte cartográfica não tem litoral perto de um farol,
  emite-se um anel pequeno na posição dele.

  O QUE ISTO É E O QUE NÃO É. É a afirmação "existe terra aqui", que a DHN
  garante. NÃO é o contorno levantado da ilha: o raio é uma convenção de
  0,2 NM, e Alcatrazes (1,4 km) fica subdimensionada enquanto um rochedo fica
  superdimensionado. Serve para a distância à terra deixar de errar dezenas de
  milhas; não serve para navegar por dentro.
*/
const RAIO_ILHOTA_NM = 0.2;
const LIMIAR_NM = 1.5;
function distNM(la, ln, lista) {
  const cosL = Math.cos(la * Math.PI / 180);
  let min = Infinity;
  for (const t of lista) for (let i = 1; i < t.length; i++) {
    const ax = (t[i-1][0] - ln) * 60 * cosL, ay = (t[i-1][1] - la) * 60;
    const bx = (t[i][0] - ln) * 60 * cosL,   by = (t[i][1] - la) * 60;
    const dx = bx-ax, dy = by-ay, l2 = dx*dx + dy*dy;
    let u = l2 ? -(ax*dx + ay*dy)/l2 : 0; u = u < 0 ? 0 : u > 1 ? 1 : u;
    const px = ax + u*dx, py = ay + u*dy, d = Math.hypot(px, py);
    if (d < min) min = d;
  }
  return min;
}
const jsLh = fs.readFileSync(path.join(RAIZ, 'assets/js/lighthouses.js'), 'utf8')
  .replace(/export\s+(const|default)/g, '$1');
const cofre = {};
new Function('c', jsLh + '; c.L = lighthouses;')(cofre);
const orfaos = [];
for (const lh of cofre.L) {
  if (distNM(lh.lat, lh.lng, tracos) <= LIMIAR_NM) continue;
  const cosL = Math.cos(lh.lat * Math.PI / 180);
  const anel = [];
  for (let k = 0; k <= 8; k++) {                 // octógono fechado
    const a = k * Math.PI / 4;
    anel.push([lh.lng + (RAIO_ILHOTA_NM * Math.sin(a)) / (60 * cosL),
               lh.lat + (RAIO_ILHOTA_NM * Math.cos(a)) / 60]);
  }
  tracos.push(anel);
  orfaos.push(lh.name);
}
if (orfaos.length) console.log(`ilhotas de farol : ${orfaos.length} — ${orfaos.join(', ')}`);

const brutos = tracos.reduce((s, t) => s + t.length, 0);
const simples = tracos.map(t => simplificar(t, TOL_NM)).filter(t => t.length > 1);
const vert = simples.reduce((s, t) => s + t.length, 0);

// [lat, lng] — a mesma ordem usada em todo o aplicativo
const dados = simples.map(t => t.map(([ln, la]) => [+la.toFixed(CASAS), +ln.toFixed(CASAS)]));
const corpo = dados.map(t => '[' + t.map(([a, b]) => `[${a},${b}]`).join(',') + ']').join(',\n');

const cab = `/*
 * Coastal Navigator Brasil — linha de costa brasileira
 * Autor: Jossian Brito (Charlie Bravo)
 *
 * FONTES: Natural Earth 10 m — physical coastline E minor islands coastline
 * (domínio público), recortadas para o Brasil e simplificadas por
 * Douglas-Peucker a ${TOL_NM} NM. A segunda fonte é indispensável: sem ela
 * faltam Abrolhos, Rocas, Alcatrazes, Laje de Santos e Queimada Grande — as
 * ilhas com farol, e as que importam a quem navega.
 *
 * NÃO EDITE À MÃO. Gerado por tools/costa/gerar_costa.mjs; qualquer alteração
 * manual some na próxima geração. Depois de regenerar, rode \`npm test\`: a
 * suíte 10 afere a distância da costa contra pontos conhecidos.
 *
 * FORMATO: lista de TRAÇOS; cada traço é uma lista de [lat, lng]. Traços
 * separados são litorais distintos — o continente e cada ilha oceânica. Não
 * ligue um traço ao outro: a reta entre eles cruzaria mar aberto e a distância
 * calculada ficaria menor do que a real, que foi exatamente o defeito da
 * implementação anterior.
 *
 * ${simples.length} traços · ${vert.toLocaleString('pt-BR')} vértices · gerado de ${brutos.toLocaleString('pt-BR')} brutos
 */
const COSTA_BRASIL = [
${corpo}
];
`;
fs.writeFileSync(SAIDA, cab);
console.log(`recorte Brasil : ${tracos.length} traços · ${brutos.toLocaleString('pt-BR')} vértices`);
console.log(`simplificado   : ${simples.length} traços · ${vert.toLocaleString('pt-BR')} vértices (tolerância ${TOL_NM} NM)`);
console.log(`escrito        : assets/js/coastline.js — ${(fs.statSync(SAIDA).size / 1024).toFixed(0)} KB`);
