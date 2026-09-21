/*
════════════════════════════════════════════════════════════════════════════════
  TEMPO, VENTO E CORRENTE — o que o modelo sabe e o GPS não pode saber
════════════════════════════════════════════════════════════════════════════════
  Versão: 1.0.0  ·  Autor: Jossian Brito (Charlie Bravo)  ·  2026-09-20 19:40 UTC
  SPRINT 2 — Open-Meteo pelo proxy, e a aritmética náutica que dá sentido a ele.

  MODIFICAÇÕES DESTA VERSÃO (1.0.0 — app v2.9.0)
    + nosDeKmh, rumoCardeal, beaufort      unidades e vocabulário de bordo
    + trianguloDaCorrente()                proa a governar e SOG resultante
    + etaComCorrente()                     ETA perna a perna, corrigido
    + tendenciaBarometrica()               a queda do barômetro, em hPa/3h
    + idadeDoTempo()                       dado velho ROTULADO como velho
    + falarTempo()                         o bloco de tempo, por exceção
    + buscarTempo()                        cliente do proxy, sem chave nenhuma

════════════════════════════════════════════════════════════════════════════════
  A PERGUNTA QUE ESTE MÓDULO PRECISA RESPONDER PARA EXISTIR
════════════════════════════════════════════════════════════════════════════════
  "Se o GPS já mede a velocidade no fundo (SOG), e a SOG JÁ CONTÉM a corrente,
   para que serve a corrente prevista?"

  A objeção é boa e quase mata o recurso. A resposta é a seguinte:

    Na PERNA ATUAL, o GPS já sabe tudo — a corrente está embutida na SOG e o
    modelo não acrescenta nada.

    Nas PERNAS QUE AINDA NÃO SE NAVEGOU, o GPS não sabe NADA. E aí está o
    ponto: a mesma corrente age de forma completamente diferente conforme o
    rumo da perna. Dois nós de corrente para sul tiram dois nós de quem vai
    para norte — e tiram QUASE NADA de quem, no waypoint seguinte, guina para
    leste. O GPS não pode prever isso, porque ele só mede o que já aconteceu.
    O modelo pode.

  É por isso que o ETA da rota inteira é recalculado PERNA A PERNA, cada uma
  com o seu próprio triângulo de corrente. Essa é a entrega do Sprint 2.

════════════════════════════════════════════════════════════════════════════════
  UMA ARMADILHA DE CONVENÇÃO, VERIFICADA NA DOCUMENTAÇÃO
════════════════════════════════════════════════════════════════════════════════
  As três direções que o Open-Meteo devolve NÃO seguem a mesma convenção:

    wind_direction_10m       DE onde o vento VEM   (convenção meteorológica)
    wave_direction           DE onde a onda VEM    ("always reported as the
                                                     direction the waves come from")
    ocean_current_direction  PARA onde a corrente VAI  ("where the current is
                                                         heading towards")

  Tratar a corrente como "de onde vem" inverteria o vetor em 180° e jogaria a
  correção de proa para o BORDO ERRADO — o navio sairia da derrota exatamente
  ao tentar segurá-la. Por isso `setCorrente` aqui é sempre PARA ONDE VAI, que
  é o que a Lista e a carta chamam de SET, e é o que o Open-Meteo já entrega.

  DEPENDE DE: nada do app. Este módulo é aritmética pura + um fetch.
*/

// ═══════════════════════════════════════════════════════════════════════
// UNIDADES E VOCABULÁRIO
// ═══════════════════════════════════════════════════════════════════════

/* A corrente vem em km/h: o Open-Meteo não oferece nó para essa variável
   (o vento oferece, e por isso ele já chega em nó). 1 NM = 1852 m exatos. */
