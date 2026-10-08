# Funcionamento do FinTano — base V17

Uso pessoal de um único usuário, exclusivamente em notebook e computador, em telas grandes, com mouse e teclado. KISS: mostrar o que ajuda a decidir ou agir, com detalhes sob demanda.

Este documento descreve a base atual. Melhorias ainda não entregues estão em [prioridades](prioridades.md).

## Responsabilidade das abas

| Aba | Função |
| --- | --- |
| Ciclo | Registrar recebido/pago, acompanhar verba para Desejos, consultar prévia do próximo ciclo e revisar o fechamento. |
| Planejar | Editar o plano da competência ativa: renda, descontos em folha, custos, Desejos e aporte. Fixar uma referência para comparação posterior. |
| Cartões | Conferir/importar compras por ciclo, separar minha parte e confirmar faturas pagas pelo valor total. |
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

Cartões usa **Este ciclo** e **Próximo ciclo**, ancorados na competência operacional para todos os cartões. Confirmar o pagamento de um cartão preserva sua composição e mantém as parcelas pagas na lista deste ciclo, com estado textual, data e acento verde; elas não têm edição comum. A próxima parcela continua em Próximo ciclo. Só a virada operacional avança o período consultado. O total do ciclo conserva as faturas pagas; Ainda a pagar ao banco exclui apenas as já pagas.

Novas compras em um cartão cuja fatura deste ciclo já foi paga entram no próximo ciclo, com aviso no formulário. Importação exige escolher Próximo ciclo nessa situação; faturas pagas não podem ser substituídas ou reimportadas. Trocar o cartão de uma compra mantém sua competência e recusa uma fatura de destino já paga.

O fechamento permite **Confirmar pendentes e virar ciclo**: revisa cartões, meses de vencimento e valor cheio ao banco, incluindo faturas anteriores ainda abertas, e confirma tudo numa gravação única. Faturas já pagas são puladas. Créditos excedentes passam uma vez para a seguinte; valores desconhecidos exigem conferência. Continua disponível fechar apenas o ciclo, sem declarar pagamento.

Cadastrar cartão exige somente o nome. Dias de fechamento e vencimento e limite do banco são opcionais e não comandam a consulta. Cartões novos começam atribuídos ao ciclo ativo; a fatura anterior é confirmada vazia por se tratar de um novo cadastro. A correção excepcional da atribuição de fatura fica recolhida na configuração; dados existentes conservam seus meses e pagamentos.

Em **Configurar cartões**, informar **Vence dia** uma vez. **Faturas dos cartões** mostra o vencimento completo de cada fatura usando esse dia e seu mês de vencimento. Se o dia não existir no mês, usa o último dia disponível; a referência não ajusta feriados ou fins de semana. Sem dia cadastrado, mostra **Vencimento não informado**. Após confirmar o pagamento, conserva a data da fatura paga e mostra também o próximo vencimento; ao virar o ciclo, a data principal acompanha a nova fatura. Faturas anteriores pendentes mostram seu próprio vencimento.

Exemplo no ciclo de outubro: as faturas abertas de Itaú e Nubank vencem em 05/11 e 13/11. Se o Itaú de 05/10 já foi pago e o Nubank de 13/10 ainda está pendente, o Nubank mostra também essa fatura anterior. Confirmar o pagamento de 13/10 mantém a fatura aberta de 13/11 e o ciclo de outubro.

Novas compras manuais começam com a área Desejos selecionada; é possível escolher outra área ou deixar sem classificação. Após salvar, a próxima compra volta ao padrão Desejos. O bloco Faturas dos cartões pode ser recolhido pelo cabeçalho e guarda essa preferência no navegador.

Separar total a pagar ao banco, parte pessoal, valores de terceiros e valores antecipados. Antecipação é dinheiro já pago; recompensa é abatimento sem nova saída. Créditos excedentes passam para a próxima fatura sem repetir movimento de caixa.

O envelope Cartão inclui seus itens filhos. Não somar novamente seus detalhes ou contabilizar a mesma compra como conta e fatura.

## Importação e terceiros

A colagem é revisada antes de gravar: linhas aceitas, descartadas com motivo, compras novas, alterações e possíveis duplicatas. Descrição, data e parcela identificam uma compra existente; quando a identidade é ambígua, a linha fica ignorada até decisão explícita. Repetir a colagem preserva o ID das compras reconhecidas. Substituir mostra o que sairá, inclusive abatimentos e vínculos, e alcança somente a fatura e o cartão selecionados. Dados alterados depois da revisão exigem nova conferência.

