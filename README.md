# Caixa — Login e impressão térmica

Frontend colaborador (PDV) do Motor de Engajamento.

## Rota (Fase 5c)

`/{segment}`:

- **UUID** (`41ca0a64-…`) → fluxo legado intacto
- **Slug** (`molinopizzeria001`) → `GET /public/cashier-tenant/{slug}` → `company_id`
- **Inválido** → 404 (Next.js `notFound`)

## Env

```
BACKEND_BASE_URL=https://motor-de-engajamento-backend-production.up.railway.app
```

## Scripts

```bash
npm install
npm run dev
npm run test:unit
npm run build
```

## Auditoria 5c

| Check | Descrição |
|-------|-----------|
| C-A9 | `/41ca0a64-355c-4b02-b115-630a22e081e1` abre Molino |
| C-A10 | `/molinopizzeria001` resolve Molino |
| C-A11 | slug inexistente → 404 limpo |