function nosDeKmh(kmh) {
  /*
  A ARMADILHA DO Number(null) === 0.

  Quando o modelo não tem corrente naquele ponto (dentro de um estuário, por
  exemplo) ele devolve `null`. `Number(null)` é ZERO, não NaN — e zero é um
  valor perfeitamente finito. Sem esta guarda, "não sei qual é a corrente"
  viraria "a corrente é de zero nó", que são afirmações muito diferentes: a
  primeira manda o comandante olhar a carta de correntes, a segunda o
  tranquiliza. Ausência de dado nunca pode virar medida.
  */
  if (kmh == null || kmh === '') return NaN;
  const v = Number(kmh);
  return isFinite(v) ? v / 1.852 : NaN;
}

const TEMPO_CARDEAIS = ['norte', 'nor-nordeste', 'nordeste', 'lés-nordeste',
                        'leste', 'lés-sudeste', 'sudeste', 'su-sudeste',
                        'sul', 'su-sudoeste', 'sudoeste', 'oés-sudoeste',
                        'oeste', 'oés-noroeste', 'noroeste', 'nor-noroeste'];

/* Rumo em palavra. Na ponte ninguém diz "vento de 042 graus": diz "vento de
   nordeste". O grau serve para plotar; a palavra, para conversar. */
function rumoCardeal(graus) {
  const g = Number(graus);
  if (!isFinite(g)) return '';
  const n = ((Math.round(g / 22.5) % 16) + 16) % 16;
  return TEMPO_CARDEAIS[n];
}

/*
ESCALA BEAUFORT — porque "força 6" diz mais que "23 nós".

Um número de nós é uma medida; a força Beaufort é uma DESCRIÇÃO DO MAR que o
comandante compara com o que vê pela janela. Os limites abaixo são os da
escala em nós, e os nomes são os usados pela Marinha do Brasil.
*/
const TEMPO_BEAUFORT = [
  { max: 0.9, f: 0, nome: 'calmaria' },      { max: 3.4, f: 1, nome: 'bafagem' },
  { max: 6.4, f: 2, nome: 'aragem' },        { max: 10.4, f: 3, nome: 'vento fraco' },
  { max: 16.4, f: 4, nome: 'vento moderado' }, { max: 21.4, f: 5, nome: 'vento fresco' },
  { max: 27.4, f: 6, nome: 'vento muito fresco' }, { max: 33.4, f: 7, nome: 'vento forte' },
  { max: 40.4, f: 8, nome: 'vento muito forte' },  { max: 47.4, f: 9, nome: 'vento duro' },
  { max: 55.4, f: 10, nome: 'vento muito duro' },  { max: 63.4, f: 11, nome: 'tempestade' },
  { max: Infinity, f: 12, nome: 'furacão' }
];

function beaufort(nos) {
  const v = Number(nos);
  if (!isFinite(v) || v < 0) return null;
  return TEMPO_BEAUFORT.find(b => v <= b.max);
}

// ═══════════════════════════════════════════════════════════════════════
// O TRIÂNGULO DA CORRENTE
// ═══════════════════════════════════════════════════════════════════════

