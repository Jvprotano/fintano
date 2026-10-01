# FT-07 a FT-09 — Realizado, verba e prévia

## Entrega

- A folha recebida pertence à competência e é armazenada separadamente do salário planejado, inclusive previdência e contrapartida. Ausência e zero são estados diferentes. Backup v9 preserva os valores.
- O Realizado mostra confirmados e pendentes separadamente. Há confirmação do plano em lote e por item. Custos no cartão saem da edição de custos em conta; sua fonte segue sendo a fatura. Itens arquivados ainda são reconhecidos pelo ID.
- A verba para Desejos protege contas e saídas extraordinárias ainda pendentes e o maior entre aporte programado e aporte executado. Desejos são abatidos depois da verba disponível, nunca como obrigação anterior. Sem folha confirmada, a tela não anuncia verba disponível.
- A prévia seguinte usa o plano da próxima competência ou o modelo recorrente. A base exclui entradas incertas, que aparecem como cenário adicional. Entradas datadas após o vencimento indicado geram aviso de tempo; datas incompletas não asseguram cobertura.
- O fechamento agora exige confirmação da folha, de custos e Desejos em conta e conhecimento das faturas. Não copia valores planejados silenciosamente para o realizado. Refechamento com valores correntes foi retirado da ação de Ciclo; correção histórica será tratada em FT-23.

## Limites

- A identificação de fatura e do dia real de cada cartão depende de FT-12/FT-13. O aviso de datas usa o dia de vencimento indicado no ciclo até essa integração.
- A leitura e a correção de snapshots antigos com estimativas legadas permanecem em FT-23.
- A conferência visual renderizada a 390 px segue pendente porque o navegador integrado está indisponível nesta sessão.
