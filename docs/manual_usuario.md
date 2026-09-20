# Manual do Usuário - Coastal Navigator Brasil

## 1. Primeiros Passos

### 1.1 Configurando a Viagem
Ao abrir o aplicativo pela primeira vez, recomenda-se configurar os dados da embarcação:
1. Clique no botão **⚙️ Configurar** no topo da tela.
2. Preencha os dados:
   - **Nome da Embarcação**
   - **Velocidade Média (nós)**: Essencial para cálculo de ETA.
   - **Consumo (L/h)**: Essencial para cálculo de combustível.
   - **Data de Saída**: Para definir quando a viagem começa. O campo já vem
     preenchido com a sua **hora local** — se a partida for anterior a agora, o
     app entende que a viagem está em andamento e desconta o combustível já
     consumido.
   - **Altura do Olho do Observador (m)**: altura do passadiço acima da linha
     d'água. O padrão é 5 m.
3. Clique em "Salvar Configuração".

> **Por que a altura do olho importa (novo na v2.1.0)**
>
> O alcance com que você avista um farol depende de duas alturas: a do foco do
> farol e a do seu próprio olho. A fórmula é `d = 2,08 × (√h₁ + √h₂)`, com as
> alturas em metros e o resultado em milhas náuticas.
>
> Na prática, para o Farol de Natal (foco a 87 m):
>
> | De onde você olha | Altura do olho | Avista a |
> |---|---|---|
> | Lancha | 2 m | 22,3 NM |
> | Passadiço de rebocador ASD | 5 m | 24,1 NM |
> | Passadiço de navio | 20 m | 28,7 NM |
>
> Repare que a relação é de raiz quadrada: subir de 5 m para 20 m, quatro vezes
> mais alto, rende só 4,6 NM a mais. É o mesmo efeito de rendimento decrescente
> que você conhece do casco — dobrar a potência não dobra a velocidade.

## 2. Criando uma Rota

### 2.1 Adicionando Pontos (Waypoints)
- **No Mapa**: Simplesmente clique (ou toque) em qualquer lugar do mapa onde deseja passar. Um marcador será criado.
- **Sequência**: Crie os pontos na ordem da viagem. O sistema ligará os pontos automaticamente com uma linha laranja.

### 2.2 Gerenciando Pontos
- **Ver Informações**: Clique em um marcador ou na linha da rota para ver a distância e rumo.
- **Mover**: arraste o marcador. Tudo daí em diante é recalculado.
- **Apagar um ponto**: clique com o botão direito (ou toque longo) sobre ele.
  Apagar o **primeiro** ponto reancora a rota na partida — distância zero, ETA
  da saída, consumo apenas o já decorrido.
- **Deletar Rota**: Clique no botão "🗑️ Limpar" para apagar todos os pontos e começar do zero.

## 3. Importar e Exportar

### 3.1 Importar GPX
Se você já tem uma rota feita no Navionics, OpenCPN ou Garmin:
1. Salve o arquivo `.gpx` no seu dispositivo.
2. Clique no botão "📂 Importar GPX".
3. Selecione o arquivo. A rota aparece no mapa e o app enquadra a vista nela.

**Qual parte do arquivo é usada.** Um GPX pode descrever a mesma viagem de até
três formas: rota planejada (`<rte>`), pontos avulsos (`<wpt>`) e trilha
gravada (`<trkpt>`). O app usa **uma**, nesta ordem de preferência: rota,
depois pontos avulsos, depois trilha. Assim um arquivo que traga rota *e*
trilha não gera pontos em dobro. O resumo ao final diz de qual formato os
pontos vieram.

**Nomes preservados.** Os nomes dos seus waypoints vêm junto do arquivo — não
viram mais WP001, WP002.

**Limite de 500 pontos.** Trilhas gravadas de GPS trazem rotineiramente
milhares de pontos. Acima de 500 o app avisa e importa os primeiros: mais que
isso deixa de ser derrota planejável e vira traçado bruto, além de travar o
navegador.

### 3.2 Exportar Rota
Para levar a rota planejada aqui para seu GPS:
1. Clique em "💾 Exportar GPX".
2. O arquivo será baixado automaticamente.

A derrota sai como **rota** (`<rte>`), que é o que Navionics, OpenCPN e Garmin
tratam como rota navegável — e não como trilha (`<trk>`), que no padrão GPX
significa caminho já percorrido. Nomes com `&` ou `<` na embarcação, origem ou
destino não quebram mais o arquivo.

