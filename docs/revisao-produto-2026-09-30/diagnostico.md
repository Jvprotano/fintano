# Diagnóstico de produto e funcionamento

## Conclusão

O FinTano já modela boa parte da vida financeira: orçamento, cartões, realizados, reserva, investimentos, metas, bens, dívidas, eventos futuros e fechamentos. O problema principal é que as fronteiras entre esses módulos ainda dependem de interpretação e de lançamentos manuais independentes.

Isso produz três custos: números com aparência de fato que contêm estimativas; ações que alteram uma parte da realidade sem atualizar a outra; telas com vários resumos antes da ação que realmente importa. Trocar a paleta ou acrescentar indicadores não resolveria essas causas.

A recomendação é manter as seis áreas de responsabilidade, reorganizar profundamente seus conteúdos e corrigir o modelo subjacente em entregas pequenas. Preservar a linguagem escura e os componentes compartilhados. Não há justificativa demonstrada para trocar React, adicionar backend ou introduzir uma biblioteca de estado nesta etapa.

## O que funciona e deve permanecer

- Competência financeira separada da data real, com fechamento operacional em Ciclo.
- Cartão distingue parte pessoal, terceiros, parcelas, assinaturas, antecipações e créditos. Pagamento avulso e recompensa já têm tratamentos de caixa diferentes.
- Previdência distingue esforço pessoal e contrapartida da empresa; a dedução em folha não deve sair novamente da conta.
- Reserva é investimento com finalidade própria; metas podem destinar posições existentes sem duplicar patrimônio.
- Bens e dívidas compõem o patrimônio líquido; marcação a mercado é diferente de aporte.
- Eventos possuem ocorrência identificada, pagamentos parciais e vínculos com realizados/cartão.
- Cálculos concentrados em `src/lib`, backup público versionado, validação de referências e restauração com cópia de segurança.
- Tokens, formulários e painéis compartilhados já oferecem uma base visual coerente.

Esses recursos precisam de integração e acabamento. Não são funcionalidades a reconstruir do zero.

## Critério das evidências

**Reproduzido:** comportamento observado em reprodução isolada ou na interface. **Código:** caminho identificado na implementação, sem afirmar que causou dano na base pessoal. **Produto:** decisão recomendada a partir da utilidade do fluxo. Prioridade P0 é integridade; P1 afeta decisão ou operação cotidiana; P2 é refinamento ou capacidade posterior.

## Achados prioritários

