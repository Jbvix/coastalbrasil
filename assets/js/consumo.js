/*
════════════════════════════════════════════════════════════════════════════════
  FAIXA ECONÔMICA DE ROTAÇÃO — gastar menos sem estragar o ETA
════════════════════════════════════════════════════════════════════════════════
  Versão: 1.0.0  ·  Autor: Jossian Brito (Charlie Bravo)  ·  2026-09-21 11:20 UTC
  SPRINT 4.

  MODIFICAÇÕES DESTA VERSÃO (1.0.0 — app v2.11.0)
    + curvaDoMotor()        ancora a curva no cruzeiro declarado da viagem
    + velocidadeDoRpm/consumoHora/consumoPorMilha   a lei da hélice
    + fracaoMCR()           carga do motor, que é onde o chefe pensa
    + combustivelAteDestino()  fuel(rpm) COM o triângulo da corrente dentro
    + faixaEconomica()      minimização numérica com restrição de ETA
    + diagnosticoDeCarga()  carga lida vs. esperada — reboque, casco, mar
    + aprenderCurva()       a curva DESTE casco, medida na própria viagem

════════════════════════════════════════════════════════════════════════════════
  A LEI DA HÉLICE, E O QUE ELA GARANTE DE VERDADE
════════════════════════════════════════════════════════════════════════════════
  Hélice de passo fixo, carga constante:

      P ∝ n³        potência com o cubo da rotação
      V ∝ n         velocidade com a primeira potência (resistência ∝ V²,
                    logo P ∝ V³, logo V³ ∝ n³, logo V ∝ n)
      L/h ∝ n³      consumo POR HORA
      L/NM ∝ n²     consumo POR MILHA — porque L/NM = (L/h)/V

  Na faixa deste rebocador (lenta 650 · cruzeiro 1250 · máxima 1800), cair de
  1250 para 1125 rotações (−10%) significa:

      −27% por hora       (0,9³ = 0,729)
      −19% por milha      (0,9² = 0,810)
      +11% de tempo       (1/0,9)

  ⚠️  O QUE ESTE MODELO NÃO É. Ele é ANCORADO no cruzeiro declarado da viagem e
  degrada à medida que se afasta dele: perto de 1250 é confiável, em 700 é um
  palpite educado. É por isso que aprenderCurva() existe — depois de algumas
  horas a curva passa a ser a DESTE casco, neste calado, com este reboque,
  neste mar; não a de um navio novo em água parada.

════════════════════════════════════════════════════════════════════════════════
  POR QUE NÃO SE IMPÕE O PISO DE 1,5×Vc — ELE APARECE SOZINHO
════════════════════════════════════════════════════════════════════════════════
  Na proposta eu disse que, contra corrente, existe uma velocidade abaixo da
  qual reduzir rotação passa a GASTAR MAIS por milha percorrida no fundo:

      minimizar  n³ / (c·n − Vc)   ->   derivada zera em  c·n = 1,5·Vc
      ou seja,   V_ótimo = 1,5 × velocidade da corrente contrária

  Poderia codificar isso como um piso. NÃO CODIFIQUEI, e a razão importa: um
  piso escrito à mão vale só para o caso que eu previ — corrente exatamente de
  proa. A corrente real vem de través, e aí o navio ainda caranguejeia, o que
  muda a conta.

  Em vez disso, minimiza-se NUMERICAMENTE o combustível total até o destino,
  com o triângulo da corrente dentro da função. O 1,5×Vc então EMERGE do
  resultado em vez de ser imposto — e emerge certo também nos casos que eu não
  previ. A prova 23.6 confere que ele emerge.

  DEPENDE DE: trianguloDaCorrente() (tempo.js). Nada mais.
*/

/*
A FAIXA DE ROTAÇÃO DO ASD 2810, informada por Charlie Bravo em 20/09/2026 e
registrada em docs/dados_embarcacao.md. Editável por embarcação: um casco
diferente tem outro motor, e a curva inteira pende destes três números.
*/
const MOTOR_PADRAO = { lenta: 650, cruzeiro: 1250, maxima: 1800 };

