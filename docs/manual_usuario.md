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

### 9.7 Os relatórios automáticos

A partir da **v2.8.0** a Iara relata sozinha, **sem você pedir nada**, em dois
momentos: **na hora cheia** e **a cada waypoint alcançado**. Começam quando
você inicia a navegação e param quando você a encerra.

**Na hora cheia, e não "de hora em hora".** Diferença que parece cosmética e
não é: um relógio de 60 em 60 minutos dispararia às 14h07, 15h07, 16h07 — e o
relatório deixaria de casar com o registro do diário de bordo, que é feito na
hora cheia. Alinhados, o falado e o escrito contam a mesma história.

#### O que ela diz sempre

Hora, posição, rumo, velocidade, próximo waypoint com distância e marcação, e a
hora prevista de chegada. Leva uns **14 segundos**:

> *"14 horas em ponto. Posição 23 graus e 5 sul, 41 graus e 53 oeste. Rumo zero
> quatro oito, 9,5 nós. Próximo waypoint Cabo Frio, 12,4 milhas, marcação zero
> cinco dois. Chegada prevista 15 e 20."*

#### O que ela diz só quando importa

Este é o ponto do projeto: **um relatório que repete as mesmas nove coisas toda
hora vira ruído de fundo em dois dias** — e aí você deixa de ouvir justamente
na hora em que havia algo diferente. É o mal do alarme que toca sempre.

| Ela menciona… | Só quando… |
|---|---|
| **fora de rumo** | passa de **0,1 milha**. Abaixo disso é tremor de GPS, não desvio |
| **farol** | ele está **dentro do alcance que VOCÊ enxerga** daí — o menor entre o luminoso e o geográfico, que depende da altura do seu olho |
| **combustível** | de 4 em 4 relatórios — ou **na hora**, se o saldo não fecha a rota que falta |

#### Quando três coisas importam juntas, ela fala das três

Aí o relatório chega a uns 26 segundos, e é de propósito. Quando fora de rumo,
farol à vista e combustível merecem atenção ao mesmo tempo, é exatamente a hora
em que você quer ouvir os três. Uma assistente que se cala sobre o farol porque
"já falou demais" troca um incômodo por um risco.

#### Ao alcançar um waypoint

Neste instante você está guinando, então ela é curta e fala só do que vem:

> *"Chegamos em Búzios. Nova perna pra Cabo Frio: rumo zero cinco dois, 12,4
> milhas, chegada 15 e 20."*

No último waypoint da rota ela percebe e se despede.

### 9.7.1 🧪 Simulação: ela avisa SEMPRE, na primeira frase

> *"Atenção: isto é simulação, não é a navegação real. 14 horas em ponto…"*

**Isto não tem como ser desligado, e a razão é séria.** Na v2.3.3 o painel
chegou a mostrar 628.616 L de "perda por desvio" porque o simulador estava
ligado ao lado do botão mais usado, contaminando os contadores reais. Números
simulados ditos **em voz alta**, com a segurança de uma assistente e sem
avisar, são a forma mais perigosa desse mesmo defeito: a voz convence mais que
a tela, e não deixa rastro para você reler e desconfiar.

### 9.7.2 Ela fala como marinheiro, não como máquina

Você vai notar que ela **não soletra**:

| Na tela | Na voz dela |
|---|---|
| `048°` | *"rumo zero quatro oito"* |
| `Fl(3) W 15s` | *"três lampejos brancos a cada 15 segundos"* |
| `Oc(2) R 6s` | *"duas ocultações vermelhas a cada 6 segundos"* |
| `15:20` | *"15 e 20"* |
| `23°05.4'S` | *"23 graus e 5 sul"* |

O rumo vai dígito a dígito porque é assim no rádio — e há razão: *"quarenta e
oito"* e *"cento e quarenta e oito"* se confundem num alto-falante ruim;
*"quatro oito"* e *"um quatro oito"*, não.

E a característica do farol ela lê como você leria em voz alta olhando a carta,
porque é essa forma que o seu olho consegue comparar com o que está lá fora.
**As 98 luzes da Lista da DHN** estão traduzidas.

