# FT-03 — Arquivamento e integridade das referências

## Evidência no código

- `removeHolding` e `removeGoal` filtram os cadastros. O Histórico recalcula aportes percorrendo esses livros-razão; a exclusão muda o passado.
- `removeCost` e `removeWant` filtram itens do cenário. `summarizeActuals` percorre apenas os itens recebidos, embora `MonthlyActuals` guarde valores por ID e mês. `setWantActual` ainda filtra IDs ausentes do cenário ativo, podendo apagar um fato ao editar outro.
- Previdência referencia posição (`linkedHoldingId`), dívida referencia custo e bem (`linkedCostId`, `linkedAssetId`), metas referenciam classe/posição e entradas extraordinárias referenciam evento/ocorrência. Exclusões físicas precisam consultar essas relações.
- O backup público atual é v8 e reutiliza os conversores de v7; antes desta etapa, ambos descartavam o estado de arquivamento. Um arquivamento concluído só pode ser considerado seguro depois que o contrato de backup preservá-lo.

## Contrato de implementação

1. Cadastro com movimentos ou referências mantém ID, nome e livro-razão. A ação comum é **Arquivar**, com data de arquivamento; a UI oferece consulta e restauração. Aporte antigo continua na competência antiga. A posição/conta com saldo atual continua no patrimônio, mesmo arquivada, e recebe indicação explícita. Exclusão física fica restrita a cadastro sem fatos nem dependências.
2. Custo e Desejo retirados do plano ficam no documento com identidade e contexto. O plano ativo não os soma; o realizado por competência continua consultável. Se um valor legado não tiver cadastro recuperável, preservá-lo com rótulo de origem desconhecida e valor original, sem inventar categoria ou pagamento.
3. Não apagar nem limpar uma referência silenciosamente. Folha, meta, dívida, bem e evento precisam de decisão explícita antes da remoção do alvo. Se uma relação foi importada inconsistente, a revisão de backup deve apontá-la.
4. Mudanças que afetam cadastro e referências juntas usam um comando sobre o documento. Falha de gravação não altera nenhuma das partes.
5. Exportação/importação devem conservar estado de arquivamento, IDs, movimentos e relações. O backup v7 permanece legível; a escrita v8 atual conserva o estado opcional. FT-05 consolidará o contrato e a validação detalhada.

## Ordem de entrega e verificação

1. Impedir perda de aportes: posição/meta, consulta dos arquivados, restauração, cálculo histórico independente do filtro visual.
2. Impedir perda de realizados: custo/Desejo arquivado e leitura de fatos órfãos por competência, sem reclassificar como pagamento de cartão.
3. Proteger referências de folha, meta, dívida, bem e evento, com mensagem que identifique o vínculo.
4. Incluir o estado no backup, restaurar um arquivo v7 anterior e conferir IDs, movimentos e totais antes/depois.
5. Testar as jornadas com documento sintético e conferir a UI local. Nenhum teste destrutivo na base pessoal.

## Resultado da etapa

- Posições, metas, bens, dívidas e itens do plano agora conservam identidade após arquivamento. As listas ativas ficam enxutas; as seções de arquivados permitem consulta e restauração. Saldos atuais continuam no patrimônio e movimentos antigos continuam no cálculo por competência.
- O realizado de custo e Desejo aparece mesmo quando o item não está no plano ativo. Sem cadastro recuperável, o valor permanece com origem desconhecida. Preenchimento em lote não cria valores zero para itens arquivados.
- Exclusão física de cadastro vazio usa comando sobre o documento atual. É recusada quando há saldo, livro-razão, realizado ou referência de folha, meta, dívida, bem ou evento. A remoção de evento também verifica caixa, cobrança de cartão, fatura paga e ocorrência realizada.
- O backup v8 conserva `archivedAt` de posição, meta, bem, dívida, custo e Desejo. A inspeção informa datas inválidas e referências ausentes. O leitor de v7 continua aceitando um arquivo anterior sem o campo opcional.
- Jornada local sintética: bem de R$ 200 criado, arquivado e consultado; patrimônio permaneceu R$ 200 após recarga; restauração devolveu o bem à lista ativa. Nenhuma base pessoal foi alterada. O navegador não devolveu captura visual nesta sessão; a jornada foi conferida pela árvore de acessibilidade.
- Verificação: build e lint passaram; suíte completa com 379 testes aprovados e 3 ignorados. Os testes focados cobrem aporte antigo, realizado após arquivamento, envelope Cartão, referências, exclusão segura e backup.
