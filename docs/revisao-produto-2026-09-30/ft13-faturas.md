# FT-13 — Identidade de cartão, fatura e pagamento

## Estado observado

Lançamentos persistem nome e bucket global (`current`/`next`). `payInvoiceInDocument` grava um snapshot agregado e gira todos os cartões. `useFinancas` calcula fatura do ciclo sobre esse agregado. O backup já tem `accountId` no contrato externo de cobranças, mas o runtime o reconstrói por nome. Renomear um cadastro não conserva a identidade operacional dos lançamentos.

## Contrato e ordem

1. Cada lançamento recebe `accountId` estável e competência de vencimento (`dueMonth`); nome vira rótulo de apresentação. Cada conta conhece sua fatura aberta. Migrar nomes existentes para contas uma vez, conservando cópia bruta e backup anterior. Faturas pagas agregadas legadas continuam agregadas, com origem explicitamente desconhecida.
2. O pagamento referencia conta e competência, salva data e composição imutável, e avança apenas aquela conta. Parcelas, recorrências e créditos só passam para a fatura seguinte da mesma conta. Não limitar snapshots pagos a 24.
3. O resumo de Ciclo soma somente faturas pertinentes à competência financeira e mantém pagamentos antecipados fora da nova fatura. Planejar, Cartões e Histórico usam a mesma atribuição. Quando uma fatura antiga é desconhecida, não inferir zero.
4. A UI escolhe a conta antes de pagar e permite abrir faturas pagas por conta/mês. Renomear a conta mantém lançamentos anteriores pelo ID.
5. Backup v9 importa/exporta IDs, competências, pagamentos e composição; v7/v8 e snapshots legados preservam o que sabem, sem criar detalhes inexistentes.

## Limites de execução

Fazer as mudanças por transação de dados e fluxo de interface, validando build/lint e uma jornada integrada determinística de pagamento A/B. Evitar ampliar testes unitários de apresentação.
