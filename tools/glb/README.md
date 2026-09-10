# tools/glb — preparo dos cascos da frota 3D

Autor: Jossian Brito (Charlie Bravo) · 2026-09-07

Estes programas transformam um pacote de modelagem (FBX + PNG soltos) num GLB
que cabe numa rede de bordo. Nenhum deles roda em produção: são de bancada,
como `tools/lf/` é para a Lista de Faróis. **O GLB entra no repositório já
pronto**; o que fica aqui é a receita para refazê-lo quando o material original
melhorar.

## Por que existe

O ASD 2810 chegou como 12,4 MB de FBX e 44 MB de PNG. Servir isso a um celular
fundeado num porto com 3G intermitente está fora de questão. O resultado final
tem **1,25 MB** — 35× menor que o material bruto — sem perda visível num painel
de atitude.

## A receita, em três passos

### 1. FBX → glTF (geometria)

```bash
npx fbx2gltf                       # baixa o binário 0.9.7
FBX2glTF -i casco.fbx -o cru --binary --pbr-metallic-roughness
```

Deixe as texturas numa pasta `textures/` ao lado do FBX: o conversor as
localiza sozinho, e o registro de quais ele achou é útil para saber o que
falta.

**Espere ver `0 textures` no relatório final. Não é erro.** Os materiais do FBX
costumam vir com `Kd = 0,00 0,00 0,00` e sem propriedade de difusa — o
conversor acha os arquivos mas não tem onde ligá-los. Quem liga é o passo 3.

### 2. Empacotar as texturas

```bash
python3 empacotar_texturas.py textures/ tex1k/ 1024
```

Faz duas coisas que o glTF exige e o FBX não:

- **Funde metalicidade e rugosidade** num único mapa ORM (R=oclusão,
  G=rugosidade, B=metal). O glTF não aceita os dois separados.
- **Encolhe** 4096² → 1024² em WebP. No ASD 2810: 44 MB → 0,59 MB.

Canal ausente não vira canal vazio: rugosidade faltante recebe 0,6 fixo, porque
um canal zerado o motor lê como **espelho perfeito** e o casco vira cromado.

### 3. Religar e comprimir

```bash
RATIO=0.15 node montar_modelo.mjs cru.glb tex1k/ ../../assets/models/casco.glb
```

Casa material e textura pelo código de quatro dígitos que aparece nos dois
lados (`Hool_1002_mat` ↔ `1002_basecolor.webp`), decima a malha com
`meshoptimizer` e comprime com Draco.

Dependências: `@gltf-transform/core`, `@gltf-transform/extensions`,
`@gltf-transform/functions`, `meshoptimizer`, `draco3dgltf`.

## Conferir antes de commitar

```bash
node inspecionar.js ../../assets/models/casco.glb
```

Relata as **três camadas** que precisam estar todas de pé — e que são
independentes, razão de "tem textura" não ser uma pergunta de sim ou não:

1. **imagens** dentro do arquivo;
2. **texturas** ligadas a materiais;
3. materiais referenciando os **canais** certos (`baseColor`, `normal`,
   `metallicRoughness`, `emissive`).

Mais as **coordenadas de UV**: sem elas a textura não tem onde pousar. Um GLB
pode ter 14 imagens embutidas e ainda assim renderizar cinza, se nenhuma
estiver ligada a um material — foi exatamente o estado do arquivo cru.

## Depois: registrar o casco

Acrescente a entrada em `SHIP_MODELS` (em `app.html`) e **meça** os três
números que não se adivinham — `headingOffset`, `headingOffsetEarth` e
`calado`. O procedimento está em `docs/tecnica.md` §7. A suíte 15 de
`npm test` guarda os invariantes; ela reprova arquivo truncado, casco pesado
demais, calado fora da faixa e caminho de modelo escrito à mão fora do
registro.

## Repintar a identidade do casco (v2.3.2)

`pintar.py` + `aplicar_nomes.py` trocam nome, porto de registro e marca da
chaminé nas texturas, localizando o texto **por detecção** — nunca por
coordenada digitada.

```bash
python3 aplicar_nomes.py          # textures/ -> textures-br/
```

Depois é só repetir os passos 2 e 3 da receita acima, apontando para
`textures-br/`.

### Três armadilhas, todas encontradas na prática

1. **O texto vive em DOIS mapas.** A tinta das letras tem rugosidade diferente
   da chapa: o nome está na cor **e** na rugosidade. Trocada só a cor, o nome
   antigo reaparece sob luz rasante por cima do novo — fantasma visível na
   renderização e invisível na textura de cor. Os dois mapas compartilham as
   UV, então as mesmas caixas servem aos dois.

2. **A letra inverte de sinal entre os mapas.** Na cor ela é mais **clara** que
   o fundo; na rugosidade, mais **escura**. Amostrar com o mesmo critério nos
   dois devolve o valor do fundo num deles, e a letra sai invisível. Daí existir
   `cor_media()` e `cor_letra_escura()`.

3. **O preenchimento depende do fundo.** Costado com degradê pede interpolação
   **por linha** (`apagar`) — na vertical, o brilho da própria letra é arrastado
   pela coluna e deixa estrias. Painel de cor chapada e **limitada**, como a
   marca da chaminé, pede preenchimento sólido (`apagar_chapado`): ali a
   interpolação busca amostra além da borda do painel e espalha cinza sobre o
   azul.

