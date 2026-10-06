---
name: frontend-design
description: Design or refine FinTano screens and shared UI components for exclusive use on laptop and desktop computers, with the app's dark palette and financial hierarchy. Use for frontend visual or interaction work; skip backend-only tasks.
---

# Frontend design do FinTano

O FinTano é uma aplicação financeira pessoal. A interface deve tornar claras as decisões e distinguir plano, realizado, caixa, patrimônio e projeção. Preserve a linguagem escura, calma e objetiva descrita em `AGENTS.md`.

O uso é exclusivo em notebook e computador, em telas grandes, com mouse e teclado. Direcione a implementação e a revisão visual a esse contexto.

## Cores e tipografia

Consulte `src/index.css` antes de editar a interface: o bloco `@theme` é a fonte atual dos tokens. Use os tokens e classes existentes, sem importar a paleta de exemplos de outras skills nem inventar uma nova paleta para cada tela.

| Papel | Token existente | Valor atual |
| --- | --- | --- |
| Fundo | `dark-bg` | `#080b0a` |
| Painel | `dark-card` | `#101512` |
| Superfície elevada | `dark-surface` | `#171d1a` |
| Campo | `dark-input` | `#0b100e` |
| Borda | `dark-border` | `#29332e` |
| Texto principal | `dark-text` | `#f1f5f2` |
| Texto secundário | `dark-text-secondary` | `#aebbb4` |
| Texto discreto | `dark-text-muted` | `#788b82` |
| Acento e ação primária | `primary-500` / `primary-600` | `#10b981` / `#059669` |
| Estado positivo | `primary-400` | `#34d399` |

Esses hexadecimais documentam o estado atual; se o tema mudar, prevalecem os tokens em `src/index.css`. Reserve o verde para ação, foco e estado positivo. Use âmbar, laranja ou rosa apenas em avisos e estados negativos reais, seguindo os tons já usados em `src/components/ui.tsx`. As cores de `CHART_PALETTE` em `src/types/constants.ts` identificam séries e categorias de dados; não as transforme em novos acentos gerais da interface.

Use a fonte sem serifa definida por `--font-sans` (`Inter` com fallback). Alinhe quantias com números tabulares. Use `--font-mono` apenas onde a função do conteúdo justificar, como atalhos ou códigos.

## Construção da interface

- Comece pela decisão financeira que a tela precisa esclarecer. Dê destaque ao número e ao estado que orientam essa decisão; deixe detalhes e configuração em segundo plano.
- Nas telas amplas, organize grupos na ordem de decisão. Evite colunas automáticas que mudem a sequência de leitura entre módulos relacionados.
- Evolua os tokens de `src/index.css` e os componentes compartilhados de `src/components/ui.tsx` quando o padrão servir a mais de uma tela. Mantenha profundidade sutil, bordas discretas e contraste legível.
- Em formulários, mantenha rótulos persistentes e use placeholders somente para exemplos. Use pelo menos 12 px para informação operacional fora de eixos de gráfico. A competência do ciclo pertence à movimentação. Diferencie visualmente plano, realizado e valores já pagos.
- Escreva ações e estados em português claro, com o mesmo nome ao longo do fluxo. Erros e estados vazios devem indicar o próximo passo.
- Dê cor de alerta apenas a riscos ou estados que exigem atenção; uma saída comum não é alerta por si só. Projeções devem ter rótulo explícito e não parecer saldo disponível.
- Preserve foco visível por teclado e preferência por movimento reduzido. Aproveite o espaço das telas grandes para organizar dados e ações com clareza; confira os fluxos por mouse e teclado.

Antes de finalizar uma mudança visual, compare-a com as telas vizinhas e com `AGENTS.md`. Se houver navegador disponível, confira a tela renderizada no contexto de notebook e computador; relate quando essa checagem não puder ser feita.
