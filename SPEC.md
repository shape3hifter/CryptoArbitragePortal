# Especificação — Crypto Arbitrage Portal

## 1. Objetivo

Analisar relações de valor relativo entre criptoativos, registrar operações reais, simular fechamentos e monitorar estratégias configuradas pelo usuário.

O modelo compara cada ativo com uma âncora cripto. A unidade de referência (USD, BRL ou EUR) é independente e usada para exibição/conversão de preços.

## 2. Fontes de dados e persistência

### Histórico oficial

- Arquivo: `data.csv`.
- Observação de referência: 21:00 em `America/Sao_Paulo`.
- Os preços são armazenados em USD; a interface converte para a unidade de referência selecionada.
- A captura é executada por `scripts/capture_prices_runner.py`, que consulta o catálogo central de ativos do Supabase.
- O workflow diário roda às 00:30 UTC (21:30 em São Paulo), após o horário de referência.
- `capture-log.json` registra o resultado e o horário real da execução.

### Histórico complementar

Históricos de ativos adicionados manualmente são consultados via Edge Function `live-prices` e persistidos em `public.arbitrage_asset_price_history`. Esses registros são sincronizados pelo portal e permanecem separados do histórico oficial `data.csv`.

### Catálogo central

A tabela `public.arbitrage_assets` armazena símbolo, nome, tipo, identificadores CMC/CoinGecko, estado habilitado, metadados de moeda e fonte de preço. É a fonte de verdade para resolução de ativos e identificadores de cotação.

A tabela `public.arbitrage_configurations` armazena as estratégias permanentes: identificador, nome, unidade de referência, âncora, comparativos, janela estatística e estado do monitoramento automático.

`config.json` mantém somente parâmetros operacionais da captura, como unidade base, fuso e horário. Não contém lista de estratégias nem lista de fallback de ativos.

## 3. Análise estatística

Para cada data alinhada, a relação é:

`ratio = preço_do_comparativo / preço_da_âncora`

A janela estatística é definida na configuração da estratégia.

- AVG: média da relação.
- STDEV.S: desvio-padrão amostral.
- Z-Score: `(ratio - AVG) / STDEV.S`.
- BUY: Z-Score menor ou igual a -1,5.
- HOLD: Z-Score entre -1,5 e +1,5.
- SELL: Z-Score maior ou igual a +1,5.

O gráfico de valor relativo pode ser indexado em 100 para comparação visual; valores absolutos permanecem nos cards e tabelas.

A unidade de referência e a âncora cripto são independentes. Exemplo: para PEPE/ETH e UNI/ETH, a âncora é ETH e a unidade de referência pode continuar sendo USD.

## 4. Cotações atuais

A Edge Function `live-prices` fornece cotações atuais da CoinGecko e históricos consultados na CoinMarketCap. Para cotações atuais, os CoinGecko IDs são validados dinamicamente contra os ativos do tipo CRYPTO habilitados em `arbitrage_assets`. Não existe allowlist fixa de moedas no código implantado.

O módulo de Trades resolve o CoinGecko ID do ativo a partir do catálogo carregado pelo portal, permitindo simular operações com ativos adicionados posteriormente, desde que estejam habilitados e tenham CoinGecko ID cadastrado.

## 5. Configurações e monitoramento

- A tela **Configurações** cria, edita e habilita estratégias permanentes no Supabase.
- A tela **Arbitragens** permite experimentação temporária dos parâmetros, sem alterar o cadastro permanente.
- Novas estratégias começam com monitoramento automático desligado.
- A ativação depende da disponibilidade do histórico e dos identificadores necessários.
- A Edge Function `hourly-arbitrage-v4` processa somente estratégias com `auto_monitoring_enabled = true`, respeitando a janela individual.

## 6. Trades

O módulo `trades-ui.js` registra e acompanha trades no PostgreSQL, incluindo ativo âncora, ativo atual, quantidades, relação de entrada, data e resultado de fechamento. O acesso utiliza autenticação e verificação MFA conforme a política do projeto.

A simulação de fechamento consulta preços atuais e calcula o valor potencial na âncora. É uma simulação: não grava o trade e não incorpora taxas, slippage, spread ou impacto de mercado.

## 7. Publicação e testes

- Branch de produção: `main`.
- GitHub Pages publica o diretório `dist/`, construído por `scripts/build_site.py`.
- `.github/workflows/deploy-pages.yml`: publicação.
- `.github/workflows/capture-prices.yml`: captura diária.
- `.github/workflows/validate-configurations.yml`: compilação, testes automatizados, build e verificações de JavaScript.

Comandos de validação:

```bash
python -m py_compile scripts/capture_prices.py scripts/capture_prices_runner.py scripts/build_site.py
python -m unittest discover -s tests -v
python scripts/build_site.py
node --check arbitrage-config-ui.js
node --check trades-ui.js
node --check runtime-fixes.js
```

## 8. Histórico de versões

Implementações substituídas e ferramentas de bootstrap antigas são preservadas em `_Versões não utilizadas/`. Elas não são referenciadas pelo workflow de build/publicação e não fazem parte da versão operacional.
