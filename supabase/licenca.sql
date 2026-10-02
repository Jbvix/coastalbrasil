-- ═══════════════════════════════════════════════════════════════════════════
--  LICENÇA DE SERVIÇO — esquema APLICADO em produção
--  Autor: Jossian Brito (Charlie Bravo)
--  Versão 1.1.0 — 02/10/2026, 00:50 UTC · Etapas C2…C6 + C8
--  Projeto: nsbeddfkcdyssrirrhzt  (sa-east-1)
--
--  HISTÓRICO DE MODIFICAÇÕES
--   1.0.0 — 01/10/2026 · C2…C6. Proposta, revisada em pull request, não
--           executada em banco nenhum.
--   1.1.0 — 02/10/2026 · APLICADA em produção sob autorização explícita
--           (migração `licencas_de_servico_c2_c6`). Acrescentada a SEÇÃO C8
--           ao final: revogação dos privilégios de TABELA que o Supabase
--           concede ao `anon` por padrão. Motivo medido, não suposto — a
--           RLS NÃO detém TRUNCATE.
-- ═══════════════════════════════════════════════════════════════════════════
--
--  ✅  ESTE ARQUIVO JÁ FOI EXECUTADO NO BANCO DE PRODUÇÃO.
--      Aplicado em 02/10/2026 sob autorização explícita, depois de revisado
--      em pull request — que é onde uma decisão de esquema deve ser
--      discutida, e não no painel do Supabase, às pressas, sem registro.
--      As pós-condições foram MEDIDAS após a aplicação, não presumidas:
--      tabela criada, RLS ligada, 0 políticas, 4 funções SECURITY DEFINER
--      com search_path fixo, `anon` negado nas quatro, `service_role`
--      liberado nas quatro, `check_nav_share` intacta para o `anon`.
--
--      Quem for reaplicar do zero: rode o arquivo INTEIRO, seção C8
--      inclusive. Parar antes dela deixa a tabela esvaziável.
--
--  O QUE A LICENÇA COBRE, E POR QUÊ SÓ ISSO
--
--  Caminho C, decidido em 01/10/2026: a carta fica aberta e cobra-se pelo que
--  roda em servidor e custa. Um aplicativo estático não tem segredo — mapa,
--  faróis, ETA, GPX, Iara, ondas e RPM são entregues ao navegador e rodam
--  nele. Trancá-los é teatro, contornável com F12.
--
--  Logo a licença NÃO libera o aplicativo. Ela libera os dois serviços que
--  saem do bolso do autor:
--      · a previsão de tempo (chave paga do Open-Meteo, via proxy Netlify);
--      · o espelhamento da viagem (este Supabase).
--
--  POR EMBARCAÇÃO, E NÃO POR PESSOA
--
--  Rebocador tem rendição de tripulação. Licença por pessoa transformaria
--  cada troca de turno em chamado de suporte, e na prática a senha acabaria
--  escrita num papel colado no console — que é o pior lugar possível. A
--  embarcação é a unidade que não muda entre quartos.
-- ═══════════════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────────────
-- 1 · A TABELA
-- ───────────────────────────────────────────────────────────────────────────
--
--  ⚠️ DIFERENÇA DELIBERADA EM RELAÇÃO A `nav_shares`: AQUI NÃO SE GUARDA O
--     TOKEN, E SIM O SHA-256 DELE.
--
--  `nav_shares` guarda o token em claro, e isso é tolerável lá: o link de
--  acompanhamento expõe a posição de uma viagem e nada mais.
--
--  Licença é outra coisa. É credencial de serviço pago, e vale enquanto não
--  expirar. Guardando só o resumo, um vazamento do banco entrega hashes —
--  inúteis para quem quer usar o serviço, porque SHA-256 não se inverte.
--
--  O QUE O HASH NÃO PROTEGE, dito antes que alguém se iluda: ele não protege
--  contra roubo em trânsito nem contra quem copia o token do aparelho. Hash
--  guarda contra VAZAMENTO DO BANCO. Quem rouba o token usa o token.
--
--  E o resumo é calculado por QUEM CHAMA, nunca aqui dentro. Se a função
--  recebesse o token em claro para resumi-lo em SQL, o token passaria pelo
--  servidor do banco e poderia acabar num log de consulta lenta. O banco
--  nunca vê o token — só o hash. Isso também significa que NEM O AUTOR
--  recupera um token perdido: emite-se outro. É o preço, e é o certo.