| ID | Prioridade e evidência | Problema e consequência | Referência | Tarefas |
| --- | --- | --- | --- | --- |
| D01 | P0 · reproduzido | Documento persistido inválido é tratado como ausência. A inicialização pode substituí-lo por coleções vazias, eliminando a possibilidade de recuperação do original. | `src/data/repository.ts:45`, `:132`; `src/main.tsx` | FT-01 |
| D02 | P0 · reproduzido | Pagamento salva snapshot, gira lançamentos e avança configuração em escritas separadas. Falha na primeira não impede as seguintes. A fatura pode desaparecer sem pagamento preservado. | `src/hooks/useCreditCards.ts:269` | FT-02 |
| D03 | P0 · código | Fechamento preenche realizados, grava snapshot, avança ciclo e pode pagar fatura em ações separadas. O aviso de fatura desconhecida não impede “Fechar apenas o ciclo”. | `src/components/ClosingView.tsx:110`, `:496`; `src/hooks/useFinancas.ts:355` | FT-02, FT-11 |
| D04 | P0 · reproduzido | Excluir posição elimina seu livro-razão. Como aportes históricos são recalculados pelas posições atuais, meses antigos perdem seus aportes. Metas com livro-razão próprio têm risco análogo. | `src/hooks/useInvestments.ts:250`, `:611`; `src/lib/history.ts`, `projectHistoryInvestments` | FT-03 |
| D05 | P0 · reproduzido | O tipo de movimentação depende da observação. O backup possui `kind`, mas a importação o descarta; um saldo inicial com observação personalizada pode voltar como aporte na próxima exportação. | `src/lib/investmentActuals.ts:30`; `src/data/backupV7.ts:131`, `:165`; `src/types/core.ts` | FT-04, FT-05 |
| D06 | P1 · reproduzido e interface | Custo/Desejo sem valor informado usa o plano. Esse `effective` entra em campos chamados “actual”, “efetivamente destinados” e no texto enviado à IA. Salário e previdência também derivam do cenário, sem ocorrência recebida/confirmada. | `src/lib/actuals.ts:58`; `src/hooks/useFinancas.ts:121`, `:172`; `src/components/AIAnalysisDialog.tsx` | FT-07, FT-08, FT-25 |
| D07 | P1 · reproduzido | “Disponível para Desejos” desconta aporte realizado, não o compromisso de aporte ainda a executar. O dinheiro destinado ao aporte pode parecer disponível para gastar. | `src/hooks/useFinancas.ts:220`; `src/lib/financialCycle.ts` | FT-08 |
| D08 | P0/P1 · reproduzido e código | Realizados são globais por mês, mas sua leitura percorre apenas os itens do cenário selecionado. Excluir um custo faz seu realizado desaparecer dos totais; salvar Desejos filtra IDs que não estão no cenário atual. Simulação pode esconder ou remover fatos. | `src/hooks/useActuals.ts:49`, `:85`, `:104`; `src/lib/actuals.ts`; `src/hooks/useScenarios.ts` | FT-03, FT-06 |
| D09 | P1 · código | “Plano · competência ativa” edita um cenário reutilizado em todos os meses. Planos por ciclo existem no backup como totais derivados, mas não como fonte editável independente em execução. A prévia seguinte reutiliza custos efetivos do ciclo atual. | `src/hooks/useScenarios.ts`; `src/data/backupV7.ts:408`; `src/hooks/useFinancas.ts:236` | FT-06, FT-09 |
| D10 | P1 · reproduzido e código | Configuração inicial do cartão usa `05/07`, mesmo ao iniciar em outro mês. Há hooks de cadastro de cartões, mas nenhum componente chama `addAccount`/`updateAccount`; a tela alerta sobre divergência sem oferecer configuração correspondente. | `src/hooks/useCreditCards.ts`, `DEFAULT_SETTINGS`; `src/lib/creditCards.ts:58`; `src/components/CreditCardManager.tsx` | FT-12 |
| D11 | P1 · código | Cartões têm cadastros, mas lançamentos usam nome e apenas os buckets globais `current`/`next`. Pagar gira todos os cartões; não há pagamento independente por fatura. Snapshots são limitados aos últimos 24. | `src/types/cards.ts`; `src/hooks/useCreditCards.ts:269`, `:281`; `src/lib/cardCycleAccounting.ts` | FT-13 |
| D12 | P1 · reproduzido e código | Importação elimina descrição contendo “total”, inclusive “Total Fitness”. Mostra contagem, mas não a comparação das linhas que entram/saem; append não possui deduplicação explícita e replace substitui o bucket. | `src/lib/cardImport.ts`, `parseSpreadsheet`; `src/components/cards/CardImportPanel.tsx`; `useCreditCards` | FT-14 |
| D13 | P1 · código | “Custos em conta” também renderiza custos de cartão editáveis; o fechamento de custos usa esses valores, enquanto a fatura fornece outro realizado. Planejar/Desejos lê o bucket atual do cartão, e Ciclo lê a competência ativa. Podem comparar meses diferentes. | `src/components/ActualsPanel.tsx:320`; `src/components/WantsManager.tsx`; `src/hooks/useFinancas.ts` | FT-07, FT-13 |
| D14 | P1 · código | Amortizar uma dívida reduz seu saldo e aumenta o patrimônio líquido, mas não registra saída do caixa nem competência explícita. O usuário precisa fazer um segundo lançamento e evitar duplicá-lo com a parcela recorrente. | `src/hooks/useDebts.ts:76`; `src/hooks/useFinancas.ts` | FT-16 |
| D15 | P1 · código e produto | Abertura de posição não pergunta se é saldo anterior ou aporte de hoje; o texto “Valor aplicado hoje” resulta em “Aporte inicial”, excluído do realizado. Não há transferência vinculada entre posições; avaliações não têm data própria na operação. | `src/components/InvestmentsManager.tsx`, `NewPositionForm`; `src/hooks/useInvestments.ts:166`, `:343` | FT-04, FT-16, FT-17 |
| D16 | P1 · reproduzido e código | Mudar o valor da série altera o previsto de ocorrências já liquidadas e pode reabri-las. Excluir evento remove a previsão mesmo com fatos vinculados; canceladas desaparecem sem controle visível de recuperação. | `src/components/ForecastView.tsx`, `EventForm`/`EventRow`; `src/hooks/useForecast.ts`; `src/lib/forecast.ts` | FT-19 |
| D17 | P1 · código e interface | Resumo do evento usa o valor da série e a primeira ocorrência do calendário, sem conciliar pagamentos; uma ocorrência ajustada ou já recebida pode ter resumo enganoso. Lista ordena mês inicial da série, não próxima pendência. | `src/components/ForecastView.tsx`, `EventRow`; `src/hooks/useForecast.ts` | FT-20 |
| D18 | P1 · código | Projeção mensal não distingue entradas confirmadas e incertas; eventos `planned`/`card` são excluídos do impacto sem vínculo obrigatório com um item financiador. Não contempla pendências do ciclo de partida. | `src/lib/forecast.ts`, `toOccurrence`/`projectNetWorth`; `src/hooks/useFinancas.ts` | FT-09, FT-19, FT-21 |
| D19 | P1/P2 · código | Meta que acompanha investimentos recebe a variação do financeiro total, que também inclui reserva e efeito das dívidas. Em “reais de hoje”, gráfico de balanço mistura dívidas nominais com outras séries deflacionadas, embora haja explicação textual. | `src/components/ForecastView.tsx`, `goalOutlook` e `series` | FT-18, FT-21 |
| D20 | P1 · código | Correção histórica escreve totais imediatamente; categorias, movimentos de origem e caixa congelado podem continuar diferentes. Alterar extras com várias origens os substitui por “Ajuste manual”. | `src/hooks/useHistory.ts`, `updateSnapshot`; `src/components/HistoryView.tsx` | FT-23 |

