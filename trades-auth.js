(() => {
  'use strict';

  let client = null;
  let initialized = false;

  const panel = () => document.getElementById('tradesPanel');
  const newTradeButton = () => document.getElementById('newTradeVisualBtn') || document.getElementById('newTradeBtn');

  function addStyles() {
    if (document.getElementById('trades-auth-style')) return;
    const style = document.createElement('style');
    style.id = 'trades-auth-style';
    style.textContent = `
      .trades-auth-line{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap}
      .trades-auth-modal{position:fixed;inset:0;z-index:1100;display:flex;align-items:center;justify-content:center;padding:18px}
      .trades-auth-modal.hidden{display:none}
      .trades-auth-backdrop{position:absolute;inset:0;background:rgba(0,0,0,.62)}
      .trades-auth-dialog{position:relative;width:min(520px,100%);background:var(--panel);border:1px solid var(--border);border-radius:18px;padding:18px;box-shadow:0 20px 60px rgba(0,0,0,.45)}
      .trades-auth-dialog .field{margin-top:10px}
      .trades-auth-message{min-height:18px;margin-top:10px}
    `;
    document.head.appendChild(style);
  }

  function ensureModal() {
    if (document.getElementById('tradesAuthModal')) return;
    const modal = document.createElement('div');
    modal.id = 'tradesAuthModal';
    modal.className = 'trades-auth-modal hidden';
    modal.innerHTML = `
      <div class="trades-auth-backdrop" data-trades-auth-close="1"></div>
      <div class="trades-auth-dialog" role="dialog" aria-modal="true" aria-labelledby="tradesAuthTitle">
        <div class="section-head">
          <h2 id="tradesAuthTitle">Acesso aos Trades</h2>
          <button class="btn" type="button" data-trades-auth-close="1">Fechar</button>
        </div>
        <form id="tradesAuthForm">
          <div class="field"><label for="tradesAuthEmail">E-mail</label><input id="tradesAuthEmail" type="email" autocomplete="email" required></div>
          <div class="field"><label for="tradesAuthPassword">Senha</label><input id="tradesAuthPassword" type="password" autocomplete="current-password" minlength="6" required></div>
          <div class="actions">
            <button class="btn primary" id="tradesAuthLogin" type="submit">Entrar</button>
            <button class="btn" id="tradesAuthSignup" type="button">Criar conta</button>
          </div>
          <div class="note trades-auth-message" id="tradesAuthMessage"></div>
        </form>
      </div>`;
    document.body.appendChild(modal);

    modal.querySelectorAll('[data-trades-auth-close]').forEach(el => el.addEventListener('click', () => closeModal()));
    document.getElementById('tradesAuthForm').addEventListener('submit', login);
    document.getElementById('tradesAuthSignup').addEventListener('click', signUp);
  }

  function setMessage(message) {
    const el = document.getElementById('tradesAuthMessage');
    if (el) el.textContent = message || '';
  }

  function openModal() {
    ensureModal();
    const modal = document.getElementById('tradesAuthModal');
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
    document.getElementById('tradesAuthEmail')?.focus();
    setMessage('');
  }

  function closeModal() {
    const modal = document.getElementById('tradesAuthModal');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
  }

  async function getClient() {
    if (client) return client;
    const cfg = window.CRYPTO_ARB_SUPABASE_CONFIG || {};
    if (!cfg.url || !cfg.anonKey) throw new Error('Configuração do Supabase não encontrada.');
    setMessage('Conectando ao serviço de Trades…');
    const mod = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
    client = mod.createClient(cfg.url, cfg.anonKey);
    return client;
  }

  async function refreshAuth() {
    try {
      const supabase = await getClient();
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      renderAuth(data.session?.user || null);
    } catch (error) {
      renderAuth(null, `Não foi possível conectar aos Trades: ${error.message || error}`);
    }
  }

  function renderAuth(user, errorMessage = '') {
    const p = panel();
    if (!p) return;
    let box = document.getElementById('tradesAuthBox');
    if (!box) {
      box = document.createElement('div');
      box.id = 'tradesAuthBox';
      box.className = 'trades-auth';
      const content = p.querySelector('#openTrades')?.parentElement;
      if (content) content.insertBefore(box, content.firstChild);
      else p.appendChild(box);
    }
    if (errorMessage) {
      box.innerHTML = `<div class="note">${escapeHtml(errorMessage)}</div>`;
      return;
    }
    if (user) {
      box.innerHTML = `<div class="trades-auth-line"><span class="note">Conectado: ${escapeHtml(user.email || 'usuário')}</span><button class="btn" id="tradesLogoutBtn" type="button">Sair</button></div>`;
      document.getElementById('tradesLogoutBtn')?.addEventListener('click', async () => {
        try { await client.auth.signOut(); renderAuth(null); }
        catch (error) { renderAuth(null, `Erro ao sair: ${error.message || error}`); }
      });
    } else {
      box.innerHTML = `<div class="trades-auth-line"><span class="note">Faça login para acessar seus trades.</span><button class="btn primary" id="tradesLoginBtn" type="button">Entrar</button></div>`;
      document.getElementById('tradesLoginBtn')?.addEventListener('click', openModal);
    }
  }

  async function login(event) {
    event.preventDefault();
    try {
      const supabase = await getClient();
      const email = document.getElementById('tradesAuthEmail').value.trim();
      const password = document.getElementById('tradesAuthPassword').value;
      setMessage('Entrando…');
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      closeModal();
      renderAuth(data.user);
    } catch (error) {
      setMessage(error.message || 'Não foi possível entrar.');
    }
  }

  async function signUp() {
    try {
      const supabase = await getClient();
      const email = document.getElementById('tradesAuthEmail').value.trim();
      const password = document.getElementById('tradesAuthPassword').value;
      if (!email || password.length < 6) {
        setMessage('Informe e-mail e uma senha com pelo menos 6 caracteres.');
        return;
      }
      setMessage('Criando conta…');
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) throw error;
      if (data.session) {
        closeModal();
        renderAuth(data.user);
      } else {
        setMessage('Conta criada. Verifique seu e-mail para confirmar o cadastro e depois entre no portal.');
      }
    } catch (error) {
      setMessage(error.message || 'Não foi possível criar a conta.');
    }
  }

  function bind() {
    if (initialized || !panel()) return;
    initialized = true;
    addStyles();
    ensureModal();
    const btn = newTradeButton();
    if (btn) btn.addEventListener('click', (event) => {
      event.preventDefault();
      openModal();
    });
    refreshAuth();
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  }

  function waitForPanel() {
    const p = panel();
    if (p) { bind(); return; }
    setTimeout(waitForPanel, 100);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', waitForPanel, { once: true });
  else waitForPanel();
})();
