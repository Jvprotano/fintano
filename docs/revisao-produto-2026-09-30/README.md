# Revisão integral do FinTano — 30/09/2026

**Direção:** tornar confiável a resposta “quanto posso destinar, o que preciso fazer e o que muda se eu fizer isso?”. A aplicação já tem módulos suficientes. A maior oportunidade está em conectar os fatos financeiros e reduzir interpretações concorrentes do mesmo dinheiro.

**Contexto de uso:** exclusivo em notebook e computador, em telas grandes, com mouse e teclado.

**Revisão de escopo em 06/10/2026:** FT-14–FT-26 são propostas pendentes de seleção pelo proprietário. A ordem original não autoriza iniciar sua execução automaticamente; executar somente o que ele decidir manter.

## Documentos

1. [Diagnóstico](diagnostico.md): funcionalidades, problemas comprovados, lacunas e proposta para cada aba.
2. [Plano de execução](plano-execucao.md): decisões de produto, contratos financeiros, etapas, migração e validação.
3. [Tarefas](tasks.md): backlog executável, com IDs, dependências, arquivos de referência e critérios de conclusão.
4. [FT-13 — Faturas por cartão](ft13-faturas.md): contrato de dados e ordem de implementação da próxima versão.
5. [Versões entregáveis](versoes-entregaveis.md): entregas independentes, situação, dependências e jornadas mínimas de V1 a V9.

## Ordem de implementação original

| Etapa | Resultado | Tarefas |
| --- | --- | --- |
| 1. Preservar dados | Falha de gravação, exclusão ou importação não destrói fatos | FT-01 a FT-05 |
| 2. Confiar no ciclo | Plano, recebido, pago e ainda comprometido deixam de se misturar | FT-06 a FT-11 |
| 3. Operar os cartões | Faturas identificadas, pagamentos rastreáveis e importação conferível | FT-12 a FT-15 |
| 4. Conectar patrimônio | Aportes, amortizações, metas e saldos têm origem e efeito claros | FT-16 a FT-18 |
| 5. Decidir sobre o futuro | Eventos pendentes e metas orientam a ação; projeção explicita hipóteses | FT-19 a FT-21 |
| 6. Aprender com o passado | Histórico explica desvios e correções sem concorrer com outras abas | FT-22 a FT-23 |
| 7. Consolidar a experiência | Interação consistente, contexto correto e documentação coerente | FT-24 a FT-26 |

As etapas agrupam temas. As fronteiras das entregas publicáveis e a ordem atual estão em [versões entregáveis](versoes-entregaveis.md). FT-04 e FT-06 definem o contrato de dados usado nas demais; isso não exige uma reescrita integral antes de entregar correções.

## Estado e limites

- [x] Análise das seis abas, subáreas patrimoniais, persistência, backup e exportação para IA.
- [x] Leitura das telas no navegador e confronto com componentes, hooks e cálculos.
- [x] Diagnóstico, direção de produto, plano e tarefas registrados.
- [x] Primeira versão utilizável concluída em FT-12: preservação de dados, plano por competência, distinção entre planejado e realizado, prévia, fechamento e cadastro/calendário dos cartões. Evidências e limites estão em `tasks.md`.
- [x] V2: FT-13, identidade e pagamento de faturas por cartão. Evidência e limites em [ft13-faturas.md](ft13-faturas.md).
- [ ] Próxima entrega V3: FT-14 e FT-15, importação conferível e reembolso de terceiros. As demais pendências foram distribuídas até V9.

Base do diagnóstico original: commit `7d6f998`, incluindo as alterações locais então existentes em Futuro. Estado usado para dividir as versões: `504afc9` em 02/10/2026, com FT-01–FT-12 concluídas e FT-13–FT-26 pendentes.

A pedido do usuário, as próximas versões não devem consumir tempo ou tokens com testes unitários, suítes completas ou verificações sem risco concreto. A validação será a jornada funcional curta de cada entrega, com build apenas quando necessário, no contexto de notebook e computador. Evidências técnicas obtidas antes dessa orientação não constituem aprovação de todos os fluxos. Os exemplos dos documentos são sintéticos e não reproduzem o cadastro financeiro pessoal.

Para retomar: consultar a seleção de escopo do proprietário antes de escolher uma entrega, conferir o estado atual do repositório e registrar cada resultado em `tasks.md`. Não marcar uma tarefa como concluída apenas por compilar.
