"""
Gera o array `lighthouses` corrigido a partir da reconciliação com a LF-40ED.

Política de alteração (conservadora, auditável):
  · altitude / rangeLum / rangeGeo / structHeight  -> sempre da DHN quando há
    correspondência confiável;
  · lat / lng -> só substituídos quando o desvio passa de 1,0 NM (erro real de
    posição), preservando a coordenada original nos demais para manter o diff
    revisável;
  · registros sem correspondência na LF-40 -> preservados como estão e marcados
    com source:'nao-consta-LF40', para ficarem visíveis em vez de silenciosos.
"""
import json, re, math, sys

REC = json.load(open(sys.argv[1], encoding='utf-8'))['registros']
LF  = [json.loads(l) for l in open(sys.argv[2], encoding='utf-8')]
OUT = sys.argv[3]

GM = re.compile(r'(\d{1,3})\s+(\d{1,2},\d{2})')

def lf_pos(r, lat_ref):
    """A LF não repete o hemisfério linha a linha. Cabo Orange (AP) e o
    Arquipélago de São Pedro e São Paulo ficam ao NORTE do equador, então o
    sinal da latitude é escolhido pelo hemisfério da posição de referência."""
    p = GM.findall(r['posicao'])
    if len(p) < 2:
        return None
    try:
        glat = int(p[0][0]) + float(p[0][1].replace(',', '.')) / 60
        glng = int(p[1][0]) + float(p[1][1].replace(',', '.')) / 60
    except ValueError:
        return None
    return (glat if lat_ref >= 0 else -glat, -glng)

por_ordem = {r['ordem_intl'].strip(): r for r in LF}

# Correções manuais confirmadas registro a registro contra a publicação.
# Cabo Frio: a base apontava para a Torre Notável (nº 2204), marca CEGA, sem
# luz; o farol é o nº 2400, 7,85 NM ao sul. Peba: altura e alcance já estavam
# certos, apenas a latitude estava 10 NM ao norte da posição oficial.
FORCA = {'Farol de Cabo Frio': '2400 G 0352', 'Farol de Peba': '1399.4 G 0227'}

# Sem registro correspondente na LF-40ED — preservados e marcados.
DUPLICADOS = {
    'Farol da Ilha do Mel':
        'mesma luz do Farol de Conchas (LF nº 3512, Farol das Conchas, na Ilha '
        'do Mel): a LF-40 não lista segundo farol num raio de 2,6 NM',
}

FORA_LF = {
    'Farol de Trindade':
        'a LF-40 lista apenas faroletes de alinhamento na Ilha da Trindade '
        '(Enseada dos Portugueses, ALT 45/46 m); não há farol único com este nome',
    'Farol de Martin Vaz':
        'nenhuma luz listada no arquipélago; a mais próxima fica a 25,8 NM, em Trindade',
    'Farol da Barra da Tijuca':
        'sem registro da LF na posição; origem OpenSeaMap, o vizinho da LF é a '
        'Ilha Pontuda a 4,7 NM',
}

ALT_TRAIL = re.compile(r'(?<!\d)(\d{1,3})\s*$')

def nm(a, b, c, d):
    R = 3440.065
    dla, dlo = math.radians(c - a), math.radians(d - b)
    h = math.sin(dla/2)**2 + math.cos(math.radians(a))*math.cos(math.radians(c))*math.sin(dlo/2)**2
    return 2 * R * math.asin(math.sqrt(h))

saida, mudou_pos, sem_lf, sem_alt = [], [], [], []
for r in REC:
    nome = r['name']
    lf = por_ordem.get(FORCA[nome]) if nome in FORCA else por_ordem.get((r.get('dhn_ordem') or '').strip())
    if nome in FORA_LF or not lf:
        saida.append({'name': nome, 'lat': r['lat'], 'lng': r['lng'],
                      'altitude': r['height'], 'rangeLum': r['range'], 'rangeGeo': None,
                      'structHeight': None, 'character': r['character'],
                      'lfId': None, 'source': 'nao-consta-LF40',
                      'nota': FORA_LF.get(nome, 'sem correspondência na LF-40ED')})
        sem_lf.append(nome)
        continue

    alt = int(re.search(r'(?<!\d)(\d{1,3})(?!\d)', lf['altitude_m']).group(1)) \
        if re.search(r'(?<!\d)(\d{1,3})(?!\d)', lf['altitude_m']) else None
    alc = [int(x) for x in re.findall(r'(?<!\d)(\d{1,3})(?!\d)', lf['alcances'])]
    est = ALT_TRAIL.search(lf['descricao_altura'].strip())
    lat, lng = r['lat'], r['lng']
    p = lf_pos(lf, lat)
    if p and nm(lat, lng, *p) > 1.0:
        mudou_pos.append((nome, round(nm(lat, lng, *p), 2), (lat, lng), p))
        lat, lng = round(p[0], 4), round(p[1], 4)
    if alt is None:
        sem_alt.append(nome)
    saida.append({'name': nome, 'lat': lat, 'lng': lng,
                  'altitude': alt if alt is not None else r['height'],
                  'rangeLum': alc[0] if alc else r['range'],
                  'rangeGeo': alc[1] if len(alc) > 1 else None,
                  'structHeight': int(est.group(1)) if est else None,
                  'character': r['character'],
                  'lfId': lf['ordem_intl'].split()[0],
                  'source': 'LF-40ED' if alt is not None else 'LF-40ED (sem altitude)',
                  'nota': None})

# ── Identificador único e estável por registro ────────────────────────────
# A máquina de estados dos alertas indexava por NOME, o que fazia os dois
# "Farol de Conceição" (SP e RS) compartilharem fase: passar por um deixava o
# outro marcado como já avistado. O id abaixo é único mesmo quando nome e nº da
# LF se repetem.
import unicodedata
def slug(t):
    t = unicodedata.normalize('NFKD', t.lower())
    t = ''.join(c for c in t if not unicodedata.combining(c))
    t = re.sub(r'^farol\s+(de|da|do|dos|das)\s+|^farol\s+', '', t)
    return re.sub(r'[^a-z0-9]+', '-', t).strip('-')

vistos = {}
for x in saida:
    base = slug(x['name'])
    vistos[base] = vistos.get(base, 0) + 1
for x in saida:
    base = slug(x['name'])
    x['id'] = base if vistos[base] == 1 else f"{base}-{x['lfId'] or 'app'}"
    if x['name'] in DUPLICADOS:
        x['nota'] = DUPLICADOS[x['name']]
ids = [x['id'] for x in saida]
assert len(set(ids)) == len(ids), 'id duplicado: ' + str([i for i in ids if ids.count(i) > 1])
saida = [{'id': x['id'], **{k: v for k, v in x.items() if k != 'id'}} for x in saida]

json.dump(saida, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('registros gerados      :', len(saida))
print('fora da LF-40 (marcados):', len(sem_lf), sem_lf)
print('sem altitude publicada  :', len(sem_alt), sem_alt)
print()
print('POSIÇÕES CORRIGIDAS (desvio > 1,0 NM):')
for n, d, a, b in sorted(mudou_pos, key=lambda z: -z[1]):
    print(f'  {n[:34]:34} {d:6.2f} NM   {a[0]:9.4f},{a[1]:9.4f}  ->  {b[0]:9.4f},{b[1]:9.4f}')
