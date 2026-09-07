"""
Reconcilia a base de faróis do app.html contra a Lista de Faróis DH2, 40ª ed.
Casamento por POSIÇÃO (grau/minuto -> decimal), com o nome como desempate.
"""
import json, re, math, sys, subprocess

LF   = sys.argv[1]          # lf40_bruto.jsonl
APP  = sys.argv[2]          # app.html
OUT  = sys.argv[3]          # reconciliacao.json

# ── base do app ───────────────────────────────────────────────────────────
src = open(APP, encoding='utf-8').read()
bloco = re.search(r'const lighthouses = \[(.*?)\n    \];', src, re.S).group(1)
app = []
for m in re.finditer(r'\{\s*name:\s*"([^"]+)",\s*lat:\s*(-?[\d.]+),\s*lng:\s*(-?[\d.]+),'
                     r'\s*height:\s*(\d+),\s*range:\s*(\d+),\s*character:\s*"([^"]*)"', bloco):
    app.append({'name': m.group(1), 'lat': float(m.group(2)), 'lng': float(m.group(3)),
                'height': int(m.group(4)), 'range': int(m.group(5)), 'character': m.group(6)})

# ── registros da DHN ──────────────────────────────────────────────────────
GM = re.compile(r'(\d{1,3})\s+(\d{1,2},\d{2})')
def pos_decimal(rec):
    """Lê 'GG MM,mm GGG MM,mm' -> (lat, lng) negativos (costa brasileira: S/W).
    Quando o grau vazou para a célula do nome, tenta recuperá-lo de lá."""
    pares = GM.findall(rec['posicao'])
    if len(pares) >= 2:
        (g1, m1), (g2, m2) = pares[0], pares[1]
    else:
        soltos = re.findall(r'(\d{1,2},\d{2})', rec['posicao'])
        graus  = re.findall(r'(?<!\d)(\d{1,2})(?!\d)', rec['nome_carta'])
        if len(soltos) < 2 or len(graus) < 2:
            return None
        (g1, m1), (g2, m2) = (graus[0], soltos[0]), (graus[1], soltos[1])
    try:
        lat = -(int(g1) + float(m1.replace(',', '.')) / 60)
        lng = -(int(g2) + float(m2.replace(',', '.')) / 60)
    except ValueError:
        return None
    if not (-75 < lng < -25):
        return None
    # A LF não repete o hemisfério em cada linha. O Amapá (Cabo Orange) e o
    # Arquipélago de São Pedro e São Paulo ficam ao NORTE do equador: devolve
    # as duas leituras e deixa o casamento por proximidade escolher.
    saidas = [(lat, lng)] if -35 < lat else []
    if 0 <= -lat < 6:
        saidas.append((-lat, lng))
    return saidas or None

NUM = re.compile(r'(?<!\d)(\d{1,3})(?!\d)')
def altitude(rec):
    n = NUM.findall(rec['altitude_m'])
    return int(n[0]) if n else None

def alcances(rec):
    """Coluna 6 traz alcance LUMINOSO e GEOGRÁFICO; quando a luz tem setores
    coloridos vêm prefixos B./E./V. Devolve os inteiros na ordem impressa."""
    return [int(x) for x in NUM.findall(rec['alcances'])]

dhn = []
for line in open(LF, encoding='utf-8'):
    r = json.loads(line)
    ps = pos_decimal(r)
    if not ps:
        continue
    alt, alc = altitude(r), alcances(r)
    nome = re.sub(r'\s+', ' ', re.split(r'\d', r['nome_carta'])[0]).strip(' -–—')
    for lat, lng in ps:
        dhn.append({**r, 'lat': lat, 'lng': lng, 'alt': alt, 'alc': alc, 'nome': nome})

def nm(a, b, c, d):
    R = 3440.065
    dla, dlo = math.radians(c - a), math.radians(d - b)
    h = math.sin(dla/2)**2 + math.cos(math.radians(a))*math.cos(math.radians(c))*math.sin(dlo/2)**2
    return 2 * R * math.asin(math.sqrt(h))

def norm(s):
    import unicodedata
    s = unicodedata.normalize('NFKD', s.lower())
    s = ''.join(ch for ch in s if not unicodedata.combining(ch))
    s = re.sub(r'^(farol|farolete|farol de|farol da|farol do|farol dos|farol das)\s+', '', s)
    return re.sub(r'[^a-z ]', '', s).strip()

result = []
for a in app:
    alvo = norm(a['name'])
    cands = []
    for r in dhn:
        d = nm(a['lat'], a['lng'], r['lat'], r['lng'])
        if d <= 6.0:
            nome_bate = alvo and (alvo in norm(r['nome']) or norm(r['nome']) in alvo)
            # ordem de preferência: nome bate E tem altitude > nome bate >
            # tem altitude > só proximidade
            rank = (0 if nome_bate else 2) + (0 if r['alt'] else 1)
            cands.append((rank, d, r))
    cands.sort(key=lambda z: (z[0], z[1]))
    if cands:
        rank, d, r = cands[0]
        result.append({**a, 'match': 'nome+posicao' if rank == 0 else 'posicao',
                       'dist_nm': round(d, 2), 'dhn_nome': r['nome'],
                       'dhn_ordem': r['ordem_intl'], 'dhn_pagina': r['pagina'],
                       'dhn_alt': r['alt'], 'dhn_alc': r['alc'],
                       'dhn_estrutura': r['descricao_altura'], 'dhn_lat': round(r['lat'], 4),
                       'dhn_lng': round(r['lng'], 4)})
    else:
        result.append({**a, 'match': 'SEM CORRESPONDENCIA'})

json.dump({'app_n': len(app), 'dhn_n': len(dhn), 'registros': result},
          open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('faróis no app        :', len(app))
print('registros DHN com posição legível:', len(dhn))
print('casados por nome+posição:', sum(1 for r in result if r['match'] == 'nome+posicao'))
print('casados só por posição  :', sum(1 for r in result if r['match'] == 'posicao'))
print('sem correspondência     :', sum(1 for r in result if r['match'] == 'SEM CORRESPONDENCIA'))
