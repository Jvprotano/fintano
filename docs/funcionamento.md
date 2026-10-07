# Funcionamento do FinTano — base V17

Uso pessoal de um único usuário, exclusivamente em notebook e computador, em telas grandes, com mouse e teclado. KISS: mostrar o que ajuda a decidir ou agir, com detalhes sob demanda.

Este documento descreve a base atual. Melhorias ainda não entregues estão em [prioridades](prioridades.md).

## Responsabilidade das abas

| Aba | Função |
| --- | --- |
| Ciclo | Registrar recebido/pago, acompanhar verba para Desejos, consultar prévia do próximo ciclo e revisar o fechamento. |
| Planejar | Editar o plano da competência ativa: renda, descontos em folha, custos, Desejos e aporte. Fixar uma referência para comparação posterior. |
| Cartões | Conferir/importar compras, pagar cada cartão separadamente e acompanhar o que terceiros devem e registrar recebimentos. |
| Patrimônio | Consultar e registrar posições, reserva, metas, bens, dívidas e livros de movimentos. |
| Histórico | Consultar fechamentos, diferenças contra o plano, evolução e faturas antigas sem cartão identificado; acessar a correção dos registros. |
| Futuro | Agrupar metas e dividir entradas previstas entre elas; acompanhar ocorrências, registrar ou vincular fatos e consultar projeção sob demanda. |

## Plano, referência e simulação

Cada competência tem seu próprio plano, inicialmente derivado do modelo recorrente. Editar Planejar altera o plano do ciclo ativo. Selecionar uma simulação não altera esse plano nem os fatos; Aplicar simulação ao ciclo copia seus valores explicitamente.

Fixar plano do ciclo guarda uma cópia independente com data, uma vez por competência. Ajustes posteriores e aplicação de simulação preservam a referência. O fechamento compara custos fora do cartão, Desejos fora do cartão, investimentos pessoais e cartão com essa referência. Sem referência fixada, compara com o plano vigente no fechamento. Não reconstruir uma intenção original que não foi registrada.

Fixar plano não fecha o ciclo, não confirma pagamentos e não altera o modelo recorrente. Publicar o plano como modelo é uma ação separada, com alcance explícito sobre o modelo e, se escolhido, planos futuros ainda intactos.

## Ciclo e cartão

O ciclo ativo é a competência padrão dos lançamentos. A data real existe para auditoria e cálculo de tempo; não muda a competência automaticamente.

Exemplo: o salário do fim de setembro financia outubro. A fatura formada por outubro pode vencer em novembro. O vencimento do cartão e a competência operacional são conceitos diferentes. A fatura determina o ciclo do consumo; a data original de uma compra parcelada não reatribui sua parcela atual.

Cada cartão tem identidade e calendário próprios. Pagar um não paga nem gira outro. O pagamento preserva a composição e avança a fatura daquele cartão; não fecha o ciclo por si só. O fechamento pode incluir pagamento de fatura e avança a competência operacional numa operação única. Os pagamentos preservados permitem fechar depois de pagar sem perder os valores da fatura.

Separar total a pagar ao banco, parte pessoal, valores de terceiros e valores antecipados. Antecipação é dinheiro já pago; recompensa é abatimento sem nova saída. Créditos excedentes passam para a próxima fatura sem repetir movimento de caixa.

O envelope Cartão inclui seus itens filhos. Não somar novamente seus detalhes ou contabilizar a mesma compra como conta e fatura.

## Importação e terceiros

A colagem é revisada antes de gravar: linhas aceitas, descartadas com motivo, compras novas, alterações e possíveis duplicatas. Descrição, data e parcela identificam uma compra existente; quando a identidade é ambígua, a linha fica ignorada até decisão explícita. Repetir a colagem preserva o ID das compras reconhecidas. Substituir mostra o que sairá, inclusive abatimentos e vínculos, e alcança somente a fatura e o cartão selecionados. Dados alterados depois da revisão exigem nova conferência.

