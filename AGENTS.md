# Contexto permanente do produto

## Autonomia de produto

- So o proprietario usa esta aplicacao. Decisoes de produto devem atender ao seu cenario pessoal e ajudar a decidir e analisar seus dados; nao projetar para outros usuarios hipoteticos.
- Uso exclusivo em notebook e computador, em telas grandes, com mouse e teclado. Direcionar layouts, navegacao e validacao a esse contexto.
- Regra maxima: KISS. Em codigo, modelo de dados, telas e fluxos, escolher a solucao mais simples que resolva o problema com dados corretos. Mostrar apenas informacao que ajuda a decidir ou agir.
- Gastar tempo e tokens somente com validacoes estritamente necessarias ao risco da mudanca. Cobertura de testes nao e objetivo; normalmente nao criar nem executar testes. Quando houver risco financeiro ou de persistencia concreto, conferir apenas a jornada afetada e os dados resultantes.
- Esta aplicacao e pessoal e tem um unico usuario. Ao trabalhar nela, existe autorizacao para repensar qualquer aba, fluxo, estrutura visual ou modelo de dados quando isso produzir uma decisao financeira mais clara, confiavel e util.
- Nao preserve uma estrutura apenas por ela ja existir. Mudancas amplas e inovacao sao bem-vindas dentro do problema solicitado, inclusive recriar uma aba quando a arquitetura atual limitar o resultado.
- Antes de introduzir uma biblioteca ou recurso externo, verifique documentacao atual, compatibilidade, custo e ganho concreto. Prefira comportamento integrado e dados corretos a melhorias apenas cosmeticas.
- Essa liberdade nao autoriza desviar para modulos sem relacao com o pedido ativo. Mantenha o escopo orientado ao problema financeiro que o usuario trouxe.

## Principios financeiros

- Previsao nao e dinheiro disponivel. Identifique claramente plano, realizado, caixa, patrimonio e projecao.
- Desejos sao a verba discricionaria que resta depois da fatura anterior, contas correntes, aporte programado e movimentos extraordinarios. Nao conte Desejos como obrigacao ao calcular quanto ainda pode ser alocado a eles.
- Historico e leitura do passado. Fechamento do mes corrente e uma acao operacional separada, executada na aba Ciclo.
- O ciclo ativo e a competencia financeira padrao dos lancamentos. A data real serve para auditoria e calculos de tempo; so use outro ciclo quando o usuario o escolher explicitamente.
- O envelope Cartao inclui seus itens filhos; nunca some esses detalhes novamente.
- Fixar o plano do ciclo guarda uma referencia independente para comparar com o realizado. Ajustes posteriores continuam permitidos e nao alteram essa referencia. Fixar plano nao fecha o ciclo nem confirma pagamentos.

## Sistema visual

- Mantenha cada tela enxuta, direta e clara. Mostre primeiro o que ajuda a decidir ou agir; revele detalhes sob demanda. Nao repita os mesmos eventos e totais em blocos concorrentes.
- Preserve a linguagem escura, calma e objetiva do FinTano. Use profundidade sutil, verde apenas para acento/estado positivo e cores quentes apenas para alertas reais.
- Evolua primeiro tokens e componentes compartilhados; evite controles isolados com aparencia nativa ou classes unicas quando o mesmo padrao pode atender outras telas.
- Formularios devem ter rotulos persistentes, exemplos em placeholders e hierarquia clara entre acao, contexto e configuracao. Competencia de ciclo faz parte da movimentacao, nao e metadado solto.
- Organize as telas para aproveitar o espaco de notebook e computador, com controles legiveis e navegacao por mouse e teclado.
