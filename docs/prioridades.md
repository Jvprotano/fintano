# Prioridades do FinTano

## Base V17

A aplicação existente em 06/10/2026, com referência no commit `840b974`, é a base V17. Partimos do funcionamento atual, descrito em [funcionamento](funcionamento.md), sem planejar entregas por versões anteriores. Os IDs FT são mantidos apenas para identificar as pendências já discutidas.

Critério de prioridade: primeiro corrigir registros e efeitos financeiros; depois conectar decisões e projeções; por último melhorar recursos opcionais. KISS, uso pessoal exclusivo em notebook e computador e validação proporcional ao risco continuam obrigatórios.

## Fila de execução

| Ordem | Prioridade | Itens que andam juntos | Por que executar |
| --- | --- | --- | --- |
| 1 | Alta | FT-16 — movimentos integrados | Transferência, resgate e amortização precisam produzir efeitos coerentes em caixa, patrimônio e aporte, com um único registro. |
| 2 | Alta | FT-14 + FT-15 — compras e parte pessoal | Importação conferível, total integral ao banco e despesas apenas pela parte pessoal; repasse da mãe considerado recebido antes do vencimento. |
| 3 | Alta | FT-19 + FT-20 — ocorrências e agenda | Preservar o que já foi pago/recebido e mostrar a próxima pendência correta. A agenda deve usar a mesma conciliação dos movimentos. |
| 4 | Alta | FT-23 + FT-22 — correção e leitura do Histórico | Corrigir a origem dos fatos sem criar divergência; mostrar os desvios e retirar informações do presente e resumos repetidos. |
| 5 | Média | FT-17 + FT-18 + FT-21 — saldos, destinos e projeção | Usar saldos datados e a mesma capacidade de aporte para metas e projeções, evitando prometer dinheiro em duplicidade. |
| 6 | Baixa | FT-25 — exportação para IA | Recurso opcional de análise externa; deve refletir os números reconciliados da aplicação e explicitar incertezas. |

**Ordem 5 autorizada e executada em 08/10/2026.** As ordens 1 a 5 estão concluídas. A ordem 6 continua pendente e fora desta execução. Dentro dos blocos: FT-14 antes de FT-15; FT-19 antes de FT-20; FT-23 antes de FT-22; FT-17 antes de FT-18 e FT-21. Concluir uma etapa funcional antes de abrir a seguinte, sem iniciar vários blocos ao mesmo tempo.

Um bloco agrupa partes que devem compartilhar os mesmos dados e regras. Ele pode ser entregue em etapas utilizáveis; não exige uma alteração grande de uma vez. Ajustes pontuais de um bloco posterior podem entrar antes quando forem indispensáveis ao bloco em execução; registrar o motivo.

## Escopo e conclusão de cada pendência

**Ajuste específico entregue em 07/10/2026:** agrupar metas de viagem e repartir entradas previstas por ocorrência entre elas, com necessidade sem previsões e condicional, sem duplicar saldo. Esse recorte foi integrado à revisão geral de capacidade e projeção da ordem 5, entregue em 08/10/2026.

### Alta

- [x] **FT-16 — Movimentos integrados.** Registrar origem, destino, valor, competência e data conforme a operação. Transferência cria movimentos vinculados; resgate explicita recursos que voltam à conta; amortização extra reduz dívida e caixa uma vez. Ajustar saldo por extrato não representa pagamento. Concluir quando transferir R$ 1.000 conservar patrimônio e aporte líquido, amortizar R$ 1.000 consumir caixa uma vez e desfazer reverter os efeitos relacionados. Usar os livros existentes, sem criar outro cadastro financeiro. Fontes: `Ledger.tsx`, `useInvestments.ts`, `useDebts.ts`, `investmentActuals.ts`, `currentCycleFacts.ts`.

- [x] **FT-14 — Importação conferível.** Mostrar linhas aceitas, descartes com motivo, possíveis duplicatas e diferenças da substituição, incluindo créditos e vínculos. Reconhecer totalizadores pela estrutura; uma compra chamada Total Fitness deve continuar válida. Concluir quando repetir a importação não duplicar compras silenciosamente e o usuário conseguir revisar antes de gravar. Manter colagem de planilha. Fontes: `cardImport.ts`, `CardImportPanel.tsx`, `useCreditCards.ts`.

