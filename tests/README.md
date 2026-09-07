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
