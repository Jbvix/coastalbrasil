/*
════════════════════════════════════════════════════════════════════════════════
  PROXY DE TEMPO — Open-Meteo sem expor a chave paga
════════════════════════════════════════════════════════════════════════════════
  Versão: 1.0.0  ·  Autor: Jossian Brito (Charlie Bravo)  ·  2026-09-20 19:05 UTC
  SPRINT 2.0 — decisão arquitetural aprovada em 20/09/2026, registrada em
  docs/arquitetura.md.

  POR QUE ESTA FUNÇÃO EXISTE

  O Open-Meteo só aceita a chave como PARÂMETRO DE URL (&apikey=…) e NÃO
  oferece restrição por domínio nem por referenciador. O Coastal Navigator é um
  site estático: uma chave embutida nele estaria visível em "ver código-fonte"
  e na aba Rede de qualquer visitante.

  O precedente do Cesium NÃO se aplica. O CESIUM_ION_TOKEN é publicado no
  cliente porque PODE SER ALGEMADO (somente leitura, apenas os assets
  necessários) — o próprio build-config.js diz isso. A chave do Open-Meteo não
  pode, e além disso é PAGA: quem a copiar passa a usar a licença comercial
  alheia.

  E há um ganho que não era o objetivo: a CSP do netlify.toml não lista
  open-meteo.com em connect-src. Chamada direta do navegador já seria bloqueada
  hoje, com ou sem chave. Este proxy é mesma origem — 'self' — e portanto é a
  ÚNICA opção que não afrouxa a política. O aviso 9.7 não piora.

  CONTRATO
    GET /.netlify/functions/tempo?lat=-23.05&lng=-41.90
    -> 200 { ok, lat, lng, emitidoEm, mar:{…}, ar:{…} }
    -> 400 coordenadas inválidas
    -> 502 { ok:false, motivo } quando o Open-Meteo não responde

  O cliente NUNCA recebe a chave, e também não recebe a URL de origem.
*/

/*
DUAS FONTES, DUAS CHAMADAS, E O TETO DE 10 VARIÁVEIS.

A cobrança do Open-Meteo é fracionária: uma requisição com MAIS DE 10 VARIÁVEIS
conta como mais de uma chamada. Abaixo estão 8 marinhas e 5 de ar — 1 chamada
cada, de propósito. Quem acrescentar variáveis aqui precisa saber que a décima
primeira dobra a conta.

O vento vem em NÓS nativamente (wind_speed_unit=kn). A corrente NÃO tem essa
opção e vem em km/h — a conversão fica do lado do cliente, junto do resto da
aritmética náutica, para ficar provada no banco de provas.
*/
const VARS_MAR = [
  'wave_height', 'wave_direction', 'wave_period',
  'swell_wave_height', 'swell_wave_period',
  'ocean_current_velocity', 'ocean_current_direction',
  'sea_surface_temperature'
];
const VARS_AR = [
  'wind_speed_10m', 'wind_direction_10m', 'wind_gusts_10m',
  'pressure_msl', 'temperature_2m'
];

const TTL_MS = 15 * 60 * 1000;      // o modelo se atualiza de 15 em 15 minutos

/*
A POSIÇÃO É ARREDONDADA — e isso é correção física, não truque de cache.

Sem arredondar, cada requisição traria uma coordenada diferente (o barco anda)
e o cache NUNCA acertaria. Arredondando a 0,05°:

  · 0,05° ≈ 3 NM ≈ 5,5 km — bem DENTRO da resolução dos próprios modelos
    (MFWAM 0,08° ≈ 8 km; GFS Wave 0,16–0,25° ≈ 16–25 km). Ou seja: a precisão
    que se "perde" já não existia no dado de origem;
  · a 10 nós, o rebocador cruza 3 NM em 18 minutos — quase exatamente o TTL.
    Cache e movimento ficam na mesma escala, o que é coerência e não acaso.

E o pedido ao Open-Meteo usa a MESMA coordenada arredondada, para que o valor
guardado corresponda de fato à chave. Guardar sob uma chave e buscar por outra
é como marcar a posição no diário e plotar outra na carta.
*/
const GRADE = 0.05;
// O toFixed(2) no fim tira o ruído de ponto flutuante: Math.round(-41.9/0.05)
// *0.05 devolve -41.900000000000006, que polui a chave do cache e a URL.
const arredondar = v => Number((Math.round(v / GRADE) * GRADE).toFixed(2));

/*
CACHE EM DOIS ANDARES.

  1. MEMÓRIA do contêiner morno. Sobrevive entre invocações próximas e é o que
     serve a embarcação e TODOS os observadores do espelho com uma só busca.
     Some quando o contêiner esfria — por isso não é o único andar.
  2. CDN, pelo Cache-Control. Netlify guarda a resposta na borda, e aí nem a
     função é invocada.

Ganho concreto: hoje cada observador em terra gastaria uma chamada da cota.
Com o proxy, gastam zero.
*/
const memoria = new Map();