/*
CARGA DO MOTOR — onde o chefe de máquinas realmente pensa.

O painel da praça mostra carga em % da MCR, não rotação. E a carga vai com o
CUBO da rotação, o que produz um número que surpreende quem só olha o conta-
giros: este rebocador CRUZA A 33% DA MCR.

    1800 rpm -> 100%      1250 rpm ->  33%      800 rpm ->  9%
    1500 rpm ->  58%      1000 rpm ->  17%      650 rpm ->  5%

Isso não é defeito: é a natureza do rebocador. O motor é dimensionado para o
TIRO À POSTE, não para o trânsito — 100% da MCR acontece com o navio quase
parado, puxando. Em navegação livre ele vive na faixa baixa, e é por isso que
o "piso de SFOC em 70–85% da MCR", que vale para um cargueiro, NÃO se aplica
aqui: aplicá-lo proibiria o próprio regime de cruzeiro.
*/
function fracaoMCR(rpm, motor) {
  const m = motor || MOTOR_PADRAO;
  const r = Math.max(0, Number(rpm) || 0);
  return Math.pow(r / m.maxima, 3);
}

/*
A CURVA, ANCORADA NO QUE A VIAGEM JÁ DECLARA.

tripData traz velocidade de serviço e consumo horário — que é exatamente um
ponto (rpm_cruzeiro, V, L/h) da curva. Com a lei da hélice, um ponto basta
para traçar o resto. Dois pontos medidos bastariam para traçar melhor, e é o
que aprenderCurva() faz quando a viagem fornece.
*/
function curvaDoMotor(trip, motor) {
  const m = motor || MOTOR_PADRAO;
  const v = trip && Number(trip.speedKnots);
  const lh = trip && Number(trip.fuelConsumption);
  if (!isFinite(v) || v <= 0 || !isFinite(lh) || lh <= 0) return null;
  return { motor: m, rpmRef: m.cruzeiro, vRef: v, lhRef: lh,
           // Teto de velocidade de casco, quando a LOA é conhecida. Sem ela o
           // modelo extrapola linearmente e superestima em rotação alta.
           vLimite: velocidadeDeCasco(trip && trip.loa),
           // Marca de procedência: "declarada" = do plano de viagem;
           // "aprendida" = medida no mar. Quem lê o conselho merece saber
           // se ele veio de um catálogo ou da singradura de ontem.
           origem: 'declarada' };
}

/*
════════════════════════════════════════════════════════════════════════════════
  ONDE V ∝ n DEIXA DE VALER — a velocidade de casco
════════════════════════════════════════════════════════════════════════════════
  A primeira versão deste módulo previa 15,8 nós a 1800 rotações. Um ASD 2810
  não faz isso, e a razão é hidrodinâmica, não de motor.

  Num casco de deslocamento, a partir de certa velocidade o navio passa a
  subir na própria onda de proa: o comprimento da onda gerada iguala o do
  casco, a esteira vira um morro e a resistência sobe quase vertical. É a
  VELOCIDADE DE CASCO:

      V_casco = 1,34 · √(L_flutuação em pés)

  Para o ASD 2810 (LOA 28,67 m, L_flut ≈ 0,95·LOA = 27,2 m = 89,4 pés):

      V_casco = 1,34 · 9,46 = 12,7 nós

  Com potência sobrando um rebocador ultrapassa isso um pouco — daí o fator de
  1,1 abaixo, que põe o teto prático em ~13,9 nós. Além dele, cada nó custa uma
  fortuna e o modelo cúbico simplesmente MENTE.

  O QUE O TETO FAZ NA CONTA, e por que ele é mais que cosmético: acima dele a
  velocidade PARA de crescer mas o consumo CONTINUA subindo com n³. O L/NM
  dispara, e o otimizador passa a enxergar o que o mar já sabia — forçar
  rotação além da velocidade de casco é queimar óleo para fazer onda.

  ⚠️  É um TETO, não um modelo de resistência. Perto dele a curva é grosseira.
  Sem LOA declarada não há teto, e aí o modelo superestima em rotação alta —
  o campo `loa` é opcional e esta é a consequência de omiti-lo.
*/
const CONSUMO_FATOR_ACIMA_CASCO = 1.1;

function velocidadeDeCasco(loaM) {
  const loa = Number(loaM);
  if (!isFinite(loa) || loa <= 0) return Infinity;      // sem LOA, sem teto
  const lflutPes = loa * 0.95 * 3.28084;
  return 1.34 * Math.sqrt(lflutPes) * CONSUMO_FATOR_ACIMA_CASCO;
}

/* V ∝ n, com o teto acima. Abaixo da marcha lenta não há propulsão: devolve
   zero em vez de um número negativo que envenenaria a divisão lá na frente. */
function velocidadeDoRpm(rpm, c) {
  if (!c) return NaN;
  const r = Number(rpm);
  if (!isFinite(r) || r <= 0) return 0;
  const linear = c.vRef * (r / c.rpmRef);
  const teto = isFinite(c.vLimite) ? c.vLimite : Infinity;
  return Math.max(0, Math.min(linear, teto));
}

