(() => {
  'use strict';

  const LOOKBACKS = [30, 60, 90, 180, 365];
  const $ = (id) => document.getElementById(id);
  let client = null;
  let session = null;
  let configs = [];
  let editId = null;
  let originalEdit = null;
  let syncingAssets = false;
  let lastAssetSignature = '';
  let authSubscription = null;

  const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[c]);

  function status(message, tone = '') {
    const el = $('configAccessStatus');
    if (!el) return;
    el.textContent = message || '';
    el.className = 'config-access-status' + (tone ? ' ' + tone : '');
  }

  function getModelAssets() {
    return window.cryptoArbitrageGetAssets?.() || {};
  }

  function getModelConfigs() {
    return window.cryptoArbitrageGetConfigurations?.() || [];
  }

  function currentReadiness(config) {
    return window.cryptoArbitrageGetReadiness?.(config) || {
      analysisReady: false, monitorReady: false, message: 'Aguardando verificação da base histórica.'
    };
  }

  async function getClient() {
    if (client) return client;
    const cfg = window.CRYPTO_ARB_SUPABASE_CONFIG || {};
    if (!cfg.url || !cfg.anonKey) throw new Error('Configuração pública do Supabase não encontrada.');
    const mod = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/+esm');
    client = mod.createClient(cfg.url, cfg.anonKey);
    return client;
  }

  function mapConfig(row) {
    return {
      id: row.id,
      name: row.name,
      referenceUnit: row.reference_unit,
      anchor: row.anchor_symbol,
      comparativesDefault: Array.isArray(row.comparative_symbols) ? row.comparative_symbols : [],
      lookback: Number(row.default_lookback_days) || 60,
      autoMonitoringEnabled: Boolean(row.auto_monitoring_enabled),
      userId: row.user_id
    };
  }

  function modelConfigToRow(config) {
    return {
      id: config.id,
      user_id: session.user.id,
      name: String(config.name || '').trim(),
      reference_unit: String(config.referenceUnit || 'USD').toUpperCase(),
      anchor_symbol: String(config.anchor || '').toUpperCase(),
      comparative_symbols: [...(config.comparativesDefault || [])].map((x) => String(x).toUpperCase()),
      default_lookback_days: Number(config.lookback) || 60,
      auto_monitoring_enabled: Boolean(config.autoMonitoringEnabled)
    };
  }

  function assetSignature(assets) {
    return JSON.stringify(Object.keys(assets).sort().map((symbol) => {
      const a = assets[symbol] || {};
      return [symbol, a.name || symbol, a.type || 'CRYPTO', a.cmc_id || null,
        a.enabled !== false, a.base_quote || 'USD'];
    }));
  }

  async function loadAssetCatalog() {
    const { data, error } = await client
      .from('arbitrage_assets')
      .select('symbol,name,type,cmc_id,enabled,base_quote')
      .order('symbol');
    if (error) throw error;
    window.cryptoArbitrageMergeAssets?.(data || []);
    await syncAssetCatalog();
  }

  async function syncAssetCatalog() {
    if (!client || !session || syncingAssets) return;
    const assets = getModelAssets();
    const signature = assetSignature(assets);
    if (!Object.keys(assets).length || signature === lastAssetSignature) return;
    const rows = Object.entries(assets).map(([symbol, asset]) => ({
      symbol: String(symbol).toUpperCase(),
      user_id: session.user.id,
      name: String(asset.name || symbol),
      type: asset.type === 'FIAT' ? 'FIAT' : 'CRYPTO',
      cmc_id: Number.isInteger(Number(asset.cmc_id)) && Number(asset.cmc_id) > 0 ? Number(asset.cmc_id) : null,
      enabled: asset.enabled !== false,
      base_quote: String(asset.base_quote || 'USD')
    }));
    if (!rows.length) return;
    syncingAssets = true;
    try {
      const { error } = await client.from('arbitrage_assets').upsert(rows, { onConflict: 'symbol' });
      if (error) throw error;
      lastAssetSignature = signature;
    } catch (error) {
      status('Catálogo local mantido. Não foi possível sincronizar os ativos com o Supabase: ' + (error.message || error), 'warn');
    } finally {
      syncingAssets = false;
    }
  }

  async function loadConfigurations(resetDraftId = null) {
    if (!client || !session) return;
    const { data, error } = await client
      .from('arbitrage_configurations')
      .select('id,user_id,name,reference_unit,anchor_symbol,comparative_symbols,default_lookback_days,auto_monitoring_enabled,created_at,updated_at')
      .order('created_at', { ascending: true });
    if (error) throw error;
    configs = (data || []).map(mapConfig);
    window.cryptoArbitrageReplaceConfigurations?.(configs, resetDraftId);
    renderList();
  }

  function enabledAssets() {
    return Object.entries(getModelAssets())
      .map(([symbol, asset]) => ({ symbol, ...asset }))
      .filter((asset) => asset.enabled !== false);
  }

  function cryptoAssets() {
    return enabledAssets()
      .filter((asset) => asset.type === 'CRYPTO')
      .sort((a, b) => a.symbol.localeCompare(b.symbol));
  }

  function renderList() {
    const list = $('configurationList');
    const add = $('newConfigurationBtn');
    if (!list) return;
    if (!session) {
      if (add) add.disabled = true;
      list.innerHTML = '<div class="config-empty">Entre no portal pelo painel de Trades para consultar e administrar as configurações permanentes. A análise de arbitragens continua disponível sem login.</div>';
      return;
    }
    if (add) add.disabled = false;
    const current = getModelConfigs();
    if (current.length) configs = current;
    if (!configs.length) {
      list.innerHTML = '<div class="config-empty">Nenhuma arbitragem cadastrada. Use “Nova arbitragem” para começar.</div>';
      return;
    }
    list.innerHTML = configs.map((config) => {
      const ready = currentReadiness(config);
      const monitoring = config.autoMonitoringEnabled;
      const readinessText = ready.analysisReady ? 'Pronta para análise' : ready.message;
      return `
        <article class="config-row">
          <div class="config-row-main">
            <div class="config-row-title">${escapeHtml(config.name)}</div>
            <div class="config-row-detail">Referência: ${escapeHtml(config.referenceUnit)} · Anchor: ${escapeHtml(config.anchor)}</div>
            <div class="config-row-detail">Comparativos: ${escapeHtml((config.comparativesDefault || []).join(', '))} · Janela: ${Number(config.lookback)} dias</div>
            <div class="config-row-status ${ready.analysisReady ? 'good' : 'warn'}">${escapeHtml(readinessText)}</div>
          </div>
          <div class="config-row-actions">
            <span class="config-pill ${monitoring ? 'on' : 'off'}">${monitoring ? 'Monitoramento ligado' : 'Monitoramento desligado'}</span>
            <button class="btn" type="button" data-config-action="analyze" data-config-id="${escapeHtml(config.id)}">Analisar</button>
            <button class="btn" type="button" data-config-action="edit" data-config-id="${escapeHtml(config.id)}">Editar</button>
            <button class="btn config-delete" type="button" data-config-action="delete" data-config-id="${escapeHtml(config.id)}" ${monitoring ? 'disabled title="Desligue o monitoramento antes de remover."' : ''}>Remover</button>
          </div>
        </article>`;
    }).join('');
    list.querySelectorAll('[data-config-action]').forEach((button) => {
      button.addEventListener('click', () => {
        const id = button.dataset.configId;
        const action = button.dataset.configAction;
        if (action === 'edit') openEditor(id);
        if (action === 'delete') removeConfiguration(id);
        if (action === 'analyze') {
          window.cryptoArbitrageSelectConfiguration?.(id);
          window.setPortalView?.('arbitragens');
        }
      });
    });
  }

  function openEditor(id = null) {
    if (!session) {
      status('Faça login no painel de Trades para editar configurações.', 'warn');
      return;
    }
    editId = id;
    originalEdit = id ? configs.find((x) => x.id === id) : null;
    const assets = cryptoAssets();
    const unitAssets = enabledAssets();
    const defaults = {
      name: '',
      referenceUnit: 'USD',
      anchor: assets[0]?.symbol || 'ADA',
      comparativesDefault: assets.filter((x) => x.symbol !== (assets[0]?.symbol || 'ADA')).slice(0, 2).map((x) => x.symbol),
      lookback: 60,
      autoMonitoringEnabled: false
    };
    const config = originalEdit || defaults;
    $('configEditorTitle').textContent = originalEdit ? 'Editar arbitragem' : 'Nova arbitragem';
    $('configName').value = config.name || '';
    $('configReferenceUnit').innerHTML = unitAssets.map((asset) =>
      `<option value="${escapeHtml(asset.symbol)}">${escapeHtml(asset.symbol)} · ${escapeHtml(asset.name || asset.symbol)}</option>`
    ).join('');
    if (!unitAssets.some((asset) => asset.symbol === config.referenceUnit)) {
      $('configReferenceUnit').insertAdjacentHTML('beforeend', `<option value="${escapeHtml(config.referenceUnit)}">${escapeHtml(config.referenceUnit)}</option>`);
    }
    $('configReferenceUnit').value = config.referenceUnit;
    $('configAnchor').innerHTML = assets.map((asset) =>
      `<option value="${escapeHtml(asset.symbol)}">${escapeHtml(asset.symbol)} · ${escapeHtml(asset.name || asset.symbol)}</option>`
    ).join('');
    if (!assets.some((asset) => asset.symbol === config.anchor)) {
      $('configAnchor').insertAdjacentHTML('beforeend', `<option value="${escapeHtml(config.anchor)}">${escapeHtml(config.anchor)}</option>`);
    }
    $('configAnchor').value = config.anchor;
    $('configLookback').innerHTML = LOOKBACKS.map((n) => `<option value="${n}">${n} dias</option>`).join('');
    $('configLookback').value = String(config.lookback || 60);
    $('configAutoMonitoring').checked = Boolean(config.autoMonitoringEnabled);
    $('configDeleteBtn').classList.toggle('hidden', !originalEdit);
    renderComparativeChoices(config.comparativesDefault || []);
    updateFormReadiness();
    $('configurationEditor').classList.remove('hidden');
    $('configurationEditor').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function renderComparativeChoices(selected) {
    const anchor = $('configAnchor').value;
    const host = $('configComparatives');
    const assets = cryptoAssets().filter((asset) => asset.symbol !== anchor);
    host.innerHTML = assets.map((asset) => `
      <label class="config-check">
        <input type="checkbox" value="${escapeHtml(asset.symbol)}" ${selected.includes(asset.symbol) ? 'checked' : ''}>
        <span>${escapeHtml(asset.symbol)} · ${escapeHtml(asset.name || asset.symbol)}</span>
      </label>`).join('');
    host.querySelectorAll('input').forEach((input) => input.addEventListener('change', () => {
      const checked = [...host.querySelectorAll('input:checked')];
      if (checked.length > 5) input.checked = false;
      updateFormReadiness();
    }));
  }

  function readForm() {
    return {
      id: editId || crypto.randomUUID(),
      name: $('configName').value.trim(),
      referenceUnit: $('configReferenceUnit').value,
      anchor: $('configAnchor').value,
      comparativesDefault: [...$('configComparatives').querySelectorAll('input:checked')].map((x) => x.value),
      lookback: Number($('configLookback').value),
      autoMonitoringEnabled: $('configAutoMonitoring').checked
    };
  }

  function sameComposition(a, b) {
    if (!a || !b) return false;
    const left = [...(a.comparativesDefault || [])].sort().join('|');
    const right = [...(b.comparativesDefault || [])].sort().join('|');
    return a.anchor === b.anchor && left === right && Number(a.lookback) === Number(b.lookback);
  }

  function updateFormReadiness() {
    const config = readForm();
    const ready = currentReadiness(config);
    const parts = [];
    parts.push(ready.analysisReady ? 'Dados suficientes para análise.' : ready.message);
    if (!ready.monitorReady) parts.push('Monitoramento automático indisponível até que todos os ativos e dados necessários estejam prontos.');
    $('configFormReadiness').textContent = parts.join(' ');
    $('configFormReadiness').className = 'config-form-readiness ' + (ready.analysisReady ? 'good' : 'warn');
  }

  async function saveConfiguration(event) {
    event.preventDefault();
    if (!session) {
      status('Faça login no painel de Trades para salvar configurações.', 'warn');
      return;
    }
    const config = readForm();
    if (!config.name || config.name.length > 80) {
      $('configFormReadiness').textContent = 'Informe um nome com até 80 caracteres.';
      return;
    }
    if (!/^[A-Z0-9._-]{2,15}$/.test(config.referenceUnit) ||
        !/^[A-Z0-9._-]{2,15}$/.test(config.anchor)) {
      $('configFormReadiness').textContent = 'Selecione ativos válidos para a unidade e para o Anchor.';
      return;
    }
    if (config.comparativesDefault.length < 2 || config.comparativesDefault.length > 5 ||
        config.comparativesDefault.includes(config.anchor) ||
        new Set(config.comparativesDefault).size !== config.comparativesDefault.length) {
      $('configFormReadiness').textContent = 'Selecione de 2 a 5 comparativos distintos, sem incluir o Anchor.';
      return;
    }
    if (!LOOKBACKS.includes(config.lookback)) {
      $('configFormReadiness').textContent = 'Selecione uma janela estatística válida.';
      return;
    }
    if (originalEdit?.autoMonitoringEnabled && !sameComposition(originalEdit, config)) {
      $('configFormReadiness').textContent = 'Desligue o monitoramento e salve. Depois reabra a edição para alterar Anchor, comparativos ou janela.';
      return;
    }
    const ready = currentReadiness(config);
    if (config.autoMonitoringEnabled && !originalEdit?.autoMonitoringEnabled && !ready.monitorReady) {
      $('configFormReadiness').textContent = ready.message + ' O monitoramento só pode ser ligado quando a configuração estiver tecnicamente pronta.';
      return;
    }
    const row = modelConfigToRow(config);
    const saveButton = $('configSaveBtn');
    saveButton.disabled = true;
    saveButton.textContent = 'Salvando…';
    try {
      const { error } = await client.from('arbitrage_configurations').upsert(row, { onConflict: 'id' });
      if (error) throw error;
      await loadConfigurations(config.id);
      $('configurationEditor').classList.add('hidden');
      status('Configuração salva no Supabase.', 'good');
    } catch (error) {
      $('configFormReadiness').textContent = 'Não foi possível salvar: ' + (error.message || error);
    } finally {
      saveButton.disabled = false;
      saveButton.textContent = 'Salvar configuração';
    }
  }

  async function removeConfiguration(id) {
    const config = configs.find((x) => x.id === id);
    if (!config) return;
    if (config.autoMonitoringEnabled) {
      status('Desligue o monitoramento automático antes de remover.', 'warn');
      return;
    }
    if (!window.confirm(`Remover a configuração “${config.name}”? Se houver histórico ou trades associados, a exclusão será bloqueada.`)) return;
    try {
      const { error } = await client.from('arbitrage_configurations').delete().eq('id', id);
      if (error) throw error;
      await loadConfigurations();
      status('Configuração removida.', 'good');
    } catch (error) {
      status(error.message || 'Não foi possível remover a configuração.', 'warn');
    }
  }

  function closeEditor() {
    $('configurationEditor').classList.add('hidden');
    editId = null;
    originalEdit = null;
  }

  async function loadAuthenticatedData(resetInitialDraft = false) {
    if (!client || !session) return;
    status('Sincronizando configurações e catálogo…');
    await loadAssetCatalog();
    const resetDraftId = resetInitialDraft ? (window.cryptoArbitrageGetActiveConfigId?.() || null) : null;
    await loadConfigurations(resetDraftId);
    renderList();
    status('Configurações sincronizadas com o Supabase.', 'good');
  }

  async function init() {
    try {
      await getClient();
      const { data, error } = await client.auth.getSession();
      if (error) throw error;
      session = data.session || null;
      authSubscription = client.auth.onAuthStateChange((event, nextSession) => {
        session = nextSession || null;
        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          setTimeout(() => loadAuthenticatedData().catch((err) => status(err.message || String(err), 'warn')), 0);
        } else if (event === 'SIGNED_OUT') {
          configs = [];
          closeEditor();
          renderList();
          status('Sessão encerrada. Entre novamente pelo painel de Trades.', 'warn');
        }
      });
      if (session) await loadAuthenticatedData(true);
      else {
        renderList();
        status('Faça login pelo painel de Trades para administrar configurações.', 'warn');
      }
    } catch (error) {
      renderList();
      status('Não foi possível conectar às configurações do Supabase: ' + (error.message || error), 'warn');
    }
  }


  function addStyles() {
    if ($('arbitrage-config-styles')) return;
    const style = document.createElement('style');
    style.id = 'arbitrage-config-styles';
    style.textContent = `
      .config-access-status{font-size:12px;color:var(--muted);margin:10px 0 14px;min-height:18px}
      .config-access-status.good,.config-form-readiness.good,.config-row-status.good{color:#4ade80}
      .config-access-status.warn,.config-form-readiness.warn,.config-row-status.warn{color:#fbbf24}
      .config-list{display:grid;gap:10px}
      .config-row{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;padding:14px;border:1px solid var(--border);border-radius:14px;background:var(--panel2)}
      .config-row-main{min-width:0;flex:1}
      .config-row-title{font-size:15px;font-weight:700;margin-bottom:5px}
      .config-row-detail{font-size:12px;color:var(--muted);line-height:1.6}
      .config-row-status{font-size:12px;margin-top:7px}
      .config-row-actions{display:flex;align-items:center;justify-content:flex-end;gap:7px;flex-wrap:wrap;max-width:440px}
      .config-pill{font-size:11px;border-radius:999px;padding:6px 9px;border:1px solid var(--border);white-space:nowrap}
      .config-pill.on{color:#4ade80;border-color:rgba(74,222,128,.35)}
      .config-pill.off{color:var(--muted)}
      .config-delete{border-color:rgba(248,113,113,.3)}
      .config-empty{padding:18px;border:1px dashed var(--border);border-radius:12px;color:var(--muted);font-size:13px;line-height:1.6}
      .config-form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
      .config-form-grid .wide{grid-column:1/-1}
      .config-form-grid input:not([type=checkbox]),.config-form-grid select{width:100%;box-sizing:border-box}
      .config-comparatives{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:8px;padding:10px;border:1px solid var(--border);border-radius:12px;max-height:240px;overflow:auto}
      .config-check{display:flex;align-items:center;gap:8px;font-size:12px;padding:5px}
      .config-check input,.config-monitor-label input{width:auto}
      .config-monitor-label{display:flex;align-items:center;gap:9px;font-size:13px;font-weight:600}
      .config-form-readiness{font-size:12px;line-height:1.6;margin:12px 0;padding:10px 12px;border:1px solid var(--border);border-radius:10px;background:var(--panel2)}
      @media(max-width:720px){.config-row{display:block}.config-row-actions{justify-content:flex-start;margin-top:12px;max-width:none}.config-form-grid{grid-template-columns:1fr}.config-form-grid .wide{grid-column:auto}}
    `;
    document.head.appendChild(style);
  }

  function bind() {
    addStyles();
    $('newConfigurationBtn')?.addEventListener('click', () => openEditor());
    $('configForm')?.addEventListener('submit', saveConfiguration);
    $('configCancelBtn')?.addEventListener('click', closeEditor);
    $('configDeleteBtn')?.addEventListener('click', () => editId && removeConfiguration(editId));
    $('configAnchor')?.addEventListener('change', () => {
      const selected = [...$('configComparatives').querySelectorAll('input:checked')].map((x) => x.value);
      renderComparativeChoices(selected.filter((symbol) => symbol !== $('configAnchor').value));
    });
    $('configAnchor')?.addEventListener('change', updateFormReadiness);
    ['configReferenceUnit', 'configLookback', 'configAutoMonitoring', 'configName'].forEach((id) =>
      $(id)?.addEventListener('change', updateFormReadiness));
    window.addEventListener('cryptoArbModelSaved', () => {
      if (!client || !session || syncingAssets) return;
      setTimeout(() => syncAssetCatalog(), 0);
    });
    window.addEventListener('cryptoArbDataUpdated', () => {
      renderList();
      if (!$('configurationEditor')?.classList.contains('hidden')) updateFormReadiness();
    });
  }

  window.cryptoArbRenderConfigurations = renderList;
  window.cryptoArbConfigInit = init;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind, { once: true });
  } else {
    bind();
  }
})();