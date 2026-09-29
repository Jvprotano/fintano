# Backup público v8: compromissos futuros

O repositório interno continua em `fintano_data_v7`. A versão 8 identifica o **arquivo exportado**, não uma mudança da chave local. Ao importar v7, o app cria `forecast.funds: []` e mantém os meses dos eventos sem inventar dias, meios de pagamento ou quitações.

## Campos novos

- `forecast.funds[]`: grupo com ID, nome, `reservedAmountCents` informado pelo usuário e `goalId` opcional. Uma meta de aporte vinculada substitui o valor manual pelo saldo próprio da meta; o mesmo saldo não pode financiar dois grupos. Esse vínculo não cria caixa ou patrimônio.
- `forecast.events[]`: `date` opcional, `groupId`, `cashTreatment` (`extra`, `planned`, `card`), `cardDueMonth`, `confirmed` e `occurrenceOverrides` por mês original. A data exata só existe quando cadastrada.
- `actuals.cycles[].cashMovements[]` e movimentos preservados em `history.closures[]`: `sourceOccurrenceId` e `occurredAt` opcionais. `sourceForecastEventId` permanece para compatibilidade.
- `cards.charges[]` e `cards.statements[]`: o lançamento pode guardar `sourceForecastOccurrenceId`; a fatura paga preserva as ocorrências e valores vinculados para conciliação após o giro do cartão.

`occurrenceOverrides` usa o mês original da série como chave. Cada ajuste pode mover mês/dia, alterar valor ou cancelar uma ocorrência. O ID lógico da ocorrência é `eventId@originalMonth`; mudar a data não altera esse ID e não reescreve pagamentos históricos.

## Contagem e compatibilidade

- Evento `extra` em conta participa da prévia extraordinária do Ciclo e do efeito patrimonial.
- Evento `planned` ou `card` é mostrado na agenda, mas não sai novamente do caixa extraordinário nem da projeção patrimonial. O lançamento vinculado do cartão pode ser iniciado em Futuro quando sua fatura é atual ou seguinte; a quitação continua pela fatura em Cartões.
- Recebimentos previstos não entram no caixa operacional até serem registrados no Realizado. Um pagamento parcial reduz apenas o restante da ocorrência.
- Uma entrada recebida deixa de ser previsão, mas só passa a cobrir um grupo quando o usuário atualiza o valor reservado ou a meta vinculada; o app não atribui automaticamente esse dinheiro a duas finalidades.
- Um fato legado com apenas `sourceForecastEventId` é conciliado pelo ID do evento e pelo mês original do ciclo em que foi salvo.
- O backup v7 importado mantém IDs e valores; `date`, `sourceOccurrenceId` e os fundos continuam ausentes até o usuário informá-los.

O motor de cobertura usa o valor reservado mais as entradas atribuídas ao grupo, em ordem cronológica. A consulta por data é uma **cobertura atribuída sem novos depósitos**, não saldo bancário. Quando um dia não foi informado, uma saída é tratada no começo do mês e uma entrada no fim do mês para evitar cobertura antecipada.
