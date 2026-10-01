/* ═══════════════════════════════════════════════════════════════════════════
   GUARDA DO PROXY — decisões puras de quem pode gastar a chave paga
   Autor: Jossian Brito (Charlie Bravo)
   Versão 1.0.0 — 01/10/2026 · Sprint A do controle de acesso
   ═══════════════════════════════════════════════════════════════════════════

   POR QUE ISTO EXISTE

   Desde a v2.9.0 o `tempo.mjs` guarda a chave paga do Open-Meteo longe do
   navegador — e durante todo esse tempo validou APENAS as coordenadas. Não
   havia verificação de origem, nem limite de taxa, nem teto de gasto.

   Na prática: qualquer pessoa que descobrisse o endereço podia torrar a cota
   paga com um laço de `curl`, de qualquer lugar do mundo, na conta do autor.

       /.netlify/functions/tempo?lat=-23&lng=-42

   Protegemos a chave e esquecemos a fechadura. Este arquivo é a fechadura —
   ou, sendo honesto sobre o que ela é, o TRINCO e o FUSÍVEL.

   O QUE ISTO É, E O QUE NÃO É

   Não é autenticação. Um aplicativo estático não tem segredo que o navegador
   não entregue, e quem forjar `Sec-Fetch-Site` e `Referer` passa pela porta.
   A fechadura de verdade é o token de licença (Sprints B a E).

   O que isto faz, e faz bem:

     · barra site de terceiro que tente pendurar o endpoint (o navegador
       marca `cross-site` e NÃO deixa o JavaScript mentir sobre isso);
     · barra varredor e `curl` ingênuo, que não mandam cabeçalho de busca;
     · LIMITA o estrago de qualquer um que passe, com teto por chamador;
     · e, acima de tudo, QUEIMA O FUSÍVEL antes de a fatura crescer.

   A analogia é de praça de máquinas: o disjuntor não pergunta quem causou o
   curto. Ele abre. O fusível diário protege a conta mesmo contra um atacante
   que forje tudo — e contra o caso mais provável de todos, que não é ataque
   nenhum: um laço defeituoso no nosso próprio código.

   POR QUE `Sec-Fetch-Site` E NÃO `Origin`

   Medido em Chromium, numa chamada igual à do `assets/js/tempo.js`
   (GET relativo, mesma origem, sem cabeçalhos próprios):

       origin           (AUSENTE)
       referer          http://…/app.html
       sec-fetch-site   same-origin

   O navegador NÃO manda `Origin` em GET de mesma origem. Exigir `Origin`
   derrubaria o aplicativo inteiro no primeiro deploy — e é o tipo de erro que
   só aparece em produção. `Sec-Fetch-Site` é melhor por dois motivos: ele
   chega, e é um nome de cabeçalho PROIBIDO — página nenhuma consegue
   escrevê-lo por JavaScript. Quando ele diz `cross-site`, foi o navegador que
   disse, não a página.

   A RESSALVA DO TABLETE VELHO

   Navegador antigo pode não mandar `Sec-Fetch-*`. Em vez de barrar o
   rebocador que ainda roda um aparelho de 2018, caímos para a lista de hosts
   pelo `Referer`. É uma defesa mais fraca, e é deliberado: entre deixar
   passar um `curl` a mais e deixar um comandante sem previsão de vento, a
   escolha é óbvia.
   ═══════════════════════════════════════════════════════════════════════════ */

export const GUARDA_VERSAO = '1.0.0';

/* Hosts de onde o aplicativo legitimamente chama. O ambiente pode
   acrescentar outros (domínio próprio) por TEMPO_HOSTS, separados por
   vírgula. Os Deploy Previews do Netlify viram `algo--projeto.netlify.app`,
   daí o prefixo opcional. */
export const GUARDA_HOSTS_PADRAO = [
  'coastalbrasil.netlify.app',
  '*--coastalbrasil.netlify.app',
  'localhost',
  '127.0.0.1'
];

/* Teto por chamador e janela. A cadência legítima é UMA busca a cada 15 min
   por dispositivo (TEMPO_INTERVALO_MS no cliente) = 4 por hora. Sessenta por
   hora comporta quinze aparelhos atrás do mesmo IP de satélite, com folga
   para recarregamentos — e ainda assim corta um laço de abuso no primeiro
   minuto, porque um laço faz isso em segundos. */
export const GUARDA_LIMITE_IP = 60;
export const GUARDA_JANELA_MS = 60 * 60 * 1000;

/* Teto DIÁRIO de chamadas ao Open-Meteo — o fusível. Cada célula de grade não
   cacheada custa DUAS chamadas (mar + ar). Um rebocador em viagem cruza umas
   50 células por dia, logo ~100 chamadas. Dois mil comporta uma frota de
   vinte embarcações antes de abrir. Ajuste por TEMPO_TETO_DIARIO: só quem
   contratou o plano sabe o número certo. */
