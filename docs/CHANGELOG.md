# Changelog — Coastal Navigator Brasil

Autor: Jossian Brito (Charlie Bravo)

Este arquivo era um comentário de 578 linhas no topo do `app.html`. Saiu de
lá na v2.2.0: histórico é documentação, não código, e a cada leitura do
arquivo principal ele custava meia tela de rolagem antes da primeira linha
executável.

---

```
CHANGELOG:
  v2.2.0 (07/09/2026) - SEGURANÇA, FLUXOS DE USO E MODULARIZAÇÃO
    Autor: Jossian Brito (Charlie Bravo)
    Etapas 3 e 4 do plano de reparo aberto pela auditoria.

    SEGURANÇA
    1. INJEÇÃO NA TELEMETRIA (a mais grave). A embarcação montava o card de
       farol como HTML e transmitia a STRING PRONTA pelo canal Realtime; o
       observador em terra a atribuía a innerHTML. O canal é público e
       identificado só pelo token do link — quem tivesse o link escrevia
       marcação arbitrária na tela alheia. Agora trafega um OBJETO tipado e a
       marcação é remontada por renderLighthouseCard(), com escape, nos dois
       lados. A rota recebida é validada como pares de coordenadas antes de
       entrar no mapa.
    2. ESCAPE DE SAÍDA no relatório HTML (escapeHtml) e no GPX (escapeXml).
       Um nome corriqueiro no mercado — "SMIT & CIA" — produzia XML
       mal-formado, recusado por Navionics, OpenCPN e Garmin sem explicação.
       Nome de arquivo baixado passa por safeFileName().
    3. SRI em Leaflet e Supabase, com versões fixadas. O Supabase estava em
       "@2", intervalo flutuante incompatível com o mecanismo.
    4. CSP e cabeçalhos de segurança no netlify.toml.
    5. SENHA DO PAINEL fora do repositório: o build publica só o SHA-256, de
       ADMIN_GATE_HASH. O painel exibe aviso de que é ferramenta local, não
       barreira; gatekeeper.js passa a declarar que o token é convite
       rastreável, não credencial.

    FLUXOS DE USO
    6. APAGAR O PRIMEIRO WAYPOINT não rebaseava a rota: a condição era
       `index > 0`. O antigo WP002 virava o primeiro carregando distância, ETA
       e consumo do ponto que deixou de existir — numa rota de 60 NM por perna,
       60 NM e 600 L fantasmas propagados por toda a derrota.
    7. IDA-E-VOLTA DO GPX. exportGPX() gravava cada ponto como <wpt> E como
       <trkpt>; importGPX() somava os três formatos. Exportar 3 waypoints e
       reimportar devolvia 6, em zigue-zague. Agora a exportação usa <rte>
       (rota PLANEJADA, não trilha percorrida) e a importação aplica
       precedência rtept > wpt > trkpt, usando UM formato.
    8. NOME DOS PONTOS do GPX era lido e descartado; agora é preservado.
    9. IMPORTAÇÃO EM LOTE com teto de 500 pontos. Cada ponto redesenhava
       lista, rota, faróis e consumo (O(n²)) e podia abrir um alert() — uma
       trilha de milhares de pontos congelava o navegador e enfileirava
       caixas de diálogo. A interface é redesenhada uma vez, ao final.
   10. SINAL DO ALONG-TRACK no XTE. Math.acos() devolve só 0..π, então a
       projeção saía sempre positiva: um barco 5 NM a RÉ do waypoint de
       partida marcava +5,00 NM e contava como progresso o que ainda faltava.
   11. FUSO DA DATA DE PARTIDA. O campo datetime-local recebia UTC; em UTC-3
       a partida sugerida nascia 3 h adiantada, contaminando ETA, blocos de
       12 h e o consumo de viagem em andamento.
   12. fmtCoord() produzia "3°60.0'S" — sessenta minutos não existem. Os
       minutos passam a ser arredondados antes de o grau ser fixado, com
       transbordo, e o grau recebe zero à esquerda (2 dígitos na latitude,
       3 na longitude, como na carta).
   13. POLIGONAL COSTEIRA sem as ilhas afastadas (Alcatrazes, Laje de Santos,
       Queimada Grande, Arvoredo), que puxavam a linha para o mar aberto.
   14. HIGIENE DE DADOS: osm_lighthouses_v2.json transcodificado de UTF-16LE
       para UTF-8 (956 KB -> 178 KB) e osm_lighthouses.json, com 0 bytes,
       removido do versionamento.

    MODULARIZAÇÃO (etapa 5)
   15. app.html repartido: 5.787 -> 3.278 linhas.
       assets/css/app.css        1.077  estilos
       assets/js/report.js         472  gerador do relatório
       assets/js/nautical.js       327  algoritmos náuticos
       assets/js/lighthouses.js    162  base de faróis
       docs/CHANGELOG.md                histórico (era comentário no topo do
                                        app.html, 578 linhas antes da primeira
                                        linha executável)
   16. refreshWaypointUI() como ponto ÚNICO de atualização da interface. Havia
       cinco lugares repetindo a mesma sequência de cinco chamadas.
   17. renumberWaypointMarkers(). O número dentro do marcador era gravado na
       criação e nunca mudava: apagando um ponto do meio, o mapa exibia 1, 3, 4;
       apagando o primeiro, começava em 2. Mapa e lista lateral discordavam
       sobre o mesmo waypoint.
   18. Rótulos de versão e ano corrigidos na interface — diziam v2.0.9 e 2024.
   19. npm run smoke: fumaça em navegador real (Playwright), 24 passos, que
       falha com um único erro de console. O banco de provas roda sem DOM e não
       pegaria regressão de CARREGAMENTO: ordem de <script>, caminho de módulo,
       hash de SRI inválido, CSS que não chega.

    POR QUE SCRIPTS CLÁSSICOS E NÃO MÓDULOS ES
    A interface usa 39 atributos onclick=, que só enxergam o escopo global.
    Migrar para type="module" exige convertê-los em addEventListener. Vale a
    pena — é o que destrava remover 'unsafe-inline' do script-src da CSP — mas
    não cabia na mesma mudança que moveu 2.500 linhas de lugar.

    Provas aprovadas: 54 -> 70 de 74, ZERO em vermelho, mais 24 passos de
    fumaça em navegador real.

    PENDÊNCIAS REGISTRADAS, NÃO ESCONDIDAS (provas 9.4, 9.7 e 10.4):
    o hash do portão está no cliente e é atacável por dicionário; script-src
    ainda admite 'unsafe-inline' (atributos onclick=) e 'unsafe-eval'
    (WebAssembly do Cesium); a distância da costa é aproximada por 88 pontos
    e mede ~14% a menos que o real.

  CHANGELOG:
  v2.1.0 (07/09/2026 - 01:50) - RECONCILIAÇÃO COM A LISTA DE FARÓIS DA DHN
    Autor: Jossian Brito (Charlie Bravo)

    ORIGEM DA REVISÃO:
    Auditoria com 68 provas automatizadas executadas sobre as funções reais
    deste arquivo. A base de faróis reprovou em seis delas. O cruzamento com a
    Lista de Faróis DH2, 40ª edição 2026-2027 (DHN/CHM), corrigida até o
    Folheto Quinzenal de Avisos aos Navegantes 14/2026, revelou a causa.

    CAUSA-RAIZ:
    A Lista de Faróis publica QUATRO grandezas numéricas por registro — carta
    náutica, altitude do foco, alcances (luminoso e geográfico) e altura da
    estrutura. A base antiga tinha DOIS campos (height, range) e o `height`
    guardava, na maioria dos casos, o NÚMERO DA CARTA NÁUTICA. Quando a carta
    tinha quatro dígitos sobrava só o primeiro, produzindo onze faróis de
    "1 metro" (Sergipe carta 1003, Abrolhos 1311, Macaé 1507, Moela 1711,
    Arvoredo 1902, entre outros). O campo `range`, esse estava correto: batia
    com o alcance luminoso da DHN em 63 dos 94 faróis publicados.

    IMPACTO CORRIGIDO:
    * 70 dos 98 faróis tinham altura errada
    * Erro médio de 12,6 NM no alcance visual calculado; máximo de 51,6 NM
      (Farol de Pedra Seca: 830 m gravados contra 16 m reais)
    * Altitudes agora variam de 14 a 329 m, mediana 50 m — faixa fisicamente
      coerente. Antes iam de 1 m a 920 m.

    MODIFICAÇÕES IMPLEMENTADAS:
    1. ESQUEMA DA BASE reescrito com quatro campos rastreáveis:
       altitude · rangeLum · rangeGeo · structHeight, mais `lfId` com o número
       de ordem na Lista de Faróis para auditoria futura.
    2. IDENTIFICADOR ÚNICO (`id`) por farol. A máquina de estados dos alertas
       indexava por NOME e os dois "Farol de Conceição" (SP e RS) partilhavam
       fase: passar pelo paulista deixava o gaúcho marcado como já avistado e
       o alerta sonoro não tocava mil milhas depois.
    3. effectiveRange() = min(alcance luminoso, alcance geográfico). Antes o
       PLANEJAMENTO usava só o geográfico e a NAVEGAÇÃO usava o mínimo — o
       mesmo farol constava "visível" no plano e nunca alertava na viagem.
    4. calculateVisibility() passou a receber a ALTURA DO OLHO do observador,
       agora campo do tripData (`eyeHeight`, padrão 5 m). Estava travada em
       5 m no código enquanto os exemplos do próprio comentário tinham sido
       escritos para 1,6 m. Passadiço de rebocador ASD fica em 5-7 m, o de um
       navio passa de 20 m, uma lancha fica em 2 m — e isso muda o alcance de
       avistamento de todos os faróis.
    5. POSIÇÕES CORRIGIDAS contra a publicação:
       * Cabo Frio: a coordenada apontava para a Torre Notável (LF nº 2204),
         uma marca CEGA, sem luz. O farol é o nº 2400, 7,85 NM ao sul,
         altitude 140 m.
       * Peba: latitude 10,01 NM ao norte da posição oficial (LF nº 1399.4).
       * Natal: 2,68 NM de desvio (LF nº 1176).
    6. REGISTROS SEM RESPALDO na LF-40ED marcados no próprio código, em vez de
       silenciosamente mantidos: Barra da Tijuca (origem OpenSeaMap), Martin
       Vaz (nenhuma luz listada no arquipélago) e Trindade (a publicação traz
       apenas faroletes de alinhamento na ilha).
    7. DUPLICATA SINALIZADA: "Farol da Ilha do Mel" e "Farol de Conchas" são a
       mesma luz (LF nº 3512, Farol das Conchas, que fica NA Ilha do Mel), a
       0,61 NM uma da outra. Ambos preservados e marcados, aguardando decisão.

    VALIDAÇÃO:
    * 95 dos 98 faróis rastreáveis ao número de ordem da LF-40ED (96,9%)
    * Cruzamento independente com a base OpenStreetMap do repositório:
      71 de 72 (99%) conferem com a altitude ou com a altura de estrutura
    * Provas automatizadas aprovadas subiram de 33 para 44 de 68

    NÃO INCLUÍDO NESTA VERSÃO (aguardando autorização):
    Correções de segurança (CSP, SRI, escape de saída), ida-e-volta do GPX,
    sinal do along-track no XTE e fuso horário do campo de partida.

  CHANGELOG:
  v2.0.9 (15/12/2024) - CORREÇÕES CRÍTICAS: Coordenadas + Curadoria Fina
  v2.0.10 (29/12/2025) - CORREÇÃO: Farol de Recife -> Mucuripe
    CORREÇÃO DE DADOS GEOGRÁFICOS:
    * Farol de Recife (Fortaleza) renomeado para "Farol do Mucuripe (Novo)"
    * Rótulo anterior estava incorreto para a região geográfica (Ceará)
    * Ajustada altura para 72m (era 701m incorreto)

    CORREÇÕES BASEADAS NA PLANILHA DHN OFICIAL:
    
    1. CORREÇÃO CRÍTICA - FAROL DE SÃO TOMÉ:
       ANTES (v2.0.9): lat: -3.0535, lng: -55.2045 ❌ (AMAZÔNIA!)
       AGORA (v2.0.9): lat: -22.0420, lng: -41.0528 ✅ (RIO DE JANEIRO)
       Diferença: 2100 km de erro corrigido!
       Planilha DHN: 22°02.52'S 41°03.17'W
       Altura: 4m → 40m | Alcance: 40M → 49M
       
    2. VERIFICADO - FAROL DE ORANGE:
       Posição: -4.431, -51.542 ✅ CORRETO
       Planilha DHN: 04°25.86'S 51°32.52'W ✅ CONFERE
       Altura: 110m | Alcance: 18M ✅
       
    3. FARÓIS REMOVIDOS (5 total):
       ❌ Farol de Santana (estava duplicado/incorreto)
       ❌ Farol de Bailique (estava duplicado/incorreto)
       ❌ Farol de Santo Antônio (estava duplicado/incorreto)
       ❌ Farol de Barra (estava duplicado/incorreto)
       ❌ Farol da Barra - Salvador (validado removido, não está na DHN atual)
       
    4. FAROL ADICIONADO:
       ✅ Farol de Simão Grande (Pará)
          Posição: -0.2568, -48.4032
          Planilha DHN: 00°15.41'S 48°24.19'W
          Altura: 42m | Alcance: 16M
          Região: Norte (Pará)
    
    ESTATÍSTICAS v2.0.9:
    * Norte: 17 faróis (-4 duplicados + 1 novo)
    * Nordeste: 13 faróis (-1 Barra Salvador)
    * Sudeste: 17 faróis (+1 São Tomé corrigido)
    * Sul: 10 faróis (sem alteração)
    * Ilhas Oceânicas: 3 faróis (sem alteração)
    * TOTAL: 58 faróis (vs 62 em v2.0.9)
    
    FONTES:
    * 51 Faróis DHN Oficiais (88%)
    * 7 Faróis Validados (12%)
    
    BENEFÍCIOS:
    ✅ São Tomé agora na posição correta (RJ, não Amazônia!)
    ✅ Duplicados removidos (limpeza da base)
    ✅ Simão Grande adicionado (DHN oficial)
    ✅ Orange verificado e confirmado correto
    ✅ Base ainda mais precisa e confiável
    
    RESULTADO:
    ✅ Erro crítico de 2100 km corrigido (São Tomé)
    ✅ 5 faróis duplicados/incorretos removidos
    ✅ 1 farol oficial DHN adicionado
    ✅ 58 faróis 100% validados
  
  CHANGELOG:
  v2.0.9 (15/12/2024) - CURADORIA COMPLETA: Base DHN Oficial + Validados
    MUDANÇA CRÍTICA - FARÓIS TOTALMENTE REVISADOS:
    * Database de faróis completamente substituída por base oficial DHN
    * 75 faróis (v2.0.7) → 58 faróis curados (v2.0.9)
    * Composição: 55 faróis DHN oficiais + 7 faróis validados
    
    ANÁLISE REALIZADA:
    * Comparação completa com planilha oficial DHN (lista_de_farois_enriquecida.xlsx)
    * Conversão de coordenadas DMS para Decimal
    * Identificação de faróis fictícios, duplicados e com erros
    
    PROBLEMAS ENCONTRADOS E CORRIGIDOS:
    1. Faróis Fictícios Removidos (não existem ou não são oficiais):
       ❌ Farol de Macapá, Santarém, Belém, Manaus
       ❌ Farol de São Luís, Praia Grande, Alcântara
       ❌ Diversos outros faróis genéricos sem fonte
       
    2. Faróis Importantes Adicionados (DHN oficial):
       ✅ Calcanhar (RN) - Maior alcance: 38M
       ✅ Santa Marta (SC) - Alcance: 46M  
       ✅ Cabo Frio (RJ) - Alcance: 49M
       ✅ Rasa (RJ) - Maior alcance: 51M!
       ✅ Moela (SP) - Alcance: 40M
       ✅ Arvoredo (SC), Orange (AP), Bailique (AP)
       ✅ Mucuripe oficial (CE), Abrolhos (BA)
       ✅ 49 outros faróis oficiais DHN
    
    3. Faróis Validados Mantidos (reconhecidos + importantes):
       ✅ Trindade (Ilha Trindade - navegação oceânica)
       ✅ Martin Vaz (Arquipélago - navegação oceânica)
       ✅ São Pedro e São Paulo (Arquipélago)
       ✅ Fernando de Noronha (turístico + navegação)
       ✅ Farol da Barra Salvador (histórico 1698)
       ✅ Ilha do Mel (entrada Porto de Paranaguá)
       ✅ Belmonte (mantido de v2.0.5)
    
    ESTATÍSTICAS FINAIS v2.0.9:
    * Norte (AP, PA, MA): 21 faróis
    * Nordeste (PI, CE, RN, PB, PE, AL, SE, BA): 14 faróis
    * Sudeste (ES, RJ, SP): 16 faróis
    * Sul (PR, SC, RS): 10 faróis
    * Ilhas Oceânicas: 3 faróis (Trindade, Martin Vaz, São Pedro e São Paulo)
    * TOTAL: 62 faróis (55 DHN + 7 Validados)
    
    COORDENADAS CORRIGIDAS:
    * Todas coordenadas agora baseadas em fonte oficial DHN
    * Conversão precisa: DMS (Graus, Minutos, Segundos) → Decimal
    * Exemplo: 04°25.86'S 051°32.52'W → -4.4310, -51.5420
    
    FONTES DOCUMENTADAS:
    * DHN: Fonte oficial Diretoria de Hidrografia e Navegação (Marinha do Brasil)
    * Validated: Faróis reconhecidos, importantes para navegação oceânica/turismo
    * v2.0.5: Belmonte (mantido por solicitação específica)
    
    BENEFÍCIOS:
    ✅ Conformidade com dados oficiais da Marinha do Brasil
    ✅ Coordenadas precisas e confiáveis
    ✅ Faróis importantes da costa brasileira completos
    ✅ Remoção de 63 faróis fictícios/não oficiais
    ✅ Adição de 49 faróis oficiais que faltavam
    ✅ Base sólida para futuras expansões
    
    RESULTADO:
    ✅ Database 100% curada (DHN oficial + validados)
    ✅ Faróis principais: Calcanhar, Santa Marta, Cabo Frio, Rasa
    ✅ Cobertura completa costa brasileira
    ✅ Coordenadas oficiais DHN
    ✅ 62 faróis confiáveis vs 75 não validados
  
  CHANGELOG:
  v2.0.7 (15/12/2024) - CORREÇÃO CRÍTICA: Suporte a <rtept> e <trkpt>
    BUG CRÍTICO CORRIGIDO:
    * Importação GPX reportando "0 waypoints" quando arquivo contém <rtept>
      - Usuário importava GPX do Navionics com 23 pontos
      - Sistema reportava "Nenhum waypoint encontrado"
      - Causa: Código só procurava por <wpt>, ignorava <rtept> e <trkpt>
    
    ANÁLISE DO PROBLEMA:
    * GPX suporta 3 tipos de pontos:
      - <wpt> = Waypoints (pontos individuais/isolados)
      - <rtept> = Route points (pontos de rota planejada) ← NAVIONICS USA ESTE
      - <trkpt> = Track points (trilha gravada)
    
    * Código v2.0.6 (ANTES):
      ```javascript
      const wpts = gpxDoc.getElementsByTagName('wpt');  // ❌ Só waypoints
      ```
    
    * Arquivo do usuário (Navionics):
      ```xml
      <rte>
        <rtept lat="-32.203772" lon="-52.052592">  ← ROUTE POINTS
          <n>RIO GRANDE</n>
        </rtept>
        ...23 pontos total
      </rte>
      ```
    
    CORREÇÃO IMPLEMENTADA:
    * Busca nos 3 formatos simultaneamente:
      ```javascript
      const wpts = gpxDoc.getElementsByTagName('wpt');
      const rtepts = gpxDoc.getElementsByTagName('rtept');   // ✅ NOVO
      const trkpts = gpxDoc.getElementsByTagName('trkpt');   // ✅ NOVO
      const allPoints = [...wpts, ...rtepts, ...trkpts];     // ✅ COMBINA TODOS
      ```
    
    * Console mostra detalhamento por tipo:
      - "Waypoints (<wpt>): X"
      - "Route points (<rtept>): Y"
      - "Track points (<trkpt>): Z"
      - "TOTAL de pontos: X+Y+Z"
    
    * Extração de nome dos pontos:
      - Busca tag <n> (Navionics usa esta)
      - Fallback para <name> (formato padrão GPX)
      - Fallback para "Ponto N" se não tiver nome
    
    * Logs mostram nome do ponto:
      "✅ Waypoint 1 (RIO GRANDE) adicionado com sucesso"
    
    COMPATIBILIDADE:
    ✅ Navionics Boating App (<rtept>)
    ✅ Garmin (<wpt> e <trkpt>)
    ✅ OpenCPN (<wpt> e <rte>)
    ✅ GPX standard (<wpt>)
    ✅ Tracks gravados (<trkpt>)
    ✅ Rotas planejadas (<rtept>)
    
    RESULTADO:
    ✅ Importa GPX do Navionics (23 pontos detectados)
    ✅ Importa GPX do Garmin
    ✅ Importa GPX genérico
    ✅ Importa tracks gravados
    ✅ Console mostra tipo de cada ponto
    ✅ Nomes dos pontos preservados
  
  CHANGELOG:
  v2.0.6 (15/12/2024) - CORREÇÕES: Debug + Importação GPX
    BUGS CORRIGIDOS:
    * ReferenceError: isProcessingWaypoint is not defined (botão DEBUG)
      - Variável estava sendo referenciada mas não declarada
      - Removida referência da função showDebugInfo()
      - Console DEBUG agora funciona sem erros
    
    * Importação GPX não adiciona waypoints ao array
      - Função importGPX() não verificava se createWaypoint() tinha sucesso
      - Não reportava quando waypoints falhavam (ex: combustível insuficiente)
      - Alerta genérico "X waypoints adicionados" enganoso
    
    MELHORIAS IMPLEMENTADAS:
    * Importação GPX com logging detalhado:
      - Console mostra cada waypoint sendo processado
      - Verifica parsing XML (detecta erros de formato)
      - Verifica coordenadas válidas (lat/lng não NaN)
      - Conta waypoints REALMENTE adicionados vs tentados
      - Try-catch individual por waypoint
      - Compara waypoints.length antes/depois
    
    * Alertas informativos melhorados:
      - "⚠️ GPX importado mas NENHUM waypoint foi adicionado" + causas
      - "⚠️ GPX parcialmente importado! X de Y waypoints" quando falha parcial
      - "✅ GPX importado com sucesso! X waypoints" quando 100% sucesso
      - Direciona usuário ao console (F12) para detalhes
    
    * Console logs na importação:
      - Nome do arquivo importado
      - Tamanho do arquivo em caracteres
      - Quantidade de waypoints encontrados no XML
      - Status de cada waypoint (✅ sucesso / ❌ falha)
      - Contadores: sucesso vs falharam
      - Comparação: waypoints.length antes vs depois
      - Resumo final da importação
    
    RESULTADO:
    ✅ Botão DEBUG funciona sem erros
    ✅ Importação GPX reporta status real
    ✅ Usuário entende POR QUE waypoints não foram adicionados
    ✅ Console mostra detalhes completos (diagnóstico)
    ✅ Alertas específicos para cada cenário
  
  CHANGELOG:
  v2.0.5 (15/12/2024) - MELHORIAS: Farol de Belmonte + Data/Hora em Períodos
    NOVIDADES:
    * Farol de Belmonte adicionado ao database (70 faróis total)
      - Localização: -15.8600°, -38.8800° (Bahia)
      - Altura: 43m, Alcance: 23 NM
      - Característica: Fl W 8s
    
    * Consumo por período de 12h agora mostra DATA e HORA reais
      - Antes: "0h - 12h: 960 L"
      - Agora: "15/12 14:21 - 16/12 02:21: 960 L"
      - Calculado a partir da data/hora de saída (departureDate)
      - Formato compacto: dd/MM HH:mm
      - Exibido tanto na interface quanto no relatório HTML
      - Mostra também consumo acumulado
    
    MODIFICAÇÕES:
    * Tabela "Consumo por Período de 12h" no relatório
      - Coluna "Tempo (h)" → "Data/Hora"
      - Inclui timestamps reais
    * Painel de combustível na interface
      - Períodos agora mostram data/hora
      - Formato: "Período X: dd/MM HH:mm - dd/MM HH:mm"
      - Linha adicional com consumo e acumulado
  
  CHANGELOG:
  v2.0.4 (15/12/2024) - CORREÇÃO CRÍTICA: route.setText() ERROR
    BUG CORRIGIDO:
    * TypeError: route.setText is not a function
    * Waypoints adicionados mas UI não atualizava
    * Footer permanecia em "Waypoints: 1"
    * Cálculos não apareciam (distância, tempo, combustível)
    
    CAUSA RAIZ:
    * route.setText() chamava plugin Leaflet.textPath não carregado
    * Erro interrompia createWaypoint() prematuramente
    * updateStatus() e outras funções UI nunca executavam
    * Waypoints estavam no array mas UI não refletia
    
    CORREÇÃO:
    * Removido route.setText() completamente (decorativo, não essencial)
    * Rota continua sendo criada (linha laranja) SEM setas
    * Todas funções de update da UI agora executam normalmente
    * Footer atualiza corretamente
    * Cálculos aparecem
    
    RESULTADO:
    ✅ Waypoints contabilizados corretamente
    ✅ Footer mostra número correto
    ✅ Distância calculada e exibida
    ✅ Tempo calculado e exibido
    ✅ Combustível calculado e exibido
    ✅ Relatório funcional
  
  CHANGELOG:
  v2.0.3 (15/12/2024) - CORREÇÃO CRÍTICA DE CONTABILIZAÇÃO + DEBUG
    BUG CORRIGIDO:
    * Waypoints criados visualmente mas não contabilizados no array
    * Footer mostra "Waypoints: 1" quando há 15+ marcadores no mapa
    * Cálculos não executam (distância, tempo, combustível)
    
    CORREÇÕES IMPLEMENTADAS:
    * Try-catch robusto no push() do array
    * Verificação crítica após push: confirma waypoint foi adicionado
    * Verificação de ID do último waypoint
    * Timeout de segurança na flag isProcessingWaypoint (2 segundos)
    * Logging EXTREMO: antes/depois de cada operação crítica
    * Feedback visual com vibração em mobile
    * Botão DEBUG na interface (🐛 DEBUG)
    * Função showDebugInfo() mostra estado completo
    * Verificação de crescimento do array
    * Alert se array não crescer
    * Stack trace completo de exceções
    
    DEBUGGING:
    * 50+ linhas de console.log por waypoint
    * Botão DEBUG visível na interface
    * Alert com estado do sistema
    * Timestamps em cada operação
    * Verificação de consistência arrays
  
  FUNCIONALIDADES PRINCIPAIS:
  ✓ Cadastro completo de viagem (embarcação, origem, destino, velocidade)
  ✓ Rota automática ao adicionar waypoints no mapa
  ✓ Cálculo automático de ETA para cada waypoint
  ✓ Cálculo de consumo de combustível em tempo real
  ✓ Geração de relatório HTML profissional exportável
  ✓ Lista detalhada de waypoints com horários e consumos
  ✓ Mapa interativo OpenSeaMap com todas camadas
  ✓ Database de 98 faróis da costa brasileira (Lista de Faróis DH2, 40ª ed. 2026-2027)
  ✓ Importação/exportação GPX
  ✓ Interface mobile-first responsiva
  ✓ Renderização correta em smartphones e tablets
  
  CHANGELOG:
  v2.0.2 (15/12/2024) - CORREÇÃO CRÍTICA DE RENDERIZAÇÃO MOBILE
    BUG CORRIGIDO:
    * Mapa não renderizava em mobile (black screen)
    * Waypoints não sendo contabilizados devido ao mapa não carregar
    
    CORREÇÕES IMPLEMENTADAS:
    * CSS do map-container com altura explícita (min-height: 400px)
    * Altura calc(100vh - 200px) para mobile
    * touch-action: none para prevenir gestos do navegador
    * Position absolute no #map para garantir renderização
    * map.invalidateSize() após 250ms da inicialização
    * Listener window.resize para redimensionar mapa
    * Listener orientationchange para rotation em mobile
    * Verificação de dimensões do container antes de criar mapa
    * Força altura de 400px se container tiver altura zero
    * Logging detalhado de dimensões
    
  v2.0.1 (15/12/2024) - CORREÇÃO CRÍTICA MOBILE
    BUG CORRIGIDO:
    * Apenas 1 waypoint sendo registrado em dispositivos móveis
    
    CORREÇÕES IMPLEMENTADAS:
    * Event listener otimizado com suporte a 'tap' (mobile-specific)
    * Proteção contra múltiplos cliques simultâneos (flag isProcessingWaypoint)
    * Debounce de 300ms para evitar registros duplicados
    * Logging detalhado para debug em mobile (console.log completo)
    * Melhor handling de eventos touch vs click
    
    MODIFICAÇÕES:
    - Botão "➕ Waypoint" REMOVIDO (conforme solicitado)
    - Waypoints agora só são criados clicando/tocando no mapa
    - Event listener duplo (click + tap) para máxima compatibilidade
    - Flag de processamento evita race conditions
    
  v2.0.0 (15/12/2024) - Sistema Completo de Planejamento
    NOVIDADES:
    + Modal de configuração de viagem com dados da embarcação
    + Criação automática de rota ao adicionar waypoints
    + Cálculo de ETA (Estimated Time of Arrival) para cada waypoint
    + Sistema de consumo de combustível (litros/hora)
    + Saldo de combustível em tempo real
    + Geração de relatório HTML profissional
    + Consumo acumulado por waypoint
    + Consumo por período de 12 horas
    + Visibilidade de faróis por waypoint
    + Exportação de relatório completo
    
    MODIFICAÇÕES:
    * Rota agora é criada automaticamente (sem necessidade de botão separado)
    * Interface expandida com dados de viagem
    * Footer com informações de combustível e ETA
    * Sistema de validação de dados
    
  v1.0.0 (15/12/2024) - Implementação inicial
    - Sistema de mapa base com OpenSeaMap
    - Waypoints manuais
    - Database de faróis
    - Import/Export GPX básico
  
  ESTRUTURA DE DADOS:
  
  tripData = {
    vesselName: String,      // Nome da embarcação
    origin: String,          // Porto de origem
    destination: String,     // Porto de destino
    departureDate: Date,     // Data e hora de saída
    speedKnots: Number,      // Velocidade média em nós
    fuelInitial: Number,     // Saldo inicial de combustível (L)
    fuelConsumption: Number  // Consumo em litros/hora
  }
  
  waypoint = {
    id: Number,
    name: String,
    lat: Number,
    lng: Number,
    eta: Date,               // Hora estimada de chegada
    distance: Number,        // Distância até próximo waypoint
    fuelUsed: Number,        // Combustível usado até este ponto
    fuelRemaining: Number,   // Combustível restante
    nearestLighthouse: Object,
    lighthouseVisible: Boolean
  }
  
════════════════════════════════════════════════════════════════════════════════
```
