/* ═══════════════════════════════════════════════════════════════════════════
   PAINEL ADMINISTRATIVO — emissão de licenças, do lado do servidor
   Autor: Jossian Brito (Charlie Bravo)
   Versão 1.0.0 — 01/10/2026 · Etapa C3 do caminho C
   ═══════════════════════════════════════════════════════════════════════════

   O QUE ESTA FUNÇÃO FECHA

   O aviso 9.4 — "o portão administrativo compara hash, não senha literal" —
   estava aberto desde sempre, e o próprio `assets/js/admin.js` descrevia o
   que era: "um trinco, não uma fechadura". A comparação acontecia NO
   NAVEGADOR. Quem abrisse o console passava, e todo o painel é público.

   Aqui a senha é conferida onde o cliente não alcança, e as chaves de
   serviço nunca saem daqui.

   DOIS SEGREDOS, E POR QUE CADA UM

     ADMIN_SENHA_HASH       scrypt$<salt>$<hash> — gere com
                            `node scripts/gerar-hash-admin.mjs`
     SUPABASE_SERVICE_KEY   a chave de SERVIÇO do Supabase, que é a única
                            que pode chamar create_license / revoke_license
                            (ver supabase/licenca.sql: as funções foram
                            revogadas de `public` e concedidas só a
                            service_role)

   ⚠️ A CHAVE DE SERVIÇO NÃO É A `publishable`. Ela ignora RLS e pode tudo.
   Não vai ao navegador, não vai ao repositório, não aparece em erro nenhum
   — a mesma disciplina da chave paga do Open-Meteo no `tempo.mjs`, pelo
   mesmo motivo e com o mesmo mascaramento.

   SEM SEGREDO CONFIGURADO, A PORTA FECHA. É inversão deliberada do que o
   admin.js fazia: lá, ambiente sem a variável abria o painel direto, com um
   aviso na tela. Fazia algum sentido num trinco que não guardava nada. Esta
   função emite licenças de serviço pago — um deploy onde alguém esqueceu a
   variável não pode virar um balcão público de emissão.
   ═══════════════════════════════════════════════════════════════════════════ */

import {
  lerConfig, novoEstado, origemDeConfianca, enderecoDoCliente,
  limiteDeTaxa, limparOciosos, GUARDA_JANELA_MS
} from '../lib/guarda.mjs';
import {
  conferirSenha, validarEmissao, vencimentoDaFaixa,
  gerarToken, resumoDoToken
} from '../lib/admin.mjs';

/* Estado próprio, separado do proxy do tempo: são portas diferentes, com
   tetos diferentes, e misturar os contadores deixaria uma rajada de
   consultas de vento gastar as tentativas de senha de quem está no painel. */
const guarda = novoEstado();

/* TETO MUITO MAIS APERTADO que o do tempo (60/h).

   Lá o limite protege uma fatura; aqui protege uma SENHA. O painel é usado
   por uma pessoa, algumas vezes por semana — doze tentativas por hora é
   folgado para quem erra a digitação e sufocante para quem tenta dicionário.

   Somado ao scrypt (≈50 ms por tentativa), um atacante fica com doze
   chutes por hora. Mil palavras levariam três dias e meio de martelo
   contínuo, e cada minuto deles aparece no registro do Netlify. */
const TETO_ADMIN_HORA = 12;

const SUPA_URL = 'https://nsbeddfkcdyssrirrhzt.supabase.co';

/* Esconde a chave de serviço de qualquer texto que vá para o cliente ou para
   o log. O PostgREST devolve mensagens que às vezes ecoam cabeçalhos. */
function mascarar(texto, chave) {
  let t = String(texto == null ? '' : texto);
  if (chave) t = t.split(chave).join('***');
  return t.replace(/(apikey|Bearer)\s*[:=]?\s*[A-Za-z0-9._-]{12,}/gi, '$1 ***');
}

