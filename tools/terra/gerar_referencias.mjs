/*
════════════════════════════════════════════════════════════════════════════════
  GERADOR DE REFERÊNCIAS DE TERRA — cidades e portos da costa brasileira
════════════════════════════════════════════════════════════════════════════════
  Versão: 1.0.0  ·  Autor: Jossian Brito (Charlie Bravo)  ·  2026-09-20
  SPRINT 3 — amarrar cada waypoint a um nome que um ser humano reconhece.

  Uso:  node tools/terra/gerar_referencias.mjs
  Saída: assets/js/referencias.js   (NÃO editar à mão — regerar)

════════════════════════════════════════════════════════════════════════════════
  A LIÇÃO DA v2.5.0, APLICADA ANTES DE ERRAR DE NOVO
════════════════════════════════════════════════════════════════════════════════
  Na v2.4 a "linha de costa" era a lista de faróis ordenada por latitude:
  conveniente, plausível e errada em 48 NM na média. O defeito não foi de
  código — foi de PROCEDÊNCIA: aceitou-se um dado por estar à mão, e deu-se a
  ele um nome que prometia mais do que ele era.

  Aqui a tentação é a mesma. O pedido de bordo foi "cidade ou porto mais
  próximo, além do farol, como referência de orientação". A tentação é chamar
  o porto mais próximo de ABRIGO. NÃO SE FAZ ISSO, e a razão é séria:

    Escolher abrigo exige carta náutica, tenedouro, proteção de QUAL quadrante,
    profundidade, acesso noturno e conhecimento local. Nenhum desses dados está
    em nenhuma base pública que este gerador consegue alcançar. Um aplicativo
    que sussurra "abrigo a 12 milhas" com vento de 40 nós está mandando o navio
    para um lugar que ele não conhece.

  Portanto: esta base entrega REFERÊNCIA DE ORIENTAÇÃO — "onde estou, em termos
  que uma pessoa entende". Não entrega refúgio. O arquivo gerado diz isso, o
  manual diz isso, e a prova 22.9 guarda isso.

════════════════════════════════════════════════════════════════════════════════
  A LACUNA, DECLARADA EM VEZ DE DISFARÇADA
════════════════════════════════════════════════════════════════════════════════
  Fontes verificadas em 20/09/2026:

    ANTAQ (lista oficial)   web3.antaq.gov.br .......... inacessível (HTTP 000)
    dados.gov.br            api/publico/conjuntos-dados  exige credencial (401)
    IBGE localidades        servicodados.ibge.gov.br ... responde, SEM coordenadas
    Natural Earth 10 m      raw.githubusercontent ...... público, com coordenadas

  Sobrou a Natural Earth, que traz 20 portos brasileiros. FALTAM, e isso foi
  medido um a um:

    Suape · Itaqui · Sepetiba/Itaguaí · São Sebastião · Angra dos Reis ·
    Tubarão · Areia Branca · Imbituba · Antonina · Itajaí · Cabedelo ·
    São Luís · Barra do Riacho

  Conferido também: nenhum deles aparece como cidade na Natural Earth, nem
  como farol na Lista LF-40ED da DHN. Não há, nas fontes ao alcance desta
  bancada, coordenada com procedência para eles — e INVENTAR coordenada de
  porto é pior que não ter porto nenhum.

  A saída honesta tem duas partes:
    1. gerar o que existe, com procedência declarada;
    2. deixar a emenda TRIVIAL — ver PORTOS_EXTRA logo abaixo. Quem trabalha
       nesses portos tem a posição na ponta da língua; o gerador não tem.
*/

import { writeFileSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, '..', '..');
const BASE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/';

const CAIXA = { laMin: -35.5, laMax: 6.5, lnMin: -56.0, lnMax: -28.0 };

/*
PORTOS QUE FALTAM NA NATURAL EARTH — a emenda, para ser preenchida por quem sabe.

Formato: ['Nome do porto', latitude, longitude, 'origem da coordenada']

A quarta coluna NÃO é decoração: é a procedência. Sem ela, daqui a um ano
ninguém saberá se aquele número veio de uma carta, de um GPS de bordo ou de um
palpite — e foi exatamente esse esquecimento que produziu a linha de costa
errada da v2.4. Coordenada sem origem declarada não entra.

Deixado vazio de propósito. Não invento posição de porto.
*/
const PORTOS_EXTRA = [
  // ['Suape',        -8.3950, -34.9650, 'carta DHN 906 — conferido por ...'],
  // ['São Sebastião', -23.8100, -45.4000, '...'],
];

