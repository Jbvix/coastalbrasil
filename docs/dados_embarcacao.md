# Dados de bordo — Coastal Navigator Brasil

Autor: Jossian Brito (Charlie Bravo)

Este arquivo guarda os **números medidos a bordo** que alimentam os cálculos do
app. Não são estimativas de catálogo nem valores de projeto: são o que o chefe
de máquinas informou da praça de máquinas real.

> **Por que isto existe como arquivo.** Um dado de bordo informado numa conversa
> e não gravado em lugar nenhum se perde na sessão seguinte — e aí volta-se a
> chutar. A Lista de Faróis veio da DHN, a linha de costa veio da Natural Earth,
> e a curva de consumo vai vir DAQUI.

---

## Rebocador ASD 2810 — faixa de rotação

Informado por Charlie Bravo em 20/09/2026.

| Regime | RPM | Observação |
|---|---|---|
| **Marcha lenta** (idle) | **650** | motor girando, sem propulsão útil |
| **Cruzeiro** | **1250** | regime de serviço, onde o navio passa a maior parte do tempo |
| **Máxima** | **1800** | MCR |

### O que estes três números permitem calcular

**Fração de rotação.** O útil não é o RPM absoluto, é a fração acima da marcha
lenta — abaixo de 650 não há propulsão nenhuma:

```
n  = (RPM - 650) / (1800 - 650)        0 na lenta, 1 na máxima
```

No cruzeiro de 1250: `n = (1250-650)/1150 = 0,522` — ou seja, **o regime de
serviço está em 52% da faixa útil de rotação.**

**Lei da hélice.** Passo fixo e carga constante: a potência vai com o cubo da
rotação e a velocidade, aproximadamente, com a primeira potência. Logo:

```
L/h    ∝ RPM³          consumo por HORA
L/NM   ∝ RPM²          consumo por MILHA   (porque L/NM = (L/h)/V e V ∝ RPM)
```

**O que isso significa na prática desta faixa.** Saindo de 1250 para 1125 rpm
(−10%):

| | Variação |
|---|---|
| Consumo por hora | **−27%** (0,9³ = 0,729) |
| Consumo por milha | **−19%** (0,9² = 0,81) |
| Tempo de viagem | **+11%** (1/0,9) |

**E onde isso PARA de valer** — os quatro pisos, que entram no Sprint 4:

1. **Corrente contrária.** O combustível se gasta por milha *na água*, mas o ETA
   se cumpre por milha *no fundo*. Minimizando `V³/(V−Vc)` sai
   **`V_ótimo = 1,5 × V_corrente`**. Abaixo disso, reduzir rotação passa a
   **gastar mais** por milha percorrida, e tende ao infinito quando a velocidade
   iguala a corrente — porque aí não se chega nunca.
2. **SFOC em U.** O consumo específico (g/kWh) tem mínimo por volta de 70–85% da
   MCR. Abaixo de ~40% de carga o motor queima mais por kWh.
3. **Carga hoteleira.** Constante; muito devagar, ela domina e o L/NM sobe.
4. **Governo.** Um ASD devagar com vento de través tem abatimento que economia
   nenhuma paga.

### O que ainda falta medir

Para ancorar a curva real deste casco, faltam **dois pares (RPM, consumo)**
observados — por exemplo, o consumo horário em 1250 e em 1500. Com dois pontos
a constante da lei cúbica fica determinada no primeiro dia de uso, em vez de
esperar horas de viagem para o app aprender sozinho.

---

## Sensores do tablet de bordo — Samsung Galaxy Tab S10 FE

Verificado em 20/09/2026 nas especificações do fabricante.

| Sensor | Existe? | Uso previsto |
|---|---|---|
| Acelerômetro | ✅ | atitude, espectro de heave (Sprint 5) |
| Giroscópio | ✅ | fusão de atitude, jogo e caturro |
| Bússola | ✅ | proa magnética |
| **Barômetro** | ❌ | **não existe** — a tendência barométrica terá de vir do Open-Meteo (`pressure_msl`) |

A ausência do barômetro é uma restrição de projeto, não um detalhe: "o
barômetro está caindo" é o mais antigo aviso de mau tempo que existe, e neste
aparelho ele não pode ser medido — só previsto.
