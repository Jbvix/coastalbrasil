/*
════════════════════════════════════════════════════════════════════════════════
  IARA — Assistente de Viagem por Voz · Coastal Navigator Brasil
════════════════════════════════════════════════════════════════════════════════
  Versão: 1.0.0  ·  Autor: Jossian Brito (Charlie Bravo)  ·  2026-09-20 14:10 UTC
  SPRINT 0 — A FUNDAÇÃO: a voz nasce, se apresenta e mostra o seu estado.

  MODIFICAÇÕES DESTA VERSÃO (1.0.0 — app v2.7.0)
    + escolherVoz()        escolhe a voz pt-BR feminina, PREFERINDO a local
    + visualIara()         os 4 estados do ícone (off/ouvindo/processando/falando)
    + emManobra()          detecta manobra por taxa de guinada e chegada a WP
    + podeFalar()          AS REGRAS DE PASSADIÇO, em código e não em intenção
    + enfileirarFala()     fila por prioridade, com validade
    + textoApresentacao()  o cartão de visita da Iara
    + camada de E/S fina sobre SpeechSynthesis e SpeechRecognition

  QUEM É A IARA
  Não é um leitor de números. É uma CONSULTORA E ESPECIALISTA EM NAVEGAÇÃO que
  fala: conhece a Lista de Faróis da DHN, a linha de costa, o cálculo de derrota,
  corrente, consumo e estabilidade. Ajuda a decidir — mas QUEM DECIDE É O
  COMANDANTE. Essa fronteira não é diplomacia: é a regra 6 lá embaixo, e está
  no código porque intenção não sobrevive a refatoração.

════════════════════════════════════════════════════════════════════════════════
  A ASSIMETRIA QUE DESENHOU ESTE MÓDULO INTEIRO
════════════════════════════════════════════════════════════════════════════════
  Verificado antes de escrever uma linha:

    FALAR  (SpeechSynthesis)   vozes no APARELHO      -> FUNCIONA SEM INTERNET
    OUVIR  (SpeechRecognition) áudio vai à NUVEM      -> MORRE SEM INTERNET

  Um rebocador a 30 NM da costa não tem 4G. Logo, a regra estrutural:

    >> OS RELATÓRIOS AUTOMÁTICOS JAMAIS DEPENDEM DE RECONHECIMENTO DE VOZ. <<

  Eles nascem de cálculo local e são falados por voz local. Offshore a Iara
  continua relatando; o que ela perde é a capacidade de OUVIR — e nesse caso
  ela DIZ isso, em vez de fingir que não entendeu. É a diferença entre o rádio
  VHF e o radar: um depende de alguém do outro lado, o outro não.

  Por isso escolherVoz() pontua `localService` com peso alto: uma voz de nuvem
  emudece exatamente quando a costa some.

  E o microfone só abre no toque do botão — que era o pedido de bordo e é
  também o ÚNICO caminho que funciona: o Chromium recusa `continuous` no
  Android (bug 40324711). Bom instinto de passadiço vira boa engenharia.

  DEPENDE DE (globais de app.html, resolvidas só em tempo de chamada):
    navLastFix · ARRIVAL_RADIUS_NM · setNavStatus (opcionais — há recuo p/ todos)
*/

// ═══════════════════════════════════════════════════════════════════════
// IDENTIDADE E ESTADO
// ═══════════════════════════════════════════════════════════════════════

const IARA_NOME = 'Iara';
const IARA_CHAVE_MUDA = 'cnb_iara_muda';        // mudo soberano, persistido
const IARA_CHAVE_VOZ = 'cnb_iara_voz';          // voz escolhida pelo usuário
const IARA_CHAVE_APRESENTOU = 'cnb_iara_apresentou';

/* Prioridades, da mais alta para a mais baixa. O número é a ordem na fila. */
const IARA_PRIORIDADE = {
  critica: 0,    // segurança: só o mudo a cala
  resposta: 1,   // o comandante ACABOU de perguntar — não pode esperar o relatório
  evento: 2,     // chegada a waypoint, mudança de perna
  rotina: 3      // o relatório de hora em hora
};

