# Tarefas de execução

Estado inicial: todas pendentes. Este arquivo é o ponto de retomada da implementação. Ver [diagnóstico](diagnostico.md) para evidências D01–D20 e [plano](plano-execucao.md) para contratos financeiros.

Prioridades: **P0** preserva fatos; **P1** corrige decisão/operação; **P2** consolida a experiência. Porte: **P** alteração localizada, **M** um fluxo com integrações, **G** mudança de contrato em vários domínios. Porte não é estimativa de dias.

Para concluir uma tarefa: marcar a caixa, registrar os arquivos/commit e resumir a jornada observada. Não marcar como concluída apenas porque o build passou. Não há requisito de campanha de testes unitários ou de responsividade; priorizar funcionamento integrado no desktop, conforme a orientação desta revisão.

## Etapa 1 — preservar dados

### FT-01 — Recuperar documento inválido sem sobrescrever a origem

- [x] **P0 · M · dependências: nenhuma · achado D01.**
- **Escopo:** distinguir instalação vazia, legado migrável, documento válido, versão desconhecida e documento corrompido. Bloquear apenas gravações que destruiriam o original; oferecer exportação bruta e restauração de uma cópia conhecida. Exibir falha de inicialização em vez de abrir um cenário vazio com aparência de sucesso.
- **Referências:** `src/data/repository.ts`, `src/main.tsx`, `src/hooks/usePersistenceStatus.ts`, `src/App.tsx`.
- **Aceite:** abrir JSON truncado ou versão não suportada conserva exatamente os bytes existentes; o usuário consegue guardá-los e recuperar uma cópia. Instalação realmente vazia continua funcionando.
- **Evidência a registrar:** conteúdo antes/depois e percurso de recuperação com armazenamento de demonstração.

### FT-02 — Gravar operações financeiras em uma transação

- [x] **P0 · G · depende de FT-01 · achados D02, D03.**
- **Escopo:** comando único sobre o documento para pagamento, fechamento, avanço de ciclo e alterações relacionadas. Propagar resultado de gravação aos consumidores. Detectar revisão desatualizada e repetição da mesma operação. Formulários só limpam após sucesso.
- **Referências:** `src/data/repository.ts`, `src/hooks/useCreditCards.ts`, `src/hooks/useFinancas.ts`, `src/hooks/useHistory.ts`, `src/components/ClosingView.tsx`.
- **Aceite:** falhar pagamento deixa lançamentos, snapshot e calendário no estado anterior; falhar fechamento preserva ciclo e realizados. Executar a mesma confirmação duas vezes não duplica fatos. Edição em outra aba não é sobrescrita silenciosamente.
- **Limite:** implementar uma transação local; não criar backend, fila distribuída ou infraestrutura de eventos.

### FT-03 — Arquivar cadastros preservando fatos e referências

- [ ] **P0 · G · depende de FT-02 · achados D04, D08.**
- **Escopo:** arquivamento para posições, metas com movimentos e itens de plano usados. Preservar livro-razão e nome/contexto necessário ao passado. Validar referências de folha, metas, dívida, bem e evento ao remover entidades. Oferecer exclusão física somente quando não houver fatos/dependências ou como correção explícita.
- **Referências:** `src/hooks/useInvestments.ts`, `src/hooks/useScenarios.ts`, `src/hooks/useDebts.ts`, `src/hooks/useAssets.ts`, `src/lib/history.ts`.
- **Aceite:** arquivar posição com aporte antigo não muda o aporte histórico; retirar um custo do plano futuro não oculta o que foi pago; renomear/arquivar não torna o backup irrestaurável. Arquivados continuam consultáveis quando explicam um fato.

### FT-04 — Dar tipo, origem e competência aos movimentos

