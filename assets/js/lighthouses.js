/*
 * Coastal Navigator Brasil — base de faróis da costa brasileira
 * Autor: Jossian Brito (Charlie Bravo)
 *
 * FONTE: Lista de Faróis DH2, 40ª edição 2026-2027 (DHN/CHM — Marinha do
 * Brasil), corrigida até o Folheto Quinzenal de Avisos aos Navegantes 14/2026.
 *
 * NÃO EDITE OS VALORES À MÃO. Este arquivo é gerado pela reconciliação em
 * tools/lf/ contra o PDF da publicação. Alteração manual sai do próximo
 * `npm run lf:gerar` sem deixar rastro. Depois de qualquer mudança, rode
 * `npm test`: as suítes 3 e 11 conferem faixa física das altitudes, unicidade
 * dos identificadores e coerência contra a base OpenStreetMap.
 */
/*
ESTRUTURA DE DADOS - FARÓIS  (revisada em 2026-09-07)

FONTE: Lista de Faróis DH2, 40ª edição 2026-2027 (DHN/CHM - Marinha do
Brasil), corrigida até o Folheto Quinzenal de Avisos aos Navegantes 14/2026.

POR QUE A ESTRUTURA MUDOU:
A publicação traz QUATRO grandezas numéricas por registro e a base antiga
tinha apenas duas (height, range). O campo `height` guardava, na maioria dos
casos, o NÚMERO DA CARTA NÁUTICA — e quando a carta tinha 4 dígitos sobrava
só o primeiro, produzindo onze faróis de "1 metro". O erro chegava a 51,6 NM
no alcance visual calculado.

{
  id: String            Identificador único e estável. NÃO usar o nome como
                        chave: há dois "Farol de Conceição" (SP e RS) e a
                        máquina de estados dos alertas os confundia.
  name: String          Nome usual
  lat, lng: Number      Posição em graus decimais (S e W negativos)
  altitude: Number      ALTITUDE do foco acima do nível médio do mar, em
                        metros. É ESTA que entra em 2,08·(√h1+√h2).
  rangeLum: Number      Alcance LUMINOSO (nominal, por intensidade), em NM
  rangeGeo: Number      Alcance GEOGRÁFICO publicado, em NM (null se ausente)
  structHeight: Number  Altura da ESTRUTURA, em metros — informativa, NÃO
                        entra no cálculo de visibilidade
  character: String     Característica luminosa
  lfId: String          Nº de ordem na Lista de Faróis (null = fora dela)
}

ALCANCE EFETIVO = min(rangeLum, alcance geográfico calculado pela altitude e
pela altura do olho do observador). Ver effectiveRange().
*/
const lighthouses = [

  // Norte (Amapá, Pará, Maranhão)
  { id: "simao-grande", name: "Farol de Simão Grande", lat: -0.2568, lng: -48.4032, altitude: 42, rangeLum: 16, rangeGeo: 16, structHeight: 40, character: "Fl W 5s", lfId: "148" },  // LF-40ED nº 148
  { id: "salinopolis", name: "Farol de Salinópolis", lat: -0.6155, lng: -47.3565, altitude: 61, rangeLum: 46, rangeGeo: 21, structHeight: 39, character: "Fl W 6s", lfId: "480" },  // LF-40ED nº 480
  { id: "caete", name: "Farol de Caeté", lat: -0.817, lng: -46.6143, altitude: 20, rangeLum: 15, rangeGeo: 14, structHeight: 16, character: "Fl W 10s", lfId: "484" },  // LF-40ED nº 484
  { id: "apeu", name: "Farol de Apeú", lat: -0.9103, lng: -46.189, altitude: 41, rangeLum: 15, rangeGeo: 17, structHeight: 38, character: "Fl W 10s", lfId: "488" },  // LF-40ED nº 488
  { id: "sao-joao", name: "Farol de São João", lat: -1.282, lng: -44.9033, altitude: 38, rangeLum: 20, rangeGeo: 17, structHeight: 30, character: "Fl W 10s", lfId: "496" },  // LF-40ED nº 496
  { id: "lencois-grandes", name: "Farol de Lençóis Grandes", lat: -2.3797, lng: -43.2697, altitude: 72, rangeLum: 17, rangeGeo: 20, structHeight: 42, character: "Fl W 10s", lfId: "806" },  // LF-40ED nº 806
  { id: "preguicas", name: "Farol de Preguiças", lat: -2.5925, lng: -42.7073, altitude: 46, rangeLum: 43, rangeGeo: 19, structHeight: 35, character: "Fl W 10s", lfId: "808" },  // LF-40ED nº 808
  { id: "jericoacoara", name: "Farol de Jericoacoara", lat: -2.788, lng: -40.4997, altitude: 101, rangeLum: 19, rangeGeo: 25, structHeight: 6, character: "Fl W 10s", lfId: "860" },  // LF-40ED nº 860
  { id: "pedra-do-sal", name: "Farol de Pedra do Sal", lat: -2.8037, lng: -41.7293, altitude: 15, rangeLum: 10, rangeGeo: 12, structHeight: 14, character: "Fl W 10s", lfId: "828" },  // LF-40ED nº 828
  { id: "mundau", name: "Farol de Mundaú", lat: -3.1763, lng: -39.362, altitude: 33, rangeLum: 14, rangeGeo: 16, structHeight: 7, character: "Fl W 10s", lfId: "868" },  // LF-40ED nº 868
  { id: "paracuru", name: "Farol de Paracuru", lat: -3.3972, lng: -39.0163, altitude: 80, rangeLum: 27, rangeGeo: 21, structHeight: 75, character: "Fl W 10s", lfId: "882" },  // LF-40ED nº 882
  { id: "mucuripe", name: "Farol do Mucuripe", lat: -3.7263, lng: -38.4717, altitude: 134, rangeLum: 43, rangeGeo: 27, structHeight: 71, character: "Fl(2) W 10s", lfId: "936" },  // LF-40ED nº 936
  { id: "morro-branco", name: "Farol de Morro Branco", lat: -4.1585, lng: -38.1075, altitude: 107, rangeLum: 24, rangeGeo: 24, structHeight: 25, character: "Fl(5) W 60s", lfId: "938" },  // LF-40ED nº 938
  { id: "aracati", name: "Farol de Aracati", lat: -4.4087, lng: -37.7698, altitude: 34, rangeLum: 14, rangeGeo: 16, structHeight: 12, character: "Fl(2) W 6s", lfId: "940" },  // LF-40ED nº 940
  { id: "fernando-de-noronha", name: "Farol de Fernando de Noronha", lat: -3.85, lng: -32.4167, altitude: 329, rangeLum: 30, rangeGeo: null, structHeight: 6, character: "Fl(3)W 15s", lfId: "1112" },  // LF-40ED nº 1112
  { id: "rocas", name: "Farol de Rocas", lat: -3.856, lng: -33.8175, altitude: 18, rangeLum: 13, rangeGeo: 12, structHeight: 14, character: "Fl W 10s", lfId: "1104" },  // LF-40ED nº 1104
  { id: "orange", name: "Farol de Orange", lat: 4.431, lng: -51.541, altitude: 50, rangeLum: 18, rangeGeo: 18, structHeight: 47, character: "Fl(2) W 14s", lfId: "1" },  // LF-40ED nº 1
  { id: "ponta-cajuais", name: "Farol de Ponta Cajuais", lat: -4.71, lng: -37.361, altitude: 64, rangeLum: 19, rangeGeo: 21, structHeight: 14, character: "Fl W 10s", lfId: "944" },  // LF-40ED nº 944
  { id: "ponta-do-mel", name: "Farol de Ponta do Mel", lat: -4.9612, lng: -36.8767, altitude: 106, rangeLum: 41, rangeGeo: 25, structHeight: 14, character: "LFl W 30s", lfId: "960" },  // LF-40ED nº 960
  { id: "galinhos", name: "Farol de Galinhos", lat: -5.0887, lng: -36.2905, altitude: 14, rangeLum: 12, rangeGeo: 11, structHeight: 13, character: "Fl W 10s", lfId: "980" },  // LF-40ED nº 980

  // Nordeste (PI, CE, RN, PB, PE, AL, SE, BA)
  { id: "calcanhar", name: "Farol de Calcanhar", lat: -5.1608, lng: -35.4868, altitude: 74, rangeLum: 38, rangeGeo: 21, structHeight: 62, character: "Fl W 10s", lfId: "1100" },  // LF-40ED nº 1100
  { id: "santo-alberto", name: "Farol Santo Alberto", lat: -5.0526, lng: -36.0379, altitude: 42, rangeLum: 20, rangeGeo: 16, structHeight: 38, character: "Fl W 6s", lfId: "984" },  // LF-40ED nº 984
  { id: "sao-roque", name: "Farol de São Roque", lat: -5.4887, lng: -35.2618, altitude: 50, rangeLum: 21, rangeGeo: 17, structHeight: 32, character: "Fl W 6s", lfId: "1132" },  // LF-40ED nº 1132
  { id: "natal", name: "Farol de Natal", lat: -5.7952, lng: -35.1853, altitude: 87, rangeLum: 39, rangeGeo: 22, structHeight: 37, character: "Fl W 10s", lfId: "1176" },  // LF-40ED nº 1176
  { id: "bacopari", name: "Farol de Bacopari", lat: -6.3745, lng: -34.9922, altitude: 30, rangeLum: 15, rangeGeo: 15, structHeight: 17, character: "Fl(2) W 10s", lfId: "1192" },  // LF-40ED nº 1192
  { id: "pedra-seca", name: "Farol de Pedra Seca", lat: -6.9562, lng: -34.8228, altitude: 16, rangeLum: 16, rangeGeo: 13, structHeight: 15, character: "Fl W 6s", lfId: "1236" },  // LF-40ED nº 1236
  { id: "cabo-branco", name: "Farol de Cabo Branco", lat: -7.1493, lng: -34.7962, altitude: 46, rangeLum: 27, rangeGeo: 17, structHeight: 18, character: "Fl W 10s", lfId: "1256" },  // LF-40ED nº 1256
  { id: "ponta-de-pedras", name: "Farol de Ponta de Pedras", lat: -7.63, lng: -34.812, altitude: 56, rangeLum: 18, rangeGeo: 18, structHeight: 7, character: "Fl(3) W 15s", lfId: "1264" },  // LF-40ED nº 1264
  { id: "olinda", name: "Farol de Olinda", lat: -8.011, lng: -34.8473, altitude: 90, rangeLum: 46, rangeGeo: 22, structHeight: 42, character: "Fl W 10s", lfId: "1272" },  // LF-40ED nº 1272
  { id: "santo-agostinho", name: "Farol de Santo Agostinho", lat: -8.3515, lng: -34.9473, altitude: 91, rangeLum: 22, rangeGeo: 22, structHeight: 15, character: "Fl W 10s", lfId: "1328" },  // LF-40ED nº 1328
  { id: "tamandare", name: "Farol de Tamandaré", lat: -8.758, lng: -35.0997, altitude: 27, rangeLum: 18, rangeGeo: 14, structHeight: 22, character: "Fl(3) W 10s", lfId: "1348" },  // LF-40ED nº 1348
  { id: "porto-de-pedras", name: "Farol de Porto de Pedras", lat: -9.1565, lng: -35.2982, altitude: 90, rangeLum: 24, rangeGeo: 22, structHeight: 36, character: "Fl(2) W 14s", lfId: "1352" },  // LF-40ED nº 1352
  { id: "maceio", name: "Farol de Maceió", lat: -9.5153, lng: -35.8007, altitude: 113, rangeLum: 43, rangeGeo: null, structHeight: 18, character: "Fl W 10s", lfId: "1356" },  // LF-40ED nº 1356
  { id: "coruripe", name: "Farol de Coruripe", lat: -10.16, lng: -36.135, altitude: 20, rangeLum: 14, rangeGeo: 13, structHeight: 10, character: "Fl(2) W 14s", lfId: "1396" },  // LF-40ED nº 1396
  { id: "peba", name: "Farol de Peba", lat: -10.655, lng: -36.3865, altitude: 20, rangeLum: 12, rangeGeo: 13, structHeight: 20, character: "LFl W 15s", lfId: "1399.4" },  // LF-40ED nº 1399.4
  { id: "sergipe", name: "Farol de Sergipe", lat: -10.9697, lng: -37.0362, altitude: 41, rangeLum: 39, rangeGeo: 16, structHeight: 40, character: "Fl W 10s", lfId: "1428" },  // LF-40ED nº 1428
  { id: "mangue-seco", name: "Farol de Mangue Seco", lat: -11.4628, lng: -37.3657, altitude: 55, rangeLum: 15, rangeGeo: 18, structHeight: 25, character: "Fl W 6s", lfId: "1440" },  // LF-40ED nº 1440
  { id: "itariri", name: "Farol de Itariri", lat: -11.9555, lng: -37.6223, altitude: 75, rangeLum: 18, rangeGeo: 21, structHeight: 30, character: "Fl W 15s", lfId: "1441" },  // LF-40ED nº 1441
  { id: "subauma", name: "Farol de Subaúma", lat: -12.2397, lng: -37.7732, altitude: 48, rangeLum: 23, rangeGeo: 17, structHeight: 41, character: "Fl W 10s", lfId: "1442" },  // LF-40ED nº 1442
  { id: "itapua", name: "Farol de Itapuã", lat: -12.9568, lng: -38.3537, altitude: 24, rangeLum: 15, rangeGeo: 14, structHeight: 21, character: "Fl W 10s", lfId: "1460" },  // LF-40ED nº 1460
  { id: "morro-de-sao-paulo", name: "Farol de Morro de São Paulo", lat: -13.3755, lng: -38.9153, altitude: 89, rangeLum: 23, rangeGeo: 22, structHeight: 26, character: "Fl(2) W 15s", lfId: "1776" },  // LF-40ED nº 1776
  { id: "morro-de-taipus", name: "Farol de Morro de Taipus", lat: -13.9558, lng: -38.9428, altitude: 76, rangeLum: 23, rangeGeo: 21, structHeight: 25, character: "Fl(3) W 15s", lfId: "1783" },  // LF-40ED nº 1783
  { id: "contas", name: "Farol de Contas", lat: -14.274, lng: -38.9858, altitude: 21, rangeLum: 15, rangeGeo: 13, structHeight: 20, character: "Fl W 10s", lfId: "1784" },  // LF-40ED nº 1784
  { id: "ilheus", name: "Farol de Ilhéus", lat: -14.8057, lng: -39.0257, altitude: 35, rangeLum: 23, rangeGeo: 16, structHeight: 10, character: "Fl W 10s", lfId: "1808" },  // LF-40ED nº 1808
  { id: "comandatuba", name: "Farol de Comandatuba", lat: -15.3518, lng: -38.9808, altitude: 45, rangeLum: 23, rangeGeo: 17, structHeight: 40, character: "Fl(3) W 15s", lfId: "1810" },  // LF-40ED nº 1810

  // Sudeste (ES, RJ, SP)
  { id: "belmonte", name: "Farol de Belmonte", lat: -15.86, lng: -38.88, altitude: 36, rangeLum: 21, rangeGeo: 16, structHeight: 34, character: "Fl W 8s", lfId: "1812" },  // LF-40ED nº 1812
  { id: "porto-seguro", name: "Farol de Porto Seguro", lat: -16.4358, lng: -39.0638, altitude: 57, rangeLum: 26, rangeGeo: 21, structHeight: 12, character: "Fl W 10s", lfId: "1816" },  // LF-40ED nº 1816
  { id: "corumbau", name: "Farol de Corumbaú", lat: -16.8955, lng: -39.1137, altitude: 15, rangeLum: 12, rangeGeo: 12, structHeight: 12, character: "Fl W 10s", lfId: "1820" },  // LF-40ED nº 1820
  { id: "ponta-da-baleia", name: "Farol da Ponta da Baleia", lat: -17.6885, lng: -39.1408, altitude: 19, rangeLum: 14, rangeGeo: 12, structHeight: 15, character: "Fl W 5s", lfId: "1836" },  // LF-40ED nº 1836
  { id: "abrolhos", name: "Farol de Abrolhos", lat: -17.9642, lng: -38.6938, altitude: 60, rangeLum: 51, rangeGeo: 19, structHeight: 22, character: "Fl W 10s", lfId: "1848" },  // LF-40ED nº 1848
  { id: "sao-mateus", name: "Farol de São Mateus", lat: -18.6143, lng: -39.7313, altitude: 14, rangeLum: 15, rangeGeo: 11, structHeight: 7, character: "Fl(2) W 14s", lfId: "1852" },  // LF-40ED nº 1852
  { id: "sucuraca", name: "Farol de Suçuraca", lat: -19.0967, lng: -39.723, altitude: 64, rangeLum: 24, rangeGeo: 19, structHeight: 40, character: "Fl(2) W 30s", lfId: "1854" },  // LF-40ED nº 1854
  { id: "rio-doce", name: "Farol de Rio Doce", lat: -19.6512, lng: -39.8255, altitude: 46, rangeLum: 18, rangeGeo: 17, structHeight: 42, character: "Fl W 6s", lfId: "1860" },  // LF-40ED nº 1860
  { id: "santa-luzia", name: "Farol de Santa Luzia", lat: -20.3243, lng: -40.2675, altitude: 29, rangeLum: 34, rangeGeo: 12, structHeight: 14, character: "Fl W 10s", lfId: "1980" },  // LF-40ED nº 1980
  { id: "escalvada", name: "Farol de Escalvada", lat: -20.7, lng: -40.4067, altitude: 27, rangeLum: 15, rangeGeo: 14, structHeight: 12, character: "Fl W 10s", lfId: "2088" },  // LF-40ED nº 2088
  { id: "sao-tome", name: "Farol de São Tomé", lat: -22.042, lng: -41.0528, altitude: 49, rangeLum: 40, rangeGeo: 17, structHeight: 45, character: "Fl(2) W 67.5s", lfId: "2156" },  // LF-40ED nº 2156
  { id: "macae", name: "Farol de Macaé", lat: -22.4163, lng: -41.7062, altitude: 156, rangeLum: 28, rangeGeo: 22, structHeight: 16, character: "Fl W 10s", lfId: "2160" },  // LF-40ED nº 2160
  { id: "cabo-frio", name: "Farol de Cabo Frio", lat: -23.0135, lng: -42.0008, altitude: 140, rangeLum: 49, rangeGeo: 27, structHeight: 16, character: "Fl W 10s", lfId: "2400" },  // LF-40ED nº 2400
  { id: "ponta-negra", name: "Farol de Ponta Negra", lat: -22.9607, lng: -42.6926, altitude: 71, rangeLum: 21, rangeGeo: 20, structHeight: 11, character: "Fl(2) W 10s", lfId: "2412" },  // LF-40ED nº 2412
  { id: "barra-da-tijuca", name: "Farol da Barra da Tijuca", lat: -22.9872, lng: -43.3683, altitude: 20, rangeLum: 15, rangeGeo: null, structHeight: null, character: "Fl W 10s", lfId: null },  // ⚠ fora da LF-40ED
  //   ⚠ sem registro da LF na posição; origem OpenSeaMap, o vizinho da LF é a Ilha Pontuda a 4,7 NM
  { id: "maricas", name: "Farol de Maricás", lat: -23.0152, lng: -42.9202, altitude: 80, rangeLum: 16, rangeGeo: 21, structHeight: 10, character: "LFl W 15s", lfId: "2416" },  // LF-40ED nº 2416
  { id: "ilha-pontuda", name: "Farol da Ilha Pontuda", lat: -23.038, lng: -43.3037, altitude: 87, rangeLum: 11, rangeGeo: 7, structHeight: 3, character: "Fl W R 10s", lfId: "2702" },  // LF-40ED nº 2702
  { id: "rasa", name: "Farol de Rasa", lat: -23.064, lng: -43.146, altitude: 101, rangeLum: 51, rangeGeo: 45, structHeight: null, character: "Fl W 10s", lfId: "2420" },  // LF-40ED nº 2420
  { id: "guaratiba", name: "Farol de Guaratiba", lat: -23.081, lng: -43.5623, altitude: 42, rangeLum: 18, rangeGeo: 16, structHeight: 8, character: "Fl W 6s", lfId: "2704" },  // LF-40ED nº 2704
  { id: "marambaia", name: "Farol de Marambaia", lat: -23.1157, lng: -43.8357, altitude: 24, rangeLum: 18, rangeGeo: 13, structHeight: 7, character: "Fl(2) W 10s", lfId: "2712" },  // LF-40ED nº 2712
  { id: "castelhanos", name: "Farol de Castelhanos", lat: -23.1678, lng: -44.0928, altitude: 121, rangeLum: 27, rangeGeo: 25, structHeight: 16, character: "Fl W 10s", lfId: "2716" },  // LF-40ED nº 2716
  { id: "juatinga", name: "Farol de Juatinga", lat: -23.2937, lng: -44.5053, altitude: 175, rangeLum: 17, rangeGeo: 29, structHeight: 8, character: "Fl W 10s", lfId: "3156" },  // LF-40ED nº 3156
  { id: "vitoria", name: "Farol da Vitória", lat: -23.7513, lng: -45.0112, altitude: 101, rangeLum: 16, rangeGeo: 23, structHeight: 4, character: "Fl W 6s", lfId: "3168" },  // LF-40ED nº 3168
  { id: "ponta-grossa", name: "Farol de Ponta Grossa", lat: -23.7767, lng: -45.2307, altitude: 60, rangeLum: 16, rangeGeo: 19, structHeight: 10, character: "LFl W 15s", lfId: "3170" },  // LF-40ED nº 3170
  { id: "ponta-do-boi", name: "Farol de Ponta do Boi", lat: -23.9665, lng: -45.2513, altitude: 70, rangeLum: 22, rangeGeo: 20, structHeight: 17, character: "Fl W 10s", lfId: "3176" },  // LF-40ED nº 3176
  { id: "moela", name: "Farol de Moela", lat: -24.0508, lng: -46.2635, altitude: 110, rangeLum: 40, rangeGeo: 39, structHeight: 10, character: "Fl W 10s", lfId: "3288" },  // LF-40ED nº 3288
  { id: "alcatrazes", name: "Farol de Alcatrazes", lat: -24.0958, lng: -45.703, altitude: 24, rangeLum: 15, rangeGeo: 13, structHeight: 7, character: "Fl W 6s", lfId: "3268" },  // LF-40ED nº 3268
  { id: "conceicao-3492", name: "Farol de Conceição", lat: -24.2363, lng: -46.691, altitude: 34, rangeLum: 16, rangeGeo: 17, structHeight: 6, character: "Fl W 10s", lfId: "3492" },  // LF-40ED nº 3492
  { id: "laje-de-santos", name: "Farol de Laje de Santos", lat: -24.3198, lng: -46.182, altitude: 38, rangeLum: 14, rangeGeo: 15, structHeight: 5, character: "Fl W 3s", lfId: "3284" },  // LF-40ED nº 3284
  { id: "queimada-grande", name: "Farol de Queimada Grande", lat: -24.479, lng: -46.6768, altitude: 83, rangeLum: 23, rangeGeo: 21, structHeight: 10, character: "Fl W 10s", lfId: "3500" },  // LF-40ED nº 3500

  // Sul (PR, SC, RS)
  { id: "bom-abrigo", name: "Farol de Bom Abrigo", lat: -25.1235, lng: -47.8625, altitude: 146, rangeLum: 28, rangeGeo: 23, structHeight: 16, character: "Fl W 10s", lfId: "3508" },  // LF-40ED nº 3508
  { id: "ilha-do-mel", name: "Farol da Ilha do Mel", lat: -25.5333, lng: -48.3, altitude: 67, rangeLum: 25, rangeGeo: 19, structHeight: 18, character: "Fl(3)W 15s", lfId: "3512" },  // LF-40ED nº 3512
  //   ⚠ mesma luz do Farol de Conchas (LF nº 3512, Farol das Conchas, na Ilha do Mel): a LF-40 não lista
  //   ⚠ segundo farol num raio de 2,6 NM
  { id: "conchas", name: "Farol de Conchas", lat: -25.5392, lng: -48.2908, altitude: 67, rangeLum: 25, rangeGeo: 19, structHeight: 18, character: "Fl W 10s", lfId: "3512" },  // LF-40ED nº 3512
  { id: "ilha-da-paz", name: "Farol de Ilha da Paz", lat: -26.1772, lng: -48.4848, altitude: 84, rangeLum: 26, rangeGeo: 23, structHeight: 16, character: "Fl W 10s", lfId: "3700" },  // LF-40ED nº 3700
  { id: "ponta-do-varrido", name: "Farol da Ponta do Varrido", lat: -26.785, lng: -48.5858, altitude: 50, rangeLum: 18, rangeGeo: 17, structHeight: 10, character: "Fl W 6s", lfId: "3816" },  // LF-40ED nº 3816
  { id: "arvoredo", name: "Farol de Arvoredo", lat: -27.296, lng: -48.3565, altitude: 90, rangeLum: 24, rangeGeo: 22, structHeight: 16, character: "Fl W 10s", lfId: "3880" },  // LF-40ED nº 3880
  { id: "ponta-da-galheta", name: "Farol da Ponta da Galheta", lat: -27.5758, lng: -48.4165, altitude: 150, rangeLum: 16, rangeGeo: 28, structHeight: 10, character: "Fl W 10s", lfId: "3883" },  // LF-40ED nº 3883
  { id: "santa-marta", name: "Farol de Santa Marta", lat: -28.6038, lng: -48.8127, altitude: 74, rangeLum: 46, rangeGeo: 39, structHeight: 29, character: "Fl W 10s", lfId: "3956" },  // LF-40ED nº 3956
  { id: "ararangua", name: "Farol de Araranguá", lat: -28.934, lng: -49.361, altitude: 82, rangeLum: 25, rangeGeo: 22, structHeight: 8, character: "Fl(3) W 20s", lfId: "3960" },  // LF-40ED nº 3960
  { id: "torres", name: "Farol de Torres", lat: -29.3447, lng: -49.7295, altitude: 85, rangeLum: 23, rangeGeo: 22, structHeight: 46, character: "Fl W 10s", lfId: "3972" },  // LF-40ED nº 3972
  { id: "tramandai", name: "Farol de Tramandaí", lat: -30.0082, lng: -50.1355, altitude: 25, rangeLum: 23, rangeGeo: 13, structHeight: 23, character: "Fl W 10s", lfId: "3980" },  // LF-40ED nº 3980
  { id: "cidreira", name: "Farol de Cidreira", lat: -30.1578, lng: -50.1973, altitude: 33, rangeLum: 20, rangeGeo: 15, structHeight: 30, character: "Fl W 6s", lfId: "3992" },  // LF-40ED nº 3992
  { id: "berta", name: "Farol de Berta", lat: -30.4003, lng: -50.2903, altitude: 42, rangeLum: 23, rangeGeo: 16, structHeight: 40, character: "Fl W 10s", lfId: "3994" },  // LF-40ED nº 3994
  { id: "solidao", name: "Farol de Solidão", lat: -30.7013, lng: -50.4808, altitude: 24, rangeLum: 15, rangeGeo: 14, structHeight: 21, character: "Fl(2) W 12s", lfId: "3996" },  // LF-40ED nº 3996
  { id: "mostardas", name: "Farol de Mostardas", lat: -31.249, lng: -50.908, altitude: 39, rangeLum: 40, rangeGeo: 34, structHeight: 38, character: "Fl W 10s", lfId: "4000" },  // LF-40ED nº 4000
  { id: "capao-da-marca-de-fora", name: "Farol Capão da Marca de Fora", lat: -31.5018, lng: -51.1883, altitude: 42, rangeLum: 17, rangeGeo: 16, structHeight: 40, character: "Fl(3) W 10s", lfId: "4002" },  // LF-40ED nº 4002
  { id: "conceicao-4004", name: "Farol de Conceição", lat: -31.7305, lng: -51.4817, altitude: 33, rangeLum: 16, rangeGeo: 15, structHeight: 30, character: "Fl(2) W 10s", lfId: "4004" },  // LF-40ED nº 4004
  { id: "estreito", name: "Farol de Estreito", lat: -31.8813, lng: -51.7725, altitude: 42, rangeLum: 17, rangeGeo: 16, structHeight: 40, character: "LFl W 15s", lfId: "4006" },  // LF-40ED nº 4006
  { id: "barra-rio-grande", name: "Farol da Barra (Rio Grande)", lat: -32.1178, lng: -52.0768, altitude: 32, rangeLum: 30, rangeGeo: 15, structHeight: 31, character: "Oc(6) W 21s", lfId: "4008" },  // LF-40ED nº 4008
  { id: "chui", name: "Farol de Chuí", lat: -33.7463, lng: -53.3768, altitude: 43, rangeLum: 46, rangeGeo: 16, structHeight: 30, character: "Fl W 10s", lfId: "4660" },  // LF-40ED nº 4660

  // Ilhas Oceânicas
  { id: "sao-pedro-e-sao-paulo", name: "Farol de São Pedro e São Paulo", lat: 0.9167, lng: -29.3333, altitude: 29, rangeLum: 15, rangeGeo: 14, structHeight: 6, character: "Fl(3)W 12s", lfId: "1106" },  // LF-40ED nº 1106
  { id: "martin-vaz", name: "Farol de Martin Vaz", lat: -20.5, lng: -28.85, altitude: 42, rangeLum: 23, rangeGeo: null, structHeight: null, character: "Fl W 8s", lfId: null },  // ⚠ fora da LF-40ED
  //   ⚠ nenhuma luz listada no arquipélago; a mais próxima fica a 25,8 NM, em Trindade
  { id: "trindade", name: "Farol de Trindade", lat: -20.5167, lng: -29.3167, altitude: 58, rangeLum: 28, rangeGeo: null, structHeight: null, character: "Fl(4)W 15s", lfId: null },  // ⚠ fora da LF-40ED
  //   ⚠ a LF-40 lista apenas faroletes de alinhamento na Ilha da Trindade (Enseada dos Portugueses, ALT
  //   ⚠ 45/46 m); não há farol único com este nome

];
