/* ═══════════════════════════════════════════════════════════════════════════
   PAINEL ADMINISTRATIVO — decisões puras
   Autor: Jossian Brito (Charlie Bravo)
   Versão 1.0.0 — 01/10/2026 · Etapa C3 do caminho C
   ═══════════════════════════════════════════════════════════════════════════

   O QUE MUDA, E POR QUE NÃO É SÓ "MOVER A SENHA PARA O SERVIDOR"

   Até a v2.18.0 o portão administrativo comparava um SHA-256 NO NAVEGADOR
   (aviso 9.4). O próprio código já dizia o que era: "um trinco, não uma
   fechadura". Todo o painel é público; quem abrisse o console passava.

   Mas a C1 mudou o problema de lugar. O painel existia para GERAR links
   `?token=…&user=…` — e esses links deixaram de fazer qualquer coisa quando
   a vitrine parou de lê-los. Um painel protegido por trinco, emitindo chaves
   que não abrem nada: havia duas encenações, não uma.

   Então a C3 faz as duas coisas de uma vez:
     · a senha passa a ser conferida NO SERVIDOR, onde o cliente não alcança;
     · o painel para de emitir links mortos e passa a emitir LICENÇAS, que é
       o que a C2 definiu.

   POR QUE scrypt, E NÃO SHA-256

   SHA-256 é rápido de propósito — e isso é exatamente o que não se quer numa
   senha. Com uma placa de vídeo, bilhões de tentativas por segundo contra um
   hash vazado. scrypt é lento e devorador de memória por projeto: a mesma
   placa faz ordens de grandeza menos.

   O hash vive só na variável de ambiente do Netlify, fora do alcance do
   navegador. scrypt é o que torna o vazamento DESSA variável sobrevivível,
   em vez de catastrófico. Defesa em profundidade: supor que a camada de fora
   um dia falha.
   ═══════════════════════════════════════════════════════════════════════════ */

import { scryptSync, timingSafeEqual, randomBytes, createHash } from 'node:crypto';

export const ADMIN_VERSAO = '1.0.0';

/* Parâmetros do scrypt. N=16384 custa ~50 ms e ~16 MB por tentativa — nada
   para quem digita a senha uma vez, caro para quem tenta um dicionário. */
export const SCRYPT_N = 16384;
export const SCRYPT_R = 8;
export const SCRYPT_P = 1;
export const SCRYPT_BYTES = 32;

/* ─────────────────────────────────────────────────────────────────────────
   AS FAIXAS DE VALIDADE, como combinadas: 24h, 72h, 7 dias, 15 dias.

   São nomes fixos e não um número livre, de propósito. Número livre convida
   ao engano de digitação — "150" em vez de "15" emitiria uma licença de
   cinco meses sem ninguém notar. A faixa é escolhida de uma lista, e o que
   não está na lista não é emitido.
   ───────────────────────────────────────────────────────────────────────── */
export const FAIXAS = {
  '24h': 24 * 3600e3,
  '72h': 72 * 3600e3,
  '7d':  7 * 24 * 3600e3,
  '15d': 15 * 24 * 3600e3
};

/* Devolve o instante de vencimento, ou null se a faixa não existir.
   `agora` entra como parâmetro para a decisão ser pura e provável. */
export function vencimentoDaFaixa(nome, agora) {
  const ms = FAIXAS[String(nome || '').trim()];
  if (!ms) return null;
  return new Date(agora + ms);
}

/* ─────────────────────────────────────────────────────────────────────────
   O TOKEN E O SEU RESUMO.

   32 bytes de aleatoriedade criptográfica = 256 bits. Em hexadecimal dá 64
   caracteres, que é o que o comandante vai colar no aparelho uma única vez.

   O resumo é o que vai para o banco. O token em si existe por alguns
   milissegundos neste processo, é mostrado UMA vez a quem emite, e nunca
   mais. Nem o banco nem o log jamais o veem — ver supabase/licenca.sql.
   ───────────────────────────────────────────────────────────────────────── */
export function gerarToken() {
  return randomBytes(32).toString('hex');
}

export function resumoDoToken(token) {
  return createHash('sha256').update(String(token), 'utf8').digest('hex');
}

/* ─────────────────────────────────────────────────────────────────────────
   A SENHA.

   Formato guardado em ADMIN_SENHA_HASH:  scrypt$<salt-hex>$<hash-hex>

   O prefixo nomeia o algoritmo para que, no dia em que ele mudar, um hash
   antigo seja reconhecido como antigo em vez de simplesmente falhar.
   ───────────────────────────────────────────────────────────────────────── */