- [x] **FT-15 — Parte pessoal do cartão.** O proprietário paga a fatura inteira; sua mãe repassa a parte dela antes do vencimento, considerada recebida sem controle de cobrança. Compra de R$ 300, com R$ 100 pessoais e R$ 200 da mãe, conserva R$ 300 ao banco e consome somente R$ 100 dos recursos pessoais. Sem valor a receber, renda extra ou efeito nos aportes. Fontes: `types/cards.ts`, `cardCycleAccounting.ts`, `CreditCardManager.tsx`, `currentCycleFacts.ts`.

- [x] **FT-19 — Ocorrências preservadas.** Editar esta ou próximas ocorrências sem reabrir as liquidadas. Adiar conserva pagamentos parciais; cancelar não apaga fatos e permite recuperação. Vincular previsão a plano, meta, cobrança ou movimento já existente para não registrar o mesmo dinheiro novamente. Concluir quando alterar um bônus futuro não mudar o recebido e uma despesa vinculada entrar uma vez no cálculo. Fontes: `useForecast.ts`, `forecast.ts`, `forecastCoverage.ts`, `ForecastCommitments.tsx`.

- [x] **FT-20 — Agenda pela pendência real.** Ordenar pela próxima ocorrência pendente conciliada, com data e restante corretos. Mostrar vencidos e parciais; manter concluídos/cancelados no detalhe e projeção sob demanda. Concluir quando efetivar uma ocorrência avançar o resumo para a próxima pendência, usando o mesmo fato do Ciclo e uma única lista principal. Fontes: `ForecastView.tsx`, `ForecastCommitments.tsx`, `useForecast.ts`.

- [x] **FT-23 — Correção do passado.** Editar em rascunho com salvar/cancelar, antes/depois e motivo. Corrigir na origem quando houver movimento; usar ajuste explícito quando só houver um agregado. Atualizar detalhes e totais relacionados sem substituir patrimônio passado pelos saldos atuais. Concluir quando cancelar não gravar, corrigir um extra não divergir da agenda e mudar competência de aporte preservar sua data e identificar os ciclos revisados. Fontes: `HistoryView.tsx`, `useHistory.ts`, `history.ts`, `useActuals.ts`.

- [x] **FT-22 — Histórico enxuto.** No mesmo bloco de FT-23, retirar patrimônio atual e resumos repetidos, priorizando diferença contra plano, origem das mudanças e detalhes consultáveis. Identificar períodos ausentes ou estimados; não chamar residual sem origem de rentabilidade. Concluir quando tabela e gráfico usarem o mesmo período e cada desvio puder ser explicado sem procurar totais em blocos concorrentes. Fontes: `HistoryView.tsx`, `HistoryTrendExplorer.tsx`, `historyTrends.ts`.

### Média

- [x] **FT-17 — Saldo com contexto.** Mostrar a data das avaliações e separar mudança de valor de aporte. Simplificar o resumo patrimonial e esclarecer o alcance dos comparadores de taxas e moradia. Concluir quando atualizar avaliação alterar saldo/rendimento sem criar aporte e o usuário souber de quando é o saldo. Não reconstruir cadastros ou avaliações que já existam. Fontes: `InvestmentsManager.tsx`, `ReserveSection.tsx`, `AssetsManager.tsx`, `DebtsManager.tsx`, `investments.ts`.

- [x] **FT-18 — Destinos dos aportes.** Usar referências estáveis para destinar posições e aporte à reserva e às metas. Comparar a soma dos aportes prometidos com a capacidade mensal; diferenciar acompanhar saldo de reservar recursos. Concluir quando duas metas de R$ 800 não parecerem financiadas por um aporte de R$ 1.000 e destinar saldo existente não aumentar patrimônio. Explicar a base da reserva. Fontes: `InvestmentPlan.tsx`, `GoalsSection.tsx`, `ReserveSection.tsx`, `goals.ts`, `scenario.ts`.

