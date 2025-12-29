# Sugestão de Artigo para LinkedIn

**Título Sugerido:** Navegação Costeira na Era Digital: Apresentando o Coastal Navigator Brasil 🇧🇷⚓

**Subtítulo:** Uma ferramenta educacional open-source para planejamento de derrotas na costa brasileira.

---

**Corpo do Artigo:**

Olá, rede! 👋

Hoje gostaria de compartilhar um projeto pessoal que une duas paixões: a tecnologia e a navegação marítima.

Apresento o **Coastal Navigator Brasil**, uma aplicação web desenvolvida para auxiliar estudantes, amadores e entusiastas da náutica no planejamento de viagens costeiras.

🎯 **O Problema:**
Quem estuda navegação sabe que o planejamento de uma derrota (rota) envolve diversos cálculos: distância, tempo estimado (ETA), consumo de combustível e identificação de auxílios à navegação (faróis). Fazer isso manualmente na carta náutica é essencial para o aprendizado, mas ter uma ferramenta digital para simular cenários é um grande diferencial pedagógico.

💡 **A Solução:**
Desenvolvi uma Single Page Application (SPA) leve e acessível que permite traçar rotas na costa brasileira de forma intuitiva.

✨ **Principais Funcionalidades:**
*   **Planejamento Automático:** Clique no mapa e a rota é traçada, calculando instantaneamente a distância total em Milhas Náuticas.
*   **Cálculo de ETA e Combustível:** Com base na velocidade e consumo da embarcação, o sistema projeta os horários de chegada e o consumo estimado para cada pernada.
*   **Banco de Dados DHN:** Integrei a lista oficial de faróis da Diretoria de Hidrografia e Navegação (DHN). Agora é possível visualizar o alcance e características dos faróis de Rio Grande ao Oiapoque.
*   **Mobile First:** Funciona perfeitamente em tablets e celulares, ideal para consultas rápidas.
*   **Offline Capable:** Uma vez carregado, o app roda 100% no navegador do cliente, sem depender de internet para os cálculos.

🚀 **Tecnologia com Propósito Educacional:**
O projeto é **Open Source**! O código é aberto para que outros desenvolvedores e estudantes possam aprender como construir aplicações de mapas interativos.
Utilizei tecnologias web puras (HTML5, CSS3, Vanilla JS) e a biblioteca Leaflet, garantindo que o app seja leve e rode em qualquer dispositivo.

🤝 **Por que Open Source? (O Retorno)**
Muitos perguntam "qual a vantagem?" de abrir o código. Para mim, o retorno é claro:
1.  **Vitrine Técnica:** O código fala mais alto que qualquer currículo. É uma prova real de capacidade de entrega e arquitetura.
2.  **Evolução Acelerada:** A comunidade pode auditar, encontrar bugs e sugerir melhorias que eu jamais veria sozinho.
3.  **Legado Educacional:** Retribuir o conhecimento que adquiri gratuitamente, ajudando a próxima geração de devs e navegantes.

🔧 **Bastidores: Lógica e Estratégia de Desenvolvimento**

Para garantir precisão e performance, implementei algumas estratégias chave:

1.  **Geodesia com Fórmula de Haversine:**
    Para calcular a distância entre dois pontos no globo terrestre, não basta uma simples geometria plana (Euclidiana). Implementei a **Fórmula de Haversine**, que leva em conta a curvatura da Terra, garantindo precisão nas rotas longas (Milhas Náuticas).

    > `a = sin²(Δφ/2) + cos φ1 ⋅ cos φ2 ⋅ sin²(Δλ/2)`
    > `c = 2 ⋅ atan2(√a, √(1−a))`
    > `d = R ⋅ c`

2.  **Cálculo Preditivo de ETA:**
    O algoritmo itera sobre cada segmento da rota (waypoint A -> B), calculando o tempo necessário com base na velocidade média da embarcação (`Tempo = Distância / Velocidade`). O ETA é atualizado dinamicamente: se você mudar a velocidade planejada, toda a previsão de chegada é recalculada instantaneamente.

3.  **Arquitetura Client-Side (Offline First):**
    Optei propositalmente por não usar um backend complexo. Toda a lógica roda no navegador do usuário.
    *   **Vantagem 1:** Custo zero de servidor (ideal para manter o projeto gratuito para estudantes).
    *   **Vantagem 2:** Robustez. O mar não tem Wi-Fi. Uma vez carregado, o navegador armazena a aplicação em cache e os cálculos funcionam 100% offline.

4.  **Integração UX Mobile:**
    Desenvolvi listeners específicos para eventos de toque (`touchstart`), garantindo que a experiência em tablets e smartphones seja fluida, permitindo zoom e plotagem de rota com precisão mesmo em telas pequenas.


Convido todos a testarem e contribuírem com feedbacks!

👇 **Links:**
🔗 **Acesse o App:** [Insira seu Link do Netlify aqui]
💻 **Código Fonte (GitHub):** https://github.com/Jbvix/coastal-nav-br

#Navegação #MarinhaDoBrasil #EducaçãoNáutica #OpenSource #DesenvolvimentoWeb #Leaflet #TechForGood
