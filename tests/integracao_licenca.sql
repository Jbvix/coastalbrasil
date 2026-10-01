--  ════════════════════════════════════════════════════════════════════════
--  PROVA DE INTEGRAÇÃO — parte 1: o banco produz as linhas
--  ════════════════════════════════════════════════════════════════════════
--  Autor: Jossian Brito (Charlie Bravo) · 2026-10-01 · etapa C6
--
--  POR QUE ESTE ARQUIVO EXISTE, e a razão é um defeito que escapou.
--
--  Até a C6, `vereditoDaLinha()` em netlify/lib/licenca.mjs lia
--  `linha.revoked_at`. O `check_license` devolve `revoked`, booleano. A
--  coluna `revoked_at` NUNCA EXISTIU. Resultado: licença revogada e dentro
--  do prazo seria aceita como VÁLIDA — revogar não revogaria nada.
--
--  Duas baterias de provas olharam para esse código e nenhuma viu:
--
--    · tests/esquema_provas.sql  mede o SQL, no Postgres, sem JavaScript;
--    · a suíte 29               mede o JavaScript, com fixtures escritas
--                               à mão — e elas traziam `revoked_at`, porque
--                               nasceram do MESMO modelo mental do código.
--
--  Duas provas que partem da mesma suposição não são duas provas. O que
--  faltava era alguém ATRAVESSAR a fronteira: pegar a linha que o banco
--  realmente devolve e entregá-la à função que realmente a consome.
--
--  É a diferença entre testar a bomba no banco de ensaio, testar a tubulação
--  na bancada, e nunca ligar uma na outra: cada metade aprovada, e o conjunto
--  sem prova nenhuma.
--
--  Este arquivo monta as três situações e imprime as linhas EXATAMENTE como
--  o `check_license` as devolve. A parte 2 (integracao_licenca.mjs) alimenta
--  o veredito com elas e confere o resultado.
--  ════════════════════════════════════════════════════════════════════════

\set ON_ERROR_STOP on
set client_min_messages to warning;

--  ⚠️ TUDO O QUE É PREPARAÇÃO VAI PARA O LIXO, e isto quebrou na primeira
--  execução em CI. O arquivo de saída recebe o stdout INTEIRO do psql, e o
--  `select public.revoke_license(...)` lá embaixo imprime o resultado dele:
--
--      SyntaxError: Unexpected token 'r', " revoke_lic"... is not valid JSON
--
--  O `-q` da linha de comando silencia INSERT e CREATE, mas NÃO silencia o
--  resultado de um select — e revogar, aqui, é um select.
--
--  Redirecionar explicitamente é mais seguro que confiar em quais comandos
--  o `-q` cala: o arquivo passa a conter exatamente uma coisa, por
--  construção. Separar a tubulação de descarga da de serviço, em vez de
--  contar com a válvula certa estar fechada.
\o /dev/null

truncate table public.licenses;

--  1 · VÁLIDA — emitida agora, vence em 7 dias.
insert into public.licenses (token_hash, vessel, contact, expires_at, devices)
values (repeat('a', 64), 'SAAM ORION', 'wa:5585997737230', now() + interval '7 days', 3);

--  2 · VENCIDA — o `check (expires_at > created_at)` impede inserir uma
--      licença já nascida vencida, e a trava está certa: encurtar não é
--      vencer. Então cria-se no passado, com prazo que já correu.
insert into public.licenses (token_hash, vessel, contact, created_at, expires_at, devices)
values (repeat('b', 64), 'RT ATLANTICO', 'wa:5585900000000',
        now() - interval '10 days', now() - interval '3 days', 2);

--  3 · REVOGADA E DENTRO DO PRAZO — a situação exata que o defeito deixava
--      passar. Vence só daqui a 7 dias; o que a invalida é a revogação.
insert into public.licenses (token_hash, vessel, contact, expires_at, devices)
values (repeat('c', 64), 'BRAVO DOIS', 'wa:5585911111111', now() + interval '7 days', 5);
select public.revoke_license(repeat('c', 64));

--  A partir daqui, e SÓ a partir daqui, a saída volta para o arquivo.
\o

--  As linhas, como o serviço as recebe. `json_agg` para a parte 2 ler sem
--  precisar de biblioteca de banco — o banco de provas desta casa não tem
--  dependências, e esta prova não vai ser a primeira.
\pset tuples_only on
\pset format unaligned

select json_build_object(
  'valida',   (select row_to_json(t) from public.check_license(repeat('a', 64)) t),
  'vencida',  (select row_to_json(t) from public.check_license(repeat('b', 64)) t),
  'revogada', (select row_to_json(t) from public.check_license(repeat('c', 64)) t),
  'ausente',  (select row_to_json(t) from public.check_license(repeat('f', 64)) t)
);
