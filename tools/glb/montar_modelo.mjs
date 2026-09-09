/*
  Coastal Navigator Brasil — montagem do GLB de um casco da frota 3D
  Autor: Jossian Brito (Charlie Bravo) · 2026-09-07 · v1.0

  O PROBLEMA QUE ESTE PROGRAMA RESOLVE
    O FBX2glTF traz geometria e coordenadas de UV intactas, mas costuma ligar
    ZERO texturas — não por defeito dele: os materiais exportados de um pacote
    de modelagem frequentemente trazem `Kd = 0,00 0,00 0,00` e nenhuma
    propriedade de difusa, de modo que não há em que pendurar a cor. Fica com
    a geometria certa e o navio preto.

    Aqui as texturas são religadas casando o código de quatro dígitos que
    aparece nos DOIS lados: no nome do material (`Hool_1002_mat`) e no nome do
    arquivo (`1002_basecolor.webp`, gerado por empacotar_texturas.py).

  A LINHA QUE DECIDE TUDO
    setBaseColorFactor([1,1,1,1]) antes de pendurar a cor-base. O glTF
    MULTIPLICA o fator pela textura. Herdando o Kd preto do FBX, o fator seria
    [0,0,0,1] e toda textura seria multiplicada por zero — casco preto, com as
    imagens todas lá dentro, corretas e invisíveis.

  A DECIMAÇÃO
    RATIO é a fração de triângulos que sobra. 0,15 pedido devolveu 0,27 no ASD
    2810: `lockBorder` impede o simplificador de mexer nas bordas abertas, e um
    casco cheio de recortes tem muita borda. É o comportamento desejado —
    afrouxar abriria costura no costado.

  USO
    RATIO=0.15 node montar_modelo.mjs <entrada.glb> <pasta_texturas> <saida.glb>
*/
import { NodeIO, Document } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTTextureWebP, KHRDracoMeshCompression } from '@gltf-transform/extensions';
import { weld, simplify, dedup, prune, resample, textureCompress } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import draco3d from 'draco3dgltf';
import fs from 'node:fs';
import path from 'node:path';

const [ENTRADA, TEX, SAIDA] = process.argv.slice(2);
if (!ENTRADA || !TEX || !SAIDA) {
  console.error('uso: RATIO=0.15 node montar_modelo.mjs <entrada.glb> <pasta_texturas> <saida.glb>');
  process.exit(1);
}
const RATIO = Number(process.env.RATIO || 0.15);

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({
    'draco3d.encoder': await draco3d.createEncoderModule(),
    'draco3d.decoder': await draco3d.createDecoderModule(),
  });

const doc = await io.read(ENTRADA);
const root = doc.getRoot();
const webpExt = doc.createExtension(EXTTextureWebP).setRequired(true);

/*
  glTF guarda baseColorFactor em espaço LINEAR, não em sRGB. Passar o hex direto
  produz uma cor visivelmente mais clara e lavada do que a escolhida — o amarelo
  SAAM sairia creme. A conversão é a curva padrão do sRGB.
*/
function hexParaLinear(hex) {
  const h = hex.replace('#', '');
  const canal = (i) => {
    const c = parseInt(h.substr(i * 2, 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return [canal(0), canal(1), canal(2), 1];
}

const cache = new Map();
function tex(file, name) {
  if (cache.has(file)) return cache.get(file);
  const p = path.join(TEX, file);
  if (!fs.existsSync(p)) return null;
  const t = doc.createTexture(name).setMimeType('image/webp').setImage(fs.readFileSync(p)).setURI(name + '.webp');
  cache.set(file, t);
  return t;
}

let wired = 0;
for (const mat of root.listMaterials()) {
  const m = /(\d{4})/.exec(mat.getName() || '');
  if (!m) continue;
  const id = m[1];
  // O FBX trazia Kd = 0,0,0 — sem este reset toda textura seria multiplicada por preto.
  mat.setBaseColorFactor([1, 1, 1, 1]).setMetallicFactor(1).setRoughnessFactor(1);

  const bc = tex(`${id}_basecolor.webp`, `${id}_basecolor`);
  if (bc) mat.setBaseColorTexture(bc);
  const orm = tex(`${id}_orm.webp`, `${id}_orm`);
  if (orm) mat.setMetallicRoughnessTexture(orm);
  else { mat.setMetallicFactor(0.1).setRoughnessFactor(0.6); }
  const nrm = tex(`${id}_normal.webp`, `${id}_normal`);
  if (nrm) mat.setNormalTexture(nrm);
  const emi = tex(`${id}_emissive.webp`, `${id}_emissive`);
  if (emi) mat.setEmissiveTexture(emi).setEmissiveFactor([1, 1, 1]);

  // Guincho: não tem mapa de cor no material de origem, só metalicidade. A cor
  // vem de um fator, e a libré escolhe qual — cinza-aço no casco vermelho,
  // amarelo na libré SAAM. COR_GUINCHO recebe hex (ex.: F5BE1E).
  if (id === '1005' && !bc) mat.setBaseColorFactor(hexParaLinear(process.env.COR_GUINCHO || '9EA1A6'));
  if (id === '1006') { // vidros da ponte
    mat.setBaseColorFactor([0.09, 0.13, 0.16, 0.42]).setAlphaMode('BLEND')
       .setMetallicFactor(0).setRoughnessFactor(0.06).setDoubleSided(false);
  }
  wired++;
  console.log(`mat ${mat.getName()} -> bc:${!!bc} orm:${!!orm} nrm:${!!nrm} emi:${!!emi}`);
}

const tris = () => root.listMeshes().flatMap(m => m.listPrimitives())
  .reduce((s, p) => s + (p.getIndices() ? p.getIndices().getCount() : p.getAttribute('POSITION').getCount()) / 3, 0);
console.log(`materiais ligados: ${wired} | triângulos antes: ${tris()}`);

await doc.transform(
  resample(),
  dedup(),
  weld(),
  simplify({ simplifier: MeshoptSimplifier, ratio: RATIO, error: 0.0015, lockBorder: true }),
  prune({ keepAttributes: false, keepLeaves: false }),
);
console.log(`triângulos depois: ${Math.round(tris())}`);

doc.createExtension(KHRDracoMeshCompression).setRequired(true)
  .setEncoderOptions({ method: KHRDracoMeshCompression.EncoderMethod.EDGEBREAKER, quantizationBits: { POSITION: 14, NORMAL: 10, TEX_COORD: 12 } });

await io.write(SAIDA, doc);
console.log(`escrito ${SAIDA} — ${(fs.statSync(SAIDA).size / 1048576).toFixed(2)} MB`);
