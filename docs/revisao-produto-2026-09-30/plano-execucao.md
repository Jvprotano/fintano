# Plano de execução

## Resultado esperado

O FinTano deve permitir planejar um ciclo, executar seus movimentos e entender o resultado sem digitar o mesmo fato em dois módulos. Cada número precisa indicar se representa plano, fato, compromisso restante ou projeção. O usuário deve conseguir abrir sua composição e chegar ao registro que o explica.

O trabalho é uma evolução do produto existente. As seis abas continuam como áreas de responsabilidade; conteúdo, hierarquia e fluxos podem ser reconstruídos conforme este plano.

## Decisões de produto

1. **Ciclo é a entrada operacional.** Responde quanto pode ser destinado e o que falta resolver. Fechamento permanece aqui.
2. **Planejar possui plano mensal e modelo recorrente distintos.** Simulações só afetam o plano operacional por uma ação explícita de aplicação.
3. **Cartão é meio de pagamento.** O item do orçamento explica a finalidade, a compra explica o gasto e o pagamento da fatura explica o caixa. As três leituras não se somam.
4. **Patrimônio registra onde o dinheiro está.** Metas atribuem finalidade a esse dinheiro e ao aporte planejado. Uma reserva virtual não cria um segundo ativo.
5. **Histórico explica ciclos encerrados.** Correções são explícitas; consultas ao passado não trocam silenciosamente a competência operacional.
6. **Futuro começa pelas ocorrências pendentes.** Metas cuidam de acumulação; projeção patrimonial é uma hipótese consultável. Os grupos retirados da interface não voltam.
7. **Simplicidade é reduzir decisões e digitação.** Um campo só entra se mudar cálculo, decisão, reconciliação ou rastreabilidade necessária. Observação, instituição e classificação complementar podem continuar opcionais.

## Contratos financeiros a fixar antes de redesenhar

### 1. Estado de um valor

Usar conceitos explícitos no domínio: não informado, previsto, confirmado pelo usuário, pago/recebido, cancelado. Não é preciso exibir todos como etiquetas em todas as telas. O importante é o cálculo conservar a diferença.

- `null`/ausente significa desconhecido; zero informado é fato.
- Estimativa pode completar uma leitura de planejamento, mas não preencher `actual` nem virar fato por fechamento automático.
- “Confirmar como no plano” é uma ação rápida válida; registra a confirmação, origem e competência.
- Renda recorrente pode ser confirmada em um clique. Sem confirmação, continua identificada como estimativa.
- Fatura sem dados não equivale a fatura de zero. O usuário pode confirmar explicitamente que não há valor devido.

### 2. Verba discricionária e caixa

Separar duas consultas, com nomes diferentes:

**Verba para Desejos do ciclo** = recursos considerados para financiar o ciclo − fatura anterior − contas do ciclo − compromisso de aporte − extraordinários que esse recurso precisa cobrir.

**Fluxo registrado** = entradas efetivas − saídas efetivas. Sem saldo de abertura, não equivale ao saldo da conta bancária.

Na primeira consulta, para cada compromisso, considerar o que já foi pago mais o que ainda falta pagar, sem duplicar sua previsão. O compromisso de aporte é o aporte feito mais o restante do plano ainda vigente. Se a meta for reduzida abaixo do já executado, o dinheiro aplicado continua consumido; reduzir uma meta não estorna um aporte.

Exemplo sintético: renda de R$ 5.000, fatura anterior de R$ 1.000, contas de R$ 2.000 e aporte programado de R$ 1.000 resultam em R$ 1.000 para Desejos, mesmo antes de aportar. Fazer R$ 400 do aporte troca R$ 400 de pendente por realizado e mantém a verba. Fazer R$ 1.200 consome os R$ 200 excedentes.

Desejos já destinados são mostrados depois dessa conta para informar o que resta alocar. Não subtrair o plano de Desejos antes de calcular a verba para eles. Não descontar simultaneamente fatura e os detalhes de compras que já a compõem.

Resgates precisam de origem explícita. Um resgate aumenta recursos em conta, mas não é nova renda nem deve aparecer automaticamente como “aporte negativo que libera mais Desejos”. Transferência entre posições não altera renda, despesa ou aporte líquido pessoal.

Valores que dependem de renda não confirmada ou obrigação desconhecida exibem essa condição junto ao resultado. Base sem entradas incertas e hipótese com elas são consultas distintas.