/*
O PROBLEMA CLÁSSICO DA CARTA, RESOLVIDO EM VEZ DE DESENHADO.

Quero fazer bom a derrota θt. A água inteira se move na direção θc com
velocidade Vc. Meu navio anda Vb ATRAVÉS DA ÁGUA. Que proa governar, e que
velocidade vou realmente fazer no fundo?

Decompõe-se a corrente em relação à derrota desejada:

    α        = θc − θt                 ângulo da corrente em relação à derrota
    através  = Vc · sen(α)             o que me empurra PARA FORA da derrota
    ao longo = Vc · cos(α)             o que me empurra ao longo dela

Para NÃO sair da derrota, a componente através tem de ser cancelada pela
própria proa:

    Vb · sen(correção) = −Vc · sen(α)
    correção = arcsen( −Vc · sen(α) / Vb )          <- a "caranguejada"
    proa     = θt + correção
    SOG      = Vb · cos(correção) + Vc · cos(α)

CONFERÊNCIA MENTAL, que é como se valida isto na mesa:
  · derrota 000, corrente para 090 (través) a 2 nós, navio a 10:
    correção = arcsen(−2/10) = −11,5°  ->  governa 348,5°, SOG 9,8
    Caranguejeia contra a corrente e perde pouca velocidade. Certo.
  · derrota 000, corrente para 180 (de proa) a 2 nós:
    através = 0, correção = 0, SOG = 10 − 2 = 8. Certo.
  · derrota 000, corrente para 000 (de popa): SOG = 12. Certo.

E O CASO QUE IMPORTA MAIS: se |Vc·sen(α)| > Vb, o arcsen não existe. Não é
erro de conta — é o mar dizendo que ESTA DERROTA NÃO PODE SER MANTIDA com esta
velocidade. Devolver NaN em silêncio aqui seria esconder justamente a
informação mais grave que esta função pode produzir.
*/
function trianguloDaCorrente(p) {
  const o = p || {};
  const rad = Math.PI / 180, deg = 180 / Math.PI;
  const tt = Number(o.rumoDesejado), vb = Number(o.velAgua);
  const tc = Number(o.setCorrente), vc = Number(o.drift);

  if (!isFinite(tt) || !isFinite(vb) || vb <= 0) {
    return { possivel: false, motivo: 'sem rumo ou sem velocidade na água' };
  }
  // Sem corrente conhecida, a proa é a derrota e a SOG é a velocidade na água.
  if (!isFinite(tc) || !isFinite(vc) || vc <= 0) {
    return { possivel: true, proa: ((tt % 360) + 360) % 360, correcao: 0, sog: vb, ganhoNos: 0,
             atraves: 0, aoLongo: 0, semCorrente: true };
  }

  const alfa = (tc - tt) * rad;
  const atraves = vc * Math.sin(alfa);
  const aoLongo = vc * Math.cos(alfa);

  const s = -atraves / vb;
  if (Math.abs(s) > 1) {
    return { possivel: false, atraves, aoLongo,
             motivo: `a corrente atravessa ${Math.abs(atraves).toFixed(1)} nós e o navio só faz ` +
                     `${vb.toFixed(1)} na água — esta derrota não se mantém` };
  }
  const correcao = Math.asin(s) * deg;
  const sog = vb * Math.cos(correcao * rad) + aoLongo;
  return {
    possivel: true,
    proa: ((tt + correcao) % 360 + 360) % 360,
    correcao, sog,
    ganhoNos: sog - vb,          // positivo = a corrente ajuda
    atraves, aoLongo, semCorrente: false
  };
}

/*
ETA DA ROTA INTEIRA, PERNA A PERNA — a entrega do Sprint 2.

Uma única corrente aplicada a rumos diferentes produz efeitos diferentes, e é
isso que o GPS não consegue antecipar. Aqui cada perna recebe o seu próprio
triângulo.

SIMPLIFICAÇÃO DECLARADA: usa-se a MESMA corrente em todas as pernas — a que o
modelo dá na posição atual. Buscar o tempo em cada waypoint custaria uma
chamada por ponto, e numa derrota costeira de algumas dezenas de milhas a
corrente não muda tanto quanto o RUMO das pernas muda. O erro que sobra é o da
variação espacial da corrente; o erro que se ELIMINA é o de supor que ela age
igual em todos os rumos, que é muito maior.
*/
function etaComCorrente(pernas, velAgua, corrente) {
  const lista = Array.isArray(pernas) ? pernas : [];
  const vb = Number(velAgua);
  const c = corrente || {};
  const saida = { pernas: [], horas: 0, horasSemCorrente: 0, ganhoHoras: 0, impossiveis: [] };
  if (!isFinite(vb) || vb <= 0) return saida;

  for (const p of lista) {
    const d = Number(p.distNM);
    if (!isFinite(d) || d <= 0) continue;
    const tri = trianguloDaCorrente({
      rumoDesejado: p.rumo, velAgua: vb,
      setCorrente: c.setGraus, drift: c.driftNos
    });
    const hSem = d / vb;
    saida.horasSemCorrente += hSem;
    if (!tri.possivel) {
      saida.impossiveis.push({ nome: p.nome, motivo: tri.motivo });
      saida.horas += hSem;          // não dá para prever: usa o ingênuo e avisa
      saida.pernas.push({ nome: p.nome, distNM: d, possivel: false, motivo: tri.motivo });
      continue;
    }
    // SOG nula ou negativa: a corrente contrária iguala ou supera o navio.
    if (tri.sog <= 0.05) {
      saida.impossiveis.push({ nome: p.nome, motivo: 'a corrente contrária anula o avanço nesta perna' });
      saida.horas += hSem;
      saida.pernas.push({ nome: p.nome, distNM: d, possivel: false, motivo: 'sem avanço no fundo' });
      continue;
    }
    const h = d / tri.sog;
    saida.horas += h;
    saida.pernas.push({ nome: p.nome, distNM: d, possivel: true, proa: tri.proa,
                        correcao: tri.correcao, sog: tri.sog, horas: h, ganhoNos: tri.ganhoNos });
  }
  saida.ganhoHoras = saida.horasSemCorrente - saida.horas;   // positivo = chega antes
  return saida;
}

