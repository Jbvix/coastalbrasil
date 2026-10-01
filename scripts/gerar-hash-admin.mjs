#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   GERADOR DO HASH DA SENHA ADMINISTRATIVA
   Autor: Jossian Brito (Charlie Bravo)
   Versão 1.0.0 — 01/10/2026 · Etapa C3

   USO:
       node scripts/gerar-hash-admin.mjs

   Pede a frase-senha, imprime o valor de ADMIN_SENHA_HASH para colar nas
   variáveis de ambiente do Netlify, e NÃO grava nada em lugar nenhum.

   A frase não é ecoada na tela enquanto se digita, e não vai para o
   histórico do shell — por isso ela é PEDIDA aqui em vez de aceita como
   argumento. Senha em `node script.mjs minha-senha` fica no ~/.bash_history
   e aparece para qualquer `ps` enquanto o processo roda.
   ═══════════════════════════════════════════════════════════════════════════ */

import { createInterface } from 'node:readline';
import { gerarHashDeSenha, conferirSenha, SCRYPT_N } from '../netlify/lib/admin.mjs';

/* Uma fila de linhas lida uma vez só.

   A primeira versão criava um readline POR pergunta, com terminal:true. Num
   terminal de verdade funcionava; com a entrada canalizada, a segunda
   pergunta nunca resolvia — o primeiro readline engolia as duas linhas e o
   processo morria em "unsettled top-level await".

   Isso importa mais do que parece: um script que só funciona quando um
   humano está olhando é um script que nunca é PROVADO. Agora ele roda nos
   dois modos, e o banco de provas o exercita. */
async function lerTodasAsLinhas() {
  const pedacos = [];
  for await (const p of process.stdin) pedacos.push(p);
  return Buffer.concat(pedacos).toString('utf8').split(/\r?\n/);
}

let filaDeLinhas = null;

async function perguntar(prompt) {
  if (!process.stdin.isTTY) {
    /* Sem terminal (canalizado, ou no banco de provas): não há o que
       esconder — a frase já veio de outro lugar. Lê e segue. */
    if (filaDeLinhas === null) filaDeLinhas = await lerTodasAsLinhas();
    return filaDeLinhas.shift() ?? '';
  }
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const saida = process.stdout;
    // Enquanto esta função estiver ligada, nada do que for digitado aparece.
    const escrever = rl._writeToOutput;
    rl._writeToOutput = (s) => { if (s.includes(prompt)) saida.write(s); };
    rl.question(prompt, (resposta) => {
      rl._writeToOutput = escrever;
      saida.write('\n');
      rl.close();
      resolve(resposta);
    });
  });
}

const senha = await perguntar('Frase-senha do painel: ');
const repete = await perguntar('Repita para conferir:   ');

if (senha !== repete) {
  console.error('\n✘ As duas digitações não batem. Nada foi gerado.');
  process.exit(1);
}
if (senha.length < 12) {
  /* Doze não é um número mágico, é um piso. O scrypt torna cada tentativa
     cara, mas não salva uma senha que esteja numa lista de mil. */
  console.error(`\n✘ Frase curta demais (${senha.length}). Use ao menos 12 caracteres — ` +
                'de preferência quatro palavras que só você junta.');
  process.exit(1);
}

const t0 = Date.now();
const hash = gerarHashDeSenha(senha);
const custo = Date.now() - t0;

/* Confere o que acabou de gerar, antes de mandar alguém confiar nisso. */
if (!conferirSenha(senha, hash).ok) {
  console.error('\n✘ O hash gerado não confere com a própria senha. Não use este valor.');
  process.exit(1);
}

/* ═══════════════════════════════════════════════════════════════════════════
   COMO ESTE RESULTADO É IMPRESSO — e por que mudou               (v1.1.0)

   A primeira versão imprimia uma linha única:

       ADMIN_SENHA_HASH=scrypt$a1b2…$c3d4…

   Formato `CHAVE=valor`, que é o idioma de um arquivo .env — e lido por um
   humano diante de dois campos separados no painel do Netlify, ele CONVIDA ao
   gesto errado: selecionar a linha inteira e colar no campo de valor.

   Foi o que aconteceu em 01/10/2026, na primeira configuração real. O portão
   respondeu "mal configurado" e levou várias rodadas de diagnóstico, porque
   `ADMIN_SENHA_HASH=scrypt$…` tem três pedaços separados por `$` e passa pela
   contagem — só falha na comparação do prefixo.

   A culpa não é de quem colou. **Ferramenta que convida ao erro é ferramenta
   defeituosa**, do mesmo jeito que um bujão de dreno com a mesma chave do
   bujão de enchimento é projeto ruim, não desatenção do mecânico.

   Agora os dois campos saem separados, rotulados com o nome do campo no
   painel, e o valor sai sozinho na sua linha — selecionável de ponta a ponta
   sem pegar mais nada.
   ═══════════════════════════════════════════════════════════════════════════ */
console.log('\n── No Netlify: Site configuration → Environment variables → Add a variable ──\n');
console.log('  Campo "Key" .......... ADMIN_SENHA_HASH');
console.log('  Contexto ............. Same value for all deploy contexts');
console.log('\n  Campo "Value" — copie a linha ABAIXO inteira, e só ela:\n');
console.log(hash);
console.log('\n  ⚠️  NÃO inclua "ADMIN_SENHA_HASH=" no campo de valor.');
console.log('      O valor começa em "scrypt$" e termina no último caractere acima.');
console.log(`\n(scrypt N=${SCRYPT_N}, ${custo} ms por tentativa nesta máquina)`);
console.log('\nA frase-senha NÃO foi gravada. Se você a perder, gere outra:');
console.log('o hash não se inverte, e é essa a razão de ele poder ficar numa variável.\n');