- [ ] **P0 · G · depende de FT-02 · achados D05, D15.**
- **Escopo:** tipar abertura, aporte, resgate, transferência, amortização e ajuste. Conservar `kind` no runtime e no backup; retirar inferência por observação do caminho normal. Registrar competência ativa por padrão, data real informada e instante de registro separadamente quando necessário.
- **Referências:** `src/types/core.ts`, `src/lib/shared.ts`, `src/lib/investmentActuals.ts`, `src/hooks/useInvestments.ts`, `src/components/Ledger.tsx`, `src/data/backupV7.ts`.
- **Aceite:** observação livre nunca muda o efeito financeiro; abrir posição existente não conta como aporte; aportar ao criar posição conta no ciclo escolhido; mover competência preserva a data real.
- **Migração:** usar heurística apenas uma vez para registros legados e identificar os casos ambíguos, sem reclassificá-los silenciosamente.

### FT-05 — Consolidar o contrato de backup e a trilha de migração

- [ ] **P0 · G · depende de FT-01, FT-03, FT-04 · achados D05, D09, D15.**
- **Escopo:** documentar o que cada conversão preserva, criar versão compatível com tipos/arquivamento e manter leitura de versões anteriores. Preservar avaliações e planos que o contrato aceite, ou declarar e resolver a limitação antes de aceitar importação. Mostrar avisos detalhados, reconciliação e última exportação externa. Atualizar o texto de importação que ainda menciona conversão para v7.
- **Referências:** `src/data/backupSchemaV7.ts`, `src/data/backupV7.ts`, `src/lib/backup.ts`, `src/App.tsx`, `docs/modelo-de-dados-v7.md`, `docs/backup-v8.md`.
- **Aceite:** exportar/importar conserva identidade, tipos, datas, centavos e referências; comparar totais antes/depois não apresenta diferença sem explicação. Falha mantém o documento anterior. Avisos são legíveis antes da substituição.
- **Execução incremental:** entregar primeiro o contrato desta etapa. FT-06, FT-13, FT-17 e FT-19 devem estendê-lo nas próprias entregas quando necessário; não esperar todas para fechar esta tarefa.

## Etapa 2 — confiar no ciclo

### FT-06 — Separar plano mensal, modelo recorrente e simulação

- [ ] **P1 · G · depende de FT-03, FT-05 · achados D08, D09.**
- **Escopo:** plano por competência com identidade dos itens, modelo reutilizável e cenário de comparação. Aplicação explícita de cenário ao ciclo; editar modelo oferece alcance sobre ciclos futuros. Consulta a outro mês não deve trocar silenciosamente a competência operacional.
- **Referências:** `src/hooks/useScenarios.ts`, `src/hooks/useActiveCycle.ts`, `src/components/ScenarioSwitcher.tsx`, `src/components/CycleSwitcher.tsx`, `src/data/repository.ts`, conversores de backup.
- **Aceite:** alternar simulações não altera renda recebida, custos pagos, metas realizadas ou histórico. Alterar novembro não muda outubro. Um custo arquivado ainda explica seu realizado anterior. Fechamento usa o plano daquele ciclo.

### FT-07 — Reconciliar realizado sem transformar vazio em pagamento

- [ ] **P1 · G · depende de FT-04, FT-06 · achados D06, D08, D13.**
- **Escopo:** registrar salário/folha do ciclo e distinguir valor não informado, zero, previsto e confirmado. Manter fatos independentes da lista do cenário. Oferecer “Confirmar como no plano” em lote e por item. Custo no cartão consulta sua origem sem exigir um segundo realizado manual.
- **Referências:** `src/types/actuals.ts`, `src/lib/actuals.ts`, `src/hooks/useActuals.ts`, `src/hooks/useFinancas.ts`, `src/components/ActualsPanel.tsx`, `src/components/IncomePanel.tsx`.
- **Aceite:** campo vazio não aparece como “pago”; zero informado permanece visível como zero. Alterar salário planejado não reescreve salário confirmado. Um gasto de cartão tem uma fonte de realizado e não é novamente editado como saída em conta.
- **Escolha de interação:** preservar a velocidade de confirmar valores recorrentes; não exigir diário detalhado para toda conta fixa.

### FT-08 — Calcular verba discricionária com compromissos pendentes

