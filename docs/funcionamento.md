# Funcionamento do FinTano — base V17

Uso pessoal de um único usuário, exclusivamente em notebook e computador, em telas grandes, com mouse e teclado. KISS: mostrar o que ajuda a decidir ou agir, com detalhes sob demanda.

Este documento descreve a base atual. Melhorias ainda não entregues estão em [prioridades](prioridades.md).

## Responsabilidade das abas

| Aba | Função |
| --- | --- |
| Ciclo | Registrar recebido/pago, acompanhar verba para Desejos, consultar prévia do próximo ciclo e revisar o fechamento. |
| Planejar | Editar o plano da competência ativa: renda, descontos em folha, custos, Desejos e aporte. Fixar uma referência para comparação posterior. |
| Cartões | Conferir/importar compras, pagar cada cartão separadamente e definir adiantamentos a terceiros e devoluções recebidas. |
| Patrimônio | Consultar e registrar posições, reserva, metas, bens, dívidas e livros de movimentos. |
| Histórico | Consultar fechamentos, diferenças contra o plano, evolução e faturas antigas sem cartão identificado; acessar a correção dos registros. |
| Futuro | Cadastrar entradas e saídas esperadas, ocorrências e ajustes; consultar projeções e premissas. |

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

Rateio não presume adiantamento. Em Terceiros, definir se eu adianto ao banco ou se o terceiro paga a própria parte. Ao adiantar, a parte de terceiros entra no desembolso do ciclo escolhido, além da parte pessoal já contabilizada na fatura. Registrar devoluções na própria compra, com valor, data real e ciclo; aceitar pagamentos parciais até o restante. Devolução aumenta caixa e reduz o valor a receber, sem aumentar renda ou aporte. Não repetir esse desembolso nas saídas extras.

Exemplo: compra de R$ 300, sendo R$ 100 pessoais e R$ 200 financiados por mim, exige R$ 300 de desembolso. Receber R$ 50 mantém o pagamento ao banco e reduz o valor a receber para R$ 150. Se o terceiro paga diretamente, não existe adiantamento meu.

Rateios ainda sem definição tornam a leitura de caixa incompleta; o Ciclo informa isso e exige a definição dos rateios do próprio caixa antes de fechar. A prévia seguinte identifica sua incerteza e inclui adiantamentos já definidos no ciclo seguinte. Valores antigos sem confirmação não são convertidos automaticamente em dívidas a receber.

Trocar ou remover compras não apaga adiantamentos/devoluções já confirmados. A correção de rateio não pode ficar menor que o recebido. Desfazer devolução repõe o restante; desfazer uma definição exige desfazer suas devoluções antes. Desfazer a exclusão da compra mantém seu ID. Registros sem pendência de ciclos anteriores e rateios antigos ficam em Histórico; cobranças ainda pendentes continuam operacionais em Cartões.

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

Correção histórica geral, ciclo de vida das ocorrências, destinos de aportes e projeções ainda têm melhorias pendentes; consultar a fila antes de alterar esses fluxos.
