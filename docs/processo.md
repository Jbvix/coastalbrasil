# Documentação de Processo - Coastal Navigator Brasil

## 1. Ciclo de Desenvolvimento
O projeto segue um ciclo de desenvolvimento ágil simplificado.

1. **Planejamento**: Definição de novas funcionalidades (ex: Backend).
2. **Implementação**: Codificação no arquivo principal.
3. **Teste Manual**: Verificação no navegador (Desktop e Mobile).
4. **Deploy**: Push para GitHub e Deploy automático (Netlify/Vercel - Sugerido).

## 2. Processo de Deploy e Entrega

### 2.1 Versionamento (Git)
O código é gerenciado via Git e hospedado no GitHub.
- **Main Branch**: Código estável e pronto para produção.
- **Fluxo de Trabalho**:
  1. Alterações locais.
  2. `git add .`
  3. `git commit -m "Descrição"`
  4. `git push origin main`

### 2.2 Hospedagem
Recomendada utilização de serviços de PaaS (Platform as a Service) para sites estáticos:
- **Netlify** (Detecta index.html automaticamente).
- **Vercel**.
- **GitHub Pages**.

## 3. Plano de Testes (QA)

### 3.1 Testes Manuais Obrigatórios
Antes de cada release, verificar:
- [ ] **Renderização do Mapa**: O mapa carrega os tiles corretamente?
- [ ] **Criação de Waypoints**: Clicar cria ponto? A linha conecta?
- [ ] **Cálculos**: A distância total faz sentido? O ETA atualiza ao mudar a velocidade?
- [ ] **Mobile**: O layout quebra em telas pequenas? O toque funciona?
- [ ] **Importação GPX**: Testar com um arquivo GPX válido.

### 3.2 Manutenção
- **Monitoramento de APIs**: Verificar periodicamente se os servidores de tiles (OpenSeaMap) estão online.
- **Atualização de Faróis**: Revisar a Lista de Faróis da DHN anualmente e atualizar o array `lighthouses` no código se houver mudanças.
