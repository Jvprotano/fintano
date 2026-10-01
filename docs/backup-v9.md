# Backup público v9

O arquivo exportado pelo FinTano usa `schemaVersion: 9`. O documento local continua em `fintano_data_v7`; as duas versões têm finalidades diferentes. Arquivos públicos v7 e v8, além do formato legado v6, continuam legíveis e são convertidos em memória antes da validação. O arquivo original importado não é modificado.

## O que a conversão conserva

| Domínio | No backup v9 | No documento local após importar |
| --- | --- | --- |
| Identidades e referências | IDs de modelos, itens, cartões, posições, metas, eventos e movimentos | Os mesmos IDs; referências são validadas antes da gravação |
| Valores | Inteiros em centavos | Reais decimais em seus campos operacionais; exportação reconverte para centavos |
| Movimentos | `kind`, `kindSource`, competência, `occurredAt`, `recordedAt`, observação | Tipo, origem e datas separados; nota não altera efeito financeiro |
| Arquivamento | `archivedAt` dos cadastros apoiados | Mesmo estado e fatos ligados |
| Avaliações de posição | Todos os registros em `investments.valuations`; `currentValueCents` no cadastro | Histórico preservado em `backupCarryover`; valor atual usado pelo Patrimônio |
| Planos por competência | Todos os registros em `planning.cycles` | Preservados em `backupCarryover`; edição operacional independente chegará no FT-06 |
| Realizados, cartões, fechamentos e eventos | IDs, valores e datas presentes no contrato | Convertidos para as coleções operacionais sem criar fatos ausentes |

Se o valor atual da posição mudar após importar, a próxima exportação mantém as avaliações anteriores e acrescenta uma avaliação do valor corrente. Todos os planos importados ficam intactos até uma edição do cenário ativo. Depois dessa edição, o plano aberto da competência ativa reflete o cenário atual; seu ID importado é mantido. A edição operacional independente dos planos chegará no FT-06.

O contrato cobre os campos descritos no esquema `src/data/backupSchemaV7.ts`, inclusive as extensões v8 e v9. Campos adicionais fora desse contrato não têm garantia de preservação; use a cópia bruta antes de converter um arquivo com extensões próprias. Ausência de data, zero conhecido e valor desconhecido não são equiparados.

## Conferência e recuperação

Antes de substituir o documento, o diálogo mostra contagens, avisos individualmente e comparação entre o estado atual e o arquivo para patrimônio financeiro, bens, dívidas e caixa extra realizado. Essa comparação é uma conferência de totais, não uma promessa de equivalência entre dois conjuntos de dados diferentes. Erros de forma, centavos, referências, duplicidade de planos mensais ou valor atual inválido bloqueiam a importação. Falha na gravação restaura o documento anterior.

Uma cópia automática validada é criada antes da substituição e antes da migração legada de movimentos. A migração FT-04 também guarda os bytes exatos do documento anterior; o menu permite baixá-los para análise. Esse arquivo bruto não é um backup público importável. O menu informa quando uma exportação externa foi **solicitada** no navegador, sem afirmar que o arquivo foi salvo no disco.

## Verificação reproduzível

`src/data/backupContractV9.test.ts` cobre uma importação v8 com duas avaliações, planos de meses diferentes, movimento tipado e alteração posterior do valor atual. `src/lib/backup.test.ts` cobre cópia prévia e rollback em falha de gravação. A conversão manual de um arquivo com relatório usa `src/data/backupMigration.test.ts` e as variáveis descritas em [modelo de dados](modelo-de-dados-v7.md).