## 4. Visualizando o Relatório
Para ver o planejamento completo:
1. Clique em "📄 Relatório".
2. Uma nova janela abrirá com a tabela completa de waypoints, ETA para cada ponto, consumo estimado e faróis visíveis no trajeto.
3. Você pode imprimir este relatório ou salvar como PDF (Ctrl+P).

## 5. Faróis

A base traz **98 faróis** vindos da **Lista de Faróis DH2, 40ª edição 2026-2027**
da Diretoria de Hidrografia e Navegação, corrigida até o Aviso aos Navegantes
14/2026. Clicando no ícone de um farol você vê:

- **Altitude do foco** — altura da luz acima do nível médio do mar. É ela que
  entra no cálculo de alcance, e não a altura da torre.
- **Alcance luminoso** — até onde a luz chega pela sua intensidade, conforme a
  carta.
- **Alcance efetivo** — o menor entre o luminoso e o geográfico. É a distância
  em que você realmente vai avistar o farol.

Um farol pode ter alcance luminoso de 49 NM e efetivo de 27 NM: a luz é forte o
bastante para ir mais longe, mas a curvatura da Terra esconde o foco antes
disso. Vale para o plano de derrota e para os alertas durante a navegação — os
dois usam o mesmo critério.

Três registros estão marcados no código como **fora da Lista de Faróis**
(Barra da Tijuca, Martin Vaz e Trindade). Trate-os como referência aproximada,
não como sinal náutico confirmado.

## 6. Dicas de Uso
- **Mobile**: O app funciona offline se você mantiver a aba aberta. Ideal para consulta rápida no tablet durante a navegação.

## 7. Compartilhar a navegação com quem ficou em terra

Durante a Navegação GPS, o botão **📤 Compartilhar navegação** gera um link.
Quem abrir esse link vê a sua posição, rumo, velocidade e a rota, ao vivo e
somente-leitura. Nada é gravado em banco: a transmissão é efêmera.

### Antes de enviar o link, confira a lista

Um link só funciona depois que o servidor **registra** o token. Se o registro
não passar, o item aparece marcado em âmbar na lista:

> ⚠️ Ainda não registrado no servidor — quem abrir agora verá "Link inválido".

Nesse caso **não envie ainda**. O aplicativo tenta de novo sozinho quando a
conexão voltar e ao reabrir o gerenciador de compartilhamentos. A marca some
quando o servidor confirma.

### Revogar

O lixeira ao lado de cada link corta o acesso. O item só sai da lista se o
servidor confirmar a revogação — se não confirmar, você é avisado, porque a
transmissão para mas quem tem o link pode manter acesso até a expiração.

### O que o observador vê quando algo falha

O banner no topo diz a causa, e a linha de status explica o que fazer:

| Banner | O que é | Quem resolve |
|---|---|---|
| `ao vivo` | recebendo normalmente | — |
| `aguardando embarcação…` | canal aberto, ninguém transmitindo ainda | o comandante, ao iniciar a navegação |
| `sem transmissão há Xs` | conectado, mas a embarcação parou | perda de sinal a bordo, ou navegação encerrada |
| `sem internet` | o aparelho de quem olha está sem rede | o próprio observador |
| `servidor fora do ar` | o serviço não responde | ninguém em terra — avise o comandante |
| `reconectando… · nova tentativa em Xs` | a ligação caiu, tentando de novo | volta sozinho |

A reconexão é automática, com espera crescente (2s, 4s, 8s, 15s, 30s), e
acontece na hora quando a rede volta ou quando o observador retorna à aba. Não
é preciso recarregar a página.

### Por que o serviço às vezes some

O espelhamento depende de um servidor externo no plano gratuito, que é
suspenso após alguns dias sem uso. Existe uma rotina automática que o mantém
acordado, executada a cada 3 dias. Se ainda assim você vir **servidor fora do
ar**, o serviço precisa ser reativado — nada em terra resolve, e nenhum link
funcionará até lá.

Costume de bordo que vale adotar: **teste o link antes de zarpar**, abrindo-o
num segundo aparelho. Leva quinze segundos e evita descobrir o problema quando
já não há o que fazer.

---

## 8. O rebocador em 3D — e como escolher o casco

