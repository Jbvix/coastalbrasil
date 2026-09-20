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

---

## DECISÃO ARQUITETURAL — a chave paga do Open-Meteo não vai ao navegador

**Aprovada por Charlie Bravo em 20/09/2026. Vale a partir do Sprint 2.**

### O problema

O Open-Meteo só aceita a chave como **parâmetro de URL** (`&apikey=…`) —
existe [pedido aberto](https://github.com/open-meteo/open-meteo/issues/1438)
para autenticação por cabeçalho, ainda não atendido. E **não há restrição por
domínio nem por referenciador**.

O Coastal Navigator é um site **estático**. Uma chave embutida nele fica
visível em *ver código-fonte* e na aba Rede de qualquer visitante de
`coastalbrasil.netlify.app`.

### Por que o precedente do Cesium NÃO se aplica

O `scripts/build-config.js` publica o `CESIUM_ION_TOKEN` no cliente, e diz por
quê:

> *"Por ser app client-side o token fica visível no JS publicado: use um token
> ion RESTRITO (somente leitura, apenas os assets necessários)."*

O token Cesium é publicável **porque pode ser algemado**. A chave Open-Meteo
**não pode**. Copiar o padrão seria repetir a forma sem repetir a razão — e
desta vez o prejuízo é financeiro e de licença: quem copiar passa a usar a
licença comercial alheia.

### A coincidência que decidiu

A CSP atual em `netlify.toml` **não lista** `open-meteo.com` em `connect-src`.
Chamada direta do navegador já seria bloqueada hoje, com ou sem chave.
Qualquer caminho direto exige AFROUXAR a política — justamente o aviso 9.7 que
estamos tentando reduzir.

| Caminho | Chave exposta? | Mexe na CSP? |
|---|---|---|
| Direto, com chave | 🔴 sim | sim, afrouxa |
| Direto, sem chave (grátis) | não | sim, afrouxa |
| **Função Netlify (proxy)** | **não** | **nenhuma — é `'self'`** |
| Edge Function Supabase | não | não (já está na lista) |

### Decidido: Função Netlify

1. **A chave nunca sai do servidor** — fica na mesma tela de variáveis de
   ambiente onde o `CESIUM_ION_TOKEN` já mora.
2. **Zero mudança na CSP** — `/.netlify/functions/tempo` é mesma origem. É a
   **única** opção que não afrouxa nada.
3. **Cache de brinde** — o modelo se atualiza a cada 15 min; um cache de 15 min
   faz uma busca servir a embarcação **e todos os observadores do espelho**.
   Hoje cada observador gastaria uma chamada; com proxy, gastam zero.

### Recuo quando o proxy falhar: cache rotulado

Aprovado o **(b)** das duas opções: servir o último valor conhecido **dizendo a
idade** — *"vento de 40 minutos atrás"* — em vez de cair no endpoint gratuito,
que resolveria o técnico e abriria o jurídico (licença não comercial num barco
de trabalho).

É a prática de bordo correta, e é a mesma lógica da regra 5 da Iara: dado velho
**rotulado como velho** vale mais que dado fresco de procedência duvidosa. Só
que aqui, em vez de descartar, ela **diz a idade** e o comandante decide se
ainda serve.

### Números que sustentam a decisão

```
1 embarcação  = 24 relatórios × 2 endpoints =    48 chamadas/dia
                                              1.440 /mês
grátis   10.000/DIA   → folga de 208×
pago      1M/mês      → comporta 694 embarcações
```

**A chave paga não compra capacidade — compra a LICENÇA COMERCIAL e a
disponibilidade.** O plano gratuito daria conta da frota; o que ele não dá é o
direito de uso comercial, e o app roda num rebocador de trabalho.

**Restrição de cobrança que entra no desenho:** acima de **10 variáveis** a
requisição conta como mais de uma chamada. O desenho pede 8 marinhas e 5 de
vento — 1 chamada cada, e esse teto é para ser respeitado.