export const GUARDA_TETO_DIARIO = 2000;

/* ─────────────────────────────────────────────────────────────────────────
   O host de um Referer, sem explodir com valor malformado.

   Comportamento conforme a entrada:
     'https://coastalbrasil.netlify.app/app.html'  → 'coastalbrasil.netlify.app'
     'http://localhost:8099/app.html'              → 'localhost'   (porta fora)
     'lixo'                                        → ''
     ''  /  null  /  undefined                     → ''
   ───────────────────────────────────────────────────────────────────────── */
export function hostDaReferencia(referer) {
  if (!referer) return '';
  try { return new URL(String(referer)).hostname || ''; }
  catch (e) { return ''; }
}

/* ─────────────────────────────────────────────────────────────────────────
   Um host está na lista? Aceita curinga de PREFIXO apenas ('*--host'), que é
   a forma dos Deploy Previews. Curinga solto ('*') é recusado de propósito:
   uma lista que aceita tudo não é lista, e um dia alguém a configuraria sem
   perceber que desligou a guarda.
   ───────────────────────────────────────────────────────────────────────── */
export function hostPermitido(host, lista) {
  const h = String(host || '').toLowerCase();
  if (!h) return false;
  return (lista || []).some(padraoBruto => {
    const padrao = String(padraoBruto || '').trim().toLowerCase();
    if (!padrao || padrao === '*') return false;
    if (padrao.startsWith('*--')) {
      const base = padrao.slice(3);
      // Exige o '--' e ALGO antes dele: '--x.app' não vale, 'p--x.app' vale.
      return h === base || (h.endsWith('--' + base) && h.length > base.length + 2);
    }
    return h === padrao;
  });
}

/* ─────────────────────────────────────────────────────────────────────────
   A requisição veio da nossa própria página?

   `obter` é uma função (nome) => valor, para esta decisão não depender da
   classe Headers e poder ser provada com um objeto comum.

   Comportamento conforme os cabeçalhos:

     sec-fetch-site: 'same-origin'          → PASSA  (o navegador garantiu)
     sec-fetch-site: 'cross-site'           → BARRA  (outro site pendurando)
     sec-fetch-site: 'same-site'            → BARRA  (subdomínio irmão não é o app)
     sec-fetch-site: 'none'                 → BARRA  (digitado na barra de endereço)
     ausente + referer de host da lista     → PASSA  (tablete velho)
     ausente + referer de fora              → BARRA
     ausente + sem referer                  → BARRA  (curl cru)

   O caso 'none' barra também a conferência manual por navegador. É de
   propósito: este endereço não é página, é serviço. Para verificar a chave
   paga de ponta a ponta, use o aplicativo no Deploy Preview.
   ───────────────────────────────────────────────────────────────────────── */
export function origemDeConfianca(obter, lista) {
  const ler = n => { try { return obter(n) || ''; } catch (e) { return ''; } };
  const sfs = String(ler('sec-fetch-site')).trim().toLowerCase();

  if (sfs) {
    if (sfs === 'same-origin') return { ok: true, motivo: '' };
    return { ok: false, motivo: `origem ${sfs}` };
  }

  const host = hostDaReferencia(ler('referer'));
  if (!host) return { ok: false, motivo: 'sem origem declarada' };
  if (hostPermitido(host, lista)) return { ok: true, motivo: '' };
  return { ok: false, motivo: 'origem não autorizada' };
}

/* ─────────────────────────────────────────────────────────────────────────
   Quem é o chamador. O Netlify entrega o IP real em
   `x-nf-client-connection-ip`; `x-forwarded-for` é a rede de segurança, e
   dele só vale o PRIMEIRO endereço — os seguintes são acrescentados por
   quem repassou e podem ser inventados pelo cliente.
   ───────────────────────────────────────────────────────────────────────── */
export function enderecoDoCliente(obter) {
  const ler = n => { try { return obter(n) || ''; } catch (e) { return ''; } };
  const direto = String(ler('x-nf-client-connection-ip')).trim();
  if (direto) return direto;
  const encadeado = String(ler('x-forwarded-for')).split(',')[0].trim();
  return encadeado || 'desconhecido';
}

/* ─────────────────────────────────────────────────────────────────────────
   Estado do guarda. Mora na MEMÓRIA da instância — mesma limitação que o
   cache do tempo.mjs já aceita desde a v2.9.0, e a mesma honestidade: o
   Netlify roda várias instâncias e as recicla, então o limite por chamador
   vale por instância, não globalmente. Isso enfraquece a contagem contra um
   ataque distribuído e NÃO a torna inútil: instância quente concentra as
   chamadas de um mesmo cliente, e o fusível diário continua sendo um teto.

   Contagem durável exigiria Netlify Blobs ou o próprio Supabase, com latência
   em TODA chamada de tempo. Para uma tranca de emergência, o custo não se
   justifica — está registrado como dívida, não como descuido.
   ───────────────────────────────────────────────────────────────────────── */