Toque em **🚢** na barra de navegação para abrir o painel de atitude. Ele mostra
o seu rebocador inclinando conforme os sensores do celular a bordo: **jogo**
(balanço de bordo a bordo), **caturro** (proa mergulhando) e a **proa** vinda do
GPS. Quem acompanha em terra pelo link de espelho vê a mesma atitude.

### 8.1 Trocar de casco

No alto do painel há uma **lista com os rebocadores disponíveis**:

| Casco | Comprimento × boca | Tipo |
|---|---|---|
| **ASD 2810 “Aguia”** *(padrão)* | 28,6 m × 10,2 m | ASD — Azimuth Stern Drive, bandeira do Brasil |
| **ASD 2810 “SAAM Aguia”** | 28,6 m × 10,2 m | O mesmo casco em azul e amarelo |
| **Rastar 3200** | 32,9 m × 13,5 m | Rebocador portuário convencional |

Escolha e o painel troca na hora. O ASD 2810 é o padrão por ser o que
corresponde à propulsão azimutal: os **dois dutos Kort giratórios sob a popa**
aparecem no modelo, e é por eles que um ASD faz o que um rebocador de hélice
fixo não faz — empurrar de través sem guinar.

**A escolha fica gravada no aparelho.** Da próxima vez que abrir o painel, o
casco que você deixou é o que aparece — inclusive no modo 🌍 **Earth**, onde o
mesmo rebocador navega sobre o globo pela sua rota.

### 8.2 Os faróis no globo (modo 🌍 Earth)

No modo **Earth** o rebocador navega a sua rota sobre o terreno real — e, a
partir da **v2.6.0**, os **98 faróis da Lista DH2** estão lá com ele. Cada farol
é desenhado com três elementos, e cada um responde a uma pergunta de bordo:

| O que você vê | O que significa |
|---|---|
| **Coluna colorida** | Sobe do chão até a **altitude do foco** — a altura da **luz**, não a da torre. É essa altura que manda no alcance geográfico |
| **Luz no topo** | Na **cor da característica**: branca, vermelha, verde ou amarela. É o que o vigia enxerga da ponte. De perto aparece a etiqueta com nome, característica e alcance |
| **Círculo no mar** | O **alcance efetivo** — o **menor** entre o luminoso e o geográfico |

**Por que o menor dos dois.** Um farol de 46 NM de alcance luminoso não se
enxerga a 46 NM de um bote: a curvatura da Terra o esconde primeiro. Desenhar o
alcance luminoso seria convidar o navegante a esperar uma luz que não vai
aparecer.

> **💡 O CÍRCULO É SEU, NÃO DO FAROL.**
> O alcance geográfico depende de **duas** alturas — a do foco e a do **seu
> olho**: `d = 2,08 · (√h₁ + √h₂)`. Aumente a *altura do olho* na configuração
> da viagem e os círculos crescem. Com o olho a 1 m, **81 dos 98 faróis** passam
> a ser limitados pela curvatura da Terra e não pela potência da lâmpada; do
> passadiço de um AHTS, quase nenhum. É a tabela de avistamento desenhada
> no globo, e ela se move com você.

**O botão 💡** no cabeçalho do painel liga e desliga os faróis, e a escolha fica
gravada no aparelho. Ele **só aparece no modo Earth** — na vista de Atitude não
há globo onde desenhá-los, e botão que não faz nada na tela em que está confunde
mais do que ajuda.

**Contra a sopa de etiquetas.** 98 nomes e 98 círculos desenhados o tempo todo
tornariam o globo ilegível justamente no zoom out, que é quando se quer ver a
costa inteira. Por isso: o **nome** aparece só de perto, o **círculo** até média
distância, e a **coluna** fica sempre.

### 8.1.1 Se você usou o Rastar antes da v2.3.0

Até a v2.2.2 o Rastar 3200 aparecia **de ré** e com o **caturro invertido**: a
proa mergulhava quando deveria subir. Não era o sensor nem o seu celular — era
o modelo, desenhado com a proa para o lado oposto ao que o painel supunha. Está
corrigido. Se você tinha aprendido a "ler ao contrário", pode desaprender.

## 9. A Iara — sua assistente de voz

A partir da **v2.7.0** há um microfone 🎙️ na barra de navegação. É a **Iara**:
não um leitor de números, mas uma **consultora e especialista em navegação** que
fala — faróis, derrota, corrente, consumo e estabilidade.

### 9.1 O primeiro toque: ela se apresenta

