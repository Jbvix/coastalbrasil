# Extrator da Lista de Faróis (DH2 / DHN)

Reconstrói a base de faróis do app a partir da publicação oficial da Diretoria
de Hidrografia e Navegação. Feito para ser repetido a cada edição bienal.

## Uso

Baixe o PDF da Lista de Faróis e coloque-o nesta pasta como
`LF-40ED-2026-2027.pdf` (o arquivo NÃO é versionado: tem 4 MB e é publicação
de terceiros).

```bash
pip install pymupdf
npm run lf:parse        # PDF        -> lf40_bruto.jsonl   (1.736 registros)
npm run lf:reconciliar  # + app.html -> reconciliacao.json (casamento por posição)
npm run lf:gerar        # -> data/farois_LF40ED.json
npm test                # confere o resultado
```

O último passo produz o JSON; a substituição do array `lighthouses` dentro do
`app.html` é feita à mão, deliberadamente, para que o diff seja revisado.

## As três armadilhas do PDF

Estão resolvidas no código, mas volte aqui se uma edição nova quebrar o parser.

**1. Margens espelhadas.** Páginas pares e ímpares estão deslocadas 28,3 pt
entre si. As fronteiras de coluna são normalizadas pelo marcador `(1)` de cada
página. Ignorar isso descarta metade da publicação.

**2. Marcadores no corpo.** Os rótulos `(2)`, `(3)` e `(4)` reaparecem dentro
das características das luzes — `Lp (2) B. 10s`. Delimitar a área de dados pela
última ocorrência deles corta o corpo da página. O topo só pode ser medido nos
marcadores do cabeçalho, com `y < 140`.

**3. Marcadores não são o centro da coluna.** Eles ficam centrados sob o
rótulo, mas o corpo é alinhado à esquerda. Usar o ponto médio entre marcadores
joga a descrição da estrutura dentro da coluna de alcances. As fronteiras vêm
da **extensão dos rótulos** do cabeçalho.

## As colunas que importam

| Col. | Campo na publicação | Vira no app |
|---|---|---|
| (2) | Nome / **carta náutica** | `name` — a carta é descartada |
| (3) | Posição GG MM,mm | `lat` / `lng` |
| (5) | **Altitude** do foco acima do nível médio do mar | `altitude` |
| (6) | Alcance luminoso / geográfico | `rangeLum` / `rangeGeo` |
| (7) | Descrição e **altura da estrutura** | `structHeight` |

A confusão entre a coluna (2) e a (5) foi a causa-raiz do defeito corrigido na
v2.1.0: o campo `height` da base antiga guardava o número da carta náutica.

## Hemisférios

A publicação não repete o hemisfério linha a linha. **Cabo Orange (AP)** e o
**Arquipélago de São Pedro e São Paulo** ficam ao norte do equador. O casador
testa os dois sinais de latitude e escolhe pelo mais próximo.