Você sempre paga a fatura inteira; terceiros te pagam a parte deles. O valor a receber vem automaticamente da diferença entre o total da compra e sua parte pessoal, com o nome livre informado na compra. Não há cadastro de pessoas, escolha de quem paga ao banco nem definição adicional para fechar o ciclo.

Registrar recebimentos na própria compra, com valor, data real e ciclo; aceitar valores parciais até o restante. Recebimento aumenta caixa e reduz o valor a receber, sem aumentar renda ou aporte. A parte de terceiros complementa o desembolso da fatura no ciclo do vencimento; compras já antecipadas usam o ciclo da antecipação. Não repetir esse desembolso nas saídas extras.

Exemplo: compra de R$ 300, sendo R$ 100 pessoais e R$ 200 de terceiros, exige R$ 300 ao banco. Receber R$ 50 mantém o pagamento da fatura e reduz o valor a receber para R$ 150, inclusive quando o recebimento acontece antes do pagamento da fatura.

O pagamento da fatura preserva automaticamente os valores a receber. Remover uma compra sem fatos de terceiros registrados retira sua previsão; compras com recebimentos ou faturas já pagas conservam seus fatos. A parte de terceiros não pode ficar menor que o recebido. Desfazer recebimento repõe o restante. Registros anteriores continuam preservados, inclusive definições antigas de pagamento direto ao banco; faturas antigas sem recebimentos registrados não ganham cobranças retroativas. Pendências continuam em Cartões e registros concluídos anteriores ficam em Histórico.

## Realizado, verba e fechamento

Previsão não é dinheiro disponível. Campo ausente significa desconhecido; zero informado é conhecido. Confirmar como no plano registra a confirmação, inclusive sua origem. Estimativas ajudam a planejar compromissos, mas não são recebimentos ou pagamentos confirmados.

**Verba para Desejos** = recursos do ciclo − fatura anterior − contas do ciclo − aporte comprometido − extraordinários que precisam desses recursos. Desejos não são subtraídos antes de calcular a própria verba; destinações realizadas são mostradas depois.

O aporte comprometido considera o executado e o restante programado. Com renda de R$ 5.000, fatura de R$ 1.000, contas de R$ 2.000 e aporte de R$ 1.000, a verba é R$ 1.000. Executar R$ 400 desse aporte mantém a verba; executar R$ 1.200 reduz para R$ 800.

Fluxo registrado é entrada efetiva menos saída efetiva. Sem abertura e conciliação bancárias completas, não representa o saldo disponível da conta.

Entradas extras recebidas e saídas extraordinárias pagas começam recolhidas no Ciclo. O total e previsões pendentes continuam visíveis. Futuro só vira realizado mediante registro de recebimento/pagamento; vínculos identificam a ocorrência correspondente.

Fechar exige confirmação da folha, custos e Desejos fora do cartão, além de faturas conhecidas. A revisão permite resolver pendências antes de confirmar. Fechamento registra o ciclo no Histórico e avança uma vez; o plano não é convertido silenciosamente em pagamento.

## Movimentos em Patrimônio

Aportes e resgates nos livros das posições/metas registram caixa e aporte líquido. O valor do resgate precisa existir na origem; não é reduzido silenciosamente. A seção recolhida de movimentos permite transferir entre posições e metas de acumulação, incluindo a reserva, ou amortizar uma dívida com recursos da conta ou de uma posição. Origem, destino, valor, ciclo e data real pertencem à mesma operação.

Transferir R$ 1.000 conserva patrimônio e aporte líquido; não cria entrada disponível. Amortização extraordinária reduz a dívida e consome os recursos uma vez. Se sair de uma posição, o resgate e a amortização se compensam no caixa, mantendo a redução da posição e do saldo devedor. Para amortizar o principal de uma parcela já confirmada no Ciclo, usar o custo vinculado à dívida: o principal reduz a dívida sem registrar a parcela outra vez. Ajustar saldo por extrato continua sem pagamento.

Remover uma movimentação vinculada desfaz todas as suas partes, inclusive caixa dos ciclos fechados, e mantém as marcas patrimoniais passadas. Se o destino já usou o saldo, a reversão é recusada até recomposição. Alterar competência move as partes juntas e preserva a data real; amortização de parcela já paga conserva o ciclo do pagamento.

