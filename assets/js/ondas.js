/*
════════════════════════════════════════════════════════════════════════════════
  ONDAS E ESTABILIDADE PELOS SENSORES — o rebocador como instrumento
════════════════════════════════════════════════════════════════════════════════
  Versão: 1.0.0  ·  Autor: Jossian Brito (Charlie Bravo)  ·  2026-09-21 15:40 UTC
  SPRINT 5.

  MODIFICAÇÕES DESTA VERSÃO (1.0.0 — app v2.12.0)
    + fft()                  Cooley-Tukey radix-2, base de tudo
    + espectroDeHeave()      S_η(ω) = S_a(ω)/ω⁴  — a divisão que evita integrar
    + momentos/Hs/Tz/Tp      os parâmetros de estado de mar
    + periodoDeBalanco()     do espectro do jogo, não por cruzamento de zero
    + gmDoPeriodo()          ⚠️ a altura metacêntrica pelo período de balanço
    + periodoDeEncontro()    Te = T / |1 − V·cos μ / c|
    + alertaDeRessonancia()  balanço síncrono e paramétrico
    + confiabilidadeDaOnda() o RAO, admitido em vez de escondido

════════════════════════════════════════════════════════════════════════════════
  O QUE O TABLET MEDE — e o que ele NÃO mede
════════════════════════════════════════════════════════════════════════════════
  Um tablet no passadiço NÃO MEDE O MAR. Mede o REBOCADOR. Entre um e outro há
  um filtro, que é o próprio navio:

      S_navio(ω) = |RAO(ω)|² · S_mar(ω)

  E o comprimento da onda decide tudo — λ = 1,56·T²:

      T = 10 s  ->  λ = 156 m  ->  5,5× o navio  ->  ele SOBE JUNTO. Bom.
      T =  7 s  ->  λ =  76 m  ->  2,7×          ->  razoável
      T =  4 s  ->  λ =  25 m  ->  0,9×          ->  ATRAVESSA. Subestima muito.

  Ou seja: ÓTIMO PARA O SWELL, CEGO PARA A MARULHADA. Um rebocador de 28 m é
  uma boia sensível às ondas longas e surda às curtas, como um flutuador
  pequeno não sente a maré. Isso não é limitação a esconder — é a física do
  instrumento, e confiabilidadeDaOnda() a devolve junto com o número.

════════════════════════════════════════════════════════════════════════════════
  POR QUE NÃO SE INTEGRA NO TEMPO
════════════════════════════════════════════════════════════════════════════════
  Para tirar deslocamento de aceleração integra-se duas vezes. No tempo isso é
  receita de desastre: o menor viés do acelerômetro vira uma rampa na primeira
  integração e uma PARÁBOLA na segunda. Meio miligal de viés produz metros de
  "heave" em poucos minutos, e o resultado é lindo e inteiramente falso.

  No domínio da frequência a mesma operação é uma divisão:

      η = a·sen(ωt)  ->  ä = −a·ω²·sen(ωt)  ->  S_a(ω) = ω⁴·S_η(ω)

      logo   S_η(ω) = S_a(ω) / ω⁴

  A deriva vive em ~0 Hz e é CORTADA FORA pela banda antes de causar dano. É o
  método das boias Datawell, e é o único que sobrevive a um acelerômetro de
  consumo.

  ⚠️  A DIVISÃO POR ω⁴ AMPLIFICA O RUÍDO DE BAIXA FREQUÊNCIA BRUTALMENTE. Em
  0,01 Hz o fator é 2,5 milhões de vezes maior que em 0,3 Hz. Por isso a banda
  começa em 0,03 Hz (T = 33 s) e não em zero: abaixo disso não há onda, há
  deriva de sensor multiplicada por um número gigante.
*/

/* Banda útil: 2 s a 33 s de período. Fora dela não há onda de gravidade que
   interesse a um rebocador — há deriva de sensor embaixo e vibração de
   máquina em cima. */
const ONDA_F_MIN = 0.03;      // Hz  ->  T = 33 s
const ONDA_F_MAX = 0.50;      // Hz  ->  T =  2 s
const ONDA_G = 9.80665;

// ═══════════════════════════════════════════════════════════════════════
// FFT — Cooley-Tukey radix-2, iterativa
// ═══════════════════════════════════════════════════════════════════════