Da primeira vez que você tocar no 🎙️, a Iara **se apresenta** em vez de ouvir.
Isso não é enfeite: Android e iPhone **bloqueiam áudio sem um toque do usuário**,
então o primeiro toque é o que dá voz a ela. Do segundo em diante, o botão ouve.

Na apresentação ela diz três coisas, e nenhuma é dispensável:

1. **Quem ela é** — especialista em navegação costeira. É o que autoriza você a
   perguntar coisas técnicas, não só "quanto falta".
2. **Quem decide** — *"te ajudo a decidir, quem decide é você"*. Uma voz
   simpática e segura é muito convincente; a fronteira vem antes da confiança.
3. **O contrato do microfone** — *"eu só escuto quando você me chama"*.

### 9.2 O microfone só abre quando você manda

**A Iara não fica escutando.** O microfone abre no toque do botão e fecha
sozinho quando você para de falar. Não existe modo "sempre ouvindo" — e nem
poderia: o Chrome no Android recusa esse modo.

O ícone diz o estado, e você o distingue de três maneiras ao mesmo tempo
(desenho, cor e moldura), porque sob sol de passadiço uma delas sempre falha:

| Ícone | Cor | Estado |
|---|---|---|
| 🎙️ | azul apagado | **Fechado.** Nenhum áudio captado |
| 🔴 | vermelho **pulsando** | **ABERTO.** Ela está ouvindo você |
| ⏳ | âmbar | Microfone fechado, processando |
| 🔊 | azul | Microfone fechado, ela está falando |
| 🔕 | cinza | **Silenciada** |

Só o vermelho pulsa, de propósito: movimento é o que o canto do olho capta sem
você tirar a vista do tráfego.

### 9.3 Como calar a Iara — o mudo é soberano

**Segure o botão por meio segundo** (ou clique com o botão direito, no
computador). Ela cala na hora, esvazia tudo o que ia dizer, e o ícone vira 🔕.
Toque de novo para reativar. A escolha fica gravada no aparelho.

O mudo **cala até avisos críticos**. Quem mandou calar tem motivo, e o motivo
pode ser o VHF chamando.

> **E o que estava na fila é DESCARTADO, não guardado.** Se você silenciar por
> uma hora e reativar, ela não despeja doze relatórios velhos de uma vez. O
> próximo relatório vem no horário, com dados de agora.

### 9.4 Quando ela cala sozinha

Sem você pedir, a Iara se cala:

- **enquanto um alerta do app está tocando** — o alarme manda, ela espera;
- **durante manobra** — guinada acima de 10°/min, ou você dentro de 0,3 NM do
  waypoint. Um ASD guina rápido, e quem está no leme não quer ouvir consumo
  acumulado. Só aviso crítico fura a manobra;
- **enquanto ela mesma está falando** — enfileira, não atropela.

### 9.5 A regra que mais importa: fala vencida não é dita

Um relatório de posição que ficou 20 minutos na fila **não é atrasado, é
errado**. A 10 nós o barco andou 3,3 milhas desde que aquele texto foi montado.
Dizer *"faltam 4 milhas para o waypoint"* quando faltam 0,7 é pior que ficar
calado.

Por isso toda fala da Iara nasce com prazo de validade. Vencida, é jogada fora
em silêncio — e o relatório seguinte vem com os números de agora.

### 9.6 Sem internet: ela fala, mas não ouve

Esta é a diferença mais importante de entender a bordo:

| | Offshore, sem 4G |
|---|---|
| **Os relatórios automáticos** | ✅ **continuam normalmente** |
| **Perguntar alguma coisa** | ❌ **não funciona** |

O motivo é técnico e não tem contorno: **falar** usa vozes instaladas no próprio
tablet; **ouvir** manda o áudio para servidores na internet. A 30 milhas da
costa não há sinal para isso.

Quando você tocar no microfone sem sinal, ela responde com todas as letras —
*"tô sem internet, não consigo te ouvir agora; mas os relatórios continuam,
esses não dependem de sinal"* — em vez de fingir que não entendeu.

> **Por isso ela prefere voz instalada no aparelho.** Na hora de escolher entre
> as vozes disponíveis, a Iara dá mais peso a uma voz local que ao gênero: entre
> uma voz feminina bonita que emudece no mar e uma voz comum que fala sempre, a
> escolha de bordo é óbvia.

### 9.7 O que ela ainda NÃO faz

A v2.7.0 é o **Sprint 0** do assistente: a fundação. Se você perguntar alguma
coisa, ela repete o que ouviu e admite que ainda está aprendendo a responder.

