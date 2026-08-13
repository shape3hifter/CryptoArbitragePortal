# Crypto Arbitrage Portal — Automated MVP

Este pacote adiciona automação diária ao MVP anterior.

## O que mudou

- O portal continua usando `data.csv` como base histórica.
- `config.json` define Fiat, Crypto Anchor e 2–5 comparativos.
- `scripts/capture_prices.py` consulta a CoinMarketCap Keyless Public API e grava uma observação diária às 21:00 BRT por convenção do modelo.
- `.github/workflows/capture-prices.yml` agenda a captura diariamente às 00:00 UTC, que corresponde a 21:00 em São Paulo.
- `capture-log.json` registra o horário real de execução e qualquer atraso em relação às 21:00.
- `.github/workflows/pages.yml` permite publicar o portal no GitHub Pages.

## API CMC

A versão Keyless Public API da CoinMarketCap funciona sem API key para endpoints suportados. O MVP usa o endpoint `GET /public-api/v3/cryptocurrency/quotes/latest`.

## Como ativar

1. Crie um repositório GitHub para o conteúdo deste pacote e coloque os arquivos na branch `main`.
2. Em `config.json`, ajuste `anchor` e `comparatives` quando desejar.
3. Em Settings → Pages, selecione GitHub Actions como fonte de publicação.
4. O workflow `capture-prices.yml` executará diariamente às 21:00 BRT (00:00 UTC) e fará commit do `data.csv` atualizado.
5. O workflow `pages.yml` publica o portal e também o atualiza quando `data.csv` mudar.

## Teste manual

Em GitHub Actions, rode `Capture daily prices` → `Run workflow`.

Localmente, execute:

```bash
python3 scripts/capture_prices.py
```

## Observação sobre o horário

GitHub Actions schedules podem sofrer atrasos ocasionais. Por isso, o script registra o `executed_at` e `delay_minutes` em `capture-log.json`. O `data.csv` mantém a convenção de negócio `21:00` para a observação diária.