/*
Entrada: vetor real de comprimento POTÊNCIA DE 2. Saída: {re, im}.
Iterativa e in-place com inversão de bits — a recursiva é mais bonita de ler e
estoura a pilha em 4096 pontos num navegador de tablete.
*/
function fft(entrada) {
  const n = entrada.length;
  if (n === 0 || (n & (n - 1)) !== 0) throw new Error('fft: comprimento precisa ser potência de 2');
  const re = Float64Array.from(entrada), im = new Float64Array(n);

  // Inversão de bits.
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { const t = re[i]; re[i] = re[j]; re[j] = t; }
  }
  // Borboletas.
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cwr = 1, cwi = 0;
      for (let k = 0; k < len / 2; k++) {
        const ur = re[i + k], ui = im[i + k];
        const vr = re[i + k + len / 2] * cwr - im[i + k + len / 2] * cwi;
        const vi = re[i + k + len / 2] * cwi + im[i + k + len / 2] * cwr;
        re[i + k] = ur + vr; im[i + k] = ui + vi;
        re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
        const nwr = cwr * wr - cwi * wi;
        cwi = cwr * wi + cwi * wr; cwr = nwr;
      }
    }
  }
  return { re, im };
}

/* Maior potência de 2 que cabe. Descarta o começo, não o fim: o fim é o
   presente, e é dele que se quer o estado de mar de AGORA. */
function recortePotenciaDe2(v) {
  let n = 1;
  while (n * 2 <= v.length) n *= 2;
  return v.slice(v.length - n);
}

/*
JANELA DE HANN, e por que ela é obrigatória aqui.

Um registro de 17 minutos cortado abruptamente equivale a multiplicar o sinal
por um retângulo — e a transformada de um retângulo espalha energia por TODO o
espectro (vazamento). Num espectro que depois será dividido por ω⁴, vazamento
para baixa frequência é o pior defeito possível: ele reaparece multiplicado
por milhões.

O fator 8/3 restaura a variância que a janela consome, para que m₀ continue
significando a variância do mar.
*/
function janelaHann(v) {
  const n = v.length, out = new Float64Array(n);
  for (let i = 0; i < n; i++) out[i] = v[i] * 0.5 * (1 - Math.cos(2 * Math.PI * i / (n - 1)));
  return { dados: out, correcao: 8 / 3 };
}

/* Espectro de densidade de potência de uma série real, em unidade²/Hz. */
function densidadeEspectral(serie, dt) {
  const v = recortePotenciaDe2(serie);
  const n = v.length;
  if (n < 64) return null;
  const media = v.reduce((a, b) => a + b, 0) / n;
  /* Tirar a média é REDUNDANTE e fica de propósito. O laço do espectro começa
     em k=1, então o bin zero — que é a média — já não entra em conta nenhuma;
     medido: um viés de 5 m/s² não move o Hs em nenhuma casa decimal. Fica
     porque custa nada e porque protege quem um dia mexer no limite do laço. */
  const centrado = Array.from(v, x => x - media);
  const { dados, correcao } = janelaHann(centrado);
  const { re, im } = fft(dados);

  const df = 1 / (n * dt);
  const metade = n / 2;
  const S = new Float64Array(metade), f = new Float64Array(metade);
  for (let k = 1; k < metade; k++) {
    f[k] = k * df;
    // Densidade unilateral: 2·|X|²/(n²·df), com a correção da janela.
    S[k] = 2 * (re[k] * re[k] + im[k] * im[k]) / (n * n * df) * correcao;
  }
  return { f, S, df, n, dt };
}

// ═══════════════════════════════════════════════════════════════════════
// O ESPECTRO DE HEAVE E OS PARÂMETROS DE MAR
// ═══════════════════════════════════════════════════════════════════════

/*
A CONVERSÃO. S_η = S_a/ω⁴, com a banda cortada nos dois extremos.

Note o corte de banda ANTES da divisão, e não depois: dividir primeiro
produziria números astronômicos em 0,001 Hz que depois seriam descartados —
mas que já teriam contaminado qualquer soma feita no caminho.
*/
function espectroDeHeave(acelVertical, dt) {
  const e = densidadeEspectral(acelVertical, dt);
  if (!e) return null;
  const { f, S, df } = e;
  const Sh = new Float64Array(S.length);
  for (let k = 1; k < S.length; k++) {
    if (f[k] < ONDA_F_MIN || f[k] > ONDA_F_MAX) continue;   // fora da banda: zero
    const w = 2 * Math.PI * f[k];
    Sh[k] = S[k] / Math.pow(w, 4);
  }
  return { f, S: Sh, df, dt, n: e.n };
}

