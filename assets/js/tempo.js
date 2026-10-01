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

/* ═══════════════════════════════════════════════════════════════════════════
   A LICENÇA DO LADO DO CLIENTE                                       (C4)

   Guardada em localStorage e enviada em CABEÇALHO, nunca na URL — pelo mesmo
   motivo que o servidor a espera em cabeçalho: URL vaza em log de CDN, em
   histórico, em Referer e na barra de endereço. Ver netlify/lib/licenca.mjs.

   Por que localStorage e não sessionStorage: a licença é da EMBARCAÇÃO e vale
   dias. Fazer o comandante redigitar 64 caracteres hexadecimais a cada aba
   nova, de madrugada, com o barco jogando, é desenhar para o erro. O risco
   aceito está declarado: quem tem o aparelho tem a licença — e a licença dá
   acesso a previsão de tempo, não ao sistema.

   O código é normalizado na entrada (sem espaços, minúsculo) porque ele chega
   colado de WhatsApp, e espaço grudado no fim não deveria ser a diferença
   entre ter e não ter vento no passadiço.
   ═══════════════════════════════════════════════════════════════════════════ */
const LICENCA_CHAVE = 'cnb.licenca';

function lerLicenca() {
  try { return String(localStorage.getItem(LICENCA_CHAVE) || '').trim().toLowerCase(); }
  catch (e) { return ''; }   // modo privado, armazenamento bloqueado
}

/* Devolve o que aconteceu, para a interface poder dizer a verdade: aceita,
   apagada, ou recusada por formato. Validade quem decide é o servidor — o
   cliente só recusa o que é obviamente impossível, para não mandar lixo. */
