# Documentação Técnica - Coastal Navigator Brasil

## 1. Estrutura de Arquitetura de Código

Até a v2.1.0 tudo vivia num `app.html` de 5.787 linhas: HTML, CSS, base de
dados, algoritmos e um segundo documento HTML completo (o relatório) dentro de
um template literal. A v2.2.0 repartiu o arquivo.

| Arquivo | Linhas | Conteúdo |
|---|---:|---|
| `app.html` | ~3.250 | interface, mapa, navegação GPS, espelhamento |
| `assets/css/app.css` | 1.077 | estilos |
| `assets/js/report.js` | 472 | gerador do relatório de derrota |
| `assets/js/nautical.js` | 327 | algoritmos náuticos e formatação |
| `assets/js/mirror.js` | 303 | espelhamento da navegação (transmissão + observador) |
| `assets/js/lighthouses.js` | 162 | base de 98 faróis (gerada por `tools/lf/`) |
| `docs/CHANGELOG.md` | 570 | histórico, antes um comentário no topo do HTML |

**Ordem de carga é obrigatória**: `nautical.js` usa `lighthouses`, então
`lighthouses.js` vem antes. A prova 12.4 verifica isso.

**Por que scripts clássicos e não módulos ES.** A interface usa 39 atributos
`onclick=`, que só enxergam o escopo global. Migrar para `type="module"` exigiria
converter todos em `addEventListener` — trabalho que vale a pena, porque é ele
que destrava remover `'unsafe-inline'` do `script-src` da CSP, mas que não cabia
na mesma mudança que moveu 2.500 linhas.

### 1.1 Variáveis Globais Principais
- `map`: Instância do objeto Leaflet Map.
- `waypoints`: Array de objetos armazenando os pontos da rota.
- `tripData`: Objeto contendo dados da embarcação e viagem.
- `lighthouses`: Array constante com a base de faróis (98 registros).

### 1.2 Estrutura de Dados
#### Objeto Waypoint
```javascript
{
  id: Date.now(),      // Timestamp único
  lat: Number,         // Latitude decimal
  lng: Number,         // Longitude decimal
  name: String,        // Nome (geralmente sequencial ou do GPX)
  distance: Number,    // Distância do ponto anterior (NM)
  eta: Date,           // Estimativa de chegada
  fuelUsed: Number,    // Combustível gasto no trecho
  fuelRemaining: Number // Saldo no tanque
}
```

#### Objeto TripData
```javascript
{
  vesselName: String,
  origin: String,
  destination: String,
  speedKnots: Number,
  fuelConsumption: Number,   // L/h
  fuelInitial: Number,       // L
  departureDate: Date,
  fuelAlreadyUsed: Number,   // viagem já em andamento
  eyeHeight: Number          // altura do olho do observador, em metros
}
```

#### Objeto Lighthouse  *(reescrito na v2.1.0)*

Fonte: **Lista de Faróis DH2, 40ª edição 2026-2027** (DHN/CHM), corrigida até o
Folheto Quinzenal de Avisos aos Navegantes 14/2026.

```javascript
{
  id: String,            // identificador único e estável
  name: String,
  lat: Number, lng: Number,
  altitude: Number,      // altitude do FOCO acima do nível médio do mar (m)
  rangeLum: Number,      // alcance luminoso / nominal (NM)
  rangeGeo: Number,      // alcance geográfico publicado (NM) | null
  structHeight: Number,  // altura da ESTRUTURA (m) — informativa | null
  character: String,
  lfId: String           // nº de ordem na Lista de Faróis | null = fora dela
}
```

**Por que o esquema mudou.** A publicação da DHN traz quatro grandezas
numéricas por registro: número da carta náutica, altitude do foco, alcances
(luminoso e geográfico) e altura da estrutura. A base anterior tinha dois
campos, `height` e `range`, e o `height` guardava na maioria dos casos o
**número da carta náutica**. Onde a carta tinha quatro dígitos sobrava apenas o
primeiro, produzindo onze faróis registrados com "1 metro". O erro chegava a
51,6 NM no alcance visual calculado.