// ═══════════════════════════════════════════════════════════════════════
// O BARÔMETRO QUE O TABLET NÃO TEM
// ═══════════════════════════════════════════════════════════════════════

/*
O Galaxy Tab S10 FE NÃO TEM BARÔMETRO — verificado nas especificações antes de
desenhar isto. "O barômetro está caindo" é o mais antigo aviso de mau tempo que
existe, e neste aparelho ele não pode ser MEDIDO, só PREVISTO. A tendência sai
da série de pressure_msl que o proxy vai acumulando.

A escala é a clássica, em hPa por 3 horas. Uma queda de 3 hPa em 3 h já é
motivo de atenção num rebocador costeiro; 6 hPa em 3 h é aviso sério.
*/
const TEMPO_TENDENCIA = [
  { lim: 0.5, txt: 'estável' },
  { lim: 1.5, txt: 'variando devagar' },
  { lim: 3.5, txt: 'variando' },
  { lim: 6.0, txt: 'variando rápido' },
  { lim: Infinity, txt: 'variando muito rápido' }
];

function tendenciaBarometrica(amostras) {
  const a = (Array.isArray(amostras) ? amostras : [])
    .filter(x => x && isFinite(x.hPa) && isFinite(x.t))
    .sort((x, y) => x.t - y.t);
  if (a.length < 2) return null;
  const fim = a[a.length - 1], ini = a[0];
  const horas = (fim.t - ini.t) / 3600000;
  if (horas < 0.5) return null;                 // série curta demais para tendência
  const por3h = (fim.hPa - ini.hPa) / horas * 3;
  const mag = Math.abs(por3h);
  const escala = TEMPO_TENDENCIA.find(e => mag < e.lim) || TEMPO_TENDENCIA[TEMPO_TENDENCIA.length - 1];
  const sentido = mag < 0.5 ? '' : (por3h < 0 ? 'caindo' : 'subindo');
  return {
    hPa: fim.hPa, por3h, horas,
    sentido, texto: sentido ? escala.txt.replace('variando', sentido) : 'estável',
    // Queda de 3 hPa em 3 h num rebocador costeiro é para prestar atenção.
    atencao: por3h <= -3
  };
}

// ═══════════════════════════════════════════════════════════════════════
// IDADE DO DADO — a decisão aprovada: cache ROTULADO, não silêncio
// ═══════════════════════════════════════════════════════════════════════