## Análise por aba

### Ciclo — “Quanto ainda posso destinar e o que falta resolver?”

**Hoje:** reúne visão do ciclo, prévia seguinte, extras, Desejos, custos e fechamento. A composição do número principal é consultável e já existe tratamento visual para fatura desconhecida. Contudo, o início pode apresentar quatro números do ciclo, quatro da prévia e cinco do fechamento, além de formulários permanentemente abertos.

**Melhoria:** abrir com uma única decisão, “Verba para Desejos neste ciclo”, identificada como planejamento disponível após compromissos. Mostrar quanto já foi destinado e o restante; a composição abre sob demanda. Aporte pendente, contas pendentes e qualidade dos dados precisam afetar essa leitura. Não chamar esse valor de saldo bancário.

Na sequência, mostrar apenas pendências existentes: salário a confirmar, fatura a conferir, conta sem realizado, evento vencido ou aporte a registrar. Cada linha leva à ação específica. A prévia seguinte fica recolhida, mas acessível. Fechamento abre uma revisão própria com o que está confirmado, estimado e ausente.

**Falta:** renda realizada, distinção entre pago e ainda comprometido, fechamento confiável e atalho direto para aportar. Permitir operar um ciclo sem salário recorrente quando houver extras ou recursos informados; o estado vazio atual depende de `availableForBudget` e pode esconder essas operações.

### Planejar — “Como distribuir a renda e qual alternativa cabe?”

**Hoje:** configura renda, folha, custos, Desejos, modelo percentual e divisão do aporte. Os componentes permitem muitos ajustes, mas o orçamento final não ganha uma síntese equivalente. Percentuais de referência ocupam o lugar da restrição real: a renda e os compromissos daquele ciclo.

**Melhoria:** iniciar com uma equação editável: renda prevista → compromissos → aporte escolhido → verba discricionária → alocação. Modelo 50/30/20 e variantes ficam em configuração opcional; não tratar desvio da proporção como problema por si só.

Separar **plano do ciclo** de **modelo recorrente**. Uma simulação tem ação explícita “Aplicar ao ciclo”; explorar outro cenário não muda a interpretação dos fatos. A comparação deve mostrar diferenças de dinheiro e prazo, não duplicar todos os campos.

**Falta:** aporte em valor escolhido diretamente, planos futuros próprios e conexão entre destinos do aporte e posições/metas. A diversificação atual usa nomes/IDs diferentes do cadastro de classes patrimoniais. O envelope Cartão também depende do nome (`Cartão`, `Cartões` etc.); sua função precisa ser explícita no modelo, não descoberta pela grafia.

### Cartões — “O que devo pagar, o que é meu e quanto já comprometi?”

**Hoje:** bom núcleo de lançamentos, busca, parcelas, recorrência, área, parte pessoal e abatimentos. A planilha é um meio de entrada valioso. A fragilidade é o calendário global e a relação frouxa entre nomes de cartão, fatura e competência.

**Melhoria:** escolher uma fatura identificada por cartão e vencimento, com opção de ver o total consolidado. Dar destaque a total devido, parte pessoal e parte de terceiros. Teto pessoal é orçamento; renomear “limite disponível” quando o cálculo não representa o limite bancário contratado e ocupado por todas as parcelas.