## Patrimônio e passado

Saldo inicial compõe patrimônio, mas não aporte do ciclo. Tipo, competência e data dos movimentos têm significado próprio; observação livre não muda seu efeito financeiro.

Previdência descontada em folha é investimento pessoal e não sai novamente do caixa. A contrapartida da empresa aumenta o total creditado, sem aumentar renda disponível ou consumir aporte pessoal. Avaliação de mercado altera valor patrimonial, sem criar aporte.

Reserva, carteira e metas atribuem finalidade ao dinheiro existente; não duplicam ativos. Bens físicos e dívidas entram no patrimônio líquido. Destinar saldo a uma meta não cria dinheiro novo.

Fechamentos preservam folha, metas de comparação e marca patrimonial do fechamento. Aportes diretos históricos acompanham a competência do livro de movimentos. Consultar o passado não troca a competência operacional. Cadastros com fatos são arquivados em vez de apagar seu histórico.

A revisão geral dos destinos de aportes e projeções continua pendente e a fila está pausada após a ordem 4. O planejamento de entradas para metas abaixo foi autorizado como ajuste específico; não retoma os demais itens.

## Metas e entradas previstas

Em Futuro, **Organizar grupos** reúne metas de acumulação pelo mesmo nome, como Eurotrip 2027. O grupo soma os objetivos e suas necessidades; não cria outro saldo. Indicadores patrimoniais ficam separados. A edição tem salvar/cancelar e recusa uma revisão desatualizada.

**Destinar entradas** escolhe uma ocorrência concreta, como o décimo terceiro de dezembro/2026, e divide valores entre várias metas. **Dividir pelo que falta** sugere uma divisão proporcional às necessidades restantes após as outras entradas destinadas, limitada à parcela que se planeja guardar e ao que falta para cada meta. É possível ajustar os valores antes de salvar. Destinações a metas de outros grupos são preservadas e consomem a mesma verba. Um valor destinado nesta ocorrência não é repetido automaticamente no décimo terceiro do ano seguinte. A associação antiga “Meta relacionada” continua sendo apenas contexto.

O resumo mostra dinheiro já guardado, falta sem as entradas, entradas que cobrem as metas e falta se elas ocorrerem, com o ritmo mensal até os prazos. Os detalhes mostram a origem de cada parte. Só entradas previstas até o mês-alvo reduzem a necessidade condicional; entradas posteriores e atrasadas são identificadas. Metas sem prazo ou com prazo vencido não entram no ritmo mensal. Não incluir dinheiro acima da necessidade de uma meta como cobertura de outra; a sobra exige revisar a divisão.

Receber não é guardar. Em recebimentos parciais, a parcela ainda esperada de cada destinação cai proporcionalmente ao restante da entrada. A parcela recebida aparece como contexto e só conta no guardado quando destinada à posição/meta em Patrimônio. Cancelar ou adiar para depois do prazo retira a cobertura prevista, preservando os fatos e a divisão. Reduzir o valor ou o percentual guardado exige primeiro ajustar uma divisão que exceda a nova verba.

Exemplo: metas de R$ 14.350, com R$ 1.000 já destinados, exigem R$ 13.350 sem depender de entradas. Destinar R$ 7.500 do décimo terceiro e R$ 1.200 do dissídio deixa R$ 4.650 a guardar se ambas ocorrerem, ou R$ 465/mês de outubro/2026 a julho/2027, incluindo esses meses. A base continua exigindo R$ 13.350. Todos os valores deste planejamento são nominais em reais; ele não estima câmbio, conversão ou taxas da viagem. Ajustar alvo e prazo da meta conforme o orçamento e a data em que os recursos precisam estar preparados.
## Ocorrências e agenda

A lista principal de Futuro ordena cada previsão pela próxima ocorrência pendente conciliada. O resumo mostra data e restante, incluindo vencidas e parciais; realizar uma ocorrência avança para a próxima. O detalhe permite consultar outras ocorrências e os registros realizados/cancelados. Projeção e premissas começam recolhidas.

