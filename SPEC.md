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


## Configuração central de estratégias

A lista oficial de estratégias está em `public.arbitrage_configurations`. Seus campos principais são `id`, `user_id`, `name`, `reference_unit`, `anchor_symbol`, `comparative_symbols`, `default_lookback_days` e `auto_monitoring_enabled`.

O identificador de cada estratégia é estável e é utilizado pelos registros de trades, observações horárias, estados de monitoramento e prévias de notificações. Restrições de chave estrangeira impedem a remoção de estratégias que possuam histórico ou trades associados.

O catálogo central de ativos está em `public.arbitrage_assets`. Além dos identificadores CoinMarketCap, ele armazena `coingecko_id` e `price_source`, permitindo que a captura e o motor resolvam os ativos sem listas fixas de estratégias no código.

## Portal e análise experimental

A seção **Configurações** grava parâmetros permanentes no Supabase. A seção **Arbitragens** utiliza uma cópia temporária dos parâmetros enquanto o usuário experimenta. Essas mudanças não são persistidas no cadastro; ao recarregar a página, o portal retorna aos padrões salvos.

A disponibilidade para análise é calculada com base no histórico alinhado entre Anchor e comparativos. A disponibilidade de conversão para a unidade de referência é avaliada separadamente. O monitoramento automático é uma decisão explícita, começa desligado em estratégias novas e só pode ser ativado quando houver dados e identificadores de cotação suficientes.

## Motor automático

A Edge Function `hourly-arbitrage-v4` lê as configurações com `auto_monitoring_enabled = true` e utiliza a janela estatística individual. Os preços atuais são obtidos pelos identificadores CoinGecko associados ao catálogo de ativos. O acompanhamento de trades já abertos permanece separado da geração de novas oportunidades.

## Captura diária

`scripts/capture_prices.py` e `scripts/capture_prices_runner.py` preferem o catálogo central de ativos do Supabase. `config.json` mantém parâmetros operacionais e uma lista de fallback para continuidade da captura em caso de indisponibilidade do catálogo.