### 3. Fato independente do cadastro

Um lançamento conserva sua identidade, competência, data real, tipo, valor e origem mesmo quando o cadastro que o originou é renomeado ou arquivado. O histórico não depende da existência de um item no cenário selecionado.

Preferir tipos explícitos de movimento e referências estáveis a inferências por observação, nome do cartão ou nome do envelope. Congelar nome/contexto mínimo quando necessário para explicar fatos antigos. Arquivar entidades com fatos; excluir fisicamente apenas registros sem dependências ou mediante uma correção explícita com efeito conhecido.

O tipo de saldo inicial precisa sobreviver ao backup sem depender da frase “Saldo inicial”. No cadastro de posição, oferecer “Saldo que já existia” e “Aporte deste ciclo”. Somente o segundo consome caixa do ciclo.

### 4. Operação indivisível

Adicionar um comando de domínio que receba o documento mais recente, valide invariantes, produza o próximo documento e o grave uma vez. Usá-lo para pagamento de fatura, fechamento, transferência, amortização vinculada e alterações com dependências.

O resultado deve ser sucesso ou erro estruturado. A interface só limpa formulários e avança etapas depois do sucesso. Evitar encerramentos parciais e proteger repetição da mesma ação com identidade da operação.

Uma revisão/referência do documento deve detectar edição concorrente e evitar sobrescrita silenciosa entre abas. Não é necessário criar uma infraestrutura distribuída; o limite atual é um documento local com múltiplos consumidores.

### 5. Plano mensal, simulação e calendário

O plano mensal tem identidade e itens próprios, derivados de um modelo recorrente quando criado. Mudanças no modelo oferecem aplicação aos ciclos futuros; não reescrevem ciclos anteriores.

O cenário em comparação é um rascunho. Pode calcular efeitos com fatos existentes em modo de leitura, sem substituir o plano do ciclo nem filtrar os fatos. O seletor operacional de competência e a consulta a outro mês devem ter intenções visíveis.

Manter o ciclo ativo como competência padrão dos movimentos. Datas reais são registráveis sem obrigar que sejam “agora”. Cadastros de eventos podem oferecer uma data futura escolhida, mas a competência de sua efetivação segue o ciclo ativo salvo seleção explícita.

### 6. Fatura e terceiros

Adotar identidade de cartão e fatura: `accountId`, vencimento, lançamentos e pagamentos relacionados. A visão consolidada soma faturas, mas não é dona de um único estado de pagamento.

Pagamento registra data e competência; abrir nova fatura deixa de exigir apagar a anterior. Preservar parcelas futuras e assinaturas com uma origem estável. Antecipação e recompensa continuam distintas; sobra de crédito não vira nova entrada de caixa ao atravessar faturas.

Separar custo pessoal de desembolso total. Se o usuário paga uma compra de terceiro, há valor adiantado; registrar o reembolso reduz esse valor a receber e não aumenta renda pessoal. Começar com um fluxo opcional junto ao rateio existente, sem cadastro complexo de contatos.

### 7. Eventos e metas

Preservar identidade e condições de ocorrências com fatos. Editar série deve permitir “esta ocorrência” e “próximas”; não alterar automaticamente o que já foi liquidado. Cancelamento permanece recuperável e não apaga pagamentos.

`Já incluído no plano` deve referenciar um item, e `Cartão` deve apontar para a cobrança/fatura quando conhecida. Enquanto o vínculo estiver pendente, indicar essa condição, sem fabricar uma quitação ou assumir cobertura invisível.

Uma meta pode receber destinação de posições e de aportes futuros. Somar os aportes prometidos a todas as metas e compará-los com a capacidade do mesmo plano mensal. Vínculo de evento a meta consome/destina o mesmo recurso, sem novo saldo de grupo.

### 8. Histórico e projeção

Preservar a marca patrimonial no fechamento e a folha confirmada daquele ciclo. Correções de movimentos propagam-se às leituras afetadas e deixam indicação de revisão. Não recalcular o patrimônio passado a partir da avaliação atual de uma posição.

Uma comparação patrimonial distingue aportes, retiradas, variação de dívida e residual de avaliações/ajustes. Só apresentar retorno quando os dados permitirem atribuí-lo.