Editar permite escolher esta ocorrência ou esta e próximas pendentes. A identidade mantém o mês original mesmo após adiamento; data prevista e competência realizada continuam distintas. As liquidadas guardam a definição que acompanhou seus fatos e não são reabertas por uma revisão da série. Pagamentos e recebimentos parciais sobrevivem ao adiamento, com valor, ciclo e data real intactos. A repetição da série mantém sua origem.

Cancelar ocorrência ou previsão conserva todos os fatos e vínculos; reativar recupera as pendências. Corrigir um pagamento ou compra acontece na origem. Desvincular não desfaz nem apaga o fato financeiro. A edição composta usa salvar/cancelar; falhas mantêm o rascunho.

Uma saída incluída no plano identifica o custo ou Desejo correspondente e acompanha o realizado desse item no ciclo previsto. Custos vinculados reservam também o restante no Ciclo, uma vez; Desejos continuam fora dos compromissos-base. Para fatos já existentes, vincular extra, compra ou movimento compatível de posição/meta/dívida evita criar outro lançamento. A meta relacionada dá contexto; marcar uma meta não cria aporte nem reserva dinheiro.

Cobrança no cartão fica lançada e ainda a pagar até o pagamento da fatura; a parte já lançada não pode ser registrada outra vez. Novas cobranças usam o calendário do cartão escolhido. A realização em conta pelo Futuro ou pelo Ciclo usa a mesma ocorrência e gravação, com o ciclo ativo como padrão e data real separada. Valores acima do restante são recusados.

## Consulta e correção do Histórico

A tabela é a leitura principal: renda, custos, Desejos em conta, cartão pessoal, aporte pessoal e marca patrimonial de cada fechamento. Os desvios contra o plano ficam junto ao realizado. O período de 6 ou 12 meses representa calendário e termina no último fechamento; Tudo alcança o primeiro registro. A evolução usa o mesmo período, começa recolhida e não liga pontos separados por meses ausentes. Lacunas não são zero. O acumulado é contado desde o primeiro fechamento disponível e fica desconhecido após lacunas ou contrapartidas sem informação.

Abrir ciclo revela categorias, destinações, composição dos aportes, extras, faturas preservadas e revisões. Valores do patrimônio atual e resumos concorrentes foram retirados. Fechamentos legados identificam plano estimado, meta de aporte ausente e contrapartida desconhecida; um residual sem origem não é chamado de rentabilidade.

Corrigir registros abre um rascunho. Nenhum campo grava sozinho. Revisar antes/depois e ciclos envolvidos, informar motivo e Salvar correção; Cancelar ou Escape descarta a edição. Campo vazio não confirma zero. Falha de gravação mantém o rascunho; revisão desatualizada recusa a operação para evitar sobrescrever outros dados.

Extras, custos e Desejos com origem são corrigidos nos fatos correspondentes, conservando IDs, data real e vínculos da agenda. A folha confirmada atualiza também sua base de orçamento. Quando só existe agregado, a correção é identificada como ajuste explícito, sem inventar movimentações ou distribuição por categoria. Contrapartida desconhecida pode continuar vazia; informar zero a confirma.

A competência dos movimentos pode ser revisada no mesmo rascunho. Todas as partes vinculadas mudam juntas; a data real e o valor continuam os do fato. Aportes e caixa dos ciclos envolvidos são reconciliados e os fechamentos existentes registram o motivo e os ciclos revisados. Amortização de parcela confirmada acompanha o ciclo de seu pagamento. O patrimônio passado não é substituído pelos saldos de hoje. Para corrigir valor ou desfazer uma operação patrimonial, usar o livro de movimentos em Patrimônio.

Faturas pagas podem ser consultadas com sua composição disponível. Um total histórico não substitui compras, créditos ou o pagamento ao banco: a edição isolada do agregado só existe quando não há fatura preservada. As referências de plano continuam as capturadas no fechamento.
