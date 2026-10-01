-- ═══════════════════════════════════════════════════════════════════════════
--  ESQUEMA ATUAL DO SUPABASE — retrato fiel do que está em produção
--  Autor: Jossian Brito (Charlie Bravo)
--  Versão 1.0.0 — 01/10/2026 · Etapa C2 do controle de acesso
--  Projeto: nsbeddfkcdyssrirrhzt  (sa-east-1)
-- ═══════════════════════════════════════════════════════════════════════════
--
--  POR QUE ESTE ARQUIVO EXISTE
--
--  Até hoje o repositório não tinha UM ÚNICO .sql. Tabelas, funções e
--  políticas existiam só dentro do projeto ao vivo — criadas à mão pelo
--  painel. A metade de servidor do sistema não estava versionada em lugar
--  nenhum.
--
--  Em 01/10/2026 o projeto foi PAUSADO pelo plano gratuito e o espelhamento
--  ficou fora do ar por três dias. "Pausado" é recuperável; "perdido" não
--  seria, e a reconstrução dependeria de memória humana.
--
--  Este arquivo é o retrato. Foi EXTRAÍDO do banco vivo, não escrito de
--  cabeça: `pg_get_functiondef` para as funções, `information_schema` e
--  `pg_policies` para tabela, grants e políticas. O que está aqui é o que
--  está lá.
--
--  COMO USAR: é documentação executável. Rodar num banco vazio reconstrói o
--  estado. Rodar no banco atual é inofensivo (tudo é IF NOT EXISTS / OR
--  REPLACE), mas não é para isso que ele serve.
--
--  ─────────────────────────────────────────────────────────────────────────
--  O DESENHO DE SEGURANÇA, QUE ESTÁ CERTO E MERECE SER DITO
--
--  `nav_shares` tem RLS ativo e NENHUMA política. Isso não é esquecimento —
--  é o ponto. Com RLS ligado e sem política, os papéis `anon` e
--  `authenticated` não leem nem escrevem NADA diretamente, mesmo portando a
--  chave publishable que vai no JavaScript de qualquer visitante.
--
--  A única porta são as três funções SECURITY DEFINER, que rodam com os
--  privilégios do dono e expõem exatamente o que o aplicativo precisa. A
--  superfície auditável tem três portas, e não uma tabela inteira.
--
--  O `SET search_path TO 'public'` em cada função também é deliberado: sem
--  ele, um esquema plantado no caminho de busca poderia sequestrar a
--  resolução de nomes dentro de uma função que roda como dono.
--  ─────────────────────────────────────────────────────────────────────────
-- ═══════════════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────────────
-- 1 · ESPELHAMENTO DA NAVEGAÇÃO  (o link que quem fica em terra abre)
-- ───────────────────────────────────────────────────────────────────────────
--
--  O token fica EM CLARO nesta tabela. É a decisão vigente e vale registrar
--  o que ela significa: quem lesse a tabela teria links de acompanhamento
--  utilizáveis. O risco é contido porque a tabela é inalcançável de fora
--  (RLS sem política) e porque o link só expõe a posição de uma viagem.
--
--  Para a LICENÇA a decisão é outra — lá se guarda SHA-256, nunca o token.
--  A diferença não é capricho: licença é credencial de serviço pago; link de
--  acompanhamento é conveniência de viagem. Ver supabase/licenca.sql.

create table if not exists public.nav_shares (
  token       text primary key,
  label       text,
  vessel      text,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz,
  revoked     boolean     not null default false
);

alter table public.nav_shares enable row level security;
-- Nenhuma política, de propósito: ver o bloco de segurança acima.


-- ───────────────────────────────────────────────────────────────────────────
-- 2 · AS TRÊS FUNÇÕES — a única porta para a tabela
-- ───────────────────────────────────────────────────────────────────────────

--  check_nav_share — NÃO devolve um booleano: devolve o MOTIVO.
--
--  `valid`, `revoked` e `expired` separados são o que permite ao cliente
--  dizer "link revogado" ou "link expirado" em vez de um "acesso negado"
--  mudo. É o princípio da §6.2 do docs/tecnica.md — "erro de conexão não é
--  diagnóstico" — aplicado dentro do banco.
--
--  Quando o token não existe, a função não devolve LINHA NENHUMA. O cliente
--  trata `!data.length` como inválido. Por isso `found` é sempre true quando
--  há retorno: ele sobrou de um desenho anterior e hoje não informa nada.
create or replace function public.check_nav_share(p_token text)
returns table(found boolean, valid boolean, revoked boolean, expired boolean,
              label text, vessel text)
language sql
security definer
set search_path to 'public'
as $function$
  select
    true as found,
    (not s.revoked and (s.expires_at is null or s.expires_at > now())) as valid,
    s.revoked,
    (s.expires_at is not null and s.expires_at <= now()) as expired,
    s.label, s.vessel
  from public.nav_shares s
  where s.token = p_token;
$function$;

--  create_nav_share — `on conflict do nothing` torna o registro IDEMPOTENTE.
--  O cliente reenvia o que não foi confirmado (ver ressincronizarShares no
--  assets/js/mirror.js), e reenviar não pode criar duplicata nem erro.
create or replace function public.create_nav_share(p_token text, p_label text,
                                                   p_vessel text,
                                                   p_expires timestamptz)
returns void
language sql
security definer
set search_path to 'public'
as $function$
  insert into public.nav_shares(token, label, vessel, expires_at)
  values (p_token, p_label, p_vessel, p_expires)
  on conflict (token) do nothing;
$function$;

--  revoke_nav_share — marca, não apaga. Apagar perderia o registro de que o
--  link existiu, e a prova 13.11 exige que a revogação só saia da lista do
--  comandante se o SERVIDOR confirmar.
create or replace function public.revoke_nav_share(p_token text)
returns void
language sql
security definer
set search_path to 'public'
as $function$
  update public.nav_shares set revoked = true where token = p_token;
$function$;

grant execute on function public.check_nav_share(text)  to anon, authenticated;
grant execute on function public.create_nav_share(text, text, text, timestamptz)
                                                         to anon, authenticated;
grant execute on function public.revoke_nav_share(text) to anon, authenticated;


-- ───────────────────────────────────────────────────────────────────────────
-- 3 · public.scores — NÃO É DESTE APLICATIVO
-- ───────────────────────────────────────────────────────────────────────────
--
--  O projeto Supabase se chama "tugrush" e hospeda também os placares de
--  outro aplicativo. Fica registrado aqui para que ninguém o apague achando
--  que é resto, e com uma ressalva que NÃO é da alçada do Coastal Navigator
--  mas foi vista ao levantar este retrato:
--
--     o papel `anon` tem SELECT, INSERT, UPDATE, DELETE e TRUNCATE em
--     `scores`, com política de leitura e inserção públicas.
--
--  Ou seja: qualquer portador da chave publishable pode ESVAZIAR a tabela de
--  placares. Se o tugrush ainda importa, isso merece uma olhada — e não foi
--  tocado aqui porque não é deste produto.

create table if not exists public.scores (
  id          bigint generated always as identity primary key,
  name        text,
  score       integer,
  time        integer,
  created_at  timestamptz default now()
);