Projeção usa destinos e compromissos consistentes com o orçamento. Entradas incertas são uma opção, não parte invisível do cenário base. Meta de carteira acompanha carteira; crescimento de reserva ou redução de dívida não deve ser atribuído a ela por conveniência.

Valores nominais e reais não se misturam na mesma equação/gráfico. O alvo da meta precisa ter base monetária explícita ao compará-lo com projeção deflacionada. Sem calendário bancário completo, falar em projeção patrimonial ou folga do ciclo, nunca em saldo diário garantido.

## Organização proposta das telas

| Aba | Primeiro nível | Sob demanda | Retirar do primeiro nível |
| --- | --- | --- | --- |
| Ciclo | Verba, pendências e registrar movimento | Composição, prévia seguinte, revisão de fechamento | Formulários vazios permanentes e repetição dos totais do fechamento |
| Planejar | Plano mensal e distribuição da renda | Modelo recorrente, percentuais, comparar simulação | Sugestões genéricas e metas percentuais como diagnóstico automático |
| Cartões | Fatura selecionada, parte pessoal, terceiros, lançamentos | Cadastro, parcelas futuras, rateio, importação revisada | Configuração de limite ocupando o centro da operação |
| Patrimônio | Posições, reserva, metas e aporte pendente | Instituições, bens, dívidas, análise de retorno | Equações e gráficos repetindo o mesmo saldo |
| Histórico | Desvios, evolução e fechamentos do período | Composição, origem e corrigir fechamento | Patrimônio de hoje e múltiplos resumos concorrentes de aportes |
| Futuro | Próxima ocorrência pendente de cada evento | Série, efetivação, metas relacionadas, projeção e premissas | Curva distante como abertura e nova lista paralela dos mesmos eventos |

Os detalhes devem abrir no contexto do item. Links entre abas carregam destino e registro, evitando “vá a Patrimônio e procure”. Manter a posição de navegação quando voltar de uma ação relacionada.

## Etapas e portões de entrega

Estas etapas descrevem a evolução por tema. Para executar e publicar em incrementos utilizáveis, seguir a divisão V1–V9 de [versões entregáveis](versoes-entregaveis.md). Em 02/10/2026, V1 (FT-01–FT-12) está concluída e V2–V9 (FT-13–FT-26) estão pendentes. FT-24 deve acompanhar as telas alteradas e FT-26 a documentação de cada versão; ambas encerram em V9.

### Etapa 1 — integridade, recuperação e semântica persistida

Executar FT-01–FT-05. Primeiro corrigir abertura de documento inválido e operações parciais. Depois preservar fatos ao arquivar e consolidar tipos de movimento no runtime e no backup.

**Concluída quando:** documento inválido permanece recuperável; falhar uma gravação deixa a operação inteira no estado anterior; arquivar posição não altera aportes históricos; saldo inicial conserva seu tipo em exportação/importação.

### Etapa 2 — contrato do ciclo e planejamento

Executar FT-06–FT-11. Separar plano mensal, cenário e fato; reconciliar realizados; corrigir a verba discricionária e a prévia seguinte. Só então aplicar a nova hierarquia de Ciclo e Planejar.

**Concluída quando:** trocar simulação não muda realizados; aporte pendente está protegido; zero e desconhecido são distinguíveis; fechar não transforma silenciosamente previsão em fato; o próximo ciclo possui seu próprio plano.

### Etapa 3 — cartões utilizáveis de ponta a ponta

Executar FT-12–FT-15. Entregar cadastro e calendário acessíveis antes da migração maior de faturas. Identificar faturas e pagamentos, revisar importação e completar a leitura de terceiros.

**Concluída quando:** cadastrar dois cartões, registrar parcelas, importar complemento, pagar só um e registrar reembolso preserva competência, histórico e caixa sem duplicação.

### Etapa 4 — movimentações patrimoniais e destino do aporte

Executar FT-16–FT-18. Conectar transferência, resgate e amortização; dar data às avaliações; ligar objetivos ao plano de aporte.

**Concluída quando:** uma operação é registrada uma vez e produz seus efeitos financeiros relacionados; avaliação não é aporte; todas as metas disputam explicitamente a mesma capacidade mensal, sem duplicar patrimônio.

### Etapa 5 — próximos compromissos e projeção útil

Executar FT-19–FT-21. Resolver ciclo de vida das ocorrências e vínculos; reorganizar Futuro; reconciliar projeções com as fontes existentes.

