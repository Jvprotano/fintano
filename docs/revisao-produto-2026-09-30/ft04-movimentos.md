# FT-04 — Tipo, origem e datas dos movimentos

## Evidência

- `LedgerEntry` guarda valor, competência opcional, `date` e observação, mas não o tipo. `isOpeningBalance` interpreta a observação; uma observação livre igual a “Aporte inicial” muda o resultado financeiro.
- O contrato de backup já exige `kind`; `ledgerToV7` o infere pelo texto e `ledgerFromV7` o descarta. Um ciclo de exportar/importar pode alterar a classificação.
- Cadastro de posição/reserva usa “Valor aplicado hoje” e cria `Aporte inicial`, que fica fora do aporte realizado. Não há escolha de saldo pré-existente ou aporte do ciclo.
- Os formulários registram `nowIso()` como data real. Competência ativa já existe em parte do fluxo, mas dívida e abertura não a recebem sempre.

## Contrato de execução

1. Cada movimento canônico possui tipo explícito. Abertura não é aporte; contribuição e resgate afetam o fluxo do ciclo; amortização reduz passivo. Transferência recebe tipo e origem/destino estáveis em FT-16, sem inventar agora uma segunda operação.
2. Entradas legadas sem tipo são classificadas **uma vez**. Valor e data não mudam. Notas que antes faziam a entrada parecer saldo inicial recebem sinal de ambiguidade e ação para confirmar a natureza. Outras entradas recebem tipo inferido pelo sinal e dono. A versão anterior do documento fica recuperável antes da migração.
3. `date` continua como data real da operação; `recordedAt` guarda o instante de registro quando o usuário informa outra data. Mudar a competência não altera nenhuma das duas datas.
4. Na criação de posição e reserva, a pessoa escolhe “Saldo que já existia” ou “Aporte deste ciclo”. O segundo recebe a competência ativa por padrão. Uma observação livre nunca muda esse tipo.
5. Backup exporta/importa tipo, competência e datas sem inferência no caminho normal. Leitura de v7 continua válida. O leitor informa casos ambíguos sem decidir silenciosamente por uma reclassificação financeira diferente.

## Resultado verificado

- Abertura de R$ 100 e aporte de R$ 200 criados em posições sintéticas ficaram com tipos distintos; a observação “Aporte inicial” no aporte não mudou seu efeito. O realizado do ciclo foi R$ 200, a abertura foi R$ 100 e o patrimônio financeiro foi R$ 300.
- Mudar a competência do aporte de setembro para outubro retirou R$ 200 do realizado de setembro sem alterar `date` nem `recordedAt`. O backup preservou tipo, origem, competência e ambos os instantes. Amortização de dívida passou pelo mesmo teste de datas e competência.
- Uma entrada legada ambígua foi classificada uma vez, sinalizada para confirmação e conservou valor, data e competência. A escolha explícita de aporte persistiu após exportar/importar. Uma cópia automática e os bytes brutos anteriores à migração foram guardados. Se o backup prévio falha, a migração bloqueia a abertura sem alterar o documento.
- A reserva legada também é incluída no backup criado antes do primeiro render. O formulário impede gravar um novo movimento com a data real apagada.
- Testes focados, suíte completa (385 passaram, 3 ignorados), build e lint passaram. A árvore visual do navegador ficou indisponível nesta retomada; o fluxo de interface foi conferido por código e o comportamento integrado por testes de hooks e conversão de backup. A revisão renderizada permanece para a próxima sessão com navegador disponível.

## Limite para FT-05

O contrato atual de backup ainda tem lacunas fora do livro-razão. A cópia bruta da migração preserva o documento exato, mas o produto usa o backup automático validado como caminho de restauração. FT-05 revisará conversões, avisos e recuperação desse arquivo bruto.