create table if not exists public.licenses (
  -- SHA-256 do token, em hexadecimal minúsculo (64 caracteres).
  token_hash   text        primary key
               check (token_hash ~ '^[0-9a-f]{64}$'),

  -- A embarcação é a titular. Texto livre de propósito: a frota é pequena e
  -- conhecida, e uma tabela de embarcações seria estrutura sem população.
  vessel       text        not null check (length(btrim(vessel)) > 0),

  -- Como falar com quem pediu (WhatsApp ou e-mail). Mínimo necessário para
  -- avisar que a licença vence — nada além, porque cada campo guardado é
  -- passivo a mais se isto virar relação de consumo.
  contact      text,

  created_at   timestamptz not null default now(),

  -- NOT NULL, ao contrário do `expires_at` de nav_shares. Licença sem prazo
  -- é licença perpétua por esquecimento, e as faixas combinadas são
  -- 24h / 72h / 7 dias / 15 dias.
  expires_at   timestamptz not null check (expires_at > created_at),

  revoked      boolean     not null default false,

  -- Quantos aparelhos a embarcação pode usar ao mesmo tempo. Hoje é um
  -- número DECLARADO, não imposto: nada no servidor conta dispositivos
  -- ainda. Está aqui para a decisão ficar registrada junto da licença e
  -- para a C4 ter onde se apoiar. Declarar um limite que não se aplica é
  -- aceitável; FINGIR que ele se aplica não seria.
  devices      smallint    not null default 3 check (devices between 1 and 20),

  note         text
);

create index if not exists licenses_vessel_idx  on public.licenses (vessel);
create index if not exists licenses_expires_idx on public.licenses (expires_at);

-- Selada como `nav_shares`: RLS ligado e NENHUMA política. Os papéis `anon` e
-- `authenticated` não alcançam esta tabela nem portando a chave publishable.
-- A porta são as funções abaixo.
alter table public.licenses enable row level security;


-- ───────────────────────────────────────────────────────────────────────────
-- 2 · CHECAR — devolve o MOTIVO, nunca um booleano
-- ───────────────────────────────────────────────────────────────────────────
--
--  Mesmo princípio de `check_nav_share`: o cliente precisa poder dizer
--  "licença vencida" ou "licença revogada" em vez de um "negado" mudo. Sem
--  isso, a etapa C5 (dizer ao usuário POR QUE o tempo parou) não teria o que
--  dizer.
--
--  `expires_at` volta junto para o chamador saber QUANDO vence — é o que
--  permite avisar "vence em 2 dias" antes de o comandante largar o cais, em
--  vez de descobrir no mar.
--
--  Comportamento conforme o estado:
--     hash inexistente          → nenhuma linha  (o chamador trata como inválida)
--     revogada                  → valid=false, revoked=true
--     vencida                   → valid=false, expired=true
--     válida                    → valid=true, com vessel e expires_at
create or replace function public.check_license(p_token_hash text)
returns table(valid boolean, revoked boolean, expired boolean,
              vessel text, expires_at timestamptz, devices smallint)
language sql
security definer
set search_path to 'public'
as $function$
  select
    (not l.revoked and l.expires_at > now())            as valid,
    l.revoked,
    (l.expires_at <= now())                             as expired,
    l.vessel,
    l.expires_at,
    l.devices
  from public.licenses l
  where l.token_hash = p_token_hash;
$function$;

