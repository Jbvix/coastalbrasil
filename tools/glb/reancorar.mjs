/*
  Coastal Navigator Brasil — reancora a origem de um casco na LINHA D'ÁGUA
  Autor: Jossian Brito (Charlie Bravo) · 2026-09-08 · v1.0

  O PROBLEMA QUE ISTO RESOLVE
    No modo Earth o Cesium põe a entidade na altitude 0 e assenta ali a ORIGEM
    do modelo. Se a origem não coincide com a linha d'água, o casco nasce
    deslocado na vertical — e o erro seria discreto, não fosse o
    `minimumPixelSize`: para o navio não sumir ao longe, o Cesium o AMPLIA. E a
    ampliação multiplica o deslocamento.

    Medido no ASD 2810: a origem estava 4,96 m acima da linha d'água. Com o
    modelo ampliado 400x (o `maximumScale`), isso vira quase 2 km de
    afundamento — o casco desaparece sob o terreno e sobra o mastro. Foi
    exatamente o relato de bordo: "dou zoom out e ele começa a afundar,
    ficando só o mastro".

    O Rastar 3200 tinha o mesmo defeito, só que com 0,69 m de erro — 7x menor,
    e por isso nunca chamou atenção.

  POR QUE CORRIGIR NO MODELO E NÃO NO CÓDIGO
    Dava para somar um offset à altitude da entidade. Mas a escala do Cesium
    MUDA com a distância da câmera, então o offset teria de mudar junto, a cada
    quadro, e a conta erraria em cada transição. Reancorar a geometria custa
    uma vez e vale para toda escala, em qualquer motor.

    De quebra, o eixo de jogo e caturro na vista de Atitude passa a ficar NA
    LINHA D'ÁGUA — que é onde um navio de verdade balança, e não no centro de
    uma caixa que inclui o topo do mastro.

  USO
    node reancorar.mjs <entrada.glb> <saida.glb> <calado_m>

    <calado_m> é a altura da linha d'água ACIMA DO PONTO MAIS BAIXO do modelo.
    Atenção: o ponto mais baixo do ASD 2810 é a ponta do SKEG, não a quilha —
    medido, o skeg desce até y=-10,31 com meia-boca de 0,13 m (uma lâmina),
    enquanto o casco de verdade começa em y=-8,50. Calado medido à ponta do
    skeg, portanto.
*/
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, KHRDracoMeshCompression } from '@gltf-transform/extensions';
import { getBounds } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
import fs from 'node:fs';

const [ENTRADA, SAIDA, CALADO] = process.argv.slice(2);
if (!ENTRADA || !SAIDA || !CALADO) {
  console.error('uso: node reancorar.mjs <entrada.glb> <saida.glb> <calado_m>');
  process.exit(1);
}

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.encoder': await draco3d.createEncoderModule(),
  'draco3d.decoder': await draco3d.createDecoderModule(),
});

const doc = await io.read(ENTRADA);
const cena = doc.getRoot().listScenes()[0];
const antes = getBounds(cena);

// Alvo: origem na linha d'água (Y) e na linha de centro / meio-navio (X e Z),
// para que a guinada gire o navio em torno dele mesmo, e não de um canto.
const linhaDagua = antes.min[1] + Number(CALADO);
const desloc = [
  -(antes.min[0] + antes.max[0]) / 2,
  -linhaDagua,
  -(antes.min[2] + antes.max[2]) / 2,
];

// Um nó novo por cima preserva quaisquer transformações já existentes nos
// nós originais — mexer neles diretamente comporia errado.
const ancora = doc.createNode('ancora_linha_dagua').setTranslation(desloc);
for (const filho of cena.listChildren()) { cena.removeChild(filho); ancora.addChild(filho); }
cena.addChild(ancora);

doc.createExtension(KHRDracoMeshCompression).setRequired(true)
  .setEncoderOptions({ method: KHRDracoMeshCompression.EncoderMethod.EDGEBREAKER,
    quantizationBits: { POSITION: 14, NORMAL: 10, TEX_COORD: 12 } });

await io.write(SAIDA, doc);
const depois = getBounds(doc.getRoot().listScenes()[0]);
const f = (n) => n.toFixed(2).padStart(7);
console.log(`  antes : X ${f(antes.min[0])}..${f(antes.max[0])}  Y ${f(antes.min[1])}..${f(antes.max[1])}  Z ${f(antes.min[2])}..${f(antes.max[2])}`);
console.log(`  depois: X ${f(depois.min[0])}..${f(depois.max[0])}  Y ${f(depois.min[1])}..${f(depois.max[1])}  Z ${f(depois.min[2])}..${f(depois.max[2])}`);
console.log(`  deslocamento aplicado: [${desloc.map(v => v.toFixed(3)).join(', ')}]`);
console.log(`  origem agora na linha d'água (y=0), ${Number(CALADO).toFixed(2)} m acima do ponto mais baixo`);
console.log(`  ${SAIDA} — ${(fs.statSync(SAIDA).size / 1048576).toFixed(2)} MB`);
