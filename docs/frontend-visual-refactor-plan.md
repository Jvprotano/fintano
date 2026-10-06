# Revisão visual do FinTano

## Objetivo

Fazer as seis áreas do app seguirem a mesma hierarquia financeira, os mesmos controles e a mesma linguagem visual. O uso é exclusivo em notebook e computador, em telas grandes, com mouse e teclado. Os cálculos e o significado de plano, realizado, caixa, patrimônio e projeção permanecem explícitos.

## Inventário e problemas encontrados

| Área | Decisão principal | Ajuste visual prioritário |
| --- | --- | --- |
| Ciclo | Quanto entrou, o que está comprometido e quanto cabe em Desejos | Destacar o valor disponível, separar o registro realizado do fechamento e tornar formulários legíveis |
| Planejar | Como distribuir a renda do ciclo | Dar contexto à aba e padronizar cartões, rótulos e ações |
| Cartões | Qual é a fatura pessoal e o que compõe o envelope | Melhorar a leitura da fatura e do cadastro em telas grandes |
| Patrimônio | Quanto há em ativos, dívidas e patrimônio líquido | Dar prioridade ao patrimônio líquido e tornar grupos e posições mais legíveis |
| Histórico | Como os ciclos encerrados evoluíram | Deixar clara a natureza de leitura do passado; melhorar filtros e dados compactos |
| Futuro | O que pode acontecer sob as premissas atuais | Distinguir projeção de dinheiro disponível e melhorar controles e legendas |

Problemas transversais: muitas informações operacionais em 10–11 px; formulários que dependem de placeholder ou rótulo apenas para leitor de tela; padrões de painel e ações aplicados de forma desigual.

## Etapas

1. **Sistema compartilhado:** consolidar tokens de superfície, texto, estado e foco; elevar tamanho mínimo de texto de apoio; ajustar painéis, métricas, campos, botões e controles segmentados.
2. **Estrutura do app:** tornar a navegação clara, incluir título e orientação curta por área e colocar a competência do ciclo junto da navegação operacional.
3. **Fluxos:** aplicar a hierarquia nas seis áreas e corrigir exceções de formulário, tabela e estado vazio, com atenção especial a Cartões.
4. **Verificação:** conferir a jornada afetada em notebook e computador, com mouse e teclado; usar build ou outras verificações somente quando o risco da alteração justificar. Registrar limitações de checagem se uma superfície não puder ser aberta.

## Limites de produto

- Valor planejado não é caixa disponível; realizado e projeção recebem rótulos próprios.
- Desejos não entram como obrigação na conta de verba discricionária.
- Histórico continua leitura do passado; fechamento continua no Ciclo.
- O envelope Cartão já inclui seus itens.
- Nenhuma nova biblioteca visual é necessária para esta revisão.

## Estado

- [x] Inventário inicial das seis áreas e do sistema compartilhado.
- [x] Sistema compartilhado.
- [x] Estrutura e seis áreas.
- [x] Revisão em desktop e validação final.

## Resultado da verificação

- Build e lint concluídos sem erros.
- 338 testes passaram; 3 testes já estavam ignorados.
- As seis áreas abriram no navegador local em desktop, exibiram título e conteúdo, e não excederam a largura da página.
- Ciclo e Planejar foram conferidos também por captura renderizada. As capturas de Cartões, Patrimônio, Histórico e Futuro expiraram no navegador; nessas áreas a conferência usou a árvore de interface e as medidas do DOM.
