# Auditoria de produto e engenharia — agosto de 2026

## Direção recomendada

O FinTano não precisa de mais módulos agora. Precisa reduzir ambiguidades e tornar explícitas as poucas decisões que importam no mês:

1. quanto entrou de verdade;
2. o que já está comprometido;
3. quanto ainda pode ser decidido;
4. o que aconteceu contra o plano;
5. como o patrimônio mudou.

A base técnica é boa: TypeScript estrito, cálculos financeiros puros, 276 testes e persistência local com backup. O principal custo atual é o acúmulo de conceitos e implementações antigas ainda no repositório, somado a alguns riscos de integridade silenciosos.

## O que deve ser preservado

- Separação entre competência, caixa e ciclo financiado.
- Histórico somente como leitura/correção do passado; fechamento no ciclo atual.
- Parte pessoal separada da parte de terceiros no cartão.
- Plano separado do realizado, com fallback explícito quando o realizado não foi informado.
- Privacidade local-first e exportação de backup.
- Vocabulário visual consistente, poucos acentos de cor e números tabulares.
- Cálculos em `src/lib`, fora dos componentes React.

## Prioridade 0 — integridade do dinheiro

### 1. Concluir a distinção entre previsão e fato

Implementado nesta entrega para entradas extras: eventos de Futuro continuam previstos; somente entradas marcadas como recebidas entram no caixa e no fechamento. A mesma regra deve ser aplicada, numa etapa posterior, às saídas extraordinárias: hoje uma saída prevista no mês já reduz o caixa mesmo sem um estado explícito de “paga”.

### 2. Não esconder falha de persistência

`useLocalStorage` captura erro de quota/escrita, mas atualiza a tela mesmo assim. O usuário pode acreditar que um dado financeiro foi salvo quando ele só existe em memória até recarregar a página.

Recomendação: manter um estado global de persistência (`saved`, `saving`, `error`), mostrar erro persistente no cabeçalho e bloquear fechamento/importação enquanto a gravação falhar.

### 3. Tornar a restauração transacional

O restore apaga as chaves atuais antes de provar que todas as novas entradas podem ser gravadas. Uma falha de quota no meio da restauração pode deixar dados parciais.

Recomendação: validar formato e tamanho, criar uma cópia automática, testar a serialização completa, e só então substituir os dados. Se qualquer escrita falhar, restaurar a cópia anterior.

### 4. Definir o que “apagar tudo” significa

O comando atual remove chaves `uf_`, mas preserva backups `ufbk_`. Isso é bom para recuperação, porém contradiz o texto “Apagar todos os dados”. A interface deve oferecer duas ações explícitas: “Limpar dados atuais e manter cópias” e “Apagar dados e cópias deste navegador”.

## Prioridade 1 — simplificar produto e código

### 5. Remover caminhos mortos antes de criar novas telas

Há pelo menos 715 linhas de produção sem consumidor na aplicação atual:

- `CashFlowPanel.tsx` — 323 linhas;
- `CycleAlerts.tsx` — 57 linhas;
- `CycleGuide.tsx` — 139 linhas;
- `alerts.ts` — 138 linhas;
- `allocateWants.ts` — 58 linhas.

Os dois últimos ainda mantêm testes, mas não participam do produto renderizado. A decisão deve ser binária: extrair deles um cálculo realmente usado pelo Ciclo ou removê-los junto com seus testes. Mantê-los como “talvez um dia” aumenta o risco de alguém corrigir a implementação errada.

### 6. Fazer a aba Ciclo responder primeiro sobre o ciclo atual

Hoje o maior destaque visual é “Liberado para alocar” no próximo mês. Isso é útil no fechamento, mas durante o mês desloca a pergunta principal: “quanto deste ciclo ainda está livre?”.

Recomendação: um único resumo compacto no topo com `entrou`, `comprometido`, `livre` e a competência da fatura. A prévia do próximo ciclo pode aparecer apenas quando a fatura de fechamento estiver confiável ou quando o usuário abrir a revisão.

### 7. Ter um único seletor de ciclo

O mês pode ser alterado no cabeçalho e novamente dentro da própria tela Ciclo. Manter somente o seletor global reduz ruído e elimina a dúvida sobre qual deles muda o quê.

### 8. Quebrar componentes por responsabilidade, não por aparência

Os maiores arquivos concentram formulário, normalização de interação, filtros, tabela e confirmação:

- `CreditCardManager.tsx`: 1.258 linhas;
- `DebtsManager.tsx`: 729;
- `ForecastView.tsx`: 710;
- `InvestmentsManager.tsx`: 655;
- `ui.tsx`: 735.

Primeiro alvo: cartão. Separar cadastro/importação, lista filtrada, resumo por cartão e revisão de pagamento. Cada parte deve receber dados e callbacks, sem conhecer `localStorage`.

### 9. Dividir tipos por domínio

`types/index.ts` tem 755 linhas e faz qualquer módulo importar um catálogo global. Separar `budget`, `cards`, `actuals`, `history`, `investments`, `forecast` e um `index.ts` apenas de reexportação reduz acoplamento e conflitos de edição.

### 10. Corrigir o falso conceito de “seletores” do contexto

