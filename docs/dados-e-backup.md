# Dados e backup da base V17

V17 identifica a base do produto. O backup atualmente exportado usa `schemaVersion: 9`; o armazenamento local usa a chave `fintano_data_v7`. Esses identificadores técnicos não mudam ao renomear a base do produto.

## Fontes de dados

| Informação | Fonte no documento local |
| --- | --- |
| Competência operacional | `activeCycle` |
| Plano próprio de cada ciclo | `monthlyPlans`, incluindo `fixedReference` quando fixado |
| Modelos e simulações | `scenarios`, `recurringTemplateId` e `activeScenarioId` |
| Folha, custos, Desejos e extras realizados | `actuals`, por competência |
| Cartões, compras e faturas pagas | `cardAccounts`, `cardEntries`, `cardPaidInvoices` e `cardSettings` |
| Registros antigos de adiantamentos e devoluções | `cardThirdParties`, preservado apenas para compatibilidade, sem efeito no ciclo ativo ou prévia |
| Investimentos e movimentos | `investmentHoldings`, `emergencyFund` e livros de metas |
| Bens, dívidas e metas | `assets`, `debts` e `goals` |
| Eventos e premissas | `forecastEvents` e `forecastAssumptions` |
| Fechamentos | `history` |
| Dados preservados pelo conversor | `backupCarryover`; não criar uma segunda fonte operacional de totais |

Componentes consomem os hooks e cálculos compartilhados. `useFinancas` integra os domínios; `currentCycleFacts.ts` reconcilia a leitura do ciclo. Uma mudança financeira deve atualizar seus registros relacionados numa gravação única, com detecção de revisão desatualizada. Formulários só limpam após sucesso.

## Contrato público atual

O arquivo exportado tem nome `fintano-backup-v9-AAAA-MM-DD.json`. Seu esquema está em `src/data/backupSchemaV7.ts`; validação e conversão estão em `src/data/backupV7.ts`; operação de exportação/importação e cópias estão em `src/lib/backup.ts`.