/*
Quando o proxy falha, serve-se o último valor conhecido DIZENDO A IDADE, em vez
de cair no plano gratuito (que resolveria o técnico e abriria o jurídico: o
plano livre é de uso não comercial e este app roda num rebocador de trabalho).

É a prática de bordo correta, e é a mesma lógica da regra 5 da Iara — só que
aqui, em vez de descartar, ela DIZ A IDADE e o comandante decide se serve.
Dado velho rotulado como velho vale mais que dado fresco de procedência
duvidosa.
*/
const TEMPO_FRESCO_MIN = 45;      // abaixo disso não vale mencionar
const TEMPO_VELHO_MIN = 360;      // 6 h: ainda se diz, mas avisando que é velho

function idadeDoTempo(emitidoEm, agoraMs) {
  const t = Date.parse(emitidoEm);
  if (!isFinite(t)) return null;
  const agora = isFinite(agoraMs) ? agoraMs : Date.now();
  const min = Math.max(0, Math.round((agora - t) / 60000));
  return {
    minutos: min,
    fresco: min < TEMPO_FRESCO_MIN,
    velho: min >= TEMPO_VELHO_MIN,
    // Só vira frase quando merece: dado de 10 minutos não precisa de rótulo.
    rotulo: min < TEMPO_FRESCO_MIN ? ''
          : min < TEMPO_VELHO_MIN ? `dados de ${min} minutos atrás`
          : `dados de mais de ${Math.floor(min / 60)} horas — podem ter mudado`
  };
}

// ═══════════════════════════════════════════════════════════════════════
// O BLOCO FALADO — também por exceção
// ═══════════════════════════════════════════════════════════════════════

/*
Mesma disciplina do Sprint 1: o que se repete toda hora ninguém escuta.

  vento      sempre (uma frase curta) — é o que muda o dia inteiro a bordo
  rajada     só quando passa 8 nós acima da média: aí é rajada de verdade,
             e num rebocador com cabo na água isso decide manobra
  mar        só a partir de 1,5 m, ou quando o swell é longo o bastante para
             fazer o navio jogar
  corrente   só quando ela muda o avanço em 0,3 nó ou mais — abaixo disso é
             ruído do modelo e não vale a frase
  barômetro  só quando não está estável
  idade      só quando passa de 45 minutos
*/
const TEMPO_RAJADA_DELTA = 8;     // nós acima da média
const TEMPO_MAR_NM = 1.5;         // metros de altura significativa
const TEMPO_CORRENTE_NOS = 0.3;   // efeito mínimo no avanço para virar frase

