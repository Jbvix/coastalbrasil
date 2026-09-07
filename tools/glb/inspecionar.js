/*
 * Inspetor de GLB — valida se o modelo tem TEXTURA de verdade.
 *
 * Um .glb é um contêiner binário: cabeçalho de 12 bytes, depois pedaços
 * (chunks). O primeiro é o JSON do glTF, com toda a descrição da cena; o
 * segundo é o binário (geometria + imagens embutidas).
 *
 * "Ter textura" não é uma pergunta de sim/não. São três camadas:
 *   1. imagens embutidas no arquivo (images[])
 *   2. amostradores ligando imagem a material (textures[])
 *   3. materiais que REFERENCIAM essas texturas nos canais certos
 *      (baseColor, metallicRoughness, normal, occlusion, emissive)
 * E, sem coordenadas de UV na malha, a textura não tem onde pousar.
 */
const fs = require('fs');

function lerGLB(caminho) {
  const b = fs.readFileSync(caminho);
  if (b.readUInt32LE(0) !== 0x46546C67) throw new Error('não é um GLB (magic "glTF" ausente)');
  const versao = b.readUInt32LE(4), total = b.readUInt32LE(8);
  let off = 12, json = null, binLen = 0;
  while (off < b.length) {
    const len = b.readUInt32LE(off), tipo = b.readUInt32LE(off + 4);
    const dados = b.slice(off + 8, off + 8 + len);
    if (tipo === 0x4E4F534A) json = JSON.parse(dados.toString('utf8'));
    else if (tipo === 0x004E4942) binLen = len;
    off += 8 + len + ((4 - (len % 4)) % 4) * 0;
    off = off + ((4 - (off % 4)) % 4);
  }
  return { versao, total, json, binLen, bytes: b.length };
}

const CANAIS = [
  ['baseColorTexture',         g => g.pbrMetallicRoughness && g.pbrMetallicRoughness.baseColorTexture],
  ['metallicRoughnessTexture', g => g.pbrMetallicRoughness && g.pbrMetallicRoughness.metallicRoughnessTexture],
  ['normalTexture',            g => g.normalTexture],
  ['occlusionTexture',         g => g.occlusionTexture],
  ['emissiveTexture',          g => g.emissiveTexture],
];

function analisar(caminho, rotulo) {
  const { versao, json: g, binLen, bytes } = lerGLB(caminho);
  const imagens   = g.images   || [];
  const texturas  = g.textures || [];
  const materiais = g.materials|| [];
  const malhas    = g.meshes   || [];

  // Geometria
  let tris = 0, primitivas = 0, comUV = 0, semUV = 0;
  const acc = g.accessors || [];
  malhas.forEach(m => (m.primitives || []).forEach(p => {
    primitivas++;
    if (p.indices != null && acc[p.indices]) tris += acc[p.indices].count / 3;
    else if (p.attributes && p.attributes.POSITION != null && acc[p.attributes.POSITION])
      tris += acc[p.attributes.POSITION].count / 3;
    if (p.attributes && (p.attributes.TEXCOORD_0 != null)) comUV++; else semUV++;
  }));

  // Uso real das texturas por canal
  const uso = {};
  CANAIS.forEach(([nome, get]) => { uso[nome] = materiais.filter(m => get(m)).length; });
  const materiaisComTextura = materiais.filter(m => CANAIS.some(([, get]) => get(m))).length;

  // Imagens: embutidas no BIN (bufferView) ou por URI externa?
  const embutidas = imagens.filter(i => i.bufferView !== undefined).length;
  const externas  = imagens.filter(i => i.uri && !/^data:/.test(i.uri));
  const dataUri   = imagens.filter(i => i.uri && /^data:/.test(i.uri)).length;
  const mimes = {};
  imagens.forEach(i => { const m = i.mimeType || '(pelo bufferView)'; mimes[m] = (mimes[m] || 0) + 1; });

  console.log('┌─ ' + rotulo);
  console.log('│  arquivo        ' + (bytes / 1048576).toFixed(2) + ' MB   glTF v' + versao +
              '   binário ' + (binLen / 1048576).toFixed(2) + ' MB');
  console.log('│  gerador        ' + ((g.asset && g.asset.generator) || '(não declarado)'));
  console.log('│  extensões      ' + ((g.extensionsUsed || []).join(', ') || '(nenhuma)'));
  const req = g.extensionsRequired || [];
  if (req.length) console.log('│  EXIGIDAS       ' + req.join(', ') + '   ← o carregador precisa suportar');
  console.log('│');
  console.log('│  malhas ' + malhas.length + ' · primitivas ' + primitivas +
              ' · ~' + Math.round(tris).toLocaleString('pt-BR') + ' triângulos');
  console.log('│  nós ' + (g.nodes || []).length + ' · animações ' + (g.animations || []).length +
              ' · esqueletos ' + (g.skins || []).length);
  console.log('│  UV (TEXCOORD_0): ' + comUV + ' primitivas COM · ' + semUV + ' SEM');
  console.log('│');
  console.log('│  TEXTURA');
  console.log('│    imagens      ' + imagens.length +
              '  (embutidas ' + embutidas + ' · data-uri ' + dataUri + ' · externas ' + externas.length + ')');
  if (imagens.length) console.log('│    formatos     ' + Object.entries(mimes).map(([k, v]) => v + '× ' + k).join(' · '));
  if (externas.length) console.log('│    ⚠ arquivos externos: ' + externas.map(i => i.uri).slice(0, 5).join(', '));
  console.log('│    texturas     ' + texturas.length);
  console.log('│    materiais    ' + materiais.length + '  (com alguma textura: ' + materiaisComTextura + ')');
  CANAIS.forEach(([nome]) => {
    if (uso[nome]) console.log('│      ' + nome.padEnd(26) + uso[nome] + ' material(is)');
  });
  console.log('│');

  // Veredito
  const problemas = [];
  if (imagens.length === 0) problemas.push('NENHUMA imagem embutida — o modelo não tem textura');
  if (materiaisComTextura === 0 && materiais.length) problemas.push('nenhum material referencia textura (só cores lisas)');
  if (semUV > 0) problemas.push(semUV + ' primitiva(s) SEM coordenadas de UV — textura não teria onde pousar');
  if (externas.length) problemas.push(externas.length + ' imagem(ns) apontam para arquivo externo — não vão junto no .glb');
  if (req.length) problemas.push('exige extensão(ões): ' + req.join(', '));

  if (!problemas.length) console.log('│  ✔ TEXTURIZADO e autocontido');
  else problemas.forEach(p => console.log('│  ✘ ' + p));
  console.log('└─');
  console.log();
  return { rotulo, bytes, imagens: imagens.length, texturas: texturas.length,
           materiais: materiais.length, materiaisComTextura, tris: Math.round(tris),
           animacoes: (g.animations || []).length, skins: (g.skins || []).length,
           semUV, problemas };
}

const alvos = process.argv.slice(2);
const res = alvos.map(a => {
  const [caminho, rotulo] = a.split('::');
  try { return analisar(caminho, rotulo || caminho); }
  catch (e) { console.log('┌─ ' + (rotulo || caminho) + '\n│  ✘ ' + e.message + '\n└─\n'); return null; }
}).filter(Boolean);
fs.writeFileSync(__dirname + '/resultado.json', JSON.stringify(res, null, 1));
