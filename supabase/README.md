# Supabase — Persistent Trades

O portal usa o Supabase/PostgreSQL para armazenar **trades**, etapas da operação e regras de alerta. Os preços continuam no `data.csv` e não são movidos para o banco.

## Configuração inicial

1. Crie um projeto no Supabase.
2. No **SQL Editor**, abra `supabase/schema.sql` e execute o arquivo inteiro.
3. Em **Project Settings → API**, copie:
   - **Project URL**
   - **anon/public key**
4. Edite `supabase/config.js` no repositório e preencha:

```js
window.CRYPTO_ARB_SUPABASE_CONFIG = {
  url: 'https://SEU-PROJETO.supabase.co',
  anonKey: 'SUA_CHAVE_ANON_PUBLICA',
};
```

5. O portal usa autenticação por e-mail e senha para que os registros de trades fiquem associados ao usuário autenticado.

## Segurança

A `anon/public key` pode ser usada no navegador. **Nunca** coloque a `service_role key` neste arquivo, no `index.html`, em `trades.js` ou em qualquer arquivo publicado pelo GitHub Pages.

As tabelas possuem Row Level Security (RLS) e as políticas restringem os dados ao `auth.uid()` do usuário autenticado.

## Desenvolvimento / publicação

O site publicado é construído pelo workflow com:

```bash
python scripts/build_site.py
```

O resultado é colocado em `dist/` e é esse diretório que o GitHub Pages publica.

O próximo passo do módulo é acrescentar a interface de regras de alerta e, depois, a integração com o canal de notificação (WhatsApp/SMS).