function falarTempo(t) {
  const o = t || {};
  const partes = [];
  /* SEGMENTOS SEPARADOS, para o orçamento de fala do relatório poder cortar a
     rajada e manter o vento — em vez de perder os dois no mesmo bloco. */
  const segmentos = [];
  let s = '';
  const marcar = (chave, txt) => { if (txt) segmentos.push({ chave, texto: txt.trim() }); };
  let antes = '';

  const ar = o.ar || {};
  const vento = Number(ar.wind_speed_10m);
  if (isFinite(vento)) {
    const b = beaufort(vento);
    s += `Vento de ${rumoCardeal(ar.wind_direction_10m)}, ${falarNos(Math.round(vento))}`;
    // O nome Beaufort já começa com "vento" ("vento muito fresco"); repetir a
    // palavra depois de "Vento de nordeste, 24 nós" soa a máquina travada.
    s += b ? `, ${b.nome.replace(/^vento /, '')}, força ${b.f}. ` : '. ';
    partes.push('vento'); marcar('vento', s.slice(antes.length)); antes = s;
    const raj = Number(ar.wind_gusts_10m);
    if (isFinite(raj) && raj - vento >= TEMPO_RAJADA_DELTA) {
      s += `Rajadas de ${Math.round(raj)}. `;
      partes.push('rajada'); marcar('rajada', s.slice(antes.length)); antes = s;
    }
  }

  const mar = o.mar || {};
  const hs = Number(mar.wave_height);
  if (isFinite(hs) && hs >= TEMPO_MAR_NM) {
    // wave_direction é DE ONDE A ONDA VEM — convenção confirmada na
    // documentação do Open-Meteo. Dizer "para onde vai" inverteria o mar.
    s += `Mar de ${rumoCardeal(mar.wave_direction)}, ${hs.toFixed(1).replace('.', ',')} metros`;
    const per = Number(mar.wave_period);
    s += isFinite(per) ? `, período de ${Math.round(per)} segundos. ` : '. ';
    partes.push('mar'); marcar('mar', s.slice(antes.length)); antes = s;
  }

  if (o.correnteEfeito && Math.abs(o.correnteEfeito.ganhoNos) >= TEMPO_CORRENTE_NOS) {
    const g = o.correnteEfeito;
    const drift = Number(g.driftNos);
    // set = PARA ONDE a corrente vai. É o que a carta chama de SET.
    s += `Corrente ${falarNos(drift)} para ${rumoCardeal(g.setGraus)}, `;
    s += g.ganhoNos > 0
      ? `ajudando ${falarNos(g.ganhoNos)}. `
      : `tirando ${falarNos(-g.ganhoNos)} do seu avanço. `;
    partes.push(g.ganhoNos > 0 ? 'corrente-ajuda' : 'corrente-atrapalha');
    marcar(g.ganhoNos > 0 ? 'corrente-ajuda' : 'corrente-atrapalha', s.slice(antes.length)); antes = s;
  }

  if (o.barometro && o.barometro.sentido) {
    s += `Barômetro ${Math.round(o.barometro.hPa)}, ${o.barometro.texto}`;
    s += o.barometro.atencao ? ' — vale ficar de olho. ' : '. ';
    partes.push(o.barometro.atencao ? 'barometro-atencao' : 'barometro');
    marcar(o.barometro.atencao ? 'barometro-atencao' : 'barometro', s.slice(antes.length)); antes = s;
  }

  const idade = o.idade;
  if (idade && idade.rotulo) { s += `${idade.rotulo}. `; partes.push('idade'); marcar('idade', s.slice(antes.length)); }

  return { texto: s.trim(), partes, segmentos };
}

// ═══════════════════════════════════════════════════════════════════════
// CLIENTE DO PROXY — nenhuma chave passa por aqui
// ═══════════════════════════════════════════════════════════════════════

const TEMPO_URL = '/.netlify/functions/tempo';
const TEMPO_INTERVALO_MS = 15 * 60 * 1000;

let tempoAtual = null;            // último pacote bom conhecido
let tempoBarometro = [];          // série de pressão para a tendência
let tempoTimer = null;
let tempoFalhas = 0;

async function buscarTempo(lat, lng) {
  if (!isFinite(lat) || !isFinite(lng)) return null;
  try {
    const r = await fetch(`${TEMPO_URL}?lat=${lat.toFixed(4)}&lng=${lng.toFixed(4)}`);
    const j = await r.json();
    if (!j || !j.ok) throw new Error((j && j.motivo) || `HTTP ${r.status}`);
    tempoAtual = j;
    tempoFalhas = 0;
    const p = j.ar && Number(j.ar.pressure_msl);
    if (isFinite(p)) {
      tempoBarometro.push({ t: Date.parse(j.emitidoEm) || Date.now(), hPa: p });
      // 12 h de série bastam para a tendência de 3 h e não crescem sem fim.
      if (tempoBarometro.length > 48) tempoBarometro = tempoBarometro.slice(-48);
    }
    return j;
  } catch (e) {
    tempoFalhas++;
    // NÃO limpa tempoAtual: o valor velho continua servindo, rotulado com a
    // idade. É a decisão aprovada — cache rotulado em vez de silêncio.
    console.warn('tempo: falha na busca (', tempoFalhas, ') —', e && e.message);
    return null;
  }
}

/* O que o relatório consome. Já vem com idade, barômetro e efeito da corrente
   sobre a derrota atual — ou null, se nunca houve uma busca bem-sucedida. */
