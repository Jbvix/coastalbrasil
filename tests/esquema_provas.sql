-- ═══════════════════════════════════════════════════════════════════════════
--  PROVAS DO ESQUEMA — executadas num Postgres de verdade
--  Autor: Jossian Brito (Charlie Bravo)
--  Versão 1.0.0 — 01/10/2026 · Etapa C2
-- ═══════════════════════════════════════════════════════════════════════════
--
--  POR QUE ISTO NÃO É UMA VARREDURA DE TEXTO
--
--  A primeira versão do supabase/licenca.sql trazia:
--
--      revoke execute on function public.create_license(...) from anon;
--
--  Lido, parece correto. Executado, não faz NADA: o Postgres concede EXECUTE
--  a `public` por padrão, e revogar de `anon` revoga uma concessão direta que
--  nunca existiu. Medido, com o papel anon assumido, o `anon` EMITIU uma
--  licença de 99 dias para si mesmo.
--
--  Nenhuma varredura de texto pegaria isso — o texto estava certo. Por isso
--  o esquema é provado RODANDO, como a guarda do proxy na suíte 27.
--
--  Falha aqui = exceção = psql sai diferente de zero = CI vermelho.
-- ═══════════════════════════════════════════════════════════════════════════

\set ON_ERROR_STOP on

create or replace function pg_temp.exigir(cond boolean, msg text)
returns void language plpgsql as $$
begin
  if not cond then raise exception 'PROVA FALHOU: %', msg; end if;
end $$;

truncate table public.licenses;

-- ── 1 · O veredito diz o MOTIVO, não só sim ou não ────────────────────────
do $$
declare
  h_ok    text := 'aaaa000000000000000000000000000000000000000000000000000000000001';
  h_venc  text := 'aaaa000000000000000000000000000000000000000000000000000000000002';
  h_revog text := 'aaaa000000000000000000000000000000000000000000000000000000000003';
  r record;
begin
  perform public.create_license(h_ok, 'SAAM ORION', '5585997737230',
                                now() + interval '15 days', 3::smallint, null);
  perform public.create_license(h_revog, 'SAAM VEGA', null,
                                now() + interval '7 days', 1::smallint, null);
  perform public.revoke_license(h_revog);

  -- Vencida de verdade: emitida há 20 dias para valer 15. A trava
  -- expires_at > created_at segue respeitada, como na vida real.
  insert into public.licenses(token_hash, vessel, created_at, expires_at, devices)
  values (h_venc, 'SAAM SIRIUS', now() - interval '20 days',
          now() - interval '5 days', 2::smallint);

  select * into r from public.check_license(h_ok);
  perform pg_temp.exigir(r.valid and not r.revoked and not r.expired, 'licença válida não foi aceita');
  perform pg_temp.exigir(r.vessel = 'SAAM ORION', 'a embarcação não voltou no veredito');
  perform pg_temp.exigir(r.devices = 3, 'o número de dispositivos não voltou');
  perform pg_temp.exigir(r.expires_at > now(), 'a data de vencimento não voltou');

  select * into r from public.check_license(h_venc);
  perform pg_temp.exigir(not r.valid and r.expired and not r.revoked,
    'VENCIDA não é distinguível — o cliente não teria como dizer o motivo');

  select * into r from public.check_license(h_revog);
  perform pg_temp.exigir(not r.valid and r.revoked and not r.expired,
    'REVOGADA não é distinguível de vencida');

  perform pg_temp.exigir(
    (select count(*) from public.check_license(repeat('f',64))) = 0,
    'hash desconhecido devolveu linha em vez de nada');
end $$;

-- ── 2 · As travas de integridade recusam o que devem ──────────────────────
do $$
declare
  casos text[][] := array[
    ['abc',                                                               'X','hash curto'],
    ['AAAA000000000000000000000000000000000000000000000000000000000009', 'X','hash em maiúsculas'],
    ['bbbb000000000000000000000000000000000000000000000000000000000001', '   ','embarcação em branco']
  ];
  c text[]; recusou boolean;
begin
  foreach c slice 1 in array casos loop
    recusou := false;
    begin
      perform public.create_license(c[1], c[2], null, now() + interval '1 day', 1::smallint, null);
    exception when others then recusou := true;
    end;
    perform pg_temp.exigir(recusou, 'a trava deixou passar: ' || c[3]);
  end loop;

  recusou := false;
  begin
    perform public.create_license(repeat('c',64), 'X', null, now() - interval '1 day', 1::smallint, null);
  exception when others then recusou := true; end;
  perform pg_temp.exigir(recusou, 'aceitou licença que já nasce vencida');

  recusou := false;
  begin
    perform public.create_license(repeat('d',64), 'X', null, now() + interval '1 day', 0::smallint, null);
  exception when others then recusou := true; end;
  perform pg_temp.exigir(recusou, 'aceitou licença para zero dispositivos');

  /* Hash repetido TEM de levantar exceção. `on conflict do nothing` aqui
     faria o administrador crer que renovou quando não renovou nada. */
  recusou := false;
  begin
    perform public.create_license('aaaa000000000000000000000000000000000000000000000000000000000001',
                                  'OUTRA', null, now() + interval '1 day', 1::smallint, null);
  exception when others then recusou := true; end;
  perform pg_temp.exigir(recusou, 'reemissão do mesmo hash foi silenciada');
end $$;