function definirLicenca(codigo) {
  const c = String(codigo == null ? '' : codigo).trim().toLowerCase();
  try {
    if (!c) { localStorage.removeItem(LICENCA_CHAVE); return { ok: true, estado: 'apagada' }; }
    if (!/^[0-9a-f]{64}$/.test(c)) {
      return { ok: false, estado: 'malformada',
               motivo: 'o código deve ter 64 caracteres de 0-9 e a-f' };
    }
    localStorage.setItem(LICENCA_CHAVE, c);
    return { ok: true, estado: 'guardada' };
  } catch (e) {
    return { ok: false, estado: 'sem-armazenamento',
             motivo: 'este navegador não permite guardar a licença' };
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   DIAGNÓSTICO HONESTO DA FALTA DE PREVISÃO                    (C5 · v2.21.0)

   ── O DEFEITO QUE ESTA ETAPA FECHA ────────────────────────────────────────

   Até a v2.20.0, `linhaDeTempoNoPainel()` devolvia STRING VAZIA quando não
   havia dado. O comandante via SILÊNCIO — e silêncio é a pior mensagem
   possível, porque ele não tem como distinguir:

     · falta licença (ele resolve, por WhatsApp, em minutos);
     · a cota diária do autor esgotou (ele NÃO resolve, e não é culpa dele);
     · o Open-Meteo caiu (ninguém resolve, só esperar);
     · o aparelho está sem rede (ele resolve, subindo ao convés).

   São quatro ações completamente diferentes atrás da MESMA tela em branco. O
   comandante que não sabe qual delas é a sua fica mexendo no aparelho quando
   devia mandar uma mensagem, ou esperando quando devia agir.

   É o mesmo princípio de um alarme de praça de máquinas: não basta tocar, tem
   de dizer QUAL grupo disparou. Um painel com uma única lâmpada vermelha
   obriga o chefe a abrir tudo para descobrir o que já poderia estar escrito.

   ── O QUE A TABELA FAZ, QUE É MAIS QUE TRADUZIR CÓDIGO HTTP ───────────────

   Cada entrada carrega, além do texto, a ATRIBUIÇÃO DE CULPA — e é esse campo
   que decide se o comandante age ou espera:

     'licenca'  → é dele, e tem solução imediata;
     'autor'    → é do autor do aplicativo; mexer no aparelho não ajuda;
     'servico'  → é de terceiro; ninguém a bordo resolve;
     'aparelho' → é do aparelho/rede dele.

   Dizer "não é o seu aparelho" quando não é parece detalhe de redação. Não é:
   é o que impede meia hora de diagnóstico inútil no passadiço, de madrugada.
   O espelho já aprendeu isso (ver MIRROR_DIAG em app.html) e esta tabela segue
   deliberadamente o mesmo molde, para o aplicativo falar UMA língua.
   ═══════════════════════════════════════════════════════════════════════════ */
const TEMPO_DIAG = {
  'licenca': {
    rotulo: 'licença necessária',
    culpa: 'licenca',
    dica: '🔑 A previsão de tempo e o espelhamento dependem de licença de serviço. ' +
          'O resto do aplicativo — rota, faróis, ETA, combustível, GPX, 3D e a Iara — ' +
          'continua funcionando. Peça a licença no WhatsApp e cole em ⚙️ Configurar.',
    link: 'https://wa.me/5585997737230'
  },
  'cota': {
    rotulo: 'cota diária esgotada',
    culpa: 'autor',
    /* O teto diário é do AUTOR, não da embarcação. Sem esta frase, o comandante
       passaria a noite achando que estourou algum limite dele. */
    dica: '📉 A cota diária do serviço de previsão, custeada pelo autor, acabou por hoje. ' +
          'NÃO é o seu aparelho nem a sua licença, e não há nada a fazer a bordo — ' +
          'volta a funcionar na virada do dia (UTC).'
  },
  'taxa': {
    rotulo: 'muitas consultas',
    culpa: 'aparelho',
    dica: '⏱️ Este aparelho (ou a rede que ele divide) pediu previsão demais na última hora. ' +
          'Volta sozinho em cerca de 15 minutos. Se estiverem vários aparelhos no mesmo ' +
          'sinal de satélite, deixe só um buscando.'
  },
  'servico': {
    rotulo: 'serviço fora do ar',
    culpa: 'servico',
    dica: '🛠️ O provedor de previsão não está respondendo. Não é o seu aparelho, não é a sua ' +
          'licença e não é a cota. O aplicativo tenta de novo sozinho; o último dado conhecido ' +
          'continua na tela, com a idade dele.'
  },
  'sem-chave': {
    rotulo: 'serviço não configurado',
    culpa: 'autor',
    /* Estado anômalo: o proxy está no ar mas sem a chave paga. É falha de
       implantação do autor, e o comandante precisa saber que é isso, para
       avisar — não para investigar. */
    dica: '🧰 O servidor de previsão está no ar, mas sem a chave do provedor. ' +
          'É falha de configuração do aplicativo, não sua — avise o autor.'
  },
  'origem': {
    rotulo: 'chamada recusada',
    culpa: 'autor',
    dica: '🚧 O servidor recusou a chamada por origem. Isso não deveria acontecer dentro do ' +
          'aplicativo — avise o autor, porque é defeito de configuração.'
  },
  'sem-rede': {
    rotulo: 'sem internet',
    culpa: 'aparelho',
    dica: '📵 O aparelho está sem conexão. Toda a navegação continua funcionando offline; ' +
          'só a previsão depende de rede. Volta sozinha quando o sinal voltar.'
  },
  'coordenada': {
    rotulo: 'posição inválida',
    culpa: 'aparelho',
    dica: '📍 A posição enviada não é válida — normalmente é o GPS ainda sem fixo. ' +
          'Aguarde o primeiro fixo.'
  }
};

/*
classificarFalhaDeTempo({status, motivo, online}) — PURA, e é o coração da C5.

Traduz o que o servidor respondeu na chave do diagnóstico. Recebe `online` por
parâmetro em vez de ler `navigator.onLine` aqui dentro, para que a prova possa
simular o aparelho sem rede sem mexer no navegador.

A ORDEM DAS PERGUNTAS importa, e é esta:

  1. sem rede primeiro. Se o aparelho não tem conexão, nada mais que eu
     observei é confiável — nem status, porque não houve resposta.
  2. 402 é licença, e é inequívoco.
  3. 503 pode ser DOIS casos diferentes, e confundi-los seria o erro clássico:
     cota esgotada (o autor gastou) e portão não configurado. Daí o exame do
     motivo, não só do número.
  4. 502 também tem dois casos: chave ausente (falha do autor) e provedor
     caído (falha de terceiro). "502" sozinho não diz qual.

Juntar 3 e 4 num "erro do servidor" genérico devolveria o comandante
exatamente ao silêncio que esta etapa veio acabar — só com mais palavras.
*/
function classificarFalhaDeTempo(info) {
  const i = info || {};
  const st = Number(i.status);
  const motivo = String(i.motivo == null ? '' : i.motivo).toLowerCase();

  /* Sem rede: não houve resposta, então status nenhum é confiável. */
  if (i.online === false) return 'sem-rede';
  if (!isFinite(st) || st === 0) return i.online === false ? 'sem-rede' : 'servico';

  if (st === 402) return 'licenca';
  if (st === 429) return 'taxa';
  if (st === 400) return 'coordenada';
  if (st === 403) return 'origem';

  if (st === 503) {
    /* "teto diário de consultas atingido (2000/2000)" vem do fusível;
       "portão não configurado" vem do painel administrativo. */
    if (/teto|cota/.test(motivo)) return 'cota';
    return 'sem-chave';
  }

  if (st === 502) {
    if (/api_key|apikey|não configurada|nao configurada/.test(motivo)) return 'sem-chave';
    return 'servico';
  }

  return 'servico';
}

/* O texto curto para a linha do HUD, e o longo para o relatório e a dica.
   Separados porque o passadiço tem três centímetros de linha e o relatório tem
   a página inteira: a mesma verdade em duas larguras. */
function rotuloDeFalhaDeTempo(chave) {
  const d = TEMPO_DIAG[chave];
  return d ? d.rotulo : 'previsão indisponível';
}
function dicaDeFalhaDeTempo(chave) {
  const d = TEMPO_DIAG[chave];
  return d ? { dica: d.dica, culpa: d.culpa, link: d.link || null }
           : { dica: 'A previsão não está disponível agora. O aplicativo tenta de novo sozinho.',
               culpa: 'servico', link: null };
}

let tempoAtual = null;            // último pacote bom conhecido
let tempoBarometro = [];          // série de pressão para a tendência
let tempoTimer = null;
let tempoFalhas = 0;
/* Último estado de licença visto pelo servidor. É o que a C5 vai transformar
   em mensagem; por ora fica registrado e exposto, sem pintar tela. */
let tempoLicenca = { estado: 'desconhecido', degradada: false, motivo: '' };
/* Última falha classificada, ou null quando a última busca deu certo.    (C5)
   É o que transforma o silêncio em frase. */
let tempoFalhaAtual = null;

async function buscarTempo(lat, lng) {
  if (!isFinite(lat) || !isFinite(lng)) return null;
  try {
    const lic = lerLicenca();
    const r = await fetch(`${TEMPO_URL}?lat=${lat.toFixed(4)}&lng=${lng.toFixed(4)}`,
                          lic ? { headers: { 'x-licenca': lic } } : undefined);
    const j = await r.json();

    /* 402 é o único código que NÃO é falha de serviço: o proxy está vivo,
       respondeu depressa, e disse que falta licença. Tratar isso como "o
       servidor caiu" mandaria o comandante procurar sinal de rádio quando o
       que ele precisa é mandar uma mensagem pelo WhatsApp. */
    if (r.status === 402) {
      tempoLicenca = { estado: (j && j.estadoLicenca) || 'ausente', degradada: false,
                       motivo: (j && j.motivo) || 'licença necessária',
                       contato: j && j.contato };
      tempoFalhas++;
      tempoFalhaAtual = 'licenca';
      console.warn('tempo: licença exigida —', tempoLicenca.motivo);
      return null;
    }

    if (!j || !j.ok) {
      /* A classificação acontece AQUI, onde ainda existem status e motivo. Se
         deixássemos para o `catch`, só restaria a mensagem do Error — e o
         número, que é metade do diagnóstico, estaria perdido. Foi assim que a
         tela em branco nasceu: a informação existia e era descartada. */
      tempoFalhaAtual = classificarFalhaDeTempo({
        status: r.status, motivo: (j && j.motivo) || '',
        online: typeof navigator === 'undefined' ? true : navigator.onLine
      });
      throw new Error((j && j.motivo) || `HTTP ${r.status}`);
    }

    /* Atendido. Pode ter sido atendido em modo DEGRADADO — o verificador de
       licença não respondeu e o proxy serviu assim mesmo. Isso é informação
       de manutenção, não de navegação: o dado do tempo é igualmente bom. */
    tempoLicenca = {
      estado: j.licencaObservada || (j.licencaDegradada ? 'indisponivel' : 'ok'),
      degradada: !!j.licencaDegradada, motivo: ''
    };

    tempoAtual = j;
    tempoFalhas = 0;
    tempoFalhaAtual = null;        // deu certo: nada a diagnosticar
    const p = j.ar && Number(j.ar.pressure_msl);
    if (isFinite(p)) {
      tempoBarometro.push({ t: Date.parse(j.emitidoEm) || Date.now(), hPa: p });
      // 12 h de série bastam para a tendência de 3 h e não crescem sem fim.
      if (tempoBarometro.length > 48) tempoBarometro = tempoBarometro.slice(-48);
    }
    return j;
  } catch (e) {
    tempoFalhas++;
    /* Se o passo 3 já classificou, respeita: ele tinha o status na mão e este
       `catch` não tem. Só classifica aqui o que nunca chegou a ter resposta —
       rede caída, DNS, estouro de tempo. */
    if (!tempoFalhaAtual) {
      tempoFalhaAtual = classificarFalhaDeTempo({
        status: 0, motivo: (e && e.message) || '',
        online: typeof navigator === 'undefined' ? true : navigator.onLine
      });
    }
    // NÃO limpa tempoAtual: o valor velho continua servindo, rotulado com a
    // idade. É a decisão aprovada — cache rotulado em vez de silêncio.
    console.warn('tempo: falha na busca (', tempoFalhas, ') —', e && e.message,
                 '· diagnóstico:', tempoFalhaAtual);
    return null;
  }
}

/* O que o relatório consome. Já vem com idade, barômetro e efeito da corrente
   sobre a derrota atual — ou null, se nunca houve uma busca bem-sucedida. */
function tempoParaRelatorio(rumoDerrota, velAgua) {
  /* Sem dado, o relatório devolvia null e a seção de tempo simplesmente não
     existia — silêncio outra vez, agora em papel. Agora devolve o DIAGNÓSTICO:
     um relatório que diz "sem previsão porque falta licença" é útil; um que
     omite a seção faz o leitor pensar que ninguém olhou o tempo.        (C5) */
  if (!tempoAtual) {
    if (!tempoFalhaAtual) return null;
    const d = dicaDeFalhaDeTempo(tempoFalhaAtual);
    return { semPrevisao: true, causa: tempoFalhaAtual,
             rotulo: rotuloDeFalhaDeTempo(tempoFalhaAtual),
             dica: d.dica, culpa: d.culpa, link: d.link };
  }
  const o = {
    ar: tempoAtual.ar, mar: tempoAtual.mar,
    idade: idadeDoTempo(tempoAtual.emitidoEm),
    barometro: tendenciaBarometrica(tempoBarometro)
  };
  /* Dado bom na mão E falha corrente: o relatório diz as duas coisas. */
  if (tempoFalhaAtual) {
    const d = dicaDeFalhaDeTempo(tempoFalhaAtual);
    o.falhaCorrente = { causa: tempoFalhaAtual, rotulo: rotuloDeFalhaDeTempo(tempoFalhaAtual),
                        dica: d.dica, culpa: d.culpa, link: d.link };
  }
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
  /* ⚠️ AQUI ESTAVA O DEFEITO DA C5: isto devolvia '' e o painel ficava em
     branco. Nunca houve dado e nunca houve explicação — o comandante olhava
     uma linha vazia e tinha de adivinhar entre quatro causas com quatro ações
     diferentes. Agora a ausência de dado é ela mesma uma informação. */
  if (!tempoAtual) {
    return tempoFalhaAtual ? `⚠️ sem previsão · ${rotuloDeFalhaDeTempo(tempoFalhaAtual)}`
                           : '⏳ buscando previsão…';
  }
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

  /* DADO VELHO + MOTIVO, juntos.                                        (C5)
     Separados, cada um conta meia verdade: "40 min" não diz por que parou, e
     "fora do ar" não diz que ainda há número bom na tela. Juntos dizem a
     coisa inteira — que é o que um diário de bordo faria. */
  if (tempoFalhaAtual) p.push(`⚠️ ${rotuloDeFalhaDeTempo(tempoFalhaAtual)}`);

  return p.join(' · ');
}

/* ═══════════════════════════════════════════════════════════════════════════
   LIGAÇÃO DO CAMPO DE LICENÇA                                         (C4)

   `addEventListener`, nunca `onclick=` no HTML. O aviso 9.7 existe porque a
   CSP precisa admitir 'unsafe-inline' enquanto houver atributos de evento na
   página; cada campo novo ligado assim é um a menos no caminho de fechá-lo.
   A C1 andou para trás nesse aviso pela primeira vez — não vou andar de volta.

   O campo NUNCA é preenchido de volta com o código guardado. Mostrar 64
   caracteres de licença numa tela que pode estar sendo espelhada, fotografada
   ou projetada no passadiço é entregá-la a quem estiver olhando. O que a tela
   confirma é o ESTADO ("guardada"), não o segredo.
   ═══════════════════════════════════════════════════════════════════════════ */
function ligarCampoDeLicenca() {
  const campo = document.getElementById('licencaCodigo');
  const botao = document.getElementById('licencaGuardar');
  const aviso = document.getElementById('licencaAviso');
  if (!campo || !botao) return false;

  /* textContent, nunca innerHTML: o conteúdo vem de um campo digitado, e a
     C1 já pagou o preço de escrever entrada de usuário como HTML. */
  const dizer = (txt, cor) => { if (aviso) { aviso.textContent = txt; aviso.style.color = cor || ''; } };

  if (lerLicenca()) dizer('Licença guardada neste aparelho. Para trocar, cole outra e Guardar.');

  botao.addEventListener('click', () => {
    const r = definirLicenca(campo.value);
    campo.value = '';                       // nunca deixa o código na tela
    if (!r.ok)                       dizer(r.motivo, '#ff6b6b');
    else if (r.estado === 'apagada') dizer('Licença apagada deste aparelho.');
    else                             dizer('Licença guardada. Vale na próxima busca de tempo.', '#4caf50');
  });
  return true;
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ligarCampoDeLicenca);
  } else {
    ligarCampoDeLicenca();
  }
}