/* Momentos espectrais: m_j = ∫ ω^j · S(ω) dω, calculados em f e convertidos. */
function momentos(esp) {
  if (!esp) return null;
  let m0 = 0, m1 = 0, m2 = 0, m4 = 0;
  for (let k = 1; k < esp.S.length; k++) {
    const s = esp.S[k];
    if (!s) continue;
    const w = 2 * Math.PI * esp.f[k], dw = 2 * Math.PI * esp.df;
    m0 += s * dw / (2 * Math.PI) * (2 * Math.PI);   // ∫S(f)df = ∫S(ω)dω/2π · 2π
    m1 += s * w * esp.df;
    m2 += s * w * w * esp.df;
    m4 += s * Math.pow(w, 4) * esp.df;
  }
  // m0 pela integral em f, que é a variância — a forma menos sujeita a
  // confusão de convenção entre S(f) e S(ω).
  m0 = 0;
  for (let k = 1; k < esp.S.length; k++) m0 += esp.S[k] * esp.df;
  return { m0, m1, m2, m4 };
}

/*
ALTURA SIGNIFICATIVA. Hs = 4√m₀ é a definição espectral moderna (Hm0), e vale
para mar aleatório de banda estreita.

⚠️  PARA ONDA REGULAR ELA NÃO DÁ A ALTURA DA ONDA. Uma senoide de amplitude a
tem altura H = 2a mas m₀ = a²/2, logo Hs = 4·a/√2 = 2,83·a = 1,41·H. Não é
erro: é a definição. Quem conferir este código com uma senoide precisa esperar
2,83·a, e a prova 24.2 espera exatamente isso.
*/
function alturaSignificativa(m0) {
  return isFinite(m0) && m0 > 0 ? 4 * Math.sqrt(m0) : NaN;
}

/* Período médio de cruzamento de zero e período de pico. */
function parametrosDeMar(esp) {
  const m = momentos(esp);
  if (!m || !(m.m0 > 0)) return null;
  const Tz = 2 * Math.PI * Math.sqrt(m.m0 / m.m2);
  let kPico = 1, maior = 0;
  for (let k = 1; k < esp.S.length; k++) if (esp.S[k] > maior) { maior = esp.S[k]; kPico = k; }
  const Tp = esp.f[kPico] > 0 ? 1 / esp.f[kPico] : NaN;
  return { Hs: alturaSignificativa(m.m0), Tz, Tp, m0: m.m0, m2: m.m2 };
}

/*
CONFIABILIDADE — o RAO admitido em vez de escondido.

Devolve o quanto se pode confiar no Hs medido, dado o período dominante e o
comprimento do navio. Não é uma correção: é um ROTULO. Corrigir exigiria o RAO
deste casco, que ninguém levantou — e inventar um RAO seria o mesmo pecado de
chamar lista de faróis de linha de costa.
*/
function comprimentoDeOnda(T) {
  const t = Number(T);
  return isFinite(t) && t > 0 ? ONDA_G * t * t / (2 * Math.PI) : NaN;
}

function confiabilidadeDaOnda(Tp, loaM) {
  const lambda = comprimentoDeOnda(Tp);
  const loa = Number(loaM);
  if (!isFinite(lambda) || !isFinite(loa) || loa <= 0) return null;
  const razao = lambda / loa;
  if (razao >= 4) return { razao, nivel: 'boa', texto: 'onda bem mais longa que o navio — a medida é confiável' };
  if (razao >= 2) return { razao, nivel: 'razoavel', texto: 'onda pouco mais longa que o navio — a medida subestima um pouco' };
  return { razao, nivel: 'ruim', texto: 'onda curta para este casco — o navio atravessa e a medida subestima bastante' };
}

// ═══════════════════════════════════════════════════════════════════════
// ESTABILIDADE: O GM PELO PERÍODO DE BALANÇO
// ═══════════════════════════════════════════════════════════════════════

/*
════════════════════════════════════════════════════════════════════════════════
  ⚠️  A PARTE MAIS VALIOSA E MAIS PERIGOSA DESTE MÓDULO
════════════════════════════════════════════════════════════════════════════════
  O período natural de balanço carrega a estabilidade transversal do navio:

      T_R = 2·C·B / √GM        ->        GM = (2·C·B / T_R)²

      C = 0,373 + 0,023·(B/d) − 0,043·(L/100)      (coeficiente da IMO)

  Para o ASD 2810 (B = 10,43 m, L = 28,67 m, d ≈ 4,8 m): C = 0,411, e portanto
  GM = (8,57 / T_R)².

      T_R = 5,0 s  ->  GM = 2,94 m   duro, seco, quebra coisa
      T_R = 6,0 s  ->  GM = 2,04 m   confortável
      T_R = 7,0 s  ->  GM = 1,50 m   atenção
      T_R = 8,0 s  ->  GM = 1,15 m   🔴 o barco está amolecendo

  POR QUE ISSO IMPORTA NUM REBOCADOR. Não é a onda grande que emborca: é o GM
  que baixou sem ninguém notar — superfície livre em tanque parcialmente cheio,
  água no convés que não escoou, peso que subiu, e sobretudo o PUXÃO DO CABO NA
  CINTURA. Um rebocador que emborca raramente avisa. Mas o período de balanço
  avisa, e ninguém escuta.

  ⚠️  AS TRÊS RESSALVAS, QUE VÃO TAMBÉM NO MANUAL E NA FALA:

  1. A SENSIBILIDADE É QUADRÁTICA. dGM/GM = −2·dT/T: 10% de erro no período
     vira 20% de erro no GM. É INDICADOR DE TENDÊNCIA, não cálculo de
     estabilidade. A prancha continua mandando.

  2. SÓ VALE COM BALANÇO LIVRE. Se o período de encontro estiver perto do
     natural, o navio balança FORÇADO e o que se mede é a onda, não o navio.
     Pior ainda em mar de popa longo, onde o encontro estica e o balanço segue
     a onda. Por isso a qualidade da medida é devolvida junto — ver
     qualidadeDoBalanco().

  3. O COEFICIENTE C É EMPÍRICO. A fórmula da IMO é uma aproximação para
     cascos convencionais; um rebocador ASD com dutos e skeg não é exatamente
     isso. O NÚMERO ABSOLUTO pode estar deslocado; a TENDÊNCIA, não — e é a
     tendência que salva.
*/

