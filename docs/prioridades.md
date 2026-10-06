# Prioridades do FinTano

## Base V17

A aplicação existente em 06/10/2026, com referência no commit `840b974`, é a base V17. Partimos do funcionamento atual, descrito em [funcionamento](funcionamento.md), sem planejar entregas por versões anteriores. Os IDs FT são mantidos apenas para identificar as pendências já discutidas.

Critério de prioridade: primeiro corrigir registros e efeitos financeiros; depois conectar decisões e projeções; por último melhorar recursos opcionais. KISS, uso pessoal exclusivo em notebook e computador e validação proporcional ao risco continuam obrigatórios.

## Fila de execução

| Ordem | Prioridade | Itens que andam juntos | Por que executar |
| --- | --- | --- | --- |
| 1 | Alta | FT-16 — movimentos integrados | Transferência, resgate e amortização precisam produzir efeitos coerentes em caixa, patrimônio e aporte, com um único registro. |
| 2 | Alta | FT-14 + FT-15 — compras e terceiros | Importação e rateio precisam concordar sobre a compra, o desembolso total e o que falta receber. Evitar duplicatas e reembolso contado como renda. |
| 3 | Alta | FT-19 + FT-20 — ocorrências e agenda | Preservar o que já foi pago/recebido e mostrar a próxima pendência correta. A agenda deve usar a mesma conciliação dos movimentos. |
| 4 | Alta | FT-23 + FT-22 — correção e leitura do Histórico | Corrigir a origem dos fatos sem criar divergência; mostrar os desvios e retirar informações do presente e resumos repetidos. |
| 5 | Média | FT-17 + FT-18 + FT-21 — saldos, destinos e projeção | Usar saldos datados e a mesma capacidade de aporte para metas e projeções, evitando prometer dinheiro em duplicidade. |
| 6 | Baixa | FT-25 — exportação para IA | Recurso opcional de análise externa; deve refletir os números reconciliados da aplicação e explicitar incertezas. |

**Próxima implementação: FT-16.** Seguir a fila acima. Dentro dos blocos: FT-14 antes de FT-15; FT-19 antes de FT-20; FT-23 antes de FT-22; FT-17 antes de FT-18 e FT-21. Concluir uma etapa funcional antes de abrir a seguinte, sem iniciar vários blocos ao mesmo tempo.

Um bloco agrupa partes que devem compartilhar os mesmos dados e regras. Ele pode ser entregue em etapas utilizáveis; não exige uma alteração grande de uma vez. Ajustes pontuais de um bloco posterior podem entrar antes quando forem indispensáveis ao bloco em execução; registrar o motivo.

## Escopo e conclusão de cada pendência

### Alta

- [ ] **FT-16 — Movimentos integrados.** Registrar origem, destino, valor, competência e data conforme a operação. Transferência cria movimentos vinculados; resgate explicita recursos que voltam à conta; amortização extra reduz dívida e caixa uma vez. Ajustar saldo por extrato não representa pagamento. Concluir quando transferir R$ 1.000 conservar patrimônio e aporte líquido, amortizar R$ 1.000 consumir caixa uma vez e desfazer reverter os efeitos relacionados. Usar os livros existentes, sem criar outro cadastro financeiro. Fontes: `Ledger.tsx`, `useInvestments.ts`, `useDebts.ts`, `investmentActuals.ts`, `currentCycleFacts.ts`.

- [ ] **FT-14 — Importação conferível.** Mostrar linhas aceitas, descartes com motivo, possíveis duplicatas e diferenças da substituição, incluindo créditos e vínculos. Reconhecer totalizadores pela estrutura; uma compra chamada Total Fitness deve continuar válida. Concluir quando repetir a importação não duplicar compras silenciosamente e o usuário conseguir revisar antes de gravar. Manter colagem de planilha. Fontes: `cardImport.ts`, `CardImportPanel.tsx`, `useCreditCards.ts`.

- [ ] **FT-15 — Reembolsos.** Distinguir parte pessoal, valor pago ao banco, adiantamento a terceiros e reembolso recebido, inclusive parcial. Relacionar a devolução à compra, sem tratá-la como renda nova. Concluir quando uma compra de R$ 300, com R$ 100 pessoais e R$ 200 de terceiros, conservar o desembolso necessário e reduzir o valor a receber conforme a devolução. Não presumir que todo rateio é um adiantamento pendente. Fontes: `types/cards.ts`, `cardCycleAccounting.ts`, `CardSummaryPanels.tsx`, `currentCycleFacts.ts`.

- [ ] **FT-19 — Ocorrências preservadas.** Editar esta ou próximas ocorrências sem reabrir as liquidadas. Adiar conserva pagamentos parciais; cancelar não apaga fatos e permite recuperação. Vincular previsão a plano, meta, cobrança ou movimento já existente para não registrar o mesmo dinheiro novamente. Concluir quando alterar um bônus futuro não mudar o recebido e uma despesa vinculada entrar uma vez no cálculo. Fontes: `useForecast.ts`, `forecast.ts`, `forecastCoverage.ts`, `ForecastCommitments.tsx`.

