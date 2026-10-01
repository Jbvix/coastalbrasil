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

### 2.1.1.1 Escolha da perna ativa (XTE)

O erro lateral só faz sentido em relação à perna **certa**. Escolher a perna é
um problema separado do cálculo do XTE, e mais delicado do que parece.

`advanceActiveLeg()` avança pelo along-track, mas isso sozinho é frágil: numa
derrota que faz curva, o barco fica a mais de 90° do rumo das primeiras pernas
e o along-track — corretamente — fica negativo, travando o avanço. Foi a
regressão da v2.2.1, que produziu XTE de 281 NM a bordo.

Duas defesas, ambas necessárias:

1. **Ancoragem no primeiro fixo.** Ao iniciar a navegação, a perna vem de
   `nearestLegIndex()`, não do índice 0. Quem começa a navegar no meio da
   viagem não deve ter o XTE medido contra a perna de saída do porto.
2. **Guarda de sanidade.** A cada fixo, se o barco está a mais de `RESYNC_NM`
   (10 NM) da perna ativa **e** existe outra pelo menos 2× mais próxima, o app
   reancora. O fator 2 evita oscilação em derrotas que se aproximam de si
   mesmas; os 10 NM não interferem em desvio legítimo por mau tempo.

`distanceToLeg()` mede a distância ao **segmento**, com a projeção travada nas
pontas — antes do início vale a distância ao waypoint inicial, depois do fim
vale a do final. Medir contra a reta infinita daria respostas absurdas para
pernas curtas.

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

### 4.5 Controle de acesso — o portão saiu do navegador (v2.19.0)

Um site estático não tem onde guardar segredo. Por dez versões o painel
administrativo conviveu com isso da pior forma possível: calculava o SHA-256 da
frase-senha **no navegador** e comparava com `window.ADMIN_GATE_HASH`, que o
build publicava. Era o aviso **9.4**.

Três defeitos empilhados, e o terceiro é o grave:

1. **O alvo viajava junto da porta.** Quem abre a página leva o hash para casa
   e ataca offline, sem tocar no servidor, sem limite de tentativas. SHA-256
   cru é rápido por projeto — bilhões por segundo numa placa de vídeo comum.
2. **O veredito era do cliente.** Quem controla o navegador controla o `if`.
3. **A ausência da variável ABRIA o painel.** Ambiente mal configurado virava
   porta escancarada. O modo de falhar apontava para o lado errado — e um
   disjuntor que fecha o circuito quando queima não é um disjuntor.

**O que existe agora.** A frase-senha vai para `/.netlify/functions/licenca` e
é conferida com **scrypt** (N=16384, r=8, p=1, 32 bytes) contra
`ADMIN_SENHA_HASH`, variável que nunca é publicada. O custo por tentativa sai
de ~0,000001 ms para ~50 ms: a mesma lista que levava minutos passa a levar
séculos. A comparação final usa `timingSafeEqual` — `===` para no primeiro
caractere diferente, e o tempo da resposta conta quantos acertos houve.

**Sem a variável, o portão NEGA (503).** É a inversão que importa.

A ordem no servidor é a defesa inteira:
`método → origem → limite de taxa → senha → chave de serviço → banco`.
A senha é conferida **depois** do limite de taxa (12 tentativas/hora por IP).
Inverter isso daria ao atacante um oráculo de força bruta de custo zero.

`ADMIN_GATE_HASH` **segue publicada e não é mais lida por nada**. A variável é
do autor e a decisão sobre ela é dele; o painel apenas deixou de depender dela.

**Licença.** O antigo "Gerador de Acesso" produzia links `?token=…&user=…` que
a vitrine nunca validou — chaveiro para porta inexistente. Agora emite licença
de serviço (embarcação, faixa 24h/72h/7d/15d, aparelhos). O código **aparece
uma vez**; o banco guarda só o SHA-256 dele, de modo que um vazamento do banco
não entrega acesso a ninguém.

**Não aplicado:** `supabase/licenca.sql` está no repositório para revisão, não
na produção.

### 4.8 A licença no caminho do serviço, e o modo de falhar invertido (v2.20.0)

A C4 faz o proxy de tempo perguntar pela licença. Feita do jeito óbvio, ela põe
o **Supabase no caminho crítico de um dado de segurança da navegação** — o
mesmo Supabase que ficou pausado três dias em setembro, com o monitor falhando
duas vezes sem ninguém atender.

