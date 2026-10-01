/*
════════════════════════════════════════════════════════════════════════════════
  LICENÇA NO CAMINHO DO SERVIÇO — as decisões, separadas do efeito
════════════════════════════════════════════════════════════════════════════════
  Versão: 1.0.0  ·  Autor: Jossian Brito (Charlie Bravo)  ·  2026-10-01 16:05 UTC
  Caminho C, etapa C4. Decisão registrada em docs/arquitetura.md.

  ── O QUE ESTE MÓDULO FAZ, E O QUE ELE DELIBERADAMENTE NÃO FAZ ──────────────

  Ele DECIDE. Não fala com banco, não lê rede, não devolve Response. Tudo aqui
  é função pura: entra dado, sai veredito. É o que permite PROVAR a regra sem
  subir servidor nenhum — e o banco de provas desta casa não aceita regra que
  só se verifique em produção.

  O efeito (consultar o Supabase, montar a resposta) vive em
  netlify/functions/tempo.mjs. Separar os dois é a mesma disciplina de separar
  o cérebro do leme da máquina do leme: um decide o ângulo, o outro empurra o
  óleo. Quem mistura não consegue testar nenhum dos dois.

  ── A DECISÃO ARQUITETURAL QUE PRECISA SER LIDA ANTES DO CÓDIGO ─────────────

  🔴 EXIGIR LICENÇA PÕE O SUPABASE NO CAMINHO CRÍTICO DA PREVISÃO DE TEMPO.

  Em 28/09/2026 o projeto Supabase desta casa ficou PAUSADO por três dias, e o
  monitor que deveria avisar falhou duas vezes sem ninguém atender. Se "sem
  licença, sem tempo" fosse implementado do jeito óbvio, aquilo teria virado
  "sem banco, sem tempo": todo rebocador no mar perderia vento, onda e pressão
  porque um banco de dados em outro continente estava dormindo.

  Por isso o modo de falhar aqui é o CONTRÁRIO do portão administrativo da C3,
  e a assimetria é de propósito:

    ┌──────────────────────────────┬────────────────────────────────────────┐
    │ O que se protege             │ Como deve falhar                       │
    ├──────────────────────────────┼────────────────────────────────────────┤
    │ Portão administrativo        │ FECHA. Na dúvida, ninguém entra. O que │
    │ (poder sobre o sistema)      │ está em jogo é autoridade.             │
    ├──────────────────────────────┼────────────────────────────────────────┤
    │ Previsão de tempo            │ ABRE. Na dúvida, o passadiço recebe o  │
    │ (segurança da navegação)     │ vento. O que está em jogo é o barco.   │
    └──────────────────────────────┴────────────────────────────────────────┘

  A bordo a distinção é rotina: um damper de incêndio falha FECHADO, porque
  fechar é o estado seguro. A alimentação de combustível da máquina principal
  NÃO falha fechada porque um sensor morreu — ela alarma e continua, porque
  parar no meio do canal é pior que o risco que o sensor media.

  E há o argumento econômico, que aponta para o mesmo lado: o que a licença
  protege aqui é ORÇAMENTO, não segurança. O orçamento já tem três travas
  independentes da Sprint A — trava de origem, limite por IP e fusível diário.
  Negar previsão a uma embarcação no mar para economizar uma fração de centavo,
  quando o fusível diário já garante o teto da fatura, é trocar um custo de
  segurança real por uma economia marginal. Não se faz.

  ── OS TRÊS MODOS, E POR QUE SÃO TRÊS ──────────────────────────────────────

  Ligar cobrança de uma vez, num aplicativo que já está em uso, é desligar o
  serviço de todo mundo ao mesmo tempo. Daí a escada:

    desligado  (PADRÃO)  nada muda. Implantar a C4 não altera comportamento
                         nenhum. É o estado em que a etapa nasce.
    observar             confere a licença e ANOTA o veredito na resposta,
                         mas atende todo mundo. Serve para VER quem seria
                         barrado antes de barrar — o equivalente a rodar o
                         alarme novo em paralelo antes de ligá-lo no desligamento
                         automático.
    exigir               sem licença válida, sem previsão. E ainda assim nunca
                         nega quando o verificador é que falhou.

  A passagem de um degrau para o outro é um ato EXPLÍCITO do dono, numa
  variável de ambiente. Não é efeito colateral de um merge.
*/

import { resumoDoToken } from './admin.mjs';

export const LICENCA_VERSAO = '1.0.0';

/* Os três degraus. Strings e não números porque quem lê a variável no painel
   do Netlify precisa entender o que ela faz sem consultar tabela. */