- [x] **FT-21 — Projeção consistente.** Depois dos vínculos de FT-19 e destinos de FT-18, separar base sem entradas incertas da hipótese com elas, considerar compromissos uma vez e tratar pendências do ciclo inicial. Projetar metas pelas próprias fontes, alinhar valores nominais/reais e mostrar a primeira insuficiência. Concluir quando bônus incerto não aumentar a base, dívida reduzida não inflar meta de carteira e despesas ligadas ao plano/cartão não duplicarem. Não prometer saldo bancário diário. Fontes: `forecast.ts`, `useFinancas.ts`, `ForecastView.tsx`.

### Baixa

- [ ] **FT-25 — Fotografia para IA.** Usar as mesmas consultas do Ciclo, com origem, pendências, terceiros e incertezas. Desconhecido não vira zero e plano não vira realizado. Concluir quando o texto revisado e copiado tiver os mesmos números e qualificações da aplicação; gerar o texto não envia dados automaticamente. Acompanhar alterações das fontes durante as prioridades anteriores e concluir o fluxo depois delas. Fontes: `AIAnalysisDialog.tsx`, `aiAnalysis.ts`, `App.tsx`.

## Trabalho transversal

- **FT-24 — Edição e navegação:** aplicar nas telas afetadas por cada bloco: salvar/cancelar em mudanças compostas, rascunho conservado em falha, zero distinguível de vazio, diálogos e atalhos por teclado e links que abrem o registro relacionado. Não abrir uma refatoração genérica ou um projeto visual separado.
- **FT-26 — Documentação e limpeza:** a consolidação documental da base V17 está concluída. Atualizar estes documentos conforme o funcionamento mudar. Remover código somente quando estiver comprovadamente sem uso no fluxo trabalhado, sem campanha geral de limpeza.

## Execução e validação

Antes de implementar um item, conferir no código e nos dados atuais o que já existe e qual diferença ainda precisa ser resolvida. A caixa pendente não significa ausência total da funcionalidade. Registrar o que mudou, a jornada curta conferida e seus limites, marcando o item somente quando o resultado financeiro estiver coerente.

Usar dados sintéticos ou cópia isolada quando houver alteração financeira. Conferir apenas a jornada e persistência afetadas. Não perseguir cobertura de testes; criar ou executar testes somente diante de risco concreto. Build e outras verificações entram quando necessários à integração. Conferir telas em notebook e computador, com mouse e teclado.

## Registro a partir da V17

| Data | Trabalho | Resultado |
| --- | --- | --- |
| 06/10/2026 | Base V17 e FT-26 documental | Fila priorizada registrada; funcionamento e contrato de dados consolidados; planos, diagnósticos e registros de entregas anteriores removidos. Funcionalidades pendentes continuam sem execução nesta organização. |
| 06/10/2026 | Ordem 1 — FT-16 | Movimento único para aportes, resgates, transferências entre posições/metas e amortizações. Origem/destino, ciclo e data preservados; reversão vinculada e parcela já paga sem segunda saída. |
| 06/10/2026 | Ordem 2 — FT-14 + FT-15 | Colagem com revisão, descartes, duplicatas e diferenças; identidade conservada nas compras reconhecidas. Adiantamentos e devoluções parciais vinculados à compra, com caixa separado de renda e rateios sem definição explícitos. |
| 07/10/2026 | Ordem 3 — FT-19 + FT-20 | Edição desta ou próximas pendências, preservação das liquidadas e dos parciais adiados; cancelamento reversível. Vínculos com plano, compra ou movimento existente; agenda pelo restante conciliado, com concluídas/canceladas e projeção recolhidas. |
| 07/10/2026 | Ordem 4 — FT-23 + FT-22 | Correção em rascunho com salvar/cancelar, motivo e antes/depois; extras, custos e Desejos detalhados corrigidos na origem. Competência move as partes vinculadas, preserva data e patrimônio passado e identifica os ciclos revisados. Histórico concentra desvios na tabela, com detalhes e evolução sob demanda, período único e lacunas explícitas. |
| 07/10/2026 | Metas de viagem e entradas previstas — recorte de FT-18/FT-21 | Agrupamento de metas e divisão explícita de cada entrada por ocorrência, com sugestão proporcional em centavos. Base sem entradas e necessidade condicional separadas; parcial, cancelamento e prazo reconciliados. Backup v9 conserva grupos e destinações, sem criar aporte ou patrimônio. A fila geral continua pausada. |
| 07/10/2026 | Ajustes pontuais de Cartões e Futuro | Novas compras manuais com Desejos selecionado por padrão, inclusive após salvar. Faturas dos cartões e Entradas e saídas esperadas recolhíveis, com preferência guardada no navegador. A fila geral continua pausada. |
| 08/10/2026 | Ordem 5 — FT-17 + FT-18 + FT-21 | Avaliações datadas com salvar/cancelar, variação separada de aporte e resumo patrimonial enxuto. Destinos estáveis do aporte direto, limitados pela capacidade e sem criar ativos. Reserva pela base classificada e pela destinação explícita. Projeção-base e hipótese de entradas, com pendências iniciais, metas pelas próprias fontes, unidades coerentes e primeira insuficiência. |