export function novoEstado() {
  return { porCliente: new Map(), gasto: { dia: '', n: 0 } };
}

/* O dia em UTC, 'AAAA-MM-DD'. UTC e não hora local porque a função roda em
   região que pode mudar, e um fusível que zera em horário diferente conforme
   o servidor é um fusível que ninguém consegue auditar. */
export function diaUtc(agora) {
  return new Date(agora).toISOString().slice(0, 10);
}

/* ─────────────────────────────────────────────────────────────────────────
   Limite por chamador, janela deslizante.

   Guarda os instantes das chamadas e descarta os que saíram da janela. Isso
   é mais justo que "balde por hora cheia": no balde, quem chama 60 vezes às
   10h59 pode chamar outras 60 às 11h01. Na janela deslizante, não.

   Comportamento com teto 60 e janela de 1 h:
     ·  1ª a 60ª chamada na mesma hora  → passa, restantes 59…0
     ·  61ª dentro da hora              → BARRA
     ·  61ª com a 1ª já fora da janela  → passa (a mais velha caducou)

   ESTA FUNÇÃO TEM EFEITO: registra a chamada que autorizou. Decisão e efeito
   juntos aqui são deliberados — separá-los abriria uma corrida em que duas
   chamadas consultam, ambas passam, e nenhuma conta.
   ───────────────────────────────────────────────────────────────────────── */
export function limiteDeTaxa(estado, agora, chave, teto, janelaMs) {
  const k = String(chave || 'desconhecido');
  const corte = agora - janelaMs;
  const anteriores = (estado.porCliente.get(k) || []).filter(t => t > corte);

  if (anteriores.length >= teto) {
    estado.porCliente.set(k, anteriores);
    return { ok: false, usados: anteriores.length, restantes: 0 };
  }
  anteriores.push(agora);
  estado.porCliente.set(k, anteriores);
  return { ok: true, usados: anteriores.length, restantes: teto - anteriores.length };
}

/* Varre chamadores que não aparecem há uma janela inteira. Sem isto, o Map
   cresce para sempre numa instância de vida longa — vazamento lento, do tipo
   que só se descobre quando a função começa a morrer por memória. */
export function limparOciosos(estado, agora, janelaMs) {
  const corte = agora - janelaMs;
  let removidos = 0;
  for (const [k, ts] of estado.porCliente) {
    const vivos = ts.filter(t => t > corte);
    if (vivos.length === 0) { estado.porCliente.delete(k); removidos++; }
    else estado.porCliente.set(k, vivos);
  }
  return removidos;
}

/* ─────────────────────────────────────────────────────────────────────────
   O FUSÍVEL. Conta chamadas ao Open-Meteo — as que custam — e abre no teto.

   `quantas` é 2 numa busca completa (mar + ar), não 1: o que importa é o que
   a fatura conta, não quantas vezes o aplicativo pediu.

   Comportamento com teto 2000:
     · usados 0,    pedindo 2  → passa, usados vai a 2
     · usados 1998, pedindo 2  → passa, usados vai a 2000  (o teto é inclusivo)
     · usados 2000, pedindo 2  → ABRE, e nada é chamado lá fora
     · vira o dia UTC          → zera e volta a passar

   Pedir ANTES de gastar, e não depois, é o ponto: um fusível que conta o que
   já queimou não protege nada.
   ───────────────────────────────────────────────────────────────────────── */
export function pedirGasto(estado, agora, quantas, teto) {
  const hoje = diaUtc(agora);
  if (estado.gasto.dia !== hoje) estado.gasto = { dia: hoje, n: 0 };

  const n = Math.max(0, Number(quantas) || 0);
  if (estado.gasto.n + n > teto) {
    return { ok: false, usados: estado.gasto.n, teto };
  }
  estado.gasto.n += n;
  return { ok: true, usados: estado.gasto.n, teto };
}

/* ─────────────────────────────────────────────────────────────────────────
   Lê a configuração do ambiente, com os padrões acima quando ausente.
   Valor inválido (texto, negativo, zero) cai no padrão em vez de desligar a
   guarda por engano — `TEMPO_TETO_DIARIO=abc` não pode virar teto zero nem
   teto infinito.
   ───────────────────────────────────────────────────────────────────────── */
export function lerConfig(env) {
  const e = env || {};
  const inteiro = (v, padrao) => {
    const n = Number(String(v == null ? '' : v).trim());
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : padrao;
  };
  const extras = String(e.TEMPO_HOSTS || '')
    .split(',').map(s => s.trim()).filter(Boolean);
  return {
    hosts: GUARDA_HOSTS_PADRAO.concat(extras),
    limiteIp: inteiro(e.TEMPO_LIMITE_IP, GUARDA_LIMITE_IP),
    tetoDiario: inteiro(e.TEMPO_TETO_DIARIO, GUARDA_TETO_DIARIO)
  };
}