async function rpc(nome, corpo, chave) {
  const r = await fetch(`${SUPA_URL}/rest/v1/rpc/${nome}`, {
    method: 'POST',
    headers: {
      'apikey': chave,
      'Authorization': `Bearer ${chave}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(corpo),
    signal: AbortSignal.timeout(8000)
  });
  const texto = await r.text();
  if (!r.ok) throw new Error(`Supabase respondeu ${r.status}: ${texto.slice(0, 200)}`);
  return texto ? JSON.parse(texto) : null;
}

export default async (req) => {
  const cab = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
  const resp = (corpo, status) => new Response(JSON.stringify(corpo), { status, headers: cab });

  if (req.method !== 'POST') return resp({ ok: false, motivo: 'método não permitido' }, 405);

  /* A guarda de origem é a mesma do proxy do tempo, pelo mesmo motivo:
     barrar site de terceiro e varredor antes de gastar qualquer coisa —
     aqui, antes de gastar uma TENTATIVA DE SENHA do limite de quem é dono
     do painel. Sem isto, um varredor esgotaria as doze tentativas por hora
     e trancaria o administrador para fora do próprio sistema. */
  const cfg = lerConfig(process.env);
  const ler = (n) => req.headers.get(n);
  const origem = origemDeConfianca(ler, cfg.hosts);
  if (!origem.ok) return resp({ ok: false, motivo: `chamada recusada: ${origem.motivo}` }, 403);

  const agora = Date.now();
  limparOciosos(guarda, agora, GUARDA_JANELA_MS);
  const taxa = limiteDeTaxa(guarda, agora, enderecoDoCliente(ler), TETO_ADMIN_HORA, GUARDA_JANELA_MS);
  if (!taxa.ok) {
    return new Response(JSON.stringify({ ok: false, motivo: 'tentativas demais; aguarde' }),
                        { status: 429, headers: { ...cab, 'Retry-After': '900' } });
  }

  let corpo;
  try { corpo = await req.json(); }
  catch (e) { return resp({ ok: false, motivo: 'corpo inválido' }, 400); }

  /* A SENHA, CONFERIDA AQUI. */
  const veredito = conferirSenha(corpo && corpo.senha, process.env.ADMIN_SENHA_HASH);
  if (!veredito.ok) {
    /* 401 para senha errada, 503 para portão mal configurado: são problemas
       de pessoas diferentes. Quem digitou errado tenta de novo; quem
       esqueceu a variável precisa ir ao Netlify, e precisa SABER disso. */
    const configurado = !/portão/.test(veredito.motivo);
    return resp({ ok: false, motivo: veredito.motivo }, configurado ? 401 : 503);
  }

  const chave = process.env.SUPABASE_SERVICE_KEY || '';
  if (!chave) {
    /* Igual ao tempo.mjs: NÃO cair num caminho degradado por conta própria.
       Sem a chave de serviço não há emissão possível, e inventar um
       sucesso seria pior que falhar declarando o motivo. */
    return resp({ ok: false, motivo: 'SUPABASE_SERVICE_KEY não configurada no ambiente' }, 503);
  }

  const acao = String((corpo && corpo.acao) || '').trim();

  try {
    if (acao === 'emitir') {
      const v = validarEmissao(corpo);
      if (!v.ok) return resp({ ok: false, motivo: v.motivo }, 400);

      const vence = vencimentoDaFaixa(v.faixa, agora);
      const token = gerarToken();

      await rpc('create_license', {
        p_token_hash: resumoDoToken(token),
        p_vessel: v.vessel,
        p_contact: v.contact,
        p_expires: vence.toISOString(),
        p_devices: v.devices,
        p_note: null
      }, chave);

      /* O TOKEN APARECE AQUI UMA ÚNICA VEZ, e nunca mais.
         O banco guarda só o resumo (supabase/licenca.sql), este processo não
         grava nada, e não há como recuperá-lo depois. Quem emite copia agora
         ou emite outro. É o preço de o banco nunca ver a credencial. */
      return resp({ ok: true, token, vessel: v.vessel, faixa: v.faixa,
                    expires_at: vence.toISOString(), devices: v.devices }, 200);
    }

    if (acao === 'revogar') {
      const hash = String((corpo && corpo.token_hash) || '').trim().toLowerCase();
      if (!/^[0-9a-f]{64}$/.test(hash)) return resp({ ok: false, motivo: 'resumo inválido' }, 400);
      await rpc('revoke_license', { p_token_hash: hash }, chave);
      return resp({ ok: true }, 200);
    }

    /* ═══════════════════════════════════════════════════════════════════════
       LISTAR — a ação que faltava para o painel ser operável          (C6)

       Sem ela, quem emite não sabe o que emitiu, e revogar exige conhecer de
       cor o resumo de 64 caracteres da licença certa. Era o buraco que
       transformava o painel num emissor cego.

       O que volta inclui o `token_hash`. É o SHA-256, não o token: não se
       inverte, não abre nada, e é a única chave por onde a revogação pega a
       linha certa. Quem chega aqui já passou pelo scrypt.

       O token EM CLARO não volta nunca — e não por cuidado de quem escreveu
       esta linha, mas porque o banco não o tem. A propriedade é do desenho.
       ═══════════════════════════════════════════════════════════════════════ */
    if (acao === 'listar') {
      const linhas = await rpc('list_licenses', {}, chave);
      const lista = Array.isArray(linhas) ? linhas : [];
      return resp({ ok: true, total: lista.length, licencas: lista }, 200);
    }

    return resp({ ok: false, motivo: `ação desconhecida: ${acao || '(vazia)'}` }, 400);

  } catch (e) {
    /* A mensagem do PostgREST pode ecoar cabeçalho, e cabeçalho contém a
       chave. Nunca repassar o erro cru — mesma lição do tempo.mjs. */
    return resp({ ok: false, motivo: mascarar((e && e.message) || 'falha ao falar com o banco', chave) }, 502);
  }
};
