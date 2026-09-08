#!/usr/bin/env python3
"""
Repinta a identidade do ASD 2810: SD REBEL -> AGUIA, VALETTA -> BRASIL, K -> B.
Autor: Jossian Brito (Charlie Bravo) · 2026-09-08 · v1.1
v1.1: preenchimento por linha (era por coluna, deixava estrias) e separação
      automática das duas linhas de texto (o nome e o porto de registro).
v1.2: a marca da chaminé usa preenchimento chapado — o painel azul é limitado,
      e a interpolação buscava amostra na estrutura cinza ao lado.
v1.3: repinta TAMBÉM o mapa de RUGOSIDADE. A tinta das letras tem rugosidade
      diferente do costado, e o nome fica gravado ali além da cor. Trocar só a
      cor deixava "SD REBEL" reaparecendo como brilho sob luz rasante, por cima
      do "AGUIA" — fantasma visível na renderização, invisível na textura de
      cor. Reusa as MESMAS caixas: os dois mapas compartilham as UV.
"""
import os, sys, shutil
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pintar import *

SRC, DST = "textures", "textures-br"
os.makedirs(DST, exist_ok=True)
for f in os.listdir(SRC):
    shutil.copy(f"{SRC}/{f}", f"{DST}/{f}")

# Uma janela por ocorrência, cobrindo nome E porto. As caixas justas de cada
# linha saem da imagem, não de coordenadas digitadas.
JANELAS = [("A", (1580, 690, 2020, 840)), ("B", (310, 805, 750, 950)),
           ("C", (880, 1115, 1440, 1225)), ("E", (3090, 1505, 3440, 1620)),
           ("F", (110, 1560, 660, 1660))]

im = Image.open(f"{DST}/ASD_TUG_RED_1002_BaseColor.png").convert("RGB")
px = im.load()
CAIXAS = []          # (nome, caixa, texto, fonte) — reaproveitadas na rugosidade
print("── casco 1002 · cor ──")
for nome, jan in JANELAS:
    linhas = linhas_de_texto(px, jan)
    if not linhas:
        print(f"  {nome}: NADA em {jan}"); continue
    for i, cx in enumerate(linhas):
        alvo, fonte = ("AGUIA", F_NOME) if i == 0 else ("BRASIL", F_PORTO)
        cor = cor_media(px, cx)
        apagar(im, cx); px = im.load()
        t = escrever(im, cx, alvo, fonte, cor)
        CAIXAS.append((f"{nome}.{i+1}", cx, alvo, fonte))
        print(f"  {nome}.{i+1}: {cx}  {cx[2]-cx[0]}x{cx[3]-cx[1]}  {t}px -> {alvo}")
im.save(f"{DST}/ASD_TUG_RED_1002_BaseColor.png")

# ── MESMAS caixas, agora na RUGOSIDADE ──────────────────────────────────────
# As letras existem em dois mapas: na cor (o que se vê) e na rugosidade (o
# brilho da tinta). Trocar só a cor deixa o nome antigo reaparecendo sob luz
# rasante. Os dois mapas compartilham as UV, então as caixas servem aos dois.
rug = Image.open(f"{DST}/ASD_TUG_RED_1002_Roughness.png").convert("RGB")
esc = rug.width / im.width
print(f"── casco 1002 · rugosidade ({rug.width}px, escala {esc:g}) ──")
for nome, cx, alvo, fonte in CAIXAS:
    c = tuple(int(round(v * esc)) for v in cx)
    px_r = rug.load()
    letra = cor_letra_escura(px_r, c)   # na rugosidade a tinta é MAIS ESCURA que a chapa
    apagar(rug, c)
    escrever(rug, c, alvo, fonte, letra)
    print(f"  {nome}: {c}  tinta {letra[0]} (fundo ~{cor_media(px_r, c)[0]}) -> {alvo}")
rug.save(f"{DST}/ASD_TUG_RED_1002_Roughness.png")

print("── cabine 1004 (marca da chaminé) ──")
im4 = Image.open(f"{DST}/ASD_TUG_RED_1004_BaseColor.png").convert("RGB")
p4 = im4.load()
for i, jan in enumerate([(285, 295, 495, 480), (1015, 25, 1235, 210)], 1):
    linhas = linhas_de_texto(p4, jan, lim=170, gap=10)
    if not linhas:
        print(f"  marca {i}: NADA em {jan}"); continue
    cx = max(linhas, key=lambda c: (c[2]-c[0])*(c[3]-c[1]))
    cor = cor_media(p4, cx)
    fundo = apagar_chapado(im4, cx, folga=5); p4 = im4.load()
    t = escrever(im4, cx, "B", F_MARCA, cor)
    print(f"  marca {i}: {cx}  {cx[2]-cx[0]}x{cx[3]-cx[1]}  fundo {fundo}  {t}px -> B")
im4.save(f"{DST}/ASD_TUG_RED_1004_BaseColor.png")
