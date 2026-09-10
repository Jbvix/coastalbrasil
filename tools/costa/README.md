# tools/costa — linha de costa brasileira

Autor: Jossian Brito (Charlie Bravo) · 2026-09-10

Gera `assets/js/coastline.js`, a linha usada por `distanceFromCoast()`.

```bash
node tools/costa/gerar_costa.mjs          # tolerância padrão: 0,1 NM
node tools/costa/gerar_costa.mjs 0.25     # outra tolerância, em NM
```

## O que havia antes

A "linha de costa" era a **lista de faróis ordenada por latitude** — 88 pontos
ligados em sequência. Uma reta entre dois faróis corta baías inteiras. Aferido
contra a costa em resolução plena, em 1.440 pontos ao largo:

| | erro médio | pior |
|---|---|---|
| faróis (88 pontos), só continente | 13,4 NM | 105,6 NM |
| faróis (88 pontos), com ilhas | 48,3 NM | 273,4 NM |
| Natural Earth 10 m a 0,1 NM | 0,01 NM | 0,1 NM |

## Por que 0,1 NM de tolerância

É a resolução com que o número aparece na tela (`~3.2 NM`). Simplificar mais
introduziria erro na casa exibida; menos gastaria banda de bordo sem nada a
mostrar. Resultado: 105 KB crus, **28 KB comprimidos**.

A simplificação é Douglas-Peucker com distância em **milhas náuticas**, não em
graus — um grau de longitude vale coisas diferentes no Oiapoque e no Chuí.

## As três fontes

1. **`ne_10m_coastline`** — continente e ilhas grandes.
2. **`ne_10m_minor_islands_coastline`** — parte das ilhas pequenas.
3. **A Lista de Faróis do próprio repositório.** Nem uma nem outra traz Rocas,
   Abrolhos, Alcatrazes, Laje de Santos ou Queimada Grande — justamente as que
   têm farol. Onde não há litoral perto de um farol, o gerador emite um anel de
   0,2 NM na posição dele.

**O que essas ilhotas são:** a afirmação *"existe terra aqui"*, que a DHN
garante. **O que não são:** o contorno levantado da ilha. O raio é convenção;
Alcatrazes (1,4 km) fica subdimensionada e um rochedo, superdimensionado. Serve
para a distância à terra deixar de errar dezenas de milhas — não para navegar
por dentro.

## Formato, e uma armadilha

Lista de **traços**; cada traço é uma lista de `[lat, lng]`. Traços separados são
litorais distintos — o continente e cada ilha.

**Nunca ligue um traço ao seguinte.** A reta entre eles cruzaria mar aberto e a
distância calculada sairia menor que a real — que foi exatamente o defeito da
implementação por faróis.

## Depois de regenerar

`npm test`, suíte 10. A prova **10.2** é a mais valiosa: todo farol tem de cair
sobre a linha de costa, porque um farol está em terra. Foi ela que denunciou
Rocas a 81 NM da costa mais próxima do arquivo. Se um trecho de litoral sumir na
regeneração, é ela que acusa.