- [ ] **P1 · M · depende de FT-07 · achado D07.**
- **Escopo:** separar fluxo efetivo, compromissos pagos/pendentes, verba total para Desejos e restante após destinações. Proteger o aporte programado ainda não executado. Incluir origem e qualidade dos valores na consulta comum às telas.
- **Referências:** `src/lib/currentCycleFacts.ts`, `src/lib/financialCycle.ts`, `src/lib/cashflow.ts`, `src/hooks/useFinancas.ts`.
- **Aceite:** com renda 5.000, fatura 1.000, contas 2.000 e aporte programado 1.000, a verba é 1.000 antes e depois de aportar 400; executar 1.200 de aporte no total reduz a verba para 800. Desejos não são descontados antes de calcular sua própria verba. Resgate não é renda nova.

### FT-09 — Usar o plano seguinte e explicitar incerteza na prévia

- [ ] **P1 · M · depende de FT-06, FT-08 · achados D09, D18.**
- **Escopo:** calcular a prévia com renda, contas e aporte do próximo ciclo. Separar base sem extras incertos e cenário com eles. Mostrar dependência de datas quando entrada posterior não pode cobrir cobrança anterior. Não transportar automaticamente economia/estouro atual como custo do próximo mês.
- **Referências:** `src/hooks/useFinancas.ts`, `src/lib/financialCycle.ts`, `src/components/ClosingView.tsx`.
- **Aceite:** conta excepcionalmente menor hoje não reduz a previsão recorrente de amanhã sem aplicação explícita. Bônus incerto não aumenta o destaque da prévia base. Com datas incompletas, o app identifica a limitação em vez de assegurar cobertura.

### FT-10 — Refazer a hierarquia de Ciclo e Planejar

- [ ] **P1 · G · depende de FT-08, FT-09 · decisão de produto.**
- **Escopo:** Ciclo com decisão principal, pendências e ações; prévia e composição sob demanda. Planejar com distribuição em reais e saldo após o plano, aporte diretamente configurável e modelos percentuais secundários. Envelope de cartão com tipo explícito, preservando inclusão dos filhos. Renda recorrente zero não bloqueia registro de extras e movimentos.
- **Referências:** `src/App.tsx`, `src/components/ClosingView.tsx`, `src/components/IncomePanel.tsx`, `src/components/CostManager.tsx`, `src/components/WantsManager.tsx`, `src/components/InvestmentPlan.tsx`, `src/lib/scenario.ts`, `src/components/ui.tsx`.
- **Aceite:** identificar verba, origem das pendências e próxima ação sem percorrer vários resumos. Renomear envelope não muda o total. O plano fecha em reais sem obrigar o usuário a ajustar percentuais. Estados vazios levam à configuração necessária.

### FT-11 — Fechar o ciclo com revisão explícita

- [ ] **P1 · M · depende de FT-02, FT-07, FT-08 · achado D03.**
- **Escopo:** revisão com confirmados, estimativas aceitas e desconhecidos. Remover preenchimento silencioso. Fatura desconhecida deve ser resolvida, declarada zero ou mantida como incompletude explícita permitida pelo modelo; nunca gravada implicitamente como zero. Separar revisão histórica de refechar com dados atuais.
- **Referências:** `src/components/ClosingView.tsx`, `src/hooks/useFinancas.ts`, `src/hooks/useHistory.ts`.
- **Aceite:** confirmar fecha e avança uma única vez; toda estimativa conservada possui marca de origem. Cancelar não altera realizados. Revisão de um mês antigo não substitui seus valores pelo patrimônio/salário atuais.

## Etapa 3 — cartões

### FT-12 — Disponibilizar cadastro e calendário dos cartões

- [ ] **P1 · M · depende de FT-02 · achado D10.**
- **Escopo:** configuração acessível de cartão, fechamento, vencimento e fatura ativa. Retirar julho fixo da inicialização. Transformar divergência de calendário em uma ação de conferência/configuração. Diferenciar teto pessoal de limite do banco.
- **Referências:** `src/components/CreditCardManager.tsx`, `src/hooks/useCreditCards.ts`, `src/lib/creditCards.ts`, `src/components/cards/CardEntryForm.tsx`.
- **Aceite:** instalação vazia em outubro não cria fatura de julho; cadastrar cartão habilita o lançamento vinculado a evento. Corrigir calendário mostra o efeito antes de reatribuir lançamentos existentes.