**Concluída quando:** uma ocorrência parcialmente paga, adiada, cancelada ou liquidada aparece corretamente; editar a série preserva fatos; cenários incertos e base monetária são identificáveis; os eventos não aparecem duplicados em painéis concorrentes.

### Etapa 6 — histórico explicável e corrigível

Implementar FT-23 antes de finalizar FT-22. O mecanismo de correção precisa estar pronto para os links de origem e detalhes da nova leitura.

**Concluída quando:** corrigir um fato mostra antes/depois, preserva a marca de fechamento aplicável e atualiza as leituras que dele dependem; a visão do passado explica diferenças sem copiar o painel do presente.

### Etapa 7 — consolidação

FT-24 acompanha as telas anteriores; FT-25 utiliza os contratos já reconciliados; FT-26 encerra a entrega documental e remove somente caminhos comprovadamente sem uso.

**Concluída quando:** editar, salvar, desfazer, navegar e consultar composição seguem o mesmo padrão; a fotografia para IA não inventa certeza; documentação corresponde ao comportamento entregue.

## Migração e segurança operacional

- Conferir o estado atual antes de cada etapa. Não reverter as alterações locais de Futuro para reproduzir planos históricos.
- Trabalhar primeiro com uma cópia de dados. Guardar o documento bruto original antes de converter; em erro de leitura, preservá-lo sem normalização destrutiva.
- Versionar mudanças incompatíveis. FT-05 entregou o backup público v9; escolher a próxima versão a partir do estado real no momento de cada implementação.
- Manter uma tabela por campo: preservado, transformado com regra explícita, desconhecido ou legado. Não inventar pagamento, origem, conta, dia ou competência ausente.
- Não confundir contrato público e armazenamento interno. Alinhar entidades canônicas progressivamente, sem obrigar uma troca de persistência em bloco.
- Restaurar deve conferir conteúdo e referências, não apenas o número de versão. Mostrar avisos relevantes antes de aplicar.
- Só promover a nova estrutura quando a reconciliação antes/depois explicar todas as diferenças. Mudança de regra deve aparecer como mudança deliberada, não como “erro de migração” ocultado.

## Validação objetiva

Priorizar a jornada funcional curta de cada versão na aplicação, com dados sintéticos, e comparar os registros persistidos quando houver efeito financeiro ou migração. Não criar, ampliar ou executar testes unitários, suítes completas ou testes sem risco concreto: o tempo de execução e os tokens devem ir para implementar as funcionalidades. Rodar build uma vez somente quando necessário para conferir integração do código; lint ou outra verificação apenas diante de falha concreta ou requisito do repositório. Nas telas alteradas, verificar o mínimo de 390 px de `AGENTS.md` sem abrir uma campanha de responsividade. O roteiro de cada versão está em [versões entregáveis](versoes-entregaveis.md).

Exemplos de jornadas: conferir apenas a correspondente à versão em execução, conforme [versões entregáveis](versoes-entregaveis.md), sem repetir as demais a cada entrega.

1. Abrir/restaurar documento, lidar com falha de gravação e recuperar sem perda.
2. Planejar um ciclo, simular outro, confirmar renda/contas e verificar que fatos não mudaram.
3. Executar aporte parcial e total: a verba para Desejos não aumenta só porque o aporte ainda não foi feito.
4. Comprar no cartão, importar sem duplicar, aplicar crédito e pagar fatura: gasto e pagamento aparecem uma vez em suas leituras.
5. Transferir posição, resgatar e amortizar: patrimônio e caixa explicam o mesmo movimento.
6. Efetivar evento parcialmente, editar próximos e concluir: passado e restante permanecem corretos.
7. Fechar, corrigir e consultar o passado: comparação e marcas de fechamento preservadas.

Registrar entrada, ação, resultado esperado e resultado observado na tarefa. Para cada total financeiro, oferecer composição consultável na própria aplicação.

## Fora da primeira execução

Saldo bancário manual com data de conciliação pode ser uma evolução útil se o usuário precisar responder “quanto existe na conta agora?”. Requer abertura, movimentos e tratamento de terceiros consistentes. Não é pré-requisito para corrigir a verba do ciclo; até lá, usar rótulos honestos de fluxo e planejamento.

Sincronização, importação automática e simuladores completos ficam fora deste backlog. Só abrir novas tarefas se houver uma decisão concreta ou trabalho repetitivo que os recursos atuais não resolvam.
