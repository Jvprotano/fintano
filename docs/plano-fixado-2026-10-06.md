# Plano fixado e consulta do passado

## Diagnostico

O backup v9 de 06/10/2026 tem um plano operacional de outubro derivado do modelo Atual. O seletor global mostra a simulacao selecionada como "Simular: Atual", embora Ciclo e Planejar usem o plano operacional. Planos por ciclo ja existem, mas continuam editaveis; o fechamento compara com a ultima edicao, sem preservar uma referencia anterior.

## Execucao

1. Registrar uso pessoal, KISS e validacao proporcional em AGENTS.md.
2. Levar faturas antigas sem identificacao para Historico, inclusive quando nao ha ciclos fechados. Colapsar os dois blocos de extras no Ciclo.
3. Mostrar Plano do ciclo no seletor e explicitar simulacoes dentro do menu.
4. Adicionar Fixar plano do ciclo em Planejar: guardar copia independente do plano, com data, uma vez por competencia. Edicoes e aplicacoes de simulacao continuam permitidas, conservando a referencia.
5. Preservar a referencia no backup v9 e usar seus valores na comparacao do fechamento/Historico. Sem referencia, manter o comportamento anterior, sem inventar um plano original para meses passados.
6. Conferir build e uma jornada curta de fixacao, edicao, backup/restauracao e fechamento, alem das telas afetadas.

O usuario confirmou que prefere preservar a referencia e permitir ajustes. Fixar o plano nao fecha o ciclo, nao confirma pagamentos e nao troca o modelo recorrente.

## Entrega e verificacao

Etapas concluidas. Faturas antigas ficam em um bloco recolhido ao fim do Historico; aparecem tambem sem ciclos fechados. Os dois blocos de extras do Ciclo iniciam recolhidos, preservando total e aviso de previsoes pendentes. O seletor mostra Plano do ciclo e identifica a biblioteca de simulacoes no menu.

A referencia guarda o plano completo e a data em `monthlyPlans[].fixedReference`. Edicao, arquivamento e aplicacao de simulacao preservam essa copia. Atualizar modelos futuros ignora referencias fixadas. O fechamento registra metas de custos fora do cartao, Desejos fora do cartao, investimentos pessoais e cartao da referencia; Desejos removidos conservam sua meta com realizado zero. Historico usa os valores congelados, sem reconstruir o plano original de meses anteriores.

Build de producao e jornada focada em `monthlyPlansJourney.test.tsx` passaram (3 casos, incluindo o novo percurso de fixar, ajustar, aplicar simulacao, exportar/restaurar e fechar). A jornada tambem recusou valores fracionarios em centavos na referencia. Nenhuma suite completa ou campanha de cobertura foi executada.

No navegador local, foram conferidos a acao em Planejar, os extras recolhidos, as faturas antigas no Historico e sua ausencia em Cartoes. A posicao do menu foi corrigida e reconferida. Fixacao e fechamento foram executados apenas sobre dados sinteticos; o backup pessoal foi consultado sem alteracao.
