/*
  Gera uma MÁSCARA EM ESPAÇO UV marcando as áreas da textura que ficam ABAIXO de
  uma altura do casco. Autor: Jossian Brito · 2026-09-09

  POR QUE ISTO É NECESSÁRIO: a textura não sabe o que é obra viva e o que é
  obra morta — ela é um plano. Só a geometria sabe. Para pintar de preto o
  costado abaixo da cinta de defensa, percorre-se cada TRIÂNGULO da malha do
  casco, olha-se a altura dos seus vértices no modelo, e quando ele está abaixo
  do corte pinta-se a área correspondente nas coordenadas UV.

  Assim a divisão azul/preto sai exatamente onde a chapa manda, e não onde um
  retângulo desenhado à mão adivinharia.
*/
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import draco3d from 'draco3dgltf';
import fs from 'node:fs';

const [ENTRADA, SAIDA, CORTE_Y, LADO] = process.argv.slice(2);
const N = Number(LADO || 2048), yCorte = Number(CORTE_Y);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule() });
const doc = await io.read(ENTRADA);

function anda(n, M, out) {
  const t = n.getTranslation(), s = n.getScale();
  const W = { t: [M.t[0] + t[0] * M.s[0], M.t[1] + t[1] * M.s[1], M.t[2] + t[2] * M.s[2]],
              s: [M.s[0] * s[0], M.s[1] * s[1], M.s[2] * s[2]] };
  if (n.getMesh()) out.push({ node: n, W });
  n.listChildren().forEach(c => anda(c, W, out));
}
const nós = [];
doc.getRoot().listScenes()[0].listChildren()
  .forEach(c => anda(c, { t: [0, 0, 0], s: [1, 1, 1] }, nós));

const casco = nós.find(x => /Hool/i.test(x.node.getName() || ''));
if (!casco) { console.error('malha do casco não encontrada'); process.exit(1); }
const prim = casco.node.getMesh().listPrimitives()[0];
const pos = prim.getAttribute('POSITION'), uv = prim.getAttribute('TEXCOORD_0');
const idx = prim.getIndices();
const nTri = idx ? idx.getCount() / 3 : pos.getCount() / 3;

// diagnóstico: faixa real de Y do casco depois das transformações
{ const v=[0,0,0]; let mn=1e9,mx=-1e9;
  for(let i=0;i<pos.getCount();i++){ pos.getElement(i,v);
    const y=v[1]*casco.W.s[1]+casco.W.t[1]; mn=Math.min(mn,y); mx=Math.max(mx,y); }
  console.log(`  casco no mundo: Y de ${mn.toFixed(2)} a ${mx.toFixed(2)} · escala ${casco.W.s[1]} · desloc ${casco.W.t[1].toFixed(2)}`);
  let uMin=1e9,uMax=-1e9; const t=[0,0];
  for(let i=0;i<uv.getCount();i++){ uv.getElement(i,t); uMin=Math.min(uMin,t[0],t[1]); uMax=Math.max(uMax,t[0],t[1]); }
  console.log(`  UV vão de ${uMin.toFixed(3)} a ${uMax.toFixed(3)}`); }

const mask = Buffer.alloc(N * N, 0);
const p = [0, 0, 0], a = [0, 0], b = [0, 0], c = [0, 0];
let abaixo = 0;

/* Rasteriza o triângulo UV, com folga de 2 px para as bordas não vazarem. */
/* As UV deste modelo vêm deslocadas por um inteiro (100% dos vértices caem fora
   de [0,1]); sem envolver, o triângulo cai fora do buffer e nada é pintado. */
const frac = (v) => { const f = v - Math.floor(v); return f < 0 ? f + 1 : f; };

function pinta(u0, v0, u1, v1, u2, v2) {
  // Envolve o triângulo inteiro pelo seu primeiro vértice, para não rasgá-lo
  // quando ele cruza a borda da textura.
  const du = Math.floor(u0), dv = Math.floor(v0);
  [u0, u1, u2] = [u0 - du, u1 - du, u2 - du];
  [v0, v1, v2] = [v0 - dv, v1 - dv, v2 - dv];
  const xs = [u0, u1, u2].map(u => u * N), ys = [v0, v1, v2].map(v => (1 - v) * N);
  const x0 = Math.max(0, Math.floor(Math.min(...xs)) - 2), x1 = Math.min(N - 1, Math.ceil(Math.max(...xs)) + 2);
  const y0 = Math.max(0, Math.floor(Math.min(...ys)) - 2), y1 = Math.min(N - 1, Math.ceil(Math.max(...ys)) + 2);
  const d = (xs[1] - xs[0]) * (ys[2] - ys[0]) - (xs[2] - xs[0]) * (ys[1] - ys[0]);
  if (Math.abs(d) < 1e-9) return;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const w0 = ((xs[1] - x) * (ys[2] - y) - (xs[2] - x) * (ys[1] - y)) / d;
    const w1 = ((xs[2] - x) * (ys[0] - y) - (xs[0] - x) * (ys[2] - y)) / d;
    const w2 = 1 - w0 - w1;
    if (w0 >= -0.02 && w1 >= -0.02 && w2 >= -0.02) mask[y * N + x] = 255;
  }
}

for (let t = 0; t < nTri; t++) {
  const i0 = idx ? idx.getScalar(t * 3) : t * 3;
  const i1 = idx ? idx.getScalar(t * 3 + 1) : t * 3 + 1;
  const i2 = idx ? idx.getScalar(t * 3 + 2) : t * 3 + 2;
  let alto = -1e9;
  for (const i of [i0, i1, i2]) {
    pos.getElement(i, p);
    alto = Math.max(alto, p[1] * casco.W.s[1] + casco.W.t[1]);
  }
  if (alto > yCorte) continue;            // triângulo inteiro tem de estar abaixo
  abaixo++;
  uv.getElement(i0, a); uv.getElement(i1, b); uv.getElement(i2, c);
  pinta(a[0], a[1], b[0], b[1], c[0], c[1]);
}
fs.writeFileSync(SAIDA, mask);
const cob = mask.reduce((s, v) => s + (v ? 1 : 0), 0) / (N * N);
console.log(`  triângulos abaixo de y=${yCorte}: ${abaixo} de ${nTri}`);
console.log(`  máscara ${N}x${N} salva em ${SAIDA} — ${(cob * 100).toFixed(1)}% da textura`);