function rpmDaVelocidade(v, c) {
  if (!c) return NaN;
  const x = Number(v);
  if (!isFinite(x) || x <= 0) return 0;
  return c.rpmRef * (x / c.vRef);
}

/* L/h ∝ n³. */
function consumoHora(rpm, c) {
  if (!c) return NaN;
  const r = Math.max(0, Number(rpm) || 0);
  return c.lhRef * Math.pow(r / c.rpmRef, 3);
}

/* L/NM NA ÁGUA = (L/h)/V ∝ n². Não confundir com o consumo por milha NO
   FUNDO, que depende da corrente e é o que de fato importa para chegar. */
function consumoPorMilha(rpm, c) {
  const v = velocidadeDoRpm(rpm, c);
  if (!isFinite(v) || v <= 0) return Infinity;
  return consumoHora(rpm, c) / v;
}

/*
════════════════════════════════════════════════════════════════════════════════
  O COMBUSTÍVEL ATÉ O DESTINO — a função que se minimiza
════════════════════════════════════════════════════════════════════════════════
      tempo  = distância / SOG            SOG vem do triângulo da corrente
      litros = (L/h) × tempo

  A corrente entra AQUI, dentro da função objetivo, e não como um piso colado
  por fora. É isso que faz o resultado continuar certo quando a corrente vem
  de través — caso em que o navio caranguejeia e perde velocidade de um jeito
  que nenhuma regra de bolso prevê.
*/
function combustivelAteDestino(rpm, c, dados) {
  const d = dados || {};
  const distNM = Number(d.distNM);
  if (!c || !isFinite(distNM) || distNM <= 0) return null;

  const vAgua = velocidadeDoRpm(rpm, c);
  if (vAgua <= 0.05) return { rpm, possivel: false, motivo: 'sem propulsão' };

  let sog = vAgua;
  if (typeof trianguloDaCorrente === 'function' && isFinite(d.rumo) &&
      isFinite(d.setCorrente) && isFinite(d.driftNos) && d.driftNos > 0) {
    const tri = trianguloDaCorrente({ rumoDesejado: d.rumo, velAgua: vAgua,
                                      setCorrente: d.setCorrente, drift: d.driftNos });
    if (!tri.possivel) return { rpm, possivel: false, motivo: tri.motivo };
    sog = tri.sog;
  }
  // SOG nula ou negativa: a corrente contrária iguala ou vence o navio. Não é
  // "muito devagar" — é NÃO CHEGAR NUNCA, e a divisão explodiria em silêncio.
  if (sog <= 0.05) return { rpm, possivel: false, motivo: 'a corrente anula o avanço' };

  const horas = distNM / sog;
  return { rpm, possivel: true, sog, vAgua, horas,
           litros: consumoHora(rpm, c) * horas,
           litrosPorMilhaFundo: consumoHora(rpm, c) / sog };
}

/*
════════════════════════════════════════════════════════════════════════════════
  A FAIXA ECONÔMICA — minimização numérica com restrição de ETA
════════════════════════════════════════════════════════════════════════════════
  Varre a faixa útil de rotação de 5 em 5 rpm e guarda:

    · o mínimo ABSOLUTO de combustível (ignorando o relógio);
    · o mínimo VIÁVEL, que é o mais econômico que ainda chega no horário.

  Os dois juntos é que formam o conselho útil. Dizer só o viável esconde
  quanto o ETA está custando; dizer só o absoluto esconde que ele atrasa.

  E devolve QUEM MANDA no número — 'eta', 'corrente', 'maxima' ou 'consumo'.
  Um conselho sem o motivo é uma ordem, e a Iara não dá ordens.
*/
const CONSUMO_PASSO_RPM = 5;

/* Diferença mínima de rotação que merece virar frase: 4%. Abaixo disso está
   dentro da incerteza do modelo, e cutucar por 30 rotações é o caminho para
   virar o alarme que todo mundo aprende a ignorar. */
const CONSUMO_TOLERANCIA = 0.04;

/* Abaixo desta fração da MCR, marcha lenta prolongada é assunto de MÁQUINAS,
   não de combustível — e quem decide é o chefe. Ver a nota em faixaEconomica. */
const CONSUMO_MCR_BAIXA = 0.15;