/* Coeficiente C da IMO. Fora de faixa devolve o valor central em vez de um
   número absurdo — mas AVISA, porque C mal estimado desloca o GM inteiro. */
function coeficienteC(B, L, calado) {
  const b = Number(B), l = Number(L), d = Number(calado);
  if (!isFinite(b) || !isFinite(l) || !isFinite(d) || b <= 0 || l <= 0 || d <= 0) return null;
  const c = 0.373 + 0.023 * (b / d) - 0.043 * (l / 100);
  return { c, plausivel: c > 0.25 && c < 0.60 };
}

function gmDoPeriodo(periodoS, B, L, calado) {
  const T = Number(periodoS);
  const cc = coeficienteC(B, L, calado);
  if (!cc || !isFinite(T) || T <= 0) return null;
  const gm = Math.pow(2 * cc.c * Number(B) / T, 2);
  return {
    gm, c: cc.c, cPlausivel: cc.plausivel, periodoS: T,
    /* A sensibilidade, devolvida junto com o número: quem recebe um GM sem
       saber que 10% de erro no período vira 20% no GM vai confiar demais. */
    sensibilidade: 2,
    faixa: { min: Math.pow(2 * cc.c * Number(B) / (T * 1.1), 2),
             max: Math.pow(2 * cc.c * Number(B) / (T * 0.9), 2) }
  };
}

/* Período natural de balanço, do pico do espectro do JOGO. Espectro e não
   cruzamento de zero: em mar irregular o cruzamento conta meias-ondas
   parasitas e o período sai curto. */
function periodoDeBalanco(serieRollGraus, dt) {
  const e = densidadeEspectral(serieRollGraus, dt);
  if (!e) return null;
  let kPico = 1, maior = 0, energia = 0;
  for (let k = 1; k < e.S.length; k++) {
    if (e.f[k] < 1 / 30 || e.f[k] > 1 / 3) continue;      // 3 s a 30 s: balanço de navio
    energia += e.S[k] * e.df;
    if (e.S[k] > maior) { maior = e.S[k]; kPico = k; }
  }
  if (!maior || !e.f[kPico]) return null;
  const T = 1 / e.f[kPico];
  /*
  AMPLITUDE, NÃO ALTURA — 2√m₀ e não 4√m₀.

  Para onda usa-se Hs = 4√m₀ porque o que interessa é a ALTURA, de cava a
  crista. Para balanço o marinheiro fala em AMPLITUDE, de prumo a bordo:
  "jogando 10 graus" quer dizer 10 para cada lado, não 10 no total.

  Usar a mesma fórmula da onda daria 18,7° para um jogo cuja amplitude
  dominante é 6,5° — quase o TRIPLO, e seria lido como um mar muito pior do
  que o que está lá fora. 2√m₀ é a amplitude significativa, que corresponde
  aproximadamente à média do terço maior das amplitudes.
  */
  const amplitude = 2 * Math.sqrt(Math.max(0, energia));
  return { periodoS: T, amplitudeGraus: amplitude, energia };
}

/*
PERÍODO DE ENCONTRO — e é ele que decide se a medida do balanço vale.

    c  = g·T/(2π)            celeridade da onda
    Te = T / |1 − V·cos μ / c|

  μ = 0 em mar de popa (a onda vai para o mesmo lado que o navio), 180° em mar
  de proa. Em mar de popa Te ESTICA — a 10 nós numa onda de 8 s o encontro vai
  a 13,6 s, e é aí que mora o perigo clássico do mar de popa.
*/
/* Acima disso não há "encontro": o navio está montado na onda. */
const ONDA_TE_MAX = 60;

