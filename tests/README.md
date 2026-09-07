# Banco de provas

```bash
npm test
```

68 provas em 12 suítes, executadas sobre as **funções reais** extraídas do
`app.html` por contagem de chaves — não sobre uma reimplementação. Sem
dependências: Node puro.

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
falha se aparecer **um único** erro de console. São 24 passos.

**Sem saída para a internet?** Coloque `leaflet.js`, `leaflet.css` e
`supabase.js` em `tests/fixtures/` e eles serão servidos no lugar das CDNs.
Como são os mesmos bytes de que os hashes SRI foram calculados, o navegador
ainda valida a integridade: um hash errado derruba o teste.

Se o Chromium estiver em `PLAYWRIGHT_BROWSERS_PATH` com revisão diferente da
esperada, o teste o localiza sozinho. `CHROMIUM_PATH` força um caminho.