function faixaEconomica(p) {
  const o = p || {};
  const c = o.curva;
  const m = (c && c.motor) || MOTOR_PADRAO;
  const distNM = Number(o.distNM);
  const horasDisponiveis = Number(o.horasDisponiveis);
  if (!c || !isFinite(distNM) || distNM <= 0) return null;

  const dados = { distNM, rumo: o.rumo, setCorrente: o.setCorrente, driftNos: o.driftNos };
  let melhorAbs = null, melhorViavel = null;
  const impossiveis = [];

  for (let r = m.lenta; r <= m.maxima; r += CONSUMO_PASSO_RPM) {
    const s = combustivelAteDestino(r, c, dados);
    if (!s || !s.possivel) { if (s) impossiveis.push(r); continue; }
    if (!melhorAbs || s.litros < melhorAbs.litros) melhorAbs = s;
    const cabeNoRelogio = !isFinite(horasDisponiveis) || s.horas <= horasDisponiveis;
    if (cabeNoRelogio && (!melhorViavel || s.litros < melhorViavel.litros)) melhorViavel = s;
  }
  if (!melhorAbs) return { possivel: false, motivo: 'nenhuma rotação cumpre esta derrota' };

  /*
  QUEM MANDA NO NÚMERO.
    'consumo'  o ótimo puro cabe no relógio — o conselho é só economia;
    'eta'      o relógio obriga a ir mais rápido que o ótimo;
    'maxima'   nem na máxima se chega no horário — isso é um aviso, não um
               conselho, e precisa ser dito como aviso.
  */
  let pisoQueManda = 'consumo';
  let sugerido = melhorAbs;
  if (!melhorViavel) { pisoQueManda = 'maxima'; sugerido = { rpm: m.maxima }; }
  else if (melhorViavel.rpm > melhorAbs.rpm + CONSUMO_PASSO_RPM / 2) { pisoQueManda = 'eta'; sugerido = melhorViavel; }
  else sugerido = melhorViavel;

  const atual = isFinite(o.rpmAtual) ? combustivelAteDestino(o.rpmAtual, c, dados) : null;
  const avisos = [];

  /*
  MARCHA LENTA PROLONGADA É DECISÃO DE MÁQUINAS, NÃO DE COMBUSTÍVEL.

  A conta do consumo empurra sempre para baixo. Mas rodar horas a fio em carga
  muito baixa suja turbo, molha camisa e enche o escape de óleo não queimado —
  e o preço disso não aparece no totalizador de combustível. A Iara NÃO tem
  como avaliar isso: ela não vê a cor do escape, não sente o cheiro da praça,
  não sabe há quanto tempo o motor não abre. O chefe sabe.

  Por isso aqui não há PISO: há um AVISO, e a decisão fica com quem pode tomá-la.
  */
  if (sugerido.rpm && fracaoMCR(sugerido.rpm, m) < CONSUMO_MCR_BAIXA) {
    avisos.push({ tipo: 'carga-baixa',
      texto: `a ${Math.round(sugerido.rpm)} rotações o motor fica com ` +
             `${Math.round(fracaoMCR(sugerido.rpm, m) * 100)} por cento de carga; ` +
             `marcha lenta prolongada é decisão de máquinas, não de combustível` });
  }
  if (isFinite(c.vLimite) && sugerido.vAgua != null && sugerido.vAgua >= c.vLimite - 0.05) {
    avisos.push({ tipo: 'velocidade-de-casco',
      texto: `a ${c.vLimite.toFixed(1)} nós o navio bate na própria onda de proa; ` +
             `daí para cima cada nó custa uma fortuna` });
  }
  if (impossiveis.length) {
    avisos.push({ tipo: 'corrente-forte',
      texto: `abaixo de ${Math.round(Math.max(...impossiveis))} rotações a corrente não deixa avançar` });
  }
  if (pisoQueManda === 'maxima') {
    avisos.push({ tipo: 'eta-inalcancavel',
      texto: 'nem na rotação máxima dá para chegar no horário previsto' });
  }

  /*
  ECONOMIA E ATRASO, COM O SINAL DECLARADO — e o conselho pode ser ACELERAR.

  A primeira versão só sabia mandar reduzir, e numa derrota apertada devolvia
  "economia −485 L, atraso −140 min": tecnicamente correto e ilegível. Números
  negativos rotulados com palavra positiva são a forma mais eficiente de fazer
  alguém entender o contrário do que está escrito.

      economiaL  positivo = poupa combustível   negativo = gasta mais
      atrasoMin  positivo = chega mais tarde    negativo = chega mais cedo

  E o conselho ganha nome. Quando o relógio exige MAIS rotação do que a que
  está posta, a frase não é "economize" — é "a 1250 você não chega no horário".
  */
  const economiaL = (atual && atual.possivel && sugerido.litros != null)
    ? atual.litros - sugerido.litros : null;
  const atrasoMin = (atual && atual.possivel && sugerido.horas != null)
    ? (sugerido.horas - atual.horas) * 60 : null;

  /* Abaixo de 4% de diferença não se diz nada. É menos que a incerteza do
     próprio modelo, e assistente que cutuca por 30 rotações vira aquele
     alarme que todo mundo aprende a ignorar. */
  let recomendacao = 'manter';
  if (isFinite(o.rpmAtual) && o.rpmAtual > 0) {
    const dif = sugerido.rpm - o.rpmAtual;
    if (Math.abs(dif) / o.rpmAtual >= CONSUMO_TOLERANCIA) recomendacao = dif < 0 ? 'reduzir' : 'aumentar';
  }

  return {
    possivel: true,
    rpmSugerido: Math.round(sugerido.rpm),
    pisoQueManda,
    litros: sugerido.litros, horas: sugerido.horas, sog: sugerido.sog,
    // O ótimo SEM o relógio: é ele que mostra quanto o ETA está custando.
    rpmOtimoSemEta: Math.round(melhorAbs.rpm),
    litrosOtimoSemEta: melhorAbs.litros,
    atual: atual && atual.possivel
      ? { rpm: o.rpmAtual, litros: atual.litros, horas: atual.horas, sog: atual.sog } : null,
    economiaL, atrasoMin, recomendacao, avisos,
    cargaSugerida: fracaoMCR(sugerido.rpm, m)
  };
}

