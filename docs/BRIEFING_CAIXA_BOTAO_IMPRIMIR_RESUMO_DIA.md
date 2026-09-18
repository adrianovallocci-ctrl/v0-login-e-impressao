# BRIEFING — botão "Imprimir resumo das reservas do dia" (interface do colaborador)

**Repo:** `v0-login-e-impressao`
**Arquivos:** `components/caixa/reservations-block.tsx` · `components/caixa/reservations.ts`
**Par no backend:** PR #561, `main @ 77e00d1` (rota + template + testes, já mergeado)
**Lock:** `docs/app/RESERVA_MESA_V1_PRODUCT_LOCK.md` — D10, §8, fatia 9 (PR #560)

Grave este arquivo em `docs/` deste repo antes de implementar. O próximo agente lê
o arquivo, não o histórico do chat.

---

## Contexto

A impressão neste sistema é **backend-mediada**. O frontend **não** fala com a
impressora, não fala com o agente local e **não monta ESC/POS**. Ele faz um POST;
o backend cria um `PrintJob`; o agente local consome por poll; o backend renderiza
o layout (32 colunas, acento removido para térmica).

A rota **existe** e está em produção:

```
POST /api/proxy/collaborator/print-reservations-day
headers: authorization: Bearer <token>, content-type: application/json
body:    { "local_date": "YYYY-MM-DD" }
200:     { "job_ids": ["..."] }
```

O corpo tem **só a data**. Não enviar reservas, contagem, nome de loja nem layout —
o backend consulta, monta o snapshot e renderiza.

**Passo 0, antes de escrever código:** confirme esse contrato contra o schema
mergeado em `backend/schemas/local_loyalty/collaborator_auth_schema.py`
(`CollaboratorPrintReservationsDayRequest` / `CollaboratorPrintReservationsDayResponse`).
Se divergir do que está acima, **reporte** — não adapte nem invente campo.
(O schema fica sob `local_loyalty/` por padrão da casa dos schemas de colaborador,
não porque seja de fidelidade.)

---

## Escopo

**1. Onde fica o botão**

"Imprimir resumo do dia", no **bloco de Reservas**, junto ao seletor de data.
**Não** no card do QR de check-in nem no do Cupom Hospedeiro (Vitrine).

**2. Qual data é enviada**

A **data selecionada no bloco** — o mesmo valor que já alimenta a lista. Nunca
"hoje" recalculado, e sem criar uma segunda fonte de data. O backend resolve o dia
civil pelo fuso do estabelecimento a partir dessa string.

**3. Estados e mensagens**

Espelhar `printVitrine` em `dashboard-screen.tsx` (Ln 229–278):

| Situação | Comportamento |
|---|---|
| preview sem token | `toast.info("Modo teste — faça login para imprimir.")` |
| durante a chamada | loading, botão desabilitado |
| 401 / 403 | mesmo tratamento de sessão do Vitrine (`clearToken`) |
| 404 | `toast.error("Impressão indisponível. Tente novamente em instantes.")` |
| 422 | `toast.error()` com o `detail` da resposta |
| outro erro HTTP | usa o `detail` da resposta, como o Vitrine |
| falha de rede | `toast.error("Falha de conexão. Tente novamente.")` |
| sucesso | `toast.success("Resumo enviado para a fila de impressão.")` |

Notas sobre três dessas linhas:

- **404** — a rota existe em `main`. Um 404 agora significa deploy ainda não
  propagado no Railway, **não** feature ausente. A copy não deve dizer "ainda não
  disponível".
- **422** — o backend devolve 422 quando não há reservas na data, e **não cria
  job**. Não deve acontecer se o item 4 funcionar, mas trate.
- **sucesso** — **não** usar "enviado para impressora". O sucesso é job
  enfileirado, não papel impresso. E **não existe painel de reimpressão** para
  este tipo de job: o "Reimprimir benefício" é exclusivo de resgates de
  fidelidade.

**4. Quando o botão está desabilitado**

Zero reservas na data selecionada → desabilitado. Evita papel em branco e evita o
422. Datas passadas → habilitado normalmente.

**`count` NÃO é `items.length` pós-filtro.** O botão habilita pelo mesmo conjunto
que o backend imprime: `pending` + `confirmed` da **data selecionada**, sem filtro
de status da UI.

Razão: o papel ignora o chip de status (regra do backend, já implementada). Se o
colaborador filtrar "só pendentes" num dia com 3 confirmadas, a lista visual zera
mas o papel tem 3 linhas — o botão não pode desaparecer.

Use `summary.reservations_count` (ou o equivalente da query do dia), **desde que
seja da data selecionada**. O resumo do topo começa com "Hoje:" — se ele for
calculado apenas para hoje, **não o use**: derive do retorno não-filtrado da data
selecionada. Verifique antes de assumir.

Regra geral, para sobreviver a filtros futuros (ambiente, busca): **o critério de
habilitar espelha o escopo do que é impresso, nunca o escopo do que está visível.**

**5. Sem contador de cópias**

Um clique, um resumo. Diferente do Vitrine, que tem `− 1 +` porque N cópias é
intencional lá.

---

## Teste

O harness deste repo só testa função pura (`components/caixa/reservations.test.ts`).
A decisão de habilitar **não fica dentro do componente** — extraia para
`reservations.ts`, mesmo padrão de `resolveCaixaActionIntent`:

```ts
canPrintReservationsDay({ count, loading, preview, hasToken }) -> boolean
```

Casos obrigatórios:

| Caso | Esperado |
|---|---|
| `count` 0 | `false` |
| `loading` | `false` |
| preview sem token | `false` |
| `count` > 0 com token | `true` |
| **`count` > 0 com a lista visual vazia por filtro de status** | **`true`** |

O último é o que importa dos cinco: é o único que falha se alguém trocar a fonte do
`count` de volta para `items.length`. Os outros quatro passam mesmo com o bug.

Datas em teste sempre relativas ao `now`, nunca absolutas.

---

## Fora de escopo — não fazer

- Qualquer layout, coluna, ESC/POS ou texto do papel. É backend, e já está feito
  (`template_reservations_day.py`, com golden versionado).
- Reutilizar o painel "Reimprimir benefício".
- Enviar telefone do cliente em qualquer campo.
- Mexer no `dashboard-screen.tsx` além do necessário para o botão aparecer.
- Contador de cópias, reimpressão, pré-visualização do papel.

---

## Entregar

Diff + saída dos testes.

Se o contrato do Passo 0 não bater com o schema mergeado, **reporte antes de
implementar** em vez de adaptar.