### 9.7.3 Quem está em terra ouve o mesmo

Se você compartilhou o link do espelho, quem acompanha **lê o relatório que
você ouviu** — mesma frase, mesmo instante, num quadro azul no alto do painel.
Vai pelo canal que já transmitia a posição: nenhum gasto de dados a mais.

A bordo esse quadro **não aparece** — você já ouviu, e a tela é do XTE.

### 9.7.4 Tempo, vento e corrente

A partir da **v2.9.0** a Iara consulta o modelo meteorológico e traz vento,
mar, corrente e barômetro para dentro do relatório — **também por exceção**:

| Ela diz | Quando |
|---|---|
| **vento** | sempre — direção, nós e força Beaufort |
| **rajada** | só quando passa 8 nós acima da média. Num rebocador com cabo na água, isso decide manobra |
| **mar** | a partir de 1,5 m, com direção e período |
| **corrente** | só quando muda seu avanço em 0,3 nó ou mais |
| **barômetro** | só quando não está estável |

> *"Vento de nordeste, 24 nós, muito fresco, força 6. Mar de lés-nordeste, 2,1
> metros, período de 6 segundos. Corrente 1 nó para sudoeste, tirando 0,8 nós
> do seu avanço. Barômetro 1009, caindo — vale ficar de olho."*

#### 🧭 O que o GPS não pode saber, e o modelo pode

Esta é a parte que vale o sprint inteiro, e merece explicação.

**Na perna em que você está agora, o GPS já sabe tudo.** A velocidade no fundo
que ele mostra já tem a corrente embutida — o modelo não acrescenta nada.

**Nas pernas que você ainda não navegou, ele não sabe nada.** E a mesma
corrente age de forma completamente diferente conforme o rumo da perna. Com 2
nós de corrente para o sul, pernas de 20 milhas, navio a 10 nós:

| Sua perna | Velocidade no fundo | Tempo |
|---|---|---|
| ao **norte**, contra | 8,0 nós | **2h30** |
| a **leste**, de través | 9,8 nós | **2h02** |
| ao **sul**, a favor | 12,0 nós | **1h40** |

**Cinquenta minutos de diferença, com a mesma corrente.** É por isso que a Iara
recalcula o ETA da rota **perna a perna** e avisa quando a diferença passa de
10 minutos:

> *"A corrente cobra 40 minutos a mais na rota inteira."*

Abaixo de 10 minutos ela fica calada — a correção caberia na incerteza do
próprio modelo, e anunciá-la seria dar ares de precisão a um palpite.

#### ⚠️ Quando a corrente não deixa cumprir a derrota

Se a corrente de través for mais forte que a sua velocidade na água, **não
existe proa que segure a derrota** — nenhuma. A Iara diz isso, com o número,
em vez de calar:

> *"Atenção: a corrente atravessa 5 nós e o navio só faz 4 na água — esta
> derrota não se mantém."*

#### 🔇 Sem internet, o dado fica velho — e ela diz a idade

Se a consulta falhar, ela **não joga fora** o último valor conhecido: serve com
o rótulo.

> *"…dados de 90 minutos atrás."*

Dado velho **rotulado como velho** vale mais que dado fresco de procedência
duvidosa — e quem decide se ainda serve é você. Abaixo de 45 minutos ela nem
menciona a idade; acima de 6 horas, avisa que pode ter mudado.

#### 🔒 Sobre a sua chave do Open-Meteo

A chave **não está no aplicativo**. Ela fica no servidor do Netlify, e o
navegador conversa com um intermediário no seu próprio domínio. Isso não é
zelo excessivo: o Open-Meteo só aceita a chave dentro do endereço da consulta e
**não permite travá-la no seu domínio**. Publicada, ela seria copiável por
qualquer visitante — e é uma chave **paga**.

### 9.7.5 Cada waypoint ganha um nome de terra

A partir da **v2.10.0**, abrindo o **ℹ️** você vê, abaixo de cada waypoint, a
referência de terra mais próxima:

> 🏙️ **Cabo Frio a 12,3 milhas para noroeste; porto de Niterói a 68,5**

E a Iara a diz **na chegada a cada waypoint** — que é quando interessa, porque
um waypoint chamado "WP 3" não diz a ninguém onde você está:

> *"Chegamos em Búzios. Cabo Frio a 12,3 milhas para noroeste. Nova perna pra
> Macaé: rumo zero três cinco, 28 milhas, chegada 17 e 10."*

**Marcação, não só distância.** "Cabo Frio a 12 milhas" deixa você girando a
cabeça; "12 milhas **a leste** de Cabo Frio" orienta. A marcação é do seu ponto
**para** a referência — é para onde olhar.

#### O marco de singradura

Quando a cidade mais próxima **muda**, ela avisa uma vez:

> *"Agora a referência mais próxima é Macaé, 6,2 milhas a noroeste."*

É o equivalente falado de passar o través de um ponto notável — o jeito como se
conta uma viagem costeira: *"passamos Cabo Frio às 14, Macaé às 17"*. Ela não
repete de hora em hora, e cala quando o próprio waypoint já tem o nome da
cidade, que na costa brasileira é a regra.

Passando de **120 milhas** da costa, ela simplesmente não nomeia nada. Um nome
de terra numa frase implica que ele serve de referência — e a 400 milhas não
serve.

### ⚠️ 9.7.6 PORTO NÃO É ABRIGO — leia antes de confiar

Esta é a ressalva mais importante desta seção.

**Um porto que aparece nessa lista não é, por estar ali, um lugar seguro para
se meter com mau tempo.**

Escolher fundeadouro exige **carta náutica, tenedouro, proteção de qual
quadrante, profundidade e acesso noturno**. Nada disso está nesta base, nem em
nenhuma fonte pública de onde ela veio. O que o aplicativo entrega é
**referência de orientação** — "onde estou, em termos que uma pessoa entende".
Não é conselho de derrota, e nunca foi pensado para ser.

#### E a lista de portos está incompleta — de propósito declarado

A base pública usada (Natural Earth) traz 20 portos brasileiros. **Faltam**
Suape, Itaqui, Sepetiba/Itaguaí, São Sebastião, Angra dos Reis, Tubarão, Areia
Branca, Imbituba, Antonina, Itajaí, Cabedelo, São Luís e Barra do Riacho.

A ANTAQ não é acessível pelo gerador e o IBGE não publica coordenadas.
**Coordenada de porto não se inventa** — seria repetir o erro que produziu a
linha de costa errada da v2.4. Quem trabalha nesses portos tem a posição na
ponta da língua: a emenda está pronta para ser preenchida em
`tools/terra/gerar_referencias.mjs`, com a **procedência obrigatória**.

### 9.7.7 ⚙️ Faixa econômica de rotação

A partir da **v2.11.0** o painel tem dois campos: **rotação** e **carga**. São
os dois números que você lê de relance no painel da praça, e com eles a Iara
passa a calcular a faixa econômica.

#### A conta, em uma linha

Hélice de passo fixo: a potência vai com o **cubo** da rotação e a velocidade
com a primeira potência. Logo o consumo **por milha** vai com o quadrado.
Cair de **1250 para 1125 rotações**:

| | |
|---|---|
| por hora | **−27%** |
| por milha | **−19%** |
| tempo de viagem | **+11%** |

> **Seu rebocador cruza a 33% da MCR — e isso não é defeito.** O motor foi
> dimensionado para o tiro à poste: 100% acontece com o navio quase parado,
> puxando. Em trânsito ele vive na faixa baixa, e é por isso que a regra de
> "manter 70-85% da MCR", que vale para um cargueiro, **não vale aqui**.

#### O fundo que existe contra corrente

Contra corrente há uma velocidade abaixo da qual reduzir rotação passa a
**gastar mais** por milha percorrida — e tende ao infinito quando você iguala
a corrente, porque aí não chega nunca. O ponto é **1,5 × a velocidade da
corrente**.