/*
════════════════════════════════════════════════════════════════════════════════
  DIAGNÓSTICO DE CARGA — o que o ponteiro diz e a curva não esperava
════════════════════════════════════════════════════════════════════════════════
  Esta é a parte que só faz sentido porque quem opera é chefe de máquinas.

  A curva livre prevê carga = (n/n_máx)³. Se o painel mostra MAIS que isso na
  mesma rotação, o navio está trabalhando mais do que trabalharia solto e em
  água parada. As causas possíveis são poucas e conhecidas:

      reboque na esteira · casco ou hélice sujos · mar e vento de proa ·
      água rasa (efeito de squat aumenta a resistência) · avaria

  A Iara NÃO escolhe entre elas — ela não vê o cabo nem o fundo. Ela mede a
  diferença, diz o tamanho dela e entrega a lista ao chefe. Medir e nomear a
  discrepância já é a metade cara do diagnóstico.

  E o caminho inverso também informa: carga MENOR que a esperada em geral quer
  dizer mar e corrente de popa — ou que a curva precisa ser reancorada.
*/
const CONSUMO_CARGA_DESVIO = 0.25;   // 25% acima ou abaixo já merece frase

function diagnosticoDeCarga(rpm, cargaLidaPct, motor) {
  const m = motor || MOTOR_PADRAO;
  const r = Number(rpm), lida = Number(cargaLidaPct);
  if (!isFinite(r) || r <= 0 || !isFinite(lida) || lida <= 0) return null;
  const esperada = fracaoMCR(r, m) * 100;
  if (esperada <= 0.5) return null;              // perto da lenta, a razão explode
  const razao = lida / esperada;
  const dif = razao - 1;
  let situacao = 'normal', texto = '';
  if (dif > CONSUMO_CARGA_DESVIO) {
    situacao = 'pesado';
    // Enxuto de propósito: a primeira versão levava 8 segundos só nesta frase,
    // e o relatório inteiro estourava o teto. O número é o que informa; a
    // lista de causas pode ser curta, porque quem ouve conhece todas elas.
    texto = `Carga de ${Math.round(lida)} por cento onde a curva esperaria ` +
            `${Math.round(esperada)} — ${Math.round(dif * 100)} por cento a mais. ` +
            `Reboque, casco sujo ou mar de proa`;
  } else if (dif < -CONSUMO_CARGA_DESVIO) {
    situacao = 'leve';
    texto = `Motor mais leve que a curva prevê: ${Math.round(lida)} por cento ` +
            `contra ${Math.round(esperada)}. Mar e corrente de popa, provavelmente`;
  }
  return { esperadaPct: esperada, lidaPct: lida, razao, situacao, texto };
}

/*
════════════════════════════════════════════════════════════════════════════════
  APRENDER A CURVA DESTE CASCO — a diferença entre calculadora e assistente
════════════════════════════════════════════════════════════════════════════════
  O app já registra distância percorrida e combustível consumido. Com a rotação
  informada, cada hora de viagem vira uma amostra (rpm, SOG, L/h) — e algumas
  amostras bastam para reancorar a curva no navio REAL: neste calado, com este
  reboque, com este casco no estado em que ele está hoje.

  Reancora-se o PONTO, não o expoente. A lei da hélice (n³) é física e não se
  mede com meia dúzia de pontos ruidosos; o que se mede é ONDE a curva passa.
  Ajustar o expoente com poucos dados é o caminho mais curto para uma curva que
  descreve lindamente o ruído de ontem e erra o de amanhã.

  Exige-se um mínimo de amostras e um espalhamento mínimo de rotação: três
  pontos todos em 1250 não dizem nada sobre a curva, só sobre aquele ponto.
*/
const CONSUMO_MIN_AMOSTRAS = 4;
const CONSUMO_MIN_ESPALHAMENTO_RPM = 80;

