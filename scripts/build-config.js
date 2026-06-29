/**
 * Gera cesium-config.js no deploy do Netlify a partir da variável de ambiente
 * CESIUM_ION_TOKEN (cadastrada no painel do Netlify). O app lê window.CESIUM_ION_TOKEN
 * para habilitar o modo Earth (Cesium). Sem token, o modo Earth exibe um aviso.
 *
 * Observação: por ser um app client-side, o token fica visível no JS publicado.
 * Use um token ion RESTRITO (somente leitura, apenas os assets necessários).
 */
const fs = require('fs');

try {
  const token = process.env.CESIUM_ION_TOKEN || '';
  const js = '/* gerado no build a partir da env CESIUM_ION_TOKEN */\n' +
    'window.CESIUM_ION_TOKEN=' + JSON.stringify(token) + ';\n';
  fs.writeFileSync('cesium-config.js', js);
  console.log(token
    ? 'cesium-config.js gerado com token (' + token.length + ' chars).'
    : 'cesium-config.js gerado SEM token — defina CESIUM_ION_TOKEN no Netlify para o modo Earth.');
} catch (e) {
  console.error('build-config: falha ao gerar cesium-config.js:', e.message);
}
// Nunca falha o deploy
process.exit(0);
