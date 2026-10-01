# FT-05 — Contrato de backup e migração

## Diagnóstico

O arquivo público atual é v8 e o repositório local continua v7. O conversor preserva IDs, centavos, arquivamento e o `kind` introduzido em FT-04, mas a importação reduz `investments.valuations[]` ao maior `asOf` de cada posição e descarta `planning.cycles[]`. Uma exportação seguinte cria avaliações e planos derivados, de modo que a ida e volta muda informação aceita sem um aviso específico. O diálogo de importação informa conversão para v7 e resume avisos só pela quantidade. A aplicação não registra quando uma exportação externa foi solicitada.

## Contrato de execução

1. Backup público v9 mantém leitura de v7, v8 e arquivos legados. A chave local v7 permanece. O v9 acrescenta valor atual explícito em cada posição; o histórico de avaliações continua em `valuations[]`.
2. Importar conserva as avaliações e planos mensais completos em uma coleção de compatibilidade do repositório. O runtime usa o valor atual explícito. Exportar mantém IDs e datas dos registros aceitos; se o valor atual mudar, acrescenta uma avaliação datada da exportação, sem apagar as anteriores.
3. Planos históricos de outros ciclos não são recalculados na exportação. O plano aberto da competência ativa reflete o estado atual, preservando o ID quando possível. FT-06 assumirá a edição operacional desses planos.
4. A inspeção de importação exibe avisos individualmente e compara contagens e totais relevantes com o documento atual. Falha de validação ou escrita conserva o documento anterior.
5. O menu mostra o instante da última exportação externa **solicitada** neste navegador. Download iniciado não prova que o arquivo foi guardado; o texto não afirmará isso.

## Matriz de preservação a validar

| Conteúdo | v7/v8 lido | v9 exportado/importado | Runtime imediato |
| --- | --- | --- | --- |
| IDs, tipos, datas, competência, centavos e arquivamento | Preservar | Preservar | Usar |
| Avaliações históricas | Aceitas, hoje descartadas parcialmente | Preservar todas | Exibir valor atual |
| Planos por competência | Aceitos, hoje descartados | Preservar todos | Ciclo ativo ainda usa cenário até FT-06 |
| Campos desconhecidos fora do contrato | Não prometer | Avisar ou rejeitar conforme risco | Não usar |

## Verificação

Documento sintético com duas avaliações da mesma posição, valor atual distinto, plano fechado e plano aberto de outra competência, tipos de movimento e cadastros arquivados. Inspecionar v7/v8/v9, importar, exportar e comparar IDs, datas, centavos, referências e totais. Simular falha de escrita e confirmar o documento anterior. Conferir o resumo de importação e a indicação da exportação na interface quando o navegador estiver disponível; rodar build, lint e testes relevantes.

## Resultado

- Um v8 sintético com duas avaliações, três planos mensais, abertura tipada, bem, dívida e caixa extra foi lido e reexportado em v9 com os mesmos IDs, datas, centavos e totais financeiros. O plano ativo importado permaneceu intacto até o cenário ser editado; depois disso, só esse plano foi atualizado.
- Valor atual distinto do histórico é explícito em `currentValueCents`. Uma mudança posterior acrescentou uma avaliação sem apagar as anteriores. Planos e avaliações aceitos também permanecem no repositório local em `backupCarryover` para as próximas exportações.
- Inspeção rejeita valor atual inválido e planos duplicados na mesma competência. O teste existente de restauração confirmou cópia prévia e rollback em falha de escrita. A leitura de v7/v8/legado continua coberta.
- O diálogo de importação e restauração automática mostra contagens, avisos individuais e comparação dos totais antes da substituição; o menu informa a última exportação solicitada e oferece download do documento bruto pré-FT-04. O diálogo agora pode rolar em telas baixas.
- Suíte completa: 388 testes passaram, 3 ignorados. Build e lint passaram. O navegador não estava disponível nesta retomada; a apresentação renderizada e a largura de 390 px ainda precisam de conferência quando voltar.