--  ⚠️ GRANT MAIS ESTREITO QUE O DE `nav_shares`, E DE PROPÓSITO.
--
--  As funções de espelhamento são liberadas para `anon` porque o observador
--  em terra chama direto do navegador. Esta NÃO é: quem consulta a licença é
--  a Função Netlify, do lado do servidor, com a chave de serviço.
--
--  Liberar para `anon` transformaria a função num ORÁCULO de força bruta:
--  qualquer um poderia testar hashes à vontade. Com token de 256 bits isso é
--  inviável na prática — mas "inviável" não é motivo para abrir uma porta
--  que ninguém precisa que esteja aberta.
--
--  CONSEQUÊNCIA A DECLARAR: a etapa C4 vai precisar de uma chave de serviço
--  do Supabase nas variáveis de ambiente do Netlify. É segredo novo, e
--  segredo novo é decisão, não detalhe.
--  ⚠️ REVOGAR DE `public`, NUNCA DE `anon` — e isto quase passou.
--
--  O Postgres concede EXECUTE em toda função nova ao papel `public`, do qual
--  todos herdam. Escrever `revoke execute ... from anon` revoga uma concessão
--  DIRETA que nunca existiu: o comando roda sem erro e não faz absolutamente
--  nada. A permissão continua vindo por `public`.
--
--  Foi exatamente o que a primeira versão deste arquivo fazia. Medido num
--  Postgres 16 local, com o papel `anon` assumido:
--
--      anon → check_license    devolveu 1 linha
--      anon → create_license   EMITIU uma licença de 99 dias para si mesmo
--      anon → revoke_license   revogou a licença de outra embarcação
--
--  Ou seja: qualquer portador da chave publishable — que vai no JavaScript
--  de qualquer visitante — fabricaria a própria licença. A trava parecia
--  certa, rodava sem reclamar, e não trancava nada.
--
--  A ordem importa: revoga-se de `public` PRIMEIRO, só então se concede a
--  quem deve. Inverter deixaria uma janela com a porta aberta.
revoke execute on function public.check_license(text) from public, anon, authenticated;
grant  execute on function public.check_license(text) to service_role;


-- ───────────────────────────────────────────────────────────────────────────
-- 3 · EMITIR e REVOGAR — só o administrador
-- ───────────────────────────────────────────────────────────────────────────
--
--  `on conflict do nothing` NÃO serve aqui. Em `create_nav_share` ele torna o
--  reenvio idempotente, e reenviar é normal. Aqui, dois tokens diferentes
--  jamais colidem em SHA-256; uma colisão de chave significaria reemissão do
--  MESMO token, que é erro de quem emite. Silenciar isso faria o
--  administrador acreditar que renovou uma licença quando não renovou nada.
--
--  Então: conflito levanta exceção, e quem emite fica sabendo.
create or replace function public.create_license(p_token_hash text,
                                                 p_vessel text,
                                                 p_contact text,
                                                 p_expires timestamptz,
                                                 p_devices smallint default 3,
                                                 p_note text default null)
returns void
language sql
security definer
set search_path to 'public'
as $function$
  insert into public.licenses(token_hash, vessel, contact, expires_at, devices, note)
  values (p_token_hash, p_vessel, p_contact, p_expires, p_devices, p_note);
$function$;

--  Marca, não apaga — igual a `revoke_nav_share`. Apagar perderia o registro
--  de que a licença existiu, e a quem foi emitida.
create or replace function public.revoke_license(p_token_hash text)
returns void
language sql
security definer
set search_path to 'public'
as $function$
  update public.licenses set revoked = true where token_hash = p_token_hash;
$function$;

