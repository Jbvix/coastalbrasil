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

### 3.1 Provas automáticas em cada pull request  (v2.14.0)

O workflow `.github/workflows/provas.yml` executa, em **todo pull request
para a `main`** e em todo empurrão na própria `main`:

| Job | Comando | O que pega | O que NÃO pega |
|---|---|---|---|
| **Banco de provas** | `node tests/suite.js` | Erro de **cálculo** — fórmula trocada, tolerância frouxa, varredura de código que parou de casar | Erro de carregamento |
| **Fumaça** | `npm run smoke` | Erro de **carregamento** — ordem de `<script>`, caminho de módulo, hash SRI, CSS ausente, erro de console | Erro de cálculo puro |

As duas não se substituem. O banco roda as funções reais fora do navegador; a
fumaça abre o app num Chromium de verdade e percorre o fluxo inteiro.

**Por que isto passou a existir.** Até a v2.13.0 as provas só rodavam quando
alguém lembrava de rodá-las. A disciplina inteira dependia de memória humana —
e memória humana é o primeiro componente a falhar numa singradura longa. É o
mesmo motivo pelo qual não se larga o cais confiando que a máquina vai pegar
porque pegou ontem: dá-se partida antes, toda vez.

#### O defeito que a ligação revelou

Ao ligar o banco ao workflow, descobriu-se que `node tests/suite.js`
**sempre saía com código 0** — inclusive com falha na tela. O relatório
imprimia o `✘` em vermelho e encerrava dizendo "tudo bem".

Isso nunca doeu enquanto um humano lia a saída: o olho vê o vermelho. Mas uma
máquina de integração não lê, **consulta o código de saída**. Ligada assim,
seria um alarme com a lâmpada fora do circuito — acende verde sempre e ensina
a tripulação a confiar numa luz que não mede nada. Pior que não ter alarme,
porque troca desconfiança por certeza falsa.

A correção segue a disciplina da casa, **separar a decisão do efeito**:

- `codigoDeSaida(resultados)` **decide**, é pura e é provada (26.3 e 26.4);
- `process.exitCode = codigoDeSaida(results)` apenas **executa**.

#### A regra: só FAIL derruba a obra

Os `WARN` são defeitos **conhecidos e documentados** (portão administrativo no
cliente, `unsafe-inline` por `onclick=`, registros fora da LF-40ED). Derrubar o
CI por eles acenderia a luz vermelha todo dia por motivo que ninguém pode
resolver hoje — e **luz que acende todo dia deixa de ser vista**.

A contagem vai para o resumo do job: quem abre o pull request lê
`258 provas · 255 PASS · 0 FAIL · 3 WARN` e, havendo falha, uma tabela com a
prova, o que se quebrou e **a consequência a bordo** — sem abrir log nenhum.
Lâmpada binária diz que algo quebrou; a tabela diz **o quê**.

#### Segurança do workflow

Ele dispara em `pull_request`, que pode vir de código ainda não revisado.
Portanto: `permissions: contents: read` e **nenhum segredo**. Nem a chave paga
do Open-Meteo, nem o token Cesium, nem o hash do portão administrativo — a
fumaça serve um `cesium-config.js` vazio de propósito. Isto é seguro e não
apenas prudente, porque as provas rodam **inteiras** sem segredo algum. A
prova 26.5 guarda essa condição.

#### Limite conhecido

A fumaça valida os hashes SRI contra os **bytes reais** do unpkg e do jsdelivr
— mais severa que na bancada local, onde há cópias em `tests/fixtures/` (não
versionadas). O preço é uma dependência externa: se uma CDN cair, a fumaça fica
vermelha por motivo que não é do código. Um passo de conferência prévia **dá
nome à falha** antes que ela se disfarce de regressão; ele não afrouxa nada.

Também não há `package-lock.json` no repositório, então o job usa
`npm install` e não `npm ci`. Sem trava de versões, uma atualização do
Playwright entra sozinha. **Dívida registrada, não resolvida.**

#### O que nenhuma máquina de integração vê

Voz sintetizada, microfone, GPS, acelerômetro e o Cesium ion continuam fora de
alcance. As pendências de confirmação de bordo seguem valendo.

### 3.2 Testes Manuais Obrigatórios
Antes de cada release, verificar:
- [ ] **Renderização do Mapa**: O mapa carrega os tiles corretamente?
- [ ] **Criação de Waypoints**: Clicar cria ponto? A linha conecta?
- [ ] **Cálculos**: A distância total faz sentido? O ETA atualiza ao mudar a velocidade?
- [ ] **Mobile**: O layout quebra em telas pequenas? O toque funciona?
- [ ] **Importação GPX**: Testar com um arquivo GPX válido.

### 3.3 Manutenção
- **Monitoramento de APIs**: Verificar periodicamente se os servidores de tiles (OpenSeaMap) estão online.
- **Atualização de Faróis**: Revisar a Lista de Faróis da DHN anualmente e atualizar o array `lighthouses` no código se houver mudanças.