Por isso, e isto é a decisão central da etapa:

> **Quando o verificador de licença não responde, o proxy ATENDE.**

Não é furo, é desenho. A assimetria com o portão administrativo da C3 é
deliberada:

| O que se protege | Falha | Porque |
|---|---|---|
| Portão administrativo | **fechado** | o que está em jogo é autoridade |
| Previsão de tempo | **aberto** | o que está em jogo é o barco |

Analogia de praxe a bordo: *damper* de incêndio falha fechado; a alimentação de
combustível da MCP não falha fechada porque um sensor morreu — ela alarma e
continua. O que a licença protege aqui é **orçamento**, e o orçamento já tem
origem, limite por IP e fusível diário.

**Três modos** (`LICENCA_MODO`): `desligado` (padrão, custo zero, nada muda),
`observar` (anota sem barrar) e `exigir`. Valor desconhecido cai em desligado —
erro de digitação não pode barrar a frota. Note que aqui o padrão desconhecido
aponta para o lado **permissivo**, ao contrário de `admin.mjs`.

**Ordem:** `origem → taxa → coordenadas → licença → cache → fusível`. Antes do
cache de propósito: servir cache a quem não tem licença abriria carona para
quem pedisse logo depois de um licenciado.

**`x-licenca` em cabeçalho, nunca em URL** — URL vaza em log de CDN, histórico
e `Referer`. **3 s** de estouro contra os 8 s do Open-Meteo: o Open-Meteo é o
serviço, o Supabase aqui é só o porteiro. O cache de vereditos guarda o
SHA-256, nunca o código, e nunca guarda `indisponível`.

**402, não 403:** a embarcação tem direito ao aplicativo; só não tem licença
corrente para o serviço pago.

### 4.9 O fim do silêncio: diagnosticar é atribuir culpa (v2.21.0)

Até a v2.20.0, `linhaDeTempoNoPainel()` devolvia `''` quando não havia dado.
Quatro causas, com quatro ações diferentes — uma delas "não faça nada" —
produziam a **mesma tela em branco**.

A tabela `TEMPO_DIAG` (molde do `MIRROR_DIAG`, para o aplicativo falar uma só
língua) carrega `rotulo`, `dica` e, decisivamente, **`culpa`**:

| `culpa` | Significa | Exemplo |
|---|---|---|
| `licenca` | é do comandante, e tem solução imediata | 402 |
| `autor` | é do autor; mexer no aparelho não ajuda | cota esgotada, chave ausente |
| `servico` | é de terceiro; ninguém a bordo resolve | Open-Meteo caído |
| `aparelho` | é do aparelho ou da rede dele | offline, GPS sem fixo |

**A culpa não é redação, é a parte da mensagem que muda o que acontece a
bordo.** A dica da cota diz *"NÃO é o seu aparelho nem a sua licença, e não há
nada a fazer a bordo"* — sem essa negativa, o comandante procura defeito onde
não há.

**O número HTTP não diagnostica sozinho.** `503` é cota esgotada **ou** portão
mal configurado; `502` é chave ausente (autor) **ou** provedor caído (terceiro).
Juntá-los num "erro do servidor" devolve o comandante ao silêncio com mais
palavras. Por isso o classificador olha status **e** motivo. Sem rede vence
qualquer status: se não houve resposta, nada observado é confiável.

**Onde classificar importa.** No tratamento da resposta, onde o status existe —
não no `catch`. A tela em branco nasceu exatamente de descartar ali a informação
que existia.

**Dado velho e motivo juntos**, porque separados cada um conta meia verdade. **A
faixa sai** quando a busca volta: faixa permanente é faixa invisível. **Âmbar,
não vermelho** — vermelho a bordo é do que ameaça o navio. **Nós do DOM, nunca
`innerHTML`**, mesmo para texto interno.

### 4.10 Tolerância a colagem: embalagem perdoada, conteúdo nunca (v2.22.0)

A primeira configuração real do portão em produção custou **cinco rodadas de
diagnóstico**. Nenhuma delas por defeito de lógica — todas por artefatos de
copiar-e-colar e por mensagens de erro que não distinguiam causas.