/*
QUÃO LONGE DO MAR UMA CIDADE AINDA SERVE DE REFERÊNCIA?

Uma cidade a 200 milhas do litoral não orienta ninguém no mar. Mas um corte
apertado demais perde portos de rio que são referências legítimas — Belém fica
dezenas de milhas estuário acima e é o nome que todo mundo usa naquela costa.

25 NM é o meio-termo medido: pega a faixa litorânea e as cidades de estuário,
e descarta o interior. O gerador imprime quantas entraram e quantas saíram,
para que mexer nesse número seja uma decisão com número na mão.
*/
const CIDADE_MAX_DA_COSTA_NM = 25;

/* Haversine — a mesma do app, repetida aqui porque o gerador roda fora dele. */
function distNM(la1, ln1, la2, ln2) {
  const R = 3440.065, r = Math.PI / 180;
  const dLa = (la2 - la1) * r, dLn = (ln2 - ln1) * r;
  const a = Math.sin(dLa / 2) ** 2 + Math.cos(la1 * r) * Math.cos(la2 * r) * Math.sin(dLn / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

const naCaixa = (la, ln) =>
  la >= CAIXA.laMin && la <= CAIXA.laMax && ln >= CAIXA.lnMin && ln <= CAIXA.lnMax;

async function baixar(arquivo) {
  const r = await fetch(BASE + arquivo);
  if (!r.ok) throw new Error(`${arquivo}: HTTP ${r.status}`);
  return r.json();
}

/* A linha de costa da v2.5.0, reaproveitada para medir quem é litorâneo. */
function carregarCosta() {
  const src = readFileSync(join(RAIZ, 'assets/js/coastline.js'), 'utf8');
  const m = src.match(/const COSTA_BRASIL = (\[[\s\S]*?\n\]);/);
  if (!m) throw new Error('COSTA_BRASIL não encontrada — gere a linha de costa primeiro');
  return JSON.parse(m[1]);
}

/* Distância ao traçado mais próximo, com o mesmo corte por caixa envolvente
   que a prova 10.5 mediu em 0,05 ms. Aqui não há pressa, mas são 348 cidades
   contra 6 mil vértices: sem o corte, a espera é sensível. */
function distDaCosta(la, ln, tracos) {
  let min = Infinity;
  const cosL = Math.cos(la * Math.PI / 180);
  for (const t of tracos) {
    const dLa = Math.max(t.laMin - la, 0, la - t.laMax) * 60;
    const dLn = Math.max(t.lnMin - ln, 0, ln - t.lnMax) * 60 * cosL;
    if (Math.sqrt(dLa * dLa + dLn * dLn) >= min) continue;
    for (const [pla, pln] of t.pts) {
      const d = distNM(la, ln, pla, pln);
      if (d < min) min = d;
    }
  }
  return min;
}

function caixasDe(tracos) {
  return tracos.map(pts => {
    let laMin = 90, laMax = -90, lnMin = 180, lnMax = -180;
    for (const [la, ln] of pts) {
      if (la < laMin) laMin = la; if (la > laMax) laMax = la;
      if (ln < lnMin) lnMin = ln; if (ln > lnMax) lnMax = ln;
    }
    return { pts, laMin, laMax, lnMin, lnMax };
  });
}

const arred = (v, c = 4) => Number(v.toFixed(c));

(async () => {
  console.log('Baixando Natural Earth 10 m…');
  const [gPortos, gCidades] = await Promise.all([
    baixar('ne_10m_ports.geojson'),
    baixar('ne_10m_populated_places.geojson')
  ]);

  // ── PORTOS ──────────────────────────────────────────────────────────────
  // A base de portos da Natural Earth NÃO traz país por feição; o recorte é
  // geográfico, e por isso a caixa pega Caiena, Kourou e Paramaribo. Eles
  // FICAM: um rebocador subindo para o Amapá passa por ali, e a referência
  // continua válida — só não é brasileira, e o arquivo diz isso.
  const portos = [];
  for (const f of gPortos.features) {
    const [ln, la] = f.geometry.coordinates;
    if (!naCaixa(la, ln)) continue;
    portos.push([arred(la), arred(ln), f.properties.name]);
  }
  for (const [nome, la, ln] of PORTOS_EXTRA) portos.push([arred(la), arred(ln), nome]);

  // ── CIDADES ─────────────────────────────────────────────────────────────
  console.log('Medindo distância da costa (reaproveitando a linha da v2.5.0)…');
  const tracos = caixasDe(carregarCosta());
  const cidades = [];
  let descartadasInterior = 0, foraDoBrasil = 0;
  for (const f of gCidades.features) {
    const [ln, la] = f.geometry.coordinates;
    if (!naCaixa(la, ln)) continue;
    const p = f.properties;
    // ADM0NAME é o campo que separa o Brasil dos vizinhos dentro da caixa —
    // Uruguai, Suriname, Guiana Francesa, Argentina e Paraguai entram nela.
    if (p.ADM0NAME !== 'Brazil') { foraDoBrasil++; continue; }
    const d = distDaCosta(la, ln, tracos);
    if (d > CIDADE_MAX_DA_COSTA_NM) { descartadasInterior++; continue; }
    cidades.push([arred(la), arred(ln), p.NAME, p.ADM1NAME || '']);
  }
  cidades.sort((a, b) => b[0] - a[0]);
  portos.sort((a, b) => b[0] - a[0]);

  const cab = `/*
════════════════════════════════════════════════════════════════════════════════
  REFERÊNCIAS DE TERRA — Coastal Navigator Brasil
════════════════════════════════════════════════════════════════════════════════
  GERADO por tools/terra/gerar_referencias.mjs em ${new Date().toISOString().slice(0, 10)}.
  NÃO EDITAR À MÃO — regere e perde-se a edição.

  Autor: Jossian Brito (Charlie Bravo)

  O QUE ESTE ARQUIVO É
    Referência de ORIENTAÇÃO: o nome de terra mais próximo de um ponto no mar,
    para que "estou em 23°05'S 041°53'W" vire "estou 12 milhas a leste de Cabo
    Frio" — que é como uma pessoa entende onde está.

  ⚠️  O QUE ESTE ARQUIVO NÃO É — leia antes de confiar
    NÃO É INDICAÇÃO DE ABRIGO. Um porto desta lista não é, por estar aqui, um
    lugar seguro para se meter com mau tempo. Escolher abrigo exige carta
    náutica, tenedouro, proteção de QUAL quadrante, profundidade e acesso
    noturno — nada disso está aqui, nem em nenhuma base pública ao alcance do
    gerador. Referência de orientação não é conselho de derrota.

  FONTE
    Natural Earth 10 m (domínio público): ne_10m_ports + ne_10m_populated_places.
    Cidades: só Brasil (ADM0NAME), e só as a menos de ${CIDADE_MAX_DA_COSTA_NM} NM da linha de costa.
    Portos: recorte geográfico — inclui Caiena, Kourou e Paramaribo, que são
    referência legítima para quem sobe ao Amapá, e não são brasileiros.

  ⚠️  PORTOS QUE SABIDAMENTE FALTAM
    Suape · Itaqui · Sepetiba/Itaguaí · São Sebastião · Angra dos Reis ·
    Tubarão · Areia Branca · Imbituba · Antonina · Itajaí · Cabedelo ·
    São Luís · Barra do Riacho

    Nenhum deles existe na Natural Earth, nem como cidade, nem como farol na
    LF-40ED da DHN — conferido um a um. A ANTAQ está inacessível desta bancada
    e o IBGE não publica coordenadas. Coordenada de porto NÃO SE INVENTA:
    para emendar, preencha PORTOS_EXTRA no gerador, COM A PROCEDÊNCIA na quarta
    coluna, e regere.

  FORMATO
    portos:  [latitude, longitude, nome]
    cidades: [latitude, longitude, nome, unidade federativa]
════════════════════════════════════════════════════════════════════════════════
*/
`;

  const linhas = a => a.map(x => '  [' + JSON.stringify(x).slice(1, -1) + ']').join(',\n');
  const js = cab +
    'const REFERENCIAS_TERRA = {\n  portos: [\n' + linhas(portos) +
    '\n  ],\n  cidades: [\n' + linhas(cidades) + '\n  ]\n};\n';

  const saida = join(RAIZ, 'assets/js/referencias.js');
  writeFileSync(saida, js);

  console.log(`\n  portos  : ${portos.length}  (${PORTOS_EXTRA.length} da emenda manual)`);
  console.log(`  cidades : ${cidades.length}  litorâneas (≤ ${CIDADE_MAX_DA_COSTA_NM} NM da costa)`);
  console.log(`            ${descartadasInterior} descartadas por serem do interior`);
  console.log(`            ${foraDoBrasil} fora do Brasil, dentro da caixa`);
  console.log(`  arquivo : ${(js.length / 1024).toFixed(1)} KB -> assets/js/referencias.js`);
})();