Está previsto, nesta ordem: **relatórios automáticos** de hora em hora e a cada
waypoint; **tempo, vento e corrente** do Open-Meteo, com ETA corrigido pela
corrente; **cidade, abrigo e farol** mais próximos de cada waypoint; **faixa
econômica de RPM** que não estraga o ETA; **ondas e estabilidade** pelos
sensores do tablet; e por último a **conversa livre**.

### 9.8 Ela sugere. Você decide.

Nenhuma frase da Iara manda no navio. Ela diz *"dá pra"*, *"vale"*, *"sugiro"* —
nunca *"reduza"*, *"vire"*, *"desvie"*. Isso é verificado automaticamente a cada
versão, varrendo tudo o que ela é capaz de dizer.

O motivo é simples: a Iara **não enxerga o tráfego, não sente o cabo de reboque
e não sabe que o rebocado está guinando**. Ela é uma consultora com acesso a
bons números — e uma consultora, por melhor que seja, não é quem está no leme.

## 8.0 A barra de botões da navegação

| Ícone | O que faz |
|---|---|
| 📤 | **Compartilhar** — gera o link do espelho para quem ficou em terra |
| 🔊 / 🔇 | **Som dos alertas.** Silenciado, o botão fica cinza e emoldurado — não use a transparência para julgar, use a moldura |
| 🎯 | **Mapa acompanha o barco.** Cinza e emoldurado = o mapa está solto |
| 🧪 | **Simular percurso** — ver o aviso abaixo |
| 🔄 | **Zerar a singradura** — distância, consumo e perda por desvio voltam a zero, sem encerrar a navegação |
| ℹ️ | **Informações dos waypoints** |
| 🚢 | **Atitude 3D** do rebocador |
| 🎙️ | **Iara**, a assistente de voz — toque para perguntar, segure para silenciar (§9) |

O 🔊 e o 🎯 **ficam gravados no aparelho**: a escolha sobrevive a recarregar a
página. É deliberado — um alerta silenciado que volta sozinho ao ligar o som, ou
pior, um ícone dizendo que o som está ligado quando não está, é o tipo de engano
que faz perder um farol.

### ⚠️ Sobre o 🧪 Simular percurso

**Navegando de verdade, a simulação descarta o GPS.** Enquanto ela roda, a
posição exibida é fabricada a partir da sua rota — não é onde o navio está.

Por isso, com a navegação ativa, o botão **pede confirmação** e diz exatamente o
que vai acontecer: o GPS deixa de ser usado, os contadores da singradura zeram,
e — se houver alguém acompanhando pelo link — **quantas pessoas passarão a ver a
simulação**.

Quem está em terra **não é enganado**: o painel do observador exibe uma faixa
listrada no alto da tela, *"🧪 SIMULAÇÃO — esta NÃO é a posição real da
embarcação"*, antes de qualquer posição, rumo ou ETA.

### Se a "perda por desvio" parecer absurda

Esse número é `(distância percorrida − avanço na rota) × litros por milha`. Um
salto de GPS — reaquisição depois de uma sombra, troca de fonte de posição —
entrava na distância percorrida como se fosse milha navegada, e reaparecia
ampliado no combustível.

Desde a v2.3.3 saltos fisicamente impossíveis são **descartados** e contados: ao
lado da perda aparece *"N salto(s) de GPS descartado(s)"*. Se esse número cresce,
a posição está instável. E se algum contador já estiver corrompido, o **🔄** os
zera sem derrubar a navegação nem o compartilhamento.

### 8.2 Nivelar a referência

O celular quase nunca está perfeitamente aprumado no console. Com o navio
parado e direito, toque em **🎚️**: o painel passa a contar jogo e caturro a
partir dali. É o mesmo gesto de zerar um inclinômetro — sem ele, um celular
apoiado torto mostra 8° de banda com o navio a direito.

O campo **Roll máx** guarda o maior jogo desde a última nivelada. Toque em 🎚️
para zerar também esse registro.

### 8.3 Se o painel demorar

O modelo 3D e a biblioteca gráfica só são baixados **quando você abre o
painel** — nunca no carregamento do aplicativo. Assim, quem nunca usa o 3D não
paga por ele. O ASD 2810 pesa 1,25 MB; em rede fraca a barra de progresso conta
os por cento. Uma vez carregado, fica na memória até fechar a aba.