`conferirSenha` desembrulha, **em laço até estabilizar**, três artefatos reais:
o prefixo `ADMIN_SENHA_HASH=`, aspas envolventes, e **espaço de largura zero**
(`U+200B`–`U+200D`, `U+FEFF`) — este último invisível e **não removido pelo
`.trim()`**, porque não é whitespace.

Laço e não ordem fixa: com os três aninhados, tirar os invisíveis faz a cadeia
começar por aspa, a regra do prefixo não casa, e quando as aspas saem o passo
do prefixo já passou. **Ordem fixa só desembrulha a ordem que o autor
imaginou.**

**A fronteira é a regra:** tolera-se o invólucro, nunca o conteúdo. A
comparação segue sendo o mesmo scrypt em tempo constante — remover uma aspa não
aproxima ninguém de adivinhar 32 bytes. Hash de outro algoritmo, pedaço
faltando ou caractere não-hexadecimal continuam recusados.

**A recusa nomeia o defeito** — `(pedaços)`, `(prefixo)`, `(hex)` — e o código é
deliberadamente **estrutural**: diz a forma do erro, nunca o conteúdo. Se
alguém colar a frase-senha no lugar do hash, ecoá-la na mensagem seria
entregá-la a quem chamar. Diagnóstico sem vazamento.

Vale junto o que o campo ensinou sobre o Netlify: variáveis só alcançam as
Functions **num deploy novo**, e não há sinal na tela avisando que o deploy em
serviço é mais velho que a última edição. Um deploy do diretório local
**quebraria** este site, porque `cesium-config.js` nasce no build e está no
`.gitignore`.

### 4.6 Pendências registradas

Coberta pela prova 9.7, que passa com **alerta**, não em verde:

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

### 6.1.1 A guarda que faltou na revalidação  (v2.15.0)

A lição da §6.1 foi aplicada onde o defeito doeu — a validação inicial
(`validateAndStartViewer`, `if (error) throw error;`) e a revogação (prova
13.11) — e **não** onde o mesmo defeito também morava: `startViewerRecheck()`,
que revalida o link a cada 30 s enquanto alguém acompanha em terra.

```js
const { data } = await supa.rpc('check_nav_share', { p_token: token });   // ERRADO
if (!data || !data.length) return showMirrorBlocked('invalido');
```

Como `supa.rpc()` resolve com `{ data: null, error }` em vez de lançar,
**qualquer falha de rede virava veredito sobre o link**: o observador com o
link certo lia "❌ Link inválido", e `showMirrorBlocked()` — que é definitivo —
limpava os três temporizadores e derrubava o canal, matando a reconexão
automática. O banner ao lado seguia dizendo "servidor fora do ar": o
aplicativo se contradizia na mesma tela.

```js
const { data, error } = await supa.rpc('check_nav_share', { p_token: token });
if (error) return;                 // falha de rede não é veredito sobre o link
if (!data || !data.length) return showMirrorBlocked('invalido');
```

**Como foi encontrado.** Pela integração contínua da v2.14.0, na primeira
execução. O defeito nasce aos 30 s e esta bancada media antes disso; o runner,
mais lento, cruzou a marca. Nenhuma das 253 provas nem dos 68 passos de fumaça
anteriores podia pegá-lo, porque todos rodavam numa única máquina com um único
relógio.

A generalização vale mais que o conserto: **consertar onde dói e não onde o
defeito mora deixa cópias vivas**. Ao aplicar uma lição destas, procure as
outras chamadas do mesmo padrão — aqui eram três, e só duas tinham sido
tratadas.

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

---

## 7. Frota 3D: o casco é um dado, não uma constante

*(v2.3.0 — Jossian Brito, 2026-09-07)*

Até a v2.2.2 havia **um** rebocador, com o caminho do arquivo escrito à mão em
dois lugares (`ensureShip3D` e a entidade do Cesium) e a correção de proa numa
constante global única. Acrescentar um segundo casco por esse caminho exigiria
duplicar tudo. A v2.3.0 inverte a relação: o casco virou **dado** — uma entrada
em `SHIP_MODELS` — e o código passou a ser genérico.

### 7.1 O que um casco precisa declarar

Um GLB não basta. Três números só se descobrem **olhando** o modelo, e errar
qualquer um deles põe o navio de ré ou afundado:

| Campo | O que é | O que acontece se estiver errado |
|---|---|---|
| `headingOffset` | graus de giro aplicados **ao modelo**, na vista de Atitude, até a proa cair em `−Z` | o navio navega de ré, **e** caturra ao contrário |
| `headingOffsetEarth` | idem no **globo** (Cesium) | idem, só no modo Earth |
| `calado` | fração da altura da caixa, do centro para baixo, onde fica a linha d'água | o casco flutua no ar ou submerge até a ponte |

A necessidade de **dois** offsets não é descuido: os motores discordam sobre
qual eixo é "a frente". O Cesium supõe a proa em **+X**; o laço de atitude faz
`rotation.y = -rumo`, convenção que só fecha com a proa em **−Z**. Como os dois
GLB da frota foram modelados com a proa para lados opostos, os quatro valores
são todos diferentes:

| Casco | Proa no arquivo | `headingOffset` | `headingOffsetEarth` |
|---|---|---|---|
| Damen ASD 2810 | −Z | 0° | +90° |
| Rastar 3200 | +Z | **180°** | −90° |

### 7.1.1 Por que a correção é um pivô, e não uma soma no rumo

Este é o ponto em que a solução óbvia está errada, e vale escrever o cálculo.

O laço de atitude usa ordem `YXZ`, o que significa:

```
R = Ry(−rumo) · Rx(caturro) · Rz(jogo)
```

O casco é **primeiro** jogado e caturrado no seu próprio eixo, e só **depois**
guinado. Somar 180° ao rumo gira o conjunto **já inclinado** em torno da
vertical — e uma rotação em Y **preserva a altura**. A proa passaria a apontar
para o lado certo e continuaria mergulhando quando deveria subir.

Em números, com a proa do modelo em `+Z`:

```
Rx(θ) · (0, 0, +1) = (0, −sen θ, cos θ)
```

Para θ > 0 — caturro positivo, proa deveria **subir** — sai `y = −sen θ < 0`:
a proa **mergulha**. E `Ry(180°)` depois disso não toca nesse `y`. Com a proa
em `−Z` o mesmo cálculo dá `(0, +sen θ, −cos θ)`: proa sobe, como se espera.

Daí a correção certa ser **girar o casco até a proa cair em `−Z`**, num pivô
próprio, *antes* de jogo, caturro e rumo agirem. Assim os três eixos passam a
valer para qualquer GLB, venha a proa de onde vier.

O pivô é indispensável, e não um detalhe de estilo: `model` já está deslocado
de `−centro`, e em three.js a matriz local é `T·R·S` — a rotação viria **antes**
da translação e giraria o casco em torno de um ponto que não é o seu centro,
atirando-o para fora do campo. Com o modelo já centrado *dentro* do pivô, o
eixo de giro é o centro do casco.

**Medido, não deduzido.** Com caturro de +10°, a extremidade `−Z` de ambos os
cascos sobe (+2,48 m no ASD, +2,86 m no Rastar) e a `+Z` desce o mesmo tanto.
A prova 15.17 confere que o giro declarado é exatamente o que leva `proaEixo`
até `−Z`; a 15.16 falha se alguém voltar a somar a correção no rumo.

Os eixos de proa foram medidos, não adivinhados: renderizando cada GLB de
`+Z`, `+X` e de cima. No ASD 2810 a vista de `+Z` mostra os **dutos Kort e os
hélices** e o nome com o porto de registro — marcas de popa. No Rastar a mesma
vista mostra a proa arredondada e o hélice aparece do lado oposto.

### 7.2 De onde saiu o calado do ASD 2810

A caixa envolvente do modelo mede **20,77 m** de altura — do fundo dos dutos ao
topo do mastro. O modelo é centrado no seu próprio centro geométrico, logo o
ponto mais baixo fica em `-20,77/2 = -10,39`. O calado real do Damen ASD 2810,
medido até o fundo do duto, é **5,35 m**. Então:

```
y_linha_d'água = -10,39 + 5,35 = -5,04 m
fração         = -5,04 / 20,77 = -0,243
```

Daí `calado: 0.243`. **Aumentar esse número afunda o casco; diminuir levanta e
deixa o costado à mostra.** O valor foi conferido na renderização: o duto fica
submerso e a defensa de proa toca a água — que é exatamente onde ela tem de
tocar, já que é por ali que o rebocador empurra.