function aprenderCurva(amostras, base) {
  const a = (Array.isArray(amostras) ? amostras : []).filter(x =>
    x && isFinite(x.rpm) && x.rpm > 0 && isFinite(x.sog) && x.sog > 0 && isFinite(x.lh) && x.lh > 0);
  if (!base || a.length < CONSUMO_MIN_AMOSTRAS) return null;
  const rpms = a.map(x => x.rpm);
  if (Math.max(...rpms) - Math.min(...rpms) < CONSUMO_MIN_ESPALHAMENTO_RPM) return null;

  /* Cada amostra projeta a referência: se V ∝ n, então V_ref = V·(n_ref/n).
     A mediana, e não a média, porque um único fixo de GPS ruim ou um minuto
     de máquina em manobra distorce a média e não move a mediana. */
  const mediana = v => { const s = v.slice().sort((x, y) => x - y); const i = s.length >> 1;
                         return s.length % 2 ? s[i] : (s[i - 1] + s[i]) / 2; };
  const vRef = mediana(a.map(x => x.sog * (base.rpmRef / x.rpm)));
  const lhRef = mediana(a.map(x => x.lh * Math.pow(base.rpmRef / x.rpm, 3)));
  if (!isFinite(vRef) || vRef <= 0 || !isFinite(lhRef) || lhRef <= 0) return null;

  return { motor: base.motor, rpmRef: base.rpmRef, vRef, lhRef,
           origem: 'aprendida', amostras: a.length,
           // Quanto a realidade destoa do plano. Um desvio grande não é erro
           // do aprendizado: é o plano de viagem que estava otimista.
           desvioV: vRef / base.vRef, desvioLh: lhRef / base.lhRef };
}

// ═══════════════════════════════════════════════════════════════════════
// ESTADO DE BORDO — o que o chefe informa e o que a viagem ensina
// ═══════════════════════════════════════════════════════════════════════

const CONSUMO_CHAVE_RPM = 'cnb_rpm';
const CONSUMO_CHAVE_CARGA = 'cnb_carga';

let maqRpm = null;              // rotação informada pelo chefe
let maqCarga = null;            // carga em % da MCR, lida no painel da praça
let maqAmostras = [];           // (rpm, sog, L/h) medidos nesta viagem
let maqCurvaAprendida = null;

/* A curva em vigor: a aprendida quando já houver dados que a sustentem, a
   declarada enquanto não houver. A procedência viaja junto no campo `origem`
   porque quem ouve o conselho merece saber se ele veio de um plano de viagem
   ou da singradura das últimas horas. */
function curvaEmVigor() {
  const base = (typeof tripData !== 'undefined' && tripData)
    ? curvaDoMotor(Object.assign({ loa: maqLoaDaEmbarcacao() }, tripData)) : null;
  if (!base) return null;
  return maqCurvaAprendida || base;
}

/*
LOA PARA O TETO DE VELOCIDADE DE CASCO.

A viagem não declara comprimento — mas o registro da frota 3D declara, e o
casco escolhido ali é o mesmo que está navegando. Sem nenhum dos dois, fica
sem teto e o modelo superestima em rotação alta, que é o comportamento
documentado em velocidadeDeCasco().
*/
function maqLoaDaEmbarcacao() {
  try {
    if (typeof shipModelAtual === 'function') {
      const m = shipModelAtual();
      if (m && isFinite(m.loa)) return m.loa;
    }
  } catch (e) { }
  return NaN;
}

/* Lê os dois campos do HUD e guarda no aparelho. Um valor fora de faixa é
   ignorado em silêncio: dedo escorregado no teclado numérico não pode virar
   conselho de rotação. */
function lerMaquinas() {
  const n = id => { const el = document.getElementById(id); return el ? Number(el.value) : NaN; };
  const r = n('navRpm'), cg = n('navCarga');
  maqRpm = (isFinite(r) && r > 0 && r <= 3000) ? r : null;
  maqCarga = (isFinite(cg) && cg > 0 && cg <= 110) ? cg : null;
  try {
    if (maqRpm) localStorage.setItem(CONSUMO_CHAVE_RPM, String(maqRpm));
    if (maqCarga) localStorage.setItem(CONSUMO_CHAVE_CARGA, String(maqCarga));
  } catch (e) { }
  atualizarPainelEco();
}