### FT-13 — Identificar faturas e pagamentos por cartão

- [ ] **P1 · G · depende de FT-04, FT-05, FT-12 · achados D11, D13.**
- **Escopo:** substituir nomes/buckets como identidade por cartão, fatura, competência e vencimento. Pagamento independente com data e referência; preservar lançamentos e retirar descarte automático de snapshots após 24. Manter recorrência, parcelas e créditos. Planejar/Ciclo/Histórico consultam a mesma competência.
- **Referências:** `src/types/cards.ts`, `src/lib/creditCards.ts`, `src/lib/cardCycleAccounting.ts`, `src/hooks/useCreditCards.ts`, `src/components/cards/InvoicePaymentReview.tsx`, `src/components/WantsManager.tsx`, backup.
- **Aceite:** pagar cartão A não paga nem gira B; renomear A conserva compras antigas; voltar a uma fatura paga permite conferir sua composição. Crédito excedente atravessa faturas sem repetir saída de caixa. Área de Desejos compara o ciclo correto.
- **Migração:** preservar a informação disponível nos snapshots agregados antigos, sem inventar quais lançamentos compunham cada um.

### FT-14 — Importar com prévia, diferenças e controle de duplicação

- [ ] **P1 · M · depende de FT-13 · achado D12.**
- **Escopo:** apresentar linhas válidas, descartadas com motivo, possíveis duplicatas e totais de entrada/substituição. Excluir totalizadores por estrutura, não por substring genérica do estabelecimento. Permitir conciliar complemento com o que já existe.
- **Referências:** `src/lib/cardImport.ts`, `src/components/cards/CardImportPanel.tsx`, `src/hooks/useCreditCards.ts`.
- **Aceite:** “Total Fitness” é compra válida; importar duas vezes não duplica silenciosamente; substituir mostra o que sai, inclusive créditos e vínculos. Linhas incertas podem ser corrigidas ou ignoradas conscientemente antes de gravar.
- **Limite:** manter entrada por colagem. Não adicionar OCR, integração bancária ou parser universal.

### FT-15 — Distinguir rateio de reembolso recebido

- [ ] **P1 · M · depende de FT-08, FT-13 · decisão de integração.**
- **Escopo:** junto aos lançamentos divididos, indicar quem custeou o desembolso e o que ainda falta receber. Registrar reembolso com referência ao adiantamento, suportando parcial. Exibir separadamente parte pessoal, total a pagar e valores a receber.
- **Referências:** `src/types/cards.ts`, `src/lib/cardCycleAccounting.ts`, `src/components/cards/CardSummaryPanels.tsx`, `src/lib/currentCycleFacts.ts`.
- **Aceite:** compra de 300, sendo 100 pessoal e 200 adiantados, não transforma os 200 em receita quando voltam. Antes do reembolso, o desembolso necessário permanece visível. Rateio já acertado não cria pendência nova.

## Etapa 4 — patrimônio

### FT-16 — Registrar aporte, transferência e amortização uma vez

- [ ] **P1 · G · depende de FT-04, FT-08 · achados D14, D15.**
- **Escopo:** formulário comum com origem/destino conforme o tipo. Transferência entre posições cria pernas vinculadas; resgate explicita entrada em conta; amortização extra cria redução da dívida e saída vinculada. Parcela recorrente reaproveita o custo existente; ajuste de saldo por extrato não fabrica pagamento.
- **Referências:** `src/components/Ledger.tsx`, `src/hooks/useInvestments.ts`, `src/hooks/useDebts.ts`, `src/lib/investmentActuals.ts`, `src/lib/currentCycleFacts.ts`.
- **Aceite:** transferir 1.000 entre posições mantém patrimônio e aporte líquido; amortizar 1.000 reduz dívida e recursos de caixa uma vez; desfazer reverte as pernas relacionadas. Atualizar saldo devedor pelo extrato é distinguível de amortizar com dinheiro novo.

