# Futuro: eventos esperados e cobertura de compromissos

## Decisão que a área deve ajudar a tomar

Para cada compromisso futuro: **quanto preciso separar, até quando e de onde virá o dinheiro?** A resposta deve mostrar a ordem das entradas e saídas, o que já foi reservado, o que ainda depende de previsão e o efeito no próximo Ciclo. Patrimônio projetado continua uma leitura separada.

Este documento registra o diagnóstico inicial, o plano aprovado e o estado da implementação.

## Diagnóstico inicial (antes da implementação)

| Hoje | Consequência |
| --- | --- |
| `ExpectedEvent` guarda mês, valor, tipo, recorrência e percentual poupado da entrada; não guarda dia, meio de pagamento, ciclo explicitamente escolhido nem grupo de compromisso. | Uma cobrança de hotel no dia 5 e outra no dia 25 são indistinguíveis. Não há consulta confiável para uma data específica. |
| `occurrencesInMonth` expande eventos únicos, mensais e anuais; a projeção começa no ciclo ativo e só aplica eventos a partir do mês seguinte. | A lista de 12 meses inclui o mês corrente, enquanto a curva patrimonial não reaplica os eventos desse mês. Os dois números respondem a janelas diferentes. |
| `projectNetWorth` parte dos ativos financeiros cadastrados e soma aporte mensal, rendimento e a parte poupada das entradas; subtrai saídas inteiras. | A curva é uma hipótese de patrimônio financeiro, não saldo bancário. Uma saída já embutida no orçamento ou na fatura pode ser descontada duas vezes. A curva também limita ativos a zero, ocultando um déficit de financiamento. |
| A prévia do próximo Ciclo soma todas as entradas esperadas e subtrai todas as saídas esperadas do mês. | É uma prévia útil, mas pode transmitir folga mesmo quando a entrada chega depois de uma obrigação. A origem e a confiança dessa folga precisam ser visíveis. |
| No Realizado, a ocorrência do ciclo ativo pode virar entrada recebida ou saída paga, vinculada pelo ID do evento; o registro guarda valor e nome, mas não data efetiva nem pagamento parcial. | Existe uma ponte entre plano e fato, porém não há conciliação por ocorrência, atraso, parcela, diferença ou data. Para recorrência, o vínculo por ID só distingue o mês pelo contêiner de realizados. |
| A lista de Futuro mostra os eventos e permite alterar o valor ou excluir; o formulário cria eventos, mas não há edição de nome, vencimento ou recorrência. | Reprogramar uma cobrança exige apagar e recriar, perdendo a identidade usada pela conciliação. |
| Metas com prazo e saldos em investimentos já existem, mas evento e meta não formam uma estratégia de custeio. | O app não responde quanto reservar mensalmente para a viagem nem se as entradas previstas cobrem cada cobrança. |

Fontes principais: `src/types/forecast.ts`, `src/lib/forecast.ts`, `src/components/ForecastView.tsx`, `src/hooks/useFinancas.ts`, `src/components/ActualCashEntries.tsx`, `src/hooks/useActuals.ts`, `src/data/backupSchemaV7.ts`.

## Modelo financeiro recomendado

1. **Plano:** evento e cada ocorrência têm valor previsto, data esperada opcional e competência financeira. Eventos legados com apenas mês continuam com precisão mensal; não inventar dia 1 ou último dia. O ciclo ativo é o padrão ao lançar um realizado, salvo escolha explícita do usuário.
2. **Fato:** pagamento ou recebimento efetivo guarda data real, valor, competência e vínculo com a ocorrência. A situação (`pendente`, `parcial`, `liquidado`, `atrasado`, `cancelado`) é derivada dos fatos e de uma decisão explícita de cancelar/adiar; não manter dois totais independentes.
3. **Caixa:** saldo bancário em uma data só pode ser projetado com saldo inicial bancário e calendário suficiente de salário, contas, fatura e aportes. O app não tem hoje essa base. A primeira entrega deve apresentar **cobertura dos compromissos** e **folga prevista por ciclo/data**, com premissas expostas, sem chamar isso de saldo disponível.
4. **Patrimônio:** rendimentos e aportes seguem a projeção patrimonial atual, identificada como hipótese. O percentual poupado de uma entrada afeta patrimônio, mas a entrada inteira pode pagar uma obrigação no caixa projetado. A mesma quantia não pode ser destinada simultaneamente a uma meta, a Desejos e a uma saída extraordinária.
5. **Origem do pagamento:** uma saída precisa indicar se é extraordinária em conta, já está em um item de Desejos/custo, ou será cobrada no cartão. Se já está no orçamento ou na fatura, mostrar o compromisso, mas não subtraí-lo de novo. Para cartão, distinguir **data da cobrança** da **competência de pagamento da fatura**; nunca contar a compra e a fatura como duas saídas de caixa.
6. **Recorrência:** identidade estável para cada ocorrência (`evento + período/data`) e exceções para adiamento, cancelamento e valor diferente. Editar a série não deve reescrever fatos já liquidados.