**Por que `id` e não `name` como chave.** Existem dois "Farol de Conceição" na
costa — um em São Paulo, outro no Rio Grande do Sul. A máquina de estados dos
alertas de navegação indexava por nome, então passar por um deixava o outro
marcado como já avistado e o alerta sonoro de aproximação não disparava.

## 2. Algoritmos Principais

### 2.1 Cálculo de Distância (Haversine)
Distância ortodrômica entre dois pontos, sobre um modelo esférico da Terra. O
raio já é expresso em milhas náuticas, sem conversão intermediária.

```javascript
function calculateDistance(lat1, lng1, lat2, lng2) {
    const R = 3440.065;   // raio da Terra em NM
    // a = sin²(Δφ/2) + cos φ1 · cos φ2 · sin²(Δλ/2)
    // c = 2 · atan2(√a, √(1−a))
    // d = R · c
}
```

**Precisão medida.** Comparado ao inverso de Vincenty sobre o elipsoide WGS-84,
o erro máximo em quatro travessias costeiras brasileiras foi de **0,44%** —
dentro dos 0,5% que o modelo esférico promete. Para uma travessia de 2.000 NM
isso representa cerca de 9 NM; suficiente para planejamento costeiro, mas não
para navegação de precisão.

### 2.1.1 Rumo (`calculateBearing`)
Devolve o azimute **inicial da ortodrômica**, não o rumo loxodrômico. Fora do
equador os dois divergem: de 10°S seguindo para leste o rumo inicial é 90,087°,
porque o grande círculo abaula em direção ao polo. Isso é comportamento
correto, não defeito.

### 2.1.2 Alcance de Faróis (`calculateVisibility` / `effectiveRange`)

```
alcance geográfico (NM) = 2,08 × (√altitude_do_foco + √altura_do_olho)   [m]
alcance efetivo         = min(alcance luminoso, alcance geográfico)
```

A constante 2,08 já incorpora a refração atmosférica padrão. A relação é de
raiz quadrada: dobrar a altitude do farol aumenta o alcance em apenas ~41%.

A altura do olho vem de `tripData.eyeHeight` (padrão `DEFAULT_EYE_HEIGHT_M`,
5 m). Para o Farol de Natal, foco a 87 m: 22,3 NM de uma lancha (olho a 2 m),
24,1 NM de um passadiço de rebocador (5 m) e 28,7 NM do passadiço de um navio
(20 m).

`effectiveRange()` é usada **tanto no planejamento quanto na navegação**. Antes
da v2.1.0 o planejamento considerava apenas o alcance geográfico e a navegação
usava o mínimo, de modo que o mesmo farol podia constar "visível" no relatório
de derrota e nunca disparar alerta durante a viagem.

### 2.2 Estimativa de Tempo (ETA)
```
Tempo (horas) = Distância (NM) / Velocidade (Nós)
ETA = Data de Partida + Soma dos Tempos dos Trechos Anteriores
```

### 2.3 Importação GPX
O parser de GPX utiliza `DOMParser` para ler arquivos XML.
1. Lê tags `<wpt>` (waypoints isolados).
2. Lê tags `<rtept>` (pontos de rota).
3. Lê tags `<trkpt>` (pontos de trilha).
4. Unifica todos em um array único e plota no mapa.

**Corrigido na v2.2.0.** Somar os três formatos duplicava a rota quando o
arquivo trazia rota *e* trilha — o que incluía os arquivos gerados pelo próprio
`exportGPX()`. Hoje:

- a importação aplica **precedência** `rtept > wpt > trkpt` e usa um formato só;
- a exportação emite `<rte>` em vez de `<trk>` (uma derrota é caminho
  *planejado*, não *percorrido*);
- os nomes dos pontos são preservados;
- há teto de `MAX_GPX_POINTS` (500) e a interface é redesenhada **uma vez**, ao
  final do laço, via `refreshWaypointUI()`. Antes cada ponto refazia lista,
  rota, faróis e consumo — comportamento O(n²).