## Reancorar um casco na linha d'água

```bash
node reancorar.mjs entrada.glb saida.glb 4.80
```

O último argumento é o calado em metros **acima do ponto mais baixo do modelo**.
Cuidado ao medi-lo: no ASD 2810 o ponto mais baixo é a ponta do **skeg** (uma
lâmina de 0,13 m de meia-boca), não a quilha, que só começa 1,8 m acima. Ver
`docs/tecnica.md` §7.6.

Sem essa âncora o casco afunda ao dar zoom out no modo Earth — o Cesium assenta
a origem do modelo na altitude 0 e a amplia com a distância, multiplicando
qualquer erro de origem. A prova 15.6 guarda o invariante.

## Repintar um casco inteiro (libré) — v2.4.0

`repintar_libre.py` troca a pintura preservando todo o desgaste da textura.

```bash
python3 repintar_libre.py          # textures-br/ -> textures-saam/
```

### Duas técnicas, porque o problema é dois

- **Cor saturada → outra cor saturada** (vermelho → azul): gira o matiz e
  **preserva saturação e valor**. Estrias de ferrugem, linhas de chapa, sombras
  e sujeira sobrevivem. Pintar com cor chapada mata tudo isso.
- **Cinza → cor** (superestrutura → amarelo): rotação de matiz **não funciona**,
  porque cinza tem saturação zero e girar zero dá zero. Aqui se tinge:
  multiplica-se a cor-alvo pela luminância relativa. Mesmo princípio de pintar
  sobre primer.

### Obra viva em cor separada: TENTADO E RETIRADO

Houve uma ferramenta (`mascara_uv.mjs`) que tentava pintar o costado de preto
abaixo da cinta, derivando a divisão da geometria. **Foi retirada na v2.4.1
porque não funciona neste modelo**, e o resultado chegou a ser publicado com
defeito visível: preto numa faixa no meio do costado e obra viva azul — o
inverso do pretendido, com o nome do navio parcialmente coberto.

Duas técnicas foram tentadas e as duas falharam:

1. **Máscara por triângulo** (marcar o triângulo inteiro abaixo do corte). O
   triângulo que ATRAVESSA o corte não entra em lugar nenhum, e a divisão sai na
   borda da malha em vez da altura pedida.
2. **Assadura da altura por texel**, com interpolação baricêntrica. Mais
   correta em princípio, mas deixou **31,9% dos texels sem cobertura**, em
   manchas espalhadas pelo costado visível — a rasterização em UV não fecha
   neste desenho, que usa coordenadas de 0,005 a 1,990 (duas repetições).

Fica o registro para quem tentar de novo: **renderize a máscara de volta no
modelo e olhe** antes de confiar nela. Um diagnóstico que pinta abaixo-do-corte
de vermelho, acima de verde e sem-dados de magenta resolve em uma imagem o que
horas de raciocínio sobre UV não resolvem.

### A altura do corte se mede

O ponto mais largo do casco é a cinta de defensa. No ASD 2810 fica em
**y = +1,00 m** acima da linha d'água, e o corte do preto vai na base dela,
**+0,70 m**. Meça com um perfil de meia-boca por faixa; não escolha a olho.

### Cor de material sem mapa

O guincho (`1005`) não tem textura de cor, só metalicidade — a cor vem de um
fator:

```bash
COR_GUINCHO=F5BE1E node montar_modelo.mjs cru.glb tex1k/ saida.glb
```

O glTF guarda `baseColorFactor` em espaço **linear**. `montar_modelo.mjs`
converte de sRGB; passar o hex direto faz a cor sair lavada.


## Conferência obrigatória antes de publicar um casco

O defeito da v2.4.0 passou por uma falha de **processo**, não de ferramenta: as
renderizações de conferência foram feitas **sem plano d'água**, e ninguém
comparou o nome do navio antes e depois da repintura. O que se via era o casco
inteiro, incluindo a parte que na prática fica submersa — e ali o erro não
incomodava.

Antes de mandar um casco para o repositório:

1. **Renderize com a água em `y = 0`.** É onde o aplicativo a coloca, e é o
   único enquadramento que mostra o que o usuário vai ver. Sem o plano d'água, a
   conferência mente por omissão.
2. **Compare o nome antes e depois**, lado a lado, nos dois bordos e na popa. A
   sinalização é a primeira coisa que uma repintura mal feita come.
3. **Se usou máscara derivada da geometria, renderize a máscara de volta no
   modelo** com cores de diagnóstico (abaixo do corte em vermelho, acima em
   verde, sem-dados em magenta). Uma imagem resolve o que horas de raciocínio
   sobre coordenadas UV não resolvem.

Não há prova automatizada para isto. Foi tentada uma, comparando o tamanho da
textura comprimida entre cascos irmãos — e **não detectava o defeito**: o
arquivo com o nome apagado ficou em 1,05× o de referência, dentro de qualquer
limiar razoável. Conferir texto dentro de uma textura WebP exigiria um
decodificador que as provas não têm. Fica a conferência visual, escrita aqui
para não se perder.
