# Documentação de Requisitos - Coastal Navigator Brasil

## 1. Introdução
O **Coastal Navigator Brasil** é um sistema de planejamento de viagem marítima costeira focado na costa brasileira. O projeto tem **fins educacionais**, servindo como ferramenta de ensino para navegação costeira, planejamento de derrotas e familiarização com a geografia náutica brasileira.

## 2. Necessidades do Usuário/Negócio
- **Educação Náutica**: Simular cenários reais de planejamento para alunos de cursos náuticos (Amador e Profissional).
- **Segurança da Navegação**: Fornecer dados precisos sobre faróis e distâncias para evitar acidentes (Simulação).
- **Eficiência Operacional**: Calcular consumo de combustível e tempos de viagem para melhor gestão de recursos.
- **Acessibilidade**: Funcionar plenamente em dispositivos móveis (tablets e smartphones) sem necessidade de internet constante.
- **Baixo Custo**: Arquitetura leve (Client-Side) para facilitar a distribuição e uso em sala de aula sem custos de infraestrutura.

## 3. Funcionalidades Principais (Requisitos Funcionais)

### 3.1 Planejamento de Rota
- **[RF01] Adicionar Waypoints**: O usuário deve poder adicionar pontos de rota (waypoints) clicando no mapa.
- **[RF02] Traçado Automático**: O sistema deve desenhar a rota conectando os waypoints sequencialmente.
- **[RF03] Importar GPX**: Capacidade de importar arquivos GPX de outros GPS ou softwares (navionics, OpenCPN).
- **[RF04] Exportar GPX**: Capacidade de exportar a rota planejada para uso em GPS.

### 3.2 Cálculos de Viagem
- **[RF05] Cálculo de Distância**: Calcular distância total e entre waypoints em Milhas Náuticas (NM).
- **[RF06] Estimativa de Tempo (ETA)**: Calcular hora prevista de chegada em cada ponto com base na velocidade média.
- **[RF07] Cálculo de Combustível**: Estimar consumo total e por trecho com base no consumo horário da embarcação.

### 3.3 Banco de Dados de Auxílios à Navegação
- **[RF08] Visualização de Faróis**: Exibir faróis da costa brasileira no mapa.
- **[RF09] Detalhes de Faróis**: Mostrar características (alcance, altura, lampejo) ao clicar no farol.
- **[RF10] Curadoria de Dados**: Base de dados deve refletir informações oficiais da DHN.

### 3.4 Relatórios
- **[RF11] Gerar Relatório de Viagem**: Criar um documento (HTML/PDF) com o plano de viagem detalhado.

## 4. Requisitos Não-Funcionais
- **[RNF01] Responsividade**: Interface deve se adaptar a telas de desktop, tablets e smartphones.
- **[RNF02] Performance**: O mapa deve renderizar suavemente mesmo com dezenas de waypoints.
- **[RNF03] Disponibilidade**: O sistema deve ser um Single Page Application (SPA) capaz de rodar client-side.
- **[RNF04] Usabilidade**: Interface intuitiva com modo noturno/escuro para preservação da visão noturna no passadiço.

## 5. Futuras Implementações (Backend)
- **[FUT01] Persistência em Nuvem**: Salvar rotas em banco de dados.
- **[FUT02] Autenticação**: Contas de usuário individuais.
- **[FUT03] Integração API Meteorológica**: Dados de vento e maré em tempo real.