Funções como `useCardsStore()` chamam o mesmo `useContext` da loja inteira. Elas melhoram a leitura, mas não isolam renderizações: qualquer alteração recria a store e notifica todos os consumidores.

Não é necessário adicionar uma biblioteca imediatamente. Primeiro separe contextos por domínio ou estabilize valores; só considere uma store com seletores se o profiler mostrar custo real.

## Prioridade 1 — experiência e acessibilidade

### 12. Unificar confirmações

Há um `ConfirmButton` próprio, mas backup/reset ainda usam `window.confirm` e `window.alert`. Um único diálogo acessível permite explicar consequência, alvo e reversibilidade com a mesma linguagem visual.

### 13. Aumentar ligeiramente o texto muted em cards

O token `dark-text-muted` contra `dark-card` mede aproximadamente 4,34:1. Muitos textos usam 11–12 px, abaixo do contraste de 4,5:1 recomendado para texto normal. Ajustar apenas esse token preserva a estética e melhora leitura sem transformar a tela.

## Prioridade 2 — qualidade e manutenção

### 15. Cobrir jornadas, não apenas fórmulas

Os 276 testes cobrem bem `src/lib`, mas não protegem a ligação entre hooks, persistência e interface — justamente onde a receita prevista era tratada como recebida.

Adicionar testes de componente/jornada para:

- registrar uma entrada extra manual;
- converter evento previsto em recebido sem duplicar;
- fechar e reabrir o mês preservando a composição;
- pagar fatura sem fechar o ciclo;
- importar backup incompatível sem perder o estado atual.

### 16. Fazer o CI executar lint

O workflow roda teste e build, mas não `npm run lint`. Um aviso real em `useInvestments.ts` sobre dependência de hook foi corrigido nesta entrega; adicionar lint ao CI e tornar warnings falha evita que o problema reapareça.

### 17. Atualizar dependências em lotes pequenos

O audit de produção está limpo, sem vulnerabilidades. Há atualizações patch/minor disponíveis para React, Vite, Tailwind, Vitest e plugins; ESLint e TypeScript têm saltos maiores. Atualizar primeiro o lote compatível e validar; tratar majors em mudanças separadas, sem misturar com features financeiras.

### 18. Limpar a instalação local

`npm ls --depth=0` mostra pacotes extraneous no `node_modules`. `npm ci` deve ser a referência reproduzível local, como já é no CI.

### 19. Carregamento por aba é opcional, não urgente

O bundle atual tem cerca de 127 kB gzip. `React.lazy` para Patrimônio e Futuro reduziria o carregamento inicial, mas o ganho é secundário diante de integridade e simplificação. Só fazer depois de remover código morto e medir novamente.

## Backend e persistência

Não há backend; os dados ficam no navegador. Isso é uma vantagem de privacidade e simplicidade para uso pessoal. O uso é exclusivo em notebook e computador, em telas grandes. Não criar servidor apenas por “arquitetura”.

O melhor investimento é tornar a persistência local confiável: erro visível, restauração transacional e backup exportável verificável. IndexedDB pode ser considerado se o volume crescer.

## Sequência sugerida

1. Integridade de persistência e backup.
2. Remoção de código morto e seletor duplicado.
3. Resumo único do ciclo atual.
4. Contraste e diálogos acessíveis por teclado.
5. Divisão de Cartões e dos tipos por domínio.
6. Testes de jornada e lint obrigatório no CI.
7. Atualizações de dependências e, só se medido, lazy loading.

## Estado da implementação

Registro dos pontos desta auditoria tratados na aplicação:

1. Entradas e saídas extraordinárias só afetam o caixa depois de marcadas como recebidas/pagas; a composição é preservada no Histórico.
2. Falhas de gravação mantêm o estado anterior na tela, exibem um alerta persistente e bloqueiam fechamento e importação.
3. A restauração valida tamanho/JSON, testa capacidade, cria cópia de segurança, verifica o resultado e faz rollback.
4. O menu separa “Limpar dados atuais” de “Apagar dados e cópias”.
5. Os cinco caminhos mortos e seus testes foram removidos.
6. Ciclo começa por entrou, comprometido, livre e fatura do ciclo atual; a prévia seguinte é secundária.
7. O seletor interno foi removido; existe somente o seletor global.
8. Cartões separa cadastro, importação, revisão de pagamento, área e resumos em componentes sem persistência própria.
9. Os tipos foram divididos por domínio; `types/index.ts` apenas reexporta.
10. Cenários, cartões, investimentos, histórico, futuro, dívidas, bens, realizados, métricas e caixa têm contextos próprios.
12. Backup, restauração e limpeza usam um diálogo acessível comum.
13. `dark-text-muted` passou a atender contraste de texto normal contra cards.
15. A suíte inclui jornadas de realizados, fechamento/reabertura, pagamento de fatura e importação segura.
16. O CI executa lint, testes e build.
17. Dependências patch/minor foram atualizadas; saltos major de ESLint e TypeScript ficaram fora do lote.
18. `npm ci` e `npm ls --depth=0` comprovam instalação reproduzível sem pacotes extraneous.
19. Cartões, Patrimônio, Histórico e Futuro são carregados por aba com `React.lazy`.
