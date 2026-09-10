#!/usr/bin/env python3
"""
Etapa 2 — identidade do casco na libré SAAM.
  AGUIA  -> SAAM AGUIA      BRASIL -> RIO DE JANEIRO      B -> marca da casa
Autor: Jossian Brito (Charlie Bravo) · 2026-09-10

DUAS DECISÕES QUE VALEM EXPLICAR

1. AS CAIXAS VOLTAM A SER AS ORIGINAIS DO "SD REBEL".
   "SAAM AGUIA" tem o dobro da largura de "AGUIA". Mantida a caixa atual, a
   função de escrita encolheria a fonte para caber, e o nome sairia miúdo — não
   é assim que se pinta nome de navio. As caixas do "SD REBEL" original são área
   de costado limpa, já medida e conhecida, e comportam o nome novo na altura de
   letra certa.

2. O PORTO DE REGISTRO HERDA A LARGURA DO NOME.
   "RIO DE JANEIRO" tem 14 caracteres contra 6 de "BRASIL". Alargá-lo na
   proporção do texto o faria invadir chapa que não é dele. Na prática de
   sinalização naval o porto vai em corpo MENOR, dentro da largura do nome —
   é o que se faz aqui: mesma largura da caixa do nome, altura própria.

E A LIÇÃO DA v2.3.2: o texto vive em DOIS mapas, cor e rugosidade. Trocar só a
cor deixa o nome antigo reaparecendo sob luz rasante, por cima do novo.
"""
import os
import sys

from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pintar import F_NOME, F_PORTO, apagar, apagar_chapado, cor_letra_escura, cor_media, escrever

Image.MAX_IMAGE_PIXELS = None
DST = "textures-saam"

# Caixas do "SD REBEL"/"VALETTA" originais (medidas na v2.3.2).
# O porto recebe a largura do nome, centrado, mantendo a própria altura.
OCORRENCIAS = [
    ("A", (1650, 705, 1949, 759), (1650, 772, 1949, 812)),
    ("B", (379, 824, 678, 879), (379, 893, 678, 933)),
    ("C", (948, 1133, 1373, 1209), None),
    ("E", (3150, 1521, 3395, 1561), (3150, 1575, 3395, 1605)),
    ("F", (169, 1574, 594, 1644), None),
]
NOME, PORTO = "SAAM AGUIA", "RIO DE JANEIRO"


def marca_da_casa(im, cx, cor_fundo):
    """
    Marca da chaminé: duas cunhas brancas ascendentes sobre o painel azul —
    esteira de rebocador estilizada.

    NÃO é a reprodução do símbolo registrado da SAAM: o aplicativo é público, e
    carimbar a marca de uma empresa real num modelo distribuído é outra conversa,
    que não cabe decidir aqui. Fica um desenho próprio, no espírito da libré.
    """
    l, t, r, b = cx
    w, h = r - l, b - t
    d = ImageDraw.Draw(im)
    for k, (dy, esc) in enumerate([(0.00, 1.00), (0.42, 0.78)]):
        y0 = t + h * (0.16 + dy)
        pts = [(l + w * 0.14, y0 + h * 0.30 * esc),
               (l + w * 0.50, y0),
               (l + w * 0.86, y0 + h * 0.30 * esc),
               (l + w * 0.86, y0 + h * 0.46 * esc),
               (l + w * 0.50, y0 + h * 0.16 * esc),
               (l + w * 0.14, y0 + h * 0.46 * esc)]
        d.polygon(pts, fill=(246, 246, 246))


def aplica(mapa, escuro):
    """Aplica nome e porto num mapa. `escuro`: a letra é mais escura que o fundo."""
    im = Image.open(f"{DST}/{mapa}").convert("RGB")
    px = im.load()
    for nome, cxn, cxp in OCORRENCIAS:
        for cx, texto, fonte in ((cxn, NOME, F_NOME), (cxp, PORTO, F_PORTO)):
            if cx is None:
                continue
            tinta = cor_letra_escura(px, cx) if escuro else cor_media(px, cx)
            apagar(im, cx)
            px = im.load()
            t = escrever(im, cx, texto, fonte, tinta)
            print(f"    {nome} {texto:<15} {cx[2]-cx[0]}x{cx[3]-cx[1]}  fonte {t}px  tinta {tinta[0]}")
    im.save(f"{DST}/{mapa}")


print("── casco: cor ──")
aplica("ASD_TUG_RED_1002_BaseColor.png", escuro=False)
print("── casco: rugosidade (o nome vive nos dois mapas) ──")
aplica("ASD_TUG_RED_1002_Roughness.png", escuro=True)

print("── chaminé: marca da casa ──")
im4 = Image.open(f"{DST}/ASD_TUG_RED_1004_BaseColor.png").convert("RGB")
p4 = im4.load()
for i, cx in enumerate([(285, 303, 495, 480), (1015, 48, 1235, 210)], 1):
    # O painel da marca é azul; sem restringir, a mediana traz o amarelo em volta.
    fundo = apagar_chapado(im4, cx, folga=5, filtro=lambda c: c[2] > c[0] + 30 and c[2] > c[1])
    marca_da_casa(im4, cx, fundo)
    print(f"    marca {i}: {cx[2]-cx[0]}x{cx[3]-cx[1]}  fundo {fundo}")
im4.save(f"{DST}/ASD_TUG_RED_1004_BaseColor.png")
