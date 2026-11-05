# Versões não utilizadas

Esta pasta preserva código e ferramentas de versões anteriores do Crypto Arbitrage Portal. Os arquivos foram retirados da raiz/caminho operacional após confirmação de que não são referenciados pelo workflow atual de build e publicação.

## Conteúdo preservado

- `trades.js`, `trades-auth.js`, `trades-app.js`: implementações anteriores do módulo Trades. A implementação atual é `trades-ui.js`.
- `scripts/bootstrap_base.py`: ferramenta antiga de bootstrap que reconstruía integralmente `data.csv`. A rotina atual é `scripts/capture_prices_runner.py`, que atualiza o snapshot diário a partir do catálogo central do Supabase.

**Atenção:** estes arquivos são preservados apenas para consulta histórica. Não são importados pelo portal, não são copiados para `dist/` e não devem ser executados como parte da rotina atual. Em particular, o bootstrap antigo substitui a base histórica `data.csv`.
