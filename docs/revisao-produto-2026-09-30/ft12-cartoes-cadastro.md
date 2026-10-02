# FT-12 — Cadastro e calendário dos cartões

Cartões agora oferece cadastro visível de nome, dia de fechamento, vencimento e limite do banco, separado do teto pessoal. Cartões presentes em lançamentos mas sem cadastro aparecem como atalhos para cadastrar. É possível corrigir a competência da fatura aberta sem trocar a competência financeira do Ciclo; a revisão mostra a reatribuição dos lançamentos abertos antes da confirmação.

Na primeira abertura, a fatura atual usa a competência ativa e o dia indicado no Ciclo; o antigo valor fixo `05/07` não é mais o ponto de partida. O calendário inicial é gravado para não mudar ao recarregar ou avançar o Ciclo.

A identidade por cartão dos lançamentos, pagamentos e snapshots será tratada em FT-13. Até lá, o campo de competência da fatura aberta ainda é global. A conferência visual renderizada a 390 px segue pendente porque o navegador integrado está indisponível nesta sessão.