export const MODO = {
  DESLIGADO: 'desligado',
  OBSERVAR:  'observar',
  EXIGIR:    'exigir'
};

/* Quanto tempo um veredito vale sem reconsultar o banco.

   Cinco minutos é escolha de engenharia, não número redondo por acaso:
   · o cliente busca tempo a cada 15 min, então 5 min significa, no pior caso,
     uma consulta de licença a cada ~3 buscas por instância morna;
   · uma licença revogada deixa de valer em no máximo 5 min, o que é folga
     aceitável para um controle de ORÇAMENTO (não fosse orçamento, seria curto
     demais);
   · e reduz a exposição ao Supabase, que é justamente o elo frágil.

   O cache guarda TAMBÉM o veredito negativo. Sem isso, quem digitasse um
   código errado bateria no banco a cada busca — transformando um engano de
   digitação em enxurrada de consultas. */
export const VEREDITO_TTL_MS = 5 * 60 * 1000;

/* Teto do mapa de vereditos na memória da instância. Uma instância morna
   atende poucas embarcações; o teto só existe para a memória não crescer sem
   limite se ela ficar viva muito tempo. Mesma lógica do cache de tempo. */
export const VEREDITO_TETO = 500;

/*
O CABEÇALHO, E POR QUE NÃO UM PARÂMETRO DE URL.

A licença viaja em `x-licenca`, cabeçalho, nunca em `?licenca=…`. O motivo é o
mesmo que condenou a chave do Open-Meteo a viver só no servidor: URL aparece em
log de CDN, em histórico de navegador, em cabeçalho `Referer` ao sair do site e
na barra de endereço de quem está olhando por cima do ombro. Cabeçalho não
aparece em nenhum desses.

É a diferença entre levar a chave no bolso e prendê-la do lado de fora da
mochila: as duas chegam ao mesmo lugar, mas uma delas todo mundo vê no caminho.
*/
export const CABECALHO_LICENCA = 'x-licenca';

/*
lerModo(env) — traduz a variável de ambiente no degrau, com PADRÃO SEGURO.

Qualquer coisa que não seja exatamente 'observar' ou 'exigir' vira 'desligado'.
Incluindo erro de digitação. A escolha é deliberada: se alguém escrever
"exijir" no painel do Netlify, o resultado é o aplicativo continuar funcionando
como hoje — não é o aplicativo barrar a frota inteira por causa de uma letra.

Repare que aqui o padrão desconhecido cai para o lado PERMISSIVO, enquanto em
admin.mjs o desconhecido cai para o lado restritivo. É a mesma assimetria
explicada no cabeçalho, aplicada à leitura da configuração.
*/
export function lerModo(env) {
  const bruto = String((env && env.LICENCA_MODO) || '').trim().toLowerCase();
  if (bruto === MODO.EXIGIR)   return MODO.EXIGIR;
  if (bruto === MODO.OBSERVAR) return MODO.OBSERVAR;
  return MODO.DESLIGADO;
}

/*
extrairLicenca(obter) — pega o código do cabeçalho e o normaliza.

`obter` é uma função nome→valor (em tempo.mjs é `n => req.headers.get(n)`).
Recebe função em vez do objeto de cabeçalhos para que a prova possa alimentar
um mapa simples, sem fabricar um Request. Mesmo padrão de origemDeConfianca().

Normalização: tira espaços das pontas e baixa a caixa. Um código hexadecimal
copiado de WhatsApp costuma vir com espaço grudado no fim, e maiúscula/minúscula
não deveria ser a diferença entre ter e não ter licença. O que NÃO se faz é
tirar espaço do meio: isso mascararia um código realmente corrompido.

Devolve '' quando não há nada — nunca null, para que quem usa não precise
distinguir dois tipos de ausência.
*/
export function extrairLicenca(obter) {
  const bruto = (typeof obter === 'function' && obter(CABECALHO_LICENCA)) || '';
  return String(bruto).trim().toLowerCase();
}

/*
formatoDeLicenca(codigo) — o código parece uma licença?

gerarToken() produz 32 bytes em hexadecimal, logo 64 caracteres de [0-9a-f].
Conferir o FORMATO antes de ir ao banco economiza uma viagem de rede inteira
para todo engano óbvio: campo em branco, código pela metade, texto colado
errado.

É a mesma economia de conferir se a manilha é do diâmetro certo antes de subir
no convés para tentar encaixá-la.
*/
export function formatoDeLicenca(codigo) {
  return /^[0-9a-f]{64}$/.test(String(codigo || ''));
}

