# Documentação Técnica - Coastal Navigator Brasil

## 1. Estrutura de Arquitetura de Código
O código é centralizado em um arquivo principal HTML que encapsula CSS, HTML e JavaScript.

### 1.1 Variáveis Globais Principais
- `map`: Instância do objeto Leaflet Map.
- `waypoints`: Array de objetos armazenando os pontos da rota.
- `tripData`: Objeto contendo dados da embarcação e viagem.
- `lighthouses`: Array constante contendo a base de dados de faróis.

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
  fuelPerHour: Number,
  fuelInitial: Number,
  departureDate: Date
}
```

## 2. Algoritmos Principais

### 2.1 Cálculo de Distância (Haversine)
Utilizamos a fórmula de Haversine para calcular a distância ortodrômica entre dois pontos na esfera terrestre.
```javascript
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Raio da Terra em km
    // Conversão para radianos
    // Aplicação da fórmula
    // Conversão km -> Milhas Náuticas ( / 1.852)
}
```

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

## 3. APIs e Interfaces Internas
- **OpenStreetMap API** (Tile Layer): `https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png`
- **OpenSeaMap API** (Tile Layer): `https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png`

## 4. Segurança e Performance
- **Sanitize**: O código não possui inputs de usuário que são executados no servidor (client-side only), mas deve-se ter cuidado com XSS ao renderizar nomes de waypoints importados de GPX.
- **Otimização**: O mapa usa `invalidateSize()` para garantir renderização correta ao redimensionar a janela ou rotacionar dispositivos móveis.
