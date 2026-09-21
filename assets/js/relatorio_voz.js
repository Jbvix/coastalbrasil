/*
════════════════════════════════════════════════════════════════════════════════
  RELATÓRIO FALADO — o que a Iara diz, e por quê
════════════════════════════════════════════════════════════════════════════════
  Versão: 1.0.0  ·  Autor: Jossian Brito (Charlie Bravo)  ·  2026-09-20 16:35 UTC
  SPRINT 1 — Relatórios automáticos de hora em hora e a cada waypoint.

  MODIFICAÇÕES DESTA VERSÃO (1.0.0 — app v2.8.0)
    + falarRumo/Hora/Coord/Num/Duracao   texto para o OUVIDO, não para o olho
    + deveDizerXte/Farol/Combustivel     relatório POR EXCEÇÃO
    + montarRelatorioHora()              o retrato de hora em hora
    + montarRelatorioWaypoint()          chegada e nova perna
    + agendamento na hora cheia + detecção de troca de perna
    + o mesmo relatório vai para quem acompanha em terra

════════════════════════════════════════════════════════════════════════════════
  DUAS DECISÕES DE PROJETO QUE VALEM MAIS QUE O CÓDIGO
════════════════════════════════════════════════════════════════════════════════

  1) O TEXTO PARA O OLHO NÃO É O TEXTO PARA O OUVIDO.

  O painel mostra `03°43.6'S` e `048°`. Jogue isso num sintetizador de voz e
  sai lixo: "zero três grau quarenta e três ponto seis linha ésse". Ninguém na
  ponte entende, e pior — vai ACHAR que entendeu.

  Marinheiro fala rumo dígito a dígito: "rumo zero-quatro-oito". Fala posição
  em graus e minutos: "23 graus e 5 sul". Fala hora como hora: "15 e 20", não
  "quinze dois zero". Por isso existe um formatador SÓ para a fala, separado do
  formatador de tela — são dois públicos diferentes, com dois vocabulários.

  2) RELATÓRIO POR EXCEÇÃO — o que se repete, ninguém escuta.

  Um relatório que diz exatamente as mesmas nove coisas toda hora vira ruído de
  fundo em dois dias, e aí o comandante deixa de ouvir justamente na hora em
  que havia algo diferente. É o mesmo mal do alarme que toca sempre.

  Então: o essencial vai SEMPRE (hora, posição, rumo, velocidade, próximo
  waypoint, ETA). O resto entra SÓ QUANDO IMPORTA:

    · fora de rumo   só acima de 0,1 NM — abaixo disso é ruído de GPS
    · farol          só quando está DENTRO do alcance efetivo, ou seja,
                     só quando ele pode de fato ser avistado daqui
    · combustível    a cada 4 relatórios, ou imediatamente se o saldo não
                     fecha a rota restante
    · SIMULAÇÃO      SEMPRE, e na primeira frase — ver abaixo

  A REGRA DA SIMULAÇÃO NÃO TEM EXCEÇÃO. Foi um simulador ligado ao lado do
  botão mais usado do painel que produziu "628.616 L de perda por desvio" na
  v2.3.3. Números simulados ditos em voz alta, com a segurança de uma
  assistente, sem dizer que são simulados, é a pior forma desse defeito. Se a
  simulação está ligada, a Iara abre o relatório avisando. Sempre. É prova.

  DEPENDE DE (globais resolvidas só em tempo de chamada):
    navLastFix · waypoints · navActiveLeg · tripData · navSimActive
    calculateDistance · calculateBearing · effectiveRange · findNearestLighthouse
    iaraDizer (de iara.js)
*/

// ═══════════════════════════════════════════════════════════════════════
// TEXTO PARA O OUVIDO
// ═══════════════════════════════════════════════════════════════════════

