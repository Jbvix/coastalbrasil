/*
════════════════════════════════════════════════════════════════════════════════
  PROXY DE TEMPO — Open-Meteo sem expor a chave paga
════════════════════════════════════════════════════════════════════════════════
  Versão: 2.0.0  ·  Autor: Jossian Brito (Charlie Bravo)  ·  2026-10-01 16:20 UTC
  v2.0.0 (C4) — o degrau da licença entra entre as coordenadas e o cache, com
                três modos e falha BENIGNA. Ver netlify/lib/licenca.mjs.
  v1.0.0       ·  2026-09-20 19:05 UTC
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
    cabeçalho opcional: x-licenca: <64 hex>                             (C4)
    -> 200 { ok, lat, lng, emitidoEm, mar:{…}, ar:{…} }
    -> 400 coordenadas inválidas
    -> 402 { ok:false, motivo, estadoLicenca, contato }  licença exigida (C4)
    -> 429 limite de chamadas excedido
    -> 502 { ok:false, motivo } quando o Open-Meteo não responde
    -> 503 teto diário atingido

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

import {
  lerConfig, novoEstado, origemDeConfianca, enderecoDoCliente,
  limiteDeTaxa, limparOciosos, pedirGasto, GUARDA_JANELA_MS
} from '../lib/guarda.mjs';

import {
  MODO, ESTADO, CABECALHO_LICENCA, lerModo, extrairLicenca, formatoDeLicenca,
  vereditoDaLinha, decidirAtendimento,
  novoCacheVeredito, lerVeredito, guardarVeredito
} from '../lib/licenca.mjs';
import { resumoDoToken } from '../lib/admin.mjs';

/* O estado do guarda vive na memória da instância, igual ao cache acima.
   A limitação está declarada em netlify/lib/guarda.mjs e é dívida conhecida. */
const guarda = novoEstado();

/* Vereditos de licença, mesma memória de instância, mesmo motivo.     (C4) */
const cacheLicenca = novoCacheVeredito();

const SUPA_URL = 'https://nsbeddfkcdyssrirrhzt.supabase.co';