function periodoDeEncontro(T, velNos, muGraus) {
  const t = Number(T), v = Number(velNos), mu = Number(muGraus);
  if (!isFinite(t) || t <= 0 || !isFinite(v) || !isFinite(mu)) return null;
  const c = ONDA_G * t / (2 * Math.PI);               // m/s
  const vms = v * 0.514444;
  const den = 1 - (vms * Math.cos(mu * Math.PI / 180)) / c;
  /*
  "SURFANDO" SE DEFINE PELO RESULTADO, NÃO PELO DENOMINADOR.

  A primeira versão marcava surfe com |den| < 1e-3 — um fio de navalha. Um
  navio a 24,3 nós numa onda de 8 s (celeridade 24,29 nós) dava den = 1,2e-3 e
  passava batido, embora esteja andando JUNTO com a onda, que é exatamente a
  condição perigosa.

  O que importa fisicamente é o encontro ficar tão longo que deixa de haver
  encontro: acima de 60 segundos o navio está montado na onda, e aí não há
  período de encontro que signifique alguma coisa. Definir pelo Te resultante
  cobre todos os caminhos de chegar lá.
  */
  const Te = Math.abs(den) < 1e-9 ? Infinity : t / Math.abs(den);
  return { Te, c, den, surfando: !isFinite(Te) || Te > ONDA_TE_MAX };
}

/*
RESSONÂNCIA — os dois casos que derrubam navio.

  SÍNCRONO      Te ≈ T_R        cada onda chega no tempo exato de empurrar o
                                balanço. A amplitude cresce a cada ciclo até o
                                amortecimento segurar — ou não segurar.
  PARAMÉTRICO   Te ≈ T_R/2      a estabilidade varia duas vezes por ciclo de
                                balanço (cava e crista mudam a área de
                                flutuação). Cresce rápido e pega gente de
                                surpresa porque o mar não parece perigoso.

A faixa de ±15% não é capricho: fora dela o acoplamento cai rápido, e alertar
por 30% de distância seria criar o alarme que se aprende a ignorar.
*/
const ONDA_RESSONANCIA_TOL = 0.15;

function alertaDeRessonancia(periodoBalanco, Te) {
  const tr = Number(periodoBalanco), te = Number(Te);
  if (!isFinite(tr) || tr <= 0 || !isFinite(te) || te <= 0) return null;
  const rSinc = Math.abs(te - tr) / tr;
  const rPar = Math.abs(te - tr / 2) / (tr / 2);
  if (rSinc <= ONDA_RESSONANCIA_TOL) {
    return { tipo: 'sincrono', razao: te / tr,
      texto: `balanço síncrono: o encontro das ondas está em ${te.toFixed(1)} segundos e o ` +
             `balanço natural em ${tr.toFixed(1)} — cada onda chega empurrando no mesmo tempo` };
  }
  if (rPar <= ONDA_RESSONANCIA_TOL) {
    return { tipo: 'parametrico', razao: te / tr,
      texto: `risco de balanço paramétrico: o encontro está em ${te.toFixed(1)} segundos, ` +
             `metade do balanço natural de ${tr.toFixed(1)}` };
  }
  return null;
}

/*
A MEDIDA DO BALANÇO VALE? — a ressalva 2, transformada em função.

Se o encontro está muito perto do natural, o navio balança FORÇADO: o pico do
espectro de jogo é a onda, não o navio, e inverter isso como se fosse o
período natural dá um GM errado com cara de certo. Melhor não dizer nada.

E balanço pequeno demais não tem pico: 1 grau de amplitude em mar chato é
ruído de sensor, e o "período" extraído dali é sorteio.
*/
const ONDA_BALANCO_MIN_GRAUS = 1.5;

function qualidadeDoBalanco(balanco, Te) {
  if (!balanco) return { confiavel: false, motivo: 'sem sinal de balanço' };
  if (!(balanco.amplitudeGraus >= ONDA_BALANCO_MIN_GRAUS)) {
    return { confiavel: false,
             motivo: `balanço de apenas ${balanco.amplitudeGraus.toFixed(1)} grau(s) — sem sinal para medir o período` };
  }
  if (isFinite(Te) && Te > 0) {
    const perto = Math.abs(Te - balanco.periodoS) / balanco.periodoS;
    if (perto <= ONDA_RESSONANCIA_TOL) {
      return { confiavel: false,
               motivo: 'o navio está balançando forçado pela onda — o período medido é o do mar, não o do navio' };
    }
  }
  return { confiavel: true, motivo: '' };
}

// ═══════════════════════════════════════════════════════════════════════
// COLETA A BORDO — o tablet vira instrumento
// ═══════════════════════════════════════════════════════════════════════

