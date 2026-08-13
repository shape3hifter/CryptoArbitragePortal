# Especificação — MVP automatizado

## Objetivo

Eliminar o trabalho operacional diário de abrir as páginas do CoinMarketCap e copiar as cotações de ADA, NIGHT e SNEK às 21:00 BRT para a base histórica do portal.

## Fonte

CoinMarketCap Keyless Public API:

`https://pro-api.coinmarketcap.com/public-api/v3/cryptocurrency/quotes/latest`

A consulta é feita por símbolo, com `convert=USD`.

## Agendamento

GitHub Actions:

`0 0 * * *` (UTC) → 21:00 em America/Sao_Paulo.

O horário oficial do modelo continua sendo 21:00 BRT. O horário real de execução é armazenado em `capture-log.json`.

## Base histórica

`data.csv`

Colunas:

- `date`
- `time`
- `fiat`
- `symbol`
- `price`

O script remove e substitui, sem duplicar, qualquer registro da mesma data/horário/fiat/asset.

## Configuração

`config.json`:

- `fiat`: moeda de cotação
- `timezone`: `America/Sao_Paulo`
- `capture_time`: `21:00`
- `anchor`: crypto anchor
- `comparatives`: 2–5 ativos comparativos

## Validações

- Todos os ativos configurados precisam retornar preço positivo.
- Se um ativo falhar, a execução falha e a base não é atualizada.
- A consulta é repetida até três vezes em caso de falha transitória.
- O log registra atraso de execução.

## Camada do portal

O portal usa `data.csv` para recalcular:

`ratio = ativo / anchor`

`AVG = média da janela`

`STDEV.S = desvio-padrão amostral`

`Z = (ratio - AVG) / STDEV.S`

`BUY <= -1.5`, `HOLD`, `SELL >= +1.5`.

O gráfico de valor relativo é indexado em 100 apenas para comparação visual; os valores absolutos continuam nos cards e tabelas.
