#!/usr/bin/env python3
"""
PROVA DE CONCEITO — libré SAAM (azul e amarelo) no ASD 2810.
Autor: Jossian Brito (Charlie Bravo) · 2026-09-09

DUAS TÉCNICAS, PORQUE O PROBLEMA É DOIS

  1. VERMELHO -> AZUL  (casco, amurada)
     O vermelho já é uma cor SATURADA. Basta girar o matiz e preservar
     saturação e valor. Assim sobrevivem intactos: estrias de ferrugem,
     linhas de chapa, sombras, sujeira, o desgaste todo. Repintar com cor
     chapada mataria isso e o casco viraria um brinquedo de plástico.

  2. CINZA -> AMARELO  (superestrutura, mastro)
     Cinza tem saturação ZERO — girar o matiz não faz nada. Aqui a técnica é
     tingir: multiplica-se a cor-alvo pela luminância relativa do pixel. O
     meio-tom cai exatamente na cor-alvo, o realce continua claro e a sombra
     continua escura. É o mesmo princípio de pintar sobre um primer cinza.

O QUE NÃO SE TOCA
  · preto (V < 0,16): cinta de defensa, pneus, obra viva — já são pretos na
    libré SAAM, então ficam como estão;
  · branco de alta luminância e baixa saturação: o nome do navio e as marcas
    de bordo livre, que na libré SAAM são brancos sobre o azul.
"""
import colorsys
import os
import sys

from PIL import Image

Image.MAX_IMAGE_PIXELS = None

# Cores estimadas da foto do SAAM CRAO (luz encoberta — ver ressalva no relatório)
SAAM_AZUL = (0x0E, 0x6E, 0xB8)
SAAM_AMARELO = (0xF5, 0xBE, 0x1E)

V_PRETO = 0.16       # abaixo disto é preto de defensa / obra viva: não mexe
S_NEUTRO = 0.16      # abaixo disto a cor é cinza/branco: candidata a tingir
V_BRANCO = 0.97      # só o branco quase puro escapa: na libré SAAM a superestrutura é amarela até o realce


def gira_matiz(r, g, b, alvo_rgb):
    """Vermelho -> azul preservando saturação e valor (todo o desgaste)."""
    H, S, V = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
    Ha, Sa, Va = colorsys.rgb_to_hsv(*[c / 255 for c in alvo_rgb])
    # A saturação do alvo entra como TETO, não como valor fixo: uma chapa
    # desbotada continua desbotada, só que em azul.
    nr, ng, nb = colorsys.hsv_to_rgb(Ha, min(S, Sa) * (Sa / max(Sa, 1e-6)), V)
    return int(nr * 255), int(ng * 255), int(nb * 255)


def tinge(r, g, b, alvo_rgb, lum_ref):
    """Cinza -> amarelo multiplicando a cor-alvo pela luminância relativa."""
    lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
    k = lum / max(lum_ref, 1e-6)
    return tuple(min(255, int(c * k)) for c in alvo_rgb)


def repinta(caminho_entrada, caminho_saida, fazer_casco, fazer_super):
    im = Image.open(caminho_entrada).convert("RGB")
    px = im.load()
    w, h = im.size

    # Luminância média das áreas cinzentas: é o ponto onde o amarelo-alvo cai
    # exatamente na cor da lata. Sem isso, a superestrutura sai ou lavada ou suja.
    soma, n = 0.0, 0
    for y in range(0, h, 8):
        for x in range(0, w, 8):
            r, g, b = px[x, y]
            H, S, V = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            if S < S_NEUTRO and V_PRETO <= V < V_BRANCO:
                soma += (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
                n += 1
    lum_ref = soma / n if n else 0.55

    contas = {"azul": 0, "amarelo": 0, "intacto": 0}
    for y in range(h):
        for x in range(w):
            r, g, b = px[x, y]
            H, S, V = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            if V < V_PRETO:                      # preto de defensa / obra viva
                contas["intacto"] += 1
            elif fazer_casco and S >= S_NEUTRO and (H < 0.055 or H > 0.93):
                px[x, y] = gira_matiz(r, g, b, SAAM_AZUL)
                contas["azul"] += 1
            elif fazer_super and S < S_NEUTRO and V < V_BRANCO:
                px[x, y] = tinge(r, g, b, SAAM_AMARELO, lum_ref)
                contas["amarelo"] += 1
            else:                                 # branco de letreiro, azul do logo
                contas["intacto"] += 1
    im.save(caminho_saida)
    tot = sum(contas.values())
    print(f"  {os.path.basename(caminho_saida):<34} "
          f"azul {100*contas['azul']/tot:4.1f}% · "
          f"amarelo {100*contas['amarelo']/tot:4.1f}% · "
          f"intacto {100*contas['intacto']/tot:4.1f}%  (lum_ref {lum_ref:.2f})")


if __name__ == "__main__":
    SRC, DST = "textures-br", "textures-saam"
    os.makedirs(DST, exist_ok=True)
    import shutil
    for f in os.listdir(SRC):
        shutil.copy(f"{SRC}/{f}", f"{DST}/{f}")
    # (material, casco?, superestrutura?)
    # (material, vermelho->azul?, cinza->amarelo?)
    PLANO = [("1001", False, True),   # cabine + mastro -> amarelo
             ("1002", True,  False),  # casco           -> azul (obra viva vira preta à parte)
             ("1003", True,  False),  # amurada -> azul; o CONVÉS fica como está:
                                      # no SAAM a chapa do convés é escura, e tingi-la
                                      # de amarelo dava um tombadilho cor de gema
             ("1004", False, True)]   # cabine média    -> amarelo
    print("Repintura SAAM — mapa por material\n")
    for mid, casco, sup in PLANO:
        f = f"ASD_TUG_RED_{mid}_BaseColor.png"
        repinta(f"{SRC}/{f}", f"{DST}/{f}", casco, sup)
