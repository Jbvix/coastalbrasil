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