/* Pinta a linha. Chamada a cada fixo, junto do resto do HUD. */
function atualizarPainelTempo() {
  const el = document.getElementById('navTempo');
  if (!el) return;
  const t = linhaDeTempoNoPainel();
  el.className = 'nav-line nav-tempo' + (t ? ' active' : '');
  el.textContent = t;
  pintarDicaDeTempo();
}

/*
A DICA LONGA NA TELA.                                                   (C5)

Construída com nós do DOM, NUNCA com innerHTML — mesmo sendo texto de uma
tabela interna e não entrada de usuário. O motivo é disciplina, não paranoia:
a C1 encontrou um XSS em produção exatamente num lugar onde "o texto é nosso"
parecia bastar, e a regra que admite exceção por conveniência deixa de ser
regra. `createElement` + `textContent` custa quatro linhas e nunca executa nada.

A dica SÓ aparece quando há o que explicar. Faixa permanente é faixa invisível:
o olho aprende a pular o que está sempre ali, e aí a mensagem de verdade some
junto. Por isso ela desaparece — e não fica cinza — quando a busca volta.
*/
function pintarDicaDeTempo() {
  const box = document.getElementById('navTempoDica');
  if (!box) return;

  if (!tempoFalhaAtual) {
    box.className = 'nav-line nav-tempo-dica';
    box.hidden = true;
    box.textContent = '';
    return;
  }

  const d = dicaDeFalhaDeTempo(tempoFalhaAtual);
  box.textContent = d.dica;                      // texto, nunca marcação

  /* O link só existe na causa que tem solução imediata. Oferecer contato para
     "cota esgotada" seria convidar o comandante a cobrar de alguém algo que
     não se resolve agora — e desgastar o canal que vai importar depois. */
  if (d.link) {
    box.appendChild(document.createTextNode(' '));
    const a = document.createElement('a');
    a.href = d.link;
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = 'Falar no WhatsApp';
    box.appendChild(a);
  }

  box.className = 'nav-line nav-tempo-dica active';
  box.hidden = false;
}