--  ════════════════════════════════════════════════════════════════════════
--  LISTAR — a operação que faltava para o painel ser utilizável      (C6)
--  ════════════════════════════════════════════════════════════════════════
--  Sem isto, quem emite não tem como saber o que emitiu. O autor ficaria
--  dependendo de uma planilha paralela, e planilha paralela diverge do banco
--  no primeiro dia corrido — vira o diário de bordo que ninguém atualizou
--  depois da manobra.
--
--  DEVOLVE O `token_hash`, e isso é deliberado: é o SHA-256, não o token.
--  Não se inverte, não serve para entrar em lugar nenhum, e é a ÚNICA chave
--  por onde a revogação pega a linha certa. Quem recebe esta listagem já
--  passou pelo scrypt do portão.
--
--  NÃO devolve nada que o banco não tenha: o token em claro não existe aqui,
--  e por isso nenhuma listagem pode vazá-lo. A propriedade vem do desenho,
--  não da disciplina de quem escreve a consulta.
--
--  ORDEM: ativas primeiro, e dentro delas as que vencem mais cedo. É a ordem
--  em que o autor precisa agir — quem vence amanhã importa mais que quem
--  venceu mês passado. Teto de 200 porque a frota é pequena e uma listagem
--  sem limite é uma surpresa esperando o banco crescer.
create or replace function public.list_licenses()
returns table(token_hash text, vessel text, contact text,
              created_at timestamptz, expires_at timestamptz,
              revoked boolean, devices smallint, note text,
              valid boolean, expired boolean)
language sql
security definer
set search_path to 'public'
as $function$
  select l.token_hash, l.vessel, l.contact, l.created_at, l.expires_at,
         l.revoked, l.devices, l.note,
         (not l.revoked and l.expires_at > now())  as valid,
         (l.expires_at <= now())                   as expired
    from public.licenses l
   order by (not l.revoked and l.expires_at > now()) desc,
            l.expires_at asc
   limit 200;
$function$;

--  Mesma tranca das outras: REVOGAR DE `public` PRIMEIRO. O Postgres concede
--  EXECUTE a `public` por padrão, e revogar só de `anon` seria revogar uma
--  concessão direta que nunca existiu — foi o defeito que a C2 mediu e que
--  nenhuma leitura de texto tinha pegado.
revoke execute on function public.list_licenses() from public, anon, authenticated;
grant  execute on function public.list_licenses() to service_role;

--  Emitir e revogar NÃO são operações de navegador. Ficam com o serviço, e a
--  etapa C3 (portão administrativo com validação de servidor) é quem vai
--  chamá-las. Enquanto a C3 não existir, nenhuma delas é alcançável pelo
--  cliente — que é exatamente onde devem ficar.
revoke execute on function public.create_license(text, text, text, timestamptz, smallint, text)
                 from public, anon, authenticated;
revoke execute on function public.revoke_license(text) from public, anon, authenticated;
grant  execute on function public.create_license(text, text, text, timestamptz, smallint, text)
                 to service_role;
grant  execute on function public.revoke_license(text) to service_role;


-- ═══════════════════════════════════════════════════════════════════════════
--  SEÇÃO C8 — PRIVILÉGIOS DE TABELA
--  Versão 1.1.0 — 02/10/2026, 00:50 UTC · Jossian Brito (Charlie Bravo)
--  Aplicada em produção pela migração `c8_revogar_privilegios_de_tabela_do_anon`
-- ═══════════════════════════════════════════════════════════════════════════
--
--  O DEFEITO QUE ESTA SEÇÃO CORRIGE, E POR QUE ELE PASSOU DESPERCEBIDO
--
--  Tudo acima desta linha tranca o acesso às licenças por DUAS vias: a RLS
--  ligada sem política nenhuma (nenhuma linha sai) e o REVOKE EXECUTE nas
--  quatro funções (nenhuma chamada entra). Eu dei isso por "tabela selada".
--
--  Estava incompleto, e a incompletude tem nome: TRUNCATE NÃO PASSA PELA RLS.
--  O Postgres trata TRUNCATE como DDL — consulta o GRANT da tabela e ignora
--  TODA e QUALQUER política, permissiva ou restritiva. REFERENCES e TRIGGER
--  têm a mesma natureza.
--
--  E o Supabase, por `default privileges` do schema `public`, concede aos
--  papéis `anon` e `authenticated` os SETE privilégios em cada tabela nova:
--      DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
--
--  Medido em 02/10/2026 00:4x UTC, antes desta seção existir:
--      licenses | anon | DELETE, INSERT, REFERENCES, SELECT, TRIGGER,
--               |      | TRUNCATE, UPDATE
--
--  Quer dizer: a tabela estava selada para LER, INSERIR, ALTERAR e APAGAR
--  linha a linha — isso era verdade e continua sendo — mas o papel público
--  carregava um TRUNCATE capaz de ESVAZIAR A FROTA INTEIRA de uma vez, RLS e
--  tudo. Não era alcançável pela Data API (o PostgREST não expõe TRUNCATE, e
--  nenhuma função executável por `anon` o chama), então nunca houve água
--  entrando pelo casco. Era carga mal peada no porão: inofensiva com bom
--  tempo, e é o que vira o navio quando o tempo muda.
--
--  Analogia de praxe: a RLS é o controle de quem pode abrir cada porta do
--  compartimento. O TRUNCATE não abre porta — ele derruba o anteparo. De
--  nada adianta trancar as portas de um anteparo que qualquer um pode cortar.
--
--  LIÇÃO, para ficar no arquivo e não só na cabeça:
--  «RLS responde "quais linhas". GRANT responde "qual comando". Quem só
--   olha a RLS não enxerga os comandos que a RLS não governa.»