O formulário principal pede descrição, valor e cartão/fatura. Parcelamento, rateio, crédito e vínculo com evento aparecem conforme necessidade. Importação deve antecipar diferenças, erros e possíveis duplicatas antes de aplicar. Pagamento é registro de um fato e não precisa apagar os lançamentos para abrir a próxima fatura.

**Falta:** cadastro acessível de cartões, calendário inicial correto, pagamento independente e histórico de fatura. Para compras de terceiros, diferenciar obrigação pessoal de dinheiro adiantado: “não é meu” não significa “já recebi de volta”. Um registro opcional de reembolso deve quitar esse adiantamento sem virar renda nova.

Não adicionar importação bancária automática nesta etapa. Melhorar a colagem existente resolve um trabalho concreto sem custo de integração.

### Patrimônio — “Onde está o dinheiro, para que serve e o que falta aportar?”

**Hoje:** possui visão geral, posições, reserva, bens, dívidas e metas. A distinção entre classe e finalidade é correta. Dois gráficos de composição, resumo superior, equação patrimonial e painel de folha podem repetir informações antes da operação.

**Melhoria:** priorizar posições e seus destinos, valor atualizado, reserva e compromissos com metas. Uma composição visual pode permanecer quando ajudar; distribuição por instituição vira detalhe, especialmente quando só existe uma instituição. Bens e dívidas ficam acessíveis na mesma área, sem dominar a leitura do dinheiro utilizável.

A falta de instituição é uma incompletude cadastral, não deve competir com déficit real ou aporte atrasado. “Carteira sem destino específico” descreve finalidade e não garante resgate imediato; previdência não pode parecer dinheiro livre só porque não está associada a meta.

**Falta:** movimentação com origem e destino, abertura versus aporte, amortização integrada, data de avaliação e arquivamento de posições. A meta de reserva deve explicar quais gastos cobre e quais meses entraram na média; hoje usa `point.costs`, não uma cesta explícita de despesas essenciais. Aportes planejados para várias metas precisam caber no mesmo orçamento, sem somar novamente a parcela da carteira usada por elas.

Os simuladores de amortizar/investir e morar/alugar são simplificados. `comparePayoffVsInvest` aplica taxas anuais sobre o mesmo valor, sem reproduzir contrato/prazo/saldo amortizado; `housingComparison` considera juros menos valorização esperada, sem outros custos ou custo de oportunidade. Mantê-los como comparação parcial de premissas, em detalhes, sem rótulo de decisão completa. Não expandir esses simuladores antes das movimentações básicas.

### Histórico — “O que mudou e o que devo ajustar no próximo ciclo?”

**Hoje:** tem comparativo do último fechamento, mudanças por categoria, aportes, gráfico configurável e tabela. Isso permite análise útil. O painel “Patrimônio hoje” pertence a outra pergunta, e os aportes aparecem em vários blocos.

**Melhoria:** escolher período e mostrar os desvios que mais explicam a diferença contra o plano, com origem consultável. Uma única exploração visual e a lista de fechamentos bastam. Remover o patrimônio atual desta aba; usar comparação entre marcas históricas.

**Falta:** revisão histórica com antes/depois, motivo e sincronização das fontes; identificação de valores estimados; meses ausentes visíveis. A variação patrimonial deve separar o que é explicado por aportes e mudanças de dívida do residual de avaliações/ajustes. Esse residual não deve ser chamado automaticamente de rentabilidade.

“Melhor mês” e médias sem indicar cobertura dos dados são secundários. Não criar pontuação de saúde financeira, ranking ou celebração sem consequência operacional.

### Futuro — “O que vem primeiro e quanto preciso preparar?”

**Hoje:** abre com projeção patrimonial, parâmetros, gráfico e metas. Eventos ficam abaixo. A alteração local recente removeu grupos e cobertura duplicada; isso está alinhado ao princípio de simplicidade e deve ser preservado.

**Melhoria:** eventos primeiro, ordenados pela próxima ocorrência pendente, com restante e data. Vencidos continuam visíveis; histórico e regras da série ficam no detalhe do próprio evento. Uma única lista atende a agenda — não criar um segundo painel com os mesmos eventos.

Metas continuam concentrando dinheiro reservado para objetivos. Um evento pode apontar para meta ou item do plano já existente. O vínculo deve explicar por que não haverá nova dedução. Não reintroduzir grupos de cobertura nem um segundo saldo reservado.

Projeção patrimonial fica como seção recolhida, com hipótese base e inclusão opcional de entradas incertas. A primeira insuficiência e a alteração necessária no aporte ajudam mais que um número distante destacado. Data de compromisso e liquidez importam, mas a aplicação ainda não possui saldo inicial de conta e calendário suficiente para prometer saldo bancário diário.

