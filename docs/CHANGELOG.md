# Changelog — Coastal Navigator Brasil

Autor: Jossian Brito (Charlie Bravo)

Este arquivo era um comentário de 578 linhas no topo do `app.html`. Saiu de
lá na v2.2.0: histórico é documentação, não código, e a cada leitura do
arquivo principal ele custava meia tela de rolagem antes da primeira linha
executável.

---

```

## v2.15.0 (21/09/2026) — O ESPELHO PARA DE ACUSAR O LINK DE QUEM ESTÁ EM TERRA

Autor: Jossian Brito (Charlie Bravo)

**O CI da v2.14.0 encontrou um defeito real na primeira execução.** Não um
defeito novo: um defeito que estava em produção desde a v2.3.x, que sobreviveu
a 253 provas e a 68 passos de fumaça rodados à mão, e que nenhuma delas podia
pegar — porque só aparece depois de **30 segundos**.

### O que acontecia

`startViewerRecheck()` revalida o link a cada 30 s enquanto alguém acompanha a
viagem em terra. Ela lia só `data` e **descartava `error`**:

```js
const { data } = await supa.rpc('check_nav_share', { p_token: token });
if (!data || !data.length) return showMirrorBlocked('invalido');
```

E `supa.rpc()` **não lança exceção** quando a chamada falha — ela RESOLVE com
`{ data: null, error }`. É a armadilha já documentada em `docs/tecnica.md` §6.1
e já guardada na revogação pela prova 13.11. O recheck era a cópia que tinha
perdido a guarda: consertaram onde doeu, não onde o defeito morava.

Sonda no navegador, com o backend inalcançável:

```
t= 5s  HUD ativo: SIM  bloqueado: não   banner: "servidor fora do ar · nova tentativa em …"
t=15s  HUD ativo: SIM  bloqueado: não   banner: "servidor fora do ar · nova tentativa em …"
t=25s  HUD ativo: SIM  bloqueado: não   banner: "servidor fora do ar · nova tentativa em …"
t=32s  HUD ativo: NÃO  bloqueado: SIM   "❌ Link inválido"
```

### A consequência a bordo

Quem estava em terra, **com o link certo**, perdia a tela aos 30 segundos de
instabilidade — ou com o projeto Supabase dormindo, como em 07/09 — e lia que
o **link dele** era inválido.

Pior: `showMirrorBlocked()` é definitivo. Limpa `mirrorRetryTimer`,
`mirrorCountdownTimer`, `mirrorStaleTimer` e derruba o canal. **A reconexão
automática morria**, e só voltava recarregando a página. Enquanto isso o banner
ao lado continuava dizendo "servidor fora do ar": o aplicativo **se contradizia
na mesma tela**.

> É a regressão do princípio da §6.2 — *"erro de conexão" não é diagnóstico*.
> Aqui era pior que não-diagnóstico: era diagnóstico **errado**, que manda a
> pessoa conferir um link que está perfeito enquanto o navio segue transmitindo.

### A emenda

```js
const { data, error } = await supa.rpc('check_nav_share', { p_token: token });
if (error) return;                 // falha de rede não é veredito sobre o link
if (!data || !data.length) return showMirrorBlocked('invalido');
```

Só uma resposta **bem-sucedida e vazia** significa link inválido. Falha de
transporte é transitória, e a máquina de reconexão já sabia tratá-la.

Comportamento por retorno:

| Retorno | Decisão |
|---|---|
| `{ error: <qualquer> }` | não decide, espera a próxima revalidação |
| `{ data: null }` sem erro | link inválido |
| `{ data: [] }` sem erro | link inválido |
| `{ data: [{valid:true}] }` | segue |
| `{ data: [{valid:false, revoked:true}] }` | revogado |
| `{ data: [{valid:false, revoked:false}] }` | expirado |

### Por que o passo de fumaça custa 32 segundos, e por que vale

O defeito **não existe no primeiro segundo — nasce aos 30**. Esta bancada media
o painel antes disso; o runner da integração contínua, mais lento, cruzou a
marca. Foi ele quem pegou.

O passo novo espera o **relógio de verdade** em vez de encurtar o intervalo
para testar depressa. Encurtar mediria um intervalo que não existe em produção:
prova de corrida que não deixa a corrida acontecer não prova nada.

### Quatro mutações, quatro acusações

| Mutação | Acusou |
|---|---|
| A guarda de erro some (o defeito original) | 13.13 **e** os 2 passos de fumaça |
| A guarda existe, mas DEPOIS de decidir por `data` | 13.13 |
| "Correção" preguiçosa: nunca mais bloqueia nada | 13.13 |
| A guarda existe **só dentro do comentário** | 13.13 |

A terceira é a que mais importa: uma emenda que simplesmente parasse de
bloquear trocaria um defeito por outro — **link revogado continuaria
funcionando**. A prova exige que o bloqueio legítimo continue de pé.

A quarta é a armadilha da casa pela sexta vez. O comentário da emenda cita
`error` e `supa.rpc` de propósito, para explicar; a prova recorta o texto com
`semComentarios()` antes de varrer. **Varredura de código lê código.**

### A prova que só valia na máquina de quem a escreveu

A mesma execução do CI derrubou **outras duas** provas — e essas eram defeito
**do teste**, não do aplicativo.

`ctx.route()` do Playwright intercepta **HTTP**. O Realtime do Supabase é
**WebSocket**, que o `route()` não toca. Nesta bancada o canal falhava sozinho
por falta de rota até o `supabase.co`, e as provas do banner davam certo **por
acidente de ambiente**. No runner, que tem internet de verdade, o WebSocket
**abriu** — e o aplicativo, corretamente, passou a dizer *"📡 Canal aberto.
Aguardando a embarcação transmitir."* em vez de *"servidor fora do ar"*.

Duas consequências, e a segunda é a mais séria:

- a prova **só valia numa máquina** — o pior tipo de prova, porque parece verde
  e não mede nada em outro lugar;
- a fumaça abria uma ligação **real com o Supabase de produção** a partir de um
  runner de pull request. Nada vazou (a chave é a `publishable` e o token é
  falso), mas era **dependência externa não declarada dentro de um teste**.

Agora o bloqueio é explícito (`ctx.routeWebSocket`) e a prova **confere a
própria premissa**: um passo novo exige que pelo menos um WebSocket tenha sido
interceptado. Se o canal abrir, é **isso** que fica vermelho — não o banner.
Uma prova que depende de uma condição sem conferi-la acusa o inocente.

> Generalizando: **toda prova que depende do ambiente precisa declarar e medir
> essa dependência.** Se não mede, não é prova — é coincidência com sorte.

### Também entregue direto para a `main`

Este defeito estava **no ar em produção** (v2.5.0), com espelho ativo. A mesma
emenda foi para a `main` num pull request próprio e mínimo, porque não fazia
sentido a correção ficar refém do merge dos seis Sprints.

| | v2.14.0 | v2.15.0 |
|---|---:|---:|
| Provas do banco | 258 | **259** |
| Passos da fumaça | 68 | **71** |
| Defeitos achados pelo CI | — | **1, em produção** |

---

## v2.14.0 (21/09/2026) — AS PROVAS DEIXAM DE DEPENDER DE MEMÓRIA HUMANA

Autor: Jossian Brito (Charlie Bravo)

Integração contínua em cada pull request — e o defeito que a ligação revelou,
que é a parte que interessa.

### O alarme com a lâmpada fora do circuito

Até esta versão, `node tests/suite.js` **sempre saía com código 0**. Inclusive
com falha na tela: ele imprimia o `✘` em vermelho, escrevia o `results.json` e
encerrava dizendo "tudo bem".

Isso nunca doeu, porque quem lia a saída era um humano — e o olho vê o
vermelho. Mas uma máquina de integração **não lê**: ela consulta o código de
saída do processo. Ligado do jeito que estava, o CI teria acendido verde em
todo pull request, para sempre, com qualquer defeito dentro.

> **Um alarme que nunca toca é pior que nenhum alarme**, porque substitui
> desconfiança por certeza falsa. É o detector de incêndio da praça de máquinas
> com a bateria removida: enquanto ninguém testa, ele tranquiliza.

A correção segue a disciplina da casa, **separar a decisão do efeito** — a
mesma que permitiu provar `podeFalar()` sem alto-falante e `espectroDeHeave()`
sem acelerômetro:

```js
function codigoDeSaida(resultados) {
  return (resultados || []).some(r => r && r.status === 'FAIL') ? 1 : 0;
}
process.exitCode = codigoDeSaida(results);
```

Comportamento da função conforme a lista recebida:

| Entrada | Saída | Por quê |
|---|:---:|---|
| `[]` | 0 | nada a reprovar |
| `[PASS, PASS]` | 0 | — |
| `[PASS, WARN, WARN]` | 0 | avisos são conhecidos e documentados |
| `[FAIL]` | 1 | — |
| `[PASS, FAIL, WARN]` | 1 | basta uma falha |

`some` e não `filter().length` porque a pergunta é *"existe alguma?"* e a
primeira falha já responde. A contagem interessa ao relatório, não à decisão.

`process.exitCode` e não `process.exit()`: atribuir deixa o Node escoar o
stdout e o `results.json` antes de encerrar. `process.exit()` corta a saída no
meio quando o terminal está lento — e relatório truncado é exatamente o que
ninguém quer ler depois de um CI vermelho.

### Só FAIL derruba a obra

Os três `WARN` (3.9 registros fora da LF-40ED, 9.4 portão administrativo no
cliente, 9.7 `unsafe-inline` por `onclick=`) são defeitos **conhecidos e
documentados**, que dependem de decisão do autor e não de correção pendente.

Se derrubassem o CI, todo pull request nasceria vermelho. E **luz que acende
todo dia deixa de ser vista** — é assim que uma tripulação aprende a ignorar
alarme, e é o pior vício que um sistema de alarme pode criar.

### Duas provas, porque uma não cobre a outra

| Job | Comando | Pega | Não pega |
|---|---|---|---|
| Banco de provas | `node tests/suite.js` | erro de **cálculo** | erro de carregamento |
| Fumaça | `npm run smoke` | erro de **carregamento**: ordem de `<script>`, caminho de módulo, hash SRI, CSS ausente, erro de console | erro de cálculo puro |

Ligar só o banco daria impressão de cobertura com metade do casco fora d'água.

### A tabela, não a lâmpada

Cada execução escreve a contagem no resumo do próprio job. Quem abre o pull
request lê `258 provas · 255 PASS · 0 FAIL · 3 WARN` sem abrir log nenhum — e,
havendo falha, uma tabela com a prova, o que se quebrou e **a consequência a
bordo**. Verificado com defeito real injetado (`2,08 → 2,50` no alcance
geográfico):

| Prova | O que se quebrou | Consequência a bordo |
|---|---|---|
| `2.1` | Fórmula d = 2,08·(√h1 + √h2) com olho padrão de 5 m | esperado 17,806 ±1e-9, obtido 21,402 |
| `2.2` | Exemplos numéricos do docstring conferem com o código | docstring diz 24,1 e 28,7 NM; código devolve 28,9 e 34,5 |
| `2.4` | Altitude 0 m = horizonte do próprio observador ≈ 4,65 NM | esperado 4,65 ±0,02, obtido 5,590 |

Lâmpada binária informa que algo quebrou; a tabela informa **o quê**.

### Segurança: um workflow de pull request não pode ter segredo

Ele dispara em `pull_request`, que pode vir de código ainda não revisado. Se
tivesse acesso a `secrets`, bastaria abrir um pull request para extrair a chave
paga do Open-Meteo — a mesma chave que o Sprint 2 se deu ao trabalho de manter
fora do navegador com uma função de servidor.

Portanto: `permissions: contents: read` e **nenhum segredo**. Isso é seguro, e
não apenas prudente, porque as provas rodam **inteiras** sem segredo algum — a
fumaça serve um `cesium-config.js` vazio de propósito. A prova 26.5 guarda as
duas condições.

### Suíte 26 · Integração contínua — 5 provas, 8 mutações

| Mutação | Acusou |
|---|---|
| `codigoDeSaida` devolve 0 sempre (o defeito original, de volta) | 26.3 |
| `WARN` passa a derrubar a obra | 26.4 |
| A função pura fica correta, mas ninguém a chama | 26.3 |
| O gatilho `pull_request` some | 26.1 |
| O workflow deixa de rodar a fumaça | 26.2 |
| O workflow passa a pedir um segredo | 26.5 |
| `contents: read` vira `contents: write` | 26.5 |
| **`pull_request` existe SÓ dentro de um comentário** | 26.1 |

A última é a armadilha que já enganou esta bancada **cinco vezes** — comentário
respondendo por código. O YAML comenta com `#`, igual ao TOML, e o
`semComentariosToml()` criado na v2.9.0 serviu sem alteração. **Varredura de
código lê código.**

### Limites registrados, não resolvidos

**As CDNs são as de verdade no CI.** `tests/fixtures/` não é versionado, então
lá os hashes SRI são conferidos contra os bytes reais do unpkg e do jsdelivr —
mais severo que na bancada. O preço é uma dependência externa: CDN fora do ar
deixa a fumaça vermelha sem culpa do código. Um passo de conferência prévia
**dá nome** a essa falha antes que ela se disfarce de regressão; não afrouxa
nada.

**Não há `package-lock.json`.** O job usa `npm install` e não `npm ci`. Sem
trava de versões, uma atualização do Playwright entra sozinha e pode quebrar a
fumaça por conta própria. Dívida registrada.

**O que nenhuma máquina de integração vê.** Voz, microfone, GPS, acelerômetro
e o Cesium ion continuam fora de alcance. As pendências de confirmação de bordo
da v2.13.0 seguem valendo inteiras.

| | v2.13.0 | v2.14.0 |
|---|---:|---:|
| Provas do banco | 253 | **258** |
| Suítes | 25 | **26** |
| Workflows | 1 (manutenção) | **2** |
| Código de saída com falha | **0** (mentia) | **1** |
| Segredos exigidos pelo CI | — | **nenhum** |

---

## v2.13.0 (21/09/2026) — A IARA PASSA A RESPONDER · SPRINT 6a

Autor: Jossian Brito (Charlie Bravo)

A conversa. Gramática de intenções **local, determinística e auditável** — não
um modelo de linguagem, e a discordância registrada na proposta continua
valendo:

> **Numa ponte, um assistente limitado que está sempre certo vale mais que um
> ilimitado que às vezes erra com confiança.**

Um modelo na nuvem responde qualquer coisa — e às três da manhã, a 40 milhas
da costa, responde exatamente **nada**, porque não há sinal. Pior: pode
responder algo plausível e errado sobre a viagem, e uma voz feminina, simpática
e segura é muito convincente. Quem está de quarto há seis horas não confere.

**20 intenções, 145 gatilhos**, custo zero, nenhuma chave, nenhuma conta — e
quando não entende, **diz que não entendeu**.

### Como se prova uma gramática: com dois corpora

**O corpus.** Cada intenção declara frases **como se fala numa ponte**, e cada
uma é exigida a rotear certo. Não é documentação: é a prova.

**O contra-corpus.** Doze perguntas que ela **não deve** responder — preço do
diesel, previsão para amanhã, quem ganhou o jogo, uma piada. Exigidas a serem
**recusadas**, porque um assistente que improvisa é pior que um que cala.

| | |
|---|---|
| corpus | **61 frases, 0 erros** |
| contra-corpus | **12 perguntas, 0 improvisadas** |

### 🔴 O corpus derrubou 17 de 61 na primeira rodada

E todas pelo mesmo motivo: **eu escrevi os gatilhos em português correto**.
"Como está o tempo", "estou no rumo". **Ninguém fala assim numa ponte.**
Fala-se *"como tá o tempo"*, *"tô no rumo"*, *"pra onde a gente vai"*.

Dava para enumerar as duas formas em cada gatilho — e alguma ficaria de fora,
sempre. A saída foi normalizar a fala para a forma escrita **uma vez só**, na
entrada: `ta→esta`, `to→estou`, `pra→para`. Por **palavra inteira**, porque sem
a fronteira o "ta" dentro de *estabilidade* viraria outra coisa e a intenção do
GM sumiria.

### E três defeitos que só apareceram com o corpus rodando

1. **Eu normalizava a entrada e não os gatilhos.** O gatilho `'pra onde a gente
   vai'` nunca casava, porque a entrada já tinha virado *"para onde"*. Escrever
   "pra" no gatilho, que parecia esperto, era justamente o que o desligava.
   Agora os dois lados passam pela mesma normalização.
2. **"Repete" ficava abaixo do limiar.** Uma palavra só vale um ponto, o limiar
   é dois — e a Iara respondia *"não entendi"* a um pedido perfeitamente claro.
   Entrou o **bônus de casamento exato**: quando a frase inteira é o gatilho,
   não há contexto que desvie o sentido.
3. **"Quem ganhou o jogo" respondia a amplitude de balanço.** O gatilho
   `'o jogo'` valia dois pontos e passava o limiar. **Gatilho curto e genérico
   é falso positivo esperando acontecer** — saiu, e as outras expressões já
   cobriam a intenção sem roubar uma frase que não é dela.

### Empate é pergunta, não sorteio

Com casamento por primeira regra, **a ordem da lista decidiria a resposta** — e
a ordem da lista não é conhecimento sobre a pergunta, é acidente de quem
escreveu. Aqui cada gatilho soma o **número de palavras**: *"estou no rumo"* (3)
vence *"rumo"* (1), porque a expressão longa é específica e a curta aparece em
meia dúzia de perguntas.

E quando duas intenções ficam a um ponto de distância, ela **pergunta**:

> *"Não sei se você quer saber o vento ou o mar. Pode repetir?"*

Responder a mais bem colocada por um ponto seria chutar com cara de certeza —
exatamente o defeito que esta gramática existe para não ter.

### As três formas de não entender são três

