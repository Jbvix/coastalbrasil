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

---

## DECISÃO ARQUITETURAL — quem pode gastar a chave paga  (v2.16.0, Sprint A)

### O que estava errado

A decisão acima manteve a chave paga fora do navegador. Durante treze versões,
a porta que ela protege ficou **sem tranca**: `tempo.mjs` validava apenas as
coordenadas. Qualquer um com o endereço gastava a cota, de qualquer lugar.

Protegemos a chave e esquecemos a fechadura.

### O limite honesto, declarado antes da solução

**Um aplicativo estático não tem segredo.** Tudo é entregue ao navegador, e
quem forjar `Sec-Fetch-Site` e `Referer` passa pela porta. Nenhuma camada
desta decisão é autenticação, e chamá-la assim seria repetir o erro do portão
administrativo (aviso 9.4), que o próprio código já descreve como *"um trinco,
não uma fechadura"*.

A fechadura é o token de licença, Sprints B a E. Isto aqui é **trinco e
fusível** — e o fusível é o que realmente protege.

### Três camadas, e por que o fusível é a que importa

| Camada | Barra | Contra quem forja |
|---|---|---|
| Origem (`Sec-Fetch-Site` → `Referer`) | terceiro, varredor, `curl` ingênuo | não protege |
| Limite por chamador (60/h, janela deslizante) | laço de abuso | atrasa |
| **Fusível diário** (teto de chamadas ao Open-Meteo) | **o gasto** | **protege** |

O disjuntor da praça de máquinas não pergunta quem causou o curto: ele abre.
O fusível limita a fatura inclusive contra um atacante perfeito — e contra o
caso mais provável de todos, que não é ataque e sim **um laço defeituoso no
nosso próprio código**.

### `Sec-Fetch-Site`, não `Origin` — e isso foi medido

Chromium, chamada idêntica à do `assets/js/tempo.js` (GET relativo, mesma
origem, sem cabeçalhos próprios):

```
origin           (AUSENTE)
referer          http://…/app.html
sec-fetch-site   same-origin
```

O navegador **não** manda `Origin` em GET de mesma origem. Exigir `Origin`
teria trancado o aplicativo no primeiro deploy — erro que só apareceria em
produção. Uma mutação confirmou: a fumaça acusou *"Proxy ATENDE o próprio
aplicativo → HTTP 403 (403 = app trancado fora)"*.

`Sec-Fetch-Site` é **nome de cabeçalho proibido**: página nenhuma o escreve
por JavaScript. Quando ele diz `cross-site`, quem disse foi o navegador.

### A ordem, que é a defesa inteira

```
origem → taxa → coordenadas → cache → FUSÍVEL → Open-Meteo
```

Origem **depois** do cache entregaria dado de graça a quem não devia ser
atendido. Fusível **depois** da chamada contaria o que já queimou.

**Recusa nunca é cacheada.** O cabeçalho de sucesso manda a CDN guardar 15 min
e servir velho por mais uma hora; uma recusa herdando isso devolveria 403 a
quem tem direito por até 75 minutos. Apagão auto-infligido é pior que o abuso
que se queria impedir.

### Onde o código mora, e por quê

`netlify/lib/guarda.mjs` — **fora** do diretório de funções, para o Netlify
não publicar a guarda como endpoint próprio. Decisões puras, provadas
executando (suíte 27); o `tempo.mjs` só liga os fios, e o handler de verdade é
exercitado na fumaça.

### Dívida assumida

O estado vive na **memória da instância**, como o cache desde a v2.9.0: o
limite por chamador vale por instância, não globalmente. Contagem durável
exigiria Netlify Blobs ou Supabase, com latência em toda chamada de tempo —
não se justifica numa tranca de emergência. **Registrado, não escondido.**

---

## DECISÃO ARQUITETURAL — o modo de falhar da licença  (v2.20.0, etapa C4)

**Data:** 01/10/2026 · **Autor:** Jossian Brito (Charlie Bravo)
**Implementa:** `netlify/lib/licenca.mjs`, `netlify/functions/tempo.mjs` v2.0.0

### O problema

