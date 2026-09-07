# Coastal Navigator Brasil v2.3.0 ⛳

Aplicativo web gratuito e open-source para planejamento de viagens marítimas costeiras no Brasil.

## Funcionalidades Principais

- Mapa interativo com OpenSeaMap
- Database de 98 faróis brasileiros reconciliada com a **Lista de Faróis DH2, 40ª edição
  2026-2027** (DHN/CHM — Marinha do Brasil), corrigida até o Aviso aos Navegantes 14/2026.
  95 dos 98 registros são rastreáveis ao número de ordem da publicação; os 3 restantes
  estão marcados no código como fora da fonte oficial.
- Alcance efetivo de cada farol calculado como `min(alcance luminoso, alcance geográfico)`,
  com a altura do olho do observador configurável na viagem
- Cálculos automáticos: distância (NM), tempo, ETA, consumo de combustível
- Visibilidade automática de faróis por waypoint
- Consumo detalhado por período de 12h com data/hora real
- Importação/exportação GPX (compatível Navionics, Garmin, OpenCPN)
- Geração de relatório HTML profissional exportável
- Interface mobile-first (funciona perfeitamente em smartphones)

## Foco Educacional

Ideal para alunos de Ciências Náuticas, Aquaviários, CFN, rebocadores e profissionais em formação. Permite prática completa de planejamento de derrota com dados reais da Marinha do Brasil.

## Como Usar

Acesse diretamente no navegador (sem instalação):

- Landing page + manual: [index.html](index.html)
- Aplicativo: [app.html](app.html)

## Deploy

Site estático. Deploy recomendado no Netlify (conexão automática com GitHub).

## Autor

Jossian Brito (Charlie Bravo)  
LinkedIn: https://www.linkedin.com/in/jossianbrito/  
X/Twitter: https://x.com/jossiancosta

Bons ventos e mares calmos! 🚢

## Licença e Copyright

**Copyright (c) 2026 Jossian Brito**

Este projeto é licenciado sob a **Creative Commons Attribution-NonCommercial 4.0 International (CC BY-NC 4.0)**.

- Uso comercial não é permitido sem autorização expressa prévia do autor.
- A atribuição ao autor original é obrigatória.

O texto completo da licença está no arquivo [LICENSE](LICENSE).