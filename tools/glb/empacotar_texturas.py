#!/usr/bin/env python3
"""
Coastal Navigator Brasil — preparo das texturas PBR de um casco 3D
Autor: Jossian Brito (Charlie Bravo) · 2026-09-07 · v1.0

O QUE ESTE PROGRAMA RESOLVE
    Um pacote de texturas de modelagem chega como PNG de 4096x4096, um arquivo
    por canal: cor-base, metalicidade, rugosidade, normal, emissiva. Somados
    passam de 40 MB — inviável para uma rede de bordo. E o glTF, ao contrário
    do FBX, NAO aceita metalicidade e rugosidade em arquivos separados: exige
    as duas no mesmo mapa, uma em cada canal de cor.

    Este programa faz as duas coisas: funde os canais e encolhe tudo.

O EMPACOTAMENTO ORM
    R = oclusao ambiente   (255 = sem oclusao; nao temos esse mapa)
    G = rugosidade         (0 = espelho, 255 = fosco)
    B = metalicidade       (0 = dieletrico, 255 = metal)

    Se faltar rugosidade, entra um cinza 153 (=0,6) em vez de deixar o canal
    vazio: canal zerado o motor le como ESPELHO PERFEITO, e o casco vira um
    cromado. Se faltar metalicidade, entra 0 — dieletrico, que e o que a
    esmagadora maioria de uma superestrutura pintada e de fato.

O QUE MUDA COM O TAMANHO
    N = 1024 reduz 44 MB para ~0,6 MB e a perda so aparece com a camera
    encostada no costado. N = 2048 quadruplica o peso para ganhar legibilidade
    do nome do navio no costado. Para um painel de atitude, 1024 basta.

USO
    python3 empacotar_texturas.py <pasta_dos_png> <pasta_saida> [N]

    Os PNG devem seguir o padrao <prefixo>_<codigo>_<Canal>.png, onde <codigo>
    e o mesmo numero de quatro digitos que aparece no nome do material dentro
    do FBX (ex.: Hool_1002_mat  <->  ASD_TUG_RED_1002_BaseColor.png). E esse
    numero que montar_modelo.mjs usa para casar textura com material.
"""
import os
import re
import sys

from PIL import Image

Image.MAX_IMAGE_PIXELS = None

CANAIS = ("BaseColor", "Metalness", "Roughness", "Normal", "Emissive")


def codigos(src):
    """Descobre os codigos de material presentes na pasta."""
    achados = set()
    for nome in os.listdir(src):
        m = re.search(r"_(\d{4})_(%s)\.png$" % "|".join(CANAIS), nome)
        if m:
            achados.add(m.group(1))
    return sorted(achados)


def abrir(src, codigo, canal):
    for nome in os.listdir(src):
        if nome.endswith("_%s_%s.png" % (codigo, canal)):
            return Image.open(os.path.join(src, nome))
    return None


def empacotar(src, dst, n):
    os.makedirs(dst, exist_ok=True)
    total = 0
    for codigo in codigos(src):
        base = abrir(src, codigo, "BaseColor")
        if base:
            # Cor-base e a unica em espaco sRGB; qualidade 88 e o joelho da
            # curva — abaixo disso o vermelho do casco comeca a manchar.
            base.convert("RGB").resize((n, n), Image.LANCZOS).save(
                "%s/%s_basecolor.webp" % (dst, codigo), "WEBP", quality=88, method=6)

        normal = abrir(src, codigo, "Normal")
        if normal:
            # Normal NAO e cor: cada pixel e um vetor. Compressao agressiva
            # entorta a iluminacao, entao 95.
            normal.convert("RGB").resize((n, n), Image.LANCZOS).save(
                "%s/%s_normal.webp" % (dst, codigo), "WEBP", quality=95, method=6)

        rug = abrir(src, codigo, "Roughness")
        met = abrir(src, codigo, "Metalness")
        if rug or met:
            g = rug.convert("L").resize((n, n), Image.LANCZOS) if rug else Image.new("L", (n, n), 153)
            b = met.convert("L").resize((n, n), Image.LANCZOS) if met else Image.new("L", (n, n), 0)
            r = Image.new("L", (n, n), 255)
            Image.merge("RGB", (r, g, b)).save(
                "%s/%s_orm.webp" % (dst, codigo), "WEBP", quality=90, method=6)

        emi = abrir(src, codigo, "Emissive")
        if emi:
            emi.convert("RGB").resize((n, n), Image.LANCZOS).save(
                "%s/%s_emissive.webp" % (dst, codigo), "WEBP", quality=85, method=6)

    for nome in sorted(os.listdir(dst)):
        tam = os.path.getsize(os.path.join(dst, nome))
        total += tam
        print("%-28s %8.1f KB" % (nome, tam / 1024))
    print("%-28s %8.2f MB" % ("TOTAL", total / 1048576))


if __name__ == "__main__":
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    empacotar(sys.argv[1], sys.argv[2], int(sys.argv[3]) if len(sys.argv) > 3 else 1024)
