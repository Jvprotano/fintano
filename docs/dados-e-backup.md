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
| Investimentos e movimentos | `investmentHoldings`, `emergencyFund` e livros de metas |
| Bens, dívidas e metas | `assets`, `debts` e `goals` |
| Eventos e premissas | `forecastEvents` e `forecastAssumptions` |
| Fechamentos | `history` |
| Dados preservados pelo conversor | `backupCarryover`; não criar uma segunda fonte operacional de totais |

Componentes consomem os hooks e cálculos compartilhados. `useFinancas` integra os domínios; `currentCycleFacts.ts` reconcilia a leitura do ciclo. Uma mudança financeira deve atualizar seus registros relacionados numa gravação única, com detecção de revisão desatualizada. Formulários só limpam após sucesso.

## Contrato público atual

O arquivo exportado tem nome `fintano-backup-v9-AAAA-MM-DD.json`. Seu esquema está em `src/data/backupSchemaV7.ts`; validação e conversão estão em `src/data/backupV7.ts`; operação de exportação/importação e cópias estão em `src/lib/backup.ts`.

- Valores monetários `*Cents` são inteiros em centavos. O runtime converte para reais nos campos operacionais.
- Competências usam `AAAA-MM`; datas e instantes têm seus campos próprios.
- IDs e referências entre cartões, posições, metas, eventos e movimentos devem sobreviver à ida e volta.
- `kind`, origem, arquivamento, competência e datas de movimentos são conservados. Texto da observação não determina o tipo.
- `planning.monthlyPlans` guarda o plano completo por competência. `fixedReference` guarda data e cópia independente do plano; não deve ser removido por edição ou importação.
- `planning.cycles` conserva resumos; não substitui os planos operacionais completos.
- Avaliações importadas são preservadas, e `currentValueCents` representa o valor corrente das posições. Mudar avaliação não é aportar.
- Faturas pagas preservam cartão, competência, total, parte pessoal, créditos e composição disponíveis. Informação ausente não é inventada.
- Fechamentos preservam os fatos próprios da data; os aportes diretos continuam relacionados aos livros de movimentos.

Os formatos aceitos pelo leitor atual continuam aceitos. Não criar trabalho para manter versões de produto anteriores. A reorganização documental não altera os conversores existentes nem os dados pessoais.

## Recuperação e gravação

Um documento inválido bloqueia gravações que poderiam destruir a origem. A recuperação permite guardar os bytes brutos e restaurar uma cópia validada. Instalação vazia é um estado diferente de documento corrompido.

Antes de importar, validar estrutura, centavos, IDs e referências; apresentar contagens, avisos e comparação de totais. Criar cópia automática validada antes da substituição. Se a gravação falhar, conservar/restaurar o documento anterior. Não normalizar ou sobrescrever o arquivo original fornecido pelo usuário.

O menu distingue backup público de cópias brutas de recuperação e registra exportação solicitada, sem afirmar que o navegador salvou o arquivo no disco. Preferências de interface e cópias automáticas ficam separadas dos fatos financeiros.

Ao mudar o contrato, conferir a ida e volta somente nos campos e totais afetados, com cópia isolada. Não remover informação financeira para simplificar uma tela. Campos sem função visual atual só podem ser retirados quando sua finalidade e efeito sobre os dados estiverem resolvidos.