export function formatarHash(salt, hash) {
  return `scrypt$${salt}$${hash}`;
}

export function derivar(senha, saltHex) {
  const salt = Buffer.from(saltHex, 'hex');
  return scryptSync(String(senha), salt, SCRYPT_BYTES,
                    { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P }).toString('hex');
}

export function gerarHashDeSenha(senha) {
  const salt = randomBytes(16).toString('hex');
  return formatarHash(salt, derivar(senha, salt));
}

/* ─────────────────────────────────────────────────────────────────────────
   Confere a senha contra o hash guardado.

   Comportamento conforme a entrada:
     hash ausente ou vazio   → { ok:false, motivo:'portão não configurado' }
     hash em formato errado  → { ok:false, motivo:'portão mal configurado' }
     senha vazia             → { ok:false, motivo:'senha vazia' }
     senha errada            → { ok:false, motivo:'senha incorreta' }
     senha certa             → { ok:true }

   SEM HASH CONFIGURADO, O PORTÃO FECHA — e esta é uma inversão deliberada
   em relação ao comportamento antigo. O admin.js dizia:

       if (!esperado) { this.createSession('Administrador', true); … }

   ou seja: ambiente sem a variável = painel ABERTO, com um aviso na tela.
   Fazia algum sentido quando o painel era um trinco e não guardava nada.
   Agora ele emite licenças de serviço pago. Falta de configuração passa a
   NEGAR, porque um deploy onde alguém esqueceu a variável não pode virar
   um painel público de emissão.

   `timingSafeEqual` e não `===`: comparar texto com `===` para quando acha a
   primeira diferença, e o tempo da resposta vaza quantos caracteres estavam
   certos. É ataque sutil e real; a comparação de tempo constante custa nada.
   ───────────────────────────────────────────────────────────────────────── */
/*
═══════════════════════════════════════════════════════════════════════════════
  limparValorColado — tolerância a artefatos de COLAGEM            (v1.1.0)
═══════════════════════════════════════════════════════════════════════════════

  Escrita depois de a primeira configuração real em produção custar cinco
  rodadas de diagnóstico. Três artefatos reais, todos de copiar-e-colar:

    1. o prefixo `ADMIN_SENHA_HASH=`, porque o gerador imprimia `CHAVE=valor`
       numa linha só e o gesto natural é selecionar a linha inteira;
    2. aspas em volta, que alguns painéis e editores acrescentam sozinhos;
    3. ESPAÇO DE LARGURA ZERO (U+200B..U+200D, U+FEFF) — invisível, inserido
       por terminais e navegadores ao copiar. O `.trim()` do JavaScript NÃO o
       remove, porque ele não é whitespace. Um caractere que ninguém vê e que
       nenhuma inspeção visual encontra.

  ── POR QUE ISTO NÃO AFROUXA SEGURANÇA, e a distinção é o ponto ────────────

  Tolerância aqui é sobre a EMBALAGEM, nunca sobre o conteúdo. A comparação do
  hash continua idêntica, em tempo constante, com o mesmo scrypt. Nada do que
  se remove aqui pode transformar uma senha errada em certa — remover uma aspa
  não aproxima ninguém de adivinhar 32 bytes.

  É a lei de Postel aplicada exatamente onde ela é segura: rigoroso no que se
  COMPARA, tolerante no que se aceita como invólucro. A bordo é o bocal de
  abastecimento que aceita o bico com folga: não muda uma gota do que entra no
  tanque, só impede que a operação falhe por um milímetro.

  O que NÃO se tolera, de propósito: hash de outro algoritmo, pedaço faltando,
  caractere não-hexadecimal. Isso não é embalagem, é conteúdo errado — e aí a
  resposta tem de ser recusa, com o motivo dito.
*/
const LIXO_INVISIVEL = /^[\s\u200B-\u200D\uFEFF]+|[\s\u200B-\u200D\uFEFF]+$/g;

/* DESEMBRULHO EM LAÇO, e não em ordem fixa — a primeira versão errou aqui.

   Ela tirava invisíveis, depois o prefixo, depois as aspas. Funcionava para
   cada artefato sozinho e FALHAVA com os três juntos:

       \u200B"ADMIN_SENHA_HASH=scrypt$…"\u200B

   Tirados os invisíveis, a cadeia começa por aspa — então a regra do prefixo
   não casa. Tiradas as aspas, o prefixo reaparece, mas o passo dele já
   passou. Ordem fixa só desembrulha a ordem que o autor imaginou.

   Descascar em laço resolve qualquer combinação e qualquer aninhamento. O
   teto de 5 voltas existe para que nenhuma regra futura, mal escrita, possa
   girar para sempre — a cada volta algo é removido, então 5 é folga larga. */