Para o Rastar 3200 o valor permanece `0.30`, idêntico ao que a v2.2.2 usava
(`-size.y * 0.30`). A troca de arquitetura **não** mexeu no casco antigo.

### 7.3 Por que a troca descarta a geometria à mão

`carregarShipModel()` percorre o casco anterior chamando `dispose()` em cada
geometria, textura e material antes de soltar a referência. Sem isso o
coletor de lixo do JavaScript libera os objetos, mas **não** a memória de vídeo
que eles reservaram na GPU — o WebGL não tem coleta automática. O ASD 2810
carrega 14 texturas; três trocas de casco deixariam dezenas de MB presos e
travariam um celular.

### 7.4 Como o ASD 2810 foi montado

O arquivo veio de um FBX de 12,4 MB (`ASD_TUG_RED.fbx`, Kaydara 7500) com as
texturas soltas em PNG. O caminho até o GLB de 1,25 MB:

1. **FBX → glTF** com `FBX2glTF 0.9.7`. As seis geometrias e as coordenadas de
   UV atravessaram intactas — mas **zero texturas foram ligadas**. Não é falha
   do conversor: os materiais do FBX traziam `Kd = 0,00 0,00 0,00` e nenhuma
   propriedade de difusa, então não havia em que pendurar a cor.
2. **Religação dos canais PBR** com `@gltf-transform`, casando material e
   textura pelo código de quatro dígitos do nome (`Hool_1002_mat` ↔
   `ASD_TUG_RED_1002_BaseColor.png`). O primeiro passo de cada material é
   `setBaseColorFactor([1,1,1,1])`: sem esse reset, o `Kd` preto herdado do FBX
   multiplicaria toda textura por zero e o rebocador sairia **preto**.
3. **Empacotamento ORM.** O glTF quer metalicidade e rugosidade numa textura
   só — verde = rugosidade, azul = metal. Os PNG vinham separados, e foram
   fundidos canal a canal. Onde faltava rugosidade (material 1004), entrou um
   cinza constante de 0,6 em vez de deixar o canal vazio, que o motor leria
   como espelho perfeito.
4. **Redução.** 4096² → 1024² em WebP: **44 MB de PNG → 0,59 MB**. A malha caiu
   de 488.616 para 130.484 triângulos (`meshoptimizer`, com as bordas
   travadas para o casco não abrir costura), depois Draco.

Resultado: **1,25 MB**, 6 materiais, 14 texturas, 4 com cor-base, 5 com
metal/rugosidade, 3 com normal, 2 com emissiva.

**O que falta no material original** (não é defeito da conversão): não existem
cor-base para o guincho (`1005`) nem para os vidros (`1006`), nem normal para
o mastro (`1001`), nem rugosidade para a cabine média (`1004`). O guincho
recebeu um cinza-aço fixo e os vidros um azul escuro translúcido em
`alphaMode: BLEND`. Se os mapas aparecerem, basta soltá-los em `tex1k/` e
repetir o passo 2.

### 7.5 A proa do Rastar 3200, corrigida

O Rastar 3200 tem a proa em `+Z` e o laço de atitude assume `−Z`: até a v2.2.2
ele navegava **de ré** a 000° e **caturrava ao contrário** — a proa mergulhando
quando deveria subir. O Cesium já compensava a guinada com −90°; o three.js
nunca compensou nada.

A correção proposta inicialmente era somar 180° ao rumo. **Estava incompleta**,
pelo motivo do §7.1.1: consertaria a guinada e deixaria caturro e jogo
invertidos. O que entrou foi a normalização no pivô, que resolve os três eixos
de uma vez — e que, de quebra, é o que torna o registro extensível: o próximo
casco só precisa declarar para onde aponta a sua proa.


### 7.6 A âncora na linha d'água

*(v2.3.2)*

Até a v2.3.1 os GLB tinham a origem onde o modelador a deixou, e o código
compensava: a vista de Atitude recentrava pelo centro da caixa e punha a água em
`-altura × calado`. Funcionava ali e **quebrava no globo**.

O Cesium assenta a **origem do modelo** na altitude da entidade e, para o navio
não sumir ao longe, o **amplia** (`minimumPixelSize: 80`). Origem fora da linha
d'água vira erro multiplicado pela ampliação:

```
erro do ASD 2810 : 4,96 m
maximumScale     : 400
afundamento      : ~1.984 m  →  some o casco, sobra o mastro
```

Corrigir no código exigiria perseguir a escala do Cesium a cada quadro. Corrigir
na geometria custa uma vez: `tools/glb/reancorar.mjs` translada o casco até a
origem cair na linha d'água e no meio-navio. Vale para todo motor e toda escala,
e põe o eixo de jogo e caturro **na linha d'água**, que é onde um navio balança.

**Medir o calado exige cuidado.** O ponto mais baixo do ASD 2810 não é a quilha,
é a ponta do skeg. O perfil de meia-boca por faixa de 0,25 m mostra:

| Y (m) | meia-boca | o que é |
|---|---|---|
| −10,50 a −9,00 | 0,13 a 0,67 m | **skeg** — uma lâmina |
| −8,75 | 2,29 m | começo do bojo |
| −8,50 | 4,14 m | **quilha / fundo do casco** |
| −4,75 | 5,16 m | boca máxima |

Medir "do fundo" tomando a ponta do skeg pela quilha inflou o calado em ~1,7 m e
deixou o rebocador afundado na vista de Atitude.

> **Conferido no aparelho — 10/09/2026 (Charlie Bravo).** Toda esta correção foi
> feita medindo geometria, de um ambiente que **não alcança** o Cesium ion nem os
> ladrilhos do Google: nunca se viu a tela. Confirmado de bordo: **o ASD 2810 não
> afunda mais no zoom out** e a **iluminação dos cascos no modo Earth está
> correta**. É a diferença entre cálculo verificado e resultado observado — e as
> duas coisas são necessárias.

### 7.7 Texto de casco vive em dois mapas

Trocar o nome pintado no costado não é trocar a textura de cor. A tinta das
letras tem **rugosidade** diferente da chapa, e o nome fica gravado no mapa de
rugosidade também. Editada só a cor, o nome antigo continua aparecendo sob luz
rasante, por cima do novo — fantasma visível na renderização e **invisível** na
textura de cor, o que torna o defeito difícil de rastrear.

Os dois mapas compartilham as UV, então as caixas medidas na cor servem à
rugosidade. Um detalhe inverte: na cor as letras são **mais claras** que o fundo;
na rugosidade são **mais escuras**. Amostrar a cor da letra com o mesmo critério
nos dois casos devolve o valor do fundo num deles, e a letra sai invisível.

---

## 4.7 Injeção pela URL da vitrine — e por que ela existia  (v2.17.0)

**O defeito.** `assets/js/gatekeeper.js` lia `?user=` da URL e escrevia o
valor em `innerHTML`:

```js
const userMdg = `Bem-vindo, ${decodeURIComponent(this.username)}!`;
document.body.innerHTML = `…<h1>${userMdg}</h1>…`;
```

Medido em Chromium: `?user=<img src=x onerror=alert(1)>` **executou**.

**O alcance.** Script arbitrário na origem do aplicativo — a mesma que guarda
a derrota no `localStorage` e detém a chave `publishable` do Supabase.

**O vetor, que é o que agrava.** A vitrine ensinava o usuário a **esperar**
links no formato `?token=…&user=…` chegando por WhatsApp. O ritual de acesso
do produto era o veículo de entrega. Uma vítima treinada a clicar é pior que
uma vítima desatenta.

**A emenda.** Não foi escapar o parâmetro: foi **parar de lê-lo**. Os
parâmetros antigos são apagados da barra com `replaceState`, sem nunca entrar
na página. Código que não existe não tem defeito.

**A generalização, que vale mais que o conserto.** O buraco não era
independente do portão de mentira — era **filho dele**. O `innerHTML` existia
para pintar a tela de "Acesso Autorizado" de um portão que não autorizava
nada. Mecanismo de segurança decorativo não é neutro: ele carrega código, e
código carrega defeito. **Remover a encenação removeu a vulnerabilidade
junto.**

Foi também o que fez a prova 9.5 mudar de exigência. Antes ela aceitava o
portão desde que ele **declarasse a própria limitação** em comentário — e o
comentário honesto não impediu o `innerHTML` de executar. Declarar uma
limitação é melhor que escondê-la, e pior que remover o código que a cria.