## 2.4 Base de Faróis: procedência e reconciliação

A base é reconciliada contra a **Lista de Faróis DH2 (DHN/CHM)** por um extrator
que lê o PDF da publicação por posição de coluna. Duas armadilhas do documento,
registradas aqui porque reaparecem a cada edição bienal:

1. **Margens espelhadas** — páginas pares e ímpares deslocadas 28,3 pt entre si.
   As fronteiras de coluna precisam ser normalizadas pelo marcador `(1)` de cada
   página.
2. **Marcadores no corpo** — os rótulos `(2)`, `(3)` e `(4)` reaparecem dentro
   das características das luzes (`Lp (2) B. 10s`). Delimitar a área de dados
   por eles corta o corpo da página.

O casamento com a base do app é feito por posição em grau/minuto convertida a
decimal, com o nome como desempate e tolerância de 6 NM. **Os dois hemisférios
precisam ser testados**: Cabo Orange (AP) e o Arquipélago de São Pedro e São
Paulo ficam ao norte do equador, e a publicação não repete o hemisfério linha a
linha.

## 3. APIs e Interfaces Internas
- **OpenStreetMap API** (Tile Layer): `https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png`
- **OpenSeaMap API** (Tile Layer): `https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png`

## 4. Segurança

### 4.1 Fronteira de confiança

O app é inteiramente client-side, o que **não** elimina risco. Três entradas são
externas e não confiáveis:

1. **Canal Realtime do Supabase** — público, identificado apenas pelo token do
   link de acompanhamento. Quem tem o link pode publicar nele.
2. **Arquivos GPX** — trazem texto arbitrário em `<name>` e `<desc>`.
3. **Campos do formulário de viagem** — vão para o relatório exportado, para o
   GPX e para o nome do arquivo baixado.

### 4.2 Injeção na telemetria (corrigido na v2.2.0)

O card de farol do HUD era montado como HTML e a **string pronta** era
transmitida pelo canal; o observador em terra a atribuía a `innerHTML`. Isso
dava a quem tivesse o link a capacidade de escrever marcação arbitrária na tela
de quem acompanhava a viagem.

A correção não foi sanitizar a string, e sim **mudar o que trafega**:
`navLighthouseData` é um objeto tipado, e `renderLighthouseCard()` remonta a
marcação com escape nos dois lados. A rota recebida também passa a ser validada
como pares de coordenadas numéricos e dentro de faixa antes de entrar no mapa.

### 4.3 Escape de saída

| Função | Escape |
|---|---|
| `generateReport()` | `escapeHtml()` em nome, origem, destino, faróis e waypoints |
| `exportGPX()` | `escapeXml()` — sem isso, `"SMIT & CIA"` gera XML mal-formado |
| atributo `download` | `safeFileName()` |

### 4.4 Transporte

- Leaflet e Supabase com Subresource Integrity e **versão fixada** — o SRI é
  incompatível com intervalo flutuante, e o Supabase estava em `@2`.
- Content-Security-Policy e cabeçalhos de segurança no `netlify.toml`.

### 4.5 Controle de acesso — o limite honesto

Um site estático não tem onde guardar segredo. O que foi feito:

- a senha do painel saiu do repositório; o build publica apenas o SHA-256, de
  `ADMIN_GATE_HASH` (ver `scripts/build-config.js`);
- o painel exibe aviso permanente de que é ferramenta local;
- `gatekeeper.js` declara no próprio código que o token é convite rastreável, e
  não credencial.

O que **não** foi resolvido e não pode ser no cliente: o hash está no navegador
e é atacável por dicionário. Controle de acesso real exige validação no
servidor. O projeto já tem esse caminho montado — a função `check_nav_share`, no
Supabase, valida token, revogação e expiração dos links de acompanhamento.

### 4.6 Pendências registradas

Estão cobertas pelas provas 9.4 e 9.7, que passam com **alerta**, não em verde:

