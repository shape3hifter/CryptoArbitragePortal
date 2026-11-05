# Crypto Arbitrage Portal

Portal pessoal para análise de valor relativo entre criptoativos, acompanhamento de operações e monitoramento automatizado de estratégias.

## Arquitetura atual

- **Interface:** aplicação estática publicada no GitHub Pages. `index.html` contém a interface principal; `scripts/build_site.py` monta a versão publicável em `dist/`.
- **Persistência:** Supabase/PostgreSQL armazena o catálogo central de ativos, configurações de arbitragem, trades e histórico complementar de preços.
- **Histórico oficial:** `data.csv` mantém a série diária oficial usada pelo portal. A observação de referência é 21:00 no horário de São Paulo.
- **Catálogo:** `public.arbitrage_assets` é a fonte central dos metadados e identificadores CoinMarketCap/CoinGecko. `public.arbitrage_configurations` armazena as estratégias permanentes.
- **Cotações atuais:** a Edge Function `live-prices` valida os CoinGecko IDs contra os ativos habilitados no catálogo do Supabase antes de consultar a CoinGecko. Novos ativos podem ser utilizados sem uma lista fixa no código.
- **Histórico complementar:** históricos carregados para ativos adicionados manualmente são armazenados em `arbitrage_asset_price_history`; não são incorporados ao `data.csv`.
- **Monitoramento:** a Edge Function `hourly-arbitrage-v4` processa estratégias com monitoramento automático habilitado e registra os eventos/notificações correspondentes.

## Rotinas do GitHub Actions

| Workflow | Função |
|---|---|
| `.github/workflows/deploy-pages.yml` | Constrói e publica o portal no GitHub Pages |
| `.github/workflows/capture-prices.yml` | Executa a captura diária e atualiza `data.csv` e `capture-log.json` |
| `.github/workflows/validate-configurations.yml` | Compila scripts, executa testes, constrói o portal e verifica JavaScript |

A captura diária é agendada para 00:30 UTC (21:30 em São Paulo). O horário de referência gravado continua sendo 21:00. O processo consulta o catálogo central do Supabase; se ele estiver indisponível ou não contiver os dados necessários, a captura falha explicitamente, sem recorrer a uma lista local divergente.

## Estrutura principal

- `index.html` — interface principal, análise estatística e catálogo de ativos.
- `arbitrage-config-ui.js` — cadastro e gestão das estratégias permanentes.
- `trades-ui.js` — autenticação/MFA, registro e acompanhamento de trades e simulação de fechamento.
- `runtime-fixes.js` — ajustes de execução e compatibilidade de cotações.
- `simulation-display-fix.js`, `trades-launcher.js`, `trades-arbitrage-refresh.js`, `trades-runtime-guard.js` — módulos auxiliares instalados pelo workflow de publicação.
- `scripts/capture_prices.py`, `scripts/capture_prices_runner.py` — captura e validação do histórico diário.
- `scripts/build_site.py` — construção do diretório publicável.
- `supabase/migrations/` — histórico versionado das alterações do banco.
- `supabase/functions/` — código-fonte das Edge Functions.
- `tests/` — testes automatizados da captura.

## Construção e teste local

Requisitos: Python 3.12+ e Node.js para as verificações JavaScript.

```bash
python -m py_compile scripts/capture_prices.py scripts/capture_prices_runner.py scripts/build_site.py
python -m unittest discover -s tests -v
python scripts/build_site.py
node --check arbitrage-config-ui.js
node --check trades-ui.js
node --check runtime-fixes.js
```

O diretório `dist/` é gerado durante a construção e não é a fonte de edição.

## Segurança e configuração

- `supabase/config.js` contém somente a URL do projeto e a chave pública (publishable/anon), apropriada para uso no navegador.
- **Nunca** grave a `service_role key`, chaves secretas de APIs ou credenciais privadas no repositório ou em arquivos publicados.
- Segredos usados pelas Edge Functions devem permanecer nas variáveis de ambiente/Secrets do Supabase.
- As tabelas expostas usam Row Level Security (RLS). As operações protegidas do portal exigem autenticação e MFA conforme as políticas e o fluxo da aplicação.

## Fontes de verdade

- Código e rotinas de publicação: branch `main`.
- Configurações persistentes e catálogo de ativos: Supabase.
- Histórico diário oficial: `data.csv`.
- Histórico complementar de ativos: Supabase, em tabela própria.
- `_Versões não utilizadas/` contém implementações históricas preservadas e não participa da construção ou publicação atual.