function doCache(chave) {
  const e = memoria.get(chave);
  if (!e) return null;
  if (Date.now() - e.em > TTL_MS) { memoria.delete(chave); return null; }
  return e.dado;
}
function guardar(chave, dado) {
  memoria.set(chave, { em: Date.now(), dado });
  // Um rebocador visita poucas células de grade por viagem; o teto é só para
  // o contêiner não crescer sem limite se ficar morno por muito tempo.
  if (memoria.size > 200) memoria.delete(memoria.keys().next().value);
}

async function buscar(url, sinal) {
  const r = await fetch(url, { signal: sinal });
  if (!r.ok) throw new Error(`Open-Meteo respondeu ${r.status}`);
  const j = await r.json();
  // O Open-Meteo sinaliza erro com 200 e {error:true, reason:"…"}.
  if (j && j.error) throw new Error(String(j.reason || 'erro do Open-Meteo'));
  return j;
}

export default async (req) => {
  const u = new URL(req.url);
  const lat = Number(u.searchParams.get('lat'));
  const lng = Number(u.searchParams.get('lng'));

  const cabecalhos = {
    'Content-Type': 'application/json; charset=utf-8',
    // A CDN guarda por 15 min e pode servir o valor velho por mais 1 h
    // enquanto revalida: melhor o comandante ouvir "dados de 40 minutos atrás"
    // do que não ouvir nada porque o Open-Meteo piscou.
    'Cache-Control': 'public, max-age=900, stale-while-revalidate=3600'
  };

  if (!isFinite(lat) || !isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return new Response(JSON.stringify({ ok: false, motivo: 'coordenadas inválidas' }),
                        { status: 400, headers: cabecalhos });
  }

  const la = arredondar(lat), ln = arredondar(lng);
  const chave = `${la.toFixed(2)},${ln.toFixed(2)}`;
  const guardado = doCache(chave);
  if (guardado) {
    return new Response(JSON.stringify(Object.assign({}, guardado, { doCache: true })),
                        { status: 200, headers: cabecalhos });
  }

  const apikey = process.env.OPEN_METEO_API_KEY || '';
  // Sem chave o proxy NÃO cai no endpoint gratuito por conta própria: o plano
  // livre é de uso não comercial, e este app roda num rebocador de trabalho.
  // Falhar declarando o motivo deixa a decisão com quem é dono dela.
  if (!apikey) {
    return new Response(JSON.stringify({ ok: false, motivo: 'OPEN_METEO_API_KEY não configurada no ambiente' }),
                        { status: 502, headers: cabecalhos });
  }

  const comum = `latitude=${la}&longitude=${ln}&apikey=${encodeURIComponent(apikey)}`;
  const urlMar = `https://customer-marine-api.open-meteo.com/v1/marine?${comum}&current=${VARS_MAR.join(',')}`;
  const urlAr = `https://customer-api.open-meteo.com/v1/forecast?${comum}&current=${VARS_AR.join(',')}&wind_speed_unit=kn`;

  const aborta = AbortSignal.timeout(8000);
  try {
    /*
    AS DUAS BUSCAS EM PARALELO, E COM allSettled.

    Ao largo, o mar responde e o ar responde. Mas num waypoint dentro de um
    estuário o modelo marinho devolve `wave_height: null` — e se uma das duas
    falhasse de vez, com Promise.all o comandante perderia TAMBÉM o vento, que
    estava lá. Meia informação correta vale mais que nenhuma, desde que se diga
    qual metade falta.
    */
    const [mar, ar] = await Promise.allSettled([buscar(urlMar, aborta), buscar(urlAr, aborta)]);
    if (mar.status === 'rejected' && ar.status === 'rejected') {
      throw new Error(mar.reason && mar.reason.message || 'ambas as fontes falharam');
    }
    const dado = {
      ok: true,
      lat: la, lng: ln,
      emitidoEm: new Date().toISOString(),
      mar: mar.status === 'fulfilled' ? (mar.value.current || null) : null,
      ar: ar.status === 'fulfilled' ? (ar.value.current || null) : null,
      falhou: [mar.status === 'rejected' && 'mar', ar.status === 'rejected' && 'ar'].filter(Boolean)
    };
    guardar(chave, dado);
    return new Response(JSON.stringify(dado), { status: 200, headers: cabecalhos });
  } catch (e) {
    // A mensagem do Open-Meteo pode conter a URL, e a URL contém a chave.
    // Nunca repassar o erro cru para o cliente.
    const motivo = String((e && e.message) || 'falha ao consultar o Open-Meteo').replace(/apikey=[^&\s]*/gi, 'apikey=***');
    return new Response(JSON.stringify({ ok: false, motivo }), { status: 502, headers: cabecalhos });
  }
};
