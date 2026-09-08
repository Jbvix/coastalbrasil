#!/usr/bin/env python3
"""
Repinta o nome, o porto de registro e a marca da chaminé nas texturas do ASD 2810.
Autor: Jossian Brito (Charlie Bravo) · 2026-09-08 · v1.0

MÉTODO, EM TRÊS TEMPOS
  1. LOCALIZAR  — dentro de uma janela dada, acha os pixels claros (a letra) e
     devolve a caixa justa. Não se confia em coordenadas digitadas à mão: a
     caixa sai da imagem.
  2. APAGAR     — preenche a caixa interpolando VERTICALMENTE entre a linha
     imediatamente acima e a imediatamente abaixo dela, coluna por coluna.
     Preserva o degradê e as estrias do costado; um preenchimento com cor
     chapada deixaria um retângulo visível na renderização.
  3. ESCREVER   — desenha o texto novo com a MESMA altura de letra e centrado
     na mesma caixa, na cor amostrada das letras originais.
"""
from PIL import Image, ImageDraw, ImageFont

Image.MAX_IMAGE_PIXELS = None
FONTES = "/mnt/skills/examples/canvas-design/canvas-fonts/"
F_NOME = FONTES + "BigShoulders-Bold.ttf"        # condensada pesada, como o original
F_PORTO = FONTES + "LibreBaskerville-Regular.ttf"  # serifada, como "VALETTA"
F_MARCA = FONTES + "WorkSans-Bold.ttf"           # grotesca pesada, como o "K"


def claro(p, lim=150):
    r, g, b = p[:3]
    return r > lim and g > lim - 20 and b > lim - 20


def caixa_justa(px, jan, lim=150):
    """Caixa mínima que contém os pixels claros dentro da janela."""
    l, t, r, b = jan
    xs, ys = [], []
    for y in range(t, b):
        for x in range(l, r):
            if claro(px[x, y], lim):
                xs.append(x); ys.append(y)
    if not xs:
        return None
    return (min(xs), min(ys), max(xs) + 1, max(ys) + 1)