/*
════════════════════════════════════════════════════════════════════════════════
  COMO SE TIRA O HEAVE DO QUE O APARELHO ENTREGA — escolhido por medição
════════════════════════════════════════════════════════════════════════════════
  `accelerationIncludingGravity` devolve o vetor no referencial DO APARELHO,
  que está jogando e caturrando junto com o navio. Para chegar à componente
  vertical havia dois caminhos:

    a) girar o vetor pelo roll/pitch fundidos e pegar o eixo Z da Terra;
    b) tomar o MÓDULO do vetor e subtrair g.

  O (a) é teoricamente mais correto e praticamente mais frágil: depende de
  acertar a convenção de sinais de beta/gamma do DeviceOrientation, que varia
  com aparelho e com a montagem do tablete. Um sinal trocado ali não aparece
  como erro — aparece como um espectro plausível e errado.

  O (b) é imune a convenção. O custo é acoplamento de segunda ordem com as
  acelerações horizontais e o cosseno do ângulo de jogo.

  FOI MEDIDO, com mar sintetizado de Hs conhecido e o aparelho simulado
  jogando, caturrando e com sway:

      jogo   sway        |a| − g        a_z − g
        0°    0,0          +0,3%          +0,2%
       10°    0,0          +0,3%          −0,4%
       10°    0,8          +0,2%          −0,4%
       20°    1,5          −0,3%          −1,5%

  O módulo se segura em ±0,3% até 20° de jogo. Escolhido o (b), com dado na
  mão em vez de preferência estética.
*/
function aceleracaoVerticalDoModulo(ax, ay, az) {
  const x = Number(ax) || 0, y = Number(ay) || 0, z = Number(az) || 0;
  return Math.sqrt(x * x + y * y + z * z) - ONDA_G;
}

/*
JANELA E TAXA — por que 2 Hz e 17 minutos.

TAXA. A banda vai até 0,5 Hz; Nyquist pede mais que 1 Hz. Os 60 Hz que o
aparelho entrega são desperdício de bateria e de memória, então decima-se por
MÉDIA DE CAIXA (não por descarte): a média é um filtro anti-serrilhamento
pobre mas honesto, enquanto pegar 1 em cada 30 amostras dobraria a vibração de
máquina para dentro da banda de onda.

JANELA. 2048 amostras a 2 Hz são 1024 s ≈ 17 minutos — dentro da prática de
boia (20 a 30 min) e curta o bastante para o estado de mar não mudar durante o
registro. A resolução em frequência fica em 0,00098 Hz, de sobra.
*/
const ONDA_TAXA_HZ = 2;
const ONDA_JANELA = 2048;                       // 1024 s ≈ 17 min

let marAcel = [];          // aceleração vertical decimada
let marRoll = [];          // jogo, mesma taxa
let marCaixaSoma = 0, marCaixaN = 0, marCaixaRoll = 0, marUltimoT = 0;
let marHandler = null;
let marGmHistorico = [];   // {t, gm} para a tendência

/* Acumula na caixa e emite a 2 Hz. */
function alimentarSensorDeMar(av, rollGraus, agoraMs) {
  const t = isFinite(agoraMs) ? agoraMs : Date.now();
  marCaixaSoma += av; marCaixaRoll += (Number(rollGraus) || 0); marCaixaN++;
  const passo = 1000 / ONDA_TAXA_HZ;
  if (marUltimoT === 0) { marUltimoT = t; return false; }     // primeira amostra ancora o relógio
  if (t - marUltimoT < passo) return false;
  /*
  O RELÓGIO AVANÇA POR PASSO, NÃO PELA CHEGADA.

  `marUltimoT = t` parecia inofensivo e produzia uma taxa de 1,97 Hz em vez de
  2: o evento chega a 60 Hz, então a emissão acontece no primeiro tique DEPOIS
  dos 500 ms, e o atraso se acumula. Resultado: 2004 amostras onde deviam
  caber 2048 — e o recorte por potência de 2 caía para 1024, METADE do
  registro. Somar o passo fixo mantém a base de tempo; o `Math.max` recupera
  se o aparelho engasgar e pular vários passos.
  */
  marUltimoT = Math.max(marUltimoT + passo, t - passo);
  if (!marCaixaN) return false;
  marAcel.push(marCaixaSoma / marCaixaN);
  marRoll.push(marCaixaRoll / marCaixaN);
  marCaixaSoma = 0; marCaixaRoll = 0; marCaixaN = 0;
  if (marAcel.length > ONDA_JANELA) { marAcel = marAcel.slice(-ONDA_JANELA); marRoll = marRoll.slice(-ONDA_JANELA); }
  return true;
}