function tempoParaRelatorio(rumoDerrota, velAgua) {
  if (!tempoAtual) return null;
  const o = {
    ar: tempoAtual.ar, mar: tempoAtual.mar,
    idade: idadeDoTempo(tempoAtual.emitidoEm),
    barometro: tendenciaBarometrica(tempoBarometro)
  };
  const mar = tempoAtual.mar || {};
  const drift = nosDeKmh(mar.ocean_current_velocity);
  const set = Number(mar.ocean_current_direction);
  if (isFinite(drift) && drift > 0 && isFinite(set) && isFinite(rumoDerrota) && isFinite(velAgua) && velAgua > 0) {
    const tri = trianguloDaCorrente({ rumoDesejado: rumoDerrota, velAgua, setCorrente: set, drift });
    if (tri.possivel) o.correnteEfeito = { driftNos: drift, setGraus: set, ganhoNos: tri.ganhoNos,
                                           proa: tri.proa, correcao: tri.correcao, sog: tri.sog };
    else o.correnteImpossivel = tri.motivo;
  }
  return o;
}

function iniciarTempo(obterPosicao) {
  const tique = () => {
    const p = typeof obterPosicao === 'function' ? obterPosicao() : null;
    if (p && isFinite(p.lat) && isFinite(p.lng)) buscarTempo(p.lat, p.lng);
  };
  tique();
  if (tempoTimer) clearInterval(tempoTimer);
  tempoTimer = setInterval(tique, TEMPO_INTERVALO_MS);
}

function pararTempo() { if (tempoTimer) { clearInterval(tempoTimer); tempoTimer = null; } }

/*
UMA LINHA DE TEMPO PARA O PAINEL — curta, e com a idade quando ela importa.

Diferente do bloco falado: aqui não há orçamento de segundos, mas há largura de
tela. Abreviações que na fala seriam ilegíveis ("NE 24 kt") no olho são o
formato natural — é a mesma tese dos dois públicos, agora na direção inversa.
*/
function linhaDeTempoNoPainel() {
  if (!tempoAtual) return '';
  const ar = tempoAtual.ar || {}, mar = tempoAtual.mar || {};
  const p = [];
  const v = Number(ar.wind_speed_10m);
  if (isFinite(v)) {
    const b = beaufort(v);
    let t = `💨 ${rumoCardeal(ar.wind_direction_10m)} ${Math.round(v)} kt`;
    const raj = Number(ar.wind_gusts_10m);
    if (isFinite(raj) && raj - v >= TEMPO_RAJADA_DELTA) t += ` (raj ${Math.round(raj)})`;
    if (b) t += ` F${b.f}`;
    p.push(t);
  }
  const hs = Number(mar.wave_height);
  if (isFinite(hs)) {
    let t = `🌊 ${hs.toFixed(1).replace('.', ',')} m`;
    const per = Number(mar.wave_period);
    if (isFinite(per)) t += `/${Math.round(per)} s`;
    p.push(t);
  }
  const drift = nosDeKmh(mar.ocean_current_velocity);
  if (isFinite(drift) && drift > 0.05) {
    p.push(`🔃 ${drift.toFixed(1).replace('.', ',')} kt→${rumoCardeal(mar.ocean_current_direction)}`);
  }
  const pr = Number(ar.pressure_msl);
  if (isFinite(pr)) {
    const tend = tendenciaBarometrica(tempoBarometro);
    p.push(`🌡️ ${Math.round(pr)} hPa${tend && tend.sentido ? ' ' + (tend.por3h < 0 ? '↓' : '↑') : ''}`);
  }
  const idade = idadeDoTempo(tempoAtual.emitidoEm);
  if (idade && idade.rotulo) p.push(`⏳ ${idade.minutos} min`);
  return p.join(' · ');
}

/* Pinta a linha. Chamada a cada fixo, junto do resto do HUD. */
function atualizarPainelTempo() {
  const el = document.getElementById('navTempo');
  if (!el) return;
  const t = linhaDeTempoNoPainel();
  el.className = 'nav-line nav-tempo' + (t ? ' active' : '');
  el.textContent = t;
}