/*
Estados possíveis de um veredito. Nomes em vez de booleanos porque 'ausente' e
'vencida' pedem mensagens diferentes ao usuário, e um booleano só diria "não".
*/
export const ESTADO = {
  VALIDA:       'valida',
  AUSENTE:      'ausente',       // não mandou código nenhum
  MALFORMADA:   'malformada',    // mandou algo que não é um código
  DESCONHECIDA: 'desconhecida',  // código bem formado que o banco não conhece
  VENCIDA:      'vencida',
  REVOGADA:     'revogada',
  INDISPONIVEL: 'indisponivel'   // 🔴 o VERIFICADOR falhou, não a licença
};

/*
vereditoDaLinha(linha, agora) — transforma a linha do banco em veredito.

`linha` é o que check_license devolve, ou null quando não encontrou. Os campos
esperados são os de supabase/licenca.sql: { vessel, expires_at, revoked_at }.

A ORDEM DAS PERGUNTAS IMPORTA, e esta é a ordem certa:

  1. revogada  — revogação é ato deliberado do dono e vence qualquer prazo.
                 Uma licença revogada que ainda não expirou continua revogada.
  2. vencida   — prazo é automático.
  3. válida    — o que sobrou.

Inverter 1 e 2 produziria uma mentira sutil: uma licença revogada E vencida
seria rotulada "vencida", e o usuário pediria renovação em vez de entender que
o acesso foi cortado. A mensagem errada manda a pessoa para o caminho errado.

`agora` entra por parâmetro, nunca Date.now() aqui dentro, para que a prova
possa posicionar o relógio onde quiser. Função que lê o relógio por conta
própria é função que só se testa esperando.
*/
export function vereditoDaLinha(linha, agora) {
  if (!linha) return { ok: false, estado: ESTADO.DESCONHECIDA,
                       motivo: 'licença não encontrada' };

  const embarcacao = linha.vessel || '';

  /* ═══════════════════════════════════════════════════════════════════════
     🔴 CORRIGIDO NA C6 — e o defeito era grave.

     Até aqui esta função lia `linha.revoked_at`. A coluna NÃO EXISTE: o
     `check_license` de supabase/licenca.sql devolve `revoked`, booleano. Em
     JavaScript, campo inexistente é `undefined`, `undefined` é falso, e o
     código caía no teste seguinte — de modo que uma licença REVOGADA, ainda
     dentro do prazo, seria aceita como VÁLIDA. Revogar não revogaria nada.

     Ficou dormente porque LICENCA_MODO nunca foi ligado e o SQL nunca foi
     aplicado. Teria acordado no primeiro corte de acesso.

     POR QUE AS PROVAS NÃO VIRAM: `tests/esquema_provas.sql` mede o SQL no
     Postgres; a suíte 29 mede este JavaScript com fixtures que EU escrevi —
     e elas traziam `revoked_at` porque nasceram do mesmo modelo mental
     errado que o código. Nada atravessava a fronteira entre os dois.
     A prova de integração em tests/integracao_licenca.* existe para isso.

     Lição: duas provas que partem da mesma suposição não são duas provas.
     ═══════════════════════════════════════════════════════════════════════ */

  /* O BANCO JÁ DECIDIU, e a decisão dele é a autoridade: `check_license`
     calcula `valid`, `revoked` e `expired` com o `now()` DO BANCO. Recalcular
     aqui abriria divergência de relógio entre a Netlify e o Supabase — dois
     juízes para a mesma causa. O que se faz aqui é ORDENAR as razões. */

  /* Revogação vence vencimento: é ato deliberado do dono e vale mesmo dentro
     do prazo. Inverter mandaria o comandante pedir renovação quando o acesso
     foi CORTADO — a mensagem errada manda a pessoa ao caminho errado. */
  if (linha.revoked === true) {
    return { ok: false, estado: ESTADO.REVOGADA, motivo: 'licença revogada', embarcacao };
  }

  if (linha.expired === true) {
    return { ok: false, estado: ESTADO.VENCIDA, motivo: 'licença vencida',
             embarcacao, expiraEm: linha.expires_at || null };
  }

  /* Rede de segurança para resposta truncada ou data ilegível. Tratar como
     vencida custa ao usuário pedir renovação; o contrário custaria acesso
     indevido e perpétuo. */
  const vence = Date.parse(linha.expires_at);
  if (!isFinite(vence) || vence <= agora) {
    return { ok: false, estado: ESTADO.VENCIDA, motivo: 'licença vencida',
             embarcacao, expiraEm: linha.expires_at || null };
  }

  /* O banco disse "não vale" e nenhuma razão acima explicou. Contradição —
     e diante de contradição quem manda é o banco, não este processo. */
  if (linha.valid === false) {
    return { ok: false, estado: ESTADO.VENCIDA, motivo: 'licença não vale',
             embarcacao, expiraEm: linha.expires_at || null };
  }

  return { ok: true, estado: ESTADO.VALIDA, embarcacao,
           expiraEm: linha.expires_at,
           /* Quanto falta, em horas inteiras — alimenta o aviso "sua licença
              vence em 9 h" antes de ela morrer no mar. */
           horasRestantes: Math.floor((vence - agora) / 3600000) };
}