/*
UMA AMOSTRA POR HORA, e não uma por fixo de GPS.

Tentador colher a cada atualização de posição — e errado: seriam milhares de
pontos correlacionados, todos do mesmo minuto de máquina, que dariam à mediana
uma falsa confiança. Uma amostra por relatório horário é independente o
bastante para dizer alguma coisa sobre a curva.

E só se colhe com a rotação INFORMADA: sem ela, não há par (rpm, velocidade)
e o ponto não serve para nada.
*/
function colherAmostraDeMaquina(sog, litrosPorHora) {
  if (!maqRpm || !isFinite(sog) || sog <= 0.5 || !isFinite(litrosPorHora) || litrosPorHora <= 0) return;
  maqAmostras.push({ rpm: maqRpm, sog, lh: litrosPorHora, t: Date.now() });
  if (maqAmostras.length > 200) maqAmostras = maqAmostras.slice(-200);
  const base = (typeof tripData !== 'undefined' && tripData)
    ? curvaDoMotor(Object.assign({ loa: maqLoaDaEmbarcacao() }, tripData)) : null;
  if (base) {
    const nova = aprenderCurva(maqAmostras, base);
    if (nova) maqCurvaAprendida = nova;
  }
}

/*
════════════════════════════════════════════════════════════════════════════════
  OS TRÊS NÚMEROS QUE O CONSELHO PRECISA DO ESTADO DE NAVEGAÇÃO
════════════════════════════════════════════════════════════════════════════════
  Quanto falta, para que rumo, e quanto tempo há. Ficam aqui, e não no app.html,
  porque o teto de 3.500 linhas da prova 12.1 existe justamente para impedir o
  monólito de voltar a crescer — e porque estes três só servem a este módulo.
*/

/* Distância que falta: do fixo atual ao próximo waypoint, mais as pernas
   seguintes inteiras. Somar só a perna atual subestimaria a rota, e o conselho
   de rotação sairia otimista — o pior sentido para ele errar. */
function milhasRestantes() {
  try {
    if (typeof waypoints === 'undefined' || typeof navActiveLeg === 'undefined') return NaN;
    const fix = (typeof navLastFix !== 'undefined') ? navLastFix : null;
    if (!fix || waypoints.length < navActiveLeg + 2) return NaN;
    let total = 0, de = { lat: fix.lat, lng: fix.lng };
    for (let i = navActiveLeg + 1; i < waypoints.length; i++) {
      total += calculateDistance(de.lat, de.lng, waypoints[i].lat, waypoints[i].lng);
      de = waypoints[i];
    }
    return total;
  } catch (e) { return NaN; }
}

/* Rumo da perna ativa — é ele que entra no triângulo da corrente. */
function rumoParaProximoWp() {
  try {
    const fix = navLastFix, alvo = waypoints[navActiveLeg + 1];
    if (!fix || !alvo) return NaN;
    return calculateBearing(fix.lat, fix.lng, alvo.lat, alvo.lng);
  } catch (e) { return NaN; }
}

/*
HORAS ATÉ O ETA PLANEJADO — o relógio contra o qual se otimiza.

Usa-se o ETA do ÚLTIMO waypoint, que é o compromisso real da viagem: chegar ao
destino. Otimizar contra o ETA da perna atual apertaria a rotação sem
necessidade, porque o que se perde numa perna se recupera na seguinte.

Sem ETA planejado devolve NaN, e aí faixaEconomica() minimiza sem restrição —
que é o comportamento certo: sem compromisso de horário, o mais econômico é o
mais econômico.
*/
function horasAteOEtaPlanejado() {
  try {
    if (typeof waypoints === 'undefined' || !waypoints.length) return NaN;
    const ultimo = waypoints[waypoints.length - 1];
    if (!ultimo || !ultimo.eta) return NaN;
    const h = (new Date(ultimo.eta).getTime() - Date.now()) / 3600000;
    return h > 0 ? h : NaN;      // ETA já vencido não é restrição, é fato
  } catch (e) { return NaN; }
}

/* O conselho no painel. Só aparece quando tem o que dizer. */
function atualizarPainelEco() {
  const el = document.getElementById('navEco');
  if (!el) return;
  const r = conselhoDeRotacao();
  if (!r || !r.texto) { el.className = 'nav-line nav-eco'; el.textContent = ''; return; }
  el.className = 'nav-line nav-eco active ' + r.classe;
  el.textContent = r.texto;
}

