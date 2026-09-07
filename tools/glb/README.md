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
