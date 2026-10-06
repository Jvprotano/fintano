# Versões entregáveis da revisão do produto

## Ponto de partida

Em 06/10/2026, as entregas pendentes passaram a depender da seleção de escopo do proprietário. A ordem abaixo é a proposta original. Toda implementação deve atender ao uso exclusivo em notebook e computador, em telas grandes, com mouse e teclado.

Na leitura inicial de 02/10/2026, `main` estava em `504afc9`, sem alterações locais. FT-01–FT-12 estão marcadas como concluídas em [tasks.md](tasks.md); FT-13–FT-26 estão pendentes. Esta divisão usa o estado registrado no repositório, não presume que uma tarefa pendente já funcione por ter código parcial.

Cada versão abaixo deve poder ser usada isoladamente após a entrega. Uma versão só fecha quando o fluxo descrito funciona com dados sintéticos, os efeitos no documento persistido são coerentes e `tasks.md` registra o resultado e os limites observados. Manter compatibilidade de leitura dos dados anteriores e fazer migração junto da funcionalidade que a exige.

| Versão | Situação | Resultado utilizável | Escopo principal | Depende de |
| --- | --- | --- | --- | --- |
| V1 — base confiável do ciclo | Entregue | Recuperação de dados, plano por competência, realizado, verba para Desejos, fechamento e cadastro/calendário de cartões. | FT-01–FT-12 | — |
| V2 — fatura por cartão | Entregue em 02/10/2026 | Escolher, consultar e pagar a fatura de um cartão sem alterar a de outro; Ciclo, Planejar e Histórico usam a mesma competência. | FT-13 | V1 |
| V3 — conferência de compras e terceiros | Pendente | Importar lançamentos com prévia de diferenças e registrar reembolso parcial ou integral sem inflar renda pessoal. | FT-14–FT-15 | V2 |
| V4 — movimentos e saldos patrimoniais | Pendente | Aporte, resgate, transferência e amortização produzem um fato financeiro rastreável; avaliações datadas mudam saldo, não aporte. | FT-16–FT-17 | V1; pode começar enquanto V2/V3 avançam, mas integrar com os contratos atuais antes de entregar |
| V5 — aporte com destino | Pendente | Reserva e metas disputam explicitamente a mesma capacidade de aporte mensal, sem duplicar patrimônio. | FT-18 | V4 |
| V6 — agenda de ocorrências | Pendente | Editar, adiar, cancelar, efetivar e consultar uma ocorrência preserva os fatos; Futuro abre pela próxima pendência real. | FT-19–FT-20 | V2; usar os vínculos de cartão e plano já existentes |
| V7 — projeção reconciliada | Pendente | Consultar cenário base e hipótese com entradas incertas, compromissos sem duplicação e metas projetadas pelas fontes corretas. | FT-21 | V5 e V6 |
| V8 — passado corrigível | Pendente | Corrigir um fato com revisão de origem e ver os desvios do período sem alterar silenciosamente o fechamento. | FT-23, depois FT-22 | V4; integrar os fatos de V2, V3 e V6 antes de fechar |
| V9 — fotografia e acabamento operacional | Pendente | Exportar para IA uma fotografia fiel ao Ciclo e concluir navegação, edição e documentação dos fluxos entregues. | FT-25 + conclusão de FT-24 e FT-26 | V2–V8 |

## Fronteira de cada entrega pendente

### V2 — fatura por cartão

- Entregar identidade estável de cartão/fatura, competência, vencimento, pagamento independente, histórico consultável e migração de lançamentos e snapshots antigos. Seguir o contrato de [FT-13](ft13-faturas.md).
- Conferir dois cartões: pagar A, consultar A pago e B aberto, renomear A e recarregar. Parcelas e créditos continuam na conta certa; dados legados sem composição permanecem explicitamente desconhecidos.
- Deixar importação revisada e reembolso para V3. A fatura por cartão já precisa ser plenamente operável em V2.

### V3 — conferência de compras e terceiros

- Entregar prévia antes de importar, distinção entre linha válida/descartada/duplicada e substituição com diferenças visíveis. O rateio informa parte pessoal, desembolso total e valor a receber; reembolso aponta para o adiantamento.
- Conferir importação repetida com “Total Fitness” e compra dividida de R$ 300 (R$ 100 pessoal, R$ 200 adiantados), seguida de reembolso parcial. O pagamento da fatura continua único e o reembolso não vira renda pessoal.