/* Dimensões do casco em uso, do registro da frota 3D. Sem elas não há GM. */
function cascoAtual() {
  try {
    if (typeof shipModelAtual === 'function') {
      const m = shipModelAtual();
      if (m && isFinite(m.loa) && isFinite(m.boca) && isFinite(m.calado)) {
        return { loa: m.loa, boca: m.boca, calado: m.calado, nome: m.nome };
      }
    }
  } catch (e) { }
  return null;
}

/*
O ESTADO DE MAR MEDIDO — e tudo o que o acompanha para não ser mal usado.

Devolve null enquanto não houver janela cheia. Meia janela daria um número, e
um número prematuro é pior que nenhum: ele entra no diário, vira referência e
ninguém lembra que veio de três minutos de registro.
*/
/*
A JANELA MÍNIMA É A JANELA INTEIRA — 2048 amostras, ~17 minutos. E isso foi
MEDIDO, não arbitrado.

Com meia janela (512 s) o algoritmo perdia 13% do Hs. A causa foi localizada:
num registro curto, parte da variância do deslocamento aparece ABAIXO de
0,03 Hz — onde a divisão por ω⁴ a torna inutilizável e a banda a descarta com
razão. Não é defeito do espectro: com senoides puras o pipeline é exato a
0,0% até em 256 amostras. É que um mar real, olhado por pouco tempo, tem
deriva lenta que não se distingue de onda longa.

  registro de 1024 s  ->  Hs com +0,6% de erro
  registro de  512 s  ->  Hs com −13,4% de erro

Boia de onda usa 20 a 30 minutos pelo mesmo motivo. Meia janela daria um
número, e número prematuro é pior que nenhum: entra no diário, vira
referência, e ninguém lembra que veio de oito minutos de registro.
*/
const ONDA_MIN_JANELA = 2048;

function estadoDoMarMedido(velNos, rumoGraus) {
  if (marAcel.length < ONDA_MIN_JANELA) {
    return { pronto: false, faltamS: Math.round((ONDA_MIN_JANELA - marAcel.length) / ONDA_TAXA_HZ) };
  }
  const dt = 1 / ONDA_TAXA_HZ;
  const par = parametrosDeMar(espectroDeHeave(marAcel, dt));
  if (!par || !isFinite(par.Hs)) return { pronto: false, faltamS: 0 };

  const casco = cascoAtual();
  const conf = casco ? confiabilidadeDaOnda(par.Tp, casco.loa) : null;

  /* Direção da onda: o Open-Meteo dá, o tablet NÃO. Um acelerômetro vertical
     não sabe de onde vem a onda — para isso seria preciso o par de
     inclinações, e a fusão de atitude do app não é boa o bastante para
     bancar essa afirmação. Fica em aberto, declarado. */
  const dirPrevista = (typeof tempoAtual !== 'undefined' && tempoAtual && tempoAtual.mar)
    ? Number(tempoAtual.mar.wave_direction) : NaN;
  const mu = (isFinite(dirPrevista) && isFinite(rumoGraus))
    // wave_direction é DE ONDE a onda vem; μ mede o ângulo entre o RUMO e a
    // direção para onde a onda VAI — daí o +180.
    ? ((dirPrevista + 180 - rumoGraus) % 360 + 360) % 360 : NaN;
  const enc = isFinite(mu) ? periodoDeEncontro(par.Tp, velNos, mu) : null;

  const bal = periodoDeBalanco(marRoll, dt);
  const qual = qualidadeDoBalanco(bal, enc && enc.Te);
  const gm = (bal && qual.confiavel && casco)
    ? gmDoPeriodo(bal.periodoS, casco.boca, casco.loa, casco.calado) : null;
  if (gm) {
    marGmHistorico.push({ t: Date.now(), gm: gm.gm });
    if (marGmHistorico.length > 96) marGmHistorico = marGmHistorico.slice(-96);
  }
  const ress = bal ? alertaDeRessonancia(bal.periodoS, enc && enc.Te) : null;

  return {
    pronto: true, Hs: par.Hs, Tz: par.Tz, Tp: par.Tp,
    confiabilidade: conf, balanco: bal, qualidadeBalanco: qual,
    gm, tendenciaGm: tendenciaDoGm(marGmHistorico), encontro: enc, ressonancia: ress,
    // O modelo, para comparar. É a calibração de que falava a proposta: com o
    // tempo, a razão entre medido e previsto É o RAO deste casco levantado
    // no mar de verdade.
    HsPrevisto: (typeof tempoAtual !== 'undefined' && tempoAtual && tempoAtual.mar)
      ? Number(tempoAtual.mar.wave_height) : NaN,
    janelaS: Math.round(marAcel.length / ONDA_TAXA_HZ)
  };
}

