# Documentação de Arquitetura e Design - Coastal Navigator Brasil

## 1. Visão Geral
O sistema é construído atualmente como uma **Single Page Application (SPA) Monolítica Client-Side**. Toda a lógica de negócios, interface e dados reside no navegador do cliente, sem dependência de um backend ativo para operações durante o uso.

## 2. Diagrama de Componentes (Conceitual)

```mermaid
graph TD
    User[Usuário] --> UI[Interface Web (HTML/CSS)]
    UI --> MapEngine[Motor de Mapa (Leaflet)]
    UI --> Logic[Lógica da Aplicação (JS)]
    
    subgraph "Client Side (Browser)"
        Logic --> Router[Gerenciador de Rotas]
        Logic --> FuelCalc[Calculadora de Combustível]
        Logic --> GPXHandler[Importador/Exportador GPX]
        Logic --> Database[Base de Dados Local (Arrays JSON)]
        
        Database --> Lighthouses[Faróis DHN]
        MapEngine --> Tiles[OpenSeaMap/OpenStreetMap Tiles]
    end
```

## 3. Tecnologias Utilizadas

### 3.1 Frontend
- **HTML5**: Estrutura semântica.
- **CSS3**: Estilização personalizada com Design System marítimo (Variáveis CSS para temas Dark/Ocean). Padrão Mobile-First.
- **JavaScript (ES6+)**: Lógica de aplicação pura (Vanilla JS), sem frameworks pesados (React/Angular) para garantir leveza e facilidade de manutenção.

### 3.2 Bibliotecas Externas
- **Leaflet.js**: Renderização de mapas interativos.
- **OpenStreetMap / OpenSeaMap**: Provedores de camadas de mapa (tiles).
- **Google Fonts**: Tipografia (Orbitron, Rajdhani).

## 4. Estrutura de Arquitetura

### 4.1 Camada de Apresentação (View)
- Responsável por exibir o mapa, modais e painéis laterais.
- Gerencia interações DOM (cliques, toques).
- Atualiza o DOM dinamicamente com base no estado da aplicação.

### 4.2 Camada de Lógica (Controller/Service)
- **TripController**: Gerencia o estado da viagem (origem, destino, data).
- **WaypointService**: CRUD de waypoints na memória.
- **CalculationEngine**: Realiza cálculos matemáticos de geodesia (distância Haversine), tempo e consumo.

### 4.3 Camada de Dados (Model)
- Dados estáticos (Hardcoded): Lista de faróis curada manualmente.
- Dados dinâmicos (Runtime): Array de waypoints e configurações da viagem atual, existindo apenas na memória RAM da sessão do navegador.

## 5. Design Patterns
- **Module Pattern**: Organização do código JS em funções e objetos lógicos.
- **Observer Pattern**: (Simplificado) Ações no mapa disparam atualizações na UI (cálculos, footer).
- **Singleton**: O objeto `tripData` atua como fonte única de verdade para a viagem atual.
