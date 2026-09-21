/*
════════════════════════════════════════════════════════════════════════════════
  REFERÊNCIAS DE TERRA — Coastal Navigator Brasil
════════════════════════════════════════════════════════════════════════════════
  GERADO por tools/terra/gerar_referencias.mjs em 2026-09-20.
  NÃO EDITAR À MÃO — regere e perde-se a edição.

  Autor: Jossian Brito (Charlie Bravo)

  O QUE ESTE ARQUIVO É
    Referência de ORIENTAÇÃO: o nome de terra mais próximo de um ponto no mar,
    para que "estou em 23°05'S 041°53'W" vire "estou 12 milhas a leste de Cabo
    Frio" — que é como uma pessoa entende onde está.

  ⚠️  O QUE ESTE ARQUIVO NÃO É — leia antes de confiar
    NÃO É INDICAÇÃO DE ABRIGO. Um porto desta lista não é, por estar aqui, um
    lugar seguro para se meter com mau tempo. Escolher abrigo exige carta
    náutica, tenedouro, proteção de QUAL quadrante, profundidade e acesso
    noturno — nada disso está aqui, nem em nenhuma base pública ao alcance do
    gerador. Referência de orientação não é conselho de derrota.

  FONTE
    Natural Earth 10 m (domínio público): ne_10m_ports + ne_10m_populated_places.
    Cidades: só Brasil (ADM0NAME), e só as a menos de 25 NM da linha de costa.
    Portos: recorte geográfico — inclui Caiena, Kourou e Paramaribo, que são
    referência legítima para quem sobe ao Amapá, e não são brasileiros.

  ⚠️  PORTOS QUE SABIDAMENTE FALTAM
    Suape · Itaqui · Sepetiba/Itaguaí · São Sebastião · Angra dos Reis ·
    Tubarão · Areia Branca · Imbituba · Antonina · Itajaí · Cabedelo ·
    São Luís · Barra do Riacho

    Nenhum deles existe na Natural Earth, nem como cidade, nem como farol na
    LF-40ED da DHN — conferido um a um. A ANTAQ está inacessível desta bancada
    e o IBGE não publica coordenadas. Coordenada de porto NÃO SE INVENTA:
    para emendar, preencha PORTOS_EXTRA no gerador, COM A PROCEDÊNCIA na quarta
    coluna, e regere.

  FORMATO
    portos:  [latitude, longitude, nome]
    cidades: [latitude, longitude, nome, unidade federativa]
════════════════════════════════════════════════════════════════════════════════
*/
const REFERENCIAS_TERRA = {
  portos: [
  [5.82,-55.139,"Paramaribo"],
  [5.1589,-52.6243,"Kourou"],
  [4.9353,-52.3362,"Cayenne"],
  [4.8531,-52.272,"Cayenne"],
  [0.0322,-51.0427,"Macapa"],
  [-1.4517,-48.4847,"Belem"],
  [-3.7075,-38.4732,"Mucuripe"],
  [-3.7175,-38.5214,"Fortaleza"],
  [-5.7831,-35.2,"Natal"],
  [-8.0536,-34.869,"Recife"],
  [-9.6789,-35.7223,"Maceio"],
  [-10.9253,-37.0395,"Aracaju"],
  [-12.9586,-38.5048,"Salvador"],
  [-14.7803,-39.0257,"Ilheus"],
  [-20.3233,-40.3351,"Vitoria"],
  [-22.8792,-43.1246,"Niteroi"],
  [-22.8831,-43.1918,"Rio de Janeiro"],
  [-23.9689,-46.3005,"Santos"],
  [-25.5008,-48.5191,"Paranagua"],
  [-26.2381,-48.6355,"Sao Francisco do Sul"],
  [-26.8989,-48.6542,"Navegantes"],
  [-30.0175,-51.2241,"Porto Alegre"],
  [-31.7819,-52.3237,"Pelotas"],
  [-32.0561,-52.0762,"Rio Grande"]
  ],
  cidades: [
  [3.2167,-51.2167,"Vila Velha","Amapi"],
  [2.05,-50.8,"Amapá","Amapi"],
  [0.033,-51.05,"Macapá","Amapá"],
  [-0.0396,-51.18,"Porto Santana","Amapá"],
  [-0.6095,-47.34,"Salinópolis","Pará"],
  [-1.05,-46.77,"Bragança","Pará"],
  [-1.19,-47.18,"Capanema","Pará"],
  [-1.1965,-46.14,"Viseu","Pará"],
  [-1.2896,-47.93,"Castanhal","Pará"],
  [-1.4481,-48.482,"Belém","Pará"],
  [-1.68,-50.49,"Breves","Pará"],
  [-1.7245,-48.8849,"Abaetetuba","Pará"],
  [-1.95,-50.82,"Portel","Pará"],
  [-2.2396,-49.51,"Cametá","Pará"],
  [-2.514,-44.2679,"São Luís","Maranhão"],
  [-2.5196,-45.09,"Pinheiro","Maranhão"],
  [-2.55,-44.07,"São José de Ribamar","Maranhão"],
  [-2.8896,-40.12,"Acaraú","Ceará"],
  [-2.9,-40.85,"Camocim","Ceará"],
  [-2.91,-41.77,"Parnaíba","Piauí"],
  [-2.94,-44.26,"Rosário","Maranh"],
  [-3.1195,-40.84,"Granja","Ceará"],
  [-3.2096,-45,"Viana","Maranhão"],
  [-3.3995,-39.04,"Paracuru","Ceará"],
  [-3.4,-44.36,"Itapecuru Mirim","Maranhão"],
  [-3.4995,-39.58,"Itapipoca","Ceará"],
  [-3.7481,-38.5819,"Fortaleza","Ceará"],
  [-4.56,-37.77,"Aracati","Ceará"],
  [-5.19,-37.34,"Mossoró","Rio Grande do Norte"],
  [-5.7781,-35.242,"Natal","Rio Grande do Norte"],
  [-6.4696,-35.44,"Nova Cruz","Rio Grande do Norte"],
  [-7.0992,-34.878,"João Pessoa","Paraíba"],
  [-7.4996,-35.32,"Timbaúba","Pernambuco"],
  [-7.5596,-35,"Goiana","Pernambuco"],
  [-7.8475,-35.2539,"Carpina","Pernambuco"],
  [-8,-34.85,"Olinda","Pernambuco"],
  [-8.0605,-34.9088,"Recife","Pernambuco"],
  [-8.11,-35.02,"Jaboatao","Pernambuco"],
  [-8.29,-35.03,"Cabo de Santo Agostinho","Pernambuco"],
  [-8.8296,-35.2,"Barreiros","Pernambuco"],
  [-9.48,-35.84,"Rio Largo","Alagoas"],
  [-9.6181,-35.7319,"Maceió","Alagoas"],
  [-10.2696,-36.58,"Penedo","Alagoas"],
  [-10.9,-37.12,"Aracaju","Sergipe"],
  [-11.2696,-37.45,"Estância","Sergipe"],
  [-12.25,-38.97,"Feira de Santana","Bahia"],
  [-12.968,-38.4819,"Salvador","Bahia"],
  [-13.3596,-39.08,"Valença","Bahia"],
  [-14.3,-39.33,"Ubaitaba","Bahia"],
  [-14.78,-39.05,"Ilhéus","Bahia"],
  [-14.7896,-39.28,"Itabuna","Bahia"],
  [-15.64,-38.96,"Canavieiras","Bahia"],
  [-16.28,-39.03,"Santa Cruz Cabrália","Bahia"],
  [-16.4296,-39.08,"Porto Seguro","Bahia"],
  [-17.0396,-39.5299,"Itamaraju","Bahia"],
  [-17.88,-39.37,"Nova Viçosa","Bahia"],
  [-18.7296,-39.86,"São Mateus","Espírito Santo"],
  [-19.39,-40.05,"Linhares","Espírito Santo"],
  [-20.332,-40.3539,"Vitória","Espírito Santo"],
  [-20.338,-40.2902,"Vila Velha","Espírito Santo"],
  [-20.85,-41.13,"Cachoeiro de Itapemirim","Espírito Santo"],
  [-21.75,-41.32,"Campos","Rio de Janeiro"],
  [-22.38,-41.79,"Macaé","Rio de Janeiro"],
  [-22.5095,-43.2,"Petrópolis","Rio de Janeiro"],
  [-22.56,-44.17,"Barra Mansa","Rio de Janeiro"],
  [-22.7551,-43.4452,"Nova Iguaçu","Rio de Janeiro"],
  [-22.7964,-43.3056,"Duque de Caxias","Rio de Janeiro"],
  [-22.8825,-43.1058,"Niterói","Rio de Janeiro"],
  [-22.89,-42.04,"Cabo Frio","Rio de Janeiro"],
  [-22.9073,-43.2121,"Rio de Janeiro","Rio de Janeiro"],
  [-23.5567,-46.627,"São Paulo","São Paulo"],
  [-23.6528,-46.5278,"Santo André","São Paulo"],
  [-23.9618,-46.3285,"Santos","São Paulo"],
  [-24.18,-46.8,"Itanhaem","São Paulo"],
  [-24.49,-47.84,"Registro","São Paulo"],
  [-24.72,-47.5699,"Iguape","São Paulo"],
  [-25.5279,-48.5345,"Paranaguá","Paraná"],
  [-26.2396,-48.6,"São Francisco do Sul","Santa Catarina"],
  [-26.318,-48.8419,"Joinville","Santa Catarina"],
  [-26.48,-49.1,"Jaraguá do Sul","Santa Catarina"],
  [-26.8996,-48.68,"Itajaí","Santa Catarina"],
  [-26.92,-49.09,"Blumenau","Santa Catarina"],
  [-27.13,-48.93,"Brusque","Santa Catarina"],
  [-27.578,-48.522,"Florianópolis","Santa Catarina"],
  [-28.2296,-48.66,"Imbituba","Santa Catarina"],
  [-28.48,-49.02,"Tubarão","Santa Catarina"],
  [-28.48,-48.78,"Laguna","Santa Catarina"],
  [-28.68,-49.39,"Criciúma","Santa Catarina"],
  [-28.94,-49.5,"Araranguá","Santa Catarina"],
  [-29.7096,-51.14,"Novo Hamburgo","Rio Grande do Sul"],
  [-29.88,-50.27,"Osório","Rio Grande do Sul"],
  [-29.92,-51.18,"Canoas","Rio Grande do Sul"],
  [-30.0481,-51.202,"Porto Alegre","Rio Grande do Sul"],
  [-30.8396,-51.81,"Camaquã","Rio Grande do Sul"],
  [-31.37,-51.98,"São Lourenço do Sul","Rio Grande do Sul"],
  [-31.75,-52.33,"Pelotas","Rio Grande do Sul"],
  [-32.0495,-52.12,"Rio Grande","Rio Grande do Sul"],
  [-33.52,-53.37,"Santa Vitória do Palmar","Rio Grande do Sul"]
  ]
};
