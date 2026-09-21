# Banco de provas

```bash
npm test
```

259 provas em 26 suítes, executadas sobre as **funções reais** extraídas do
`app.html` e dos módulos por contagem de chaves — não sobre uma
reimplementação. Sem dependências: Node puro.

**Código de saída: 0 quando não há falha, 1 quando há.** Só `FAIL` derruba;
`WARN` não. Vale para `npm test`, para o `&&` de um script e para a
integração contínua — que é quem não tem olhos para ver o `✘` vermelho.

| Suíte | Cobre |
|---|---|
| 1 · Geodésia | Haversine e rumo, com Vincenty/WGS-84 como referência independente |
| 2 · Visibilidade | Alcance geográfico, efetivo e altura do olho |
| 3 · Base de faróis | Esquema, unicidade de id, faixa física das altitudes |
| 4 · XTE | Erro lateral e projeção ao longo da derrota |
| 5 · Combustível/ETA | Cadeia de consumo, rebase ao apagar waypoint |
| 6 · GPX | Ida-e-volta, escape XML, preservação de nomes |
| 7 · Formatação | Coordenada náutica e duração |
| 8 · Data/hora | Fuso do campo de partida |
| 9 · Segurança | Injeção, credenciais, CSP, SRI |
| 10 · Distância da costa | Poligonal costeira |
| 11 · Cruzamento OSM | Sanidade secundária contra a base OpenStreetMap |
| 12 · Higiene | Tamanho do arquivo, logs em caminho quente |
| 13–25 · Iara e companhia | Voz, relatórios, tempo, referências, RPM, ondas, conversa |
| 26 · Integração contínua | O workflow dispara, roda as duas provas, não pede segredo — e `FAIL` derruba a obra |

Provas em vermelho são defeitos **conhecidos e documentados**, não regressões.
Cada uma traz na mensagem de falha o arquivo, a linha e a consequência a bordo.

## Fumaça em navegador real

```bash
npm i -D playwright && npx playwright install chromium
npm run smoke
```

`npm test` executa as funções fora do navegador, sem DOM. Ele **não** pega
regressão de carregamento: ordem errada de `<script>`, caminho de módulo
quebrado, hash de SRI inválido, CSS que não chega. Depois da modularização da
v2.2.0 isso deixou de ser hipotético.

`npm run smoke` abre o app de verdade e percorre o fluxo completo — configurar
viagem, criar waypoints, apagar o primeiro, exportar GPX, gerar relatório — e
falha se aparecer **um único** erro de console. São 71 passos.

Um deles confere a **premissa** das provas do banner — o canal de telemetria
é bloqueado de propósito (`routeWebSocket`), porque `route()` intercepta HTTP e
o Realtime do Supabase é WebSocket. Sem esse bloqueio explícito, as provas só
valiam na máquina de quem as escreveu.

Outros dois esperam **32 segundos de relógio** de propósito: o defeito que
guardam (a revalidação do espelho acusando o link de quem está em terra) só
nasce aos 30 s. Encurtar o intervalo mediria um intervalo que não existe em
produção — prova de corrida que não deixa a corrida acontecer não prova nada.

**Sem saída para a internet?** Coloque `leaflet.js`, `leaflet.css` e
`supabase.js` em `tests/fixtures/` e eles serão servidos no lugar das CDNs.
Como são os mesmos bytes de que os hashes SRI foram calculados, o navegador
ainda valida a integridade: um hash errado derruba o teste.

Se o Chromium estiver em `PLAYWRIGHT_BROWSERS_PATH` com revisão diferente da
esperada, o teste o localiza sozinho. `CHROMIUM_PATH` força um caminho.

## Em cada pull request  (v2.14.0)

O workflow `.github/workflows/provas.yml` roda **as duas** em todo pull request
para a `main`: `node tests/suite.js` num job, `npm run smoke` noutro.

Antes disso, as provas só rodavam quando alguém lembrava — e a disciplina
inteira dependia de memória humana.

**O que a ligação revelou.** Até a v2.13.0 esta suíte **sempre saía com código
0**, mesmo falhando. Um humano vê o `✘`; uma máquina de integração só consulta
o código de saída. Ligada assim, ela teria sido um alarme com a lâmpada fora do
circuito. A correção separa a decisão do efeito — `codigoDeSaida()` é pura e é
provada em 26.3/26.4; `process.exitCode` é só o efeito.

**Por que `WARN` não derruba.** Os avisos são defeitos conhecidos e
documentados. Luz vermelha que acende todo dia deixa de ser vista.

**Sem segredo nenhum.** O workflow dispara em `pull_request`, que pode vir de
código não revisado, então tem `permissions: contents: read` e não referencia
`secrets`. As provas rodam inteiras assim — a fumaça serve um
`cesium-config.js` vazio de propósito. A prova 26.5 guarda isso.

**Na integração as CDNs são as de verdade.** `tests/fixtures/` não é
versionado, então no CI os hashes SRI são conferidos contra os bytes reais do
unpkg e do jsdelivr — mais severo que aqui. Em troca, uma CDN fora do ar deixa
a fumaça vermelha sem culpa do código; um passo de conferência prévia dá nome
a essa falha antes que ela se disfarce de regressão.