/*
A TENDÊNCIA DO GM — o que de fato salva rebocador.

O número absoluto do GM depende do coeficiente C empírico e pode estar
deslocado. A TENDÊNCIA não depende de C nenhum: se o período de balanço
alonga, o GM caiu, e isso é verdade qualquer que seja o coeficiente.

É por isso que esta função importa mais que o gmDoPeriodo(): um GM de 1,8 m
não diz muita coisa sozinho; um GM que foi de 2,0 para 1,3 em duas horas diz
que alguma coisa mudou a bordo e ninguém percebeu.
*/
const ONDA_GM_QUEDA_ALERTA = 0.20;    // 20% em até 3 h

function tendenciaDoGm(hist) {
  const h = (Array.isArray(hist) ? hist : []).filter(x => x && isFinite(x.gm) && isFinite(x.t));
  if (h.length < 3) return null;
  const agora = h[h.length - 1];
  const antigos = h.filter(x => agora.t - x.t <= 3 * 3600000);
  if (antigos.length < 3) return null;
  const primeiro = antigos[0];
  const horas = (agora.t - primeiro.t) / 3600000;
  if (horas < 0.5) return null;
  const variacao = (agora.gm - primeiro.gm) / primeiro.gm;
  return {
    de: primeiro.gm, para: agora.gm, horas, variacao,
    caindo: variacao <= -ONDA_GM_QUEDA_ALERTA,
    texto: variacao <= -ONDA_GM_QUEDA_ALERTA
      ? `o balanço alongou nas últimas ${horas.toFixed(1)} horas: o GM estimado caiu de ` +
        `${primeiro.gm.toFixed(1)} para ${agora.gm.toFixed(1)} metros. Vale conferir tanques e convés`
      : ''
  };
}

/* Liga a escuta dos sensores. Roda durante a navegação inteira, não só com o
   painel 3D aberto: 17 minutos de janela não se juntam em visitas rápidas. */
function iniciarSensoresDeMar() {
  marAcel = []; marRoll = []; marGmHistorico = [];
  marCaixaSoma = 0; marCaixaN = 0; marCaixaRoll = 0; marUltimoT = 0;
  if (typeof window === 'undefined' || !window.DeviceMotionEvent) return false;
  if (marHandler) return true;
  marHandler = (ev) => {
    const a = ev.accelerationIncludingGravity;
    if (!a) return;
    const roll = (typeof shipAttitude !== 'undefined' && shipAttitude) ? shipAttitude.roll : 0;
    alimentarSensorDeMar(aceleracaoVerticalDoModulo(a.x, a.y, a.z), roll, ev.timeStamp && Date.now());
  };
  window.addEventListener('devicemotion', marHandler, true);
  return true;
}

function pararSensoresDeMar() {
  if (marHandler) { window.removeEventListener('devicemotion', marHandler, true); marHandler = null; }
}

/*
A LINHA DO MAR MEDIDO NO PAINEL — e a comparação com o modelo.

Mostrar medido e previsto lado a lado é o produto imediato da calibração: o
comandante vê de relance se o modelo está acertando hoje. Com o tempo, a razão
entre os dois É o RAO deste casco levantado no mar de verdade — mas isso é
observação acumulada, não número de agora, e por isso não se anuncia.
*/
function linhaDeMarNoPainel() {
  const e = estadoDoMarMedido(
    (typeof navLastFix !== 'undefined' && navLastFix) ? navLastFix.sog : NaN,
    (typeof rumoParaProximoWp === 'function') ? rumoParaProximoWp() : NaN);
  if (!e) return '';
  if (!e.pronto) {
    return e.faltamS > 0 ? `📈 medindo o mar… faltam ${Math.ceil(e.faltamS / 60)} min` : '';
  }
  const p = [`📈 sentido ${e.Hs.toFixed(1).replace('.', ',')} m / ${e.Tp.toFixed(0)} s`];
  if (isFinite(e.HsPrevisto)) p.push(`modelo ${e.HsPrevisto.toFixed(1).replace('.', ',')} m`);
  if (e.balanco) p.push(`jogo ${e.balanco.amplitudeGraus.toFixed(0)}° / ${e.balanco.periodoS.toFixed(1)} s`);
  if (e.gm) p.push(`GM~${e.gm.gm.toFixed(1)} m`);
  else if (e.qualidadeBalanco && !e.qualidadeBalanco.confiavel) p.push('GM: sem medida confiável');
  if (e.confiabilidade && e.confiabilidade.nivel === 'ruim') p.push('⚠️ onda curta p/ este casco');
  return p.join(' · ');
}

function atualizarPainelMar() {
  const el = document.getElementById('navMarMedido');
  if (!el) return;
  const t = linhaDeMarNoPainel();
  el.className = 'nav-line nav-mar' + (t ? ' active' : '');
  el.textContent = t;
}
