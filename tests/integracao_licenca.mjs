/*
════════════════════════════════════════════════════════════════════════════════
  PROVA DE INTEGRAÇÃO — parte 2: o veredito consome as linhas do banco
════════════════════════════════════════════════════════════════════════════════
  Autor: Jossian Brito (Charlie Bravo) · 2026-10-01 · etapa C6

  Recebe, em argumento, o arquivo JSON que tests/integracao_licenca.sql
  produziu a partir de um Postgres DE VERDADE, e entrega cada linha à função
  `vereditoDaLinha` que roda em produção.

  ── O QUE ESTA PROVA MEDE QUE NENHUMA OUTRA MEDIA ─────────────────────────

  A fronteira. Só isso, e era exatamente o que faltava.

  O banco de provas mede o JavaScript com fixtures escritas à mão. O
  esquema_provas.sql mede o SQL no Postgres. As duas passavam enquanto o
  código lia `linha.revoked_at` e o banco devolvia `revoked` — porque as
  fixtures também diziam `revoked_at`, tendo nascido do mesmo engano.

  Aqui as fixtures são do BANCO. Se o nome de uma coluna mudar, se o
  `check_license` passar a devolver outra coisa, ou se o veredito olhar um
  campo que não existe, esta prova cai. É a única das três que não pode ser
  enganada por uma suposição minha.

  ── POR QUE NÃO ESTÁ NO BANCO DE PROVAS ───────────────────────────────────

  Porque exige Postgres. O `npm test` tem de rodar em qualquer máquina, sem
  serviço nenhum, em segundos — essa é a razão de ele ser usado. Esta prova
  vive no job `esquema` da integração contínua, junto do Postgres descartável
  que já sobe lá.
════════════════════════════════════════════════════════════════════════════════
*/
import { readFileSync } from 'node:fs';
import { vereditoDaLinha, ESTADO } from '../netlify/lib/licenca.mjs';

const arquivo = process.argv[2];
if (!arquivo) { console.error('uso: node tests/integracao_licenca.mjs <linhas.json>'); process.exit(2); }

/* Diagnóstico antes do JSON.parse, porque a primeira execução desta prova
   em CI morreu com um `SyntaxError` cru que não dizia o que havia acontecido:
   o SQL tinha vazado o resultado de um `select` de preparação para dentro do
   arquivo. Erro de encanamento disfarçado de erro de dados.

   Nomear o defeito custa cinco linhas e economiza uma leitura de log. */
const bruto = readFileSync(arquivo, 'utf8').trim();
if (!bruto.startsWith('{')) {
  console.error('\n✘ O arquivo não começa com JSON. O SQL de preparação vazou saída ' +
                'para o stdout — confira os `\\o` em tests/integracao_licenca.sql.');
  console.error('  Primeiros 120 caracteres recebidos: ' + JSON.stringify(bruto.slice(0, 120)));
  process.exit(1);
}
const linhas = JSON.parse(bruto);
const agora = Date.now();
let falhas = 0;

function exigir(rotulo, condicao, detalhe) {
  console.log(`  ${condicao ? '\x1b[32m✔\x1b[0m' : '\x1b[31m✘\x1b[0m'} ${rotulo}${detalhe ? '  \x1b[90m' + detalhe + '\x1b[0m' : ''}`);
  if (!condicao) falhas++;
}

console.log('\n══ INTEGRAÇÃO: linhas do Postgres → vereditoDaLinha ══\n');

/* As colunas que o banco devolveu, listadas antes de qualquer julgamento.
   Se esta lista mudar, o defeito aparece aqui mesmo, por inspeção. */
const colunas = Object.keys(linhas.valida || {}).sort();
console.log('  colunas de check_license: ' + colunas.join(', ') + '\n');
exigir('O banco devolve `revoked` (booleano), não `revoked_at`',
       colunas.includes('revoked') && !colunas.includes('revoked_at'),
       colunas.includes('revoked_at') ? 'ATENÇÃO: revoked_at reapareceu' : 'confirmado');

const v = vereditoDaLinha(linhas.valida, agora);
exigir('Licença válida → VALIDA', v.ok && v.estado === ESTADO.VALIDA,
       v.ok ? `${v.embarcacao}, ${v.horasRestantes} h restantes` : v.motivo);

const e = vereditoDaLinha(linhas.vencida, agora);
exigir('Licença vencida → VENCIDA', !e.ok && e.estado === ESTADO.VENCIDA, e.estado);

/* 🔴 A PROVA QUE PEGA O DEFEITO DA C4.
   Revogada e AINDA DENTRO DO PRAZO. Com o código antigo — que lia
   `revoked_at` — esta linha devolvia ok:true, e revogar não revogava nada. */
const r = vereditoDaLinha(linhas.revogada, agora);
exigir('Licença REVOGADA e dentro do prazo → REVOGADA',
       !r.ok && r.estado === ESTADO.REVOGADA,
       r.ok ? '🔴 ACEITA COMO VÁLIDA — revogar não revogaria nada' : r.estado);

const a = vereditoDaLinha(linhas.ausente, agora);
exigir('Hash inexistente → DESCONHECIDA', !a.ok && a.estado === ESTADO.DESCONHECIDA, a.estado);

console.log(falhas === 0
  ? '\n  Integração conferida: o veredito lê o que o banco escreve.\n'
  : `\n  \x1b[31m${falhas} falha(s) na fronteira entre o SQL e o JavaScript.\x1b[0m\n`);
process.exitCode = falhas === 0 ? 0 : 1;