### FT-17 — Mostrar posição patrimonial com data e contexto

- [ ] **P1 · M · depende de FT-04, FT-05 · achado D15.**
- **Escopo:** avaliação datada separada do movimento e indicação discreta da atualização. Reorganizar resumo para posições, reserva, metas e dívidas, evitando repetição da equação e gráficos sem diversidade. Retirar alertas cadastrais do mesmo nível dos financeiros. Renomear simuladores para refletir a comparação parcial disponível.
- **Referências:** `src/components/InvestmentsManager.tsx`, `src/components/ReserveSection.tsx`, `src/components/AssetsManager.tsx`, `src/components/DebtsManager.tsx`, `src/lib/investments.ts`, backup.
- **Aceite:** alterar avaliação muda posição/rendimento, não aporte; consulta identifica data do saldo. Posição sem destinação não é descrita como liquidez disponível. Comparador de taxas não promete economia contratual exata nem decisão completa de moradia.

### FT-18 — Unificar destinos do aporte, metas e reserva

- [ ] **P1 · G · depende de FT-06, FT-16, FT-17 · achado D19 e decisão de produto.**
- **Escopo:** usar referências estáveis de classes/posições no plano de aporte. Permitir destinar parte do aporte à reserva e às metas; comparar a soma com a capacidade mensal. Explicar base da reserva e gastos considerados. Distinguir meta que apenas acompanha patrimônio de meta que reserva recursos.
- **Referências:** `src/components/InvestmentPlan.tsx`, `src/components/GoalsSection.tsx`, `src/components/ReserveSection.tsx`, `src/lib/goals.ts`, `src/lib/scenario.ts`, `src/hooks/useInvestments.ts`.
- **Aceite:** duas metas que precisam de 800 cada não parecem financiadas por um aporte total de 1.000; destinar dinheiro existente não soma patrimônio; reduzir a avaliação de uma posição recalcula a cobertura sem esconder disputa entre metas. A reserva informa sua base de despesas e período.
- **Limite:** não criar um segundo livro de “grupos de cobertura” em Futuro.

## Etapa 5 — futuro

### FT-19 — Preservar ocorrências e vincular sua efetivação

- [ ] **P1 · G · depende de FT-03, FT-07, FT-13 · achados D16, D18.**
- **Escopo:** edição desta/próximas ocorrências; conservar condições de liquidadas; arquivar séries com fatos; recuperar canceladas. Vínculo a item de plano, meta ou cobrança deve justificar a exclusão do impacto duplicado. Permitir relacionar pagamento já existente, sem obrigar novo lançamento.
- **Referências:** `src/types/forecast.ts`, `src/lib/forecast.ts`, `src/lib/forecastCoverage.ts`, `src/hooks/useForecast.ts`, `src/components/ForecastCommitments.tsx`, backup.
- **Aceite:** aumentar bônus anual futuro não reabre bônus recebido; adiar preserva pagamentos parciais; cancelar não apaga o que foi pago; vínculo de conta/cartão impede segunda saída. Alterar forma de pagamento com fatos existentes exige reconciliação explícita.

### FT-20 — Abrir Futuro pela próxima pendência real

- [ ] **P1 · M · depende de FT-19 · achado D17.**
- **Escopo:** ordenar eventos pela próxima ocorrência pendente reconciliada; resumo mostra data e restante corretos. Vencidos e parciais aparecem; concluídos/cancelados ficam consultáveis no detalhe. Projeção recolhida após a agenda. Ligar às metas existentes sem recriar grupos.
- **Referências:** `src/components/ForecastView.tsx`, `src/components/ForecastCommitments.tsx`, `src/hooks/useForecast.ts`.
- **Aceite:** editar ocorrência altera o resumo; efetivar integralmente avança o resumo para a próxima pendência; evento vencido não aparece apenas como “já passou”. Há uma única lista principal de eventos. Registrar em Ciclo e Futuro representa o mesmo fato.