/*
VALIDADE DA FALA — por que uma fala vence.

Um relatório de posição guardado 20 minutos na fila NÃO é um relatório
atrasado: é um relatório ERRADO. A 10 nós o barco andou 3,3 milhas desde que
aquele texto foi escrito. Dizer "estamos a 4 milhas do waypoint" quando já se
está a 0,7 é pior que ficar calado — é induzir a erro com a voz mansa de quem
tem certeza.

Então toda fala nasce com prazo. Rotina vence rápido (o próximo relatório vem
logo); resposta a pergunta vence rápido também (se demorou, o comandante já
resolveu sozinho); evento e crítica duram mais, porque o fato não muda.
*/
const IARA_VALIDADE_MS = {
  critica: 10 * 60000,
  resposta: 45000,
  evento: 5 * 60000,
  rotina: 8 * 60000
};

let iaraEstado = 'off';          // off | ouvindo | processando | respondendo
let iaraMuda = false;            // mudo soberano
let iaraFila = [];
let iaraVoz = null;              // SpeechSynthesisVoice escolhida
let iaraRec = null;              // SpeechRecognition, criada sob demanda
let iaraFalandoAgora = null;

// ═══════════════════════════════════════════════════════════════════════
// PARTE PURA — tudo aqui é aritmética e decisão, sem tocar em DOM nem em
// áudio. É o que esta bancada consegue provar: ela não tem microfone,
// alto-falante nem vozes instaladas. Mesma disciplina do farolEarthSpec:
// separa-se a DECISÃO do EFEITO, prova-se a decisão, e ao efeito sobra
// transcrever.
// ═══════════════════════════════════════════════════════════════════════