--  ── licenses ───────────────────────────────────────────────────────────
--  O navegador não tem absolutamente nenhum assunto com esta tabela. Toda
--  conversa passa pelas quatro funções SECURITY DEFINER, que rodam como
--  `postgres` (dono da tabela, e `relforcerowsecurity = false`) e portanto
--  continuam passando por fora da RLS e dos GRANTs revogados aqui.
--  Depois desta linha, o anon não aparece nem na lista de concessões.
revoke all on public.licenses from anon, authenticated;

--  ── scores ─────────────────────────────────────────────────────────────
--  Caso DIFERENTE, e a diferença é o ensinamento. Aqui o navegador PRECISA
--  falar com a tabela: o jogo lê o ranque e grava a pontuação pela Data API.
--
--  GRANT e política são dois cadeados EM SÉRIE — o Postgres exige os dois
--  abertos para deixar passar. A tabela já tinha as duas políticas certas
--  («leitura pública» SELECT, «inserção pública» INSERT), mas o GRANT estava
--  escancarado nos sete. Só a política segurava, e política não segura
--  TRUNCATE. Revoga-se tudo e devolve-se EXATAMENTE o que as políticas usam.
revoke all on public.scores    from anon, authenticated;
grant  select, insert on public.scores to anon, authenticated;

--  PÓS-CONDIÇÕES MEDIDAS em 02/10/2026 00:5x UTC, pela mesma porta que o
--  navegador usa (chave publicável, via PostgREST):
--    1. GET  /rest/v1/scores?select=id&limit=1        → 200        (lê)
--    2. POST /rest/v1/scores                          → 400 «23502 null value
--       in column "time"» — restrição de COLUNA, que o Postgres só confere
--       DEPOIS de aprovar privilégio e política: o INSERT passou os dois
--       cadeados, quem recusou foi o payload incompleto da sonda. Prova mais
--       forte que a pretendida, e sem sujar a tabela com linha de teste.
--    3. GET  /rest/v1/licenses?select=vessel          → 401 «42501 permission
--       denied for table licenses». Antes da C8 isto devolvia lista VAZIA
--       (negado pela RLS); agora é negado antes, no privilégio. Dois
--       anteparos em série em vez de um.
--    4. POST /rest/v1/rpc/check_nav_share             → 200        (intacta)
--    5. POST /rest/v1/rpc/create_license              → 401 «42501 permission
--       denied for function create_license»
--
--  ⚠️  DÍVIDA DECLARADA, NÃO CORRIGIDA AQUI
--  Isto conserta as tabelas que EXISTEM. O `default privileges` do Supabase
--  continua de pé: a PRÓXIMA tabela criada no schema `public` nascerá de novo
--  com os sete privilégios para `anon`. A correção de raiz é um
--  `alter default privileges`, que afeta todo o schema e todo trabalho
--  futuro — decisão larga demais para entrar de carona numa correção de duas
--  tabelas. Fica registrada aqui para ser decidida de frente.