Você paga a fatura inteira e sua mãe repassa exatamente a parte dela antes do vencimento. A diferença entre o total da compra e **Minha parte** é considerada recebida nesse fluxo, sem cadastro, cobrança, pendência ou confirmação de reembolso. O nome livre da compra continua disponível como contexto.

Somente a parte pessoal entra nas despesas, no fluxo pessoal do Ciclo, na verba para Desejos e na prévia do próximo ciclo. A parte da sua mãe permanece no total a pagar ao banco, mas seu repasse não é renda nem dinheiro adicional para alocar. Não registrar esse repasse como entrada extra.

Exemplo: compra de R$ 300, sendo R$ 100 pessoais e R$ 200 da sua mãe, exige R$ 300 ao banco e consome apenas R$ 100 dos seus recursos. Pagar a fatura, virar o ciclo ou importar a compra não cria adiantamento ou valor a receber. A prévia identifica **Minha parte da fatura** para explicitar o valor descontado do próximo salário.

Registros antigos de devoluções e fechamentos permanecem preservados no backup por compatibilidade e auditoria. Não participam dos cálculos do ciclo ativo nem das prévias, e não exigem operação para quitar pendências antigas.

## Realizado, verba e fechamento

Previsão não é dinheiro disponível. Campo ausente significa desconhecido; zero informado é conhecido. Confirmar como no plano registra a confirmação, inclusive sua origem. Estimativas ajudam a planejar compromissos, mas não são recebimentos ou pagamentos confirmados.

**Verba para Desejos** = recursos do ciclo − fatura anterior − contas do ciclo − aporte comprometido − extraordinários que precisam desses recursos. Desejos não são subtraídos antes de calcular a própria verba; destinações realizadas são mostradas depois.

O aporte comprometido considera o líquido executado e o restante programado. Com renda de R$ 5.000, fatura de R$ 1.000, contas de R$ 2.000 e aporte de R$ 1.000, a verba é R$ 1.000. Executar R$ 400 desse aporte mantém a verba; executar R$ 1.200 reduz para R$ 800.

Renda recebida mostra somente folha e extras. Resgate é uso de patrimônio existente. No orçamento, resgates e aportes do mesmo ciclo se compensam antes de comparar o aporte líquido ao programado: resgatar R$ 1.000 e reaplicar R$ 1.000 em outra posição não aumenta a verba para Desejos nem cumpre o aporte do plano. Se os resgates excederem os aportes, o excedente aparece separadamente como recurso patrimonial usado no ciclo. O fluxo registrado conserva entradas e saídas brutas, sem alterar os livros. Para novas mudanças entre posições, usar a transferência em Patrimônio.

Fluxo registrado é entrada efetiva menos saída efetiva. Sem abertura e conciliação bancárias completas, não representa o saldo disponível da conta.

Entradas extras recebidas e saídas extraordinárias pagas começam recolhidas no Ciclo. O total e previsões pendentes continuam visíveis. Futuro só vira realizado mediante registro de recebimento/pagamento; vínculos identificam a ocorrência correspondente.

Fechar exige confirmação da folha, custos e Desejos fora do cartão, além de faturas conhecidas. A revisão permite resolver pendências antes de confirmar. Fechamento registra o ciclo no Histórico e avança uma vez; o plano não é convertido silenciosamente em pagamento.

## Movimentos em Patrimônio

Aportes e resgates nos livros das posições/metas registram caixa e aporte líquido. O valor do resgate precisa existir na origem; não é reduzido silenciosamente. A seção recolhida de movimentos permite transferir entre posições e metas de acumulação, incluindo a reserva, ou amortizar uma dívida com recursos da conta ou de uma posição. Origem, destino, valor, ciclo e data real pertencem à mesma operação.

Transferir R$ 1.000 conserva patrimônio e aporte líquido; não cria entrada disponível. Amortização extraordinária reduz a dívida e consome os recursos uma vez. Se sair de uma posição, o resgate e a amortização se compensam no caixa, mantendo a redução da posição e do saldo devedor. Para amortizar o principal de uma parcela já confirmada no Ciclo, usar o custo vinculado à dívida: o principal reduz a dívida sem registrar a parcela outra vez. Ajustar saldo por extrato continua sem pagamento.

