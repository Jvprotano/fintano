# Modelo de dados e backup v7

## Objetivo

O documento local v7 é a fronteira de persistência da interface atual. O arquivo público exportado usa v9; consulte [backup v9](backup-v9.md). A aplicação pode armazenar o documento em `localStorage` hoje e desmembrá-lo em coleções ou tabelas depois sem mudar o significado financeiro dos campos.

O repositório interno guarda as coleções usadas pelo runtime em uma única chave. O backup é deliberadamente diferente: ele expõe um contrato de domínio, não detalhes de implementação do navegador.

## Agregados

| Seção | Fonte de verdade |
| --- | --- |
| `profile` | competência e modelo ativos |
| `planning.templates` | modelos editáveis de renda, folha, custos, desejos e alocação |
| `planning.cycles` | plano capturado no backup; no runtime atual os ciclos importados ficam em `backupCarryover` até FT-06 |
| `actuals.cycles` | pagamentos e movimentos de caixa efetivos por competência |
| `cards` | contas, cobranças relacionadas por `accountId` e faturas pagas |
| `investments.holdings` | cadastro das posições |
| `investments.valuations` | histórico preservado no backup e em `backupCarryover`; a tela usa o valor atual explícito da posição |
| `investments.ledgerEntries` | saldos iniciais, aportes, retiradas e amortizações |
| `balanceSheet` | bens e dívidas atuais |
| `goals` | metas e suas inclusões explícitas |
| `forecast` | eventos futuros e premissas de projeção |
| `history.closures` | fatos congelados no fechamento, sem copiar o ledger atual |

## Regras invariantes

1. Todo campo `*Cents` é um inteiro em centavos de real.
2. Competências usam `AAAA-MM`; instantes usam ISO 8601.
3. Uma cobrança referencia um cartão existente por `accountId`.
4. Uma avaliação referencia uma posição existente por `holdingId`.
5. Uma movimentação referencia uma posição, meta ou dívida existente por `ownerType` e `ownerId`.
6. `opening_balance` compõe patrimônio, mas não aporte da competência.
7. Contribuição pessoal de previdência compõe investimento realizado e não sai novamente do caixa.
8. Contrapartida da empresa compõe o valor creditado, nunca caixa ou renda disponível.
9. Valor desconhecido é `null`; zero significa zero conhecido.
10. O fechamento preserva fatos daquela data. Aportes diretos históricos são projetados do ledger pela competência.

## Importação

A importação segue uma transação local:

1. ler o JSON como dado desconhecido;
2. converter v6, v7 ou v8 para v9 em memória, quando necessário;
3. validar forma, centavos, IDs e referências;
4. apresentar contagens e avisos;
5. testar a capacidade de gravação;
6. criar uma cópia automática do estado atual;
7. gravar o documento único e remover as antigas chaves de domínio;
8. restaurar o documento anterior se qualquer gravação falhar.

Avisos não inventam informação. Uma previdência sem posição patrimonial vinculada e uma contrapartida histórica não informada continuam explícitas no relatório, em vez de serem convertidas silenciosamente em saldo zero.

## Migração reproduzível de um arquivo

O teste `src/data/backupMigration.test.ts` funciona também como ferramenta controlada de conversão para v9. Ele só grava quando os três caminhos são fornecidos:

```powershell
$env:FINTANO_BACKUP_PATH='C:\caminho\backup-v6.json'
$env:FINTANO_BACKUP_OUTPUT='C:\caminho\backup-v9.json'
$env:FINTANO_MIGRATION_REPORT='C:\caminho\relatorio-v9.json'
npx vitest run src/data/backupMigration.test.ts
```

O arquivo original não é alterado. O relatório registra versão de origem, contagens e todos os avisos ou erros encontrados.
