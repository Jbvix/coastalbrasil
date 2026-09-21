/* ═══════════════════════════════════════════════════════════════════════════
   MAR SINTÉTICO — a bancada que substitui ir ao mar
   Autor: Jossian Brito (Charlie Bravo)  ·  2026-09-21

   Não há como verificar um espectro de ondas sem uma onda de Hs conhecido.
   Aqui se fabrica uma: espectro Pierson-Moskowitz de Hs e Tp declarados,
   somado por componentes de fase aleatória, devolvendo a ELEVAÇÃO e a
   ACELERAÇÃO — o par que permite alimentar o pipeline pela aceleração e
   cobrar dele a elevação de volta.

   A semente é fixa e o gerador é reprodutível de propósito: prova que sorteia
   número diferente a cada execução é prova que falha sozinha de vez em quando
   e ninguém descobre por quê.
   ═══════════════════════════════════════════════════════════════════════════ */
/* Sintetizador de mar: espectro Pierson-Moskowitz de Hs e Tp conhecidos,
   somando componentes de fase aleatória. Devolve elevação E aceleração — é o
   par que permite verificar o pipeline inteiro de ponta a ponta. */
function marSintetico({ Hs, Tp, n, dt, semente = 1 }) {
  // Gerador reprodutível: prova que sorteia número diferente a cada execução
  // é prova que falha sozinha às vezes, e ninguém descobre por quê.
  let s = semente;
  const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  const fp = 1 / Tp;
  const comp = [];
  const df = 0.002;
  for (let f = 0.03; f <= 0.5; f += df) {
    // Pierson-Moskowitz na forma de Hs e fp.
    const S = 0.3125 * Hs * Hs * Math.pow(fp, 4) * Math.pow(f, -5) *
              Math.exp(-1.25 * Math.pow(fp / f, 4));
    const a = Math.sqrt(2 * S * df);
    if (a > 1e-6) comp.push({ w: 2 * Math.PI * f, a, fase: rnd() * 2 * Math.PI });
  }
  const eta = new Float64Array(n), acel = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const t = i * dt;
    let e = 0, ac = 0;
    for (const c of comp) {
      e += c.a * Math.sin(c.w * t + c.fase);
      ac += -c.a * c.w * c.w * Math.sin(c.w * t + c.fase);   // segunda derivada
    }
    eta[i] = e; acel[i] = ac;
  }
  // Hs de verdade da realização sintetizada (4·desvio-padrão), que é o alvo
  // honesto: a realização sorteada nunca tem exatamente o Hs nominal.
  const m = Array.from(eta).reduce((x, y) => x + y, 0) / n;
  const varr = Array.from(eta).reduce((x, y) => x + (y - m) * (y - m), 0) / n;
  return { eta, acel, HsReal: 4 * Math.sqrt(varr), comp: comp.length };
}
module.exports = { marSintetico };