def cor_media(px, cx):
    """Cor média das letras — para o texto novo sair no mesmo branco."""
    l, t, r, b = cx
    s = [0, 0, 0]; n = 0
    for y in range(t, b):
        for x in range(l, r):
            p = px[x, y]
            if claro(p):
                s[0] += p[0]; s[1] += p[1]; s[2] += p[2]; n += 1
    return tuple(v // max(n, 1) for v in s) if n else (255, 255, 255)


def _mediana(px, xs, y):
    """Mediana por canal de uma tira de pixels — imune a um pixel claro solto."""
    am = [px[x, y] for x in xs]
    return tuple(sorted(a[k] for a in am)[len(am) // 2] for k in range(3))


def apagar(im, cx, folga=8, amostra=10):
    """
    Preenche a caixa interpolando HORIZONTALMENTE, linha a linha, entre a
    mediana de uma tira à esquerda e outra à direita.

    POR QUE HORIZONTAL, E NÃO VERTICAL: o costado tem faixas de brilho que
    correm na horizontal (o degradê do casco, o reflexo da defensa). Interpolar
    na vertical arrasta o brilho da própria letra ao longo da coluna e deixa
    ESTRIAS VERTICAIS visíveis na renderização — erro cometido e corrigido.
    Interpolando por linha, cada faixa horizontal se reconstrói com o tom que
    ela já tem à esquerda e à direita do texto.

    A mediana (em vez da média de um único pixel) evita que um respingo claro
    encostado na letra contamine a linha inteira.
    """
    px = im.load()
    l, t, r, b = cx
    l2, r2 = max(l - folga, 0), min(r + folga, im.width)
    xe = [x for x in range(max(l2 - amostra - 2, 0), max(l2 - 2, 1))]
    xd = [x for x in range(min(r2 + 2, im.width - 1), min(r2 + amostra + 2, im.width))]
    if not xe or not xd:
        return
    larg = max(r2 - l2, 1)
    for y in range(max(t - folga, 0), min(b + folga, im.height)):
        ce, cd = _mediana(px, xe, y), _mediana(px, xd, y)
        for i, x in enumerate(range(l2, r2)):
            f = (i + 1) / (larg + 1)
            px[x, y] = tuple(int(ce[k] * (1 - f) + cd[k] * f) for k in range(3))


def linhas_de_texto(px, jan, lim=150, gap=6):
    """
    Separa as linhas de texto dentro de uma janela: devolve uma caixa justa por
    linha, de cima para baixo. Evita o erro de recortar o nome e o porto na
    mesma caixa — que foi o que estourou a caixa "B" na primeira tentativa.
    """
    l, t, r, b = jan
    linhas_com_texto = []
    for y in range(t, b):
        if any(claro(px[x, y], lim) for x in range(l, r)):
            linhas_com_texto.append(y)
    if not linhas_com_texto:
        return []
    faixas, ini, ant = [], linhas_com_texto[0], linhas_com_texto[0]
    for y in linhas_com_texto[1:]:
        if y - ant > gap:
            faixas.append((ini, ant + 1)); ini = y
        ant = y
    faixas.append((ini, ant + 1))
    saida = []
    for (y0, y1) in faixas:
        xs = [x for y in range(y0, y1) for x in range(l, r) if claro(px[x, y], lim)]
        if xs and (y1 - y0) >= 12:
            saida.append((min(xs), y0, max(xs) + 1, y1))
    return saida


def escrever(im, cx, texto, caminho_fonte, cor):
    """Desenha centrado na caixa, com a altura de letra da caixa original."""
    l, t, r, b = cx
    alvo_h, alvo_w = b - t, r - l
    tam = alvo_h * 2
    while tam > 4:
        fnt = ImageFont.truetype(caminho_fonte, tam)
        cx2 = fnt.getbbox(texto)
        if (cx2[3] - cx2[1]) <= alvo_h and (cx2[2] - cx2[0]) <= alvo_w:
            break
        tam -= 1
    fnt = ImageFont.truetype(caminho_fonte, tam)
    bb = fnt.getbbox(texto)
    tw, th = bb[2] - bb[0], bb[3] - bb[1]
    x = l + (alvo_w - tw) // 2 - bb[0]
    y = t + (alvo_h - th) // 2 - bb[1]
    ImageDraw.Draw(im).text((x, y), texto, font=fnt, fill=cor)
    return tam


def apagar_chapado(im, cx, folga=6, raio=14):
    """
    Preenche a caixa com a cor CHAPADA do fundo, amostrada num anel em volta
    da letra — mas contando só os pixels que NÃO são a letra.

    QUANDO USAR ESTA E NÃO apagar(): quando o fundo é um painel de cor uniforme
    e LIMITADO, como a marca da chaminé. Ali a interpolação por linha vai
    buscar amostra além da borda do painel, na estrutura cinza ao lado, e
    espalha faixas cinza-azuladas por cima do azul — erro cometido e corrigido.
    Fundo chapado se reconstrói com uma cor só; fundo com degradê, não.
    """
    px = im.load()
    l, t, r, b = cx
    amostras = []
    for y in range(max(t - raio, 0), min(b + raio, im.height)):
        for x in range(max(l - raio, 0), min(r + raio, im.width)):
            dentro = l - folga <= x < r + folga and t - folga <= y < b + folga
            if not dentro and not claro(px[x, y]):
                amostras.append(px[x, y])
    if not amostras:
        return
    cor = tuple(sorted(a[k] for a in amostras)[len(amostras) // 2] for k in range(3))
    for y in range(max(t - folga, 0), min(b + folga, im.height)):
        for x in range(max(l - folga, 0), min(r + folga, im.width)):
            px[x, y] = cor
    return cor


def cor_letra_escura(px, cx, pct=15):
    """
    Valor das letras num mapa onde elas são MAIS ESCURAS que o fundo — o caso
    da rugosidade: a tinta do nome é mais lisa que a chapa do costado.

    cor_media() não serve aqui: ela procura pixels claros e, num mapa de
    rugosidade, devolveria o FUNDO. Escrever a letra com o valor do fundo a
    torna invisível — e o nome antigo, que continua gravado, segue aparecendo.
    Toma-se o percentil baixo dentro da caixa, que é onde a letra vive.
    """
    l, t, r, b = cx
    v = sorted(px[x, y][0] for y in range(t, b) for x in range(l, r))
    if not v:
        return (128, 128, 128)
    n = v[max(0, min(len(v) - 1, len(v) * pct // 100))]
    return (n, n, n)