### FT-21 — Tornar a projeção coerente com suas premissas

- [ ] **P1 · G · depende de FT-09, FT-18, FT-19 · achados D18, D19.**
- **Escopo:** base sem entradas incertas e hipótese opcional; considerar compromissos financiados sem duplicar e identificar exclusões. Tratar pendências do ciclo inicial conforme a data-base. Projetar metas usando suas próprias fontes. Unificar nominal/real para todas as séries e alvos. Destacar primeira insuficiência, não somente maior déficit ou saldo final.
- **Referências:** `src/lib/forecast.ts`, `src/hooks/useFinancas.ts`, `src/components/ForecastView.tsx`.
- **Aceite:** bônus incerto fica fora da base; despesas ligadas ao plano/cartão entram uma vez no modelo completo; dívida e ativos obedecem à mesma base monetária na visão real. Meta de carteira não cresce porque uma dívida caiu. Aporte/retorno podem ser ajustados sem linguagem de garantia.
- **Limite:** projeção patrimonial e por ciclo; saldo bancário diário completo fica fora desta tarefa.

## Etapa 6 — histórico

### FT-22 — Concentrar Histórico em desvios e mudanças explicáveis

- [ ] **P1 · M · depende de FT-07, FT-17, FT-23 · decisão de produto.**
- **Escopo:** remover patrimônio atual; consolidar visualizações de aporte; priorizar diferenças contra plano e origem das mudanças. Indicar meses ausentes/estimados e preservar acesso aos detalhes. Decompor variação patrimonial apenas até onde os fatos permitem.
- **Referências:** `src/components/HistoryView.tsx`, `src/components/history/HistoryOverview.tsx`, `src/components/history/HistoryTrendExplorer.tsx`, `src/lib/history.ts`, `src/lib/historyTrends.ts`.
- **Aceite:** responder o que mudou e quais itens explicam o desvio sem procurar o mesmo total em vários blocos. Mudança de avaliação não aparece como novo aporte; residual não ganha rótulo de rentabilidade sem suporte. Tabela e gráfico usam o mesmo período e base.

### FT-23 — Corrigir o passado com origem, revisão e reconciliação

- [ ] **P1 · G · depende de FT-02, FT-03, FT-07, FT-11 · achado D20.**
- **Escopo:** rascunho de correção com antes/depois, motivo e efeito nas fontes. Corrigir na origem quando existir movimento; registrar ajuste explícito para legado agregado. Atualizar detalhes e totais juntos. Preservar marca patrimonial histórica e identificar reabertura/revisão.
- **Referências:** `src/hooks/useHistory.ts`, `src/lib/history.ts`, `src/components/HistoryView.tsx`, `src/hooks/useActuals.ts`, backup.
- **Aceite:** corrigir extra recebido não deixa agenda e histórico divergentes; cancelar edição não grava; alteração de custo total explica categorias; mover competência de aporte preserva data e marca a revisão dos ciclos afetados. Corrigir agregado legado não inventa detalhamento.

## Etapa 7 — consolidar

### FT-24 — Unificar edição, navegação e detalhes compartilhados

- [ ] **P2 · M · iniciar após FT-08 e acompanhar as telas.**
- **Escopo:** padrão de edição composta com salvar/cancelar e rascunho preservado em falha; zero versus vazio; rótulos operacionais; diálogos com foco contido; Escape/menu/atalhos contextualizados; gráficos com composição consultável sem hover. Links entre abas abrem o registro relacionado e preservam retorno.
- **Referências:** `src/components/ui.tsx`, `src/components/CurrencyInput.tsx`, `src/components/Ledger.tsx`, `src/components/ActualCashEntries.tsx`, `src/hooks/useKeyboardShortcuts.ts`, `src/App.tsx`.
- **Aceite:** o usuário sabe quando uma edição foi gravada e consegue cancelar alteração composta; zero informado é reconhecível. Teclado não aciona a tela atrás do diálogo. A ação “conferir” abre o contexto correspondente, sem busca manual.
- **Limite:** preservar tokens e linguagem visual; sem pacote novo ou reformulação estética independente do fluxo. Esta tarefa não é uma campanha de responsividade.