- `script-src` ainda admite `'unsafe-inline'` (a interface usa atributos
  `onclick=`) e `'unsafe-eval'` (o Cesium compila WebAssembly). Reduzir os dois
  depende de eliminar os manipuladores inline — trabalho da modularização.

## 5. Performance
- **Otimização**: O mapa usa `invalidateSize()` para garantir renderização correta ao redimensionar a janela ou rotacionar dispositivos móveis.

## 6. Espelhamento: o que a prática ensinou

### 6.1 `supa.rpc()` não lança exceção em erro do servidor

O cliente `supabase-js` devolve `{ data, error }`. Ele **só** lança em falha de
rede. Envolver a chamada em `try/catch` e não olhar o campo `error` significa
tratar como sucesso qualquer recusa vinda do banco — RLS, função inexistente,
violação de restrição.

Foi assim que links de acompanhamento nasceram mortos: o token era gerado,
o link copiado e enviado, e nada havia sido escrito no servidor. Quem recebia
via "Link inválido".

```javascript
// errado — enxerga só falha de rede
try { await supa.rpc('create_nav_share', p); } catch (e) { /* ... */ }

// certo
const { error } = await supa.rpc('create_nav_share', p);
s.dbOk = !error;
```

E jamais marcar como sincronizado **antes** de chamar.

### 6.2 "Erro de conexão" não é diagnóstico

Três causas, três donos:

| Causa | Sintoma | Quem resolve |
|---|---|---|
| `sem-rede` | `navigator.onLine === false` | o próprio observador |
| `servidor` | REST do backend não responde | ninguém em terra |
| `canal` | REST responde, WebSocket caiu | reconexão automática |

`diagnosticarEspelho()` distingue as três batendo em `/rest/v1/` com limite de
6 s. Um 404 ou 401 conta como servidor vivo — significa apenas que a rota não
existe ou exige credencial, não que o serviço caiu.

### 6.3 Conectado não é o mesmo que recebendo

`_mirrorLastMsg` era gravado a cada pacote e **nunca lido**. Um observador com
o canal aberto e a embarcação muda via "ao vivo" indefinidamente.
`armarVigiaDeSilencio()` verifica a cada 5 s e sinaliza em âmbar — cor distinta
do vermelho de conexão caída, porque o problema é outro.

### 6.4 Projeto Supabase suspenso

Projetos do plano gratuito pausam após dias sem uso, e um projeto pausado
recusa **tudo**: REST e Realtime. Para uma função que o usuário aciona quando
está no mar, é uma dependência frágil. Duas saídas: manter o projeto ativo com
acesso periódico, ou aceitar que o espelhamento é conveniência e dizer isso na
interface — o que a v2.2.1 passou a fazer.

### 6.5 Rotina de manutenção contra a suspensão

`.github/workflows/manter-supabase-ativo.yml` chama o banco a cada 3 dias, o
que zera o relógio de suspensão do plano gratuito (limite de ~7 dias). A
margem tolera uma execução perdida.

A chamada é `check_nav_share` com um token inexistente: leitura pura, sem
efeito colateral, e que exercita PostgREST **e** Postgres — evidência de
atividade mais forte do que bater na raiz da API.

Três detalhes deliberados:

- **O workflow lê `SUPA_URL` e `SUPA_KEY` do próprio `assets/js/mirror.js`.**
  Copiar a configuração para um segundo lugar cria duas verdades que divergem
  com o tempo. A prova 14.3 falha se o formato da constante mudar e quebrar a
  extração.
- **Falha vira alarme.** Se o projeto não responder em 3 tentativas, o job
  falha de propósito e o GitHub notifica. O ping é também monitor: você
  descobre a queda antes de alguém em terra descobrir tentando acompanhar uma
  viagem.
- **HTTP 4xx conta como sucesso.** Uma recusa significa que o serviço está de
  pé, e o objetivo — registrar atividade — foi cumprido. Só 5xx, tempo
  esgotado e falha de conexão indicam projeto fora do ar.

**Limite conhecido:** o GitHub desativa workflows agendados em repositórios sem
atividade por 60 dias, avisando por e-mail antes. Reative na aba Actions.
