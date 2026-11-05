# Supabase — Crypto Arbitrage Portal

O Supabase é a camada de persistência e serviços do portal. O repositório mantém o código-fonte das Edge Functions, o schema de referência e as migrations incrementais.

## Dados armazenados

- `arbitrage_assets`: catálogo central de ativos, identificadores CMC/CoinGecko, tipo, moeda de referência e estado habilitado.
- `arbitrage_configurations`: estratégias permanentes, âncora, comparativos, unidade de referência, janela estatística e configuração do monitoramento.
- `trades` e `trade_legs`: operações reais e suas etapas.
- `arbitrage_asset_price_history`: histórico complementar de ativos adicionados manualmente.
- Tabelas e views auxiliares do monitoramento horário e das notificações.

O histórico oficial diário continua no arquivo versionado `data.csv`; o histórico complementar armazenado no Supabase não é anexado a esse arquivo.

## Edge Functions

| Função | Responsabilidade |
|---|---|
| `live-prices` | Cotações atuais via CoinGecko e consulta de histórico via CoinMarketCap |
| `hourly-arbitrage-v4` | Monitoramento horário das estratégias habilitadas e processamento de eventos/notificações |

O código-fonte está em `supabase/functions/`. A função `live-prices` valida os CoinGecko IDs atuais consultando o catálogo de ativos habilitados no próprio Supabase; não depende de uma lista fixa de símbolos.

## Configuração inicial

1. Crie um projeto Supabase.
2. Aplique o schema de referência em `supabase/schema.sql` e as migrations necessárias de `supabase/migrations/`, respeitando a ordem dos nomes/versões.
3. Em **Project Settings → API**, obtenha a URL do projeto e uma chave pública (publishable ou anon).
4. Configure `supabase/config.js` com a URL e a chave pública:

```js
window.CRYPTO_ARB_SUPABASE_CONFIG = {
  url: 'https://SEU-PROJETO.supabase.co',
  anonKey: 'SUA_CHAVE_PUBLICA',
};
```

5. Configure no ambiente do Supabase os segredos exigidos pelas Edge Functions, incluindo a service role key e os segredos de notificação utilizados pelo projeto.

A configuração real do projeto não deve ser substituída por valores de exemplo durante o backup.

## Segurança

- A chave pública (publishable/anon) pode ser usada no navegador e não substitui as políticas de acesso.
- **Nunca** coloque a `service_role key` ou outros segredos em `supabase/config.js`, no HTML, nos scripts publicados ou em arquivos versionados.
- As tabelas expostas devem permanecer protegidas por RLS e pelas políticas específicas do projeto.
- O fluxo de autenticação do portal aplica MFA para operações protegidas, de acordo com as políticas e a implementação atuais.

## Publicação e manutenção

- O GitHub Pages é publicado pelo workflow `.github/workflows/deploy-pages.yml`.
- A captura diária do histórico oficial é executada por `.github/workflows/capture-prices.yml`.
- O código-fonte das Edge Functions deve ser mantido sincronizado com a versão implantada no Supabase.
- As migrations em `supabase/migrations/` documentam a evolução do banco. Não remova migrations já aplicadas no projeto de produção.
