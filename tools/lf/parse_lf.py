"""
Parser da Lista de Faróis DH2 — 40ª edição 2026/2027 (DHN/CHM).

Extrai os registros por POSIÇÃO DE COLUNA, usando os marcadores (1)..(8) do
cabeçalho de cada página como âncoras — necessário porque a publicação tem
margens espelhadas (páginas ímpares e pares deslocadas 28,3 pt entre si).

Colunas da publicação:
  (1) Nº de ordem e nº internacional
  (2) Local / nome / carta náutica / classificação
  (3) Posição (lat GG MM,mm S · long GGG MM,mm W)
  (4) Característica / período / fase / intensidade
  (5) ALTITUDE  -> altura FOCAL acima do nível médio do mar  [é esta que a
                   fórmula 2,08·(√h1+√h2) exige]
  (6) Alcances luminoso e geográfico
  (7) Descrição e ALTURA DA ESTRUTURA  [≠ altitude; confundir as duas é a
                   origem provável dos erros de altura na base do app]
  (8) Observações
"""
import pymupdf, re, json, sys

PDF = sys.argv[1]
OUT = sys.argv[2]
MARKS = ['(1)', '(2)', '(3)', '(4)', '(5)', '(6)', '(7)', '(8)']
ORDEM = re.compile(r'^\d{1,5}(\.\d{1,3})?$')       # nº de ordem: 936 · 410.88
POS   = re.compile(r'^(\d{1,3})\s+(\d{1,2},\d{2})$')  # "03 43,58"

doc = pymupdf.open(PDF)
registros, geometria_anomala = [], []
secao_atual = {'regiao': None, 'estado': None}

for pno in range(doc.page_count):
    page = doc[pno]
    words = page.get_text('words')
    marks = {}
    for x0, y0, x1, y1, t, *_ in words:
        if y0 < 140 and t in MARKS:
            marks[t] = x0
    if len(marks) != 8:
        continue                                    # página sem tabela
    # Margens espelhadas: a geometria interna é idêntica em todas as páginas,
    # mas as ímpares estão deslocadas +28,3 pt. Normaliza pelo marcador (1).
    shift = marks['(1)'] - 65.9
    if abs(marks['(8)'] - shift - 469.0) > 2:
        geometria_anomala.append(pno + 1)           # layout fora do padrão
        continue

    # Fronteiras derivadas da EXTENSÃO dos rótulos do cabeçalho, não dos
    # marcadores (1)..(8): os marcadores ficam centrados sobre a coluna, mas o
    # corpo é alinhado à esquerda, então usá-los joga a descrição da estrutura
    # dentro da coluna de alcances.
    #        1|2    2|3    3|4    4|5    5|6    6|7    7|8
    bounds = [x + shift for x in
              (102.0, 172.5, 214.0, 287.0, 316.5, 359.0, 436.0)]

    def coluna(x):
        for i, b in enumerate(bounds):
            if x < b:
                return i
        return 7

    # ATENÇÃO: os rótulos (2), (3), (4)... reaparecem no CORPO da página dentro
    # das características das luzes ("Lp (2) B. 10s"). O topo da área de dados
    # só pode ser medido nos marcadores do cabeçalho (y0 < 140).
    y_top = max(y1 for x0, y0, x1, y1, t, *_ in words
                if t in MARKS and y0 < 140) + 4
    corpo = [w for w in words if w[1] > y_top and w[1] < 790]
    if not corpo:
        continue

    # cabeçalhos de seção: ESTADO DE/DO ..., nomes de região em caixa alta
    for x0, y0, x1, y1, t, *_ in corpo:
        pass

    # âncoras de registro: linha da coluna 0 que traz o nº de ordem SOZINHO.
    # A linha seguinte do mesmo registro traz o nº internacional ("G 0007.4"),
    # cujo sufixo numérico também casaria com ORDEM — por isso a linha só vale
    # como âncora se não contiver nenhum token alfabético.
    linhas_col0 = {}
    for x0, y0, x1, y1, t, *_ in corpo:
        if coluna(x0) == 0:
            linhas_col0.setdefault(round(y0, 1), []).append(t)
    anc = sorted(y for y, toks in linhas_col0.items()
                 if any(ORDEM.match(t) for t in toks)
                 and not any(re.search(r'[A-Za-z]', t) for t in toks))
    if not anc:
        continue

    for k, ytop in enumerate(anc):
        ybot = anc[k + 1] - 2 if k + 1 < len(anc) else 10_000
        celulas = [[] for _ in range(8)]
        for x0, y0, x1, y1, t, *_ in corpo:
            if ytop - 2.5 <= y0 < ybot:
                celulas[coluna(x0)].append((round(y0, 1), x0, t))
        rec = []
        for c in celulas:
            c.sort(key=lambda z: (z[0], z[1]))
            rec.append(' '.join(t for _, _, t in c).strip())
        registros.append({
            'pagina': pno + 1,
            'ordem_intl': rec[0],
            'nome_carta': rec[1],
            'posicao': rec[2],
            'caracteristica': rec[3],
            'altitude_m': rec[4],
            'alcances': rec[5],
            'descricao_altura': rec[6],
            'observacoes': rec[7],
        })

with open(OUT, 'w', encoding='utf-8') as f:
    for r in registros:
        f.write(json.dumps(r, ensure_ascii=False) + '\n')
print('registros extraídos:', len(registros))
print('páginas com tabela  :', len({r["pagina"] for r in registros}))
print('páginas com geometria anômala:', geometria_anomala)