## Experiência sugerida

### Futuro

- Abrir com **Próximos compromissos**: primeiro vencimento, valor ainda sem cobertura, quanto separar por mês e origem considerada. Um estado “coberto” explica por quais recursos; um estado de risco aponta o primeiro déficit, não apenas o saldo líquido do ano.
- Oferecer consulta por **data ou mês**. Para data exata, mostrar eventos datados e recursos explicitamente disponíveis até aquele dia; valores de recorrência sem data aparecem como “em algum momento do mês”. Uma projeção integral de saldo bancário fica para uma etapa posterior, se houver dados de abertura e calendário de fluxos.
- Mostrar agenda cronológica agrupável por viagem/projeto, com total, cobertura acumulada, pendências e detalhe das entradas e saídas. Filtros: período, tipo, grupo e situação. Destacar alterações em uma ocorrência sem esconder a série.
- Deixar a curva patrimonial em seção própria. Um gráfico de cobertura pode mostrar recursos reservados, entradas previstas e pagamentos por mês; evitar empilhar patrimônio com fluxo mensal na mesma escala. Cada ponto deve abrir a composição; uma tabela/lista equivalente atende teclado e telas pequenas.
- Formulário com rótulos persistentes: descrição, valor, dia ou somente mês, recorrência, competência, forma de pagamento, já previsto no orçamento?, grupo e observação. Valor e data editáveis depois da criação. Não exigir associação a meta para registrar uma cobrança simples.

### Ciclo

- Inserir **Compromissos esperados deste ciclo** junto ao Realizado: previsto, vencimento, valor pago/recebido, restante, diferença e ação explícita de registrar. Um evento permanece previsto até existir fato; não altera o caixa operacional antecipadamente.
- A prévia do próximo Ciclo separa entradas confirmadas, entradas apenas esperadas e saídas futuras. Quando a folga depende de uma entrada incerta ou tardia, informar isso ao lado do número. Desejos continuam verba alocável após fatura, contas, aporte programado e extraordinários, sem serem abatidos antes de calcular o espaço para alocá-los.
- Se a cobrança estiver no cartão ou já tiver vínculo com item do plano, abrir o fluxo correspondente e reaproveitar seu valor; a ocorrência vira referência, não um segundo lançamento extraordinário.

## Cálculo de “quanto separar por mês”

Para um evento ou grupo de pagamentos, usar somente recursos **explicitamente atribuídos**: saldo já reservado, depósitos programados para esse objetivo e entradas previstas destinadas a ele. Ordenar todas as datas de entrada, depósito e saída. Calcular o menor depósito mensal constante que mantém a cobertura acumulada não negativa **antes de cada vencimento**. A maior insuficiência entre os vencimentos determina o valor necessário. Depósitos realizados depois do vencimento não o cobrem.

Apresentar dois resultados quando houver entrada futura incerta: **base sem essa entrada** e **cenário se ela chegar na data**. Comparar o depósito necessário com a folga de planejamento dos ciclos correspondentes; se não couber, mostrar mês e valor do déficit. Uma meta existente pode fornecer o saldo reservado, desde que sua inclusão em investimentos seja contada uma única vez. O cálculo não deve prometer liquidez de um ativo apenas porque ele compõe patrimônio.

## Plano de execução

### 1. Contrato e segurança dos dados

- Formalizar `Event`/`Occurrence` e vínculo com pagamentos, incluindo precisão da data, competência, destino e origem de custeio. Decidir a representação de exceções de recorrência antes de mudar telas.
- Criar uma nova versão do contrato de backup e importar v7 por migração explícita. Preservar IDs, mês, `savedPct`, vínculo `sourceEventId` e dados legados sem inventar datas, estados pagos ou meios de pagamento. Fazer teste de ida/volta e restauração de backup anterior.
- Entrega verificável: os eventos atuais continuam idênticos após importar/exportar; novos campos opcionais sobrevivem ao backup.

### 2. Motor único de ocorrências e conciliação