| motivo | resposta |
|---|---|
| **vazio** | *"Não consegui ouvir nada. Tenta de novo?"* |
| **ambíguo** | *"Não sei se você quer saber X ou Y. Pode repetir?"* |
| **não entendi** | *"Essa eu não sei responder"* + o cardápio |

*"Não te ouvi"* e *"não sei responder isso"* pedem reações diferentes do
comandante. Tratar as duas como a mesma coisa perde informação que ele tem como
usar.

### A resposta sai da MESMA fonte que o relatório

`estadoAtualParaRelatorio()` alimenta as duas. É o que impede a Iara de se
contradizer: perguntar *"quanto falta"* e ouvir 12 milhas, e um minuto depois o
relatório dizer 8, destruiria a confiança de uma vez.

E sai com prioridade **'resposta'**, que a fila põe na frente do relatório de
rotina — o comandante acabou de perguntar.

### O que ela sabe, e por que dá para ler a lista

Quanto falta · próximo waypoint · posição · referência de terra · desvio de
rumo · tempo · vento · mar · corrente · consumo · rotação econômica · carga do
motor · farol · balanço · estabilidade · velocidade · hora · repetir · relatório
· ajuda.

**Se alguém precisar saber o que a Iara responde, lê a lista.** É exatamente
isso que um modelo de linguagem não permite fazer, e é a razão de a gramática
vir primeiro.

### O que NÃO foi construído, e por quê

O **6b** — conversa aberta por modelo de linguagem — **não foi feito**, e não
por falta de tempo. Ele exige três decisões que não são minhas: uma **chave**,
um **custo por pergunta** e um **servidor**. E resolve um problema que só
existe no porto, com sinal — que é onde o comandante pode simplesmente olhar a
tela.

Fica como proposta, desligada por padrão se um dia entrar. Ver
`docs/manual_usuario.md` §9.8.

### Provas

**Suíte 25 (12 provas), validada por mutação: 13 defeitos, 13 apanhados.** Uma
só foi pega depois de consertar a prova: eu provava a **constante** do
desempate (`CONVERSA_MARGEM >= 1`) e não o **comportamento** — desligar o
desempate inteiro passava limpo. Entrou uma frase construída para empatar.

E `conversa.js` entrou na varredura da **regra 6** (a Iara sugere, não manda),
que desde o Sprint 4 cobre todos os módulos de fala. Plantar *"Reduza para
1.200 rotações"* numa resposta é apanhado pela 19.11.

### Números

| | v2.12.0 | v2.13.0 |
|---|---|---|
| Provas do banco | 241 | **253** |
| Passos da prova de fumaça | 65 | **68** |
| Módulos | 14 | **15** (`conversa.js`) |
| Intenções · gatilhos | — | **20 · 145** |
| `app.html` | 3.287 linhas | **3.288** (teto: 3.500) |

---

## v2.12.0 (21/09/2026) — O REBOCADOR VIRA INSTRUMENTO · SPRINT 5

Autor: Jossian Brito (Charlie Bravo)

Ondas e estabilidade pelos sensores do tablete. É o sprint mais exigente do
projeto e o único cuja falha pode contribuir para emborcar um navio.

### Como se prova um espectro de ondas sem ir ao mar

Fabricando o mar. `tests/mar_sintetico.js` gera um espectro Pierson-Moskowitz
de **Hs e Tp declarados**, devolvendo a **elevação e a aceleração** — o par que
permite alimentar o algoritmo pela aceleração e cobrar dele a elevação de volta.

| entrada | Hs medido | erro |
|---|---|---|
| senoide T=9 s, a=1 m | 2,828 m | **0,0%** |
| PM Hs 2,5 / Tp 9 | 2,44 m | −2,5% |
| PM Hs 1,2 / Tp 6 | 1,20 m | +0,5% |
| PM Hs 4,0 / Tp 12 | 3,86 m | −3,1% |
| **ponta a ponta, 60 Hz → GM** | 2,58 m | **+2,4%** |

O último é o caminho inteiro: acelerômetro a 60 Hz, decimação, relógio,
espectro, balanço e estabilidade — com o aparelho simulado jogando 8°.
Recuperou o período de balanço em **6,28 s contra 6,30 reais**.

### Por que não se integra no tempo

Integrar aceleração duas vezes é receita de desastre: meio miligal de viés vira
uma parábola e produz metros de "heave" em minutos — lindo e inteiramente
falso. No domínio da frequência a mesma operação é uma divisão:

```
η = a·sen(ωt)  →  ä = −a·ω²·sen(ωt)  →  S_η(ω) = S_a(ω)/ω⁴
```

A deriva vive em ~0 Hz e é cortada fora antes de causar dano. É o método das
boias Datawell.

**A divisão por ω⁴ amplifica brutalmente o ruído de baixa frequência** — em
0,01 Hz o fator é 2,5 milhões de vezes o de 0,3 Hz. Medido: a energia
descartada abaixo de 0,03 Hz chega a **99% do total bruto**. A banda não é
capricho, é o que separa onda de deriva de sensor.

### A janela mínima é a inteira — 17 min, e isso foi MEDIDO

Com meia janela o algoritmo perdia **13% do Hs**. A causa foi localizada, não
adivinhada: num registro curto parte da variância do deslocamento aparece
abaixo de 0,03 Hz, onde a banda a descarta com razão.

**Não é defeito do espectro** — com senoides puras ele é exato a 0,0% até em
256 amostras. É que um mar real, olhado por pouco tempo, tem deriva lenta que
não se distingue de onda longa. Boia de onda usa 20 a 30 minutos pelo mesmo
motivo.

### |a| − g escolhido por medição, não por elegância

Havia dois caminhos para tirar a vertical do que o aparelho entrega: girar o
vetor pela atitude fundida, ou tomar o módulo e subtrair g. O primeiro é
teoricamente melhor e depende de acertar a convenção de sinais do
DeviceOrientation, que varia com aparelho e montagem — **e um sinal trocado ali
não aparece como erro, aparece como espectro plausível e errado**.

| jogo | sway | \|a\|−g | a_z−g |
|---:|---:|---:|---:|
| 0° | 0,0 | +0,3% | +0,2% |
| 10° | 0,8 | +0,2% | −0,4% |
| 20° | 1,5 | **−0,3%** | −1,5% |

E a prova decisiva: **parado e adernado 20°**, o eixo z cru acusa −0,59 m/s²
— 6% de g de viés permanente, oscilando no período de **balanço**, que cai bem
no meio da banda de onda. Vira mar do nada.

### ⚠️ O GM pelo período de balanço

```
T_R = 2·C·B/√GM   →   GM = (2·C·B/T_R)²
C = 0,373 + 0,023·(B/d) − 0,043·(L/100) = 0,4106   (ASD 2810)
```

| T_R | GM | leitura de bordo |
|---:|---:|---|
| 5,0 s | 2,94 m | duro, seco, quebra coisa |
| 6,0 s | 2,04 m | confortável |
| 7,0 s | 1,50 m | atenção |
| **8,0 s** | **1,15 m** | 🔴 o barco está amolecendo |

**Não é a onda grande que emborca rebocador: é o GM que baixou sem ninguém
notar.** Superfície livre em tanque parcialmente cheio, água no convés que não
escoou, peso que subiu, e sobretudo o puxão do cabo na cintura. Um rebocador
que emborca raramente avisa — mas o período de balanço avisa, e ninguém escuta.

**E a TENDÊNCIA vale mais que o número.** O valor absoluto depende do
coeficiente empírico e pode estar deslocado; a tendência não depende de C
nenhum: se o balanço alonga, o GM caiu, e isso é verdade qualquer que seja o
coeficiente.

#### As três ressalvas, que vão no código, no manual e na fala

1. **Sensibilidade quadrática.** dGM/GM = −2·dT/T: 10% de erro no período vira
   20% no GM. A faixa de incerteza viaja junto com o número. É **indicador de
   tendência, não cálculo de estabilidade** — a prancha continua mandando.
2. **Só vale com balanço LIVRE.** Se o encontro está perto do natural, o navio
   balança forçado e o período medido é o do **mar**, não o do navio. Nesse
   caso não se diz nada: `qualidadeDoBalanco()` recusa e explica por quê.
3. **O coeficiente C é empírico.** Um ASD com dutos e skeg não é exatamente o
   casco convencional da fórmula IMO. O número absoluto pode estar deslocado;
   a tendência, não.

### O tablet mede o NAVIO, não o mar — e o rótulo vem junto

λ = 1,56·T². Um rebocador de 28 m é boia sensível às ondas longas e **surda às
curtas**:

| período | λ | vs. 28,6 m | leitura |
|---|---|---|---|
| 10 s | 156 m | 5,5× | ✅ o navio sobe junto |
| 7 s | 76 m | 2,7× | razoável |
| 4 s | 25 m | 0,9× | ❌ atravessa — subestima muito |

**Não se corrige.** Corrigir exigiria o RAO deste casco, que ninguém levantou,
e inventar um RAO seria o mesmo pecado de chamar lista de faróis de linha de
costa. **Rotula-se**, e o rótulo diz para que lado erra.

### Ressonância: os dois caminhos que derrubam navio

```
Te = T / |1 − V·cos μ / c|,   c = g·T/2π
```

Em mar de **popa** o encontro estica: a 10 nós numa onda de 8 s vai a **13,6 s**
— o perigo clássico. Dois alertas, ambos com prioridade de **segurança** na
fila da fala, à frente de qualquer conselho de consumo:

- **síncrono** (Te ≈ T_R): cada onda chega empurrando no mesmo tempo;
- **paramétrico** (Te ≈ T_R/2): cresce rápido e pega de surpresa porque o mar
  não parece perigoso.

"Surfando" passou a ser definido **pelo resultado**, não pelo denominador: um
navio a 24,3 nós numa onda cuja celeridade é 24,29 dava den = 1,2×10⁻³ e
escapava do corte de 10⁻³, embora esteja montado na onda.

### O campo reservado no Sprint 1 se preencheu

No Sprint 1 o registro nascia com `onda: null` e a nota dizia: *"a comparação
entre onda medida e prevista só tem valor com série temporal, e dado que não
foi gravado hoje não volta amanhã"*. **Três sprints depois o `null` virou
observação** — Hs, Tz, Tp, jogo, período de balanço, GM e o Hs previsto, lado a
lado. Com o tempo, a razão entre medido e previsto **é o RAO deste casco
levantado no mar de verdade**.

### Provas

**Suíte 24 (14 provas), validada por mutação: 16 defeitos, 15 apanhados e 1
comprovadamente inócuo.** A inócua foi retirar o cálculo da média: medido, um
viés de 5 m/s² não move o Hs em nenhuma casa decimal, porque o laço do espectro
já começa no bin 1. Fica no código, documentada como redundância deliberada.

Quatro só foram pegas depois de consertar as provas — e todas pela mesma razão:
**tolerância frouxa esconde defeito**. A amplitude de jogo usando a fórmula da
altura de onda, o relógio do coletor derivando, a queda de GM sem alerta e o
heave sem correção de adernamento passavam todas dentro das margens que eu
tinha escolhido. A do adernamento era a pior: 5% de tolerância no Hs deixava
passar um viés de 6% de g.

### Números

| | v2.11.0 | v2.12.0 |
|---|---|---|
| Provas do banco | 227 | **241** |
| Passos da prova de fumaça | 63 | **65** |
| Módulos | 13 | **14** (`ondas.js`) |
| Bancadas de simulação | 0 | **1** (`tests/mar_sintetico.js`) |
| `app.html` | 3.279 linhas | **3.287** (teto: 3.500) |

---

## v2.11.0 (21/09/2026) — FAIXA ECONÔMICA DE ROTAÇÃO · SPRINT 4

Autor: Jossian Brito (Charlie Bravo)

Conselho de rotação que chega errado custa combustível ou custa ETA — e a voz
da Iara é convincente. Por isso este sprint confere a física contra casos que
se resolvem na mesa, e não só a coerência do código consigo mesmo.

### A lei da hélice, ancorada no cruzeiro declarado

Com a faixa informada por Charlie Bravo (**lenta 650 · cruzeiro 1250 · máxima
1800**) e o ponto de serviço da viagem:

| rpm | nós | L/h | L/NM | carga MCR |
|---:|---:|---:|---:|---:|
| 650 | 5,7 | 25 | 4,4 | **5%** |
| 1000 | 8,8 | 92 | 10,5 | 17% |
| **1250** | **11,0** | **180** | **16,4** | **33%** |
| 1500 | 13,2 | 311 | 23,6 | 58% |
| 1800 | 13,9* | 537 | 38,6 | 100% |

Cair de 1250 para 1125 (−10%): **−27% por hora, −19% por milha, +11% de tempo.**

**Este rebocador cruza a 33% da MCR, e isso não é defeito.** O motor é
dimensionado para o **tiro à poste**, não para o trânsito: 100% da MCR
acontece com o navio quase parado, puxando. Por isso o "piso de SFOC em 70–85%
da MCR", que vale para um cargueiro, **não se aplica aqui** — aplicá-lo
proibiria o próprio regime de cruzeiro.

### \* A velocidade de casco, que a primeira versão ignorava

O modelo previa **15,8 nós a 1800 rotações**. Um ASD 2810 não faz isso. Num
casco de deslocamento, a partir da velocidade de casco o navio sobe na própria
onda de proa e a resistência vai ao céu:

```
V_casco = 1,34 · √(L_flutuação em pés)
        = 1,34 · √89,4 = 12,7 nós     (LOA 28,67 m)
```

Com potência sobrando um rebocador ultrapassa isso um pouco — daí o teto
prático de ~13,9 nós. Acima dele **a velocidade para de crescer e o consumo
continua com n³**: o L/NM salta de 29,7 para 38,6 sem ganhar um nó. O
otimizador passa a enxergar o que o mar já sabia: forçar rotação além da
velocidade de casco é queimar óleo para fazer onda.

### 🎯 O ótimo de 1,5×Vc não foi codificado — ele EMERGE

Na proposta eu demonstrei que, contra corrente, existe uma velocidade abaixo
da qual reduzir rotação passa a **gastar mais** por milha no fundo:

```
minimizar  n³/(c·n − Vc)   →   derivada zera em   V = 1,5 × Vc
```

**Poderia codificar isso como piso. Não codifiquei**, e a razão importa: um
piso escrito à mão vale só para o caso que eu previ — corrente de proa. A
corrente real vem de través, e aí o navio caranguejeia, o que muda a conta.

Em vez disso, minimiza-se **numericamente** o combustível total, com o
triângulo da corrente **dentro** da função objetivo. O 1,5×Vc emerge do
resultado — e emerge certo também nos casos que eu não previ. Medido:
**erro de 0,016 nó** com 4 nós de corrente, limitado só pelo passo de 5 rpm
da varredura.

E quando o ótimo cai **abaixo da marcha lenta** (corrente de 3 nós pediria 511
rpm), a resposta é a marcha lenta — não uma rotação inventada.

### O conselho pode ser ACELERAR

A primeira versão só sabia mandar reduzir, e numa derrota apertada devolvia
*"economia −485 L, atraso −140 min"*: tecnicamente correto e ilegível. Número
negativo com rótulo positivo é a forma mais eficiente de fazer alguém entender
o contrário do que está escrito. Agora o conselho tem nome — **reduzir,
aumentar ou manter** — e não cutuca por menos de 4% de diferença.

### Marcha lenta prolongada é decisão de MÁQUINAS

A conta do consumo empurra sempre para baixo. Mas rodar horas em carga muito
baixa suja turbo, molha camisa e enche o escape de óleo não queimado — e isso
não aparece no totalizador de combustível.

**A Iara não vê a cor do escape, não sente o cheiro da praça, não sabe há
quanto tempo o motor não abre. O chefe sabe.** Por isso aqui não há piso: há
um **aviso**, e a decisão fica com quem pode tomá-la.

### Carga lida vs. esperada — a discrepância é medida e nomeada

Com a carga informada, a curva livre prevê `(n/n_máx)³`. Mais que isso na mesma
rotação significa que o navio trabalha mais do que trabalharia solto:

> *"Carga de 52 por cento onde a curva esperaria 33 — 55 por cento a mais.
> Reboque, casco sujo ou mar de proa."*

**A Iara não escolhe entre as causas** — ela não vê o cabo nem o fundo. Mede a
diferença, diz o tamanho e entrega a lista ao chefe. Medir e nomear a
discrepância já é a metade cara do diagnóstico.

### 🔴 58 SEGUNDOS DE MONÓLOGO — e o orçamento de fala

O achado mais importante deste sprint, e veio de uma medição, não de uma ideia.

Com o Sprint 4 o relatório passou a ter **quinze fontes de exceção**. No pior
caso realista todas dispararam juntas: **58 segundos**. O teto era 30.

Cortar frase por frase não resolveria — o problema não é uma frase longa, é a
soma de quinze coisas legítimas. E subir o teto seria pior: um relatório de um
minuto no passadiço não é informação, é **ruído com autoridade**.

A saída foi **orçamento com prioridade de bordo**:

1. cada trecho nasce com prioridade;
2. o que não couber é cortado, do menos urgente para cima;
3. a **espinha** (hora, posição, rumo, waypoint) nunca é cortada, nem com teto
   impossível — retrato sem posição não é retrato curto, é outra coisa;
4. se algo foi cortado, **ela diz**.

Resultado: **58 s → 30 s**, mantendo posição, fora de rumo, rajada e carga do
motor; cortando economia, combustível, mar, vento, farol, corrente e barômetro.

**A ordem é de passadiço, não de sprint.** O conselho de rotação — entrega
deste sprint — fica em penúltimo: economia de combustível é valiosa e **nunca
é urgente**; "você está fora de rumo" e "o barômetro está caindo" são.

### "Tem mais no painel" tinha de virar verdade

O Sprint 2 pôs vento, mar e corrente **só na fala**. Quando o orçamento começou
a cortar dizendo *"tem mais no painel"*, a frase virou **mentira**: não havia
painel nenhum para essas coisas. Ou se apagava a frase, ou se tornava verdade —
e é mais útil torná-la verdade. Entrou a linha `#navTempo`.