Remover uma movimentação vinculada desfaz todas as suas partes, inclusive caixa dos ciclos fechados, e mantém as marcas patrimoniais passadas. Se o destino já usou o saldo, a reversão é recusada até recomposição. Alterar competência move as partes juntas e preserva a data real; amortização de parcela já paga conserva o ciclo do pagamento.

## Patrimônio e passado

Saldo inicial compõe patrimônio, mas não aporte do ciclo. Tipo, competência e data dos movimentos têm significado próprio; observação livre não muda seu efeito financeiro.

Previdência descontada em folha é investimento pessoal e não sai novamente do caixa. Em Planejar, vincular cada previdência a uma posição de carteira e definir o desconto pessoal e a contribuição da empresa. Confirmar uma nova folha no Ciclo grava os dois aportes automaticamente nas posições vinculadas, na competência ativa. Reconfirmar atualiza os mesmos registros; corrigir ou limpar a folha concilia o saldo na mesma gravação. A contrapartida da empresa vai direto à previdência: não é renda recebida, não integra a base de orçamento, não financia Desejos nem cumpre o aporte pessoal programado. Aumentar essa contrapartida muda o saldo da previdência, sem mudar a verba do ciclo ou a prévia do próximo. O formulário manual da posição é para aportes pessoais extras pela conta; não repetir nele a folha ou a empresa.

Em Patrimônio → Posições, a previdência separa saldo pessoal, saldo da empresa com direito adquirido e saldo empresarial em carência. Conferir por extrato permite salvar saldo total, saldo total da empresa e quanto dela ainda está em carência, incluindo rendimentos, com salvar/cancelar. Novos aportes da empresa entram em carência; quando houver liberação pelo plano, atualizar a divisão pelo extrato. O sistema não presume datas ou regras de liberação. Direito adquirido não significa liquidez imediata.

Saldos antigos não têm divisão presumida: informar a composição do extrato uma vez. Até conhecer a divisão, a posição não financia metas nem permite saída de recursos no controle. A parcela conhecida em carência também não financia metas ou resgates/transferências; o saldo pessoal sai primeiro, seguido da parcela empresarial adquirida. O patrimônio total inclui o saldo condicionado, identificado como tal. Atualizar avaliação/divisão não cria aporte; o livro mostra separadamente os aportes automáticos pessoais e empresariais.

Folhas já confirmadas antes da automação não são relançadas, inclusive após limpar e reconfirmar. Sua composição patrimonial deve ser conferida por extrato; a automação começa nos ciclos com novas folhas. Destinos capturados na confirmação permanecem os mesmos após editar o plano. Correção de folha histórica com automação atualiza a posição atual, preservando a marca patrimonial do fechamento. Os aportes automáticos são corrigidos pela folha, sem exclusão ou mudança de competência isolada no livro.

Reserva, carteira e metas atribuem finalidade ao dinheiro existente; não duplicam ativos. Bens físicos e dívidas entram no patrimônio líquido. Destinar saldo a uma meta não cria dinheiro novo.

Fechamentos preservam folha, metas de comparação e marca patrimonial do fechamento. Aportes diretos históricos acompanham a competência do livro de movimentos. Consultar o passado não troca a competência operacional. Cadastros com fatos são arquivados em vez de apagar seu histórico.

Posições, reserva, bens e dívidas mostram a última data de avaliação informada. Salvar uma avaliação grava saldo e data juntos, sem aporte, resgate ou pagamento. Cancelar não grava; vazio não confirma zero; conflito de revisão ou falha conserva o rascunho. O extrato precisa incluir os movimentos já registrados. Movimentos posteriores ajustam o saldo sem mudar a data da última avaliação. Dados antigos sem essa data continuam identificados como desconhecidos; a data de exportação do backup não é presumida como avaliação.

Variação contra o livro compara o saldo com saldo inicial e movimentos líquidos. Não representa aporte do ciclo nem presume rentabilidade de um residual sem origem. O retorno anualizado usa a data da avaliação, exige histórico suficiente e fica indisponível quando há movimentos posteriores. A visão principal concentra patrimônio líquido, ativos financeiros e bens; os detalhes ficam em cada registro.

O comparador de taxas usa as taxas e o valor informados, antes de impostos e tarifas, sem garantir rendimento ou considerar liquidez e renegociação. A comparação mensal de moradia é parcial: juros e valorização estimada contra aluguel informado. Não inclui custo de oportunidade, impostos da operação, seguros, IPTU, condomínio e manutenção; valorização não paga a parcela.

## Destinos do aporte e reserva

