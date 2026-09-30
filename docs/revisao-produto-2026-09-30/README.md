# Revisão integral do FinTano — 30/09/2026

**Direção:** tornar confiável a resposta “quanto posso destinar, o que preciso fazer e o que muda se eu fizer isso?”. A aplicação já tem módulos suficientes. A maior oportunidade está em conectar os fatos financeiros e reduzir interpretações concorrentes do mesmo dinheiro.

## Documentos

1. [Diagnóstico](diagnostico.md): funcionalidades, problemas comprovados, lacunas e proposta para cada aba.
2. [Plano de execução](plano-execucao.md): decisões de produto, contratos financeiros, etapas, migração e validação.
3. [Tarefas](tasks.md): backlog executável, com IDs, dependências, arquivos de referência e critérios de conclusão.

## Ordem de implementação

| Etapa | Resultado | Tarefas |
| --- | --- | --- |
| 1. Preservar dados | Falha de gravação, exclusão ou importação não destrói fatos | FT-01 a FT-05 |
| 2. Confiar no ciclo | Plano, recebido, pago e ainda comprometido deixam de se misturar | FT-06 a FT-11 |
| 3. Operar os cartões | Faturas identificadas, pagamentos rastreáveis e importação conferível | FT-12 a FT-15 |
| 4. Conectar patrimônio | Aportes, amortizações, metas e saldos têm origem e efeito claros | FT-16 a FT-18 |
| 5. Decidir sobre o futuro | Eventos pendentes e metas orientam a ação; projeção explicita hipóteses | FT-19 a FT-21 |
| 6. Aprender com o passado | Histórico explica desvios e correções sem concorrer com outras abas | FT-22 a FT-23 |
| 7. Consolidar a experiência | Interação consistente, contexto correto e documentação coerente | FT-24 a FT-26 |

As etapas são incrementais. FT-04 e FT-06 definem o contrato de dados usado nas demais; isso não exige uma reescrita integral antes de entregar correções.

## Estado e limites

- [x] Análise das seis abas, subáreas patrimoniais, persistência, backup e exportação para IA.
- [x] Leitura das telas no navegador e confronto com componentes, hooks e cálculos.
- [x] Diagnóstico, direção de produto, plano e tarefas registrados.
- [ ] Implementação das tarefas abaixo — FT-01 concluída; FT-02 a FT-26 pendentes. Evidências e limites estão em `tasks.md`.

Base: commit `7d6f998`, incluindo as alterações locais já existentes em `ForecastView`, `ForecastCommitments`, `useForecast`, no teste de compromissos e em `docs/futuro-eventos-plano.md`. Essas alterações retiram grupos de Futuro; a proposta respeita essa direção. Não foram modificadas nesta revisão.

A pedido do usuário, a revisão deixou de investir tempo em testes unitários e responsividade. Evidências técnicas obtidas antes dessa orientação estão no diagnóstico; não constituem aprovação de todos os fluxos. Os exemplos dos documentos são sintéticos e não reproduzem o cadastro financeiro pessoal.

Para retomar: ler o plano, conferir o estado atual do repositório, escolher a primeira tarefa pendente com dependências satisfeitas e registrar seu resultado em `tasks.md`. Não marcar uma tarefa como concluída apenas por compilar.