### A curva deste casco, aprendida na própria viagem

Uma amostra **por relatório**, não por fixo: mil pontos do mesmo minuto de
máquina dariam à mediana uma confiança que ela não tem. Reancora-se o **ponto**,
não o expoente — a lei da hélice é física e não se mede com meia dúzia de
pontos ruidosos. Mediana, não média, porque um fixo de GPS ruim não pode mover
a curva. E guardas: mínimo de 4 amostras e 80 rpm de espalhamento, porque
quatro pontos na mesma rotação não dizem nada sobre a **curva**, só sobre o
ponto.

### Duas lacunas que a mutação encontrou nas provas

**Suíte 23 (16 provas), validada por mutação: 16 defeitos, 16 apanhados** — mas
duas só depois de consertar as provas:

1. **A regra 6 só vigiava um arquivo.** Plantar *"reduza a rotação"* em
   `consumo.js` passava limpo, porque a varredura olhava apenas `iara.js`, onde
   a regra nasceu. A Iara hoje fala textos gerados em **quatro** módulos, e uma
   regra que vigia um arquivo não é uma regra — é um hábito local.
2. **O orçamento podia comer a espinha** com teto impossível, e nenhuma prova
   reclamava porque o caso testado tinha folga.

E a prova de fumaça pegou o que o banco não podia: **os campos de máquinas
ficavam inertes** até alguém apertar "navegar", porque liguei os ouvintes
dentro de `startNavigation` em vez do carregamento — e duas navegações seguidas
empilhavam ouvintes duplicados.

### Números

| | v2.10.0 | v2.11.0 |
|---|---|---|
| Provas do banco | 211 | **227** |
| Passos da prova de fumaça | 60 | **63** |
| Módulos | 12 | **13** (`consumo.js`) |
| Pior relatório falado | 58 s | **30 s** |
| `app.html` | 3.247 linhas | **3.279** (teto: 3.500) |

---

## v2.10.0 (20/09/2026) — CADA WAYPOINT GANHA UM NOME · SPRINT 3

Autor: Jossian Brito (Charlie Bravo)

*"Estou em 23°05'S 041°53'W"* não diz nada a ninguém. *"Estou 12 milhas a
leste de Cabo Frio"* diz tudo — e é assim que se conversa no rádio, se anota no
diário e se explica a posição a quem está em terra.

### Três referências de naturezas diferentes

| | Responde |
|---|---|
| **cidade** | onde estou — para me situar e me comunicar |
| **porto** | o que existe por perto |
| **farol** | o que eu vejo à noite *(já entregue desde a v1)* |

Com **marcação, não só distância**: "Cabo Frio a 12 milhas" deixa o navegante
girando a cabeça; "12 milhas a leste de Cabo Frio" o orienta. A marcação é do
ponto **para** a referência — é para onde olhar.

Aparecem no painel ℹ️ de cada waypoint, no relatório de chegada e, **quando a
cidade mais próxima muda**, como marco de singradura — que é o equivalente
falado de passar o través de um ponto notável: *"passamos Cabo Frio às 14,
Macaé às 17"*.

### ⚠️ A tentação que quase repetiu o pior defeito deste projeto

Na v2.4 a "linha de costa" era a lista de faróis ordenada por latitude:
conveniente, plausível, **errada em 48 NM na média**. O defeito não foi de
código — foi de **procedência**: aceitou-se um dado por estar à mão e deu-se a
ele um nome que prometia mais do que ele era.

A tentação aqui era a mesma, e tinha até o nome pronto no meu próprio plano:
chamar o porto mais próximo de **abrigo**.

**Não se faz isso.** Escolher fundeadouro exige carta náutica, tenedouro,
proteção de *qual* quadrante, profundidade e acesso noturno. Nada disso está em
nenhuma base pública ao alcance do gerador. Um aplicativo que sussurra *"abrigo
a 12 milhas"* com vento de 40 nós está mandando o navio para um lugar que ele
não conhece.

A entrega é **referência de orientação**, e o arquivo gerado, o código de
consulta, o manual e a prova 22.9 dizem isso.

### A lacuna, declarada em vez de disfarçada

Fontes verificadas em 20/09:

| Fonte | Resultado |
|---|---|
| ANTAQ (lista oficial) | inacessível desta bancada (HTTP 000) |
| dados.gov.br | exige credencial (401) |
| IBGE localidades | responde, **sem coordenadas** |
| Natural Earth 10 m | público, com coordenadas ✅ |

A Natural Earth traz **20 portos brasileiros**. Faltam, conferidos um a um:
Suape, Itaqui, Sepetiba/Itaguaí, São Sebastião, Angra dos Reis, Tubarão, Areia
Branca, Imbituba, Antonina, Itajaí, Cabedelo, São Luís e Barra do Riacho.
**Nenhum deles aparece como cidade na Natural Earth, nem como farol na LF-40ED
da DHN** — também conferido um a um.

**Coordenada de porto não se inventa.** A saída honesta tem duas partes: gerar
o que existe com procedência declarada, e deixar a emenda trivial —
`PORTOS_EXTRA` no gerador, com a **procedência obrigatória na quarta coluna**.
Sem ela, daqui a um ano ninguém saberá se aquele número veio de uma carta, de
um GPS de bordo ou de um palpite; foi exatamente esse esquecimento que produziu
a linha de costa errada da v2.4.

### Números da base

98 cidades litorâneas (só Brasil, só a menos de 25 NM da linha de costa da
v2.5.0 — que é reaproveitada pelo gerador para fazer esse corte) e 24 portos,
em 7,2 KB. Os 250 municípios de interior e os 40 pontos de países vizinhos
dentro da caixa foram descartados, e o gerador imprime essas contagens.

### Além de 120 milhas, silêncio

A primeira versão respondia *"Campos a 399 milhas"* no meio do Atlântico.
Tecnicamente correto e **pior que o silêncio**: um nome de terra numa frase
implica relevância, e quem ouve passa a procurar referência que não existe.

O corte não é alcance visual — o horizonte de um passadiço de 10 m são 7 milhas.
É alcance de **orientação**: "80 milhas a leste de Vitória" ainda situa alguém
num rádio. Acima disso, a posição se diz em latitude e longitude, como sempre.

### A prova que estava errada e inventou um defeito

A varredura de cobertura da 22.6, na primeira versão, sintetizava pontos ao
largo varrendo longitude de 0,25 em 0,25 grau — que a 20°S são **~14 NM por
passo**. A faixa procurada (8 a 14 NM da costa) **cabe dentro de um passo**, e
a varredura pulou a costa continental inteira, indo parar em **Trindade**, a
600 milhas, onde de fato não há cidade. Acusou um buraco que não existia.

**Prova de resolução grossa não encontra defeito: inventa um.**

Refeita sobre os 98 faróis da DHN, que já estão exatamente onde interessa e
cobrem o litoral inteiro. E o resultado **se valida sozinho**: os únicos cinco
faróis sem referência de terra são precisamente as cinco ilhas oceânicas —
Fernando de Noronha, Rocas, São Pedro e São Paulo, Martim Vaz e Trindade. Lá
realmente não há cidade, e dizer que há seria o defeito.

| | |
|---|---|
| mediana | **18,7 NM** |
| pior caso continental | 74 NM (Farol de São João → Viseu, costa Pará–Maranhão) |
| sem referência | 5, e são exatamente as ilhas oceânicas |

### Dois deslizes que só aparecem ouvindo

*"28,0 milhas"* e *"9,0 nós"* saem do sintetizador como "vinte e oito vírgula
zero" — o ouvido tropeça numa sílaba sem informação. Na tela o zero alinha
colunas; no ouvido não serve para nada.

E o marco de singradura dizia *"próximo waypoint Macaé… agora a referência mais
próxima é Macaé"*. Na costa brasileira o waypoint quase sempre **tem o nome da
cidade** — a Iara estava conversando sozinha. Agora cala quando é redundante.

**Suíte 22 (12 provas), validada por mutação: 12 defeitos deliberados, 12
apanhados.**

### Números

| | v2.9.0 | v2.10.0 |
|---|---|---|
| Provas do banco | 199 | **211** |
| Passos da prova de fumaça | 58 | **60** |
| Módulos | 11 | **12** (`referencias.js`) |
| Geradores | 2 | **3** (`tools/terra/`) |
| `app.html` | 3.235 linhas | **3.247** (teto: 3.500) |

---

## v2.9.0 (20/09/2026) — TEMPO, VENTO E CORRENTE · SPRINT 2

Autor: Jossian Brito (Charlie Bravo)

Open-Meteo pelo proxy, e a aritmética náutica que dá sentido a ele.

### A pergunta que este módulo precisava responder para existir

> *"Se o GPS já mede a SOG, e a SOG já CONTÉM a corrente, para que serve a
> corrente prevista?"*

A objeção é boa e quase mata o recurso. A resposta:

**Na perna atual, para nada** — o GPS já sabe. **Nas pernas que ainda não se
navegou, para tudo** — porque a mesma corrente age de forma completamente
diferente conforme o rumo. Medido, com 2 nós de corrente para o sul, pernas de
20 NM e navio a 10 nós na água:

| Perna | SOG | ETA | Ingênuo diria |
|---|---|---|---|
| ao **norte** (contra) | 8,0 nós | **150 min** | 120 |
| a **leste** (través) | 9,8 nós | **122 min** | 120 |
| ao **sul** (a favor) | 12,0 nós | **100 min** | 120 |

Cinquenta minutos de diferença entre a primeira e a última, com a mesma
corrente. **O GPS só mede o que já aconteceu; o modelo prevê o que vai
acontecer.** Por isso o ETA da rota é recalculado perna a perna, cada uma com
o seu triângulo.

### O triângulo da corrente, resolvido em vez de desenhado

```
α        = θc − θt                    ângulo da corrente vs. derrota
correção = arcsen( −Vc·sen(α) / Vb )  a caranguejada
proa     = θt + correção
SOG      = Vb·cos(correção) + Vc·cos(α)
```

Conferido contra três casos que se resolvem de cabeça: corrente de través a 2
nós com navio de 10 dá proa 348,5° e SOG 9,80; de proa, SOG 8,00; de popa,
12,00.

**E quando `|Vc·sen(α)| > Vb` o arcsen não existe.** Isso não é erro de conta:
é o mar dizendo que **esta derrota não se mantém** com esta velocidade.
Devolver `NaN` em silêncio esconderia justamente a informação mais grave que
a função pode produzir — então ela diz, com o número.

### A armadilha de convenção, verificada na documentação

As três direções do Open-Meteo **não seguem a mesma convenção**:

| Variável | Convenção |
|---|---|
| `wind_direction_10m` | **DE** onde o vento vem |
| `wave_direction` | **DE** onde a onda vem |
| `ocean_current_direction` | **PARA** onde a corrente vai |

Tratar a corrente como "de onde vem" inverteria o vetor em 180° e jogaria a
correção de proa **para o bordo errado** — o navio sairia da derrota
justamente ao tentar segurá-la. A prova 21.5 fixa o sinal nos dois bordos.

### O proxy: a chave paga não vai ao navegador

Decisão aprovada em 20/09, registrada em `docs/arquitetura.md`. Resumo:

- O Open-Meteo só aceita a chave como **parâmetro de URL** e **não oferece
  restrição por domínio**. Numa página estática, chave embutida é chave
  pública — e esta é paga: quem copiar usa a licença comercial alheia.
- **O precedente do Cesium não se aplica.** O token ion é publicável *porque
  pode ser algemado* (o próprio `build-config.js` diz isso). Esta não pode.
- **Ganho que não era o objetivo:** a CSP não lista `open-meteo.com` em
  `connect-src`, então chamada direta já seria bloqueada hoje. Sendo mesma
  origem, o proxy é a **única** opção que não afrouxa a política.
- **Cache em dois andares** (memória do contêiner + CDN), chaveado pela posição
  arredondada a 0,05°. Isso não é truque: 0,05° ≈ 3 NM está **dentro** da
  resolução dos próprios modelos (8 a 25 km), e a 10 nós o rebocador cruza 3 NM
  em 18 min — quase o TTL de 15 min. Cada observador do espelho gastaria uma
  chamada da cota; com o proxy, gastam **zero**.
- **Sem chave, não cai no plano gratuito.** O plano livre é de uso não
  comercial e o app roda num rebocador de trabalho: resolver o técnico abrindo
  o jurídico é decisão do dono, não do código. Falha declarando o motivo.
- **Teto de 10 variáveis** por requisição, porque acima disso a cobrança do
  Open-Meteo conta como mais de uma chamada. São 8 marinhas e 5 de ar.
- **`Promise.allSettled`**, não `all`: num estuário o modelo marinho devolve
  `null` e o vento continua bom. Meia informação correta vale mais que nenhuma,
  desde que se diga qual metade falta.

O proxy foi exercitado de ponta a ponta nesta bancada, com os endpoints pagos
redirecionados para os gratuitos: cache acertando em 1 ms, chave nunca no
corpo da resposta, ponto em terra devolvendo meia informação, coordenada
inválida em 400.

### O barômetro que o tablet não tem

O Galaxy Tab S10 FE **não tem barômetro** — verificado antes de desenhar. "O
barômetro está caindo" é o aviso de mau tempo mais antigo que existe, e aqui
ele só pode ser **previsto**. A tendência sai da série de `pressure_msl`, em
hPa por 3 horas, e uma queda de 3 hPa/3h acende atenção.

### Dado velho é rotulado, não escondido

Quando o proxy falha, serve-se o último valor **dizendo a idade** — *"dados de
40 minutos atrás"* — em vez de cair no plano gratuito. É a mesma lógica da
regra 5 da Iara, só que aqui, em vez de descartar, ela **diz a idade** e o
comandante decide se serve.

### Português que a medição denunciou

*"Corrente 1,0 nós"* não é português, e *"Vento de nordeste, 24 nós, **vento**
muito fresco"* soa a máquina travada. Entrou `falarNos()` e o nome Beaufort
perdeu o prefixo. Também: `Number(null)` é **zero**, não `NaN` — sem guarda,
"não sei qual é a corrente" viraria "a corrente é de zero nó", que são
afirmações muito diferentes.

### O quinto comentário que respondeu por código

**Suíte 21 (18 provas), validada por mutação: 18 defeitos deliberados, 18
apanhados** — mas duas mutações só foram pegas depois de consertar as provas, e
uma delas pela quinta vez pelo mesmo motivo:

1. `Promise.allSettled` → `Promise.all` sobreviveu porque a palavra
   "allSettled" continuava **no comentário acima da linha**.
2. A CSP afrouxada passou despercebida porque eu escrevi um comentário citando
   `connect-src` logo acima da diretiva `connect-src`.

Foi a gota. Entrou `semComentarios()` no banco de provas, aplicado a toda
varredura que afirma algo sobre o código — e `semComentariosToml()` depois,
porque o TOML comenta com `#`. **Varredura de código lê código; comentário é
documentação, explica o código mas não responde por ele.**

E duas lacunas de **integração**: a mutação mostrou que dava para desligar o
bloco de tempo inteiro, e para nunca chamar `iniciarTempo()`, sem uma prova
reclamar. As suítes mediam a conta e mediam o relatório, mas não a costura.
**Conta certa que não chega à ponte não serve para nada.** Entraram 21.16 e
21.18.

### Um erro meu no caminho, e o que ele custou

Durante a validação por mutação usei `git checkout --` para restaurar
`relatorio_voz.js` e `app.html` — que tinham trabalho **não commitado** do
Sprint 2. Perdi as edições de integração e tive de refazê-las. Nada foi
publicado quebrado, mas o método estava errado: **restaura-se de cópia de
segurança, nunca do índice, quando há trabalho pendente.** O resto das
mutações passou a usar `cp` de um `/tmp/bak_*`.

### Números

| | v2.8.0 | v2.9.0 |
|---|---|---|
| Provas do banco | 181 | **199** |
| Módulos | 10 | **11** (`tempo.js`) |
| Funções de servidor | 0 | **1** (`netlify/functions/tempo.mjs`) |
| Mudanças na CSP | — | **nenhuma** |
| `app.html` | 3.228 linhas | **3.235** (teto: 3.500) |

---

## v2.8.0 (20/09/2026) — A IARA PASSA A RELATAR · SPRINT 1

Autor: Jossian Brito (Charlie Bravo)

Relatórios falados de hora em hora e a cada waypoint. **Funcionam offline** —
a síntese de voz é local, e essa foi a regra estrutural fixada no Sprint 0.

### Duas teses sustentam este módulo

**1. O texto para o olho não é o texto para o ouvido.**

O painel mostra `03°43.6'S` e `Fl(3) W 15s`. Jogado num sintetizador, sai
*"zero três grau quarenta e três ponto seis linha ésse"* e *"efe éle abre
parênteses três fecha parênteses dábliu quinze ésse"*. O vigia não faz ideia do
que procurar no horizonte — e pior, pode ACHAR que entendeu.

Mas todo navegante sabe ler isso em voz alta, e sempre soube:

| Carta | Voz |
|---|---|
| `Fl(3) W 15s` | três lampejos brancos a cada 15 segundos |
| `LFl W 30s` | lampejo longo branco a cada 30 segundos |
| `Oc(2) R 6s` | duas ocultações vermelhas a cada 6 segundos |
| `Mo(A) W 8s` | morse alfa branco a cada 8 segundos |
| `048°` | rumo zero quatro oito |
| `15:20` | 15 e 20 |

Rumo vai dígito a dígito porque é assim no rádio, e por uma razão operacional:
*"quarenta e oito"* e *"cento e quarenta e oito"* se confundem num alto-falante
ruim; *"quatro oito"* e *"um quatro oito"* não. **As 98 características da base
da DHN traduzem**, verificado uma a uma.

**2. Relatório por exceção.**

