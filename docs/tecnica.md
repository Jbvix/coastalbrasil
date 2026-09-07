# Documentação Técnica - Coastal Navigator Brasil

## 1. Estrutura de Arquitetura de Código
O código é centralizado em um arquivo principal HTML que encapsula CSS, HTML e JavaScript.

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

> **Defeito conhecido, ainda não corrigido.** Somar os três formatos duplica a
> rota quando o arquivo traz rota *e* trilha — o que inclui os arquivos que o
> próprio `exportGPX()` gera, pois ele grava cada ponto como `<wpt>` e de novo
> como `<trkpt>`. Exportar três waypoints e reimportar devolve seis, em
> zigue-zague. A correção prevista é adotar precedência
> `rtept > wpt > trkpt`, processando um formato por vez.

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

## 4. Segurança e Performance

> **Estado atual: pendências abertas.** A auditoria de 07/09/2026 registrou seis
> achados de segurança ainda não corrigidos. Eles estão fora do escopo da
> v2.1.0 e aguardam autorização:
>
> - `applyMirrorTelemetry()` atribui `innerHTML` a partir do payload recebido
>   pelo canal Realtime — quem tiver o token de acompanhamento injeta marcação
>   na tela do observador em terra.
> - `generateReport()` e `exportGPX()` interpolam nome de embarcação, origem e
>   destino sem escape. Além do risco de injeção, um nome com `&` produz XML
>   mal-formado, rejeitado por Navionics, OpenCPN e Garmin.
> - Sem Content-Security-Policy declarada, no HTML ou no `netlify.toml`.
> - Leaflet e Supabase carregados de CDN sem `integrity` (SRI).
> - `assets/js/admin.js` valida a senha no cliente, em texto claro.
> - `assets/js/gatekeeper.js` aceita qualquer token ainda não usado, com a
>   lista de queimados no `localStorage` do próprio visitante.

- **Sanitize**: o app é inteiramente client-side, mas isso não elimina o risco —
  dado vindo do canal Realtime e de arquivos GPX é externo e não confiável.
- **Otimização**: O mapa usa `invalidateSize()` para garantir renderização correta ao redimensionar a janela ou rotacionar dispositivos móveis.
