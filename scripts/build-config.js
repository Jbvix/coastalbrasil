/**
 * Gera cesium-config.js no deploy do Netlify a partir de variáveis de ambiente
 * cadastradas no painel do Netlify. Nada aqui é commitado.
 *
 *   CESIUM_ION_TOKEN  -> window.CESIUM_ION_TOKEN, habilita o modo Earth.
 *                        Por ser app client-side o token fica visível no JS
 *                        publicado: use um token ion RESTRITO (somente leitura,
 *                        apenas os assets necessários).
 *
 *   ADMIN_GATE_HASH   -> window.ADMIN_GATE_HASH, SHA-256 em hexadecimal da
 *                        frase-senha do painel administrativo.
 *
 * SOBRE O PORTÃO ADMINISTRATIVO — leia antes de confiar nele:
 * Um site estático não tem onde guardar segredo. Publicar o HASH em vez da
 * senha evita que a senha em texto claro vá para o repositório e seja reusada
 * em outro lugar, mas NÃO cria uma barreira de segurança: o hash está no
 * cliente e é atacável por dicionário, e todo o código do painel é público.
 * Trate o painel como ferramenta local de conveniência. Controle de acesso de
 * verdade exige validação no servidor — o app já faz isso para os links de
 * acompanhamento, via a função check_nav_share no Supabase.
 *
 * Para gerar o hash:
 *   printf '%s' 'sua-frase-senha' | openssl dgst -sha256 -r | cut -d' ' -f1
 */
const fs = require('fs');

try {
  const token = process.env.CESIUM_ION_TOKEN || '';
  const gate = (process.env.ADMIN_GATE_HASH || '').trim().toLowerCase();
  if (gate && !/^[0-9a-f]{64}$/.test(gate)) {
    console.warn('build-config: ADMIN_GATE_HASH não parece um SHA-256 hex de 64 chars — ignorado.');
  }
  const gateOk = /^[0-9a-f]{64}$/.test(gate) ? gate : '';
  const js = '/* gerado no build a partir das envs do Netlify — não commitar */\n' +
    'window.CESIUM_ION_TOKEN=' + JSON.stringify(token) + ';\n' +
    'window.ADMIN_GATE_HASH=' + JSON.stringify(gateOk) + ';\n';
  fs.writeFileSync('cesium-config.js', js);
  console.log(token
    ? 'cesium-config.js gerado com token Cesium (' + token.length + ' chars).'
    : 'cesium-config.js gerado SEM token Cesium — defina CESIUM_ION_TOKEN para o modo Earth.');
  console.log(gateOk
    ? 'Portão administrativo com frase-senha configurada (hash publicado).'
    : 'Portão administrativo SEM frase-senha — o painel abre direto, exibindo o aviso.');
} catch (e) {
  console.error('build-config: falha ao gerar cesium-config.js:', e.message);
}
// Nunca falha o deploy
process.exit(0);