- Valores monetários `*Cents` são inteiros em centavos. O runtime converte para reais nos campos operacionais.
- `actuals.cycles[].costPayments[].adjustments` é opcional e conserva os ajustes feitos pelos botões de adicionar/diminuir, com `id`, `deltaCents` assinado e `recordedAt`. No runtime, `costAdjustments` guarda os mesmos registros por custo, com `delta` em reais. São contexto do total já registrado, sem nova saída de caixa ou soma aos cálculos. A interface mostra os três mais recentes, mas o backup conserva todos. Limpar um custo remove seus ajustes; arquivos antigos continuam aceitos no backup v9, sem inventar lançamentos. IDs duplicados, valores inválidos ou zero e instantes inválidos são recusados.
- Competências usam `AAAA-MM`; datas e instantes têm seus campos próprios.
- IDs e referências entre cartões, posições, metas, eventos e movimentos devem sobreviver à ida e volta.
- `kind`, origem, arquivamento, competência e datas de movimentos são conservados. `operationId` vincula as partes; `cashTreatment` distingue amortização extra de principal de parcela já paga, com `linkedCostId`. Texto da observação não determina o tipo.
- `planning.monthlyPlans` guarda o plano completo por competência. `fixedReference` guarda data e cópia independente do plano; não deve ser removido por edição ou importação.
- `planning.cycles` conserva resumos; não substitui os planos operacionais completos.
- Avaliações importadas são preservadas, e `currentValueCents` representa o valor corrente das posições. Mudar avaliação não é aportar.
- `valuationDate` é opcional nas posições, bens e dívidas e conserva a data explícita do último saldo conferido. Ausência permanece desconhecida; `valuations[].asOf` de uma fotografia gerada pelo exportador não vira data de avaliação por inferência. O saldo corrente incorpora movimentos posteriores sem reescrever essa referência. Salvar saldo/data é uma gravação única, sem alterar os livros; a avaliação deve incluir os movimentos existentes. Datas inválidas são recusadas na importação.
- Planos operacionais, modelos e referências fixadas podem guardar `contributionDestinations`, com `type: holding | goal`, `id` e `amountCents` no backup; o runtime usa `amount` em reais. A divisão guarda intenção, sem novos ativos ou movimentos. Centavos positivos, destinos distintos e referências existentes são validados; arquivamento conserva referências e exige revisão operacional. Cadastros referenciados não podem ser excluídos definitivamente. Arquivos anteriores sem destinos continuam aceitos, sem destinação presumida. Os campos opcionais mantêm o backup público v9.
- `cards.thirdParties` conserva somente registros antigos de adiantamentos/devoluções, com IDs, valores, datas e competências preservados na ida e volta. Não cria novos registros ao editar/importar compras, pagar fatura ou fechar ciclo; não bloqueia edição pela quantia recebida anteriormente e não altera cálculos do ciclo ativo ou prévia. A parte não pessoal da compra é considerada coberta pelo repasse antes do vencimento: `amount` mantém o total ao banco e `personalAmount` determina a despesa pessoal, sem lançar renda ou saída extra. A validação dos registros antigos continua aceitando os mesmos arquivos.
- Previsões conservam o cancelamento reversível, revisões por mês original (`futureChanges`), definições por ocorrência (`terms`) e vínculos com fatos (`links`). As definições monetárias usam `amountCents` no backup. O ID da ocorrência mantém o mês original após adiamento; vínculos preservam tipo, ID, ciclo e origem patrimonial quando aplicável. Cancelamento ou revisão não remove o realizado.
- Metas de acumulação podem conservar `groupName`, um agrupamento sem saldo próprio. `forecast.events[].occurrenceOverrides[mesOriginal].goalAllocations` guarda a divisão daquela entrada entre metas, por `goalId` e `amountCents`. O runtime usa `amount` em reais. A divisão não cria movimentos ou patrimônio; referências distintas, valores positivos em centavos e soma dentro da parcela guardada são validados. Exclusão de meta com uma divisão referenciada é recusada. Esses campos opcionais mantêm o backup público v9 e a leitura dos arquivos anteriores, sem inferir grupos ou destinações antigas.
- Faturas pagas preservam cartão, competência, total, parte pessoal, créditos e composição disponíveis. Informação ausente não é inventada. A consulta por ciclo combina compras abertas e composições pagas por `accountId` e `dueMonth`, sem duplicar registros no armazenamento. Pagamento individual mantém a referência interna da próxima fatura, enquanto a consulta só avança com `activeCycle`. O fechamento pode confirmar todas as pendentes conhecidas numa operação única, pulando pagamentos preservados.
- Referências de calendário opcionais usam `closingDay: 0` e `dueDay: 0` quando não informadas; datas existentes são conservadas. O backup v9 mantém esses valores, sem inventar dias de fechamento/vencimento. O dia indicativo geral do ciclo continua independente.
- `cards.accounts[].dueMonthOffset` é opcional: `0` indica vencimento no mês do ciclo e `1` no seguinte. Ausência mantém `1`, sem migração automática dos meses existentes. `spendingMonth` das compras e composições pagas conserva a competência financeira, independente de `dueMonth`; parcelas geradas avançam ambos os meses uma vez. Novos pagamentos usam IDs independentes do vencimento; IDs antigos continuam preservados.
- `calendarCorrections` no cartão conserva ID, instante, motivo, antes/depois do mês aberto e calendário, além da escolha de incluir faturas pagas. Esses campos opcionais usam o backup público v9; calendários ou revisões malformados são recusados. A correção move a sequência inteira de meses de um cartão, preserva datas reais, valores e vínculos e recusa colisões. Chaves de operações de pagamento e confirmação vazia acompanham a correção para não bloquear o próximo pagamento pelo mês antigo.
- Fechamentos afetados recebem diferenças explícitas do cartão corrigido e a mesma revisão com motivo; referências de plano e marcas patrimoniais permanecem preservadas. Faturas legadas agregadas sem cartão identificado não são deslocadas nem repartidas por inferência.
- Quando uma correção desloca um valor para o mês de um agregado legado, `cards.statements[].calendarAdjustments` guarda a diferença de caixa identificada pelo cartão, com ID da revisão, instante, motivo, `totalDeltaCents` e `personalDeltaCents` assinados. `referenceTotalCents` e `referencePersonalTotalCents` conservam a composição conhecida naquele ajuste: novas compras ou correções posteriores mudam apenas a diferença, sem contar o mesmo valor novamente. Os valores, composição e data do pagamento original não são sobrescritos. O Ciclo aplica essas diferenças uma vez; uma parte deslocada ainda aberta só fica paga ao confirmar sua fatura individual. A revisão mostra também o efeito sobre esse caixa, e a consulta de faturas antigas conserva o original e suas diferenças explícitas.
- Fechamentos preservam `planEstimated` e `investmentPlanCaptured`, sem transformar estimativas ou ausência de plano em referência confirmada. `corrections` conserva ID da revisão, instante, motivo, ciclos revisados e antes/depois com origem; a mesma revisão identifica os fechamentos envolvidos. A validação rejeita registros de correção malformados. A contrapartida desconhecida continua `null` no backup, inclusive após normalização.
- `thirdPartyAdvancedCents` e `reimbursementsReceivedCents` são campos legados preservados nos fechamentos antigos; novos fechamentos não registram adiantamentos ou devoluções. O fluxo pessoal usa a parte pessoal da fatura e o repasse não aumenta renda ou patrimônio. As marcas patrimoniais da data são preservadas; os aportes diretos continuam relacionados aos livros de movimentos.