Em Planejar → Plano de aportes, **Editar destinos** divide o aporte direto entre posições e metas de acumulação, por referências estáveis. Uma posição com finalidade Reserva é um destino da reserva; indicadores patrimoniais apenas acompanham fontes e não recebem promessa de aporte. Salvar registra intenção, sem alterar saldos ou criar movimentos. A edição usa salvar/cancelar, aceita Escape e preserva o rascunho em recusa ou conflito.

A capacidade é limitada pelo aporte escolhido e pelo que sobra do salário depois dos custos e Desejos, incluindo parcelas de dívida que não estejam cobertas por custos vinculados. A folha tem destinos próprios e não entra novamente nessa divisão. Dois destinos de R$ 800 não cabem em R$ 1.000: a gravação é recusada, com a diferença indicada. Reduzir depois a capacidade ou arquivar um destino exige revisar a divisão; uma divisão inviável não financia metas na projeção. Valores sem destino entram apenas no patrimônio geral projetado.

Os destinos pertencem ao plano da competência. Publicar esse plano como modelo recorrente leva a divisão aos próximos ciclos ainda intactos; planos futuros personalizados conservam seus próprios destinos. Classes de diversificação descrevem composição, sem reservar outra vez o mesmo aporte. Destinar saldo de uma posição a uma meta mantém o ativo contado uma vez; acompanhar saldo em um indicador não o reserva.

A reserva usa a média de custos fora do cartão mais Necessidades pessoais classificadas no cartão, nos últimos até seis fechamentos disponíveis, com mínimo de dois. Sem classificação suficiente, usa os custos pessoais do plano; zero conhecido continua zero. A fatura inteira não é somada novamente; Desejos e aportes ficam fora da base. O prazo simples depende somente do aporte explicitamente destinado às posições de reserva, sem supor rendimento ou destinação automática da renda fixa.

## Projeção mensal

Futuro permite escolher **Base sem entradas** ou **Se as entradas ocorrerem**. A base usa os saldos atuais e o aporte possível, sem somar recebimentos ainda previstos, inclusive os marcados como confirmados. A hipótese acrescenta somente a parcela ainda esperada que se planeja guardar; receber continua diferente de aportar. Cancelamento, parcial, adiamento e vínculos usam a mesma conciliação da agenda.

O primeiro ponto considera o restante do aporte e as pendências conhecidas do ciclo ativo. A renda ainda não confirmada usa o plano, com indicação explícita. Os meses seguintes usam seus planos personalizados ou o modelo recorrente e os fatos já registrados naquela competência. Aportes e folha confirmados não são projetados novamente, inclusive quando têm competência futura. O aporte informado na simulação é limitado pela capacidade; contribuição da empresa fica separada e condicionada. Saldos em carência ou com divisão desconhecida não financiam saídas.

Uma saída ligada a custo ou cartão ocupa sua verba uma vez. Parcelas de dívida sem cobertura no plano reduzem a capacidade; faturas conhecidas e cobranças ainda não lançadas são comparadas com o plano do cartão sem repetir a mesma compra. Fatura sem total conhecido usa o maior entre a parte conhecida e o plano, com aviso. Extras reduzem o que pode ser guardado; apenas a insuficiência além dos recursos do mês exige patrimônio. A primeira insuficiência e a maior falta no horizonte são identificadas, mesmo no ciclo inicial.

Metas projetam apenas as próprias fontes: saldo do livro, parcela destinada de posições, destinos mensais e, na hipótese, divisões explícitas de entradas por ocorrência. Indicadores acompanham as fontes escolhidas. Redução de dívida melhora apenas os indicadores que a incluem; não aumenta uma meta de carteira. Saídas além do caixa mensal usam primeiro a parcela sem finalidade e depois rateiam as fontes utilizáveis, podendo reduzir metas. Essa regra é uma hipótese de financiamento, sem escolher uma conta bancária ou prometer saldo diário.

Alvos e previsões de metas permanecem nominais em reais. No gráfico, Nominal e Reais de hoje mudam todas as séries para a mesma unidade, inclusive dívidas. Taxas, valorização e inflação são premissas. Reinvestir parcelas liberadas não soma a mesma sobra novamente quando a opção de incluir sobras já está ativa ou quando foi fixado um aporte na simulação.

## Metas e entradas previstas

Em Futuro, **Organizar grupos** reúne metas de acumulação pelo mesmo nome, como Eurotrip 2027. O grupo soma os objetivos e suas necessidades; não cria outro saldo. Indicadores patrimoniais ficam separados. A edição tem salvar/cancelar e recusa uma revisão desatualizada.

