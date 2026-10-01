# FT-06 — Plano mensal, modelo e simulação

## Estado observado

- `useScenarios` persiste uma lista de `FinanceScenario` e `activeScenarioId`. O cenário selecionado é ao mesmo tempo modelo editável, plano do Ciclo e base de comparação. As ações em Planejar alteram esse objeto diretamente; por isso novembro e outubro podem compartilhar o mesmo plano sem intenção explícita.
- `useFinancas` lê `scenarios.activeScenario` para métricas, custos do Realizado, investimentos planejados e snapshot. `closeCycleInDocument` confere `activeScenarioId` contra o snapshot. O seletor de ciclo altera a competência operacional mesmo fora do fluxo de fechamento.
- O backup v9 conserva `planning.cycles`, mas o runtime ainda não edita um plano por competência. FT-05 guarda esses registros em `backupCarryover` até a adoção nesta etapa.

## Contrato implementado

1. `monthlyPlans` é a fonte do plano operacional: um registro por competência com ID próprio, `sourceTemplateId`, datas de criação/edição e dados completos de `FinanceScenarioData`, preservando IDs de custo, Desejo e desconto. Criar um mês captura o modelo recorrente uma vez; consultar outro mês não cria nem ativa um plano.
2. `scenarios` continua como biblioteca de modelos/rascunhos de comparação. Selecionar simulação altera só a prévia. A ação “Aplicar ao ciclo” copia os dados para o plano daquela competência numa operação revisável. Fatos em `actuals`, cartão, ledger e histórico nunca são parte dessa cópia.
3. Editar Planejar atualiza o plano do ciclo ativo. Editar o modelo recorrente oferece “somente modelo” ou “modelo e ciclos futuros ainda não personalizados”. Não alterar ciclos fechados nem o ciclo anterior. Custo arquivado permanece com seu ID no plano e nos fatos; a lista operacional filtra apenas sua exibição futura.
4. O fechamento lê e valida o plano da competência ativa, não o cenário de comparação. O snapshot conserva o ID/nome da origem do plano e os itens usados. Uma consulta histórica usa o snapshot/realizado do mês consultado sem mudar `activeCycle.month`.
5. A migração dos documentos atuais cria o plano do ciclo ativo a partir do cenário até então selecionado, sem alterar realizados. Planos aceitos do backup v9 viram registros completos quando puderem ser reconstruídos com identidade de itens; quando houver apenas totais, manter os totais no `backupCarryover` e mostrar a limitação, sem inventar itens.

## Entrega

1. Tipos, armazenamento e migração idempotente com cópia anterior; teste de outubro/novembro e preservação dos fatos.
2. Hook de plano mensal e comando de aplicação explícita; mudar consumidores do Ciclo e do fechamento para esse plano.
3. Seletor de simulações com prévia e aplicação; editor do modelo com alcance sobre ciclos futuros.
4. Backup v9: incluir plano mensal editável completo na próxima extensão compatível, sem perder a leitura de v7/v8/v9. Reconciliar IDs, centavos e planos importados.
5. A migração e a jornada de outubro/novembro foram verificadas com dados sintéticos. O build e o lint foram executados. A conferência renderizada a 390 px segue pendente porque o navegador integrado está indisponível nesta sessão.

O seletor do cabeçalho agora pede confirmação antes de ativar outra competência. Histórico continua sendo a consulta de meses anteriores. O backup v9 inclui `monthlyPlans` completos e mantém os planos importados com apenas totais em `backupCarryover`, sem criar itens fictícios.

## Riscos a controlar

- Um item do plano pode ter realizado mesmo se for arquivado ou se o modelo for trocado. A identidade do item e o fato devem permanecer pesquisáveis.
- A mesma mudança de competência não pode substituir um plano já editado pelo modelo atual.
- Simulação não pode disparar `useActuals` com outra lista operacional nem reescrever renda, cartão ou patrimônio.
- Atualizar modelos futuros não deve entrar em conflito com um ciclo aberto que já recebeu alterações próprias.