Os formatos aceitos pelo leitor atual continuam aceitos. Não criar trabalho para manter versões de produto anteriores. A reorganização documental não altera os conversores existentes nem os dados pessoais.

## Recuperação e gravação

Um documento inválido bloqueia gravações que poderiam destruir a origem. A recuperação permite guardar os bytes brutos e restaurar uma cópia validada. Instalação vazia é um estado diferente de documento corrompido.

Antes de importar, validar estrutura, centavos, IDs e referências; apresentar contagens, avisos e comparação de totais. Criar cópia automática validada antes da substituição. Se a gravação falhar, conservar/restaurar o documento anterior. Não normalizar ou sobrescrever o arquivo original fornecido pelo usuário.

O menu distingue backup público de cópias brutas de recuperação e registra exportação solicitada, sem afirmar que o navegador salvou o arquivo no disco. Preferências de interface e cópias automáticas ficam separadas dos fatos financeiros.

Ao mudar o contrato, conferir a ida e volta somente nos campos e totais afetados, com cópia isolada. Não remover informação financeira para simplificar uma tela. Campos sem função visual atual só podem ser retirados quando sua finalidade e efeito sobre os dados estiverem resolvidos.

Correção histórica usa uma única gravação com a revisão vista ao abrir o rascunho. Fatos detalhados são alterados em `actuals` junto com o fechamento; alterações de competência alcançam as partes vinculadas dos livros e os ciclos revisados. Marcas patrimoniais e referências de plano são preservadas. Ajustes de agregados sem origem conservam o total, mesmo sem detalhamento de Desejos; não criam fatos artificiais. Os campos opcionais de auditoria não alteram o identificador público v9.

## Previdência pela folha

`actuals.paycheck.pensionAllocations` captura os destinos e pesos pessoais/empresariais usados ao confirmar a folha. Os movimentos patrimoniais guardam `payrollMonth` e `contributor`, com IDs preservados nas correções; não são aporte direto nem saída de caixa. `payrollPensionLegacy` impede relançamento de uma folha anterior à automação após limpar/reconfirmar. Folha e posições são conciliadas numa única operação.

`investmentHoldings.pension` guarda o saldo empresarial atual e sua parcela em carência. Ausência é desconhecida, não zero. Os saldos informados obedecem carência ≤ empresa ≤ total. Liberação é atualização explícita pelo extrato. Resgate/transferência preserva a fatia empresarial retirada em `pensionEmployerAmount`, permitindo reversão sem perder a divisão. Metas não recebem saldo condicionado ou com divisão desconhecida.

O backup v9 conserva esses campos opcionais, com valores e pesos em centavos, mantendo compatibilidade com arquivos anteriores. A validação rejeita divisão inválida, destinos inexistentes ou aportes da folha com origem/competência inconsistente. Não há migração retroativa de saldos ou movimentos manuais.