-- ── 3 · A TRANCA: quem porta a chave publishable não alcança a licença ────
--  Esta é a prova que a varredura de texto não daria. O papel `anon` é o que
--  o navegador assume com a chave que vai no JavaScript de todo visitante.
do $$
declare negou boolean;
begin
  foreach negou in array array[true] loop end loop;  -- no-op, legibilidade

  negou := false;
  begin
    set local role anon;
    perform public.check_license(repeat('a',64));
    reset role;
  exception when insufficient_privilege then negou := true; reset role;
           when others then reset role; raise;
  end;
  perform pg_temp.exigir(negou, 'anon CONSULTA licença — oráculo de força bruta aberto');

  negou := false;
  begin
    set local role anon;
    perform public.create_license(repeat('e',64), 'PIRATA', null,
                                  now() + interval '99 days', 9::smallint, null);
    reset role;
  exception when insufficient_privilege then negou := true; reset role;
           when others then reset role; raise;
  end;
  perform pg_temp.exigir(negou, 'anon EMITE a própria licença — foi o defeito real de 01/10/2026');

  negou := false;
  begin
    set local role anon;
    perform public.revoke_license(repeat('a',64));
    reset role;
  exception when insufficient_privilege then negou := true; reset role;
           when others then reset role; raise;
  end;
  perform pg_temp.exigir(negou, 'anon REVOGA licença alheia');

  negou := false;
  begin
    set local role anon;
    perform (select count(*) from public.licenses);
    reset role;
  exception when insufficient_privilege then negou := true; reset role;
           when others then reset role; raise;
  end;
  perform pg_temp.exigir(negou, 'anon LÊ a tabela de licenças direto');

  --  C6 — a listagem é a mais perigosa de todas se vazar: ela devolve a
  --  frota INTEIRA de uma vez, com embarcação, contato e vencimento. As
  --  outras exigem adivinhar um hash de 256 bits; esta não exige nada.
  negou := false;
  begin
    set local role anon;
    perform public.list_licenses();
    reset role;
  exception when insufficient_privilege then negou := true; reset role;
           when others then reset role; raise;
  end;
  perform pg_temp.exigir(negou, 'anon LISTA a frota inteira — embarcação, contato e vencimento de todos');
end $$;

-- ── 3b · A listagem devolve o que o painel precisa, e na ordem certa ──────
--  Provada EXECUTANDO, com o service_role. Ordem: ativas primeiro, e dentro
--  delas as que vencem mais cedo — é a ordem em que o autor precisa agir.
do $$
declare
  n_total   integer;
  primeira  text;
  tem_hash  boolean;
begin
  --  Três situações, uma de cada tipo. A vencida precisa nascer no passado:
  --  o `check (expires_at > created_at)` impede inserir já vencida, e a
  --  trava está certa — encurtar não é vencer.
  delete from public.licenses;
  insert into public.licenses (token_hash, vessel, expires_at, devices)
  values (repeat('1',64), 'ATIVA TARDE', now() + interval '10 days', 3);
  insert into public.licenses (token_hash, vessel, expires_at, devices)
  values (repeat('2',64), 'ATIVA CEDO',  now() + interval '1 day',  3);
  insert into public.licenses (token_hash, vessel, created_at, expires_at, devices)
  values (repeat('3',64), 'JA VENCIDA', now() - interval '9 days', now() - interval '2 days', 3);
  insert into public.licenses (token_hash, vessel, expires_at, devices)
  values (repeat('4',64), 'REVOGADA', now() + interval '5 days', 3);
  perform public.revoke_license(repeat('4',64));

  select count(*) into n_total from public.list_licenses();
  perform pg_temp.exigir(n_total = 4, 'list_licenses não devolveu as 4 linhas: ' || n_total);

  --  A que vence mais cedo entre as ATIVAS tem de vir primeiro.
  select vessel into primeira from public.list_licenses() limit 1;
  perform pg_temp.exigir(primeira = 'ATIVA CEDO',
    'a ordem está errada: veio "' || primeira || '" em vez de ATIVA CEDO');

  --  O token_hash volta, porque é por ele que a revogação pega a linha. É o
  --  SHA-256, não o token: não se inverte e não abre nada.
  select bool_and(token_hash ~ '^[0-9a-f]{64}$') into tem_hash from public.list_licenses();
  perform pg_temp.exigir(tem_hash, 'list_licenses não devolve token_hash utilizável para revogar');

  --  E o token EM CLARO não existe em lugar nenhum desta tabela: a coluna
  --  nunca foi criada. A propriedade é do desenho, não da disciplina de quem
  --  escreve a consulta.
  perform pg_temp.exigir(
    not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'licenses'
                   and column_name in ('token', 'token_plain', 'codigo')),
    'apareceu coluna de token em claro na tabela de licenças');

  delete from public.licenses;
end $$;

-- ── 4 · O espelhamento continua aberto ao navegador ───────────────────────
--  Trancar a licença não pode trancar junto o que deve ficar aberto. O
--  observador em terra chama check_nav_share direto do navegador.
do $$
declare funcionou boolean := false;
begin
  begin
    set local role anon;
    perform public.check_nav_share('qualquer');
    reset role;
    funcionou := true;
  exception when others then reset role;
  end;
  perform pg_temp.exigir(funcionou,
    'a tranca da licença fechou junto o espelhamento — quem fica em terra perde a viagem');
end $$;

select 'ESQUEMA: todas as provas passaram' as resultado;
