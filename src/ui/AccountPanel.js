// Hesap paneli (DOM). Yalnızca src/account katmanını çağırır; oyun kodunu
// (Phaser, sahne) hiç import etmez. Bu ayrım sayesinde hesap sistemi
// kaldırıldığında tek yapılması gereken bu dosyayı ve paneli devre dışı
// bırakmaktır — oyun etkilenmez.
import { AuthApi, adoptLogin, signOut, getSession, rememberedName } from '../account/index.js';
import { validateUsername, validateEmail, validatePassword } from './AccountRules.js';

// Panel durumuna göre mesaj gösterir (renk sınıfı dahil).
function setMessage(el, text, kind = '') {
  if (!el) return;
  el.textContent = text || '';
  el.className = 'account-message' + (kind ? ' ' + kind : '');
}

// Oturum şeridini günceller: isim, kaynak etiketi ve bakiye.
export function renderSessionBar(session) {
  const bar = document.getElementById('session-bar');
  if (!bar) return;
  bar.classList.add('visible');

  const name = document.getElementById('session-name');
  const badge = document.getElementById('session-badge');
  const gold = document.getElementById('session-gold');
  const gems = document.getElementById('session-gems');
  const level = document.getElementById('session-level');

  const economy = (session && session.economy) || {};
  if (name) name.textContent = (session && session.displayName) || 'Oyuncu';
  if (badge) {
    // Etiket yalnızca bilgilendiricidir; oyun kararları buna bakmaz.
    const label = session && session.isAccount ? 'KAYITLI' : (session && session.isOffline ? 'ÇEVRİMDIŞI' : 'MİSAFİR');
    badge.textContent = label;
    badge.className = 'session-badge' + (session && session.isAccount ? ' account' : '');
  }
  if (gold) gold.textContent = `🪙 ${Number(economy.gold || 0)}`;
  if (gems) gems.textContent = `💎 ${Number(economy.gems || 0)}`;
  if (level) level.textContent = `★ ${Number(economy.level || 1)}`;
}

// Kayıt/giriş formunu bağlar. Kayıtlı oyuncu adı hatırlanır ve isim alanına
// önceden yazılır (kullanıcı her seferinde yazmasın).
export function initAccountPanel({ onChange } = {}) {
  const message = document.getElementById('account-message');
  const nameInput = document.getElementById('name-input');

  const remembered = rememberedName();
  if (remembered && nameInput && !nameInput.value) nameInput.value = remembered;

  // --- Sekme geçişi -------------------------------------------------------
  const tabs = document.querySelectorAll('.account-tab');
  for (const tab of tabs) {
    tab.addEventListener('click', () => {
      for (const other of tabs) other.classList.remove('active');
      tab.classList.add('active');
      for (const panel of document.querySelectorAll('.account-panel')) {
        panel.classList.toggle('active', panel.id === 'panel-' + tab.dataset.panel);
      }
      setMessage(message, '');
    });
  }

  // Açılışta mevcut oturumu şeritte göster (kayıtlıysa KAYITLI, değilse MİSAFİR).
  renderSessionBar(getSession());

  // --- Giriş --------------------------------------------------------------
  const loginSubmit = document.getElementById('login-submit');
  loginSubmit?.addEventListener('click', async () => {
    const email = document.getElementById('login-email')?.value || '';
    const password = document.getElementById('login-password')?.value || '';
    const emailCheck = validateEmail(email);
    if (!emailCheck.ok) return setMessage(message, emailCheck.error, 'error');
    if (!password) return setMessage(message, 'Şifre gerekli.', 'error');

    setMessage(message, 'Giriş yapılıyor...');
    loginSubmit.disabled = true;
    const result = await AuthApi.login(emailCheck.value, password);
    loginSubmit.disabled = false;

    if (!result.ok) return setMessage(message, result.error || 'Giriş başarısız.', 'error');
    const session = await adoptLogin(result, nameInput?.value || 'Oyuncu');
    if (nameInput) nameInput.value = session.displayName;
    setMessage(message, `Hoş geldin, ${session.displayName}!`, 'ok');
    renderSessionBar(session);
    if (onChange) onChange(session);
  });

  // --- Kayıt --------------------------------------------------------------
  const registerSubmit = document.getElementById('register-submit');
  registerSubmit?.addEventListener('click', async () => {
    const username = document.getElementById('register-username')?.value || '';
    const email = document.getElementById('register-email')?.value || '';
    const password = document.getElementById('register-password')?.value || '';

    const nameCheck = validateUsername(username);
    if (!nameCheck.ok) return setMessage(message, nameCheck.error, 'error');
    const emailCheck = validateEmail(email);
    if (!emailCheck.ok) return setMessage(message, emailCheck.error, 'error');
    const passwordCheck = validatePassword(password);
    if (!passwordCheck.ok) return setMessage(message, passwordCheck.error, 'error');

    setMessage(message, 'Hesap oluşturuluyor...');
    registerSubmit.disabled = true;
    const result = await AuthApi.register(emailCheck.value, nameCheck.value, password);
    registerSubmit.disabled = false;

    if (!result.ok) return setMessage(message, result.error || 'Kayıt başarısız.', 'error');
    const session = await adoptLogin(result, nameCheck.value);
    if (nameInput) nameInput.value = session.displayName;
    setMessage(message, 'Hesap oluşturuldu. İyi oyunlar!', 'ok');
    renderSessionBar(session);
    if (onChange) onChange(session);
  });

  // --- Çıkış --------------------------------------------------------------
  const signout = document.getElementById('account-signout');
  signout?.addEventListener('click', async () => {
    const session = await signOut();
    setMessage(message, 'Çıkış yapıldı. Misafir olarak devam ediyorsun.', 'ok');
    renderSessionBar(session);
    if (onChange) onChange(session);
  });

  // --- Misafir olarak devam ----------------------------------------------
  // Hesap sisteminin oyunu bloke ETMEDİĞİNİN somut kanıtı: bu düğme her zaman
  // oyunu başlatır ve oturum misafire düşer.
  const guestContinue = document.getElementById('guest-continue');
  guestContinue?.addEventListener('click', () => {
    const submit = document.getElementById('name-submit');
    if (submit) submit.click();
  });

  return { setMessage };
}