# Crypto Arbitrage Portal — Automated MVP

Este pacote adiciona automação diária ao MVP anterior.

## O que mudou

- O portal continua usando `data.csv` como base histórica.
- `config.json` define Fiat, Crypto Anchor e 2–5 comparativos.
- `scripts/capture_prices.py` consulta as fontes configuradas e grava no `data.csv` a observação de referência das 21:00 BRT, por convenção do modelo.
- `.github/workflows/capture-prices.yml` agenda a captura diariamente às 00:30 UTC, equivalente a 21:30 em São Paulo. A execução ocorre após o horário de referência para dar tempo à disponibilidade das fontes; o dado gravado continua representando 21:00 BRT.
- `capture-log.json` registra o horário real da execução e o status da captura.
- `.github/workflows/deploy-pages.yml` publica o portal no GitHub Pages.

## API CMC

A versão Keyless Public API da CoinMarketCap funciona sem API key para endpoints suportados. O MVP usa o endpoint `GET /public-api/v3/cryptocurrency/quotes/latest`.

## Como ativar

1. Crie um repositório GitHub para o conteúdo deste pacote e coloque os arquivos na branch `main`.
2. Em `config.json`, ajuste `anchor` e `comparatives` quando desejar.
3. Em Settings → Pages, selecione GitHub Actions como fonte de publicação.
4. O workflow `capture-prices.yml` executará diariamente às 00:30 UTC (21:30 em São Paulo), buscará a observação de referência das 21:00 BRT e fará commit do `data.csv` atualizado.
5. O workflow `deploy-pages.yml` publica o portal e também o atualiza quando `data.csv` mudar.

## Teste manual

Em GitHub Actions, rode `Capture daily prices` → `Run workflow`.

Localmente, execute:

```bash
python3 scripts/capture_prices.py
```

## Observação sobre o horário

GitHub Actions schedules podem sofrer atrasos ocasionais. Por isso, o script registra o `executed_at` e o status da captura em `capture-log.json`. O horário de execução do workflow é 00:30 UTC (21:30 em São Paulo), enquanto o `data.csv` mantém a convenção de negócio de 21:00 BRT para a observação diária.
