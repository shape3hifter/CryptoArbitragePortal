# Versões não utilizadas

Esta pasta preserva arquivos históricos que não fazem parte da execução atual do Crypto Arbitrage Portal. Eles foram retirados dos caminhos operacionais depois de verificar que não são utilizados pelo build, pela publicação ou pelas rotinas atuais.

## Organização

```text
_Versões não utilizadas/
├── Bootstrap/
│   └── bootstrap_base.py
├── Trades/
│   ├── trades.js
│   ├── trades-auth.js
│   └── trades-app.js
└── bootstrap-manifest.json
```

## Bootstrap

- `Bootstrap/bootstrap_base.py`: ferramenta antiga de bootstrap que reconstruía integralmente `data.csv` a partir de uma lista fixa de ativos.
- `bootstrap-manifest.json`: manifesto produzido pela execução histórica dessa ferramenta. Descreve a carga inicial de dados de 16/08/2025 a 15/08/2026.

A rotina atual é `scripts/capture_prices_runner.py`, que atualiza os snapshots a partir do catálogo central do Supabase e preserva o histórico existente.

**Atenção:** não execute o bootstrap antigo como rotina operacional. Ele substitui o arquivo histórico `data.csv`.

## Trades

- `Trades/trades.js`, `Trades/trades-auth.js` e `Trades/trades-app.js`: implementações e adaptadores de versões anteriores do módulo Trades.
- A implementação atual é `trades-ui.js`, com autenticação/MFA e persistência no Supabase.

## Regras de manutenção

- Os arquivos desta pasta são preservados somente para consulta e recuperação histórica.
- Não são importados pelo portal, não são copiados para `dist/` e não devem ser incluídos nos workflows atuais.
- Não apagar migrations do Supabase já aplicadas em produção como parte de uma limpeza de arquivos.
- Antes de arquivar qualquer outro arquivo, verificar referências no código, nos workflows e no processo de publicação.