O que se repete toda hora vira ruído de fundo em dois dias — e aí ninguém
escuta justamente quando havia algo diferente. É o mal do alarme que toca
sempre. Então o essencial vai sempre e o resto entra só quando importa:

| Item | Quando entra |
|---|---|
| hora, posição, rumo, próximo WP, ETA | **sempre** |
| fora de rumo | só acima de **0,1 NM** — abaixo é ruído de GPS (185 m contra 5–10 m de erro do aparelho) |
| farol | só **dentro do alcance efetivo** — ou seja, só quando pode ser avistado deste passadiço |
| combustível | de 4 em 4 relatórios, ou **na hora** se o saldo não fecha a rota |
| **SIMULAÇÃO** | **sempre, e na primeira frase** |

Medido: o relatório típico leva **14 s**; com as três exceções juntas, 26 s.
Há dois tetos (15 s e 30 s) e o segundo não é desleixo — quando três coisas
merecem atenção ao mesmo tempo é exatamente a hora em que o comandante quer
ouvir as três. Um relatório que se cala sobre o farol porque "já falou demais"
troca incômodo por risco.

### A regra da simulação não tem exceção

Foi um simulador ligado ao lado do botão mais usado que produziu
`628.616 L de perda por desvio` na v2.3.3. **Números simulados ditos em voz
alta, com o aplomb de uma assistente e sem avisar, são a forma mais perigosa
desse defeito**: voz convence mais que tela e não deixa rastro para reler. Se a
simulação está ligada, a Iara abre o relatório avisando. É prova (20.10).

### Alinhado na hora cheia, não "de 60 em 60 minutos"

Parece cosmético e não é. Um temporizador de 60 minutos dispara às 14h07,
15h07 — e o relatório deixa de casar com o diário de bordo, que é escrito na
hora cheia. Alinhados, o falado e o escrito contam a mesma história na mesma
linha do tempo. Quem já reconstituiu uma viagem depois sabe o quanto vale.

A troca de perna é **observada**, não recalculada: a Iara lê o `navActiveLeg`
que o app já avançou. Duas fontes de verdade sobre "chegamos" sempre divergem,
e aí o relatório falado contradiz o painel na frente do comandante.

### Quem está em terra ouve o mesmo

O relatório segue no pacote de telemetria que já existe — **nenhuma chamada de
rede a mais**. Aparece **só no espelho**: a bordo o comandante já ouviu, e
repetir na tela tomaria o espaço do XTE. Texto vindo do canal vai para
`textContent`, nunca `innerHTML` — mesma regra do cartão de farol.

### Quatro defeitos que as provas pegaram, e um que a mutação pegou

1. **`navActiveLeg` é o waypoint de ORIGEM da perna.** Escrevi `wps[leg]`: a
   Iara teria anunciado o waypoint **já ultrapassado**, com a distância caindo
   a zero e depois crescendo. Na voz, soa como o barco andando de ré — e o
   comandante acreditaria, porque o número é coerente consigo mesmo.
2. **`crossTrackError(lat, lng, start, end)` recebe OBJETOS** nas duas pontas.
   Chamado com seis números devolvia `NaN` em silêncio, e o "fora de rumo"
   simplesmente nunca apareceria.
3. **`falarRumo(359,7)` dizia "três seis zero".** Eu normalizava antes de
   arredondar. Rumo 360 não existe na carta nem na boca de ninguém: é 000.
4. **Concordância.** As duas primeiras versões da tabela diziam *"dois
   ocultações vermelhos"* e *"luz fixa vermelho"*. Em português só UM e DOIS
   flexionam em gênero. Um assistente que fala errado perde autoridade na
   terceira frase — e autoridade é o que faz o comandante ouvir o aviso de fora
   de rumo quando ele vier.

Os dois primeiros eu corrigi lendo o código; **nenhum dos dois estava coberto
por prova**, e a mutação denunciou: o defeito vivia na função que lê as
globais, que eu não estava exercitando. Entrou a prova 20.18, que expõe
`estadoAtualParaRelatorio()` à bancada com rota e fixo falsos.

**Suíte 20 (19 provas), validada por mutação: 14 defeitos deliberados, 14
apanhados.**

### O histórico guarda um campo que ainda não é usado

Cada relatório fica registrado com `onda: null` e `tempo: null`. A comparação
entre a onda **medida** pelos sensores e a **prevista** pelo modelo (Sprint 5)
só tem valor com série temporal — e **dado que não foi gravado hoje não volta
amanhã**. Custa um `null` e evita perder meses de observação.

### Decisão arquitetural registrada

`docs/arquitetura.md` ganhou o registro da decisão aprovada sobre a **chave
paga do Open-Meteo**: ela não vai ao navegador. Proxy por Função Netlify, com
recuo para cache rotulado. O motivo curto: a chave Open-Meteo só viaja como
parâmetro de URL e **não aceita restrição por domínio** — ao contrário do token
Cesium, que é publicável justamente porque pode ser algemado. E o proxy é a
única opção que **não afrouxa a CSP**, porque é mesma origem.

### Números

| | v2.7.0 | v2.8.0 |
|---|---|---|
| Provas do banco | 162 | **181** |
| Passos da prova de fumaça | 55 | **58** |
| Módulos | 9 | **10** (`relatorio_voz.js`) |
| `app.html` | 3.177 linhas | **3.203** (teto: 3.500) |

---

## v2.7.0 (20/09/2026) — A IARA NASCE · SPRINT 0 do assistente de voz

Autor: Jossian Brito (Charlie Bravo)

Primeiro sprint do assistente de viagem por voz. **Iara** — não um leitor de
números, mas uma **consultora e especialista em navegação** que fala. Este
sprint entrega a fundação: ela se apresenta, fala, mostra o próprio estado e
obedece às regras de passadiço. Responder perguntas vem no Sprint 6.

### A verificação que desenhou o módulo inteiro

Antes de escrever uma linha, três coisas foram medidas — e uma inverteu a
arquitetura:

| | Tecnologia | Offshore, sem 4G |
|---|---|---|
| **Falar** (`SpeechSynthesis`) | vozes **no aparelho** | ✅ **funciona** |
| **Ouvir** (`SpeechRecognition`) | áudio vai à **nuvem** | ❌ **morre** |

Um rebocador a 30 NM da costa não tem sinal. Daí a regra estrutural, que é
prova (19.16) e não intenção:

> **Os relatórios automáticos JAMAIS dependem de reconhecimento de voz.**

Offshore a Iara continua relatando; o que ela perde é a capacidade de ouvir — e
nesse caso ela **diz isso**, em vez de fingir que não entendeu. Consequência
concreta: `escolherVoz()` pontua `localService` com peso **+60**, acima do peso
do gênero (+30). Entre uma voz feminina de nuvem que emudece no mar e uma voz
comum que fala sempre, a escolha de bordo é a que continua falando.