Validação das ordens 1 e 2: duas jornadas sintéticas focadas em movimentos, importação e terceiros, incluindo reversão, fechamento e ida/volta de backup; build e lint dos arquivos alterados. Revisão da interface no navegador, sem registrar operações nos dados pessoais. A revisão geral do Histórico e da projeção continua nos blocos posteriores; os ajustes de caixa dos movimentos entregues entraram aqui por serem necessários à sua reversão.

Validação da ordem 3: jornadas sintéticas de revisão de série, adiamento parcial, cancelamento/reativação e realização pelo Ciclo; vínculos com custo, extra, movimento patrimonial e compra/fatura paga; ida e volta de backup com referências e centavos. Build, lint dos arquivos alterados e conferência da agenda, rascunho e projeção no navegador. Nenhuma operação financeira foi registrada nos dados pessoais. A correção geral dos ciclos fechados e a revisão das premissas da projeção permanecem nas ordens 4 e 5.

A suíte geral foi reconciliada com os contratos atuais de contas fora do cartão, envelope explícito, cartões com identidade/calendário próprios e fechamento com realizados confirmados. Ao pagar uma fatura, a recorrência agora gera também a próxima ocorrência do cartão pago. As 16 falhas antigas foram resolvidas sem ignorar casos. Validação integrada de 07/10/2026: 414 testes aprovados, 3 ignorados já existentes; build e lint geral aprovados.

Validação da ordem 4: jornadas sintéticas de correção de extra/folha/custo com conciliação da agenda e do caixa; troca de competência de aporte e amortização vinculada; agregado de Desejos, contrapartida desconhecida e zero explícito; conflito de revisão, vazio e recusa de gravação sem alterações parciais; ida e volta de backup com detalhes e registros de correção. Build, lint dos arquivos alterados e revisão no navegador em 1366 × 768 e 1920 × 1080, com dados fictícios em origem isolada: cancelar, salvar e trocar competência por teclado. A tabela e o gráfico usam o mesmo período de calendário, sem interpolar meses ausentes. Faturas pagas preservam sua composição e pagamento; não permitem substituir o total isoladamente. Nenhuma operação foi gravada nos dados pessoais. Ordens 5 e 6 permanecem pausadas.

Validação do ajuste de metas: cinco casos focados aprovados para divisão, realização, revisão e backup. Cópia isolada do backup fornecido conferida sem alterar os bytes originais; grupos e centavos conservados na ida e volta. Interface conferida em 1366 × 768 e 1920 × 1080 com dados fictícios, incluindo sugestão, limite da verba, salvar e cancelamento por Escape. Build e lint dos arquivos alterados aprovados. O ajuste não realiza conversão de moeda nem registra operações nos dados pessoais.

