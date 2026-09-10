# Changelog — Coastal Navigator Brasil

Autor: Jossian Brito (Charlie Bravo)

Este arquivo era um comentário de 578 linhas no topo do `app.html`. Saiu de
lá na v2.2.0: histórico é documentação, não código, e a cada leitura do
arquivo principal ele custava meia tela de rolagem antes da primeira linha
executável.

---

```

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

### 2 · Os dois rebocadores sem iluminação no modo Earth

O Cesium ilumina pela posição **real do Sol** na hora do relógio da cena. Abrir o
modo Earth de madrugada no litoral brasileiro põe o rebocador do lado escuro da
Terra: aparece chapado, sem relevo. Entrou um **farol de câmera** (headlight),
que ilumina sempre o que se está olhando, a qualquer hora, sem falsear o terreno.

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