/*
═══════════════════════════════════════════════════════════════════════════════
  decidirAtendimento(modo, veredito) — O CORAÇÃO DA C4
═══════════════════════════════════════════════════════════════════════════════

Esta é a tabela inteira da etapa, em uma função pura de duas entradas. Se algo
desta etapa merece ser lido com atenção, é isto:

  ┌───────────┬───────────────────┬──────────────────────────────────────────┐
  │ modo      │ veredito          │ resultado                                │
  ├───────────┼───────────────────┼──────────────────────────────────────────┤
  │ desligado │ (não é consultado)│ ATENDE. A C4 implantada não muda nada.   │
  │ observar  │ qualquer          │ ATENDE, e anota o estado na resposta.    │
  │ exigir    │ válida            │ ATENDE.                                  │
  │ exigir    │ indisponível      │ ATENDE, marcado como degradado. 🔴       │
  │ exigir    │ qualquer outro    │ NEGA, HTTP 402.                          │
  └───────────┴───────────────────┴──────────────────────────────────────────┘

A quarta linha é a decisão arquitetural explicada no cabeçalho deste arquivo, e
é a única que alguém poderia querer "corrigir" sem entender. Ela NÃO é um furo:
é a recusa deliberada de transformar o Supabase em ponto único de falha de um
dado de segurança da navegação.

Por que 402 e não 403: o 403 diz "você não tem direito" — e a embarcação TEM
direito, só não tem licença corrente. O 402 Payment Required existe exatamente
para isto e é raro justamente porque quase ninguém tem o caso. Nós temos. Usar
o código certo deixa o cliente distinguir "preciso de licença" de "estou
barrado", que é o que a C5 vai transformar em mensagem.
*/
export function decidirAtendimento(modo, veredito) {
  if (modo === MODO.DESLIGADO) {
    return { atende: true, degradado: false, exigiu: false };
  }

  const v = veredito || { ok: false, estado: ESTADO.AUSENTE };

  if (modo === MODO.OBSERVAR) {
    /* Atende sempre, mas DIZ o que teria acontecido. É o alarme rodando em
       paralelo antes de ser ligado no desligamento automático. */
    return { atende: true, degradado: false, exigiu: false,
             observado: v.estado, observadoOk: !!v.ok };
  }

  /* Daqui para baixo, modo EXIGIR. */

  if (v.estado === ESTADO.INDISPONIVEL) {
    return { atende: true, degradado: true, exigiu: true,
             motivo: 'verificação de licença indisponível — atendido mesmo assim' };
  }

  if (v.ok) return { atende: true, degradado: false, exigiu: true };

  return { atende: false, status: 402, exigiu: true,
           estado: v.estado,
           motivo: v.motivo || 'licença necessária para este serviço' };
}

/* ─── Cache de vereditos ────────────────────────────────────────────────────
   Mesmo padrão do cache de tempo em tempo.mjs: Map na memória da INSTÂNCIA,
   que some quando o contêiner esfria. Isso é aceitável aqui porque o cache
   é otimização, não fonte de verdade — perder tudo custa uma consulta a mais,
   não um veredito errado.

   A chave é o SHA-256 do código, nunca o código. Assim, um despejo de memória
   ou um log de depuração não entrega licença de ninguém — a mesma disciplina
   com que o banco guarda só o resumo. */
export function novoCacheVeredito() {
  return new Map();
}

export function lerVeredito(cache, codigo, agora) {
  const chave = resumoDoToken(codigo);
  const e = cache.get(chave);
  if (!e) return null;
  if (agora - e.em > VEREDITO_TTL_MS) { cache.delete(chave); return null; }
  return e.veredito;
}

export function guardarVeredito(cache, codigo, veredito, agora) {
  /* Veredito de INDISPONÍVEL nunca é guardado. Guardá-lo prenderia a
     embarcação ao modo degradado por cinco minutos depois de o banco já ter
     voltado — e o objetivo é justamente o contrário: sair da degradação assim
     que possível. */
  if (veredito && veredito.estado === ESTADO.INDISPONIVEL) return cache;

  cache.set(resumoDoToken(codigo), { em: agora, veredito });
  if (cache.size > VEREDITO_TETO) cache.delete(cache.keys().next().value);
  return cache;
}