### V4 — movimentos e saldos patrimoniais

- Registrar operações vinculadas uma vez e distingui-las de ajustes por extrato. Mostrar avaliação com data, valor e contexto; reorganizar Patrimônio ao redor de posições, reserva, metas e dívidas.
- Conferir transferência de R$ 1.000, resgate e amortização de R$ 1.000. Patrimônio, caixa e aporte do ciclo devem explicar o mesmo movimento; alterar avaliação não cria aporte.

### V5 — aporte com destino

- Destinar posições e aportes futuros à reserva e às metas por referências estáveis. Explicitar a base da reserva e a soma das promessas frente ao aporte disponível.
- Conferir duas metas que requerem R$ 800 cada com aporte total de R$ 1.000. A aplicação mostra a disputa; destinar saldo já existente não aumenta patrimônio.

### V6 — agenda de ocorrências

- Preservar ocorrências liquidadas ao editar série; oferecer edição desta/próximas, recuperação de canceladas e vínculo verificável a plano, meta, pagamento ou fatura. A lista principal usa a próxima pendência reconciliada de cada evento.
- Conferir evento parcial, vencido e depois liquidado. Alterar o valor da série não reabre uma ocorrência paga; registrar em Ciclo e Futuro aponta para o mesmo fato.

### V7 — projeção reconciliada

- Projetar com entradas incertas fora da base e hipótese opcional; tratar compromissos financiados uma vez, pendências do ciclo inicial e metas ligadas às suas próprias fontes. Uniformizar base nominal/real e indicar a primeira insuficiência.
- Conferir bônus incerto, despesa já presente no plano/cartão e meta de carteira quando uma dívida cai. Exibir premissas e limites sem prometer saldo bancário diário.

### V8 — passado corrigível

- Implementar FT-23 antes da nova leitura de FT-22. Corrigir na origem quando houver movimento, ou registrar ajuste legado explícito; conservar marca patrimonial e revisão de fechamentos afetados. Histórico prioriza desvios, origem e períodos comparáveis.
- Conferir correção de extra recebido, custo e competência de aporte. O antes/depois e todas as leituras afetadas precisam concordar; cancelar uma edição não grava.

### V9 — fotografia e acabamento operacional

- Gerar texto para IA a partir das mesmas consultas reconciliadas mostradas no produto, qualificando desconhecidos, pendências, terceiros e entradas incertas. O usuário revisa o texto antes de copiá-lo.
- Fechar lacunas restantes de FT-24: edição composta com salvar/cancelar, rascunho em falha, foco e atalhos em diálogos, links que abrem o registro correto e composição acessível sem hover. Aplicar essas regras **durante V2–V8** nas telas tocadas; V9 é apenas a conferência final do que restar.
- Atualizar documentação **em cada versão**. Em V9, concluir FT-26 removendo apenas caminhos comprovadamente sem consumidor e descrevendo compatibilidade legada e limites da projeção.

## Ritmo de execução e validação

1. Começar pela primeira versão pendente, V3. A ordem da tabela é a ordem de publicação; trabalho interno de versões independentes pode avançar antes, desde que a integração e a entrega respeitem as dependências.
2. Implementar o fluxo completo da versão, inclusive persistência, migração/backup quando aplicável, cálculo e interface. Não encerrar uma entrega por compilação ou tela isolada.
3. **Não gastar tempo de execução nem tokens criando, ampliando ou rodando testes unitários, suítes completas ou testes sem risco concreto associado à mudança.** A prioridade é implementar as funcionalidades. Fazer somente a conferência manual curta da jornada indicada, com dados sintéticos, e olhar o registro persistido quando houver alteração financeira ou migração. Rodar build uma vez quando necessário para verificar a integração do código; lint ou outra verificação apenas se uma falha concreta ou requisito do repositório justificar.
4. Nas telas alteradas, conferir a ação essencial no contexto de notebook e computador, com mouse e teclado, conforme `AGENTS.md`.
5. Registrar no `tasks.md` o que foi realmente observado, o que ficou pendente e o commit de cada versão. Não declarar validação de navegador, dados pessoais ou produção que não tenha ocorrido.

O escopo detalhado e os critérios de cada FT continuam em [tasks.md](tasks.md). Este documento define as fronteiras de publicação; não substitui os contratos financeiros de [plano-execucao.md](plano-execucao.md).
