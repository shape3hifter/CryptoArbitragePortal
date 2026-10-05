(() => {
  'use strict';

  const cfg = window.CRYPTO_ARB_SUPABASE_CONFIG || {};
  const ARBS = {
    'ADA / NIGHT / SNEK': { id: 'arb-ada-night-snek', name: 'ADA / NIGHT / SNEK', anchor: 'ADA', assets: ['NIGHT', 'SNEK'] },
    'SOL / BONK / WIF': { id: 'arb-sol-bonk-wif', name: 'SOL / BONK / WIF', anchor: 'SOL', assets: ['BONK', 'WIF'] }
  };
  const LIVE_FN = '/functions/v1/live-prices';
  const CG_IDS = { ADA: 'cardano', NIGHT: 'midnight-3', SNEK: 'snek', SOL: 'solana', BONK: 'bonk', WIF: 'dogwifcoin' };
  const SESSION_KEY = 'cryptoArbSupabaseSessionV2';
  const LEGACY_SESSION_KEY = 'cryptoArbSupabaseSession';
  let session = loadSession();
  let simulationState = null;
  let sessionRefreshInFlight = null;
  let authClient = null;
  let mfaReady = false;
  let mfaVerifiedFactor = null;
  const $ = id => document.getElementById(id);

  function loadSession() {
    try {
      const current = sessionStorage.getItem(SESSION_KEY);
      if (current) return JSON.parse(current);
      const legacy = localStorage.getItem(LEGACY_SESSION_KEY);
      if (!legacy) return null;
      sessionStorage.setItem(SESSION_KEY, legacy);
      localStorage.removeItem(LEGACY_SESSION_KEY);
      return JSON.parse(legacy);
    } catch {
      try { sessionStorage.removeItem(SESSION_KEY); localStorage.removeItem(LEGACY_SESSION_KEY); } catch {}
      return null;
    }
  }
  function saveSession(value) {
    session = value;
    try {
      if (value) sessionStorage.setItem(SESSION_KEY, JSON.stringify(value));
      else sessionStorage.removeItem(SESSION_KEY);
      localStorage.removeItem(LEGACY_SESSION_KEY);
    } catch {}
  }
  async function ensureFreshSession() {
    if (!session?.refresh_token || !cfg.url || !cfg.anonKey) return !!session?.access_token;
    const expiresAt = Number(session.expires_at || 0);
    if (expiresAt && expiresAt > Math.floor(Date.now() / 1000) + 60) return true;
    if (sessionRefreshInFlight) return sessionRefreshInFlight;
    sessionRefreshInFlight = (async () => {
      try {
        const res = await fetch(`${String(cfg.url).replace(/\/$/, '')}/auth/v1/token?grant_type=refresh_token`, {
          method: 'POST',
          headers: { apikey: cfg.anonKey, 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ refresh_token: session.refresh_token })
        });
        if (!res.ok) return false;
        const body = await res.json();
        if (!body?.access_token) return false;
        saveSession({ access_token: body.access_token, refresh_token: body.refresh_token || session.refresh_token, expires_at: body.expires_at, user: body.user || session.user });
        return true;
      } catch { return false; }
    })().finally(() => { sessionRefreshInFlight = null; });
    return sessionRefreshInFlight;
  }
  async function getAuthClient() {
    if (authClient) return authClient;
    if (!cfg.url || !cfg.anonKey) throw new Error('Supabase não configurado.');
    const mod = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/+esm');
    authClient = mod.createClient(cfg.url, cfg.anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    });
    return authClient;
  }

  async function syncAuthClientSession() {
    if (!session?.access_token || !session?.refresh_token) return null;
    const client = await getAuthClient();
    const { data, error } = await client.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token
    });
    if (error) throw error;
    return data.session;
  }

  async function readMfaState() {
    const client = await getAuthClient();
    await syncAuthClientSession();
    const { data, error } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
    if (error) throw error;
    return data;
  }

  async function listVerifiedTotpFactors() {
    const client = await getAuthClient();
    await syncAuthClientSession();
    const { data, error } = await client.auth.mfa.listFactors();
    if (error) throw error;
    return {
      factors: data || {},
      verified: (data?.totp || []).filter(f => f.status === 'verified')
    };
  }

  async function saveCurrentAuthSession() {
    const client = await getAuthClient();
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    if (data.session) {
      saveSession({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at: data.session.expires_at,
        user: data.session.user
      });
    }
    return data.session;
  }

  function injectMfaStyles() {
    if ($('mfaStyles')) return;
    const style = document.createElement('style');
    style.id = 'mfaStyles';
    style.textContent = `
      .mfa-qr{display:block;width:220px;height:220px;margin:12px auto;background:#fff;border-radius:12px;padding:10px}
      .mfa-secret{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;word-break:break-all;background:var(--panel2);border:1px solid var(--border);border-radius:10px;padding:10px;font-size:12px}
      .mfa-help{font-size:12px;color:var(--muted);line-height:1.5;margin-top:8px}
      .mfa-code{letter-spacing:.3em;font-size:20px;text-align:center}
    `;
    document.head.appendChild(style);
  }

  function ensureMfaChallengeModal() {
    if ($('mfaChallengeModal')) return;
    const modal = document.createElement('div');
    modal.id = 'mfaChallengeModal';
    modal.className = 'trade-modal hidden';
    modal.innerHTML = '<div class="trade-modal-backdrop"></div><div class="trade-dialog" role="dialog" aria-modal="true" aria-labelledby="mfaChallengeTitle"><div class="section-head"><div><h2 id="mfaChallengeTitle">Verificação em duas etapas</h2><div class="note">Acesso aos Trades</div></div></div><form id="mfaChallengeForm"><div class="note">Abra seu aplicativo autenticador e informe o código de 6 dígitos.</div><div class="field" style="margin-top:12px"><label for="mfaChallengeCode">Código</label><input id="mfaChallengeCode" class="mfa-code" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" required></div><div id="mfaChallengeMsg" class="note" style="margin-top:10px"></div><div class="actions"><button id="mfaChallengeVerifyBtn" class="btn primary" type="submit">Verificar</button><button id="mfaChallengeCancelBtn" class="btn" type="button">Cancelar</button></div></form></div></div>';
    document.body.appendChild(modal);
  }

  async function challengeMfa(factorId, clientOverride = null) {
    ensureMfaChallengeModal();
    const client = clientOverride || await getAuthClient();
    const modal = $('mfaChallengeModal');
    const form = $('mfaChallengeForm');
    const codeInput = $('mfaChallengeCode');
    const msg = $('mfaChallengeMsg');
    const verifyBtn = $('mfaChallengeVerifyBtn');
    const cancelBtn = $('mfaChallengeCancelBtn');

    const challenge = await client.auth.mfa.challenge({ factorId });
    if (challenge.error) throw challenge.error;
    const challengeId = challenge.data.id;

    modal.classList.remove('hidden');
    msg.textContent = '';
    codeInput.value = '';
    codeInput.focus();

    return new Promise(resolve => {
      let settled = false;
      const finish = result => {
        if (settled) return;
        settled = true;
        modal.classList.add('hidden');
        form.onsubmit = null;
        cancelBtn.onclick = null;
        resolve(result);
      };

      cancelBtn.onclick = () => finish(false);
      form.onsubmit = async event => {
        event.preventDefault();
        const code = codeInput.value.trim();
        if (!/^\d{6}$/.test(code)) {
          msg.textContent = 'Informe o código de 6 dígitos.';
          return;
        }
        verifyBtn.disabled = true;
        verifyBtn.textContent = 'Verificando…';
        msg.textContent = '';
        try {
          const result = await client.auth.mfa.verify({ factorId, challengeId, code });
          if (result.error) throw result.error;
          if (clientOverride) {
            const sessionResult = await client.auth.getSession();
            if (sessionResult.error) throw sessionResult.error;
            if (sessionResult.data.session) recoverySession = sessionResult.data.session;
          } else {
            await saveCurrentAuthSession();
            mfaReady = true;
          }
          mfaReady = true;
          finish(true);
        } catch (e) {
          msg.textContent = e?.message || 'Código inválido ou expirado.';
          verifyBtn.disabled = false;
          verifyBtn.textContent = 'Verificar';
        }
      };
    });
  }

  async function ensureMfaForCurrentSession() {
    if (!session?.access_token) {
      mfaReady = false;
      mfaVerifiedFactor = null;
      return false;
    }
    try {
      const assurance = await readMfaState();
      if (assurance.currentLevel === 'aal2' || assurance.nextLevel === 'aal1') {
        const listed = await listVerifiedTotpFactors();
        mfaVerifiedFactor = listed.verified[0] || null;
        mfaReady = true;
        return true;
      }
      if (assurance.currentLevel === 'aal1' && assurance.nextLevel === 'aal2') {
        const listed = await listVerifiedTotpFactors();
        const factor = listed.verified[0];
        if (!factor) throw new Error('Existe uma exigência de MFA, mas nenhum autenticador TOTP verificado foi encontrado.');
        mfaVerifiedFactor = factor;
        const verified = await challengeMfa(factor.id);
        if (!verified) {
          await logout();
          return false;
        }
        const refreshed = await readMfaState();
        if (refreshed.currentLevel !== 'aal2') throw new Error('A verificação MFA não elevou a sessão para AAL2.');
        mfaReady = true;
        return true;
      }
      mfaReady = true;
      return true;
    } catch (e) {
      mfaReady = false;
      const msg = $('authMsg');
      if (msg) msg.textContent = `MFA: ${e?.message || 'não foi possível validar a segunda etapa.'}`;
      return false;
    }
  }

  function ensureMfaSettingsModal() {
    injectMfaStyles();
    if ($('mfaSettingsModal')) return;
    const modal = document.createElement('div');
    modal.id = 'mfaSettingsModal';
    modal.className = 'trade-modal hidden';
    modal.innerHTML = '<div class="trade-modal-backdrop"></div><div class="trade-dialog" role="dialog" aria-modal="true" aria-labelledby="mfaSettingsTitle"><div class="section-head"><div><h2 id="mfaSettingsTitle">Segurança — MFA</h2><div class="note">Aplicativo autenticador (TOTP)</div></div><button id="mfaSettingsClose" class="btn" type="button">Fechar</button></div><div id="mfaSettingsBody"></div></div></div>';
    document.body.appendChild(modal);
    $('mfaSettingsClose').onclick = () => modal.classList.add('hidden');
    modal.querySelector('.trade-modal-backdrop').onclick = () => modal.classList.add('hidden');
  }

  async function renderMfaSettings() {
    ensureMfaSettingsModal();
    const body = $('mfaSettingsBody');
    body.innerHTML = '<div class="note">Consultando o status do MFA…</div>';
    try {
      const listed = await listVerifiedTotpFactors();
      mfaVerifiedFactor = listed.verified[0] || null;
      if (mfaVerifiedFactor) {
        mfaReady = true;
        body.innerHTML = '<div><strong>MFA ativado</strong><div class="mfa-help">Seu acesso aos Trades exige o código do aplicativo autenticador após a senha.</div><div class="actions" style="margin-top:14px"><button id="mfaDisableBtn" class="btn danger" type="button">Desativar MFA</button></div><div id="mfaSettingsMsg" class="note" style="margin-top:10px"></div></div>';
        $('mfaDisableBtn').onclick = async () => {
          const msg = $('mfaSettingsMsg');
          $('mfaDisableBtn').disabled = true;
          try {
            const client = await getAuthClient();
            const { error } = await client.auth.mfa.unenroll({ factorId: mfaVerifiedFactor.id });
            if (error) throw error;
            await client.auth.refreshSession();
            await saveCurrentAuthSession();
            mfaVerifiedFactor = null;
            mfaReady = true;
            msg.textContent = 'MFA desativado.';
            await renderMfaSettings();
          } catch (e) {
            msg.textContent = e?.message || 'Não foi possível desativar o MFA.';
            $('mfaDisableBtn').disabled = false;
          }
        };
        return;
      }

      body.innerHTML = '<div><strong>MFA não configurado</strong><div class="mfa-help">Você poderá proteger este acesso com um aplicativo autenticador, como Google Authenticator, Microsoft Authenticator ou 1Password.</div><div class="actions" style="margin-top:14px"><button id="mfaEnrollBtn" class="btn primary" type="button">Ativar MFA</button></div><div id="mfaSettingsMsg" class="note" style="margin-top:10px"></div></div>';
      $('mfaEnrollBtn').onclick = startMfaEnrollment;
    } catch (e) {
      body.innerHTML = `<div class="note">Não foi possível consultar o MFA: ${escapeHtml(e?.message || 'erro desconhecido')}</div>`;
    }
  }

  async function startMfaEnrollment() {
    ensureMfaSettingsModal();
    const body = $('mfaSettingsBody');
    body.innerHTML = '<div class="note">Gerando o QR Code de configuração…</div>';
    try {
      const client = await getAuthClient();
      await syncAuthClientSession();
      const { data, error } = await client.auth.mfa.enroll({ factorType: 'totp' });
      if (error) throw error;
      const factorId = data.id;
      const qr = data.totp?.qr_code || '';
      const secret = data.totp?.secret || '';
      body.innerHTML = '<div><strong>1. Adicione o autenticador</strong><div class="mfa-help">Escaneie o QR Code com seu aplicativo autenticador. Guarde também o segredo abaixo como backup.</div><img id="mfaQrCode" class="mfa-qr" alt="QR Code para ativação do MFA"><div class="mfa-help">Segredo de configuração:</div><div id="mfaSecret" class="mfa-secret"></div><div class="field" style="margin-top:12px"><label for="mfaEnrollCode">Código do aplicativo</label><input id="mfaEnrollCode" class="mfa-code" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" required></div><div id="mfaEnrollMsg" class="note" style="margin-top:10px"></div><div class="actions"><button id="mfaEnrollVerifyBtn" class="btn primary" type="button">Confirmar e ativar</button><button id="mfaEnrollCancelBtn" class="btn" type="button">Cancelar</button></div></div>';
      const img = $('mfaQrCode');
      if (img && qr) img.src = qr;
      $('mfaSecret').textContent = secret || 'O aplicativo não retornou o segredo textual.';
      $('mfaEnrollCancelBtn').onclick = async () => {
        try { await client.auth.mfa.unenroll({ factorId }); } catch {}
        await renderMfaSettings();
      };
      $('mfaEnrollVerifyBtn').onclick = async () => {
        const code = $('mfaEnrollCode').value.trim();
        const msg = $('mfaEnrollMsg');
        if (!/^\d{6}$/.test(code)) {
          msg.textContent = 'Informe o código de 6 dígitos do aplicativo.';
          return;
        }
        $('mfaEnrollVerifyBtn').disabled = true;
        $('mfaEnrollVerifyBtn').textContent = 'Ativando…';
        msg.textContent = '';
        try {
          const challenge = await client.auth.mfa.challenge({ factorId });
          if (challenge.error) throw challenge.error;
          const verify = await client.auth.mfa.verify({ factorId, challengeId: challenge.data.id, code });
          if (verify.error) throw verify.error;
          await saveCurrentAuthSession();
          mfaVerifiedFactor = { id: factorId, status: 'verified', factor_type: 'totp' };
          mfaReady = true;
          msg.textContent = 'MFA ativado com sucesso.';
          setTimeout(() => { $('mfaSettingsModal')?.classList.add('hidden'); authUi(); }, 600);
        } catch (e) {
          msg.textContent = e?.message || 'Não foi possível verificar o código.';
          $('mfaEnrollVerifyBtn').disabled = false;
          $('mfaEnrollVerifyBtn').textContent = 'Confirmar e ativar';
        }
      };
    } catch (e) {
      body.innerHTML = `<div class="note">Não foi possível iniciar o MFA: ${escapeHtml(e?.message || 'erro desconhecido')}</div>`;
    }
  }

  function currentArb() {
    const select = $('arbitrageSelect');
    const selectedId = String(select?.value || '');
    const byId = Object.values(ARBS).find(a => a.id === selectedId);
    if (byId) return { ...byId };
    const name = String(select?.selectedOptions?.[0]?.textContent || '').trim().replace(/\s+/g, ' ');
    if (ARBS[name]) return { ...ARBS[name] };
    const p = name.split('/').map(x => x.trim()).filter(Boolean);
    return p.length >= 2 ? { id: selectedId || 'current', name, anchor: p[0], assets: p.slice(1, 3) } : { ...ARBS['ADA / NIGHT / SNEK'] };
  }
  function strategies(a) { const [x, y] = a.assets; return [`${a.anchor} → ${x} → ${a.anchor}`, `${a.anchor} → ${y} → ${a.anchor}`, `${x} → ${y} → ${a.anchor}`, `${y} → ${x} → ${a.anchor}`]; }
  function initialAsset(strategy, a) { const [x, y] = a.assets; const s = strategies(a); return strategy === s[0] ? x : strategy === s[1] ? y : strategy === s[2] ? y : x; }
  function fmt(value, maxFractionDigits = 8) { const n = Number(value); return Number.isFinite(n) ? n.toLocaleString('pt-BR', { maximumFractionDigits: maxFractionDigits }) : '—'; }
  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  }
  function localDate(value = new Date()) { const pad = n => String(n).padStart(2, '0'); const d = new Date(value); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; }
  async function api(path, options = {}, auth = true) {
    if (!cfg.url || !cfg.anonKey) throw new Error('Supabase não configurado.');
    if (auth) {
      await ensureFreshSession();
      if (!session?.access_token) throw new Error('Faça login para acessar os trades.');
    }
    const token = auth ? session?.access_token : null;
    const headers = { apikey: cfg.anonKey, Authorization: `Bearer ${token || ''}`, 'Content-Type': 'application/json', ...(options.headers || {}) };
    const res = await fetch(`${cfg.url}${path}`, { ...options, headers });
    const text = await res.text();
    let body = null; try { body = text ? JSON.parse(text) : null; } catch {}
    if (!res.ok) throw new Error(body?.msg || body?.message || body?.hint || body?.details || `HTTP ${res.status}`);
    return body;
  }

  async function logout() {
    const current = session;
    saveSession(null);
    try {
      if (current?.access_token && cfg.url && cfg.anonKey) {
        const mod = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/+esm');
        const client = mod.createClient(cfg.url, cfg.anonKey, {
          auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
        });
        if (current.refresh_token) {
          const { error } = await client.auth.setSession({
            access_token: current.access_token,
            refresh_token: current.refresh_token
          });
          if (error) throw error;
        }
        await client.auth.signOut({ scope: 'local' });
      }
    } catch (e) {
      console.warn('Server-side sign-out failed; local session was cleared.', e);
    }
    authUi();
    await renderTrades();
  }

  function injectSimulationStyles() {
    if ($('tradeSimulationStyles')) return;
    const style = document.createElement('style');
    style.id = 'tradeSimulationStyles';
    style.textContent = `
      .trade-sim-modal{position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px}
      .trade-sim-modal.hidden{display:none}
      .trade-sim-backdrop{position:absolute;inset:0;background:rgba(3,7,18,.72)}
      .trade-sim-dialog{position:relative;width:min(720px,100%);max-height:90vh;overflow:auto;background:var(--panel);border:1px solid var(--border);border-radius:18px;padding:18px;box-shadow:0 20px 70px rgba(0,0,0,.45)}
      .trade-sim-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:12px}
      .trade-sim-card{background:var(--panel2);border:1px solid var(--border);border-radius:12px;padding:12px}
      .trade-sim-card .k{font-size:11px;color:var(--muted)} .trade-sim-card .v{font-size:18px;font-weight:700;margin-top:4px}
      .trade-sim-result{margin-top:14px;border:1px solid var(--border);border-radius:14px;padding:14px;background:rgba(122,162,255,.06)}
      .trade-sim-result .k{font-size:11px;color:var(--muted)} .trade-sim-profit{font-size:28px;font-weight:800;margin-top:4px}
      .trade-sim-profit.good{color:var(--good)} .trade-sim-profit.bad{color:var(--bad)}
      .trade-sim-meta{font-size:12px;color:var(--muted);margin-top:6px;line-height:1.45}
      .trade-sim-actions{display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap;margin-top:14px}
      @media(max-width:600px){.trade-sim-grid{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function authUi() {
    const card = $('tradesPanel'); if (!card) return;
    if (!$('tradeAuthBar')) {
      const bar = document.createElement('div'); bar.id = 'tradeAuthBar'; bar.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:8px;margin:6px 0 10px;';
      bar.innerHTML = '<span id="tradeAuthStatus" class="note"></span><div class="actions" style="margin-top:0"><button id="tradeLoginBtn" class="btn" type="button">Entrar</button><button id="tradeMfaBtn" class="btn" type="button" style="display:none">MFA</button><button id="tradeLogoutBtn" class="btn" type="button" style="display:none">Sair</button></div>';
      card.querySelector('.section-head')?.after(bar); $('tradeLoginBtn').onclick = showAuth; $('tradeMfaBtn').onclick = () => { ensureMfaSettingsModal(); $('mfaSettingsModal').classList.remove('hidden'); renderMfaSettings(); }; $('tradeLogoutBtn').onclick = logout;
    }
    const logged = !!session?.access_token;
    $('tradeAuthStatus').textContent = logged ? `Usuário: ${session.user?.email || 'autenticado'}` : 'Faça login para gravar e consultar seus trades.';
    $('tradeLoginBtn').style.display = logged ? 'none' : '';
    $('tradeMfaBtn').style.display = logged ? '' : 'none';
    $('tradeMfaBtn').textContent = mfaVerifiedFactor ? 'MFA ativo' : 'Ativar MFA';
    $('tradeLogoutBtn').style.display = logged ? '' : 'none';
  }
  function showAuth() {
    if (!$('tradeAuthModal')) {
      const modal = document.createElement('div'); modal.id = 'tradeAuthModal'; modal.className = 'trade-modal hidden';
      modal.innerHTML = '<div class="trade-modal-backdrop"></div><div class="trade-dialog" role="dialog" aria-modal="true"><div class="section-head"><div><h2>Acesso aos Trades</h2><div class="note">Supabase Auth</div></div><button id="authClose" class="btn" type="button">Fechar</button></div><form id="authForm"><div class="trade-form-grid"><div class="field"><label>E-mail</label><input id="authEmail" type="email" autocomplete="email" required></div><div class="field"><label>Senha</label><input id="authPassword" type="password" minlength="6" autocomplete="current-password" required></div></div><div class="actions"><button class="btn primary" type="submit">Entrar</button><button id="signupBtn" class="btn" type="button">Criar conta</button><button id="forgotPasswordBtn" class="btn" type="button">Esqueci minha senha</button></div><div id="authMsg" class="note" style="margin-top:10px"></div></form></div></div>';
      document.body.appendChild(modal); $('authClose').onclick = () => modal.classList.add('hidden'); modal.querySelector('.trade-modal-backdrop').onclick = () => modal.classList.add('hidden'); $('authForm').onsubmit = async e => { e.preventDefault(); await login(); }; $('signupBtn').onclick = signup; $('forgotPasswordBtn').onclick = requestPasswordReset;
    }
    $('tradeAuthModal').classList.remove('hidden');
  }
  async function login() {
    const msg = $('authMsg');
    msg.textContent = 'Entrando…';
    try {
      const b = await api('/auth/v1/token?grant_type=password', { method: 'POST', body: JSON.stringify({ email: $('authEmail').value.trim(), password: $('authPassword').value }) }, false);
      saveSession({ access_token: b.access_token, refresh_token: b.refresh_token, expires_at: b.expires_at, user: b.user });
      authUi();
      const ready = await ensureMfaForCurrentSession();
      if (!ready) return;
      $('tradeAuthModal').classList.add('hidden');
      authUi();
      await renderTrades();
    } catch (e) {
      msg.textContent = `Erro: ${e.message}`;
      mfaReady = false;
    }
  }
  async function signup() {
    const msg = $('authMsg');
    const password = $('authPassword').value;
    if (!validPassword(password)) { msg.textContent = passwordPolicyMessage(); return; }
    msg.textContent = 'Criando conta…';
    try {
      const redirectTo = `${window.location.origin}${window.location.pathname}`;
      const b = await api('/auth/v1/signup', { method: 'POST', body: JSON.stringify({ email: $('authEmail').value.trim(), password, options: { emailRedirectTo: redirectTo } }) }, false);
      if (b?.access_token) {
        saveSession({ access_token: b.access_token, refresh_token: b.refresh_token, expires_at: b.expires_at, user: b.user });
        const ready = await ensureMfaForCurrentSession();
        if (!ready) return;
        $('tradeAuthModal').classList.add('hidden');
        authUi();
        await renderTrades();
      } else {
        msg.textContent = 'Conta criada. Se a confirmação por e-mail estiver habilitada, confirme o e-mail e depois entre.';
      }
    } catch (e) {
      msg.textContent = `Erro: ${e.message}`;
    }
  }


  let recoveryClient = null;
  let recoverySession = null;
  let recoveryListener = null;

  async function getRecoveryClient() {
    if (recoveryClient) return recoveryClient;
    if (!cfg.url || !cfg.anonKey) throw new Error('Supabase não configurado.');
    const mod = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/+esm');
    recoveryClient = mod.createClient(cfg.url, cfg.anonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: true
      }
    });
    return recoveryClient;
  }

  function passwordPolicyMessage() {
    return 'Use pelo menos 12 caracteres, com maiúscula, minúscula, número e símbolo.';
  }

  function validPassword(password) {
    return typeof password === 'string'
      && password.length >= 12
      && /[a-z]/.test(password)
      && /[A-Z]/.test(password)
      && /[0-9]/.test(password)
      && /[^A-Za-z0-9]/.test(password);
  }

  function showRecoveryModal() {
    if (!$('passwordRecoveryModal')) {
      const modal = document.createElement('div');
      modal.id = 'passwordRecoveryModal';
      modal.className = 'trade-modal hidden';
      modal.innerHTML = '<div class="trade-modal-backdrop"></div><div class="trade-dialog" role="dialog" aria-modal="true" aria-labelledby="passwordRecoveryTitle"><div class="section-head"><div><h2 id="passwordRecoveryTitle">Redefinir senha</h2><div class="note">Acesso aos Trades</div></div></div><form id="passwordRecoveryForm"><div class="field"><label for="recoveryPassword">Nova senha</label><input id="recoveryPassword" type="password" minlength="12" autocomplete="new-password" required></div><div class="field"><label for="recoveryPasswordConfirm">Confirmar nova senha</label><input id="recoveryPasswordConfirm" type="password" minlength="12" autocomplete="new-password" required></div><div class="note" style="margin-top:10px">Use pelo menos 12 caracteres, com maiúscula, minúscula, número e símbolo.</div><div id="recoveryMsg" class="note" style="margin-top:10px"></div><div class="actions"><button id="recoverySaveBtn" class="btn primary" type="submit">Salvar nova senha</button></div></form></div></div>';
      document.body.appendChild(modal);
      $('passwordRecoveryForm').addEventListener('submit', async event => {
        event.preventDefault();
        const msg = $('recoveryMsg');
        const save = $('recoverySaveBtn');
        const password = $('recoveryPassword').value;
        const confirm = $('recoveryPasswordConfirm').value;
        if (!validPassword(password)) {
          msg.textContent = passwordPolicyMessage();
          return;
        }
        if (password !== confirm) {
          msg.textContent = 'As duas senhas não são iguais.';
          return;
        }
        if (!recoveryClient || !recoverySession) {
          msg.textContent = 'A sessão de recuperação expirou. Solicite um novo e-mail de recuperação.';
          return;
        }
        save.disabled = true;
        save.textContent = 'Salvando…';
        msg.textContent = '';
        try {
          const factorsResult = await recoveryClient.auth.mfa.listFactors();
          if (factorsResult.error) throw factorsResult.error;
          const factor = (factorsResult.data?.totp || []).find(f => f.status === 'verified');
          if (!factor) throw new Error('Esta conta exige MFA para alterar a senha, mas nenhum fator TOTP verificado foi encontrado.');
          const verified = await challengeMfa(factor.id, recoveryClient);
          if (!verified) { msg.textContent = 'A verificação MFA foi cancelada.'; return; }
          const { error } = await recoveryClient.auth.updateUser({ password });
          if (error) throw error;
          await recoveryClient.auth.signOut().catch(() => {});
          recoverySession = null;
          saveSession(null);
          history.replaceState({}, document.title, window.location.pathname + window.location.search);
          modal.classList.add('hidden');
          modal.setAttribute('aria-hidden', 'true');
          if ($('tradeAuthModal')) $('tradeAuthModal').classList.remove('hidden');
          if ($('authMsg')) $('authMsg').textContent = 'Senha alterada com sucesso. Faça login com a nova senha.';
          authUi();
        } catch (e) {
          msg.textContent = e?.message || 'Não foi possível alterar a senha.';
        } finally {
          save.disabled = false;
          save.textContent = 'Salvar nova senha';
        }
      });
    }
    const modal = $('passwordRecoveryModal');
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
    $('recoveryPassword').value = '';
    $('recoveryPasswordConfirm').value = '';
    $('recoveryMsg').textContent = '';
    $('recoveryPassword').focus();
  }

  function handleRecoverySession(sessionValue) {
    if (!sessionValue) return;
    recoverySession = sessionValue;
    showRecoveryModal();
  }

  async function initRecoveryFlow() {
    try {
      const client = await getRecoveryClient();
      if (!recoveryListener) {
        const { data } = client.auth.onAuthStateChange((event, sessionValue) => {
          if (event === 'PASSWORD_RECOVERY') handleRecoverySession(sessionValue);
        });
        recoveryListener = data?.subscription || null;
      }
      const hash = window.location.hash ? new URLSearchParams(window.location.hash.slice(1)) : null;
      const recoveryType = hash?.get('type');
      if (recoveryType === 'recovery') {
        const { data, error } = await client.auth.getSession();
        if (error) throw error;
        if (data.session) handleRecoverySession(data.session);
      }
    } catch (e) {
      console.warn('Password recovery initialization failed', e);
    }
  }

  let passwordResetCooldownUntil = 0;

  async function requestPasswordReset() {
    const msg = $('authMsg');
    const button = $('forgotPasswordBtn');
    const email = $('authEmail').value.trim();
    if (!email) {
      msg.textContent = 'Informe o e-mail para receber o link de recuperação.';
      $('authEmail').focus();
      return;
    }
    if (Date.now() < passwordResetCooldownUntil) {
      const seconds = Math.ceil((passwordResetCooldownUntil - Date.now()) / 1000);
      msg.textContent = `Aguarde cerca de ${seconds}s antes de solicitar outro link.`;
      return;
    }
    msg.textContent = 'Enviando e-mail de recuperação…';
    button && (button.disabled = true);
    try {
      const client = await getRecoveryClient();
      const { error } = await client.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + window.location.pathname
      });
      if (error) throw error;
      passwordResetCooldownUntil = Date.now() + 60000;
      msg.textContent = 'Se o e-mail estiver cadastrado, enviaremos um link para redefinir a senha. Verifique também a caixa de spam.';
    } catch (e) {
      const code = String(e?.code || '');
      const message = String(e?.message || '');
      if (code === 'over_email_send_rate_limit' || /rate limit|too many requests|429/i.test(message)) {
        msg.textContent = 'O Supabase atingiu o limite de envio de e-mails. Aguarde e tente novamente mais tarde.';
      } else {
        msg.textContent = message || 'Não foi possível solicitar a recuperação de senha.';
      }
    } finally {
      if (button) {
        if (Date.now() < passwordResetCooldownUntil) {
          const delay = passwordResetCooldownUntil - Date.now();
          setTimeout(() => { button.disabled = false; }, delay);
        } else {
          button.disabled = false;
        }
      }
    }
  }

  function populateArbitrageSelect(select, selectedId) { if (!select) return; select.innerHTML = Object.values(ARBS).map(x => `<option value="${x.id}" ${x.id === selectedId ? 'selected' : ''}>${x.name}</option>`).join(''); }
  function setTradeModalTitle(title) { const modal = $('tradeVisualModal'); const h2 = modal?.querySelector('.section-head h2'); if (h2) h2.textContent = title; }
  function prepareForm() { const a = currentArb(); populateArbitrageSelect($('tradeVisualArbitrage'), a.id); $('tradeVisualStrategy').innerHTML = strategies(a).map(x => `<option value="${x}">${x}</option>`).join(''); $('tradeVisualOpenedAt').value = localDate(); $('tradeVisualClosedAt').value = ''; $('tradeVisualAnchorAmount').value = ''; $('tradeVisualQuantity').value = ''; $('tradeVisualExitAmount').value = ''; $('tradeVisualMessage').textContent = ''; $('tradeVisualResult').classList.add('hidden'); $('tradeVisualModal').dataset.mode = 'new'; $('tradeVisualModal').dataset.tradeId = ''; setTradeModalTitle('Novo trade'); updateForm(); }
  function updateForm() { const a = currentArb(); const s = $('tradeVisualStrategy')?.value || strategies(a)[0]; const asset = initialAsset(s, a); const cap = Number($('tradeVisualAnchorAmount')?.value); const qty = Number($('tradeVisualQuantity')?.value); const out = Number($('tradeVisualExitAmount')?.value); if ($('tradeVisualInitialAsset')) $('tradeVisualInitialAsset').value = asset; if ($('tradeVisualAnchorLabel')) $('tradeVisualAnchorLabel').textContent = `Quantidade utilizada (${a.anchor})`; if ($('tradeVisualQuantityLabel')) $('tradeVisualQuantityLabel').textContent = `Quantidade recebida (${asset})`; if ($('tradeVisualExitAmountLabel')) $('tradeVisualExitAmountLabel').textContent = `Quantidade recebida na âncora (${a.anchor})`; if ($('tradeVisualEntryDerived')) $('tradeVisualEntryDerived').innerHTML = `Preço efetivo de entrada: <strong>${cap > 0 && qty > 0 ? `${fmt(cap / qty)} ${a.anchor}/${asset}` : '—'}</strong>`; if ($('tradeVisualExitDerived')) $('tradeVisualExitDerived').innerHTML = `Preço efetivo de saída: <strong>${out > 0 && qty > 0 ? `${fmt(out / qty)} ${a.anchor}/${asset}` : '—'}</strong>`; }
  window.updateTradeVisualForm = updateForm;
  window.openTradeVisualForm = () => { if (!session?.access_token) { showAuth(); return; } prepareForm(); $('tradeVisualModal').classList.remove('hidden'); $('tradeVisualModal').setAttribute('aria-hidden', 'false'); };
  window.closeTradeVisualForm = () => { $('tradeVisualModal')?.classList.add('hidden'); $('tradeVisualModal')?.setAttribute('aria-hidden', 'true'); };

  async function submitForm(e) { e.preventDefault(); if (!session?.access_token) { showAuth(); return false; } const a = currentArb(); const s = $('tradeVisualStrategy').value || strategies(a)[0]; const asset = initialAsset(s, a); const opened = $('tradeVisualOpenedAt').value; const closed = $('tradeVisualClosedAt').value; const cap = Number($('tradeVisualAnchorAmount').value); const qty = Number($('tradeVisualQuantity').value); const out = Number($('tradeVisualExitAmount').value); const id = $('tradeVisualModal').dataset.tradeId || ''; const msg = $('tradeVisualMessage'); const result = $('tradeVisualResult'); if (!(cap > 0) || !(qty > 0)) { msg.textContent = `Preencha a quantidade utilizada em ${a.anchor} e a quantidade recebida em ${asset}.`; return false; } if (closed || out > 0) { if (!closed || !(out > 0)) { msg.textContent = 'Para fechar, informe a data/hora de saída e a quantidade recebida na âncora.'; return false; } if (new Date(closed) < new Date(opened)) { msg.textContent = 'A saída não pode ser anterior à entrada.'; return false; } }
    const payload = { user_id: session.user.id, arbitrage_id: a.id, arbitrage_name: a.name, anchor_symbol: a.anchor, strategy: s, opened_at: new Date(opened).toISOString(), initial_anchor_amount: cap, current_asset: asset, current_quantity: qty, entry_ratio_anchor_per_asset: cap / qty, entry_anchor_amount: cap, closed_at: closed ? new Date(closed).toISOString() : null, closed_anchor_amount: closed ? out : null };
    msg.textContent = id ? 'Atualizando no PostgreSQL…' : 'Gravando no PostgreSQL…';
    try { const saved = await api(id ? `/rest/v1/trades?id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(session.user.id)}` : '/rest/v1/trades', { method: id ? 'PATCH' : 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(payload) }); if (!id && saved?.[0]) await api('/rest/v1/trade_legs', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ trade_id: saved[0].id, user_id: session.user.id, leg_order: 1, from_asset: a.anchor, to_asset: asset, from_amount: cap, to_amount: qty, ratio_from_to: qty / cap, captured_at: new Date(opened).toISOString() }) }); msg.textContent = id ? 'Trade atualizado no PostgreSQL.' : 'Trade gravado no PostgreSQL.'; const profit = closed ? out - cap : 0; result.innerHTML = closed ? `<strong>Trade fechado salvo</strong><br>${fmt(cap)} ${a.anchor} → ${fmt(qty)} ${asset} → ${fmt(out)} ${a.anchor}<br>Resultado: ${fmt(profit)} ${a.anchor} (${fmt(cap > 0 ? (profit / cap) * 100 : NaN, 4)}%)` : `<strong>Trade aberto salvo</strong><br>${fmt(cap)} ${a.anchor} → ${fmt(qty)} ${asset}<br>Preço efetivo: ${fmt(cap / qty)} ${a.anchor}/${asset}`; result.classList.remove('hidden'); await renderTrades(); } catch (e) { msg.textContent = `Erro ao salvar: ${e.message}`; } return false; }

  function ensureSimulationModal() { injectSimulationStyles(); if ($('tradeSimModal')) return; const modal = document.createElement('div'); modal.id = 'tradeSimModal'; modal.className = 'trade-sim-modal hidden'; modal.innerHTML = '<div class="trade-sim-backdrop"></div><div class="trade-sim-dialog" role="dialog" aria-modal="true"><div class="section-head"><div><h2>Simular fechamento</h2><div id="tradeSimSubtitle" class="note"></div></div><button id="tradeSimCloseTop" class="btn" type="button">Fechar</button></div><div id="tradeSimBody"></div><div class="trade-sim-actions"><button id="tradeSimRefresh" class="btn primary" type="button">⚡ Cotação agora</button><button id="tradeSimClose" class="btn" type="button">Fechar</button></div></div></div>'; document.body.appendChild(modal); modal.querySelector('.trade-sim-backdrop').onclick = closeSimulationModal; $('tradeSimCloseTop').onclick = closeSimulationModal; $('tradeSimClose').onclick = closeSimulationModal; $('tradeSimRefresh').onclick = refreshSimulationQuote; }
  function openSimulationModal() { ensureSimulationModal(); $('tradeSimModal').classList.remove('hidden'); $('tradeSimModal').setAttribute('aria-hidden', 'false'); }
  function closeSimulationModal() { $('tradeSimModal')?.classList.add('hidden'); }
  function assetId(symbol) { return CG_IDS[String(symbol || '').toUpperCase()] || null; }
  async function fetchLivePrices(symbols) { const normalized = [...new Set(symbols.map(s => String(s || '').toUpperCase()))]; const ids = normalized.map(assetId); if (ids.some(id => !id)) { const symbol = normalized.find((s, i) => !ids[i]); throw new Error(`Não há CoinGecko ID configurado para ${symbol || 'um dos ativos'}.`); } const query = `?ids=${encodeURIComponent(ids.join(','))}&vs_currencies=usd`; const endpoint = `${String(cfg.url || '').replace(/\/$/, '')}${LIVE_FN}${query}`; if (!cfg.url || !cfg.anonKey) throw new Error('Serviço de cotação não configurado.'); let res; try { res = await fetch(endpoint, { cache: 'no-store', headers: { apikey: cfg.anonKey, Accept: 'application/json' } }); } catch (e) { throw new Error(`Falha de conexão com o serviço de cotação: ${e.message || 'Failed to fetch'}`); } if (!res.ok) { let detail = ''; try { const body = await res.json(); detail = body?.error ? `: ${body.error}` : ''; } catch {} if (res.status === 429) throw new Error('Limite temporário da consulta de cotação. Tente novamente em alguns segundos.'); if (res.status === 401) throw new Error('Serviço de cotação recusou a chave pública do Supabase.'); throw new Error(`Serviço de cotação indisponível (HTTP ${res.status})${detail}.`); } const payload = await res.json(); const out = {}; normalized.forEach((symbol, i) => { const price = Number(payload?.[ids[i]]?.usd); if (Number.isFinite(price) && price > 0) out[symbol] = price; }); const missing = normalized.filter(s => !Number.isFinite(out[s])); if (missing.length) throw new Error(`Cotação não disponível para ${missing.join(', ')} agora.`); return out; }
  function renderSimulationLoading(t) { const anchor = String(t.anchor_symbol || '').toUpperCase(); const asset = String(t.current_asset || '').toUpperCase(); $('tradeSimSubtitle').textContent = `${t.strategy} · posição aberta`; $('tradeSimBody').innerHTML = `<div class="trade-sim-meta">Consultando a cotação atual de ${asset} e ${anchor}…</div>`; }
  function renderSimulationError(message) { $('tradeSimBody').innerHTML = `<div class="trade-sim-result"><strong>Não foi possível simular agora.</strong><div class="trade-sim-meta">${escapeHtml(message)}</div></div>`; }
  function renderSimulation(t, prices) { const anchor = String(t.anchor_symbol || '').toUpperCase(); const asset = String(t.current_asset || '').toUpperCase(); const initial = Number(t.initial_anchor_amount); const qty = Number(t.current_quantity); const assetPrice = Number(prices[asset]); const anchorPrice = Number(prices[anchor]); const simulatedClose = qty * assetPrice / anchorPrice; const profit = simulatedClose - initial; const pct = initial > 0 ? (profit / initial) * 100 : NaN; const entry = Number(t.entry_ratio_anchor_per_asset); const currentRatio = assetPrice > 0 && anchorPrice > 0 ? assetPrice / anchorPrice : NaN; const captured = new Date().toLocaleString('pt-BR'); const resultClass = profit >= 0 ? 'good' : 'bad'; $('tradeSimSubtitle').textContent = `${escapeHtml(t.strategy)} · cotação capturada em ${captured}`; $('tradeSimBody').innerHTML = `<div class="trade-sim-grid"><div class="trade-sim-card"><div class="k">Posição atual</div><div class="v">${fmt(qty)} ${asset}</div></div><div class="trade-sim-card"><div class="k">Capital inicial</div><div class="v">${fmt(initial)} ${anchor}</div></div><div class="trade-sim-card"><div class="k">${asset} agora</div><div class="v">${fmt(assetPrice, 10)} USD</div></div><div class="trade-sim-card"><div class="k">${anchor} agora</div><div class="v">${fmt(anchorPrice, 10)} USD</div></div><div class="trade-sim-card"><div class="k">Entrada registrada</div><div class="v">${fmt(entry, 10)} ${anchor}/${asset}</div></div><div class="trade-sim-card"><div class="k">Relação atual</div><div class="v">${fmt(currentRatio, 10)} ${anchor}/${asset}</div></div></div><div class="trade-sim-result"><div class="k">Fechamento simulado</div><div class="trade-sim-profit ${resultClass}">${fmt(simulatedClose)} ${anchor}</div><div class="trade-sim-meta">Resultado potencial: <strong>${fmt(profit)} ${anchor}</strong> · <strong>${Number.isFinite(pct) ? pct.toLocaleString('pt-BR',{maximumFractionDigits:4}) : '—'}%</strong></div><div class="trade-sim-meta">Cálculo: ${fmt(qty)} ${asset} × ${fmt(assetPrice, 10)} USD ÷ ${fmt(anchorPrice, 10)} USD = ${fmt(simulatedClose)} ${anchor}.</div><div class="trade-sim-meta">Simulação não grava o trade e não considera taxas, slippage, spread ou impacto de mercado.</div></div>`; }
  async function refreshSimulationQuote() { const t = simulationState?.trade; if (!t) return; $('tradeSimRefresh').disabled = true; $('tradeSimRefresh').textContent = 'Consultando…'; renderSimulationLoading(t); try { const prices = await fetchLivePrices([t.current_asset, t.anchor_symbol]); simulationState = { trade: t, prices, capturedAt: new Date().toISOString() }; renderSimulation(t, prices); } catch (e) { renderSimulationError(e.message || 'Erro desconhecido.'); } finally { $('tradeSimRefresh').disabled = false; $('tradeSimRefresh').textContent = '⚡ Cotação agora'; } }
  async function simulateCloseTrade(t) { if (t.closed_at) return; simulationState = { trade: t, prices: null }; openSimulationModal(); renderSimulationLoading(t); await refreshSimulationQuote(); }

  async function renderTrades() {
    const open = $('tradesOpenEmpty'), closed = $('tradesClosedEmpty'); if (!open || !closed) return;
    if (!mfaReady && session?.access_token) {
      const ready = await ensureMfaForCurrentSession();
      if (!ready) { open.textContent = 'Verificação MFA necessária para acessar seus trades.'; closed.textContent = ''; authUi(); return; }
    }
    document.querySelectorAll('.trade-row').forEach(el => el.remove());
    if (!(await ensureFreshSession())) { open.textContent = 'Faça login para consultar seus trades.'; closed.textContent = 'Faça login para consultar seus trades.'; authUi(); return; }
    const arb = currentArb();
    try {
      // RLS already enforces auth.uid() = user_id. Do not add a client-side
      // user_id filter here: a stale local user object must not hide a valid
      // row when the access token itself is still valid.
      const rows = await api(`/rest/v1/trades?select=*&arbitrage_id=eq.${encodeURIComponent(arb.id)}&order=opened_at.desc`);
      const openRows = rows.filter(t => !t.closed_at); const closedRows = rows.filter(t => t.closed_at);
      open.textContent = openRows.length ? '' : 'Nenhum trade aberto nesta arbitragem.'; closed.textContent = closedRows.length ? '' : 'Nenhum trade fechado nesta arbitragem.';
      openRows.forEach(t => open.before(tradeRow(t, false))); closedRows.forEach(t => closed.before(tradeRow(t, true)));
    } catch (e) { const message = e?.message || 'Erro ao carregar trades.'; open.textContent = `Erro ao carregar trades: ${message}`; closed.textContent = ''; }
  }
  window.refreshTrades = renderTrades;
  function tradeRow(t, closed) { const a = ARBS[t.arbitrage_name] || currentArb(); const row = document.createElement('div'); row.className = 'trade-row'; const cap = Number(t.initial_anchor_amount); const qty = Number(t.current_quantity); const out = Number(t.closed_anchor_amount); const asset = String(t.current_asset || '').toUpperCase(); const anchor = String(t.anchor_symbol || a.anchor).toUpperCase(); const profit = closed ? out - cap : null; const pct = closed && cap > 0 ? (profit / cap) * 100 : null; row.innerHTML = `<div><strong>${escapeHtml(t.strategy)}</strong><div class="note">${fmt(cap)} ${escapeHtml(anchor)} → ${fmt(qty)} ${escapeHtml(asset)}${closed ? ` → ${fmt(out)} ${escapeHtml(anchor)}` : ''}</div></div><div class="trade-row-side"><strong>${closed ? `${fmt(profit)} ${escapeHtml(anchor)}` : 'ABERTO'}</strong>${closed ? `<span class="note">${pct.toLocaleString('pt-BR',{maximumFractionDigits:4})}%</span>` : `<span class="note">${new Date(t.opened_at).toLocaleString('pt-BR')}</span>`}<div class="actions" style="margin-top:4px"><button class="btn" data-action="edit" type="button">Editar</button><button class="btn danger" data-action="delete" type="button">Excluir</button>${closed ? '' : '<button class="btn primary" data-action="simulate" type="button">Simular fechamento</button><button class="btn primary" data-action="close" type="button">Fechar trade</button>'}</div></div>`; row.querySelector('[data-action="edit"]').onclick = () => editTrade(t, false); row.querySelector('[data-action="delete"]').onclick = () => deleteTrade(t); row.querySelector('[data-action="simulate"]')?.addEventListener('click', () => simulateCloseTrade(t)); row.querySelector('[data-action="close"]')?.addEventListener('click', () => editTrade(t, true)); return row; }
  function showForm(t, closeMode = false) { if (!t) { window.openTradeVisualForm(); return; } if (!session?.access_token) { showAuth(); return; } const modal = $('tradeVisualModal'); const a = ARBS[t.arbitrage_name] || currentArb(); populateArbitrageSelect($('tradeVisualArbitrage'), t.arbitrage_id); $('tradeVisualStrategy').innerHTML = strategies(a).map(x => `<option value="${escapeHtml(x)}" ${x === t.strategy ? 'selected' : ''}>${escapeHtml(x)}</option>`).join(''); $('tradeVisualOpenedAt').value = localDate(new Date(t.opened_at)); $('tradeVisualAnchorAmount').value = t.initial_anchor_amount ?? ''; $('tradeVisualQuantity').value = t.current_quantity ?? ''; $('tradeVisualClosedAt').value = closeMode ? localDate() : (t.closed_at ? localDate(new Date(t.closed_at)) : ''); $('tradeVisualExitAmount').value = closeMode ? '' : (t.closed_anchor_amount ?? ''); $('tradeVisualMessage').textContent = closeMode ? 'Informe somente a quantidade recebida na âncora para fechar 100% da posição.' : ''; modal.dataset.tradeId = t.id; modal.dataset.mode = closeMode ? 'close' : 'edit'; setTradeModalTitle(closeMode ? 'Fechar trade' : 'Editar'); updateForm(); modal.classList.remove('hidden'); modal.setAttribute('aria-hidden', 'false'); }
  function editTrade(t, closeMode = false) { showForm(t, closeMode); }
  async function deleteTrade(t) { if (!session?.access_token) return showAuth(); if (!confirm(`Excluir o trade ${t.strategy}?`)) return; try { await api(`/rest/v1/trades?id=eq.${encodeURIComponent(t.id)}&user_id=eq.${encodeURIComponent(session.user.id)}`, { method: 'DELETE' }); await renderTrades(); } catch (e) { alert(`Erro ao excluir: ${e.message}`); } }

  async function init() {
    if (window.__cryptoArbTradesUiInitialized) return;
    window.__cryptoArbTradesUiInitialized = true;
    injectSimulationStyles();
    injectMfaStyles();
    authUi();
    $('newTradeBtn')?.addEventListener('click', window.openTradeVisualForm);
    $('tradeVisualForm')?.addEventListener('submit', submitForm);
    document.addEventListener('input', e => { if (e.target?.closest('#tradeVisualModal')) updateForm(); });
    document.addEventListener('change', e => { if (e.target?.id === 'tradeVisualStrategy' || e.target?.id === 'tradeVisualArbitrage') updateForm(); });
    initRecoveryFlow();
    if (session?.access_token) {
      const ready = await ensureMfaForCurrentSession();
      authUi();
      if (ready) await renderTrades();
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true }); else init();
})();
