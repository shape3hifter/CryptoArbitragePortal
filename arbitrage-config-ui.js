(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>'"]/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'
  }[c]));
  const LOOKBACKS = [30, 60, 90, 180, 365];
  const COINGECKO = {
    ADA:'cardano', NIGHT:'midnight-3', SNEK:'snek', SOL:'solana',
    BONK:'bonk', WIF:'dogwifcoin', BTC:'bitcoin', ETH:'ethereum',
    USDT:'tether', USDC:'usd-coin'
  };
  let records = [];
  let assets = [];
  let userId = null;
  let loading = false;
  let lastAssetSignature = '';
  let lastLocalAssetSignature = '';
  let editingId = null;

  function api() {
    if (typeof window.cryptoArbitrageApiRequest !== 'function') {
      throw new Error('A interface de autenticação do portal ainda não está disponível. Recarregue a página.');
    }
    return window.cryptoArbitrageApiRequest;
  }
  async function auth(write = false) {
    if (typeof window.cryptoArbitrageEnsureAuth !== 'function') {
      throw new Error('Faça login pelo painel Trades para gerenciar configurações.');
    }
    const ctx = await window.cryptoArbitrageEnsureAuth({ requireMfa: write });
    if (!ctx?.userId) throw new Error('Faça login para acessar suas configurações.');
    userId = ctx.userId;
    return ctx;
  }
  function request(path, options = {}, authenticated = true) {
    return api()(path, options, authenticated);
  }

  function mount() {
    const nav = document.querySelector('.view-nav');
    const main = document.querySelector('main');
    if (!nav || !main || $('tabConfig') || $('configurationsView')) return;
    const tab = document.createElement('button');
    tab.id = 'tabConfig';
    tab.className = 'view-tab';
    tab.type = 'button';
    tab.textContent = 'Configurações';
    nav.appendChild(tab);

    const view = document.createElement('section');
    view.id = 'configurationsView';
    view.className = 'view-panel hidden';
    view.innerHTML = `
      <div class="card">
        <div class="section-head">
          <div><h2>Configurações</h2><div class="note">Estratégias permanentes salvas no Supabase</div></div>
          <button id="cfgNew" class="btn primary" type="button">+ Nova arbitragem</button>
        </div>
        <div id="cfgMessage" class="note" role="status" aria-live="polite" style="margin:10px 0"></div>
        <div id="cfgList" class="cfg-list"><div class="note">Carregando configurações…</div></div>
      </div>
      <div id="cfgEditor" class="card section hidden">
        <div class="section-head"><div><h2 id="cfgEditorTitle">Nova arbitragem</h2><div class="note">Configuração permanente da estratégia</div></div><button id="cfgCancel" class="btn" type="button">Cancelar</button></div>
        <form id="cfgForm">
          <div class="cfg-grid">
            <div class="field"><label for="cfgName">Nome da arbitragem</label><input id="cfgName" maxlength="80" required placeholder="Ex.: ADA / NIGHT / SNEK"></div>
            <div class="field"><label for="cfgReference">Unidade de referência</label><select id="cfgReference" required></select></div>
            <div class="field"><label for="cfgAnchor">Crypto Anchor</label><select id="cfgAnchor" required></select></div>
            <div class="field"><label for="cfgLookback">Janela estatística padrão</label><select id="cfgLookback" required>${LOOKBACKS.map(n => `<option value="${n}">${n} dias</option>`).join('')}</select></div>
            <div class="field cfg-wide"><label>Ativos comparativos padrão (2 a 5)</label><div id="cfgComparatives" class="cfg-checks"></div><div class="note">O Anchor não pode ser selecionado como comparativo.</div></div>
          </div>
          <div class="cfg-monitor">
            <label for="cfgMonitor"><input id="cfgMonitor" type="checkbox"> Monitoramento automático ligado</label>
            <div class="note">Novas arbitragens começam desligadas. A ativação depende da disponibilidade de dados e suporte de cotação.</div>
          </div>
          <div id="cfgValidation" class="note" role="status" aria-live="polite" style="margin-top:12px"></div>
          <div class="actions"><button id="cfgSave" class="btn primary" type="submit">Salvar configuração</button><button id="cfgDelete" class="btn danger hidden" type="button">Excluir arbitragem</button></div>
        </form>
      </div>
      <div class="note" style="margin:10px 2px">Alterações feitas na tela Arbitragens são temporárias. Para modificar os padrões permanentes, use este formulário.</div>
    `;
    main.insertBefore(view, $('arbitragesView'));
    injectStyles();
    tab.addEventListener('click', showView);
    $('tabArbitragens')?.addEventListener('click', hideView);
    $('tabAtivos')?.addEventListener('click', hideView);
    $('cfgNew').addEventListener('click', () => openEditor(null));
    $('cfgCancel').addEventListener('click', closeEditor);
    $('cfgForm').addEventListener('submit', saveConfig);
    $('cfgDelete').addEventListener('click', deleteConfig);
    $('cfgAnchor').addEventListener('change', renderComparatives);
    $('cfgList').addEventListener('click', handleListAction);
  }

  function injectStyles() {
    if ($('cfgStyles')) return;
    const style = document.createElement('style');
    style.id = 'cfgStyles';
    style.textContent = `
      .cfg-list{display:grid;gap:10px}
      .cfg-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:14px;align-items:center;padding:14px;border:1px solid var(--border);border-radius:12px;background:var(--panel2)}
      .cfg-row-title{font-weight:700;margin-bottom:3px}
      .cfg-row-meta,.cfg-row-status{font-size:12px;color:var(--muted);line-height:1.55}
      .cfg-row-status{margin-top:3px}
      .cfg-row-actions{display:flex;gap:7px;align-items:center;flex-wrap:wrap;justify-content:flex-end}
      .cfg-pill{display:inline-flex;border:1px solid var(--border);border-radius:999px;padding:3px 9px;font-size:11px;white-space:nowrap}
      .cfg-pill.good{color:#68d391;border-color:#2f8054}.cfg-pill.warn{color:#e6b566;border-color:#8d6a32}
      .cfg-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
      .cfg-wide{grid-column:1/-1}
      .cfg-checks{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:7px;margin:8px 0}
      .cfg-checks label,.cfg-monitor label{display:flex;gap:8px;align-items:center;font-size:13px}
      .cfg-monitor{border-top:1px solid var(--border);margin-top:14px;padding-top:14px}
      .cfg-monitor .note{margin-top:5px}
      .cfg-row button{white-space:nowrap}
      @media(max-width:700px){.cfg-grid{grid-template-columns:1fr}.cfg-wide{grid-column:auto}.cfg-row{grid-template-columns:1fr}.cfg-row-actions{justify-content:flex-start}}
    `;
    document.head.appendChild(style);
  }

  function showView() {
    $('arbitragesView')?.classList.add('hidden');
    $('assetsView')?.classList.add('hidden');
    $('configurationsView')?.classList.remove('hidden');
    $('tabArbitragens')?.classList.remove('active');
    $('tabAtivos')?.classList.remove('active');
    $('tabConfig')?.classList.add('active');
    loadConfigs();
  }
  function hideView() {
    $('configurationsView')?.classList.add('hidden');
    $('tabConfig')?.classList.remove('active');
  }

  async function loadConfigs() {
    if (loading) return;
    loading = true;
    message('Consultando configurações no Supabase…');
    try {
      await auth(false);
      const [configRows, assetRows] = await Promise.all([
        request('/rest/v1/arbitrage_configurations?select=id,user_id,name,reference_unit,anchor_symbol,comparative_symbols,default_lookback_days,auto_monitoring_enabled,created_at,updated_at&order=created_at.asc'),
        request('/rest/v1/arbitrage_assets?select=symbol,name,type,cmc_id,coingecko_id,enabled,price_source&order=symbol.asc')
      ]);
      records = Array.isArray(configRows) ? configRows : [];
      assets = Array.isArray(assetRows) ? assetRows : [];
      window.cryptoArbitrageSetAssetCatalog?.(assets);
      syncMainModel();
      renderList();
      populateAssetOptions();
      message(records.length ? '' : 'Nenhuma arbitragem cadastrada. Use “Nova arbitragem” para começar.');
    } catch (e) {
      message(e?.message || 'Não foi possível carregar as configurações.');
      $('cfgList').innerHTML = '<div class="note">Verifique o login e tente novamente.</div>';
    } finally {
      loading = false;
    }
  }

  function localAssets() {
    return typeof window.cryptoArbitrageGetAssetCatalog === 'function'
      ? window.cryptoArbitrageGetAssetCatalog()
      : [];
  }
  function assetMap() {
    const merged = new Map();
    for (const a of [...assets, ...localAssets()]) {
      if (a?.symbol) merged.set(String(a.symbol).toUpperCase(), { ...merged.get(String(a.symbol).toUpperCase()), ...a, symbol: String(a.symbol).toUpperCase() });
    }
    return [...merged.values()].filter(a => a.enabled !== false);
  }
  function populateAssetOptions() {
    const all = assetMap();
    const crypto = all.filter(a => String(a.type || a.asset_type).toUpperCase() === 'CRYPTO').sort((a,b)=>a.symbol.localeCompare(b.symbol));
    const units = all.filter(a => ['CRYPTO','FIAT'].includes(String(a.type || a.asset_type).toUpperCase())).sort((a,b)=>a.symbol.localeCompare(b.symbol));
    const ref = $('cfgReference'), anchor = $('cfgAnchor');
    if (!ref || !anchor) return;
    const oldRef = ref.value, oldAnchor = anchor.value;
    ref.innerHTML = units.map(a => `<option value="${esc(a.symbol)}">${esc(a.symbol)} — ${esc(a.name || a.symbol)}</option>`).join('');
    anchor.innerHTML = crypto.map(a => `<option value="${esc(a.symbol)}">${esc(a.symbol)} — ${esc(a.name || a.symbol)}</option>`).join('');
    if (units.some(a => a.symbol === oldRef)) ref.value = oldRef;
    else ref.value = units.some(a => a.symbol === 'USD') ? 'USD' : units[0]?.symbol || '';
    if (crypto.some(a => a.symbol === oldAnchor)) anchor.value = oldAnchor;
    else anchor.value = crypto.some(a => a.symbol === 'ADA') ? 'ADA' : crypto[0]?.symbol || '';
    renderComparatives();
  }
  function renderComparatives(selected = null, disabled = false) {
    const anchor = $('cfgAnchor')?.value;
    const selectedSet = new Set(selected || [...document.querySelectorAll('#cfgComparatives input:checked')].map(x=>x.value));
    const crypto = assetMap().filter(a => String(a.type || a.asset_type).toUpperCase() === 'CRYPTO' && a.symbol !== anchor).sort((a,b)=>a.symbol.localeCompare(b.symbol));
    $('cfgComparatives').innerHTML = crypto.map(a => `<label><input type="checkbox" value="${esc(a.symbol)}" ${selectedSet.has(a.symbol)?'checked':''} ${disabled?'disabled':''}> ${esc(a.symbol)} — ${esc(a.name || a.symbol)}</label>`).join('');
  }

  function mapRow(row) {
    return {
      id: row.id, name: row.name, referenceUnit: row.reference_unit,
      anchor: row.anchor_symbol, comparativesDefault: [...(row.comparative_symbols || [])],
      lookback: Number(row.default_lookback_days) || 60,
      auto_monitoring_enabled: !!row.auto_monitoring_enabled,
      user_id: row.user_id
    };
  }
  function syncMainModel() {
    const mapped = records.map(mapRow);
    window.__cryptoArbitrageConfigurations = mapped;
    window.cryptoArbitrageSetConfigurations?.(mapped);
    window.dispatchEvent(new CustomEvent('crypto-arb-configurations-updated', { detail: mapped }));
  }

  function readiness(row) {
    const check = window.cryptoArbitrageCheckReadiness?.({
      id: row.id, anchor: row.anchor_symbol, comparativesDefault: row.comparative_symbols,
      lookback: Number(row.default_lookback_days) || 60, referenceUnit: row.reference_unit
    });
    if (!check) return { analysisReady:false, conversionReady:false, monitorReady:false, reasons:['Verificação de dados indisponível'] };
    return check;
  }
  function renderList() {
    const host = $('cfgList');
    if (!records.length) { host.innerHTML = '<div class="note">Nenhuma arbitragem cadastrada.</div>'; return; }
    host.innerHTML = records.map(row => {
      const status = readiness(row);
      const statusText = status.analysisReady
        ? (status.conversionReady ? 'Pronta para análise' : 'Análise disponível · conversão indisponível')
        : 'Histórico insuficiente';
      const statusClass = status.analysisReady ? (status.conversionReady ? 'good' : 'warn') : 'warn';
      const monitoring = row.auto_monitoring_enabled
        ? '<span class="cfg-pill good">Monitoramento ligado</span>'
        : '<span class="cfg-pill">Monitoramento desligado</span>';
      const monitorDisabled = !row.auto_monitoring_enabled && !status.monitorReady ? 'disabled title="Dados ou fonte de cotação insuficientes"' : '';
      return `<div class="cfg-row" data-id="${esc(row.id)}">
        <div><div class="cfg-row-title">${esc(row.name)}</div>
          <div class="cfg-row-meta">Referência: ${esc(row.reference_unit)} · Anchor: ${esc(row.anchor_symbol)} · Comparativos: ${esc((row.comparative_symbols||[]).join(', '))} · Janela: ${Number(row.default_lookback_days)} dias</div>
          <div class="cfg-row-status"><span class="cfg-pill ${statusClass}">${statusText}</span> ${monitoring}</div>
          ${status.reasons?.length ? `<div class="cfg-row-status">${esc(status.reasons.join(' · '))}</div>` : ''}
        </div>
        <div class="cfg-row-actions">
          <button class="btn" type="button" data-action="edit" data-id="${esc(row.id)}">Editar</button>
          <button class="btn" type="button" data-action="monitor" data-id="${esc(row.id)}" ${monitorDisabled}>${row.auto_monitoring_enabled?'Desligar':'Ligar'} monitoramento</button>
        </div>
      </div>`;
    }).join('');
  }
  function message(text) {
    const node = $('cfgMessage');
    if (node) node.textContent = text || '';
  }
  function validation(text) {
    const node = $('cfgValidation');
    if (node) node.textContent = text || '';
  }
  function openEditor(id) {
    editingId = id || null;
    const row = records.find(x => x.id === id);
    $('cfgEditor').classList.remove('hidden');
    $('cfgEditorTitle').textContent = row ? 'Editar arbitragem' : 'Nova arbitragem';
    $('cfgName').value = row?.name || '';
    populateAssetOptions();
    $('cfgReference').value = row?.reference_unit || 'USD';
    $('cfgAnchor').value = row?.anchor_symbol || 'ADA';
    $('cfgLookback').value = String(row?.default_lookback_days || 60);
    renderComparatives(row?.comparative_symbols || ['NIGHT','SNEK'], !!row?.auto_monitoring_enabled);
    $('cfgMonitor').checked = !!row?.auto_monitoring_enabled;
    $('cfgMonitor').disabled = !row;
    $('cfgDelete').classList.toggle('hidden', !row || !!row.auto_monitoring_enabled);
    $('cfgDelete').dataset.id = row?.id || '';
    const compositionDisabled = !!row?.auto_monitoring_enabled;
    $('cfgAnchor').disabled = compositionDisabled;
    $('cfgLookback').disabled = compositionDisabled;
    if (compositionDisabled) {
      validation('Para alterar Anchor, comparativos ou janela, desligue o monitoramento e salve. Depois, abra a edição novamente.');
    } else validation('');
    $('cfgEditor').scrollIntoView({behavior:'smooth',block:'start'});
  }
  function closeEditor() {
    editingId = null;
    $('cfgEditor').classList.add('hidden');
    validation('');
  }
  async function syncAssetsToSupabase(ctx) {
    const local = localAssets();
    const rows = local.filter(a => a && a.symbol).map(a => {
      const symbol = String(a.symbol).toUpperCase();
      const type = String(a.type || 'CRYPTO').toUpperCase();
      return {
        symbol, user_id:ctx.userId, name:a.name || symbol, type,
        cmc_id:type === 'CRYPTO' ? (Number(a.cmc_id) || null) : null,
        coingecko_id:a.coingecko_id || COINGECKO[symbol] || null,
        enabled:a.enabled !== false,
        base_quote:'USD',
        price_source:type === 'FIAT' ? (symbol === 'USD' ? 'internal' : 'frankfurter') : 'coinmarketcap'
      };
    });
    if (!rows.length) return;
    const signature = JSON.stringify(rows);
    if (signature === lastAssetSignature) return;
    await request('/rest/v1/arbitrage_assets?on_conflict=symbol', {
      method:'POST',
      headers:{Prefer:'resolution=merge-duplicates,return=minimal'},
      body:JSON.stringify(rows)
    });
    lastAssetSignature = signature;
    lastLocalAssetSignature = JSON.stringify(local);
    assets = await request('/rest/v1/arbitrage_assets?select=symbol,name,type,cmc_id,coingecko_id,enabled,price_source&order=symbol.asc');
  }

  async function saveConfig(event) {
    event.preventDefault();
    validation('');
    const name = $('cfgName').value.trim();
    const reference = $('cfgReference').value;
    const anchor = $('cfgAnchor').value;
    const comps = [...document.querySelectorAll('#cfgComparatives input:checked')].map(x=>x.value);
    const lookback = Number($('cfgLookback').value);
    const monitor = !!$('cfgMonitor').checked;
    if (!name || name.length > 80) return validation('Informe um nome de até 80 caracteres.');
    if (!reference || !anchor) return validation('Selecione a unidade de referência e o Crypto Anchor.');
    if (comps.length < 2 || comps.length > 5) return validation('Selecione de 2 a 5 ativos comparativos.');
    if (new Set(comps).size !== comps.length || comps.includes(anchor)) return validation('Os comparativos devem ser distintos e não podem incluir o Anchor.');
    if (!LOOKBACKS.includes(lookback)) return validation('Janela estatística inválida.');
    const old = records.find(x => x.id === editingId);
    if (old?.auto_monitoring_enabled && (
      anchor !== old.anchor_symbol ||
      lookback !== Number(old.default_lookback_days) ||
      JSON.stringify([...comps].sort()) !== JSON.stringify([...(old.comparative_symbols||[])].sort())
    )) return validation('Desligue e salve o monitoramento antes de alterar Anchor, comparativos ou janela.');
    if (!old && monitor) return validation('Novas arbitragens são salvas inicialmente com monitoramento desligado. Ative-o depois da validação.');
    try {
      const ctx = await auth(true);
      await syncAssetsToSupabase(ctx);
      const row = {
        name, reference_unit:reference, anchor_symbol:anchor,
        comparative_symbols:comps, default_lookback_days:lookback,
        auto_monitoring_enabled:monitor, updated_at:new Date().toISOString()
      };
      if (monitor) {
        const check = window.cryptoArbitrageCheckReadiness?.({
          anchor, comparativesDefault:comps, lookback, referenceUnit:reference
        });
        if (!check?.monitorReady) return validation(check?.reasons?.join(' · ') || 'Os dados ainda não permitem ativar o monitoramento.');
      }
      if (old) {
        await request('/rest/v1/arbitrage_configurations?id=eq.'+encodeURIComponent(old.id)+'&user_id=eq.'+encodeURIComponent(ctx.userId), {
          method:'PATCH', headers:{Prefer:'return=representation'}, body:JSON.stringify(row)
        });
        window.cryptoArbitrageClearAnalysisDraft?.(old.id);
      } else {
        row.id = 'arb-' + crypto.randomUUID().toLowerCase();
        row.user_id = ctx.userId;
        await request('/rest/v1/arbitrage_configurations', {
          method:'POST', headers:{Prefer:'return=representation'}, body:JSON.stringify(row)
        });
      }
      await loadConfigs();
      closeEditor();
      validation('');
      message('Configuração salva no Supabase.');
    } catch (e) {
      validation(e?.message || 'Não foi possível salvar a configuração.');
    }
  }

  async function handleListAction(event) {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    const row = records.find(x => x.id === button.dataset.id);
    if (!row) return;
    if (button.dataset.action === 'edit') return openEditor(row.id);
    if (button.dataset.action === 'monitor') {
      try {
        const ctx = await auth(true);
        const next = !row.auto_monitoring_enabled;
        if (next) {
          const check = readiness(row);
          if (!check.monitorReady) throw new Error(check.reasons?.join(' · ') || 'Dados insuficientes para monitoramento.');
        }
        await request('/rest/v1/arbitrage_configurations?id=eq.'+encodeURIComponent(row.id)+'&user_id=eq.'+encodeURIComponent(ctx.userId), {
          method:'PATCH', headers:{Prefer:'return=representation'},
          body:JSON.stringify({auto_monitoring_enabled:next,updated_at:new Date().toISOString()})
        });
        await loadConfigs();
      } catch (e) { message(e?.message || 'Não foi possível alterar o monitoramento.'); }
    }
  }

  async function deleteConfig() {
    const id = $('cfgDelete').dataset.id;
    const row = records.find(x => x.id === id);
    if (!row || row.auto_monitoring_enabled) return validation('Desligue o monitoramento antes de excluir.');
    if (!confirm('Excluir esta arbitragem? Registros históricos e trades associados impedem a exclusão.')) return;
    try {
      const ctx = await auth(true);
      await request('/rest/v1/arbitrage_configurations?id=eq.'+encodeURIComponent(id)+'&user_id=eq.'+encodeURIComponent(ctx.userId), {method:'DELETE'});
      await loadConfigs();
      closeEditor();
    } catch (e) {
      validation('A arbitragem possui histórico ou registros associados e foi preservada. '+(e?.message||''));
    }
  }

  async function init() {
    mount();
    // Keep the central asset catalog synchronized when the existing Ativos page
    // saves local metadata. The signature guard avoids repeat network writes.
    document.addEventListener('crypto-arb-assets-changed', async () => {
      const local = localAssets();
      const signature = JSON.stringify(local);
      if (signature === lastLocalAssetSignature) return;
      lastLocalAssetSignature = signature;
      try { const ctx = await auth(true); await syncAssetsToSupabase(ctx); }
      catch { lastLocalAssetSignature = ''; /* Retry after a real catalog change or explicit configuration save. */ }
    });
    await loadConfigs();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
  else init();
})();