**Falta:** preservar ocorrências liquidadas, aplicar mudanças somente ao futuro, recuperar cancelamentos, refletir ajustes no resumo e vincular planejamento a fatos. Priorizar os compromissos e metas que existem, sem inventar reservas, taxas ou datas.

## Fluxos transversais

### Dados e recuperação

O documento único melhorou a persistência, mas atomicidade de uma escrita não equivale a atomicidade de uma operação com várias escritas. Fechamento, pagamento e alterações relacionadas precisam de uma única transação de domínio.

Backups automáticos são locais, semanais e limitados a três. Protegem alguns erros de operação, não a perda do perfil do navegador. Informar discretamente a última exportação externa e oferecer cópia em momentos relevantes; não abrir lembretes incessantes. Importação precisa apresentar os avisos em detalhe, não só sua quantidade.

O backup possui estruturas mais ricas que o runtime: avaliações são reduzidas ao último valor; planos mensais são reconstruídos por totais. Essa diferença merece uma matriz explícita de preservação. Não anunciar ida e volta sem perdas para campos descartados pela conversão.

### Interação e edição

Há boa infraestrutura compartilhada, mas a experiência alterna gravação por tecla, por blur e por botão. `CurrencyInput` exibe zero como vazio, o que dificulta distinguir “zero informado” de “não informado” em realizados. Alguns campos operacionais não têm rótulo próprio.

Edições compostas, correções e importações devem ter rascunho, salvar/cancelar e confirmação de sucesso. Ajuste simples pode continuar imediato se for claramente reversível. Quando salvar falhar, preservar o formulário; hoje callbacks frequentemente ignoram o booleano do repositório e limpam o rascunho.

Diálogos restauram foco e aceitam Escape, mas não contêm o foco de Tab. Menus e atalhos não tratam todos os contextos de edição. Gráfico próprio em `ui.tsx` depende de mouse para consultar pontos. São lacunas de interação a corrigir junto às telas, sem redesenho ornamental.

### Análise externa por IA

O fluxo permite revisar um texto antes de copiar/abrir serviço externo, uma boa escolha para uso pessoal. A fotografia, porém, herda os problemas de “efetivo”, pode omitir confiabilidade de fatura e não expõe adequadamente as entradas incertas da prévia. A função converte números não finitos em zero.

O produto deve fornecer à IA a mesma leitura reconciliada mostrada ao usuário, com origem e desconhecidos explícitos. Levar esse atalho para “Mais opções” reduz protagonismo sem remover a funcionalidade. A aplicação não precisa de um chat interno ou assinatura de API para resolver os problemas encontrados.

## O que deliberadamente não entra agora

- Mais abas, dashboard paralelo, índice de saúde ou indicadores sem ação associada.
- Backend, autenticação, sincronização em nuvem, Open Finance ou cotações em tempo real.
- Reconstrução total da stack, troca de biblioteca visual ou refatoração genérica por tamanho de arquivo.
- Grupos de reserva em Futuro, já retirados do produto.
- Contabilidade bancária diária completa antes de existir necessidade e dados suficientes.
- Simuladores completos de crédito/imóveis enquanto lançamentos e caixa ainda exigirem trabalho duplicado.

## Evidência obtida e limites

Leitura do código cobriu todas as abas e os domínios de cálculo, hooks, tipos, conversores e persistência. No navegador foram lidas as seis abas e as subáreas de reserva, bens e dívidas; os demais detalhes foram analisados no código. Não foram executados pagamentos, exclusões ou correções na base pessoal para demonstrar os problemas.

Antes da orientação para parar testes: a suíte existente terminou com **353 testes aprovados e 3 ignorados**, estes dependentes de caminhos de backups externos. Build de produção concluído. Nove reproduções isoladas confirmaram D01, D02, D04, D05, D06/D08, D07, D10, D12 e D16. Essas reproduções caracterizavam o comportamento atual; passar não significa corrigir os defeitos. O arquivo temporário foi removido.

A primeira tentativa das reproduções expirou ao iniciar worker; a execução com um worker de threads concluiu. Uma referência incorreta ao formato do backup no próprio script foi corrigida antes da execução final. Não houve mudança funcional no aplicativo.

Captura de tela expirou por perda da conexão de depuração do navegador. Não há aprovação visual por imagens. Essa investigação foi encerrada conforme pedido. Não foram usados esses limites para adiar o diagnóstico ou a entrega do plano.