- [ ] **FT-20 — Agenda pela pendência real.** Ordenar pela próxima ocorrência pendente conciliada, com data e restante corretos. Mostrar vencidos e parciais; manter concluídos/cancelados no detalhe e projeção sob demanda. Concluir quando efetivar uma ocorrência avançar o resumo para a próxima pendência, usando o mesmo fato do Ciclo e uma única lista principal. Fontes: `ForecastView.tsx`, `ForecastCommitments.tsx`, `useForecast.ts`.

- [ ] **FT-23 — Correção do passado.** Editar em rascunho com salvar/cancelar, antes/depois e motivo. Corrigir na origem quando houver movimento; usar ajuste explícito quando só houver um agregado. Atualizar detalhes e totais relacionados sem substituir patrimônio passado pelos saldos atuais. Concluir quando cancelar não gravar, corrigir um extra não divergir da agenda e mudar competência de aporte preservar sua data e identificar os ciclos revisados. Fontes: `HistoryView.tsx`, `useHistory.ts`, `history.ts`, `useActuals.ts`.

- [ ] **FT-22 — Histórico enxuto.** No mesmo bloco de FT-23, retirar patrimônio atual e resumos repetidos, priorizando diferença contra plano, origem das mudanças e detalhes consultáveis. Identificar períodos ausentes ou estimados; não chamar residual sem origem de rentabilidade. Concluir quando tabela e gráfico usarem o mesmo período e cada desvio puder ser explicado sem procurar totais em blocos concorrentes. Fontes: `HistoryView.tsx`, `HistoryOverview.tsx`, `HistoryTrendExplorer.tsx`, `historyTrends.ts`.

### Média

- [ ] **FT-17 — Saldo com contexto.** Mostrar a data das avaliações e separar mudança de valor de aporte. Simplificar o resumo patrimonial e esclarecer o alcance dos comparadores de taxas e moradia. Concluir quando atualizar avaliação alterar saldo/rendimento sem criar aporte e o usuário souber de quando é o saldo. Não reconstruir cadastros ou avaliações que já existam. Fontes: `InvestmentsManager.tsx`, `ReserveSection.tsx`, `AssetsManager.tsx`, `DebtsManager.tsx`, `investments.ts`.

- [ ] **FT-18 — Destinos dos aportes.** Usar referências estáveis para destinar posições e aporte à reserva e às metas. Comparar a soma dos aportes prometidos com a capacidade mensal; diferenciar acompanhar saldo de reservar recursos. Concluir quando duas metas de R$ 800 não parecerem financiadas por um aporte de R$ 1.000 e destinar saldo existente não aumentar patrimônio. Explicar a base da reserva. Fontes: `InvestmentPlan.tsx`, `GoalsSection.tsx`, `ReserveSection.tsx`, `goals.ts`, `scenario.ts`.

- [ ] **FT-21 — Projeção consistente.** Depois dos vínculos de FT-19 e destinos de FT-18, separar base sem entradas incertas da hipótese com elas, considerar compromissos uma vez e tratar pendências do ciclo inicial. Projetar metas pelas próprias fontes, alinhar valores nominais/reais e mostrar a primeira insuficiência. Concluir quando bônus incerto não aumentar a base, dívida reduzida não inflar meta de carteira e despesas ligadas ao plano/cartão não duplicarem. Não prometer saldo bancário diário. Fontes: `forecast.ts`, `useFinancas.ts`, `ForecastView.tsx`.

### Baixa

- [ ] **FT-25 — Fotografia para IA.** Usar as mesmas consultas do Ciclo, com origem, pendências, terceiros e incertezas. Desconhecido não vira zero e plano não vira realizado. Concluir quando o texto revisado e copiado tiver os mesmos números e qualificações da aplicação; gerar o texto não envia dados automaticamente. Acompanhar alterações das fontes durante as prioridades anteriores e concluir o fluxo depois delas. Fontes: `AIAnalysisDialog.tsx`, `aiAnalysis.ts`, `App.tsx`.

## Trabalho transversal

- **FT-24 — Edição e navegação:** aplicar nas telas afetadas por cada bloco: salvar/cancelar em mudanças compostas, rascunho conservado em falha, zero distinguível de vazio, diálogos e atalhos por teclado e links que abrem o registro relacionado. Não abrir uma refatoração genérica ou um projeto visual separado.
- **FT-26 — Documentação e limpeza:** a consolidação documental da base V17 está concluída. Atualizar estes documentos conforme o funcionamento mudar. Remover código somente quando estiver comprovadamente sem uso no fluxo trabalhado, sem campanha geral de limpeza.

## Execução e validação

Antes de implementar um item, conferir no código e nos dados atuais o que já existe e qual diferença ainda precisa ser resolvida. A caixa pendente não significa ausência total da funcionalidade. Registrar o que mudou, a jornada curta conferida e seus limites, marcando o item somente quando o resultado financeiro estiver coerente.

Usar dados sintéticos ou cópia isolada quando houver alteração financeira. Conferir apenas a jornada e persistência afetadas. Não perseguir cobertura de testes; criar ou executar testes somente diante de risco concreto. Build e outras verificações entram quando necessários à integração. Conferir telas em notebook e computador, com mouse e teclado.

## Registro a partir da V17

| Data | Trabalho | Resultado |
| --- | --- | --- |
| 06/10/2026 | Base V17 e FT-26 documental | Fila priorizada registrada; funcionamento e contrato de dados consolidados; planos, diagnósticos e registros de entregas anteriores removidos. Funcionalidades pendentes continuam sem execução nesta organização. |