/*
ESCOLHA DA VOZ — por pontos, não por "a primeira que aparecer".

O comandante pediu voz feminina, simpática e informal. O navegador entrega uma
lista que varia com aparelho, versão e pacotes instalados: o que existe num
Galaxy Tab S10 FE não é o que existe num iPhone. Escolher "a primeira pt-BR" é
sorteio. Então pontua-se:

  +100  lang exatamente 'pt-BR'   — sotaque do Brasil, não de Portugal
   +50  lang começa com 'pt'      — melhor que nada
   +60  localService === true     * * *  VEJA O PORQUE ABAIXO  * * *
   +30  nome bate com voz feminina conhecida
   -40  nome bate com voz masculina conhecida
    +5  é a voz padrão do sistema

O PESO DE +60 NO `localService` É DELIBERADO E É A DECISÃO MAIS IMPORTANTE
DESTA FUNÇÃO. Uma voz "de nuvem" soa melhor em terra e EMUDECE no mar. Entre
uma voz bonita que cala a 30 NM da costa e uma voz comum que fala sempre, a
escolha de bordo é óbvia. Por isso o peso da voz local supera o do gênero: se
só houver feminina remota e masculina local, a Iara prefere falar.

Uma escolha manual do usuário (uriPreferida) vence tudo — o gosto de quem
ouve oito horas de quarto vale mais que a minha tabela.
*/
const IARA_VOZ_F = /(luciana|joana|maria|francisca|fernanda|camila|vit[oó]ria|helena|let[ií]cia|brenda|[ií]ara|yara|female|feminin|[-_]f[-_#]|afs|\bf\d)/i;
const IARA_VOZ_M = /(daniel|felipe|ricardo|ant[oô]nio|julio|j[uú]lio|thiago|male|masculin|[-_]m[-_#]|ams|\bm\d)/i;

function escolherVoz(vozes, uriPreferida) {
  const lista = Array.isArray(vozes) ? vozes.filter(v => v && typeof v.lang === 'string') : [];
  if (!lista.length) return null;

  // O gosto do usuário vence a heurística, sempre.
  if (uriPreferida) {
    const manual = lista.find(v => v.voiceURI === uriPreferida || v.name === uriPreferida);
    if (manual) return manual;
  }

  let melhor = null, melhorNota = -Infinity;
  for (const v of lista) {
    const lang = String(v.lang).replace('_', '-');
    let nota = 0;
    if (/^pt-BR$/i.test(lang)) nota += 100;
    else if (/^pt/i.test(lang)) nota += 50;
    else continue;                               // outra língua não serve
    if (v.localService) nota += 60;              // fala no mar — ver nota acima
    const nome = String(v.name || '') + ' ' + String(v.voiceURI || '');
    if (IARA_VOZ_F.test(nome)) nota += 30;
    if (IARA_VOZ_M.test(nome)) nota -= 40;
    if (v.default) nota += 5;
    if (nota > melhorNota) { melhorNota = nota; melhor = v; }
  }
  return melhor;
}

/*
OS QUATRO ESTADOS, E POR QUE O ÍCONE NÃO USA TRANSPARÊNCIA.

Lição já paga na v2.3.3 e gravada no CSS: sob sol de passadiço a diferença
entre opacidade 1,0 e 0,4 num emoji simplesmente SOME. Aqui o custo de errar é
maior que num botão qualquer: "o microfone está aberto" é a última informação
do mundo que pode ficar ambígua. Cada estado tem ícone PRÓPRIO, cor PRÓPRIA e
moldura PRÓPRIA — três canais redundantes, porque um deles vai falhar.

O `aria` não é enfeite de acessibilidade: é o que um leitor de tela anuncia, e
um dia alguém vai operar isto com a tela apagada para poupar bateria.
*/
function visualIara(estado, muda) {
  if (muda) {
    return { icone: '🔕', classe: 'iara-muda', rotulo: 'Iara silenciada',
             aria: 'Iara silenciada. Microfone fechado. Tocar para reativar.' };
  }
  switch (estado) {
    case 'ouvindo':
      return { icone: '🔴', classe: 'iara-ouvindo', rotulo: 'Ouvindo…',
               aria: 'Microfone ABERTO. A Iara está ouvindo. Tocar para parar.' };
    case 'processando':
      return { icone: '⏳', classe: 'iara-processando', rotulo: 'Processando…',
               aria: 'Microfone fechado. Processando o que você falou.' };
    case 'respondendo':
      return { icone: '🔊', classe: 'iara-respondendo', rotulo: 'Falando…',
               aria: 'Microfone fechado. A Iara está falando.' };
    default:
      return { icone: '🎙️', classe: 'iara-off', rotulo: `Perguntar à ${IARA_NOME}`,
               aria: 'Microfone FECHADO. Tocar e falar para perguntar à Iara.' };
  }
}

/*
ESTÁ MANOBRANDO? — a pergunta que cala a Iara.

Não existe sensor de "manobra". Existem dois sintomas que, juntos ou
separados, dizem que as mãos e os olhos do comandante estão ocupados:

  1. TAXA DE GUINADA (ROT). Um rebocador em derrota mantém o rumo dentro de
     uns poucos graus por minuto. Acima de 10°/min ele está GUINANDO — e um
     ASD guina rápido, porque é para isso que os azimutais servem. Quem está
     no leme nessa hora não quer ouvir o consumo acumulado.

  2. CHEGADA A WAYPOINT. Dentro do raio de chegada (ARRIVAL_RADIUS_NM = 0,3 NM,
     a mesma constante que o app já usa para trocar de perna) vem a guinada
     para a perna seguinte. A 10 nós, 0,3 NM são 108 segundos de aviso — tempo
     de sobra para a Iara terminar a frase e calar a boca.

O limiar de 10°/min é conservador de propósito: é melhor calar sem precisar do
que falar por cima de uma manobra. Silêncio nunca causou abalroamento.
*/
const IARA_ROT_LIMITE = 10;      // graus por minuto

function emManobra(ctx) {
  const c = ctx || {};
  const rot = Math.abs(Number(c.rotGrausMin) || 0);
  if (rot >= IARA_ROT_LIMITE) return { manobra: true, motivo: `guinando ${rot.toFixed(0)}°/min` };
  const d = Number(c.distProxWpNM);
  const raio = (typeof ARRIVAL_RADIUS_NM !== 'undefined') ? ARRIVAL_RADIUS_NM : 0.3;
  if (isFinite(d) && d >= 0 && d <= raio) return { manobra: true, motivo: `chegando ao waypoint (${d.toFixed(2)} NM)` };
  return { manobra: false, motivo: '' };
}

/*
════════════════════════════════════════════════════════════════════════════════
  AS SEIS REGRAS DE PASSADIÇO — em código, não em intenção
════════════════════════════════════════════════════════════════════════════════
  Um assistente falante numa ponte é um RISCO DE DISTRAÇÃO e pode MASCARAR o
  VHF e os alarmes. Isto não é conformidade de fachada: é a diferença entre uma
  ferramenta e um estorvo. Por isso as regras viram uma função pura, com prova
  — intenção escrita em comentário não sobrevive à terceira refatoração.

  1. MUDO É SOBERANO.          Cala tudo, inclusive o crítico. Quem mandou calar
                               tem motivo, e o motivo pode ser o VHF chamando.
  2. NÃO FALA SOBRE ALARME.    O alerta do app manda; a Iara espera.
  3. NÃO FALA EM MANOBRA.      Exceto crítico — segurança fura manobra.
  4. NÃO INTERROMPE A SI MESMA. Enfileira.
  5. FALA VENCIDA NÃO É DITA.   Relatório velho é relatório errado (ver
                               IARA_VALIDADE_MS).
  6. ELA SUGERE, NÃO MANDA.    Fronteira de conteúdo, provada sobre o texto.

  Retorno: { pode, acao, motivo }
    acao 'falar'      -> diz agora
    acao 'enfileirar' -> guarda e tenta de novo quando a condição passar
    acao 'descartar'  -> não vai ser dita nunca; esquece
*/
function podeFalar(ctx) {
  const c = ctx || {};
  const prio = c.prioridade || 'rotina';
  const critica = prio === 'critica';

  // REGRA 1 — o mudo vence até a emergência. E DESCARTA, não enfileira:
  // desmudar depois de uma hora não pode despejar doze relatórios velhos de
  // uma vez na cara de quem acabou de voltar para a ponte.
  if (c.muda) return { pode: false, acao: 'descartar', motivo: 'Iara silenciada' };

  // REGRA 5 — vencida antes mesmo de tentar.
  if (isFinite(c.venceEm) && c.venceEm <= 0) {
    return { pode: false, acao: 'descartar', motivo: 'fala vencida — diria posição velha' };
  }

  // REGRA 2 — o alarme do app tem precedência absoluta sobre a conversa.
  if (c.alertaAtivo) return { pode: false, acao: 'enfileirar', motivo: 'alerta do app falando' };

  // REGRA 4 — não atropela a própria frase.
  if (c.falando) return { pode: false, acao: 'enfileirar', motivo: 'já está falando' };

  // REGRA 3 — manobra cala tudo menos segurança.
  if (c.manobrando && !critica) {
    return { pode: false, acao: 'enfileirar', motivo: 'em manobra' };
  }

  return { pode: true, acao: 'falar', motivo: '' };
}

/*
A FILA — ordenada por prioridade e, dentro dela, por chegada.

Por que a RESPOSTA vem antes do EVENTO: o comandante acabou de apertar o botão
e falar. Se ele espera cinco segundos e ouve um relatório de waypoint em vez da
resposta, ele conclui — com razão — que a Iara não o escutou. Confiança numa
ponte se perde uma vez só.
*/
function enfileirarFala(fila, item) {
  const nova = (fila || []).slice();
  nova.push(item);
  nova.sort((a, b) => {
    const pa = IARA_PRIORIDADE[a.prioridade] ?? 3;
    const pb = IARA_PRIORIDADE[b.prioridade] ?? 3;
    return pa !== pb ? pa - pb : (a.nascidaEm || 0) - (b.nascidaEm || 0);
  });
  return nova;
}

/* Tira da fila o que já venceu — a limpeza da regra 5. */
function limparVencidas(fila, agoraMs) {
  const agora = isFinite(agoraMs) ? agoraMs : Date.now();
  return (fila || []).filter(f => {
    const validade = IARA_VALIDADE_MS[f.prioridade] ?? IARA_VALIDADE_MS.rotina;
    return (agora - (f.nascidaEm || 0)) < validade;
  });
}

/*
O CARTÃO DE VISITA.

Falado uma única vez, na primeira abertura, com o ALTO-FALANTE e o MICROFONE
FECHADO. Três coisas precisam caber aqui, e nenhuma é decoração:

  1. QUEM ELA É — consultora e especialista em navegação, não um leitor de
     números. É o que autoriza o comandante a perguntar coisas técnicas.
  2. QUEM DECIDE — "quem decide é você". Dita em voz alta, na primeira frase
     que ela diz na vida. Um assistente de voz é convincente por natureza;
     a fronteira tem de vir antes da confiança, não depois.
  3. O CONTRATO DO MICROFONE — "eu só escuto quando você me chama". Quem
     trabalha numa ponte precisa saber disso SEM ler termo nenhum. Privacidade
     anunciada em voz alta vale mais que privacidade escrita em rodapé.
*/
function textoApresentacao() {
  return `Oi, comandante! Eu sou a ${IARA_NOME}, especialista em navegação costeira: ` +
    `faróis, derrota, corrente, consumo e estabilidade. ` +
    `Te ajudo a decidir — quem decide é você. ` +
    `De hora em hora e a cada waypoint eu dou um retrato da viagem, sem você pedir. ` +
    `Pra perguntar, toca no microfone: eu só escuto quando você me chama. ` +
    `O mudo me cala na hora. Boa viagem!`;
}

/*
O TETO DE DURAÇÃO — e por que a apresentação também obedece.

Ninguém numa ponte quer parágrafo. A regra de bordo é que relatório de rotina
não passa de ~15 s; a apresentação, por ser única e por precisar dizer três
coisas obrigatórias, ganha um teto maior — mas GANHA UM TETO. A primeira
versão desta função tinha 42 segundos falados, e foi a própria prova que
denunciou. Estimativa a 150 palavras por minuto, que é ritmo de locução calma.
*/
const IARA_TETO_S = { rotina: 15, evento: 20, resposta: 20, apresentacao: 30 };

function duracaoFaladaS(texto) {
  const palavras = String(texto || '').trim().split(/\s+/).filter(Boolean).length;
  return palavras / 150 * 60;
}

/*
REGRA 6, PROVÁVEL SOBRE O TEXTO — ela sugere, não manda.

Uma voz feminina, simpática e segura é MUITO convincente. Se ela disser "reduza
para mil e duzentas rotações", alguém vai reduzir sem pensar. E a Iara não
enxerga o tráfego, não sente o cabo, não sabe que o rebocado está guinando.

Então: nenhuma frase da Iara usa imperativo sobre governo do navio. Ela diz
"dá pra", "vale", "sugiro", "se quiser". O verbo no imperativo fica para quem
está no leme. Esta lista é o que a prova varre no corpo de texto dela.
*/
const IARA_IMPERATIVOS_PROIBIDOS = [
  'reduza', 'aumente', 'acelere', 'desacelere', 'vire', 'guine', 'cai para',
  'manobre', 'pare a máquina', 'meta o leme', 'desvie', 'atraque', 'largue',
  'suspenda', 'fundeie', 'mude o rumo', 'corrija o rumo'
];

function violaRegra6(texto) {
  const t = String(texto || '').toLowerCase();
  return IARA_IMPERATIVOS_PROIBIDOS.filter(v => t.includes(v));
}

// ═══════════════════════════════════════════════════════════════════════
// PARTE DE E/S — fina de propósito. Toda decisão já foi tomada acima.
// ═══════════════════════════════════════════════════════════════════════

/* O contexto do momento, montado das globais do app. Tudo com recuo: a Iara
   não pode quebrar porque a navegação ainda não começou. */
function contextoIara(prioridade, nascidaEm) {
  const fix = (typeof navLastFix !== 'undefined') ? navLastFix : null;
  const m = emManobra({
    rotGrausMin: fix && fix.rotGrausMin,
    distProxWpNM: (typeof iaraDistProxWp === 'function') ? iaraDistProxWp() : NaN
  });
  const validade = IARA_VALIDADE_MS[prioridade] ?? IARA_VALIDADE_MS.rotina;
  return {
    prioridade,
    muda: iaraMuda,
    falando: !!iaraFalandoAgora,
    alertaAtivo: (typeof navAlertaTocando !== 'undefined') ? !!navAlertaTocando : false,
    manobrando: m.manobra,
    motivoManobra: m.motivo,
    venceEm: validade - (Date.now() - (nascidaEm || Date.now()))
  };
}

/* Distância ao próximo waypoint, em NM, ou NaN. Recuo silencioso. */
function iaraDistProxWp() {
  try {
    if (typeof waypoints === 'undefined' || typeof navActiveLeg === 'undefined') return NaN;
    const wp = waypoints[navActiveLeg];
    const fix = navLastFix;
    if (!wp || !fix) return NaN;
    return calculateDistance(fix.lat, fix.lng, wp.lat, wp.lng);
  } catch (e) { return NaN; }
}

/* Ponto único de entrada: TUDO que a Iara diz passa por aqui. */
function iaraDizer(texto, prioridade) {
  const item = { texto: String(texto || ''), prioridade: prioridade || 'rotina', nascidaEm: Date.now() };
  if (!item.texto) return { acao: 'descartar', motivo: 'texto vazio' };
  const d = podeFalar(contextoIara(item.prioridade, item.nascidaEm));
  if (d.acao === 'descartar') return d;
  if (d.acao === 'enfileirar') { iaraFila = enfileirarFala(iaraFila, item); return d; }
  iaraEmitir(item);
  return d;
}

/* A emissão de fato. Só chega aqui o que podeFalar() liberou. */
function iaraEmitir(item) {
  if (typeof speechSynthesis === 'undefined') return;
  try {
    const u = new SpeechSynthesisUtterance(item.texto);
    if (iaraVoz) { u.voice = iaraVoz; u.lang = iaraVoz.lang; } else { u.lang = 'pt-BR'; }
    u.rate = 1.0; u.pitch = 1.05;   // levemente acima: soa mais leve, menos robótica
    u.onstart = () => { iaraFalandoAgora = item; iaraMudarEstado('respondendo'); };
    u.onend = u.onerror = () => { iaraFalandoAgora = null; iaraMudarEstado('off'); iaraDrenarFila(); };
    speechSynthesis.speak(u);
  } catch (e) { console.warn('Iara não conseguiu falar:', e && e.message); }
}

/* Tenta despachar o que está na fila. Chamada ao fim de cada fala e a cada
   poucos segundos, porque a condição que bloqueou (manobra, alerta) passa
   sozinha sem avisar ninguém. */
function iaraDrenarFila() {
  iaraFila = limparVencidas(iaraFila, Date.now());
  if (!iaraFila.length || iaraFalandoAgora) return;
  const prox = iaraFila[0];
  const d = podeFalar(contextoIara(prox.prioridade, prox.nascidaEm));
  if (d.acao === 'falar') { iaraFila = iaraFila.slice(1); iaraEmitir(prox); }
  else if (d.acao === 'descartar') { iaraFila = iaraFila.slice(1); iaraDrenarFila(); }
}

function iaraMudarEstado(novo) { iaraEstado = novo; pintarIara(); }

/* Pinta o botão. Três canais redundantes: ícone, classe (cor+moldura) e aria. */
function pintarIara() {
  const b = document.getElementById('iaraBtn');
  if (!b) return;
  const v = visualIara(iaraEstado, iaraMuda);
  b.textContent = v.icone;
  b.className = 'nav-icon-btn ' + v.classe;
  b.title = v.rotulo;
  b.setAttribute('aria-label', v.aria);
}

/* Mudo soberano: um toque longo cala tudo e sobrevive a recarregar. */
function iaraAlternarMudo() {
  iaraMuda = !iaraMuda;
  try { localStorage.setItem(IARA_CHAVE_MUDA, iaraMuda ? '1' : '0'); } catch (e) { }
  if (iaraMuda) {
    try { speechSynthesis.cancel(); } catch (e) { }
    iaraFila = []; iaraFalandoAgora = null; iaraEstado = 'off';
  }
  pintarIara();
}

/*
PUSH-TO-TALK. O microfone abre AQUI e em lugar nenhum mais.

Sprint 0 ainda não tem a gramática de intenções (Sprint 6). Mas o botão não
fica inerte: ele percorre o caminho inteiro — abre, ouve, transcreve, fecha e
a Iara responde com HONESTIDADE sobre o que ainda não sabe fazer. Botão que
não faz nada confunde mais que botão nenhum; botão que diz a verdade, não.

E é exatamente assim que se descobre cedo o defeito caro: o encanamento de
voz é a parte mais arriscada do projeto, e ela passa a ser exercitada desde o
primeiro sprint, em aparelho de verdade, em vez de esperar o Sprint 6.
*/
function iaraOuvir() {
  if (iaraMuda) { iaraAlternarMudo(); return; }          // tocar quando muda, reativa
  if (iaraEstado === 'ouvindo') { try { iaraRec && iaraRec.stop(); } catch (e) { } return; }

  /*
  A APRESENTAÇÃO ACONTECE NO PRIMEIRO TOQUE — e isso não é estilo, é exigência
  do navegador. Android e iOS BLOQUEIAM áudio sem gesto do usuário: uma Iara
  que se apresentasse sozinha ao carregar a página simplesmente não sairia som
  nenhum, e nós passaríamos semanas achando que a voz estava quebrada.
  O primeiro toque no 🎙️ é o gesto, e é também o momento natural da pergunta
  "quem é você?". Depois da apresentação, o mesmo botão passa a ouvir.
  */
  if (iaraApresentar(false)) return;

  const RecCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!RecCtor) {
    iaraDizer('Esse navegador não me deixa ouvir. Mas os relatórios continuam normais, viu?', 'resposta');
    return;
  }
  try {
    iaraRec = new RecCtor();
    iaraRec.lang = 'pt-BR';
    // `continuous` é RECUSADO no Android (Chromium 40324711) — e nem queremos:
    // microfone que fica aberto sozinho numa ponte é problema, não recurso.
    iaraRec.continuous = false;
    iaraRec.interimResults = false;
    iaraRec.maxAlternatives = 1;
    iaraRec.onstart = () => iaraMudarEstado('ouvindo');
    iaraRec.onaudioend = () => iaraMudarEstado('processando');
    iaraRec.onresult = (ev) => {
      const t = (ev.results && ev.results[0] && ev.results[0][0] && ev.results[0][0].transcript) || '';
      iaraResponder(t);
    };
    iaraRec.onerror = (ev) => {
      iaraMudarEstado('off');
      // A falha que mais vai acontecer no mar tem nome e tem resposta honesta.
      const semRede = ev && (ev.error === 'network' || ev.error === 'service-not-allowed');
      iaraDizer(semRede
        ? 'Tô sem internet aqui, então não consigo te ouvir agora. Mas os relatórios continuam, esses não dependem de sinal.'
        : 'Não consegui te ouvir dessa vez. Tenta de novo?', 'resposta');
    };
    iaraRec.onend = () => { if (iaraEstado === 'ouvindo') iaraMudarEstado('off'); };
    iaraRec.start();
  } catch (e) {
    iaraMudarEstado('off');
    iaraDizer('Não consegui abrir o microfone agora.', 'resposta');
  }
}

/*
A RESPOSTA — Sprint 0 responde com a verdade sobre o próprio estágio.
A gramática de intenções entra no Sprint 6; a moldura já está pronta para ela.
*/
function iaraResponder(transcricao) {
  iaraMudarEstado('processando');
  const t = String(transcricao || '').trim();
  /*
  A GRAMÁTICA DE INTENÇÕES ASSUMIU AQUI.                            (v2.13.0)

  Até a v2.12 esta função repetia o que ouviu e admitia que ainda não sabia
  responder — que era a verdade daquele momento e valia mais que fingir. Agora
  ela encaminha para conversa.js, que reconhece a intenção e monta a resposta
  a partir do MESMO estado que alimenta o relatório horário. Resposta e
  relatório saírem da mesma fonte é o que impede a Iara de se contradizer.
  */
  if (typeof conversar === 'function') { conversar(t); return; }
  if (!t) { iaraMudarEstado('off'); return; }
  iaraDizer('Não consegui processar sua pergunta agora.', 'resposta');
}

/* Apresentação — uma vez só, e com jeito de voltar a ouvir se quiser. */
function iaraApresentar(forcar) {
  let jaFoi = false;
  try { jaFoi = localStorage.getItem(IARA_CHAVE_APRESENTOU) === '1'; } catch (e) { }
  if (jaFoi && !forcar) return false;
  try { localStorage.setItem(IARA_CHAVE_APRESENTOU, '1'); } catch (e) { }
  iaraDizer(textoApresentacao(), 'evento');
  return true;
}

/*
CARREGAR AS VOZES — e a armadilha do getVoices() assíncrono.

No Chrome, getVoices() devolve LISTA VAZIA na primeira chamada: as vozes só
chegam depois, num evento `voiceschanged`. Quem escolhe a voz no carregamento
da página escolhe de uma lista vazia e fica com a voz padrão do sistema — que
pode ser masculina, em inglês, ou ambas. Por isso se escolhe nos dois momentos.
*/
function iaraCarregarVozes() {
  if (typeof speechSynthesis === 'undefined') return;
  let pref = null;
  try { pref = localStorage.getItem(IARA_CHAVE_VOZ); } catch (e) { }
  const aplicar = () => { iaraVoz = escolherVoz(speechSynthesis.getVoices(), pref); };
  aplicar();
  try { speechSynthesis.addEventListener('voiceschanged', aplicar); } catch (e) { }
}

/*
INICIALIZAÇÃO — sem onclick inline, de propósito.

O aviso 9.7 das provas registra 58 atributos onclick= no app, e são eles que
obrigam a CSP a aceitar 'unsafe-inline'. Código novo não aumenta essa dívida:
daqui em diante, addEventListener. O stopPropagation é obrigatório porque o
cabeçalho inteiro do painel recolhe ao toque — sem ele, perguntar à Iara
fecharia o HUD na cara do comandante.
*/
function iaraInit() {
  try { iaraMuda = localStorage.getItem(IARA_CHAVE_MUDA) === '1'; } catch (e) { }
  iaraCarregarVozes();
  const b = document.getElementById('iaraBtn');
  if (b) {
    b.addEventListener('click', (e) => { e.stopPropagation(); iaraOuvir(); });
    // Toque longo (ou clique direito) cala a Iara: o gesto de emergência não
    // pode depender de achar outro botão com o VHF chamando.
    let t0 = 0;
    b.addEventListener('pointerdown', () => { t0 = Date.now(); });
    b.addEventListener('pointerup', (e) => {
      if (Date.now() - t0 > 600) { e.stopPropagation(); e.preventDefault(); iaraAlternarMudo(); }
    });
    b.addEventListener('contextmenu', (e) => { e.preventDefault(); iaraAlternarMudo(); });
  }
  pintarIara();
  // A fila precisa de quem a cutuque: manobra e alerta passam sem avisar.
  setInterval(iaraDrenarFila, 4000);
}