- Centralizar expansão, ordenação, exceções e conciliação com o Realizado. Alinhar a janela do resumo de 12 meses com a curva a partir do ciclo ativo. Tratar valor parcial, edição, adiamento e recorrência anual/mensal com identidade por ocorrência.
- Impedir dupla contagem entre evento extraordinário, item de Desejos/custo e cartão. Definir a data relevante para projeção de caixa conforme meio de pagamento.
- Entrega verificável: testes de cobrança antes da entrada, duas cobranças no mesmo mês, parcial, adiamento, cartão/fatura, orçamento já incluído e ciclo escolhido manualmente.

### 3. Cobertura e planejamento mensal

- Criar cálculo puro de cobertura cronológica e depósito mensal necessário, com decomposição por evento e premissas rastreáveis. Integrar o saldo de meta já reservado sem duplicar ativos financeiros.
- Exibir risco por prazo e folga mensal, mantendo patrimônio projetado separado. Não inferir saldo bancário de patrimônio.
- Entrega verificável: uma viagem com hotéis em datas diferentes identifica o primeiro vencimento descoberto e o depósito mínimo; mudar uma entrada posterior não cobre uma saída anterior.

### 4. Fluxos Futuro ↔ Ciclo

- Refazer cadastro/edição e agenda de Futuro; acrescentar o painel operacional de compromissos no Ciclo e registro de recebimento/pagamento pela ocorrência. Preservar Histórico como leitura dos fatos fechados.
- Revisar textos da prévia do próximo Ciclo para identificar explicitamente valores esperados e dependências.
- Entrega verificável: cadastrar, alterar, liquidar parcialmente, liquidar e adiar sem perder o vínculo nem duplicar caixa; Histórico mantém o fato registrado no fechamento.

### 5. Revisão visual e validação integrada

- Ajustar primeiro tokens e componentes compartilhados necessários; reutilizar a linguagem escura do FinTano e reservar cor de alerta para déficit ou atraso real.
- Conferir Futuro e Ciclo em 390 px e desktop, toque, teclado, foco, estados vazios e gráficos com resumo textual. Executar build, lint e testes focados de cálculo, backup e jornada.
- Entrega verificável: nenhuma rolagem horizontal da página, agenda utilizável sem hover, números de plano/realizado/projeção identificados e totais consistentes nas duas abas.

## Limite e ordem recomendada

Prioridade é **vencimento → cobertura → mensalidade necessária → execução no Ciclo**. Projeção de saldo bancário diário completo é posterior: requer saldo inicial de conta, calendário de salário, contas, fatura e aportes, além de conciliação desses fluxos. Nenhuma nova biblioteca é necessária para as etapas acima; os componentes e o gráfico existentes bastam para a primeira versão.

## Estado

- [x] Análise do modelo, fórmulas e pontos de integração existentes.
- [x] Plano de melhorias documentado.
- [x] Implementação da etapa 1: backup público v8 com importação de v7.
- [x] Implementação da etapa 2: ocorrências, exceções e conciliação com realizados e fatura.
- [x] Implementação da etapa 3: cobertura cronológica, grupos, metas de aporte e depósito mensal.
- [x] Implementação da etapa 4: eventos agrupados em Futuro, ocorrências sob cada evento, compromissos recolhidos no Ciclo e registro vinculado.
- [x] Implementação da etapa 5: componentes responsivos e validação automatizada.
- [x] Conferência de estrutura e geometria no navegador local em larguras estreita, intermediária e ampla, sem rolagem horizontal da página.
- [x] Correção da grade de registro do Ciclo: os campos de entradas e saídas mantêm rótulos legíveis e botões dentro dos cartões lado a lado.
- [ ] Conferência por captura de tela: o comando de captura do navegador expirou; a revisão de aparência por imagem segue pendente.

## Resultado e limites da revisão

O cálculo de cobertura considera recursos atribuídos a cada grupo, entrada confirmada ainda prevista e entrada apenas esperada em cenários separados. Para eventos sem dia, saídas são consideradas no começo do mês e entradas no fim. Não há saldo bancário diário completo nem garantia de liquidez de investimentos.

Valores marcados como `planned` pressupõem que o usuário já os tenha incluído no orçamento; o vínculo não seleciona um item específico de Desejos/custos. A ocorrência sob o evento os identifica e não os desconta uma segunda vez. Uma cobrança de cartão pode ser vinculada à ocorrência quando a fatura entra em Cartões; o status só vira liquidado após o pagamento da fatura.