/*
RUMO, DÍGITO A DÍGITO. "Rumo zero-quatro-oito" é como se fala no rádio e na
ponte, e existe uma razão operacional: dígito isolado sobrevive a ruído e a
sotaque. "Quarenta e oito" e "cento e quarenta e oito" se confundem num
alto-falante ruim; "quatro oito" e "um quatro oito" não.
*/
const IARA_DIGITOS = ['zero', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove'];

function falarRumo(graus) {
  /*
  ARREDONDA PRIMEIRO, NORMALIZA DEPOIS — e não o contrário.
  A primeira versão normalizava e só então arredondava: 359,7° sobrevivia à
  normalização como 359,7 e virava 360 no arredondamento, saindo "três seis
  zero". Rumo 360 não existe na carta nem na boca de ninguém; é 000. Um
  segundo módulo depois do arredondamento custa nada e fecha o caso.
  */
  const g = (Math.round(Number(graus) || 0) % 360 + 360) % 360;
  return String(g).padStart(3, '0').split('').map(d => IARA_DIGITOS[+d]).join(' ');
}

/*
NÚMERO COM VÍRGULA, não com ponto. Em pt-BR o sintetizador lê "9,5" como "nove
vírgula cinco" e "9.5" como "nove ponto cinco" — ou, em alguns motores, como
"noventa e cinco". A vírgula é a forma correta e a mais segura.
*/
function falarNum(n, casas) {
  const v = Number(n);
  if (!isFinite(v)) return '—';
  /*
  ZERO À DIREITA SOME. "28,0 milhas" e "9,0 nós" saem do sintetizador como
  "vinte e oito vírgula zero" — ninguém fala assim, e o ouvido tropeça na
  sílaba a mais. Na tela o zero alinha colunas e tem função; no ouvido, não
  tem nenhuma. É a mesma tese do módulo: dois públicos, dois vocabulários.
  */
  return v.toFixed(casas == null ? 1 : casas)
          .replace('.', ',')
          .replace(/,0+$/, '');
}

/*
NÓ NO SINGULAR QUANDO É UM.

"Corrente 1,0 nós" não é português, e num relatório falado o deslize salta.
Em português o plural acompanha tudo que não é exatamente um — inclusive
1,5 ("um vírgula cinco nós"). E o decimal some quando o número é inteiro:
"24 nós", não "24,0 nós".
*/
function falarNos(n) {
  const v = Number(n);
  if (!isFinite(v)) return '—';
  if (Math.abs(v - 1) < 1e-9) return '1 nó';
  const inteiro = Math.abs(v - Math.round(v)) < 1e-9;
  return (inteiro ? String(Math.round(v)) : falarNum(v)) + ' nós';
}

/*
HORA COMO HORA. "15:20" vira "quinze dois zero" em vários motores. "15 e 20" é
inequívoco, e ":00" ganha "em ponto" porque "quinze e zero zero" é sofrível.
*/
function falarHora(d) {
  if (!(d instanceof Date) || isNaN(d)) return '—';
  const h = d.getHours(), m = d.getMinutes();
  return m === 0 ? `${h} horas em ponto` : `${h} e ${String(m).padStart(2, '0')}`;
}

/*
POSIÇÃO EM GRAUS E MINUTOS, que é como se anota no diário de bordo. Décimos de
minuto (185 m) são detalhe de tela: no ouvido eles só fazem a frase crescer.
*/
function falarCoord(lat, lng) {
  const um = (v, pos, neg) => {
    const a = Math.abs(Number(v) || 0);
    const g = Math.floor(a);
    const min = Math.round((a - g) * 60);
    // 59,6' arredonda para 60 — tem de virar o grau, não dizer "60 minutos".
    const [gg, mm] = min === 60 ? [g + 1, 0] : [g, min];
    return `${gg} graus e ${mm} ${(Number(v) || 0) < 0 ? neg : pos}`;
  };
  return `${um(lat, 'norte', 'sul')}, ${um(lng, 'leste', 'oeste')}`;
}

/*
════════════════════════════════════════════════════════════════════════════════
  A CARACTERÍSTICA DO FAROL, DITA COMO SE DIZ — e não soletrada
════════════════════════════════════════════════════════════════════════════════
  `Fl(3) W 15s` é notação de CARTA: densa de propósito, para caber ao lado do
  símbolo. Jogada num sintetizador, sai "efe éle abre parênteses três fecha
  parênteses dábliu quinze ésse" — e o vigia não faz ideia do que procurar no
  horizonte.

  Mas todo navegante sabe LER isso em voz alta, e sempre soube:

      Fl(3) W 15s   ->  "três lampejos brancos a cada 15 segundos"
      LFl W 30s     ->  "lampejo longo branco a cada 30 segundos"
      Oc(2) R 6s    ->  "duas ocultações vermelhas a cada 6 segundos"
      Iso G 4s      ->  "isofásico verde a cada 4 segundos"

  A segunda forma é a que o olho de quem está de quarto consegue COMPARAR com
  o que vê lá fora. É a diferença entre transmitir dado e transmitir
  informação — e não custa nada além de uma tabela.
*/
/*
CONCORDÂNCIA IMPORTA — são palavras DITAS no passadiço, não uma etiqueta.

A primeira versão desta tabela dizia "dois ocultações vermelhos" e "luz fixa
vermelho". Ocultação é palavra feminina; luz também. Um assistente que fala
errado perde autoridade na terceira frase, e autoridade é o que faz o
comandante ouvir o aviso de fora de rumo quando ele vier.

Por isso cada ritmo carrega o próprio GÊNERO, e a cor concorda com ele.
*/
const REL_RITMO = {
  'LFl': { s: 'lampejo longo', p: 'lampejos longos', g: 'm' },
  'Fl':  { s: 'lampejo',       p: 'lampejos',        g: 'm' },
  'Oc':  { s: 'ocultação',     p: 'ocultações',      g: 'f' },
  'Iso': { s: 'isofásico',     p: 'isofásicos',      g: 'm' },
  'VQ':  { s: 'cintilante rápido', p: 'cintilantes rápidos', g: 'm' },
  'Q':   { s: 'cintilante',    p: 'cintilantes',     g: 'm' },
  'Mo':  { s: 'morse',         p: 'morse',           g: 'm' },
  'Al':  { s: 'alternante',    p: 'alternantes',     g: 'm' },
  'F':   { s: 'luz fixa',      p: 'luzes fixas',     g: 'f' }
};
const REL_CORES = {
  W:  { m: 'branco',   f: 'branca' },
  R:  { m: 'vermelho', f: 'vermelha' },
  G:  { m: 'verde',    f: 'verde' },
  Y:  { m: 'amarelo',  f: 'amarela' },
  Bu: { m: 'azul',     f: 'azul' }
};
/* Mo(A) é código morse: a letra vira o alfabeto fonético, que é como se diz
   no rádio e como está na Lista de Faróis. */
const REL_FONETICO = { A: 'alfa', B: 'bravo', C: 'charlie', D: 'delta', K: 'kilo',
                       N: 'november', R: 'romeu', U: 'uniform' };

function falarCaracteristica(c) {
  const txt = String(c || '').trim();
  if (!txt) return '';
  // Ritmo, grupo (dígitos ou letra do morse), cor e período.
  // Aceita "Fl(3) W 15s" e "Fl(3)W 15s" — a base da DHN tem as duas grafias.
  const m = /^([A-Za-z]+)\s*(?:\(([0-9A-Za-z+]+)\))?\s*([A-Za-z]{1,2})?\s*(?:(\d+)\s*s)?/.exec(txt);
  if (!m) return txt;
  const r = REL_RITMO[m[1]];
  if (!r) return txt;                       // notação que não conheço: diz como está

  const grupo = m[2] || '';
  const n = /^\d+$/.test(grupo) ? parseInt(grupo, 10) : 1;
  const corObj = REL_CORES[m[3]];
  const seg = m[4] ? parseInt(m[4], 10) : null;

  let out;
  if (m[1] === 'Mo') {
    const letra = REL_FONETICO[grupo.toUpperCase()] || grupo.toLowerCase();
    out = letra ? `morse ${letra}` : 'morse';
  } else {
    // Em português só UM e DOIS flexionam em gênero. "dois ocultações" foi o
    // último resíduo da primeira versão desta tabela.
    const numeral = (n === 2 && r.g === 'f') ? 'duas' : (IARA_DIGITOS[n] || String(n));
    out = n > 1 ? `${numeral} ${r.p}` : r.s;
  }
  if (corObj) out += ' ' + (n > 1 && m[1] !== 'Mo'
    ? (r.g === 'f' ? corObj.f + 's' : corObj.m + 's')
    : corObj[r.g]);
  // "a cada 1 segundos" não é português; e um segundo exato existe (cintilantes).
  if (seg) out += ` a cada ${seg} ${seg === 1 ? 'segundo' : 'segundos'}`;
  return out;
}

/* Duração falada: "2 horas e 20" — sem segundos, que ninguém usa de viva voz. */
function falarDuracao(horas) {
  const h = Number(horas);
  if (!isFinite(h) || h < 0) return '—';
  const tot = Math.round(h * 60), hh = Math.floor(tot / 60), mm = tot % 60;
  if (hh === 0) return `${mm} minutos`;
  if (mm === 0) return hh === 1 ? '1 hora' : `${hh} horas`;
  return `${hh} ${hh === 1 ? 'hora' : 'horas'} e ${mm}`;
}

// ═══════════════════════════════════════════════════════════════════════
// AS REGRAS DE EXCEÇÃO — o que entra no relatório e o que fica de fora
// ═══════════════════════════════════════════════════════════════════════

/*
FORA DE ROMO: 0,1 NM É O PISO, E ELE TEM ORIGEM.

O GPS de um tablet acerta a posição em uns 5 a 10 metros. 0,1 NM são 185 m —
uma ordem de grandeza acima do ruído, então o que passa desse valor é desvio
de verdade, não tremor de antena. Abaixo disso, anunciar seria ensinar o
comandante a ignorar o aviso.

E 0,3 NM (o mesmo raio de chegada que o app já usa para trocar de perna) marca
a fronteira do que merece PREOCUPAÇÃO, não só menção.
*/
const REL_XTE_MENCIONA_NM = 0.1;
const REL_XTE_PREOCUPA_NM = 0.3;

function deveDizerXte(xteNM) {
  const x = Math.abs(Number(xteNM));
  if (!isFinite(x)) return { dizer: false, preocupa: false };
  return { dizer: x >= REL_XTE_MENCIONA_NM, preocupa: x >= REL_XTE_PREOCUPA_NM };
}

/*
FAROL: SÓ QUANDO PODE SER VISTO DAQUI.

Anunciar "farol de Cabo Frio a 60 milhas" é informação inútil — e pior, gera o
hábito de ignorar. O critério é o ALCANCE EFETIVO, que o app já calcula: o
menor entre o alcance luminoso e o geográfico, e o geográfico depende da altura
do olho de QUEM ESTÁ OLHANDO. Ou seja, o farol entra no relatório exatamente
quando ele começa a poder aparecer no horizonte deste passadiço.
*/
function deveDizerFarol(farol) {
  if (!farol) return false;
  const d = Number(farol.distNM), a = Number(farol.alcanceNM);
  return isFinite(d) && isFinite(a) && a > 0 && d <= a;
}

/*
COMBUSTÍVEL: DE QUATRO EM QUATRO HORAS, OU NA HORA EM QUE FALTA.

Consumo não muda de hora para hora a ponto de merecer ser dito toda vez — mas
"o saldo não fecha a rota restante" merece ser dito no instante em que se
descobre, e por isso fura a cadência.
*/
const REL_COMBUSTIVEL_A_CADA = 4;

/* Correção de ETA abaixo de 10 min sobre a rota inteira cabe na incerteza do
   próprio modelo — anunciá-la seria dar ares de precisão a um palpite. */
const REL_ETA_MENCIONA_MIN = 10;

/*
QUANDO O CONSELHO DE ROTAÇÃO VIRA FALA.

Economia abaixo de 3% do que se gastaria na rotação atual não merece
interromper ninguém: está dentro da incerteza do próprio modelo, e assistente
que pede para mexer na máquina por 2% vira o alarme que se aprende a ignorar.

A exceção é o sentido CONTRÁRIO: quando o relógio exige MAIS rotação, ela fala
sempre — porque aí não é economia, é o ETA escapando, e isso o comandante
precisa ouvir mesmo que a diferença seja pequena.
*/
const REL_RPM_ECONOMIA_PCT = 0.03;

function deveDizerCombustivel(sequencia, saldoInsuficiente) {
  if (saldoInsuficiente) return true;
  const n = Number(sequencia);
  return isFinite(n) && n >= 1 && ((n - 1) % REL_COMBUSTIVEL_A_CADA === 0);
}

// ═══════════════════════════════════════════════════════════════════════
// OS RELATÓRIOS
// ═══════════════════════════════════════════════════════════════════════

/*
A ABERTURA DE SIMULAÇÃO — sem exceção e sem jeito de desligar.

Na v2.3.3 o painel mostrou "628.616 L de perda por desvio" porque o simulador
estava ligado ao lado do botão mais usado, contaminando os contadores reais.
Dizer números simulados EM VOZ ALTA, com o aplomb de uma assistente, sem
avisar que são simulados, é a forma mais perigosa desse mesmo defeito: voz
convence mais que tela, e não deixa rastro para reler.
*/
function prefixoSimulacao(simulando) {
  return simulando ? 'Atenção: isto é simulação, não é a navegação real. ' : '';
}

/*
════════════════════════════════════════════════════════════════════════════════
  ORÇAMENTO DE FALA — o que fazer quando TUDO merece ser dito
════════════════════════════════════════════════════════════════════════════════
  Este mecanismo nasceu de uma medição, não de uma ideia. Com o Sprint 4 o
  relatório passou a ter QUINZE fontes de exceção — fora de rumo, farol,
  combustível, vento, rajada, mar, corrente, barômetro, rotação, carga do
  motor, referência de terra, ETA da rota… No pior caso realista, todas
  dispararam juntas e o resultado foram 58 SEGUNDOS de monólogo. O teto era 30.

  Cortar frase por frase não resolveria: o problema não é uma frase longa, é a
  soma de quinze coisas legítimas. E a saída errada seria subir o teto — um
  relatório de um minuto no passadiço não é informação, é ruído com autoridade.

  A saída é ORÇAMENTO COM PRIORIDADE:

    1. cada trecho nasce com uma prioridade de BORDO, não de sprint;
    2. o que não couber no teto é cortado, do menos urgente para cima;
    3. a espinha (hora, posição, rumo, waypoint) NUNCA é cortada;
    4. se algo foi cortado, ela DIZ — porque calar sem avisar é pior que
       falar demais: o comandante precisa saber que há mais no painel.

  A ORDEM DE PRIORIDADE É DE PASSADIÇO, e por isso o conselho de rotação —
  que é a entrega deste sprint — fica em penúltimo. Economia de combustível é
  valiosa e nunca é urgente; "você está fora de rumo" e "o barômetro está
  caindo" são. E o conselho continua inteiro no painel, onde se lê com calma.
*/
const REL_PRIORIDADE = {
  // Espinha — nunca cortada (prioridade 0).
  simulacao: 0, hora: 0, posicao: 0, rumo: 0, 'sem-gps': 0,
  'proximo-wp': 0, eta: 0, 'sem-rota': 0, chegada: 0, 'nova-perna': 0, 'fim-de-rota': 0,
  // Segurança.
  'xte-preocupa': 1, 'corrente-impossivel': 1, 'perna-impossivel': 1, 'rpm-aviso': 1,
  /*
  RESSONÂNCIA E GM CAINDO SÃO SEGURANÇA, e vêm na frente de tudo que não é a
  espinha. Balanço síncrono e paramétrico derrubam navio; GM que baixou sem
  ninguém notar é o que emborca rebocador. Nenhum dos dois espera a vez atrás
  de um relatório de consumo.
  */
  'ressonancia': 1, 'gm-caindo': 1,
  'mar-medido': 6, 'gm': 7,
  // Máquinas: o chefe quer saber, e ninguém mais vai lhe contar.
  'carga-pesado': 2, 'carga-leve': 4,
  // Tempo piorando.
  // Barômetro caindo sobe para 2: vidro descendo é deterioração de verdade,
  // e vale mais que o número de uma rajada isolada.
  'barometro-atencao': 2, rajada: 3,
  // Situação.
  farol: 5, 'corrente-atrapalha': 5, 'corrente-ajuda': 7, xte: 6,
  vento: 6, mar: 6,
  // Economia e contexto: valiosos, nunca urgentes.
  'rpm-reduzir': 8, 'rpm-aumentar': 3, 'eta-rota-perde': 8, 'eta-rota-ganha': 9,
  combustivel: 7, 'combustivel-alerta': 2,
  referencia: 6, 'referencia-mudou': 8, barometro: 9, idade: 9
};

/*
Monta a fala respeitando o teto. Corta por prioridade, mas EMITE NA ORDEM DE
LEITURA — um relatório que embaralha a ordem para caber fica incompreensível
mesmo cabendo.
*/
function montarFalaComOrcamento(segmentos, tetoS) {
  const segs = (segmentos || []).filter(x => x && x.texto);
  const teto = Number(tetoS) || REL_TETO_S.excecional;
  const prio = k => REL_PRIORIDADE[k] == null ? 5 : REL_PRIORIDADE[k];

  let vivos = segs.slice();
  let cortados = [];
  const junta = lista => lista.map(x => x.texto).join(' ');

  while (vivos.length && duracaoFaladaS(junta(vivos)) > teto) {
    // Acha o de MENOR urgência (maior número). Empate: o mais longo primeiro,
    // porque cortar o longo libera mais segundos por corte e preserva mais
    // itens no total.
    let pior = -1, piorPrio = -1, piorTam = -1;
    for (let i = 0; i < vivos.length; i++) {
      const pp = prio(vivos[i].chave);
      if (pp === 0) continue;                       // espinha não se corta
      if (pp > piorPrio || (pp === piorPrio && vivos[i].texto.length > piorTam)) {
        pior = i; piorPrio = pp; piorTam = vivos[i].texto.length;
      }
    }
    if (pior < 0) break;                            // só sobrou espinha
    cortados.push(vivos[pior].chave);
    vivos.splice(pior, 1);
  }

  let texto = junta(vivos);
  /* CORTAR EM SILÊNCIO SERIA PIOR QUE FALAR DEMAIS. Quem ouve precisa saber
     que houve mais — senão confia num retrato incompleto sem saber que é. */
  if (cortados.length) texto += ` Tem mais ${cortados.length} no painel.`;
  return { texto: texto.trim(), partes: vivos.map(x => x.chave), cortados };
}

/*
O RETRATO DE HORA EM HORA.

Recebe um estado já montado (nada de globais aqui dentro — é função pura, e é
o que a bancada consegue provar sem GPS, sem rota e sem alto-falante).
Devolve o texto e a lista de partes que entraram, para a prova poder conferir
NÃO SÓ o que foi dito, mas o que foi deliberadamente omitido.
*/
function montarRelatorioHora(e) {
  const s = e || {};
  /*
  SEGMENTOS, NÃO CONCATENAÇÃO. Cada trecho nasce identificado e separado para
  que o orçamento possa cortar por prioridade. A versão anterior grudava tudo
  numa string e, quando o Sprint 4 somou a décima quinta exceção, não havia
  como remover uma frase sem remover todas.
  */
  const seg = [];
  const pus = (chave, texto) => { if (texto) seg.push({ chave, texto: texto.trim() }); };

  if (s.simulacao) pus('simulacao', prefixoSimulacao(true));

  // 1. A hora, que ancora o retrato no tempo.
  pus('hora', `${falarHora(s.quando)}.`);

  // 2. Posição, rumo e velocidade: o tripé.
  if (isFinite(s.lat) && isFinite(s.lng)) pus('posicao', `Posição ${falarCoord(s.lat, s.lng)}.`);
  if (isFinite(s.cog) && isFinite(s.sog)) pus('rumo', `Rumo ${falarRumo(s.cog)}, ${falarNos(s.sog)}.`);
  else pus('sem-gps', 'Ainda sem rumo e velocidade do GPS.');

  // 3. Para onde vamos — a pergunta que o comandante faz primeiro.
  const wp = s.proxWp;
  if (wp && wp.nome && isFinite(wp.distNM)) {
    pus('proximo-wp', `Próximo waypoint ${wp.nome}, ${falarNum(wp.distNM)} milhas, marcação ${falarRumo(wp.brg)}.`);
    if (wp.eta instanceof Date && !isNaN(wp.eta)) pus('eta', `Chegada prevista ${falarHora(wp.eta)}.`);
  } else {
    pus('sem-rota', 'Sem rota planejada no momento.');
  }

  // 4. EXCEÇÃO — fora de rumo.
  const x = deveDizerXte(s.xteNM);
  if (x.dizer) {
    const lado = s.xteLado || (Number(s.xteNM) < 0 ? 'bombordo' : 'boreste');
    pus(x.preocupa ? 'xte-preocupa' : 'xte',
        x.preocupa ? `Atenção: ${falarNum(Math.abs(s.xteNM), 2)} milhas fora de rumo, pra ${lado}.`
                   : `Fora de rumo ${falarNum(Math.abs(s.xteNM), 2)} milhas pra ${lado}.`);
  }

  // 5. EXCEÇÃO — farol avistável daqui.
  if (deveDizerFarol(s.farol)) {
    const car = falarCaracteristica(s.farol.caracteristica);
    pus('farol', `Farol ${s.farol.nome} no alcance, ${falarNum(s.farol.distNM)} milhas` + (car ? `, ${car}.` : '.'));
  }

  // 6. EXCEÇÃO — combustível.
  const cb = s.combustivel;
  if (cb && deveDizerCombustivel(s.sequencia, cb.insuficiente)) {
    let t6 = `Consumidos ${Math.round(cb.usadoL)} litros`;
    if (isFinite(cb.restanteL)) t6 += `, restam ${Math.round(cb.restanteL)}`;
    t6 += '.';
    if (cb.insuficiente) t6 += ' O saldo não fecha a rota que falta — vale conferir.';
    pus(cb.insuficiente ? 'combustivel-alerta' : 'combustivel', t6);
  }

  // 6.5. EXCEÇÃO — a cidade mais próxima MUDOU: marco de singradura.
  const refRedundante = s.referencia && s.proxWp && s.proxWp.nome &&
    s.referencia.toLowerCase().startsWith(String(s.proxWp.nome).toLowerCase());
  if (s.referenciaMudou && s.referencia && !refRedundante) {
    pus('referencia-mudou', `Agora a referência mais próxima é ${s.referencia}.`);
  }

  // 7. EXCEÇÃO — o tempo. falarTempo() já filtra o que não merece frase.
  if (s.tempo) {
    const bt = falarTempo(s.tempo);
    // Cada parte do tempo vira um segmento próprio, para o orçamento poder
    // cortar a rajada e manter o vento, em vez de perder os dois juntos.
    (bt.segmentos || (bt.texto ? [{ chave: 'vento', texto: bt.texto }] : []))
      .forEach(x2 => pus(x2.chave, x2.texto));
    if (s.tempo.correnteImpossivel) pus('corrente-impossivel', `Atenção: ${s.tempo.correnteImpossivel}.`);
  }

  // 7.5. EXCEÇÃO — o conselho de rotação (a conta vive em consumo.js).
  if (s.rotacao && s.rotacao.faixa) {
    const f = s.rotacao.faixa;
    const gastoAtual = (f.atual && f.atual.litros) || 0;
    const vale = f.recomendacao === 'aumentar' ||
      (f.recomendacao === 'reduzir' && gastoAtual > 0 &&
       f.economiaL / gastoAtual >= REL_RPM_ECONOMIA_PCT);
    if (vale && f.recomendacao === 'reduzir') {
      let t7 = `Dá pra fazer o horário com ${f.rpmSugerido} rotações: economiza ${Math.round(f.economiaL)} litros`;
      t7 += f.atrasoMin > 1 ? `, chegando ${falarDuracao(f.atrasoMin / 60)} mais tarde.` : '.';
      pus('rpm-reduzir', t7);
    } else if (vale) {
      pus('rpm-aumentar', `Com ${f.atual ? f.atual.rpm : 'essa'} rotação você não fecha o horário. ${f.rpmSugerido} fecham.`);
    }
    const aviso = f.avisos && f.avisos[0];
    if (aviso && aviso.tipo !== 'carga-baixa') pus('rpm-aviso', `${aviso.texto}.`);
    if (s.rotacao.carga && s.rotacao.carga.texto) {
      pus('carga-' + s.rotacao.carga.situacao, `${s.rotacao.carga.texto}.`);
    }
  }

  /*
  7.8. EXCEÇÃO — o que os sensores mediram.

  Ressonância e queda de GM falam SEMPRE: são os dois caminhos pelos quais um
  rebocador emborca, e nenhum deles avisa duas vezes. O estado de mar medido e
  o GM de rotina falam só quando saem do comum — mar que o modelo não previu,
  ou GM fora da faixa confortável.
  */
  if (s.mar && s.mar.pronto) {
    const m = s.mar;
    if (m.ressonancia) pus('ressonancia', `Atenção: ${m.ressonancia.texto}.`);
    if (m.tendenciaGm && m.tendenciaGm.caindo) pus('gm-caindo', `Atenção: ${m.tendenciaGm.texto}.`);
    /* O mar medido só vira frase quando DISCORDA do modelo em mais de 30%.
       Repetir de hora em hora um número que confirma a previsão é exatamente
       o tipo de ruído que faz parar de escutar. */
    if (isFinite(m.HsPrevisto) && m.HsPrevisto > 0.3) {
      const razao = m.Hs / m.HsPrevisto;
      if (razao < 0.7 || razao > 1.3) {
        pus('mar-medido', `O modelo diz ${falarNum(m.HsPrevisto)} metros e o barco está sentindo ` +
                          `${falarNum(m.Hs)}.`);
      }
    }
  }

  // 8. EXCEÇÃO — o ETA da rota corrigido pela corrente.
  if (s.etaRota && isFinite(s.etaRota.ganhoHoras) && Math.abs(s.etaRota.ganhoHoras) * 60 >= REL_ETA_MENCIONA_MIN) {
    const g = s.etaRota.ganhoHoras;
    pus(g > 0 ? 'eta-rota-ganha' : 'eta-rota-perde',
        g > 0 ? `Com a corrente a favor, a rota inteira sai ${falarDuracao(g)} mais cedo do que o plano.`
              : `A corrente cobra ${falarDuracao(-g)} a mais na rota inteira.`);
  }
  if (s.etaRota && s.etaRota.impossiveis && s.etaRota.impossiveis.length) {
    const im = s.etaRota.impossiveis[0];
    pus('perna-impossivel', `Atenção na perna para ${im.nome}: ${im.motivo}.`);
  }

  const r = montarFalaComOrcamento(seg, REL_TETO_S.excecional);
  return { texto: r.texto, partes: r.partes, cortados: r.cortados, prioridade: 'rotina' };
}

/*
CHEGADA A WAYPOINT — o momento em que o relatório de rotina não serve.

Aqui o comandante quer duas coisas, e só: confirmação de que a perna fechou, e
os números da perna nova. Posição e combustível não interessam neste instante —
ele está guinando.
*/
function montarRelatorioWaypoint(e) {
  const s = e || {};
  const partes = [];
  let t = prefixoSimulacao(s.simulacao);
  if (s.simulacao) partes.push('simulacao');

  t += `Chegamos em ${s.wpAlcancado || 'o waypoint'}. `;
  partes.push('chegada');

  /* A REFERÊNCIA DE TERRA, AQUI E NÃO NO RELATÓRIO DE ROTINA.
     Um waypoint costuma ter nome de rota ("WP 3", "Ponto Alfa") que não diz
     onde é. É na chegada que interessa saber a que altura da costa se está —
     e é essa a frase que vai pelo rádio quando alguém pergunta a posição. */
  if (s.referencia) { t += `${s.referencia}. `; partes.push('referencia'); }

  const wp = s.proxWp;
  if (wp && wp.nome && isFinite(wp.distNM)) {
    t += `Nova perna pra ${wp.nome}: rumo ${falarRumo(wp.brg)}, ${falarNum(wp.distNM)} milhas`;
    if (wp.eta instanceof Date && !isNaN(wp.eta)) t += `, chegada ${falarHora(wp.eta)}`;
    t += '. ';
    partes.push('nova-perna');
  } else {
    t += 'Era o último waypoint da rota. Boa chegada, comandante! ';
    partes.push('fim-de-rota');
  }
  return { texto: t.trim(), partes, prioridade: 'evento' };
}

// ═══════════════════════════════════════════════════════════════════════
// COLETA DO ESTADO E AGENDAMENTO — a parte que toca nas globais
// ═══════════════════════════════════════════════════════════════════════

/*
DOIS TETOS, E O SEGUNDO NÃO É DESLEIXO.

Medido: o relatório típico (hora, posição, rumo, próximo waypoint, ETA) leva
14 s. Com as três exceções disparando juntas — fora de rumo, farol à vista e
combustível — chega a 23 s.

Poderia forçar tudo em 15 s cortando conteúdo. Não faço, e a razão é de bordo:
quando três coisas merecem atenção AO MESMO TEMPO, é exatamente a hora em que
o comandante quer ouvir as três. Um relatório que se cala sobre o farol porque
"já falou demais" troca um incômodo por um risco.

O que os tetos garantem é que o caso COMUM continue curto — e é o comum que
determina se alguém ainda escuta no terceiro dia de viagem.
*/
const REL_TETO_S = { tipico: 15, excecional: 30, waypoint: 20 };

let relSequencia = 0;           // qual relatório é este
let relUltimaLeg = null;        // para detectar a troca de perna
let relUltimaCidade = null;     // para detectar o marco de singradura
let relTimer = null;
let relHistorico = [];          // ver nota sobre o Sprint 5, abaixo

/* Monta o estado do momento a partir do app. Tudo com recuo: um relatório
   incompleto é melhor que uma exceção que mata o agendador. */
function estadoAtualParaRelatorio() {
  const e = {
    quando: new Date(),
    simulacao: (typeof navSimActive !== 'undefined') && !!navSimActive,
    sequencia: relSequencia + 1
  };
  try {
    const fix = (typeof navLastFix !== 'undefined') ? navLastFix : null;
    if (fix) { e.lat = fix.lat; e.lng = fix.lng; e.cog = fix.cog; e.sog = fix.sog; }

    const wps = (typeof waypoints !== 'undefined') ? waypoints : [];
    const leg = (typeof navActiveLeg !== 'undefined') ? navActiveLeg : 0;
    /*
    navActiveLeg é o índice do waypoint de ORIGEM da perna ativa — o app usa
    `legStart = waypoints[navActiveLeg]` e `legEnd = waypoints[navActiveLeg+1]`.
    Portanto o PRÓXIMO waypoint é o `leg + 1`, não o `leg`. Escrevi errado na
    primeira versão e o relatório teria anunciado o waypoint que já ficou pra
    trás — com distância caindo a zero e depois crescendo, o que na voz soaria
    como o barco andando de ré.
    */
    const alvo = wps[leg + 1];
    if (alvo && fix) {
      const d = calculateDistance(fix.lat, fix.lng, alvo.lat, alvo.lng);
      const b = calculateBearing(fix.lat, fix.lng, alvo.lat, alvo.lng);
      let eta = null;
      if (isFinite(fix.sog) && fix.sog > 0.5) eta = new Date(Date.now() + (d / fix.sog) * 3600000);
      e.proxWp = { nome: alvo.name, distNM: d, brg: b, eta };
    }

    // crossTrackError(lat, lng, start, end) — recebe OBJETOS nas duas pontas da
    // perna, não pares de coordenadas. Chamar com seis números devolvia NaN em
    // silêncio, e o "fora de rumo" simplesmente nunca apareceria no relatório.
    const inicio = wps[leg], fim = wps[leg + 1];
    if (fix && inicio && fim) {
      const ct = crossTrackError(fix.lat, fix.lng, inicio, fim);
      const xte = (ct && typeof ct === 'object') ? ct.xte : ct;
      if (isFinite(xte)) { e.xteNM = xte; e.xteLado = xte < 0 ? 'bombordo' : 'boreste'; }
    }

    /* Referência de terra e a detecção do marco. Guarda-se o NOME da cidade
       anterior, não a frase inteira: a distância muda a cada fixo e faria a
       frase "mudar" a cada relatório, transformando marco em ruído. */
    if (fix && typeof referenciasDoPonto === 'function') {
      const refs = referenciasDoPonto(fix.lat, fix.lng);
      e.referencia = fraseDeReferencia(refs);
      const nome = refs.cidade ? refs.cidade.nome : null;
      e.referenciaMudou = !!(nome && relUltimaCidade && nome !== relUltimaCidade);
      if (nome) relUltimaCidade = nome;
    }

    // O farol mais próximo, com o alcance efetivo DESTE passadiço.
    if (fix && typeof findNearestLighthouse === 'function') {
      const lh = findNearestLighthouse(fix.lat, fix.lng);
      if (lh && lh.lighthouse) {
        e.farol = {
          nome: lh.lighthouse.name, distNM: lh.distance,
          caracteristica: lh.lighthouse.character,
          alcanceNM: effectiveRange(lh.lighthouse)
        };
      }
    }

    /*
    O TEMPO, E A VELOCIDADE QUE ENTRA NA CONTA.                    (v2.9.0)

    O triângulo da corrente precisa da velocidade ATRAVÉS DA ÁGUA, e o GPS só
    dá velocidade no FUNDO. Usa-se a velocidade de serviço planejada da viagem
    (tripData.speedKnots) quando ela existe, porque é essa que o navio vai
    manter nas pernas que ainda não foram navegadas — que é justamente onde a
    corrente prevista tem valor. Sem plano de viagem, recorre-se à SOG do
    momento, sabendo que ali a corrente já está embutida e o ganho calculado
    será conservador.
    */
    if (typeof tempoParaRelatorio === 'function') {
      const velAgua = (typeof tripData !== 'undefined' && tripData && tripData.speedKnots > 0)
        ? tripData.speedKnots : (fix && fix.sog);
      e.tempo = tempoParaRelatorio(e.proxWp && e.proxWp.brg, velAgua);

      /*
      E O ETA DA ROTA INTEIRA, PERNA A PERNA.

      Aqui está a entrega do Sprint 2. Na perna ATUAL o GPS já sabe tudo — a
      corrente está embutida na SOG. Nas pernas QUE AINDA NÃO SE NAVEGOU ele
      não sabe nada, e a mesma corrente age de forma completamente diferente
      conforme o rumo: dois nós para o sul tiram dois nós de quem vai ao
      norte e quase nada de quem guina para leste no waypoint seguinte.
      */
      if (e.tempo && e.tempo.correnteEfeito && wps.length > leg + 1 && isFinite(velAgua)) {
        const pernas = [];
        let de = fix ? { lat: fix.lat, lng: fix.lng } : wps[leg];
        for (let i = leg + 1; i < wps.length; i++) {
          const para = wps[i];
          pernas.push({ nome: para.name,
                        rumo: calculateBearing(de.lat, de.lng, para.lat, para.lng),
                        distNM: calculateDistance(de.lat, de.lng, para.lat, para.lng) });
          de = para;
        }
        e.etaRota = etaComCorrente(pernas, velAgua, {
          setGraus: e.tempo.correnteEfeito.setGraus, driftNos: e.tempo.correnteEfeito.driftNos
        });
      }
    }

    /* O conselho de rotação e, de quebra, a amostra que ensina a curva deste
       casco. Uma amostra POR RELATÓRIO, não por fixo: mil pontos do mesmo
       minuto de máquina dariam à mediana uma confiança que ela não tem. */
    if (typeof estadoDoMarMedido === 'function') {
      e.mar = estadoDoMarMedido(fix && fix.sog, e.proxWp && e.proxWp.brg);
    }

    if (typeof conselhoDeRotacao === 'function') {
      e.rotacao = conselhoDeRotacao();
      if (typeof colherAmostraDeMaquina === 'function' && fix &&
          typeof tripData !== 'undefined' && tripData) {
        colherAmostraDeMaquina(fix.sog, tripData.fuelConsumption);
      }
    }

    if (typeof tripData !== 'undefined' && tripData && typeof navAccumFuel !== 'undefined') {
      const restante = tripData.fuelInitial - navAccumFuel;
      const porNM = tripData.speedKnots > 0 ? tripData.fuelConsumption / tripData.speedKnots : 0;
      const faltaNM = (e.proxWp && e.proxWp.distNM) || 0;
      e.combustivel = {
        usadoL: navAccumFuel, restanteL: restante,
        insuficiente: restante < 0 || (porNM > 0 && restante < faltaNM * porNM)
      };
    }
  } catch (err) { console.warn('relatório: estado incompleto —', err && err.message); }
  return e;
}

/*
O HISTÓRICO — e por que ele guarda um campo que ainda não é usado.

Cada relatório fica registrado. Isso serve ao espelho, ao diário de bordo e,
sobretudo, ao Sprint 5: a comparação entre a onda MEDIDA pelos sensores e a
onda PREVISTA pelo modelo só tem valor se houver série temporal. Dado que não
foi gravado hoje não volta amanhã — por isso o campo `onda` já nasce no
registro, vazio, esperando o Sprint 5. Custa um `null` e evita perder meses.
*/
const REL_HISTORICO_MAX = 240;   // 10 dias de relatórios horários

function registrarRelatorio(e, r) {
  relHistorico.push({
    t: (e.quando || new Date()).toISOString(),
    lat: e.lat, lng: e.lng, cog: e.cog, sog: e.sog,
    wp: e.proxWp ? e.proxWp.nome : null,
    ref: e.referencia || null,
    // Rotação e carga informadas: é a série que, relida depois, permite
    // reconstruir a curva real do casco fora do app.
    rpm: (typeof maqRpm !== 'undefined') ? maqRpm : null,
    carga: (typeof maqCarga !== 'undefined') ? maqCarga : null,
    xte: e.xteNM, sim: !!e.simulacao,
    partes: r.partes,
    /* O CAMPO RESERVADO NO SPRINT 1 SE PREENCHE AQUI. A nota de lá dizia que
       a comparação entre onda medida e prevista só tem valor com série
       temporal, e que dado não gravado hoje não volta amanhã. Três sprints
       depois, o `null` virou observação. */
    onda: (e.mar && e.mar.pronto)
      ? { Hs: e.mar.Hs, Tz: e.mar.Tz, Tp: e.mar.Tp,
          jogo: e.mar.balanco ? e.mar.balanco.amplitudeGraus : null,
          Troll: e.mar.balanco ? e.mar.balanco.periodoS : null,
          gm: e.mar.gm ? e.mar.gm.gm : null,
          HsPrevisto: e.mar.HsPrevisto }
      : null,
    // O campo reservado no Sprint 1 agora é preenchido. Guarda-se o dado
    // BRUTO do modelo, não a frase: a frase se regenera, a observação não.
    tempo: e.tempo ? { ar: e.tempo.ar, mar: e.tempo.mar,
                       idadeMin: e.tempo.idade && e.tempo.idade.minutos } : null
  });
  if (relHistorico.length > REL_HISTORICO_MAX) relHistorico = relHistorico.slice(-REL_HISTORICO_MAX);
  try { localStorage.setItem('cnb_rel_historico', JSON.stringify(relHistorico.slice(-48))); } catch (err) { }
}

/* Emite um relatório: monta, fala, registra e manda para quem está em terra. */
function emitirRelatorio(tipo, extra) {
  const e = Object.assign(estadoAtualParaRelatorio(), extra || {});
  const r = tipo === 'waypoint' ? montarRelatorioWaypoint(e) : montarRelatorioHora(e);
  if (tipo !== 'waypoint') relSequencia++;
  registrarRelatorio(e, r);
  if (typeof iaraDizer === 'function') iaraDizer(r.texto, r.prioridade);
  // O espelho em terra ouve o mesmo relatório — de graça, pelo canal que já existe.
  relUltimoTexto = r.texto;
  relUltimoEm = Date.now();
  return r;
}

let relUltimoTexto = '';
let relUltimoEm = 0;

/* O que segue no pacote de telemetria para o observador. */
function relatorioParaEspelho() {
  if (!relUltimoTexto) return null;
  return { txt: relUltimoTexto, t: relUltimoEm };
}

/*
AGENDAMENTO NA HORA CHEIA — e não "a cada 60 minutos".

Diferença que parece cosmética e não é. Um temporizador de 60 em 60 minutos
dispara às 14h07, 15h07, 16h07 — e o relatório deixa de casar com o registro do
diário de bordo, que é feito na hora cheia. Alinhar na hora cheia faz o
relatório falado e o diário escrito contarem a mesma história, na mesma linha
do tempo. Quem já reconstituiu uma viagem depois sabe o quanto isso vale.
*/
function agendarProximaHora() {
  if (relTimer) clearTimeout(relTimer);
  const agora = new Date();
  const proxima = new Date(agora);
  proxima.setHours(agora.getHours() + 1, 0, 0, 0);
  relTimer = setTimeout(() => { emitirRelatorio('hora'); agendarProximaHora(); },
                        proxima.getTime() - agora.getTime());
  return proxima;
}

/*
TROCA DE PERNA. O app já avança navActiveLeg sozinho quando entra no raio de
chegada; aqui só se observa a mudança. Observar em vez de decidir evita duas
fontes de verdade sobre "chegamos" — e duas fontes de verdade sempre divergem.
*/
function verificarTrocaDePerna() {
  if (typeof navActiveLeg === 'undefined') return;
  if (relUltimaLeg === null) { relUltimaLeg = navActiveLeg; return; }
  if (navActiveLeg === relUltimaLeg) return;
  const wps = (typeof waypoints !== 'undefined') ? waypoints : [];
  const alcancado = wps[relUltimaLeg];
  relUltimaLeg = navActiveLeg;
  emitirRelatorio('waypoint', { wpAlcancado: alcancado ? alcancado.name : null });
}

/* Liga os relatórios ao começar a navegar; desliga ao parar. */
function iniciarRelatorios() {
  relSequencia = 0;
  relUltimaLeg = null;
  relUltimaCidade = null;
  try {
    const g = localStorage.getItem('cnb_rel_historico');
    if (g) relHistorico = JSON.parse(g) || [];
  } catch (e) { relHistorico = []; }
  agendarProximaHora();
  return true;
}

function pararRelatorios() {
  if (relTimer) { clearTimeout(relTimer); relTimer = null; }
}
