# FinTano — V17

Planejamento financeiro pessoal, com dados locais no navegador. Uso exclusivo do proprietário em notebook e computador, em telas grandes, com mouse e teclado.

A aplicação atual é a base V17. A partir dela, o trabalho segue uma única fila por prioridade, com etapas utilizáveis e regra máxima KISS.

## Documentação

- [Prioridades e execução](docs/prioridades.md): pendências, ordem, agrupamentos e critérios de conclusão. Próximo item: FT-16.
- [Funcionamento atual](docs/funcionamento.md): abas, ciclo, plano fixado, realizados e regras financeiras.
- [Dados e backup](docs/dados-e-backup.md): fontes, contrato atual e recuperação.
- [Instruções permanentes](AGENTS.md): contexto do produto e regras para os agentes.

## Abas

| Aba | Decisão ou ação |
| --- | --- |
| Ciclo | Registrar o realizado, acompanhar a verba para Desejos e fechar o ciclo. |
| Planejar | Distribuir renda, custos, Desejos e aporte; fixar a referência do plano. |
| Cartões | Conferir compras e faturas e registrar pagamento por cartão. |
| Patrimônio | Acompanhar posições, reserva, metas, bens, dívidas e movimentos. |
| Histórico | Consultar ciclos fechados, comparar plano e realizado e revisar o passado. |
| Futuro | Organizar entradas e saídas esperadas e consultar projeções. |

## Executar localmente

```powershell
npm.cmd ci
npm.cmd run dev
```

O Vite informa o endereço local. Para gerar a aplicação: `npm.cmd run build`.

Tecnologias: React, TypeScript, Vite e Tailwind CSS. Os componentes estão em `src/components`; os hooks em `src/hooks`; cálculos em `src/lib`; persistência e contrato de backup em `src/data`. Tokens e controles compartilhados estão em `src/index.css` e `src/components/ui.tsx`.

Conferir somente o fluxo afetado e seus dados. Testes, build e outras verificações são usados quando o risco da alteração justificar, sem objetivo de cobertura.

## Dados

Os fatos financeiros ficam no documento `fintano_data_v7`. A exportação atual gera `fintano-backup-v9-AAAA-MM-DD.json`, com valores em centavos, IDs e referências preservados. V17 é o nome da base do produto; não altera o formato técnico de armazenamento ou backup.

Exporte um backup para guardar uma cópia externa. Documento inválido e falha de gravação devem preservar a origem; restauração valida os dados antes de substituí-los. Consulte o [contrato de dados](docs/dados-e-backup.md) ao alterar persistência.

Licença: MIT.