Também verificado: o Chromium **recusa** `continuous` no Android
([40324711](https://issues.chromium.org/issues/40324711)). O microfone só ao
toque do botão — que era o pedido de bordo — é o único caminho que funciona.
Bom instinto de passadiço virou boa engenharia.

E o Galaxy Tab S10 FE **não tem barômetro**. A tendência barométrica terá de
vir do modelo, não do aparelho. Registrado em `docs/dados_embarcacao.md` antes
que alguém desenhe o Sprint 5 contando com ela.

### As seis regras de passadiço, em código

Um assistente falante numa ponte é **risco de distração** e pode **mascarar o
VHF e os alarmes**. Intenção escrita em comentário não sobrevive à terceira
refatoração, então virou função pura com prova:

| # | Regra | Prova |
|---|---|---|
| 1 | **Mudo é soberano** — cala até o crítico, e **descarta** em vez de guardar | 19.7 |
| 2 | Não fala sobre alarme do app | 19.8 |
| 3 | Não fala em manobra (crítico fura) | 19.8 |
| 4 | Não interrompe a si mesma | 19.8 |
| 5 | **Fala vencida não é dita** | 19.9 |
| 6 | **Ela sugere, não manda** | 19.11 |

A regra 1 descarta em vez de enfileirar de propósito: desmudar depois de uma
hora não pode despejar doze relatórios velhos na cara de quem acabou de voltar
à ponte.

A regra 5 merece o nome que tem. **Relatório de posição guardado 20 minutos não
é atrasado — é errado.** A 10 nós o barco andou 3,3 milhas desde que o texto foi
escrito; dizer "faltam 4 milhas" quando faltam 0,7 é pior que ficar calado, é
induzir a erro com a voz mansa de quem tem certeza. Toda fala nasce com prazo.

A regra 6 existe porque **uma voz feminina, simpática e segura é muito
convincente**. Se a Iara disser "reduza para 1.200 rotações", alguém reduz sem
pensar — e ela não enxerga o tráfego, não sente o cabo, não sabe que o rebocado
está guinando. Nenhuma fala dela usa imperativo sobre governo do navio; o verbo
no imperativo fica para quem está no leme.

### A apresentação, e o que ela é obrigada a dizer

Falada uma vez, no **primeiro toque** do 🎙️ — e isso não é estilo: Android e
iOS bloqueiam áudio sem gesto do usuário, então uma Iara que se apresentasse ao
carregar a página simplesmente não sairia som nenhum.

Três coisas obrigatórias, cada uma com prova (19.12): **quem ela é**
(especialista, o que autoriza perguntas técnicas), **quem decide** ("quem decide
é você", dito na primeira frase que ela diz na vida), e **o contrato do
microfone** ("eu só escuto quando você me chama" — privacidade anunciada em voz
alta vale mais que privacidade escrita em rodapé).

A primeira versão levava **42 segundos falados**. Foi a própria prova que
denunciou, e entrou um teto: 30 s para a apresentação, 15 s para relatório de
rotina. Ninguém numa ponte quer parágrafo.

### O ícone: quatro estados, três canais redundantes

🎙️ fechado · 🔴 **ouvindo** · ⏳ processando · 🔊 falando · 🔕 muda.

Cada estado tem **ícone, cor+moldura e `aria-label` próprios**, e a prova 19.5
exige que nenhum canal colida entre estados — porque um deles vai falhar: o
ícone some sob reflexo, a cor lava no sol, a moldura desaparece para quem tem
daltonismo. Nada de transparência (lição da v2.3.3). Só o **ouvindo** anima: é
o que o olho periférico capta sem a cabeça virar de quem está olhando o tráfego.

### Como isto foi provado sem microfone nem alto-falante

Esta bancada não tem nenhum dos dois, e `speechSynthesis` não existe nela. Mesma
disciplina do `farolEarthSpec()`: **separa-se a decisão do efeito**. Que voz
escolher, que estado mostrar, falar ou calar, o que descartar — tudo isso é
regra e aritmética, provado aqui; ao navegador sobra emitir o som.

**Suíte 19 (16 provas), validada por mutação: 12 defeitos deliberados, 12
apanhados** — voz remota aceita, voz em inglês, crítico furando o mudo, a Iara
se interrompendo, fala durante manobra, relatório vencido sendo dito, guinada
deixando de calar, resposta no fim da fila, "quem decide é você" removido,
estado por transparência, Iara nascendo depois do mapa, microfone contínuo.

**Três das doze só foram apanhadas depois de consertar a própria prova** — e as
três falhas eram da mesma família, que vale registrar:

1. **19.11 varria comentários.** O regex de aspas engolia um trecho que ia do
   código até dentro da lista `IARA_IMPERATIVOS_PROIBIDOS`, que naturalmente
   contém "reduza". Ficava vermelha por motivo errado, que é tão ruim quanto
   ficar verde por motivo errado.
2. **19.6 usava a constante sob prova como entrada** (`IARA_ROT_LIMITE + 1`), de
   modo que afrouxar o limiar para 999°/min passava despercebido: a entrada
   andava junto com o defeito. Agora usa valor absoluto — 15°/min é manobra num
   rebocador, ponto final.
3. **19.14 comparava contra a definição de `initMap`,** não contra a chamada; e
   depois de corrigida, passou a tropeçar no **meu próprio comentário
   explicativo**, que cita `initMap()` antes da chamada real.

Terceira vez na mesma suíte que texto de comentário respondeu por código.
**Varredura de código lê código** — os comentários saem antes.

### Dívida que para de crescer

O aviso 9.7 conta 58 atributos `onclick=` no app, e são eles que obrigam a CSP
a aceitar `'unsafe-inline'`. **O botão da Iara não tem `onclick`**: a ligação é
por `addEventListener`, com `stopPropagation` (sem ele, perguntar à Iara
recolheria o HUD na cara do comandante — defeito que a prova de fumaça pegou em
navegador de verdade). Daqui em diante, código novo não aumenta a dívida.

### Dado de bordo recebido

`docs/dados_embarcacao.md`, novo: faixa de rotação do ASD 2810 informada por
Charlie Bravo — **lenta 650 · cruzeiro 1250 · máxima 1800**. O cruzeiro está em
**52% da faixa útil** acima da marcha lenta. Vai ancorar a curva do Sprint 4.

### Números

| | v2.6.0 | v2.7.0 |
|---|---|---|
| Provas do banco | 146 | **162** |
| Passos da prova de fumaça | 46 | **55** |
| Módulos | 8 | **9** (`iara.js`) |
| `app.html` | 3.164 linhas | **3.177** (teto: 3.500) |

### Ainda não entregue (Sprints 1 a 6)

Relatórios automáticos, Open-Meteo, referência de porto/cidade, faixa econômica
de RPM, ondas e GM pelos sensores, e a conversa livre. A Iara deste sprint fala,
mostra o estado e **diz a verdade sobre o que ainda não sabe fazer** — botão que
não faz nada confunde mais que botão nenhum; botão que diz a verdade, não.

---

## v2.6.0 (10/09/2026) — OS FARÓIS SUBIRAM NO GLOBO

Autor: Jossian Brito (Charlie Bravo)

O modo 🌍 **Earth** mostrava o rebocador e a rota sobre o terreno do Google, e
nada mais. Ora: a **Lista de Faróis DH2 (40ª ed.)** é o coração deste programa
— 98 luzes com posição, altitude do foco, característica e alcance. Deixá-las
de fora do globo era mostrar o mar sem os olhos que o vigiam.

### O que se desenha, e por que exatamente isso

Um farol num globo 3D não é enfeite. Quem navega faz três perguntas, e cada
uma virou um elemento:

| Elemento | Pergunta que responde |
|---|---|
| **Coluna** do chão até a altitude do foco | *Quão alto é?* — e é a altura da **luz**, não da torre |
| **Ponto** no topo, na cor da característica | *Onde está e de que cor é?* |
| **Círculo** no mar, raio = alcance efetivo | *Até onde eu a vejo?* |

**A cor vem da característica, não do capricho.** `Fl R 5s` → vermelha,
`Oc(2) G 6s` → verde, `Fl W 10s` → branca. É o primeiro dado que identifica
uma luz na ponte. Na base atual: 97 brancas e 1 vermelha.

**O círculo é do OBSERVADOR, não do farol.** Este é o ponto que um mapa
estático não faz. O alcance efetivo é o **menor** entre o luminoso e o
geográfico, e o geográfico depende de **duas** alturas:

```
d = 2,08 · (√h₁ + √h₂)     h₁ = altitude do foco   h₂ = altura do olho
```

Com a altura de olho padrão, todos os 98 faróis são limitados pelo alcance
**luminoso** — a Lista brasileira é conservadora. Com o olho a **1 m** (um
bote), **81 dos 98** passam a ser limitados pela **curvatura da Terra**. Suba
para o passadiço e os círculos crescem. É a tabela de avistamento desenhada no
globo, e ela se move com quem olha.

### Contra a sopa de etiquetas

98 nomes e 98 círculos desenhados o tempo todo tornariam o globo ilegível
justamente no zoom out — que é quando se quer ver a costa inteira. Nome só de
perto (150 km), círculo até média distância (600 km), coluna sempre.

### O botão 💡

Liga e desliga os faróis; a escolha fica gravada no aparelho
(`cnb_farois_earth`). **Só aparece no modo Earth**, pela mesma regra que já
escondia o 🎚️ no globo: botão que não faz nada na tela em que está confunde
mais do que ajuda.

### Como isto foi provado sem poder ver

Esta bancada **não alcança** o Cesium ion nem os ladrilhos do Google — não há
como renderizar e conferir com os olhos. A resposta não foi "então não se
testa": foi **separar a descrição do desenho**. `farolEarthSpec()` é aritmética
pura — altura, alcance, cor, rótulo — e é provada número a número fora do
Cesium; ao Cesium sobra transcrever.

A **suíte 18** (10 provas) foi validada por mutação: dez defeitos deliberados
foram introduzidos um a um e **os dez foram apanhados** — alcance ignorando o
horizonte, coluna com altura fixa, entidades vazando a cada redesenho, rótulo
sem corte de distância, cor perdida, botão ausente, 💡 visível na Atitude,
preferência lida depois do desenho. Um teste verde que não pega o defeito é
pior que teste nenhum; este ficou verde depois de provar que fica vermelho.

**O que continua sem verificação visual:** o desenho em si, no Cesium, com os
ladrilhos do Google. Como o farol de luz apagada, aqui só se garante o cálculo
— quem confere a luz é quem está na ponte.

**Fechados neste mesmo dia, esses sim confirmados no aparelho** (Charlie Bravo,
10/09/2026): a **iluminação dos cascos** no modo Earth e a **âncora da linha
d'água** — o ASD 2810 **não afunda mais** no zoom out. Estavam abertos desde a
v2.3.2 por exatamente esta razão: foram corrigidos aqui e conferidos lá.

### E uma correção de honestidade no caminho

Ao acrescentar o 💡 ao cabeçalho do painel 3D, apliquei a lição da v2.4.2
(fileira rígida corta botão) e **fui medir antes de escrever que tinha
consertado um corte**. Não havia corte: ao contrário do painel de navegação —
largura fixa de 344 px e botões com `min-width: 44px` —, o cabeçalho do 3D
ocupa a tela inteira e tem itens que encolhem. O excesso virava **aperto**, não
recorte: a 320 px o seletor de casco caía de 108 px para **94 px**, e
`ASD 2810 “SAAM Aguia”` não cabe em 94 px.

Com `flex-wrap: wrap` o seletor volta aos 108 px e o cabeçalho até **encurta**
(97 px contra 112 px de altura), porque o título deixa de disputar a linha. A
prova de fumaça ganhou a largura de **320 px** e passou a medir o seletor com o
conteúdo **real** — medir com o seletor vazio (34 px, sem opções) quase fez
esta própria verificação passar sem enxergar nada.

### Números

| | v2.5.0 | v2.6.0 |
|---|---|---|
| Provas do banco | 136 | **146** |
| Passos da prova de fumaça | 38 | **46** |
| Larguras de tela medidas | 375, 768 | **320, 375, 768** |
| Faróis no globo 3D | 0 | **98** |

---

## v2.5.0 (10/09/2026) — A LINHA DE COSTA ERA A LISTA DE FARÓIS

Autor: Jossian Brito (Charlie Bravo)

O HUD mostra **"Dist. da costa: ~X NM"** no popup da embarcação. Ao abrir o
código para atacar o aviso 10.4, a "linha de costa" acabou sendo isto:

```js
_coastline = lighthouses.filter(...).map(lh => ({lat, lng})).sort((a,b) => a.lat - b.lat);
```

A **lista de faróis ordenada por latitude**. Oitenta e oito pontos ligados em
sequência, do Oiapoque ao Chuí. Uma reta entre dois faróis corta baías inteiras.

### Quanto errava, medido de verdade

O aviso antigo dizia "14% a menos" — mas essa conta comparava com um palpite:
*"10 NM ao norte do farol devem ser 10 NM da costa"*, o que só vale se o litoral
ali for uma reta leste-oeste. Aferindo contra a costa em **resolução plena**, em
1.440 pontos ao largo:

| Aproximação | Erro médio | P90 | Pior |
|---|---|---|---|
| **faróis (88 pontos)** — só continente | **13,4 NM** | 80,2 NM | **105,6 NM** |
| **faróis (88 pontos)** — com ilhas | **48,3 NM** | 128,5 NM | **273,4 NM** |
| costa 0,1 NM | 0,01 NM | 0,03 NM | 0,1 NM |

O número que o comandante lia não tinha relação com onde a terra estava.

### O que entrou

`assets/js/coastline.js` — Natural Earth 10 m recortado para o Brasil,
**71 traços e 6.218 vértices**, 105 KB crus e **28 KB comprimidos**. Gerado por
`tools/costa/gerar_costa.mjs`.

A tolerância de **0,1 NM** não é arbitrária: é a resolução com que o número
aparece na tela. Simplificar mais introduziria erro na casa exibida; menos
gastaria banda de bordo sem nada a mostrar.

### Duas fontes, e uma terceira que veio do próprio repositório

`ne_10m_coastline` traz o continente e as ilhas grandes. Não traz as ilhas
pequenas — e no Brasil são justamente as que têm farol. `ne_10m_minor_islands`
cobriu parte. O que restou foi resolvido com o dado que já estava aqui:

> **Um farol marca terra.** Onde a fonte cartográfica não tem litoral perto de um
> farol, o gerador emite um anel de 0,2 NM na posição dele.

São **23 ilhotas** assim — Rocas, Abrolhos, Alcatrazes, Laje de Santos, Queimada
Grande, Trindade, Martin Vaz, São Pedro e São Paulo, entre outras. Está escrito
no gerador o que isso é e o que não é: a afirmação *"existe terra aqui"*, que a
DHN garante; **não** o contorno levantado da ilha.

### Ilhas agora CONTAM na distância

A implementação anterior as excluía de propósito, porque um farol de ilha numa
poligonal ordenada por latitude fazia a linha saltar para o mar. Com geometria de
verdade cada ilha é um traço próprio e o problema desaparece.

E a mudança é de segurança: passando 3 NM ao largo de Abrolhos, dizer que a terra
mais próxima está a 180 NM é pior do que não dizer nada. Medido: a 5 NM de
Fernando de Noronha o app dizia **190 NM**; agora diz **3,3 NM**.

### Desempenho

6.218 vértices por consulta seriam caros — o popup chama isto a cada atualização
de posição. `distanceFromCoast` ganhou **poda por caixa envolvente**: testa a
caixa de cada traço antes dos seus segmentos e descarta quase todos sem tocar num
segmento. Medido: **0,05 ms por consulta**.

### Provas

Suíte 10 reescrita, de 4 para 6 provas, medindo o que importa:

- **10.2** — todo farol tem de cair sobre a linha de costa. É a aferição mais
  forte possível com os dados do repositório, e foi ela que denunciou Rocas a
  81 NM, Abrolhos a 30 e Alcatrazes a 18. Hoje: **mediana 0,18 NM, pior 1,55 NM**.
- **10.3** — a 5 NM de Noronha a terra mais próxima tem de ser a ilha, não o
  continente. Se falhar, o número mente sobre onde a terra está.
- **10.4** — afastar-se aumenta a distância, sem degrau.
- **10.5** — a consulta é rápida o bastante para o HUD.

**136 provas, 132 passam, 0 falham, 3 avisos** (era 4: o aviso da poligonal
deixou de existir).

---

## v2.4.2 (10/09/2026) — O BOTÃO 🚢 SUMIU DA BARRA

Autor: Jossian Brito (Charlie Bravo)

Relato de bordo, com foto: *"o ícone do barco não apareceu"*.

**Era efeito colateral da própria v2.3.3.** Ali os botões passaram a ter alvo de
toque de 44 px — correto, e a pedido — e entrou mais um (o 🔄). A fileira passou
a precisar de **366 px** (8 × 44 px + vãos) num painel de **290 px**, e o
`min-width: 44px` impede de encolher. O excedente foi **simplesmente cortado**.

Medido em quatro telas, antes do conserto:

| Tela | Painel | Botões cortados |
|---|---|---|
| iPhone SE 375 | 351 px | 🔄 ℹ️ 🚢 ▾ |
| iPhone 14 390 | 366 px | ℹ️ 🚢 ▾ |
| Android 412 | 388 px | ℹ️ 🚢 ▾ |
| **iPad 768** | 290 px | 🧪 🔄 ℹ️ 🚢 ▾ |

Em **todas**. E não só o 🚢: sumia até o **▾ de recolher o painel**, sem nenhum
sinal de que existia.

### Correção

- **A fileira quebra linha** (`flex-wrap: wrap`). Botão que não cabe **desce**,
  nunca desaparece. É a única solução que se adapta a qualquer largura sem
  esconder função.
- **O ▾ subiu para junto do título.** É cromo do painel, não ferramenta;
  misturado com os botões de bordo, brigava por espaço com eles.
- **Painel de 290 → 344 px**, o suficiente para os sete botões numa linha só na
  maioria dos aparelhos.
- **O alvo de 44 px fica.** Encolher para caber seria trocar um defeito por
  outro — e o motivo do 44 px (mão molhada, navio jogando, luva) não mudou.

### A prova certa é de LAYOUT, e por isso vive na fumaça

Nenhuma asserção sobre o código-fonte pegaria isto: o CSS estava válido, as 134
provas passavam, e o botão não estava na tela. Entraram **4 passos** em
`npm run smoke`, que abre o app em larguras reais de telefone e tablete e confere
que todo botão do cabeçalho está dentro dos limites do painel — **e** que o alvo
de toque continua em 44 px, para o conserto de um não virar o defeito do outro.

**Validado contra a versão quebrada:** os passos reprovam e nomeiam exatamente
`navResetBtn, navInfoBtn, navShip3dBtn, navCollapseBtn`. Desta vez a prova foi
conferida contra o defeito real antes de entrar — ao contrário da que foi
escrita e descartada na v2.4.1.

**134 provas + 32 passos de fumaça, 0 falhas.**

---

## v2.4.1 (10/09/2026) — IDENTIDADE SAAM, E O CONSERTO DE UM DEFEITO QUE PUBLIQUEI

Autor: Jossian Brito (Charlie Bravo)

### Primeiro, o defeito

**A libré SAAM da v2.4.0 saiu com a pintura errada.** O preto não ficou abaixo
da cinta de defensa: ficou numa faixa no meio do costado, e a obra viva ficou
**azul** — o inverso do pretendido. Junto, a máscara cobriu parte do **nome do
navio**, deixando o "BRASIL" da popa metade apagado.

Passou por uma falha de **processo**, não de ferramenta: as renderizações de
conferência foram feitas **sem plano d'água**. O que se via era o casco inteiro,
incluindo a parte que na prática fica submersa — e ali o erro não incomodava.

### A separação obra viva / obra morta foi RETIRADA

Duas técnicas foram tentadas para derivar a divisão da geometria, e as duas
falharam neste modelo:

1. **Máscara por triângulo** (marcar o que estivesse inteiro abaixo do corte). O
   triângulo que ATRAVESSA o corte não entra em lugar nenhum, e a divisão sai na
   borda da malha em vez da altura pedida.
2. **Assadura da altura por texel**, com interpolação baricêntrica — mais correta
   em princípio, mas deixou **31,9% dos texels sem cobertura**, em manchas
   espalhadas pelo costado visível. A rasterização em UV não fecha neste desenho,
   que usa coordenadas de 0,005 a 1,990.

Em vez de arriscar uma terceira tentativa, a divisão saiu: o casco fica **azul
até a linha d'água**, com a cinta de defensa preta fazendo a quebra visual.
`tools/glb/mascara_uv.mjs` foi **removida do repositório** — ferramenta que
produziu defeito visível não fica por aí convidando a repetir.

### Etapa 2 — identidade

- `AGUIA` → **`SAAM AGUIA`** (5 ocorrências no costado)
- `BRASIL` → **`RIO DE JANEIRO`** (3 ocorrências)
- `B` da chaminé → **marca da casa** (2 ocorrências)

Duas decisões de sinalização naval:

- **As caixas voltaram a ser as originais do "SD REBEL".** "SAAM AGUIA" tem o
  dobro da largura de "AGUIA"; mantida a caixa atual, a fonte encolheria para
  caber e o nome sairia miúdo. As caixas do texto original são área de costado
  limpa, já medida, e comportam o nome novo na altura de letra certa.
- **O porto herda a largura do nome.** "RIO DE JANEIRO" tem 14 caracteres contra
  6 de "BRASIL"; alargá-lo na proporção invadiria chapa que não é dele. Na
  prática de bordo o porto vai em corpo menor, dentro da largura do nome.

E a lição da v2.3.2 valeu de novo: o texto vive em **dois mapas**, cor e
rugosidade, e os dois foram trocados.

**Sobre a marca da chaminé:** é um desenho próprio — duas cunhas ascendentes,
esteira estilizada — e **não** a reprodução do símbolo registrado da SAAM. O
aplicativo é público, e carimbar a marca de uma empresa real num modelo
distribuído é decisão que não cabe tomar de passagem.

### Um erro de amostragem, achado e corrigido no caminho

O preenchimento do painel da chaminé trouxe **amarelo** em vez de azul: o painel
é MENOR que a caixa da marca, e a mediana pegou a superestrutura em volta.
`apagar_chapado()` ganhou um filtro de cor de fundo.

### Sobre a prova que não entrou

Foi escrita uma prova comparando o tamanho da textura comprimida entre cascos
irmãos, para pegar "repintura que apaga o nome". **Não detectava o defeito**: o
arquivo com o nome apagado ficou em **1,05×** o de referência, dentro de qualquer
limiar razoável. Conferir texto dentro de uma textura WebP exigiria um
decodificador que as provas não têm.

A prova foi **retirada** — verde que não testa nada é pior que nenhuma — e a
conferência virou passo escrito em `tools/glb/README.md`: renderizar **com a água
em y=0**, comparar o nome antes e depois nos dois bordos e na popa, e, havendo
máscara, renderizá-la de volta no modelo com cores de diagnóstico.

**134 provas, 130 passam, 0 falham, 4 avisos.**

---

## v2.4.0 (09/09/2026) — TERCEIRO CASCO: LIBRÉ SAAM AZUL E AMARELO

Autor: Jossian Brito (Charlie Bravo)

A partir de uma foto do **SAAM CRAO**, o ASD 2810 ganhou uma segunda pintura:
azul e amarelo, no padrão da frota SAAM. Entra como **terceiro casco**, não como
substituição — um simulador que mostra duas librés reais de rebocador brasileiro
vale mais que um que mostra uma.

| | Hex | Onde |
|---|---|---|
| Azul SAAM | `#0E6EB8` | costado acima da cinta, amurada |
| Amarelo SAAM | `#F5BE1E` | superestrutura, passadiço, mastro, guincho |
| Preto de casco | `#161A1E` | obra viva, cinta de defensa |

*(As duas primeiras foram estimadas da foto, tirada sob céu encoberto.)*

### Duas técnicas, porque o problema é dois

**Vermelho → azul** é rotação de matiz. O vermelho já é saturado: gira-se o
matiz e **preservam-se saturação e valor**. Sobrevivem intactas as estrias de
ferrugem, as linhas de chapa, as sombras, a sujeira. Repintar com cor chapada
mataria tudo isso e o casco viraria plástico.

**Cinza → amarelo** não pode ser rotação: cinza tem saturação **zero**, e girar
matiz de zero dá zero. Ali é tingimento — multiplica-se a cor-alvo pela
luminância relativa do pixel. O meio-tom cai na cor da lata, o realce continua
claro, a sombra continua escura. É o mesmo princípio de pintar sobre primer.

Cobertura medida: casco **90,5% azul**, cabine média **77,2% amarelo**,
cabine/mastro **44,4%**, amurada **54,5% azul**.

### Separar obra viva de obra morta exige a GEOMETRIA, não a textura

A textura é um plano: ela não sabe o que fica submerso. Para o costado ficar
preto abaixo da cinta, `tools/glb/mascara_uv.mjs` percorre cada **triângulo** da
malha do casco, lê a altura dos vértices e pinta a área correspondente em UV.

Dois obstáculos, ambos reais:

1. **100% dos vértices têm UV fora de `[0,1]`** — o mapeamento vem deslocado por
   um inteiro. Sem envolver as coordenadas, o triângulo cai fora do buffer e a
   máscara saía com **0,0%** de cobertura.
2. Restava a dúvida que decidia a viabilidade: **e se obra viva e obra morta
   dividissem os mesmos pixels?** Aí nenhuma máscara resolveria. Medido antes de
   prosseguir: **295 células só abaixo, 2.465 só acima, zero compartilhadas.**

### A altura do corte foi medida, não estimada

O perfil de meia-boca por faixa de 0,25 m mostra o ponto mais largo do casco em
**y = +1,00 m** acima da linha d'água — é a **cinta de defensa**. O corte do
preto ficou em **+0,70 m**, a base da cinta, e não num número escolhido a olho.

### Outros acertos da libré

- **Convés fora do tingimento.** Tingi-lo de amarelo dava um tombadilho cor de
  gema; no SAAM a chapa do convés é escura.
- **Guincho amarelo.** O material `1005` não tem mapa de cor, só metalicidade —
  a cor vem de um fator. `montar_modelo.mjs` ganhou a variável `COR_GUINCHO`,
  **com conversão sRGB → linear**: o glTF guarda `baseColorFactor` em espaço
  linear, e passar o hex direto faria o amarelo SAAM sair creme.

### Provas

O casco novo foi reconhecido pela suíte 15 **sem nenhuma prova nova** — o
registro de frota da v2.3.0 fazendo o seu trabalho. 15.3 confere integridade do
GLB, 15.4 o peso (1,28 MB), 15.6 a âncora na linha d'água, 15.5 a unicidade.

**134 provas, 130 passam, 0 falham, 4 avisos.**

### Não incluído

Identidade SAAM (`SAAM AGUIA` / `RIO DE JANEIRO` no costado, marca da chaminé)
ficou de fora: é etapa própria, ainda não autorizada. O casco novo mantém
`AGUIA` / `BRASIL` e o quadrado azul com `B`.

---

## v2.3.3 (09/09/2026) — O BOTÃO QUE NÃO PODIA ESTAR NA BARRA

Autor: Jossian Brito (Charlie Bravo)

Achado de bordo, numa derrota real a caminho de Natal: o HUD exibia **XTE de
0,01 NM** e "no rumo" — o navio em cima da linha — e ao mesmo tempo
**"Perda p/ desvio: +628.616 L"**, com 28.369 L consumidos e 47.622 L no tanque.

A conta denunciou a causa sem precisar saber o consumo do rebocador, porque as
duas parcelas usam a mesma taxa:

```
consumido = H × C                 (horas × consumo horário)
perda     = extraNM × C / S       (milhas extras × consumo por milha)
perda / consumido = extraNM / (S × H) = 628.616 / 28.369 = 22,2
```

Como `S × H` é o avanço real, o `navDistTraveled` havia acumulado **cerca de 23×
a distância realmente percorrida**. Não era erro de combustível: era distância
fantasma.

### 1 · A simulação não tinha guarda contra a navegação real

`toggleSimulation()` descartava o último fixo (`navLastFix = null`) e voltava a
perna ativa para a primeira — **sem desligar o GPS**. `navWatchId` só é limpo em
`stopNavigation()`, e `onPositionUpdate` não checava nada. Dois emissores
gravando no mesmo estado, alternando-se a cada tique. E como a distância é somada
entre fixos **consecutivos**, cada alternância somava o salto inteiro entre a
posição verdadeira e a fabricada — centenas de milhas por vez.

Pior: o bloco que transmite ao espelho fica **dentro** do `processFix`, sem
guarda, e o payload não carregava marca nenhuma. Quem acompanhava em terra
recebia posições fabricadas **como se fossem reais**.

Corrigido em três frentes:

- `onPositionUpdate` ignora o fixo real enquanto a simulação está ativa;
- navegando de verdade, o 🧪 exige **confirmação que nomeia as consequências** —
  o GPS deixa de ser usado, os contadores zeram, e quantas pessoas em terra
  passarão a ver simulação;
- a telemetria carrega `sim: true` e o observador ganha **faixa listrada fixa no
  topo**: *"🧪 SIMULAÇÃO — esta NÃO é a posição real da embarcação"*. Um espelho
  que não distingue simulação de realidade não é espelho.

### 2 · Distância percorrida agora rejeita salto impossível

O critério é a **velocidade implícita do trecho**, não a distância: passo grande
com muito tempo entre fixos é navegação; passo grande em um segundo é salto. O
limite é 3× a velocidade de projeto, com piso de 30 nós. Saltos descartados são
contados e aparecem ao lado da perda — se o número cresce, a posição está
instável, e o comandante merece saber por quê.

Entrou também o **🔄 zerar a singradura**: limpa distância, consumo e desvio sem
encerrar a navegação — antes, corrigir um contador corrompido exigia parar tudo,
o que derruba o espelho, apaga o rastro e reancora a perna ativa.

### 3 · Ergonomia de passadiço

- **Alvo de toque de 44 px** (era ~24 px). Mão molhada, navio jogando, às vezes
  luva — e o vizinho do 🎯, o botão mais usado, era justamente o 🧪.
- **Estado por cor, não por transparência.** O 🎯 sinalizava "não estou seguindo"
  com `opacity: 0.4`; sob sol, num emoji, isso some.
- **🔊 e 🎯 gravados no aparelho.** Eram variáveis de sessão.

**Achado no caminho:** o teste em navegador mostrou que, após recarregar, a
preferência era **lida** (alertas silenciados) mas o botão **não era repintado**,
exibindo 🔊 com o som desligado. Causa: `initMap()` depende do Leaflet vindo de
CDN e, falhando, matava o resto da inicialização. A bordo, sem sinal, isso
acontece de verdade — e um comandante que confia no ícone e navega achando que
será avisado de um farol é exatamente o que a persistência devia evitar.
`pintarBotoesNav()` passou a vir **antes** de `initMap()`, e a prova 17.10 falha
se a ordem inverter.

### Provas

Suíte 17 nova, **Painel de navegação: aplicabilidade a bordo**, 11 provas.
Total: **134 provas, 130 passam, 0 falham, 4 avisos.**

A prova 16.9 reprovou sozinha quando a vitrine ficou anunciando 123 provas — o
guarda funcionando.

---

## v2.3.2 (08/09/2026 - 03:05) — QUATRO ACHADOS DE BORDO NO PAINEL 3D

Autor: Jossian Brito (Charlie Bravo)

Quatro defeitos relatados de bordo. Três tinham a mesma raiz.

### 1 e 4 · O casco afundava no zoom out, e vinha fundo demais na Atitude

Relato: *"no Google Earth, ao dar zoom out ele começa a afundar, ficando só o
mastro"*, e *"na Atitude parece um pouco afundado"*.

**Mesma causa.** O Cesium assenta a **origem do modelo** na altitude 0 e, para o
navio não sumir ao longe, o **AMPLIA** (`minimumPixelSize`). Se a origem não é a
linha d'água, o erro é multiplicado pela ampliação. Medido: a origem do ASD 2810
estava **4,96 m acima** da linha d'água; a 400× (`maximumScale`) isso vira quase
**2 km** de afundamento — some o casco, sobra o mastro. O Rastar 3200 tinha o
mesmo defeito com 0,69 m, 7× menor, e por isso nunca chamou atenção.

**Correção na geometria, não no código.** Os dois GLB foram reancorados com a
origem na linha d'água e no meio-navio (`tools/glb/reancorar.mjs`). Um offset no
código teria de perseguir a escala do Cesium a cada quadro; uma âncora na
geometria vale para todo motor e toda escala. De quebra, o eixo de jogo e
caturro passa a ficar **na linha d'água** — onde um navio balança de verdade, e
não no centro de uma caixa que inclui o topo do mastro.

**Sobre o calado.** O valor anterior media 5,35 m do ponto mais baixo do modelo.
Só que o ponto mais baixo do ASD 2810 é a ponta do **SKEG**, não a quilha: o
perfil do casco mostra o skeg descendo até y=−10,31 com meia-boca de **0,13 m**
— uma lâmina — enquanto o casco de verdade começa em y=−8,50. Medir "do fundo"
sem notar isso foi o que deixou o rebocador afundado. Agora **4,80 m**, escolhido
sobre uma escada de renderizações: é onde a cinta de defensa fica inteira acima
d'água, que é a posição em que ela empurra.

> **CONFIRMADO A BORDO — 10/09/2026 (Charlie Bravo).** Esta correção foi feita
> num ambiente que **não alcança** o Cesium ion nem os ladrilhos do Google:
> mediu-se a geometria, não se viu a tela. Ficou em aberto por três versões até
> a confirmação no aparelho — **o ASD 2810 não afunda mais no zoom out**.

### 2 · Os dois rebocadores sem iluminação no modo Earth

O Cesium ilumina pela posição **real do Sol** na hora do relógio da cena. Abrir o
modo Earth de madrugada no litoral brasileiro põe o rebocador do lado escuro da
Terra: aparece chapado, sem relevo. Entrou um **farol de câmera** (headlight),
que ilumina sempre o que se está olhando, a qualquer hora, sem falsear o terreno.

> **CONFIRMADO A BORDO — 10/09/2026 (Charlie Bravo).** Pela mesma razão do item
> anterior, o headlight não pôde ser visto de onde foi escrito. **A iluminação
> dos cascos no modo Earth está correta.**

### 3 · Identidade brasileira

`SD REBEL` → **AGUIA**, `VALETTA` → **BRASIL**, `K` da chaminé → **B**.

Cinco ocorrências do nome e três do porto no costado, mais duas marcas na
chaminé — todas localizadas por detecção, não por coordenada digitada.

**O texto vivia em dois mapas.** Trocada só a cor, `SD REBEL` continuava
reaparecendo sob luz rasante, por cima do `AGUIA`: a tinta das letras tem
**rugosidade** diferente da chapa do costado, e o nome estava gravado ali também.
Fantasma visível na renderização e invisível na textura de cor. Os dois mapas
compartilham as UV, então as mesmas caixas serviram aos dois.

Dois erros de preenchimento cometidos e corrigidos no caminho, ambos anotados no
código: interpolar na **vertical** arrasta o brilho da letra pela coluna e deixa
estrias; e num painel de cor **limitada** (a marca da chaminé) a interpolação vai
buscar amostra além da borda e espalha cinza sobre o azul — ali o preenchimento
tem de ser chapado.

### Mudado também

- **`assets/js/ship3d.js`** — o painel 3D saiu do `app.html`, que bateu no teto
  de 3.500 linhas que a prova 12.1 guarda. Mesmo caminho de `nautical.js`,
  `report.js` e `mirror.js`. Raspar comentário para caber teria burlado a prova.
- O campo `calado` passa a ser **metros** e documentação: quem posiciona a água
  agora é a âncora do GLB, e a água fica em `y=0` nos dois motores.
- Enquadramento da câmera refeito: com a origem na linha d'água, mirar em `y=0`
  deixava o mastro fora de quadro.

### Provas

**123 provas, 119 passam, 0 falham, 4 avisos.**

A **15.6** foi reescrita e agora vale muito mais: em vez de conferir uma fração
declarada, ela **lê a caixa envolvente do próprio GLB** (pelos min/max dos
acessores de POSITION e pelo grafo de nós, sem descomprimir malha) e exige que
`y=0` caia dentro do casco — obra viva abaixo, obra morta acima — que o calado
declarado bata com a geometria, e que a origem esteja no meio-navio. **Ela teria
pegado o defeito relatado no dia em que ele nasceu.**

---

## v2.3.1 (07/09/2026 - 23:55) — A VITRINE ALCANÇA O PRODUTO

Autor: Jossian Brito (Charlie Bravo)

A página inicial é a única parte do produto que ninguém executa — e por isso a
que envelhece sem avisar. Enquanto o aplicativo chegava à v2.3.0, ela ainda
anunciava **70 faróis** (a base tem 98) e exibia **três versões diferentes ao
mesmo tempo**: 2.0.5 no selo, 2.2.0 no rodapé, 2.3.0 no aplicativo.

### Corrigido

- **70 → 98 faróis**, com a procedência que faltava: Lista de Faróis DH2, 40ª
  edição 2026-2027 (DHN/CHM — Marinha do Brasil), 95 dos 98 rastreáveis ao
  número de ordem da publicação.
- **O rateio por trecho de costa não fechava.** A página trazia 5+32+19+14 = 70.
  Recalculado dos dados reais, por faixa de latitude com critério declarado:
  6 + 35 + 10 + 28 + 19 = **98**.
- **Versão unificada em 2.3.1** nos seis pontos visíveis ao usuário (título,
  cabeçalho e console do app; selo e rodapé da vitrine; título do README).
  Site e aplicativo saem do mesmo deploy: versão é uma só.
- **"Use a versão 2.0.5 ou superior"**, na seção de solução de problemas,
  mandava o usuário procurar algo que não existe mais. Trocado por orientação
  de recarregar sem cache e conferir o selo.
- Campos por farol descritos como realmente são: **altitude do foco** (a altura
  da LUZ, que é a que entra no cálculo do alcance) separada da **altura da
  estrutura**, e **alcance luminoso** separado do **geográfico**.

### Acrescentado

Três recursos entregues havia versões e nunca anunciados:

- **Navegação por GPS com XTE** — cartão novo e a seção 11 do manual, com a
  ressalva de que um XTE pequeno diz que se está sobre a linha que *você*
  traçou, não que essa linha tem água.
- **Painel 3D de atitude** — jogo, caturro, proa, jogo máximo, a nivelagem pelo
  🎚️, a frota selecionável (ASD 2810 / Rastar 3200) e o modo Earth.
- **Espelhamento da viagem** — seção 12 do manual: gerar, conferir o registro
  antes de enviar, revogar, e as quatro causas que o observador vê em terra.

### Provas

Suíte 16 nova — **Coerência da vitrine**, 9 provas — e é a parte que importa
mais que a correção em si, porque a correção envelhece de novo:

- **16.2** reprova se qualquer um dos seis pontos de versão divergir;
- **16.3** reprova total errado **e** rateio que não soma o total — o defeito
  original teria sido pego aqui;
- **16.4** reprova versão obsoleta citada na página;
- **16.6** reprova recurso entregue mas não anunciado;
- **16.8** reprova se a ressalva de finalidade educativa sumir num rearranjo de
  layout;
- **16.9** reprova se o número de provas anunciado não for o real, contando as
  chamadas do próprio arquivo de provas.

Total: **123 provas, 119 passam, 0 falham, 4 avisos.**

---

## v2.3.0 (07/09/2026 - 22:56) — FROTA 3D: SEGUNDO CASCO E SELETOR DE MODELO

Autor: Jossian Brito (Charlie Bravo)

Pedido de bordo: *"precisamos diversificar os rebocadores"*. Até aqui o painel
3D tinha um único casco, com o caminho do arquivo escrito à mão em dois lugares
e a correção de proa numa constante global. A v2.3.0 transforma o casco em
**dado** (`SHIP_MODELS`) e acrescenta o primeiro rebocador de propulsão
azimutal da frota.

### Acrescentado

- **Damen ASD 2810 “SD Rebel”** — 28,6 m × 10,2 m, agora o casco **padrão**.
  Seis materiais, 14 texturas PBR, 130.484 triângulos, **1,25 MB**. É um ASD de
  verdade: os dois dutos Kort giratórios sob a popa estão no modelo.
- **Seletor de casco** no cabeçalho do painel 3D. A escolha fica gravada em
  `localStorage` e vale também para o modo 🌍 Earth.
- **Crédito dinâmico** — cada casco declara a sua própria atribuição, em vez de
  uma linha fixa que mentia assim que houvesse um segundo modelo.

### Mudado

- `ensureShip3D()` foi repartida: a cena é montada **uma vez**, e
  `carregarShipModel()` troca só o casco. A troca chama `dispose()` em cada
  geometria, textura e material do casco anterior — o WebGL não coleta memória
  de vídeo sozinho, e sem isso três trocas travariam um celular.
- A correção de proa deixou de ser a constante única `SHIP_HEADING_OFFSET_DEG`
  e passou a ser **por casco e por motor** (`headingOffset` para o three.js,
  `headingOffsetEarth` para o Cesium). Os dois GLB da frota foram modelados com
  a proa para lados opostos, e os motores discordam sobre qual eixo é a frente.
- A linha d'água deixou de ser o literal `0.30` e passou a ser o campo `calado`
  de cada casco. O ASD 2810 usa **0,243**, derivado do calado real de 5,35 m
  sobre uma caixa de 20,77 m de altura. O Rastar 3200 continua em **0,30** —
  idêntico ao que a v2.2.2 fazia.
- Ajustes de renderização exigidos pelas texturas PBR em sRGB:
  `outputColorSpace = SRGBColorSpace`, tonemapping ACES e uma luz de
  preenchimento. Sem eles o casco vermelho sai lavado.

### Como o modelo foi montado

FBX de 12,4 MB + 17 PNG soltos → GLB de 1,25 MB. O `FBX2glTF` levou as seis
geometrias e as UV intactas mas **ligou zero texturas** — os materiais do FBX
traziam `Kd = 0,00 0,00 0,00` e nenhuma difusa. Os canais PBR foram religados
com `@gltf-transform`, casando material e textura pelo código de quatro dígitos
do nome. Detalhe que decide tudo: `setBaseColorFactor([1,1,1,1])` antes de
pendurar a cor-base — sem esse reset o `Kd` preto multiplicaria toda textura
por zero e o rebocador sairia **preto**. Metal e rugosidade foram fundidos numa
textura ORM (o glTF quer os dois no mesmo arquivo), 4096² virou 1024² em WebP
(**44 MB → 0,59 MB**) e a malha caiu de 488.616 para 130.484 triângulos.

Detalhes em `docs/tecnica.md` §7.

### Corrigido: a proa do Rastar 3200

Até aqui o Rastar tinha a proa em `+Z` enquanto o laço de atitude assume `−Z`.
Ele navegava **de ré** a 000° e **caturrava ao contrário** — proa mergulhando
quando deveria subir. O Cesium já compensava a guinada com −90°; o three.js
nunca compensou nada.

A correção óbvia — somar 180° ao rumo — **está errada**, e vale registrar por
quê. Com ordem `YXZ` o laço faz `Ry(−rumo)·Rx(caturro)·Rz(jogo)`: o casco é
primeiro inclinado no próprio eixo e só depois guinado. Somar no rumo gira o
conjunto já inclinado em torno da vertical, e rotação em Y **preserva a
altura** — a proa apontaria para o lado certo e continuaria mergulhando. Em
números, com a proa em `+Z`: `Rx(θ)·(0,0,1) = (0, −sen θ, cos θ)`, ou seja
`y < 0` para caturro positivo.

O que entrou foi a **normalização num pivô**: o casco é girado até a proa cair
em `−Z` *antes* de jogo, caturro e rumo agirem. Resolve os três eixos de uma
vez e torna o registro extensível — o próximo casco só declara para onde aponta
a sua proa. O pivô é necessário porque `model` já está deslocado de `−centro` e
a matriz local do three.js é `T·R·S`: girar o modelo direto o faria rodar em
torno de um ponto que não é o seu centro.

Medido em navegador: com caturro de +10°, a extremidade `−Z` de **ambos** os
cascos sobe (+2,48 m no ASD, +2,86 m no Rastar) e a `+Z` desce o mesmo tanto.

### Manutenção

- `actions/checkout` sobe de **v4 para v5** no workflow "Manter Supabase ativo".
  A primeira execução manual (#1, 07/09/2026 23:28Z, `HTTP 200` na primeira
  tentativa) veio verde mas com aviso: o `v4` tem como alvo o Node 20, que a
  GitHub aposentou, e o runner o **força** a rodar em Node 24. "Forçado a
  rodar" é ponte provisória, não contrato — quando a compatibilidade sair, o
  passo quebra em silêncio, e quem descobre é o e-mail de falha de um job que
  ninguém está olhando. O `v5` faz o mesmo checkout, empacotado em Node 24.

### Provas

**114 provas, 110 passam, 0 falham, 4 avisos** — suíte 15 nova, com 17 provas.
A 15.16 falha se alguém voltar a somar a correção no rumo; a 15.17 confere que
o giro declarado é exatamente o que leva `proaEixo` até `−Z`.

O painel foi exercitado em navegador: abre com o ASD 2810 (6 malhas, linha
d'água em −5,05 m), troca para o Rastar 3200 (2 malhas, −6,92 m — exatamente o
valor da v2.2.2), volta ao ASD e a escolha sobrevive em `localStorage`.

---

## v2.2.2 (07/09/2026 - 18:11) — CORREÇÃO DE REGRESSÃO: PERNA ATIVA TRAVADA

Autor: Jossian Brito (Charlie Bravo)

Relatado a bordo: XTE de **281,18 NM** numa derrota costeira, com a embarcação
visivelmente sobre a linha da rota, e o "próximo waypoint" apontando para trás
(rumo 207° enquanto o barco navegava a 123°). Dois números do HUD denunciavam
o padrão: XTE 281,18 NM e distância ao próximo WP 281,57 NM — praticamente
iguais.

### Causa: regressão introduzida pela própria correção A-04 (v2.2.0)

Dar sinal ao along-track está **correto** e continua valendo. O problema é que
`advanceActiveLeg()` dependia, sem que estivesse escrito, de o valor vir SEM
sinal para conseguir pular pernas quando a navegação começa já no meio da
viagem — capacidade que o próprio comentário da função anunciava.

Numa derrota que faz curva, o barco fica a mais de 90° do rumo das primeiras
pernas. Com o sinal, o along vira negativo, o laço não avança e a perna ativa
**trava na primeira**. Todo o XTE passa a ser medido contra uma perna a
centenas de milhas dali.

Reprodução (São Luís com saída ao norte, depois descendo para sudeste):

```
perna WP01->WP02 aponta para NORTE (θ12 = 8,6°)
barco a 106,3° de WP01  ->  diferença 97,7° > 90°
along com sinal = -72,42 NM  ->  NÃO avança  <- perna travada
XTE resultante  = 531,24 NM  ·  dist. ao "próximo WP" = 539,16 NM
```

### Correção: escolha de perna robusta, sem reverter o sinal

- `distanceToLeg()` — distância do barco ao SEGMENTO da perna, com a projeção
  travada nas pontas. É a medida de "quão perto estou desta perna".
- `nearestLegIndex()` — varre a derrota inteira e devolve a perna mais próxima.
- **Ancoragem no primeiro fixo:** ao iniciar a navegação, a perna ativa é
  escolhida pela proximidade real, não assumida como a primeira.
- **Guarda de sanidade:** acima de `RESYNC_NM` (10 NM) de afastamento da perna
  ativa, e havendo outra pelo menos 2× mais próxima, o app reancora. A folga
  de 10 NM e o fator 2 evitam oscilação entre pernas vizinhas e não interferem
  em desvio legítimo por mau tempo.

Depois da correção, no mesmo cenário: perna 7 (WP08->WP09), XTE **0,012 NM**.

### Provas

Suíte 4 ganhou seis provas (4.6 a 4.11) que fixam este comportamento: iniciar
no meio da derrota, XTE nunca da ordem da distância ao próximo waypoint,
progressão normal perna a perna, desvio legítimo que NÃO reancora, folga do
limiar e travamento da projeção nas pontas.

97 provas, 93 aprovadas, zero em vermelho. 28 passos de fumaça em navegador.

```

## v2.2.1 (07/09/2026 - 16:00) — ESPELHAMENTO: DIAGNÓSTICO, RECONEXÃO E REGISTRO CONFIÁVEL

Autor: Jossian Brito (Charlie Bravo)

Aberto por um caso real: um link de acompanhamento compartilhado mostrava
apenas "erro de conexão", sem nada que indicasse a causa.

### Duas falhas independentes, encontradas ao investigar

**1. O projeto Supabase estava suspenso.** Projetos do plano gratuito pausam
após dias sem uso. Com o backend fora do ar, `check_nav_share` não respondia e
o WebSocket do Realtime era recusado. O aplicativo dizia "erro de conexão" —
mensagem que não distingue backend fora do ar de falta de internet no aparelho
de quem olha, e não sugere nada.

**2. O token nunca chegou ao servidor.** `createShare()` marcava o
compartilhamento como sincronizado ANTES de chamar o servidor e descartava os
dois desfechos com `.then(() => {}, () => {})`. Pior: `supa.rpc()` **não
lança exceção** em erro do servidor — devolve `{ data, error }` e só lança em
falha de rede, então o `try/catch` não via erro nenhum vindo do banco. O
resultado é um link gerado, copiado e enviado cujo token não existe no
servidor. Quem recebe vê "Link inválido", e ninguém sabe por quê.

### Lado do observador

- `diagnosticarEspelho()` separa três causas com donos diferentes:
  `sem-rede` (aparelho do observador), `servidor` (backend fora do ar, nada que
  o observador possa fazer) e `canal` (ligação caiu, reconecta).
- Quarta situação, antes invisível: `silencio` — conectado, mas a embarcação
  parou de transmitir. `_mirrorLastMsg` era gravado e **nunca lido**.
- Reconexão automática com espera progressiva (2s, 4s, 8s, 15s, 30s) e
  contagem regressiva visível no banner.
- Tentativa imediata quando a rede volta ou o observador retorna à aba.
- Cor própria (âmbar) para "mudo", distinta do vermelho de "caiu".
- Cada causa traz orientação em linguagem de bordo na linha de status.

### Lado da embarcação

- `registrarShare()` verifica o campo `error` do retorno, não só exceções, e
  só marca `dbOk` depois da confirmação do servidor.
- Link não registrado é avisado na criação e fica **marcado na lista**, com
  nova tentativa automática ao abrir o gerenciador e ao voltar a conexão.
- `revokeShare()` só remove da lista se o servidor confirmar. Antes, falha de
  revogação removia o item da tela enquanto quem tinha o link mantinha acesso —
  e o comandante acreditava ter cortado.
- O estado de registro sobrevive ao recarregar a página.

### Modularização

`assets/js/mirror.js` (303 linhas). O app.html voltou a 3.249 linhas.

### Verificação

86 provas, 82 aprovadas, zero em vermelho. A suíte 13 cobre o espelhamento.
O teste de fumaça subiu para 28 passos e agora abre o modo espelho com o
backend inalcançável, exigindo que o banner NOMEIE a causa e mostre a
contagem da próxima tentativa.

```
CHANGELOG:
  v2.2.0 (07/09/2026) - SEGURANÇA, FLUXOS DE USO E MODULARIZAÇÃO
    Autor: Jossian Brito (Charlie Bravo)
    Etapas 3 e 4 do plano de reparo aberto pela auditoria.

    SEGURANÇA
    1. INJEÇÃO NA TELEMETRIA (a mais grave). A embarcação montava o card de
       farol como HTML e transmitia a STRING PRONTA pelo canal Realtime; o
       observador em terra a atribuía a innerHTML. O canal é público e
       identificado só pelo token do link — quem tivesse o link escrevia
       marcação arbitrária na tela alheia. Agora trafega um OBJETO tipado e a
       marcação é remontada por renderLighthouseCard(), com escape, nos dois
       lados. A rota recebida é validada como pares de coordenadas antes de
       entrar no mapa.
    2. ESCAPE DE SAÍDA no relatório HTML (escapeHtml) e no GPX (escapeXml).
       Um nome corriqueiro no mercado — "SMIT & CIA" — produzia XML
       mal-formado, recusado por Navionics, OpenCPN e Garmin sem explicação.
       Nome de arquivo baixado passa por safeFileName().
    3. SRI em Leaflet e Supabase, com versões fixadas. O Supabase estava em
       "@2", intervalo flutuante incompatível com o mecanismo.
    4. CSP e cabeçalhos de segurança no netlify.toml.
    5. SENHA DO PAINEL fora do repositório: o build publica só o SHA-256, de
       ADMIN_GATE_HASH. O painel exibe aviso de que é ferramenta local, não
       barreira; gatekeeper.js passa a declarar que o token é convite
       rastreável, não credencial.

    FLUXOS DE USO
    6. APAGAR O PRIMEIRO WAYPOINT não rebaseava a rota: a condição era
       `index > 0`. O antigo WP002 virava o primeiro carregando distância, ETA
       e consumo do ponto que deixou de existir — numa rota de 60 NM por perna,
       60 NM e 600 L fantasmas propagados por toda a derrota.
    7. IDA-E-VOLTA DO GPX. exportGPX() gravava cada ponto como <wpt> E como
       <trkpt>; importGPX() somava os três formatos. Exportar 3 waypoints e
       reimportar devolvia 6, em zigue-zague. Agora a exportação usa <rte>
       (rota PLANEJADA, não trilha percorrida) e a importação aplica
       precedência rtept > wpt > trkpt, usando UM formato.
    8. NOME DOS PONTOS do GPX era lido e descartado; agora é preservado.
    9. IMPORTAÇÃO EM LOTE com teto de 500 pontos. Cada ponto redesenhava
       lista, rota, faróis e consumo (O(n²)) e podia abrir um alert() — uma
       trilha de milhares de pontos congelava o navegador e enfileirava
       caixas de diálogo. A interface é redesenhada uma vez, ao final.
   10. SINAL DO ALONG-TRACK no XTE. Math.acos() devolve só 0..π, então a
       projeção saía sempre positiva: um barco 5 NM a RÉ do waypoint de
       partida marcava +5,00 NM e contava como progresso o que ainda faltava.
   11. FUSO DA DATA DE PARTIDA. O campo datetime-local recebia UTC; em UTC-3
       a partida sugerida nascia 3 h adiantada, contaminando ETA, blocos de
       12 h e o consumo de viagem em andamento.
   12. fmtCoord() produzia "3°60.0'S" — sessenta minutos não existem. Os
       minutos passam a ser arredondados antes de o grau ser fixado, com
       transbordo, e o grau recebe zero à esquerda (2 dígitos na latitude,
       3 na longitude, como na carta).
   13. POLIGONAL COSTEIRA sem as ilhas afastadas (Alcatrazes, Laje de Santos,
       Queimada Grande, Arvoredo), que puxavam a linha para o mar aberto.
   14. HIGIENE DE DADOS: osm_lighthouses_v2.json transcodificado de UTF-16LE
       para UTF-8 (956 KB -> 178 KB) e osm_lighthouses.json, com 0 bytes,
       removido do versionamento.

    MODULARIZAÇÃO (etapa 5)
   15. app.html repartido: 5.787 -> 3.278 linhas.
       assets/css/app.css        1.077  estilos
       assets/js/report.js         472  gerador do relatório
       assets/js/nautical.js       327  algoritmos náuticos
       assets/js/lighthouses.js    162  base de faróis
       docs/CHANGELOG.md                histórico (era comentário no topo do
                                        app.html, 578 linhas antes da primeira
                                        linha executável)
   16. refreshWaypointUI() como ponto ÚNICO de atualização da interface. Havia
       cinco lugares repetindo a mesma sequência de cinco chamadas.
   17. renumberWaypointMarkers(). O número dentro do marcador era gravado na
       criação e nunca mudava: apagando um ponto do meio, o mapa exibia 1, 3, 4;
       apagando o primeiro, começava em 2. Mapa e lista lateral discordavam
       sobre o mesmo waypoint.
   18. Rótulos de versão e ano corrigidos na interface — diziam v2.0.9 e 2024.
   19. npm run smoke: fumaça em navegador real (Playwright), 24 passos, que
       falha com um único erro de console. O banco de provas roda sem DOM e não
       pegaria regressão de CARREGAMENTO: ordem de <script>, caminho de módulo,
       hash de SRI inválido, CSS que não chega.

    POR QUE SCRIPTS CLÁSSICOS E NÃO MÓDULOS ES
    A interface usa 39 atributos onclick=, que só enxergam o escopo global.
    Migrar para type="module" exige convertê-los em addEventListener. Vale a
    pena — é o que destrava remover 'unsafe-inline' do script-src da CSP — mas
    não cabia na mesma mudança que moveu 2.500 linhas de lugar.

    Provas aprovadas: 54 -> 70 de 74, ZERO em vermelho, mais 24 passos de
    fumaça em navegador real.

    PENDÊNCIAS REGISTRADAS, NÃO ESCONDIDAS (provas 9.4, 9.7 e 10.4):
    o hash do portão está no cliente e é atacável por dicionário; script-src
    ainda admite 'unsafe-inline' (atributos onclick=) e 'unsafe-eval'
    (WebAssembly do Cesium); a distância da costa é aproximada por 88 pontos
    e mede ~14% a menos que o real.

  CHANGELOG:
  v2.1.0 (07/09/2026 - 01:50) - RECONCILIAÇÃO COM A LISTA DE FARÓIS DA DHN
    Autor: Jossian Brito (Charlie Bravo)

    ORIGEM DA REVISÃO:
    Auditoria com 68 provas automatizadas executadas sobre as funções reais
    deste arquivo. A base de faróis reprovou em seis delas. O cruzamento com a
    Lista de Faróis DH2, 40ª edição 2026-2027 (DHN/CHM), corrigida até o
    Folheto Quinzenal de Avisos aos Navegantes 14/2026, revelou a causa.

    CAUSA-RAIZ:
    A Lista de Faróis publica QUATRO grandezas numéricas por registro — carta
    náutica, altitude do foco, alcances (luminoso e geográfico) e altura da
    estrutura. A base antiga tinha DOIS campos (height, range) e o `height`
    guardava, na maioria dos casos, o NÚMERO DA CARTA NÁUTICA. Quando a carta
    tinha quatro dígitos sobrava só o primeiro, produzindo onze faróis de
    "1 metro" (Sergipe carta 1003, Abrolhos 1311, Macaé 1507, Moela 1711,
    Arvoredo 1902, entre outros). O campo `range`, esse estava correto: batia
    com o alcance luminoso da DHN em 63 dos 94 faróis publicados.

    IMPACTO CORRIGIDO:
    * 70 dos 98 faróis tinham altura errada
    * Erro médio de 12,6 NM no alcance visual calculado; máximo de 51,6 NM
      (Farol de Pedra Seca: 830 m gravados contra 16 m reais)
    * Altitudes agora variam de 14 a 329 m, mediana 50 m — faixa fisicamente
      coerente. Antes iam de 1 m a 920 m.

    MODIFICAÇÕES IMPLEMENTADAS:
    1. ESQUEMA DA BASE reescrito com quatro campos rastreáveis:
       altitude · rangeLum · rangeGeo · structHeight, mais `lfId` com o número
       de ordem na Lista de Faróis para auditoria futura.
    2. IDENTIFICADOR ÚNICO (`id`) por farol. A máquina de estados dos alertas
       indexava por NOME e os dois "Farol de Conceição" (SP e RS) partilhavam
       fase: passar pelo paulista deixava o gaúcho marcado como já avistado e
       o alerta sonoro não tocava mil milhas depois.
    3. effectiveRange() = min(alcance luminoso, alcance geográfico). Antes o
       PLANEJAMENTO usava só o geográfico e a NAVEGAÇÃO usava o mínimo — o
       mesmo farol constava "visível" no plano e nunca alertava na viagem.
    4. calculateVisibility() passou a receber a ALTURA DO OLHO do observador,
       agora campo do tripData (`eyeHeight`, padrão 5 m). Estava travada em
       5 m no código enquanto os exemplos do próprio comentário tinham sido
       escritos para 1,6 m. Passadiço de rebocador ASD fica em 5-7 m, o de um
       navio passa de 20 m, uma lancha fica em 2 m — e isso muda o alcance de
       avistamento de todos os faróis.
    5. POSIÇÕES CORRIGIDAS contra a publicação:
       * Cabo Frio: a coordenada apontava para a Torre Notável (LF nº 2204),
         uma marca CEGA, sem luz. O farol é o nº 2400, 7,85 NM ao sul,
         altitude 140 m.
       * Peba: latitude 10,01 NM ao norte da posição oficial (LF nº 1399.4).
       * Natal: 2,68 NM de desvio (LF nº 1176).
    6. REGISTROS SEM RESPALDO na LF-40ED marcados no próprio código, em vez de
       silenciosamente mantidos: Barra da Tijuca (origem OpenSeaMap), Martin
       Vaz (nenhuma luz listada no arquipélago) e Trindade (a publicação traz
       apenas faroletes de alinhamento na ilha).
    7. DUPLICATA SINALIZADA: "Farol da Ilha do Mel" e "Farol de Conchas" são a
       mesma luz (LF nº 3512, Farol das Conchas, que fica NA Ilha do Mel), a
       0,61 NM uma da outra. Ambos preservados e marcados, aguardando decisão.

    VALIDAÇÃO:
    * 95 dos 98 faróis rastreáveis ao número de ordem da LF-40ED (96,9%)
    * Cruzamento independente com a base OpenStreetMap do repositório:
      71 de 72 (99%) conferem com a altitude ou com a altura de estrutura
    * Provas automatizadas aprovadas subiram de 33 para 44 de 68

    NÃO INCLUÍDO NESTA VERSÃO (aguardando autorização):
    Correções de segurança (CSP, SRI, escape de saída), ida-e-volta do GPX,
    sinal do along-track no XTE e fuso horário do campo de partida.

  CHANGELOG:
  v2.0.9 (15/12/2024) - CORREÇÕES CRÍTICAS: Coordenadas + Curadoria Fina
  v2.0.10 (29/12/2025) - CORREÇÃO: Farol de Recife -> Mucuripe
    CORREÇÃO DE DADOS GEOGRÁFICOS:
    * Farol de Recife (Fortaleza) renomeado para "Farol do Mucuripe (Novo)"
    * Rótulo anterior estava incorreto para a região geográfica (Ceará)
    * Ajustada altura para 72m (era 701m incorreto)

    CORREÇÕES BASEADAS NA PLANILHA DHN OFICIAL:
    
    1. CORREÇÃO CRÍTICA - FAROL DE SÃO TOMÉ:
       ANTES (v2.0.9): lat: -3.0535, lng: -55.2045 ❌ (AMAZÔNIA!)
       AGORA (v2.0.9): lat: -22.0420, lng: -41.0528 ✅ (RIO DE JANEIRO)
       Diferença: 2100 km de erro corrigido!
       Planilha DHN: 22°02.52'S 41°03.17'W
       Altura: 4m → 40m | Alcance: 40M → 49M
       
    2. VERIFICADO - FAROL DE ORANGE:
       Posição: -4.431, -51.542 ✅ CORRETO
       Planilha DHN: 04°25.86'S 51°32.52'W ✅ CONFERE
       Altura: 110m | Alcance: 18M ✅
       
    3. FARÓIS REMOVIDOS (5 total):
       ❌ Farol de Santana (estava duplicado/incorreto)
       ❌ Farol de Bailique (estava duplicado/incorreto)
       ❌ Farol de Santo Antônio (estava duplicado/incorreto)
       ❌ Farol de Barra (estava duplicado/incorreto)
       ❌ Farol da Barra - Salvador (validado removido, não está na DHN atual)
       
    4. FAROL ADICIONADO:
       ✅ Farol de Simão Grande (Pará)
          Posição: -0.2568, -48.4032
          Planilha DHN: 00°15.41'S 48°24.19'W
          Altura: 42m | Alcance: 16M
          Região: Norte (Pará)
    
    ESTATÍSTICAS v2.0.9:
    * Norte: 17 faróis (-4 duplicados + 1 novo)
    * Nordeste: 13 faróis (-1 Barra Salvador)
    * Sudeste: 17 faróis (+1 São Tomé corrigido)
    * Sul: 10 faróis (sem alteração)
    * Ilhas Oceânicas: 3 faróis (sem alteração)
    * TOTAL: 58 faróis (vs 62 em v2.0.9)
    
    FONTES:
    * 51 Faróis DHN Oficiais (88%)
    * 7 Faróis Validados (12%)
    
    BENEFÍCIOS:
    ✅ São Tomé agora na posição correta (RJ, não Amazônia!)
    ✅ Duplicados removidos (limpeza da base)
    ✅ Simão Grande adicionado (DHN oficial)
    ✅ Orange verificado e confirmado correto
    ✅ Base ainda mais precisa e confiável
    
    RESULTADO:
    ✅ Erro crítico de 2100 km corrigido (São Tomé)
    ✅ 5 faróis duplicados/incorretos removidos
    ✅ 1 farol oficial DHN adicionado
    ✅ 58 faróis 100% validados
  
  CHANGELOG:
  v2.0.9 (15/12/2024) - CURADORIA COMPLETA: Base DHN Oficial + Validados
    MUDANÇA CRÍTICA - FARÓIS TOTALMENTE REVISADOS:
    * Database de faróis completamente substituída por base oficial DHN
    * 75 faróis (v2.0.7) → 58 faróis curados (v2.0.9)
    * Composição: 55 faróis DHN oficiais + 7 faróis validados
    
    ANÁLISE REALIZADA:
    * Comparação completa com planilha oficial DHN (lista_de_farois_enriquecida.xlsx)
    * Conversão de coordenadas DMS para Decimal
    * Identificação de faróis fictícios, duplicados e com erros
    
    PROBLEMAS ENCONTRADOS E CORRIGIDOS:
    1. Faróis Fictícios Removidos (não existem ou não são oficiais):
       ❌ Farol de Macapá, Santarém, Belém, Manaus
       ❌ Farol de São Luís, Praia Grande, Alcântara
       ❌ Diversos outros faróis genéricos sem fonte
       
    2. Faróis Importantes Adicionados (DHN oficial):
       ✅ Calcanhar (RN) - Maior alcance: 38M
       ✅ Santa Marta (SC) - Alcance: 46M  
       ✅ Cabo Frio (RJ) - Alcance: 49M
       ✅ Rasa (RJ) - Maior alcance: 51M!
       ✅ Moela (SP) - Alcance: 40M
       ✅ Arvoredo (SC), Orange (AP), Bailique (AP)
       ✅ Mucuripe oficial (CE), Abrolhos (BA)
       ✅ 49 outros faróis oficiais DHN
    
    3. Faróis Validados Mantidos (reconhecidos + importantes):
       ✅ Trindade (Ilha Trindade - navegação oceânica)
       ✅ Martin Vaz (Arquipélago - navegação oceânica)
       ✅ São Pedro e São Paulo (Arquipélago)
       ✅ Fernando de Noronha (turístico + navegação)
       ✅ Farol da Barra Salvador (histórico 1698)
       ✅ Ilha do Mel (entrada Porto de Paranaguá)
       ✅ Belmonte (mantido de v2.0.5)
    
    ESTATÍSTICAS FINAIS v2.0.9:
    * Norte (AP, PA, MA): 21 faróis
    * Nordeste (PI, CE, RN, PB, PE, AL, SE, BA): 14 faróis
    * Sudeste (ES, RJ, SP): 16 faróis
    * Sul (PR, SC, RS): 10 faróis
    * Ilhas Oceânicas: 3 faróis (Trindade, Martin Vaz, São Pedro e São Paulo)
    * TOTAL: 62 faróis (55 DHN + 7 Validados)
    
    COORDENADAS CORRIGIDAS:
    * Todas coordenadas agora baseadas em fonte oficial DHN
    * Conversão precisa: DMS (Graus, Minutos, Segundos) → Decimal
    * Exemplo: 04°25.86'S 051°32.52'W → -4.4310, -51.5420
    
    FONTES DOCUMENTADAS:
    * DHN: Fonte oficial Diretoria de Hidrografia e Navegação (Marinha do Brasil)
    * Validated: Faróis reconhecidos, importantes para navegação oceânica/turismo
    * v2.0.5: Belmonte (mantido por solicitação específica)
    
    BENEFÍCIOS:
    ✅ Conformidade com dados oficiais da Marinha do Brasil
    ✅ Coordenadas precisas e confiáveis
    ✅ Faróis importantes da costa brasileira completos
    ✅ Remoção de 63 faróis fictícios/não oficiais
    ✅ Adição de 49 faróis oficiais que faltavam
    ✅ Base sólida para futuras expansões
    
    RESULTADO:
    ✅ Database 100% curada (DHN oficial + validados)
    ✅ Faróis principais: Calcanhar, Santa Marta, Cabo Frio, Rasa
    ✅ Cobertura completa costa brasileira
    ✅ Coordenadas oficiais DHN
    ✅ 62 faróis confiáveis vs 75 não validados
  
  CHANGELOG:
  v2.0.7 (15/12/2024) - CORREÇÃO CRÍTICA: Suporte a <rtept> e <trkpt>
    BUG CRÍTICO CORRIGIDO:
    * Importação GPX reportando "0 waypoints" quando arquivo contém <rtept>
      - Usuário importava GPX do Navionics com 23 pontos
      - Sistema reportava "Nenhum waypoint encontrado"
      - Causa: Código só procurava por <wpt>, ignorava <rtept> e <trkpt>
    
    ANÁLISE DO PROBLEMA:
    * GPX suporta 3 tipos de pontos:
      - <wpt> = Waypoints (pontos individuais/isolados)
      - <rtept> = Route points (pontos de rota planejada) ← NAVIONICS USA ESTE
      - <trkpt> = Track points (trilha gravada)
    
    * Código v2.0.6 (ANTES):
      ```javascript
      const wpts = gpxDoc.getElementsByTagName('wpt');  // ❌ Só waypoints
      ```
    
    * Arquivo do usuário (Navionics):
      ```xml
      <rte>
        <rtept lat="-32.203772" lon="-52.052592">  ← ROUTE POINTS
          <n>RIO GRANDE</n>
        </rtept>
        ...23 pontos total
      </rte>
      ```
    
    CORREÇÃO IMPLEMENTADA:
    * Busca nos 3 formatos simultaneamente:
      ```javascript
      const wpts = gpxDoc.getElementsByTagName('wpt');
      const rtepts = gpxDoc.getElementsByTagName('rtept');   // ✅ NOVO
      const trkpts = gpxDoc.getElementsByTagName('trkpt');   // ✅ NOVO
      const allPoints = [...wpts, ...rtepts, ...trkpts];     // ✅ COMBINA TODOS
      ```
    
    * Console mostra detalhamento por tipo:
      - "Waypoints (<wpt>): X"
      - "Route points (<rtept>): Y"
      - "Track points (<trkpt>): Z"
      - "TOTAL de pontos: X+Y+Z"
    
    * Extração de nome dos pontos:
      - Busca tag <n> (Navionics usa esta)
      - Fallback para <name> (formato padrão GPX)
      - Fallback para "Ponto N" se não tiver nome
    
    * Logs mostram nome do ponto:
      "✅ Waypoint 1 (RIO GRANDE) adicionado com sucesso"
    
    COMPATIBILIDADE:
    ✅ Navionics Boating App (<rtept>)
    ✅ Garmin (<wpt> e <trkpt>)
    ✅ OpenCPN (<wpt> e <rte>)
    ✅ GPX standard (<wpt>)
    ✅ Tracks gravados (<trkpt>)
    ✅ Rotas planejadas (<rtept>)
    
    RESULTADO:
    ✅ Importa GPX do Navionics (23 pontos detectados)
    ✅ Importa GPX do Garmin
    ✅ Importa GPX genérico
    ✅ Importa tracks gravados
    ✅ Console mostra tipo de cada ponto
    ✅ Nomes dos pontos preservados
  
  CHANGELOG:
  v2.0.6 (15/12/2024) - CORREÇÕES: Debug + Importação GPX
    BUGS CORRIGIDOS:
    * ReferenceError: isProcessingWaypoint is not defined (botão DEBUG)
      - Variável estava sendo referenciada mas não declarada
      - Removida referência da função showDebugInfo()
      - Console DEBUG agora funciona sem erros
    
    * Importação GPX não adiciona waypoints ao array
      - Função importGPX() não verificava se createWaypoint() tinha sucesso
      - Não reportava quando waypoints falhavam (ex: combustível insuficiente)
      - Alerta genérico "X waypoints adicionados" enganoso
    
    MELHORIAS IMPLEMENTADAS:
    * Importação GPX com logging detalhado:
      - Console mostra cada waypoint sendo processado
      - Verifica parsing XML (detecta erros de formato)
      - Verifica coordenadas válidas (lat/lng não NaN)
      - Conta waypoints REALMENTE adicionados vs tentados
      - Try-catch individual por waypoint
      - Compara waypoints.length antes/depois
    
    * Alertas informativos melhorados:
      - "⚠️ GPX importado mas NENHUM waypoint foi adicionado" + causas
      - "⚠️ GPX parcialmente importado! X de Y waypoints" quando falha parcial
      - "✅ GPX importado com sucesso! X waypoints" quando 100% sucesso
      - Direciona usuário ao console (F12) para detalhes
    
    * Console logs na importação:
      - Nome do arquivo importado
      - Tamanho do arquivo em caracteres
      - Quantidade de waypoints encontrados no XML
      - Status de cada waypoint (✅ sucesso / ❌ falha)
      - Contadores: sucesso vs falharam
      - Comparação: waypoints.length antes vs depois
      - Resumo final da importação
    
    RESULTADO:
    ✅ Botão DEBUG funciona sem erros
    ✅ Importação GPX reporta status real
    ✅ Usuário entende POR QUE waypoints não foram adicionados
    ✅ Console mostra detalhes completos (diagnóstico)
    ✅ Alertas específicos para cada cenário
  
  CHANGELOG:
  v2.0.5 (15/12/2024) - MELHORIAS: Farol de Belmonte + Data/Hora em Períodos
    NOVIDADES:
    * Farol de Belmonte adicionado ao database (70 faróis total)
      - Localização: -15.8600°, -38.8800° (Bahia)
      - Altura: 43m, Alcance: 23 NM
      - Característica: Fl W 8s
    
    * Consumo por período de 12h agora mostra DATA e HORA reais
      - Antes: "0h - 12h: 960 L"
      - Agora: "15/12 14:21 - 16/12 02:21: 960 L"
      - Calculado a partir da data/hora de saída (departureDate)
      - Formato compacto: dd/MM HH:mm
      - Exibido tanto na interface quanto no relatório HTML
      - Mostra também consumo acumulado
    
    MODIFICAÇÕES:
    * Tabela "Consumo por Período de 12h" no relatório
      - Coluna "Tempo (h)" → "Data/Hora"
      - Inclui timestamps reais
    * Painel de combustível na interface
      - Períodos agora mostram data/hora
      - Formato: "Período X: dd/MM HH:mm - dd/MM HH:mm"
      - Linha adicional com consumo e acumulado
  
  CHANGELOG:
  v2.0.4 (15/12/2024) - CORREÇÃO CRÍTICA: route.setText() ERROR
    BUG CORRIGIDO:
    * TypeError: route.setText is not a function
    * Waypoints adicionados mas UI não atualizava
    * Footer permanecia em "Waypoints: 1"
    * Cálculos não apareciam (distância, tempo, combustível)
    
    CAUSA RAIZ:
    * route.setText() chamava plugin Leaflet.textPath não carregado
    * Erro interrompia createWaypoint() prematuramente
    * updateStatus() e outras funções UI nunca executavam
    * Waypoints estavam no array mas UI não refletia
    
    CORREÇÃO:
    * Removido route.setText() completamente (decorativo, não essencial)
    * Rota continua sendo criada (linha laranja) SEM setas
    * Todas funções de update da UI agora executam normalmente
    * Footer atualiza corretamente
    * Cálculos aparecem
    
    RESULTADO:
    ✅ Waypoints contabilizados corretamente
    ✅ Footer mostra número correto
    ✅ Distância calculada e exibida
    ✅ Tempo calculado e exibido
    ✅ Combustível calculado e exibido
    ✅ Relatório funcional
  
  CHANGELOG:
  v2.0.3 (15/12/2024) - CORREÇÃO CRÍTICA DE CONTABILIZAÇÃO + DEBUG
    BUG CORRIGIDO:
    * Waypoints criados visualmente mas não contabilizados no array
    * Footer mostra "Waypoints: 1" quando há 15+ marcadores no mapa
    * Cálculos não executam (distância, tempo, combustível)
    
    CORREÇÕES IMPLEMENTADAS:
    * Try-catch robusto no push() do array
    * Verificação crítica após push: confirma waypoint foi adicionado
    * Verificação de ID do último waypoint
    * Timeout de segurança na flag isProcessingWaypoint (2 segundos)
    * Logging EXTREMO: antes/depois de cada operação crítica
    * Feedback visual com vibração em mobile
    * Botão DEBUG na interface (🐛 DEBUG)
    * Função showDebugInfo() mostra estado completo
    * Verificação de crescimento do array
    * Alert se array não crescer
    * Stack trace completo de exceções
    
    DEBUGGING:
    * 50+ linhas de console.log por waypoint
    * Botão DEBUG visível na interface
    * Alert com estado do sistema
    * Timestamps em cada operação
    * Verificação de consistência arrays
  
  FUNCIONALIDADES PRINCIPAIS:
  ✓ Cadastro completo de viagem (embarcação, origem, destino, velocidade)
  ✓ Rota automática ao adicionar waypoints no mapa
  ✓ Cálculo automático de ETA para cada waypoint
  ✓ Cálculo de consumo de combustível em tempo real
  ✓ Geração de relatório HTML profissional exportável
  ✓ Lista detalhada de waypoints com horários e consumos
  ✓ Mapa interativo OpenSeaMap com todas camadas
  ✓ Database de 98 faróis da costa brasileira (Lista de Faróis DH2, 40ª ed. 2026-2027)
  ✓ Importação/exportação GPX
  ✓ Interface mobile-first responsiva
  ✓ Renderização correta em smartphones e tablets
  
  CHANGELOG:
  v2.0.2 (15/12/2024) - CORREÇÃO CRÍTICA DE RENDERIZAÇÃO MOBILE
    BUG CORRIGIDO:
    * Mapa não renderizava em mobile (black screen)
    * Waypoints não sendo contabilizados devido ao mapa não carregar
    
    CORREÇÕES IMPLEMENTADAS:
    * CSS do map-container com altura explícita (min-height: 400px)
    * Altura calc(100vh - 200px) para mobile
    * touch-action: none para prevenir gestos do navegador
    * Position absolute no #map para garantir renderização
    * map.invalidateSize() após 250ms da inicialização
    * Listener window.resize para redimensionar mapa
    * Listener orientationchange para rotation em mobile
    * Verificação de dimensões do container antes de criar mapa
    * Força altura de 400px se container tiver altura zero
    * Logging detalhado de dimensões
    
  v2.0.1 (15/12/2024) - CORREÇÃO CRÍTICA MOBILE
    BUG CORRIGIDO:
    * Apenas 1 waypoint sendo registrado em dispositivos móveis
    
    CORREÇÕES IMPLEMENTADAS:
    * Event listener otimizado com suporte a 'tap' (mobile-specific)
    * Proteção contra múltiplos cliques simultâneos (flag isProcessingWaypoint)
    * Debounce de 300ms para evitar registros duplicados
    * Logging detalhado para debug em mobile (console.log completo)
    * Melhor handling de eventos touch vs click
    
    MODIFICAÇÕES:
    - Botão "➕ Waypoint" REMOVIDO (conforme solicitado)
    - Waypoints agora só são criados clicando/tocando no mapa
    - Event listener duplo (click + tap) para máxima compatibilidade
    - Flag de processamento evita race conditions
    
  v2.0.0 (15/12/2024) - Sistema Completo de Planejamento
    NOVIDADES:
    + Modal de configuração de viagem com dados da embarcação
    + Criação automática de rota ao adicionar waypoints
    + Cálculo de ETA (Estimated Time of Arrival) para cada waypoint
    + Sistema de consumo de combustível (litros/hora)
    + Saldo de combustível em tempo real
    + Geração de relatório HTML profissional
    + Consumo acumulado por waypoint
    + Consumo por período de 12 horas
    + Visibilidade de faróis por waypoint
    + Exportação de relatório completo
    
    MODIFICAÇÕES:
    * Rota agora é criada automaticamente (sem necessidade de botão separado)
    * Interface expandida com dados de viagem
    * Footer com informações de combustível e ETA
    * Sistema de validação de dados
    
  v1.0.0 (15/12/2024) - Implementação inicial
    - Sistema de mapa base com OpenSeaMap
    - Waypoints manuais
    - Database de faróis
    - Import/Export GPX básico
  
  ESTRUTURA DE DADOS:
  
  tripData = {
    vesselName: String,      // Nome da embarcação
    origin: String,          // Porto de origem
    destination: String,     // Porto de destino
    departureDate: Date,     // Data e hora de saída
    speedKnots: Number,      // Velocidade média em nós
    fuelInitial: Number,     // Saldo inicial de combustível (L)
    fuelConsumption: Number  // Consumo em litros/hora
  }
  
  waypoint = {
    id: Number,
    name: String,
    lat: Number,
    lng: Number,
    eta: Date,               // Hora estimada de chegada
    distance: Number,        // Distância até próximo waypoint
    fuelUsed: Number,        // Combustível usado até este ponto
    fuelRemaining: Number,   // Combustível restante
    nearestLighthouse: Object,
    lighthouseVisible: Boolean
  }
  
════════════════════════════════════════════════════════════════════════════════
```