Ajuste específico autorizado em 07/10/2026 — previdência em folha e empresa: confirmação de novas folhas integrada às posições, sem duplicar caixa/aporte pessoal; origem pessoal e empresarial preservada, composição atual por extrato e carência explícita. Folhas antigas não são relançadas. A parcela condicionada não financia metas nem saídas. Esta entrega não retoma os demais itens da ordem 5.

Ajuste solicitado em 07/10/2026 — FT-15: removido o controle de cobranças e recebimentos de terceiros. A mãe repassa sua parte antes do vencimento, considerada coberta sem registro adicional. A fatura preserva o total ao banco; Ciclo, verba, prévia e novos fechamentos usam apenas a parte pessoal, sem adiantamento ou renda extra. Registros antigos permanecem no backup por compatibilidade, sem efeito nos cálculos atuais. A prévia identifica Minha parte da fatura. A fila geral permanece pausada.

Validação da remoção de cobranças: duas jornadas focadas aprovadas para importação/edição, pagamento, fechamento conjunto e backup, incluindo registros antigos sem efeito nos recursos atuais. Cópia isolada do backup fornecido confirmou R$ 5.404,60 em custos + aporte-base, R$ 579,93 para alocar e R$ 79,93 após os Desejos, conservando compras de origem, totais por fatura e os bytes do arquivo original. Cartões conferido em DOM isolado, sem painel ou ações de recebimento. Build e diff aprovados; lint dos arquivos alterados interrompido após alguns minutos sem progresso. Navegador integrado indisponível por timeout, deixando a revisão visual pendente. Nenhuma operação foi gravada nos dados pessoais.

Ajuste autorizado em 07/10/2026 — Cartões por ciclo: consulta Este ciclo/Próximo ciclo fixa por competência, com parcelas pagas preservadas e sem edição comum; compras novas no cartão pago vão para o próximo. Fechamento confirma as pendentes de todos os cartões, incluindo anteriores conhecidas e pulando pagamentos preservados. Cadastro exige só o nome; calendário opcional e correção excepcional recolhida. A fila geral permanece pausada.

Validação de Cartões por ciclo: sete jornadas e 34 casos de cartões aprovados após integrar a main para pagamento individual/conjunto, próxima parcela, nova compra após pagamento, crédito excedente entre faturas, proteção de importação e revisão desatualizada, backup e reabertura. Build e lint geral aprovados. A jornada de controles foi conferida com dados sintéticos em DOM isolado; o navegador integrado deu timeout, deixando a revisão visual pendente. Nenhuma operação foi registrada nos dados pessoais.

Validação da previdência: sete jornadas sintéticas para confirmação/reconfirmação, correção/reversão, saldo e folha antigos, divisão em centavos entre posições, carência/liberação/resgate e reversão, correção histórica, backup e recusa de gravação. Interface conferida em 1366 × 768 com dados fictícios em origem isolada: confirmação e reconfirmação sem duplicar, divisão por extrato e liberação por teclado. Nenhuma operação foi registrada nos dados pessoais. A adequação dos casos antigos e a correção pontual da recorrência foram necessárias para entregar o CI solicitado; não retomam a fila geral.

Validação da ordem 5: nove jornadas sintéticas para avaliação sem aporte, vazio/zero, cancelar, conflito e extrato anterior aos movimentos; promessas acima da capacidade, divisão em centavos e backup de destinos e datas de posições/bens/dívidas; base sem bônus, parcial ainda esperado, indicadores pelas fontes e dívida sem inflar carteira; pendências iniciais, aporte já realizado, inclusive em competência futura, plano/cartão sem repetição, carência e primeira insuficiência; base classificada da reserva e reinversão de parcelas sem exceder capacidade ou repetir sobras. Os formulários de avaliação e destinos foram conferidos em DOM isolado, incluindo Escape e preservação do rascunho após recusa. 120 casos focados aprovados, build e lint dos arquivos alterados aprovados; diff conferido. O build mantém o aviso de tamanho de bundle. O navegador integrado deu timeout: a revisão visual em notebook/computador permanece pendente. Nenhuma operação foi registrada nos dados pessoais; o backup público permanece v9. Ordem 6 não iniciada.