A C3 passou a emitir licenças. Fazer o proxy de tempo **exigi-las** parece
trivial — uma consulta e um `if`. Não é. Exigir licença põe o **Supabase no
caminho crítico da previsão de tempo**, e previsão de tempo é dado de
**segurança da navegação**.

O precedente é concreto e desta casa: o projeto Supabase ficou **pausado de
~28/09 a 01/10/2026**, e o monitor `manter-supabase-ativo.yml` falhou duas
vezes sem ninguém atender. Com "sem licença, sem tempo" implementado do jeito
óbvio, aqueles três dias teriam sido **três dias sem vento, onda e pressão em
todo rebocador em serviço**.

### A decisão

> **Quando o verificador de licença não responde, o proxy ATENDE**, marcando a
> resposta como degradada. Ele nunca nega por falha própria.

Isto **inverte** o modo de falhar do portão administrativo da C3, e a inversão
é o ponto, não uma incoerência:

| O que se protege | Falha | Raciocínio |
|---|---|---|
| Portão administrativo | **fechado** | o que está em jogo é **autoridade**; na dúvida, ninguém entra |
| Previsão de tempo | **aberto** | o que está em jogo é **o barco**; na dúvida, o passadiço recebe o vento |

A bordo a distinção é rotina. Um *damper* de incêndio falha **fechado**, porque
fechado é o estado seguro. A alimentação de combustível da máquina principal
**não** falha fechada porque um sensor morreu — ela alarma e continua, porque
parar no meio do canal é pior que o risco que o sensor media. Projetar o modo
de falhar é escolher **qual** acidente se prefere ter.

### O argumento econômico aponta para o mesmo lado

O que a licença protege aqui é **orçamento**, não segurança. E o orçamento já
tem três travas independentes, todas da Sprint A e todas locais à função:

1. trava de **origem** — barra site de terceiro e varredor;
2. **limite por IP** — 60/hora, corta o laço;
3. **fusível diário** — teto absoluto da fatura.

Negar previsão a uma embarcação no mar para poupar uma fração de centavo,
quando o fusível já garante o teto, é trocar um custo de segurança **real** por
uma economia **marginal**.

### Os três modos, e por que não dois

Ligar cobrança de uma vez num aplicativo em uso é desligar o serviço de todo
mundo ao mesmo tempo. `LICENCA_MODO` tem uma escada:

| Valor | Efeito |
|---|---|
| ausente / `desligado` | **padrão**; nada muda e **nada custa** — sem leitura de cabeçalho, sem rede, sem latência |
| `observar` | confere e **anota**, atende todos — o alarme novo rodando em paralelo antes de ser ligado ao desligamento automático |
| `exigir` | barra, exceto quando o verificador falha |

Valor desconhecido cai em **desligado**: um `exijir` digitado no painel não
pode barrar a frota. Note que aqui o padrão desconhecido aponta para o lado
**permissivo** — exatamente o contrário de `admin.mjs`, pelo mesmo princípio.

### Consequências aceitas, ditas em voz alta

- Uma licença **revogada** continua valendo por até 5 min (TTL do cache de
  vereditos). Aceitável para controle de orçamento; **não** seria aceitável
  para controle de acesso a dado sensível.
- Com o verificador fora do ar, **qualquer um** com origem válida recebe
  previsão. É o custo explícito da decisão acima, e o fusível diário continua
  sendo o teto real da fatura.
- O limite de **aparelhos** é declarado e **não** imposto. Declarar um limite
  que não se aplica é aceitável; fingir que ele se aplica não seria.

### O que foi rejeitado

- **Negar quando o verificador falha.** Rejeitado pelo argumento acima.
- **Licença por pessoa.** Rebocador tem rendição de tripulação; cada troca de
  turno viraria chamado de suporte. É por **embarcação**.
- **Licença em parâmetro de URL.** URL vaza em log de CDN, histórico, `Referer`
  e na barra de endereço. Vai em cabeçalho `x-licenca`.
- **Guardar o código no banco.** O banco guarda o SHA-256; nem o autor
  recupera um código perdido, e um vazamento do banco não entrega acesso.