A Iara não usa essa regra de bolso: ela **minimiza o combustível de verdade**,
com o triângulo da corrente dentro da conta. A regra sai sozinha do resultado —
e sai certa também com corrente de través, que nenhuma regra de bolso cobre.

#### Além da velocidade de casco, é queimar óleo para fazer onda

```
V_casco = 1,34 × √(comprimento de flutuação em pés) ≈ 12,7 nós no 2810
```

Acima disso o navio sobe na própria onda de proa. A conta reflete isso: de
1650 para 1800 rotações a **velocidade não muda** e o consumo por milha salta
de 29,7 para 38,6 L/NM.

#### O conselho vem sempre com o motivo

> ⚙️ *"Dá pra fazer o horário com 1.105 rpm: economiza 240 litros, chegando
> 35 minutos mais tarde."*

E pode ser o contrário:

> ⚙️ *"A 1.250 rpm você não fecha o horário. 1.405 fecham, custando 485 L a mais."*

Ela não cutuca por menos de **4%** de diferença — assistente que pede para
mexer na máquina por 30 rotações vira o alarme que todo mundo aprende a ignorar.

#### ⚠️ Marcha lenta prolongada é decisão sua, não da conta

A conta do consumo empurra sempre para baixo. Mas o senhor sabe o que carga
muito baixa por horas faz com turbo, camisa e escape — e **isso não aparece no
totalizador de combustível**.

A Iara não vê a cor do escape, não sente o cheiro da praça e não sabe há quanto
tempo o motor não abre. Por isso ela **avisa** quando a sugestão cai em carga
baixa, e não impõe piso nenhum. A decisão é de máquinas.

#### 🔧 O campo de carga: o que o ponteiro diz e a curva não esperava

Informando a carga, ela compara com o que a curva livre previa:

> *"Carga de 52 por cento onde a curva esperaria 33 — 55 por cento a mais.
> Reboque, casco sujo ou mar de proa."*

**Ela não escolhe entre as causas.** Não vê o cabo nem o fundo. Mede a
diferença, diz o tamanho e entrega a lista — porque medir e nomear a
discrepância já é a metade cara do diagnóstico.

#### A curva aprende o SEU casco

O modelo nasce ancorado na velocidade e no consumo que você declarou na viagem.
Depois de algumas horas com a rotação informada, ele passa a usar a curva
**medida**: deste casco, neste calado, com este reboque, neste mar. Não a de um
navio novo em água parada.

### 9.7.8 Quando tudo merece ser dito ao mesmo tempo

Com todos os recursos ligados, o relatório passou a ter **quinze** motivos
possíveis para falar. Medido: no pior caso, **58 segundos** de monólogo.

Um relatório de um minuto no passadiço não é informação — é ruído com
autoridade. Então ela passou a ter **orçamento**:

- a **espinha** (hora, posição, rumo, waypoint) nunca é cortada;
- o resto sai do menos urgente para cima até caber em 30 segundos;
- **se cortou, ela avisa**: *"Tem mais 7 no painel."*

E a ordem é **de passadiço**: o conselho de rotação fica em penúltimo lugar.
Economia de combustível é valiosa e **nunca é urgente** — *"você está fora de
rumo"* e *"o barômetro está caindo"* são. O conselho continua inteiro no
painel, onde se lê com calma.

### 9.7.9 🌊 O rebocador como instrumento de onda

A partir da **v2.12.0** o acelerômetro do tablete mede o mar. Depois de **17
minutos** de navegação aparece no painel:

> 📈 sentido **2,5 m / 9 s** · modelo 2,4 m · jogo **11° / 6,3 s** · GM~**1,8 m**

**Por que 17 minutos.** Menos que isso e a medida erra 13% para baixo — foi
medido. Num registro curto, a deriva lenta do mar não se distingue de onda
longa, e a filtragem que protege contra o viés do sensor acaba comendo onda de
verdade. Boia de onda profissional usa 20 a 30 minutos pela mesma razão. Até
encher, ela diz *"medindo o mar… faltam X min"* em vez de inventar número.

#### ⚠️ Ela mede o NAVIO, não o mar