/*
════════════════════════════════════════════════════════════════════════════════
  conferirLicenca — o EFEITO. A decisão está em netlify/lib/licenca.mjs.
════════════════════════════════════════════════════════════════════════════════

  Devolve sempre um veredito, NUNCA levanta exceção. Quem chama não precisa de
  try/catch, e é por isso que não existe caminho em que uma falha daqui derrube
  a busca de tempo.

  🔴 TODA FALHA VIRA `indisponivel`, e `indisponivel` ATENDE (ver a tabela em
  decidirAtendimento). Banco pausado, rede caída, chave ausente, resposta
  ilegível, estouro de tempo — tudo cai no mesmo balde, e o balde é benigno. É
  a aplicação concreta da regra do cabeçalho de licenca.mjs: o verificador
  falhar não pode custar o vento do comandante.

  ESTOURO DE TEMPO CURTO, E ESTE NÚMERO É DELIBERADO.
  3 segundos, contra os 8 que o proxy dá ao Open-Meteo. A assimetria é
  intencional: o Open-Meteo é o SERVIÇO: esperar por ele é esperar pelo dado
  que se quer. O Supabase aqui é só o porteiro — fazer o comandante esperar 8 s
  por um porteiro, para então receber o dado de qualquer jeito, seria somar
  latência sem somar informação. Três segundos é generoso para uma consulta por
  índice e curto o bastante para o degradado ser imperceptível.
*/
async function conferirLicenca(codigo, agora) {
  if (!codigo) return { ok: false, estado: ESTADO.AUSENTE,
                        motivo: 'nenhuma licença informada' };

  /* Formato errado não merece viagem de rede. */
  if (!formatoDeLicenca(codigo)) return { ok: false, estado: ESTADO.MALFORMADA,
                                          motivo: 'código de licença malformado' };

  const guardado = lerVeredito(cacheLicenca, codigo, agora);
  if (guardado) return guardado;

  const chave = process.env.SUPABASE_SERVICE_KEY || '';
  /* Sem chave o verificador não existe — e não existir é indisponível, não
     inválido. A diferença decide se o comandante é atendido. */
  if (!chave) return { ok: false, estado: ESTADO.INDISPONIVEL,
                       motivo: 'verificador não configurado' };

  try {
    const r = await fetch(`${SUPA_URL}/rest/v1/rpc/check_license`, {
      method: 'POST',
      headers: {
        'apikey': chave,
        'Authorization': `Bearer ${chave}`,
        'Content-Type': 'application/json'
      },
      /* O banco recebe o RESUMO, nunca o código. Quem calcula o SHA-256 é
         quem chama, de modo que o token em claro não entra sequer num log de
         consulta lenta do Postgres. Mesma decisão da C3. */
      body: JSON.stringify({ p_token_hash: resumoDoToken(codigo) }),
      signal: AbortSignal.timeout(3000)
    });
    if (!r.ok) return { ok: false, estado: ESTADO.INDISPONIVEL,
                        motivo: `verificador respondeu ${r.status}` };

    const texto = await r.text();
    const dado = texto ? JSON.parse(texto) : null;
    /* check_license devolve conjunto: o PostgREST entrega array. Nenhuma linha
       significa código desconhecido — que é veredito legítimo, não falha. */
    const linha = Array.isArray(dado) ? (dado[0] || null) : (dado || null);

    const veredito = vereditoDaLinha(linha, agora);
    guardarVeredito(cacheLicenca, codigo, veredito, agora);
    return veredito;
  } catch (e) {
    /* Inclui AbortError do estouro de tempo, falha de DNS com o projeto
       pausado, e JSON ilegível. Nenhum deles é culpa da embarcação. */
    return { ok: false, estado: ESTADO.INDISPONIVEL,
             motivo: 'verificador de licença inacessível' };
  }
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

  /* RECUSA NUNCA É CACHEADA.                                      (v2.16.0)
     O cabeçalho de sucesso manda a CDN guardar por 15 min e servir velho por
     mais uma hora. Se uma recusa herdasse isso, a CDN passaria a devolver 403
     a QUEM TEM DIREITO, por até 75 minutos, e o passadiço ficaria sem vento
     por causa de um varredor que passou. Apagão auto-infligido. */
  const semCache = Object.assign({}, cabecalhos, { 'Cache-Control': 'no-store' });

  /* ═══════════════════════════════════════════════════════════════════════
     A GUARDA VEM ANTES DE TUDO QUE CUSTA.                        (v2.16.0)

     A ordem aqui é a defesa inteira, e cada degrau existe por um motivo:

       1. origem   — barra site de terceiro e varredor, sem gastar nada;
       2. taxa     — barra o laço, por chamador;
       3. coords   — valida antes de tocar em cache ou rede;
       4. cache    — responde de graça quando já se sabe;
       5. fusível  — último portão ANTES do Open-Meteo, e só ele conta gasto.

     Pôr a origem depois do cache pareceria inofensivo (cache não custa), mas
     entregaria dado de graça a quem não deveria sequer ser atendido. E pôr o
     fusível depois da chamada seria contar o que já queimou.
     ═══════════════════════════════════════════════════════════════════════ */
  const cfg = lerConfig(process.env);
  const ler = n => req.headers.get(n);

  const origem = origemDeConfianca(ler, cfg.hosts);
  if (!origem.ok) {
    return new Response(JSON.stringify({ ok: false, motivo: `chamada recusada: ${origem.motivo}` }),
                        { status: 403, headers: semCache });
  }

  const cliente = enderecoDoCliente(ler);
  const agora = Date.now();
  limparOciosos(guarda, agora, GUARDA_JANELA_MS);
  const taxa = limiteDeTaxa(guarda, agora, cliente, cfg.limiteIp, GUARDA_JANELA_MS);
  if (!taxa.ok) {
    return new Response(JSON.stringify({ ok: false, motivo: 'limite de chamadas excedido' }),
                        { status: 429, headers: Object.assign({}, semCache, { 'Retry-After': '900' }) });
  }

  if (!isFinite(lat) || !isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return new Response(JSON.stringify({ ok: false, motivo: 'coordenadas inválidas' }),
                        { status: 400, headers: semCache });
  }

  /* ═══════════════════════════════════════════════════════════════════════
     O DEGRAU DA LICENÇA.                                              (C4)

     POSIÇÃO: depois das coordenadas, ANTES do cache. As duas escolhas têm
     motivo, e nenhuma é arbitrária.

     · Depois das COORDENADAS porque validar número é de graça e local,
       enquanto conferir licença pode custar uma ida ao Supabase. Barato antes
       de caro, a mesma regra que rege o resto desta função.

     · Antes do CACHE — e aqui é o ponto fino. Servir do cache não custa nada,
       então seria tentador atender qualquer um com dado já guardado. Mas isso
       abriria uma carona óbvia: bastaria pedir logo depois de uma embarcação
       licenciada para receber de graça, e a licença viraria enfeite. É o mesmo
       raciocínio que já põe a trava de ORIGEM antes do cache nesta função.

     MODO DESLIGADO NÃO CONSULTA NADA. Quando a variável não está ligada, não
     há leitura de cabeçalho, não há ida ao banco, não há latência: o custo da
     C4 implantada e desligada é exatamente zero. Uma etapa que pesa mesmo
     quando está desligada é uma etapa que ninguém deixa desligada em paz.
     ═══════════════════════════════════════════════════════════════════════ */
  const modo = lerModo(process.env);
  let licenca = { atende: true, degradado: false, exigiu: false };
  if (modo !== MODO.DESLIGADO) {
    const codigo = extrairLicenca(ler);
    const veredito = await conferirLicenca(codigo, agora);
    licenca = decidirAtendimento(modo, veredito);

    if (!licenca.atende) {
      /* 402 Payment Required: a embarcação tem direito ao aplicativo, só não
         tem licença corrente para o serviço pago. Não é 403 — 403 diria que
         ela não deveria estar aqui, e deveria. O cliente distingue os dois e
         a C5 transforma isso em mensagem honesta no passadiço. */
      return new Response(JSON.stringify({
        ok: false, motivo: licenca.motivo, estadoLicenca: licenca.estado,
        contato: 'https://wa.me/5585997737230'
      }), { status: 402, headers: Object.assign({}, semCache, { 'Retry-After': '300' }) });
    }
  }

  /* Tudo que o cliente precisa saber sobre a licença, anexado a QUALQUER
     resposta de sucesso — inclusive às servidas do cache. Em modo observar é
     o que permite ver quem seria barrado antes de barrar. */
  const selo = {};
  if (licenca.exigiu && licenca.degradado) selo.licencaDegradada = true;
  if (licenca.observado) selo.licencaObservada = licenca.observado;

  const la = arredondar(lat), ln = arredondar(lng);
  const chave = `${la.toFixed(2)},${ln.toFixed(2)}`;
  const guardado = doCache(chave);
  if (guardado) {
    return new Response(JSON.stringify(Object.assign({}, guardado, { doCache: true }, selo)),
                        { status: 200, headers: cabecalhos });
  }

  const apikey = process.env.OPEN_METEO_API_KEY || '';
  // Sem chave o proxy NÃO cai no endpoint gratuito por conta própria: o plano
  // livre é de uso não comercial, e este app roda num rebocador de trabalho.
  // Falhar declarando o motivo deixa a decisão com quem é dono dela.
  if (!apikey) {
    return new Response(JSON.stringify({ ok: false, motivo: 'OPEN_METEO_API_KEY não configurada no ambiente' }),
                        { status: 502, headers: semCache });
  }

  const comum = `latitude=${la}&longitude=${ln}&apikey=${encodeURIComponent(apikey)}`;
  const urlMar = `https://customer-marine-api.open-meteo.com/v1/marine?${comum}&current=${VARS_MAR.join(',')}`;
  const urlAr = `https://customer-api.open-meteo.com/v1/forecast?${comum}&current=${VARS_AR.join(',')}&wind_speed_unit=kn`;

  /* O FUSÍVEL, no último instante possível.                        (v2.16.0)
     Duas chamadas lá fora (mar + ar) é o que a fatura conta, então é 2 que se
     pede. Aberto o fusível, NADA é chamado: o 503 custa zero. */
  const gasto = pedirGasto(guarda, agora, 2, cfg.tetoDiario);
  if (!gasto.ok) {
    return new Response(JSON.stringify({
      ok: false,
      motivo: `teto diário de consultas atingido (${gasto.usados}/${gasto.teto})`
    }), { status: 503, headers: Object.assign({}, semCache, { 'Retry-After': '3600' }) });
  }

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
    /* O dado vai para o cache SEM o selo: o selo é de quem pergunta, não do
       lugar. Guardá-lo junto faria a próxima embarcação herdar o estado de
       licença da anterior — que é exatamente o tipo de vazamento silencioso
       que um cache compartilhado produz quando ninguém pensa nisso. */
    guardar(chave, dado);
    return new Response(JSON.stringify(Object.assign({}, dado, selo)),
                        { status: 200, headers: cabecalhos });
  } catch (e) {
    // A mensagem do Open-Meteo pode conter a URL, e a URL contém a chave.
    // Nunca repassar o erro cru para o cliente.
    const motivo = String((e && e.message) || 'falha ao consultar o Open-Meteo').replace(/apikey=[^&\s]*/gi, 'apikey=***');
    return new Response(JSON.stringify({ ok: false, motivo }), { status: 502, headers: semCache });
  }
};