### FT-25 — Exportar uma fotografia financeira fiel para IA

- [ ] **P1 · P/M · depende de FT-08, FT-09, FT-13.**
- **Escopo:** consumir consultas reconciliadas; enviar origem, pendências e incertezas junto aos valores. Não converter desconhecido em zero nem chamar plano de realizado. Contextualizar antecipações, terceiros e envelope por referência. Atalho em opções secundárias, mantendo revisão antes de sair do app.
- **Referências:** `src/components/AIAnalysisDialog.tsx`, `src/lib/aiAnalysis.ts`, `src/App.tsx`.
- **Aceite:** o texto copiado tem os mesmos números e qualificações que a composição exibida no Ciclo; fatura desconhecida permanece desconhecida; bônus incerto é identificado. Gerar/revisar o texto não envia dados por conta própria.

### FT-26 — Alinhar documentação e remover caminhos sem função

- [ ] **P2 · M · finalizar após as entregas funcionais; atualizar documentos a cada etapa.**
- **Escopo:** revisar README, conceitos, contrato, skills e planos históricos. Remover somente código comprovadamente sem consumidor ou mantido sem finalidade; isolar compatibilidade de backup. Extrair componentes quando isso facilitar o fluxo alterado, sem refatoração genérica. Documentar recuperação e limites de projeção.
- **Referências:** `README.md`, `docs/`, `.agents/skills/frontend-design/SKILL.md`, módulos alterados; em especial cálculo de grupos de Futuro sem consumidor visual atual.
- **Aceite:** documentação descreve o funcionamento entregue; não afirma calendários independentes ou dados congelados onde o produto opera de outra forma. Campos legados preservados são identificados. Nenhuma limpeza remove informação de backup que ainda precisa sobreviver.

## Registro de execução

Registrar a jornada e seus limites a cada entrega funcional.

| Tarefa | Data / commit | Jornada conferida | Resultado / limite | Próxima ação |
| --- | --- | --- | --- | --- |
| FT-01 | 30/09/2026 · `daf4e29` | Instalação vazia, legado válido e inválido, JSON truncado e versão 99 com armazenamento sintético; no navegador local isolado, corrupção do documento → tela de recuperação → download bruto → restauração de cópia automática válida → Ciclo reaberto. | O arquivo bruto baixado conservou exatamente os 33 caracteres da entrada truncada; gravação recusada deixou a origem intacta. Build, lint e testes focados passaram. Cópias automáticas passam por validação antes de ser gravadas. Não houve teste sobre o perfil pessoal. | FT-02: comando transacional, revisão e consumidores de pagamento/fechamento. |
| FT-02 | 01/10/2026 · `afcb8d0`, `389e033` | Comando local com revisão bruta e identidade da operação; testes de pagamento e fechamento com fatura em dados sintéticos, inclusive recusa de escrita, repetição e revisão antiga. No navegador local isolado, fechar setembro avançou o ciclo e criou um snapshot. Uma fatura sintética de R$ 10 foi paga; após recarregar, a fatura ativa permanecia em outubro. A segunda aba criou um cenário e a primeira exibiu o bloqueio de edição com ação de recarga. | Pagamento, fechamento e mudanças compostas de cenário gravam as coleções relacionadas uma vez. Formulários afetados conservam o contexto em falha. Escrita após alteração em outra aba é bloqueada; edição do Histórico será redesenhada em FT-23. Build, lint e testes focados passaram. Nenhum dado pessoal foi usado. | FT-03: arquivamento e integridade das referências. |

## Regra para ampliar o backlog

Antes de acrescentar uma tarefa, escrever qual decisão ficará melhor, qual dado já existe para sustentá-la e qual trabalho manual ela elimina. Se a resposta for apenas “completa a tela”, não incluir.