Isto precisa ficar claro antes de qualquer uso. Entre o mar e o tablete existe
um filtro: **o seu rebocador**. E o comprimento da onda decide tudo:

| período | comprimento | vs. seu casco | o que a medida vale |
|---|---|---|---|
| 10 s | 156 m | 5,5× | ✅ confiável — o barco sobe junto |
| 7 s | 76 m | 2,7× | razoável |
| 4 s | 25 m | 0,9× | ❌ **subestima muito** — o casco atravessa |

Um rebocador de 28 m é uma boia sensível à **vaga longa** e surda à
**marulhada**. Quando a onda for curta para o casco, ela avisa: *⚠️ onda curta
p/ este casco*.

Ao lado do medido aparece o **previsto pelo modelo**. É conferência de
realidade sobre a previsão — e ela só comenta em voz alta quando os dois
**discordam em mais de 30%**, porque repetir de hora em hora que o modelo
acertou é o tipo de ruído que faz parar de escutar.

### 9.7.10 ⚠️ GM PELO PERÍODO DE BALANÇO — leia inteiro

Esta é a parte mais valiosa do aplicativo, e a que exige mais cuidado.

O período natural de balanço carrega a estabilidade transversal:

```
GM = (2 · C · B / T_balanço)²        C = 0,41 no ASD 2810
```

| seu balanço | GM estimado | leitura |
|---:|---:|---|
| 5,0 s | 2,94 m | duro, seco, quebra coisa |
| 6,0 s | 2,04 m | confortável |
| 7,0 s | 1,50 m | atenção |
| **8,0 s** | **1,15 m** | 🔴 **o barco está amolecendo** |

**O senhor sabe melhor que eu o que derruba rebocador.** Não é a onda grande:
é o GM que baixou sem ninguém notar — superfície livre em tanque parcialmente
cheio, água no convés que não escoou, peso que subiu, e sobretudo **o puxão do
cabo na cintura**. Um rebocador que emborca raramente avisa. O período de
balanço avisa, e ninguém escuta.

Por isso a Iara fala **sem esperar a vez** quando o balanço alonga:

> *"Atenção: o balanço alongou nas últimas 2 horas: o GM estimado caiu de 2,0
> para 1,3 metros. Vale conferir tanques e convés."*

#### 🔴 As três ressalvas — não pule

**1. É indicador de TENDÊNCIA, não cálculo de estabilidade.**
A sensibilidade é quadrática: **10% de erro no período vira 20% de erro no
GM**. Por isso o painel mostra `GM~` com o til, e a faixa de incerteza anda
junto do número. **A sua prancha de estabilidade continua mandando.**

**2. Só vale com balanço LIVRE.**
Se o período de encontro das ondas estiver perto do balanço natural, o navio
balança **forçado** — e o que se mede é o mar, não o navio. Nesse caso ela
**recusa a medida** e diz *"GM: sem medida confiável"*, em vez de mostrar um
número errado com cara de certo. Balanço de menos de 1,5° também é recusado:
não há sinal para medir.

**3. O coeficiente é empírico.**
A fórmula é uma aproximação para cascos convencionais. Um ASD com dutos e skeg
não é exatamente isso. O **valor absoluto** pode estar deslocado; a
**tendência**, não — e é a tendência que salva.

### 9.7.11 Ressonância: os dois caminhos que derrubam navio

O período de **encontro** não é o período da onda. Em mar de **popa** ele
estica: a 10 nós numa onda de 8 s, o encontro vai a **13,6 segundos**.

| alerta | quando | por quê |
|---|---|---|
| **Balanço síncrono** | encontro ≈ balanço natural | cada onda chega empurrando no mesmo tempo; a amplitude cresce a cada ciclo |
| **Balanço paramétrico** | encontro ≈ metade do balanço | a estabilidade varia duas vezes por ciclo; cresce rápido e **pega de surpresa porque o mar não parece perigoso** |

Os dois falam com **prioridade de segurança** — à frente de qualquer conselho
de economia, e sem esperar a vez.

### 9.7.12 🎤 Agora ela responde

Toque no 🎙️, faça a pergunta, solte. Ela entende **20 assuntos**:

| Pergunte | Ela responde |
|---|---|
| *"quanto falta"* | distância e hora de chegada |
| *"onde a gente tá"* | posição e a referência de terra |
| *"tô no rumo?"* | o desvio, e se ele é ruído de GPS ou não |
| *"como tá o tempo"* · *"qual o vento"* · *"como tá o mar"* | do modelo e dos sensores |
| *"a corrente tá contra?"* | direção, força e efeito no seu avanço |
| *"quanto a gente gastou"* | consumido, saldo e se fecha a rota |
| *"dá pra economizar?"* | a rotação econômica, com o custo em tempo |
| *"como tá o motor"* | carga lida contra a esperada |
| *"que farol é aquele"* | nome, característica e se está no alcance |
| *"como tá o balanço"* · *"qual o GM"* | amplitude, período e estabilidade |
| *"repete"* | o último relatório |
| *"o que você sabe fazer"* | a lista inteira |

Fala como se fala na ponte: *"tá"*, *"tô"*, *"pra"* — tudo entendido.

#### Ela prefere calar a chutar

Se não entender, **diz**. E diz de três formas diferentes, porque são três
situações diferentes:

> *"Não consegui ouvir nada. Tenta de novo?"* — o microfone abriu e não veio nada
> *"Não sei se você quer saber o vento ou o mar. Pode repetir?"* — ficou ambíguo
> *"Essa eu não sei responder"* + a lista — está fora do que ela sabe

**Perguntas fora do escopo ela recusa**, em vez de improvisar. Preço do diesel,
previsão para depois de amanhã, quem ganhou o jogo — nada disso. Ela responde
sobre **a sua viagem**, e só.

#### Por que não é "inteligência artificial que responde qualquer coisa"

Essa foi a única parte da sua especificação em que eu discordei, e mantive a
discordância. O motivo:

> **Numa ponte, um assistente limitado que está sempre certo vale mais que um
> ilimitado que às vezes erra com confiança.**

Um modelo de linguagem na nuvem responderia qualquer coisa — e às três da manhã,
a 40 milhas da costa, responderia **nada**, porque não há sinal. Pior: poderia
responder algo plausível e **errado** sobre a sua viagem. E a voz dela é
convincente; quem está de quarto há seis horas não confere.

O que existe aqui é **gramática**: determinística (a mesma pergunta dá sempre a
mesma resposta), **auditável** (dá para ler a lista inteira do que ela sabe) e
**de custo zero**. Nenhuma chave, nenhuma conta, nenhuma chamada.

### 9.8 O que ela ainda NÃO faz — e o que ficou proposto

Os seis sprints estão entregues. O que existe de fora do plano original:

**Conversa aberta por modelo de linguagem.** Ficou como proposta, não como
falta. Ela exige três decisões que são suas, não minhas: uma **chave de API**,
um **custo por pergunta** e um **servidor** para guardar a chave. E resolve um
problema que só existe no porto, com sinal — que é onde o senhor pode
simplesmente olhar a tela. Se um dia entrar, entra **desligada por padrão** e
claramente marcada como "modo conversa".

**Os 13 portos que faltam na base de referências** (Suape, Itaqui, Sepetiba,
São Sebastião, Angra, Itajaí e outros). Não inventei coordenada; a emenda está
pronta em `tools/terra/gerar_referencias.mjs`, esperando as posições e a
procedência delas.

**Direção da onda pelos sensores.** O acelerômetro vertical não sabe de onde a
onda vem — para isso seria preciso o par de inclinações, e a fusão de atitude
do aplicativo não é boa o bastante para bancar essa afirmação. A direção
continua vindo do modelo.

A v2.13.0 entregou o **Sprint 6a**: a conversa.



> Se você tinha lido aqui que viria "cidade, **abrigo** e farol": a palavra
> *abrigo* saiu, e saiu por decisão técnica. Ver §9.7.6 — o aplicativo não tem
> como saber o que é abrigo, e prometer isso seria pior que não prometer nada.

### 9.9 Ela sugere. Você decide.

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