/*
O CONSELHO, EM UMA LINHA — e sempre com o MOTIVO junto.

Conselho sem motivo é ordem, e a Iara não dá ordens (regra 6). "Dá pra 1.100"
não ajuda ninguém a decidir; "dá pra 1.100 e economiza 240 litros, chegando 35
minutos mais tarde — ainda dentro da janela" ajuda.
*/
function conselhoDeRotacao() {
  const c = curvaEmVigor();
  if (!c) return null;
  const restante = (typeof milhasRestantes === 'function') ? milhasRestantes() : NaN;
  if (!isFinite(restante) || restante <= 0) return null;

  const t = (typeof tempoParaRelatorio === 'function' && typeof navLastFix !== 'undefined' && navLastFix)
    ? tempoParaRelatorio(NaN, NaN) : null;
  const mar = (t && t.mar) || {};
  const rumo = (typeof rumoParaProximoWp === 'function') ? rumoParaProximoWp() : NaN;

  const f = faixaEconomica({
    curva: c, distNM: restante, rpmAtual: maqRpm,
    horasDisponiveis: (typeof horasAteOEtaPlanejado === 'function') ? horasAteOEtaPlanejado() : NaN,
    rumo, setCorrente: Number(mar.ocean_current_direction),
    driftNos: (typeof nosDeKmh === 'function') ? nosDeKmh(mar.ocean_current_velocity) : NaN
  });
  if (!f || !f.possivel) return null;

  const dg = maqCarga ? diagnosticoDeCarga(maqRpm, maqCarga, c.motor) : null;
  let texto = '', classe = 'reduzir';

  if (f.pisoQueManda === 'maxima') {
    texto = '⚠️ Nem na rotação máxima dá para chegar no horário previsto.';
    classe = 'alerta';
  } else if (!maqRpm) {
    texto = `⚙️ Informe a rotação para eu calcular a faixa econômica. ` +
            `Pelo plano, ${f.rpmSugerido} rpm cumprem o horário.`;
    classe = 'reduzir';
  } else if (f.recomendacao === 'reduzir') {
    texto = `⚙️ Dá para fazer com ${f.rpmSugerido} rpm: economiza ${Math.round(f.economiaL)} L`;
    texto += f.atrasoMin > 1 ? `, chegando ${Math.round(f.atrasoMin)} min mais tarde.` : '.';
    classe = 'reduzir';
  } else if (f.recomendacao === 'aumentar') {
    texto = `⚙️ A ${maqRpm} rpm não fecha o horário. ${f.rpmSugerido} rpm fecham, ` +
            `custando ${Math.round(Math.abs(f.economiaL))} L a mais.`;
    classe = 'aumentar';
  } else {
    texto = `⚙️ ${maqRpm} rpm está na faixa econômica para este horário.`;
    classe = 'reduzir';
  }
  if (dg && dg.texto) { texto += ` · ${dg.texto}.`; classe = dg.situacao === 'pesado' ? 'aumentar' : classe; }
  const aviso = f.avisos[0];
  if (aviso) texto += ` · ${aviso.texto}.`;
  return { texto, classe, faixa: f, carga: dg };
}

/*
DUAS COISAS SEPARADAS, E A SEPARAÇÃO É UM DEFEITO CORRIGIDO.

A primeira versão fazia tudo em iniciarMaquinas(), chamada no arranque da
NAVEGAÇÃO. A prova de fumaça pegou: os campos ficavam inertes até alguém
apertar "navegar", e reiniciar a navegação duas vezes empilhava ouvintes
duplicados no mesmo campo.

Agora:
  · a LIGAÇÃO dos campos é DOM puro e acontece no carregamento da página —
    mesma lição da prova 17.10, que exige pintar botão antes do initMap()
    porque uma CDN que falha leva embora o resto do DOMContentLoaded;
  · o ZERAMENTO das amostras acontece a cada navegação, que é quando a curva
    aprendida deixa de valer: outro calado, outro reboque, outro mar.
*/
function ligarCamposDeMaquinas() {
  try {
    const r = localStorage.getItem(CONSUMO_CHAVE_RPM), cg = localStorage.getItem(CONSUMO_CHAVE_CARGA);
    const el = id => document.getElementById(id);
    if (r && el('navRpm')) el('navRpm').value = r;
    if (cg && el('navCarga')) el('navCarga').value = cg;
  } catch (e) { }
  ['navRpm', 'navCarga'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.addEventListener('change', lerMaquinas); el.addEventListener('blur', lerMaquinas); }
  });
  lerMaquinas();
}

/* Cada navegação recomeça o aprendizado: a curva de ontem descrevia o navio
   de ontem, com outro calado, outro reboque e outro mar. */
function iniciarMaquinas() {
  maqAmostras = [];
  maqCurvaAprendida = null;
  lerMaquinas();
}