**Destinar entradas** escolhe uma ocorrência concreta, como o décimo terceiro de dezembro/2026, e divide valores entre várias metas. **Dividir pelo que falta** sugere uma divisão proporcional às necessidades restantes após as outras entradas destinadas, limitada à parcela que se planeja guardar e ao que falta para cada meta. É possível ajustar os valores antes de salvar. Destinações a metas de outros grupos são preservadas e consomem a mesma verba. Um valor destinado nesta ocorrência não é repetido automaticamente no décimo terceiro do ano seguinte. A associação antiga “Meta relacionada” continua sendo apenas contexto.

O resumo mostra dinheiro já guardado, falta sem as entradas, entradas que cobrem as metas e falta se elas ocorrerem, com o ritmo mensal até os prazos. Os detalhes mostram a origem de cada parte. Só entradas previstas até o mês-alvo reduzem a necessidade condicional; entradas posteriores e atrasadas são identificadas. Metas sem prazo ou com prazo vencido não entram no ritmo mensal. Não incluir dinheiro acima da necessidade de uma meta como cobertura de outra; a sobra exige revisar a divisão.

Receber não é guardar. Em recebimentos parciais, a parcela ainda esperada de cada destinação cai proporcionalmente ao restante da entrada. A parcela recebida aparece como contexto e só conta no guardado quando destinada à posição/meta em Patrimônio. Cancelar ou adiar para depois do prazo retira a cobertura prevista, preservando os fatos e a divisão. Reduzir o valor ou o percentual guardado exige primeiro ajustar uma divisão que exceda a nova verba.

Exemplo: metas de R$ 14.350, com R$ 1.000 já destinados, exigem R$ 13.350 sem depender de entradas. Destinar R$ 7.500 do décimo terceiro e R$ 1.200 do dissídio deixa R$ 4.650 a guardar se ambas ocorrerem, ou R$ 465/mês de outubro/2026 a julho/2027, incluindo esses meses. A base continua exigindo R$ 13.350. Todos os valores deste planejamento são nominais em reais; ele não estima câmbio, conversão ou taxas da viagem. Ajustar alvo e prazo da meta conforme o orçamento e a data em que os recursos precisam estar preparados.
## Ocorrências e agenda

A lista principal de Futuro ordena cada previsão pela próxima ocorrência pendente conciliada. O resumo mostra data e restante, incluindo vencidas e parciais; realizar uma ocorrência avança para a próxima. O detalhe permite consultar outras ocorrências e os registros realizados/cancelados. Projeção e premissas começam recolhidas.

Entradas e saídas esperadas também pode ser recolhido pelo cabeçalho. Esse bloco e Faturas dos cartões começam abertos e conservam a última escolha de exibição no navegador.

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

## Fotografia para análise externa

O botão de análise no cabeçalho gera uma fotografia do plano operacional e da competência ativa, pelas mesmas consultas do Ciclo, das faturas, da agenda conciliada e do Futuro. O texto distingue plano de realizado confirmado, desconhecido de zero explícito e identifica totais parciais quando salário ou fatura não estão confirmados. A sobra é o cálculo do ciclo com fatura paga/a pagar, sem representar saldo bancário conferido.

A fotografia inclui compromissos e origens, aportes brutos e líquidos, resgates, amortizações, extras, custos e Desejos sem truncar os detalhes; total ao banco, parte pessoal e parte não pessoal coberta pelo repasse; saldos e datas de avaliação, metas e destinos; agenda pendente até o horizonte projetado, com valores realizados, restantes e vínculos; base sem entradas incertas e hipótese com entradas esperadas, premissas e primeira insuficiência. Referências já incluídas nos totais não representam novas operações. Receber, aportar e avaliar continuam distintos.

Revise e, se necessário, edite o texto antes de **Copiar texto**. A cópia usa exatamente o conteúdo mostrado. Se as fontes mudarem durante a revisão, o rascunho é conservado e **Atualizar fotografia** substitui o texto pela leitura atual. Fechar ou Escape descarta essa revisão local; reabrir gera uma nova fotografia. O foco por Tab permanece no diálogo.

**Abrir ChatGPT** e **Abrir no Claude** copiam o texto revisado e abrem o serviço sem dados financeiros na URL. Colar, revisar e enviar são ações manuais. Gerar ou editar a fotografia não envia informações nem altera registros financeiros, persistência ou backup. Se a cópia falhar, o texto continua disponível para seleção manual.