export function limparValorColado(bruto) {
  let v = String(bruto == null ? '' : bruto);
  for (let volta = 0; volta < 5; volta++) {
    const antes = v;
    v = v.replace(LIXO_INVISIVEL, '');                  // invisíveis nas pontas
    v = v.replace(/^(['"])([\s\S]*)\1$/, '$2');        // aspas envolventes
    v = v.replace(/^ADMIN_SENHA_HASH\s*=\s*/i, '');     // prefixo do gerador antigo
    if (v === antes) break;                             // nada mudou: acabou
  }
  return v;
}

export function conferirSenha(senha, guardado) {
  const g = limparValorColado(guardado);
  if (!g) return { ok: false, motivo: 'portão não configurado' };

  /* ═══════════════════════════════════════════════════════════════════════
     A RECUSA PASSA A DIZER QUAL É O DEFEITO.

     Até aqui, qualquer formato inválido devolvia só "mal configurado" — e
     foi isso que custou cinco rodadas de sonda em produção, porque a
     mensagem não distinguia "hash de outro algoritmo" de "faltou um pedaço"
     de "tem caractere que não é hexadecimal".

     O código do defeito vai junto, e é DELIBERADAMENTE estrutural: diz a
     FORMA do problema, nunca o conteúdo. Nada de comprimento, nada de
     prefixo recebido — porque se alguém colar a própria frase-senha no lugar
     do hash, ecoar o que veio seria entregá-la a quem fizer a chamada.

     Diagnóstico sem vazamento: nomear o defeito, não exibir o dado.
     ═══════════════════════════════════════════════════════════════════════ */
  const partes = g.split('$');
  if (partes.length !== 3) {
    return { ok: false, motivo: 'portão mal configurado (pedaços)' };
  }
  if (partes[0] !== 'scrypt') {
    return { ok: false, motivo: 'portão mal configurado (prefixo)' };
  }
  if (!/^[0-9a-f]+$/i.test(partes[1]) || !/^[0-9a-f]+$/i.test(partes[2])) {
    return { ok: false, motivo: 'portão mal configurado (hex)' };
  }
  if (!String(senha || '')) return { ok: false, motivo: 'senha vazia' };

  const esperado = Buffer.from(partes[2], 'hex');
  let obtido;
  try { obtido = Buffer.from(derivar(senha, partes[1]), 'hex'); }
  catch (e) { return { ok: false, motivo: 'portão mal configurado' }; }

  if (obtido.length !== esperado.length) return { ok: false, motivo: 'portão mal configurado' };
  return timingSafeEqual(obtido, esperado)
    ? { ok: true, motivo: '' }
    : { ok: false, motivo: 'senha incorreta' };
}

/* ─────────────────────────────────────────────────────────────────────────
   Valida o pedido de emissão ANTES de tocar no banco.

   Nome de embarcação cru não entra: espaços das pontas saem, e o limite de
   60 caracteres existe porque nome de rebocador não tem 500 — e um campo
   sem teto é um convite.
   ───────────────────────────────────────────────────────────────────────── */
export function validarEmissao(corpo) {
  const c = corpo || {};
  const vessel = String(c.vessel == null ? '' : c.vessel).trim();
  const faixa = String(c.faixa == null ? '' : c.faixa).trim();
  const contact = String(c.contact == null ? '' : c.contact).trim();
  const devices = c.devices == null ? 3 : Number(c.devices);

  if (!vessel) return { ok: false, motivo: 'embarcação não informada' };
  if (vessel.length > 60) return { ok: false, motivo: 'nome de embarcação longo demais' };
  if (!FAIXAS[faixa]) {
    return { ok: false, motivo: `faixa inválida (use ${Object.keys(FAIXAS).join(', ')})` };
  }
  if (!Number.isInteger(devices) || devices < 1 || devices > 20) {
    return { ok: false, motivo: 'número de dispositivos fora de 1 a 20' };
  }
  if (contact.length > 120) return { ok: false, motivo: 'contato longo demais' };

  return { ok: true, motivo: '', vessel, faixa, contact: contact || null, devices };
}
