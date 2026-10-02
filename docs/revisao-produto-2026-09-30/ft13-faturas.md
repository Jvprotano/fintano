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

Fazer as mudanças por transação de dados e fluxo de interface, conferindo a jornada integrada de pagamento A/B e a conversão de backup. Build quando necessário para integrar o código; evitar suítes e testes unitários sem risco concreto.

## Entrega V2 — 02/10/2026 · `924fe76`

- Lançamentos e abatimentos abertos agora conservam `accountId` e `dueMonth`; cada cadastro mantém a competência da sua fatura aberta. Pagar uma conta congela valor, data e composição, gera as parcelas/assinaturas e carrega crédito excedente apenas nela. O pagamento e o avanço da conta são uma gravação única.
- A migração dos lançamentos antigos vincula nomes a IDs uma vez, cria contas para nomes sem cadastro e exige uma cópia automática anterior. Se a cópia falhar, Cartões informa o erro e bloqueia a operação. Snapshots agregados antigos permanecem agregados e são mostrados como sem cartão identificado.
- O backup v9 exporta/importa competência por conta, referência dos lançamentos, confirmação explícita de fatura vazia, pagamentos e composição paga. Cartões permite consultar a fatura paga por conta/mês; Ciclo e Planejar somam as faturas pertinentes à competência.
- Jornada sintética no navegador local isolado: duas contas com R$ 100 e R$ 200, pagamento de A, composição de A consultável, B ainda aberto em agosto e renomeação de A persistida após recarga. A prévia/fechamento passou a sinalizar fatura sem dados como desconhecida. Uma verificação pontual de ida e volta v9 preservou A, B, a composição paga e um snapshot legado agregado.
- `npm run build`, checagem de tipos posterior e `git diff --check` passaram. Um lint focado foi interrompido por demora sem resultado. A captura do arquivo de backup pelo navegador expirou; a ida e volta foi conferida pela conversão integrada com dados sintéticos. Não houve conferência visual renderizada em 390 px nem uso de dados pessoais na jornada.
