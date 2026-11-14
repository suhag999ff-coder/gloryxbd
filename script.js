const firebaseConfig = {
  apiKey: "AIzaSyDfr3cE9rBjlA_R11nX1Rz0RECZoIHOtuE",
  authDomain: "glory-x-bd.firebaseapp.com",
  databaseURL: "https://glory-x-bd-default-rtdb.firebaseio.com",
  projectId: "glory-x-bd",
  storageBucket: "glory-x-bd.firebasestorage.app",
  messagingSenderId: "599721330782",
  appId: "1:599721330782:web:f461c692c25f6472674ccf"
};
let db, auth;
try {
  if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
  db = firebase.firestore();
  auth = firebase.auth();
} catch (e) { console.error(e); }

const $ = id => document.getElementById(id);
const setText = (id, v) => { const el = $(id); if (el) el.textContent = v; };

/* ═══════════════ STATE ═══════════════ */
let currentUser = null, userData = {}, userBalance = 0;
let allGames = [], gamesCache = {}, allCategories = [];
let allPromotions = [], promoIndex = 0;
let currentGame = null, selectedPackage = null, selectedPayMethod = 'wallet';
let siteConfig = {}, paymentConfig = {}, allBanners = [];
let bannerIndex = 0, bannerTimer = null;
let depositAmount = 0, currentDepMethod = 'bkash';
let checkoutContext = 'addmoney', pendingOrder = null;
let playerApiConfig = {};
let popupConfig = null, currentPopupLink = null;
let publicListenersStarted = false;
let currentDynamicFields = []; // [{label, type, placeholder, value, required}]

const DEFAULT_LOGOS = {
  bkash: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c5/BKash_Logo.svg/512px-BKash_Logo.svg.png',
  nagad: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8d/Nagad_Logo.svg/512px-Nagad_Logo.svg.png',
  rocket: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5e/Rocket_Logo.svg/512px-Rocket_Logo.svg.png'
};
const FALLBACK_TEXT = { bkash: 'bKash', nagad: 'Nagad', rocket: 'Rocket' };
const THEME_COLORS = {
  bkash: { bg: 'linear-gradient(135deg,#E2136E,#FF4B8B)', color: '#E2136E' },
  nagad: { bg: 'linear-gradient(135deg,#EC1C24,#FF5A5A)', color: '#EC1C24' },
  rocket: { bg: 'linear-gradient(135deg,#6638E8,#8B6DF0)', color: '#6638E8' }
};

function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('show'), 2500);
}

/* ═══════════════ AUTH ═══════════════ */
auth.onAuthStateChanged(user => {
  if (user) {
    currentUser = user;
    $('guestHeader').classList.add('hidden');
    $('userHeader').classList.remove('hidden');
    startUserListener();
    closeLogin();
    checkPushBanner();
  } else {
    currentUser = null; userData = {}; userBalance = 0;
    $('guestHeader').classList.remove('hidden');
    $('userHeader').classList.add('hidden');
    setText('headerBalance', '0');
  }
});

function requireAuth() {
  if (!currentUser) { openLogin(); return false; }
  return true;
}
function openLogin() { $('loginModal').classList.remove('hidden'); }
function closeLogin() { $('loginModal').classList.add('hidden'); }
function switchAuth(type) {
  $('tabLogin').classList.toggle('on', type === 'login');
  $('tabRegister').classList.toggle('on', type === 'register');
  $('loginForm').classList.toggle('hidden', type !== 'login');
  $('registerForm').classList.toggle('hidden', type !== 'register');
}

async function handleGoogleLogin() {
  const provider = new firebase.auth.GoogleAuthProvider();
  try {
    Swal.showLoading();
    const result = await auth.signInWithPopup(provider);
    const user = result.user;
    const userRef = db.collection('users').doc(user.uid);
    const doc = await userRef.get();
    if (!doc.exists) {
      await userRef.set({
        name: user.displayName || 'Google User',
        email: user.email,
        phone: '',
        profilePic: user.photoURL || '',
        balance: 0, totalSpend: 0, weeklySpend: 0, totalOrders: 0,
        isVerified: false, isPremium: false,
        createdAt: new Date()
      });
    }
    Swal.close();
    toast('Logged in successfully');
  } catch (err) {
    Swal.fire('Login Failed', err.message, 'error');
  }
}

async function handleLogin() {
  const e = $('loginEmail').value.trim(), p = $('loginPass').value;
  if (!e || !p) return Swal.fire('Error', 'Fill all fields', 'warning');
  Swal.showLoading();
  try { await auth.signInWithEmailAndPassword(e, p); Swal.close(); }
  catch (err) { Swal.fire('Login Failed', err.message, 'error'); }
}

async function handleRegister() {
  const n = $('regName').value.trim(), e = $('regEmail').value.trim(),
    ph = $('regPhone').value.trim(), p = $('regPass').value;
  if (!n || !e || !ph || !p) return Swal.fire('Error', 'Fill all fields', 'warning');
  if (p.length < 6) return Swal.fire('Error', 'Password must be 6+ chars', 'warning');
  Swal.showLoading();
  try {
    const c = await auth.createUserWithEmailAndPassword(e, p);
    await db.collection('users').doc(c.user.uid).set({
      name: n, email: e, phone: ph, profilePic: '',
      balance: 0, totalSpend: 0, weeklySpend: 0, totalOrders: 0,
      isVerified: false, isPremium: false, createdAt: new Date()
    });
    Swal.close();
  } catch (err) { Swal.fire('Error', err.message, 'error'); }
}

function doLogout() {
  Swal.fire({
    title: 'Log Out?', icon: 'question',
    showCancelButton: true, confirmButtonText: 'Yes', confirmButtonColor: '#4F46E5'
  }).then(r => {
    if (r.isConfirmed) { auth.signOut(); closeSidePanel(); toast('Logged out'); }
  });
}

/* ═══════════════ PUSH ═══════════════ */
const PUSH_KEY = 'gloryx_push_dismissed';
function checkPushBanner() {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'granted') return;
  if (Notification.permission === 'denied') return;
  if (localStorage.getItem(PUSH_KEY) === '1') return;
  $('pushBanner').classList.remove('hidden');
}
function dismissPushBanner() {
  localStorage.setItem(PUSH_KEY, '1');
  $('pushBanner').classList.add('hidden');
}
async function enablePushNotifications() {
  if (!('Notification' in window)) return toast('Push not supported');
  try {
    const permission = Notification.permission === 'granted'
      ? 'granted' : await Notification.requestPermission();
    if (permission !== 'granted') return toast('Permission denied');
    // Store preference in user doc (for admin to know)
    if (currentUser) {
      await db.collection('users').doc(currentUser.uid).set(
        { pushEnabled: true, pushEnabledAt: new Date() }, { merge: true }
      ).catch(() => {});
    }
    localStorage.setItem(PUSH_KEY, '1');
    $('pushBanner').classList.add('hidden');
    toast('Notifications enabled ✓');
  } catch (e) { toast('Failed: ' + (e.message || 'Unknown')); }
}

/* ═══════════════ DATA LISTENERS ═══════════════ */
function startPublicListeners() {
  if (publicListenersStarted) return;
  publicListenersStarted = true;

  // Site config
  db.collection('settings').doc('general').onSnapshot(doc => {
    siteConfig = doc.exists ? doc.data() : {};
    applySocialLinks();
    applyBrandingImages();
    renderDescBoxes();
  });

  // Payment config
  db.collection('admin').doc('payment').onSnapshot(doc => {
    paymentConfig = doc.exists ? doc.data() : {};
    updatePaymentLogos();
  });

  // Player API
  db.collection('settings').doc('playerApi').onSnapshot(doc => {
    playerApiConfig = doc.exists ? doc.data() : {};
  });

  // Popup config
  db.collection('settings').doc('popup').onSnapshot(doc => {
    popupConfig = doc.exists ? doc.data() : null;
    if (popupConfig && popupConfig.enabled) {
      setTimeout(() => showAdminPopup(), 800);
    }
  });

  // Banners
  db.collection('banners').onSnapshot(snap => {
    allBanners = [];
    snap.forEach(d => allBanners.push(d.data()));
    renderHomeSlider();
  });

  // Promotions
  db.collection('promotions').where('active', '==', true).onSnapshot(snap => {
    allPromotions = [];
    snap.forEach(d => allPromotions.push(Object.assign({ id: d.id }, d.data())));
    renderPromoSlider();
    renderPromotionList();
  });

  // Categories
  db.collection('categories').orderBy('order', 'asc').onSnapshot(snap => {
    allCategories = [];
    snap.forEach(d => allCategories.push(d.data()));
    renderHomeProducts();
  });

  // Services (games)
  db.collection('services').onSnapshot(snap => {
    allGames = [];
    gamesCache = {};
    snap.forEach(d => {
      const g = Object.assign({ id: d.id }, d.data());
      allGames.push(g);
      gamesCache[d.id] = g;
    });
    renderHomeProducts();
  });
}

function startUserListener() {
  db.collection('users').doc(currentUser.uid).onSnapshot(doc => {
    if (!doc.exists) return;
    userData = doc.data();
    userBalance = parseInt(userData.balance || 0);
    setText('headerBalance', userBalance);
    setText('productBalance', userBalance);
    setText('accBalance', userBalance + '৳');
    setText('accOrders', userData.totalOrders || 0);
    setText('accSpent', (userData.totalSpend || 0).toLocaleString() + '৳');
    setText('accWeekly', (userData.weeklySpend || 0).toLocaleString() + '৳');
    setText('accountName', userData.name || 'User');
    setText('accountEmail', userData.email || '-');
    setText('sideName', userData.name || 'User');
    setText('sideEmail', userData.email || '-');

    const initial = (userData.name || 'U').charAt(0).toUpperCase();
    if (userData.profilePic) {
      $('headerAvatar').innerHTML = `<img src="${userData.profilePic}" style="width:100%;height:100%;object-fit:cover;border-radius:10px">`;
      $('accountAvatar').innerHTML = `<img src="${userData.profilePic}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
      $('sideAvatar').innerHTML = `<img src="${userData.profilePic}" style="width:100%;height:100%;object-fit:cover;border-radius:12px">`;
    } else {
      $('headerAvatar').textContent = initial;
      $('accountAvatar').textContent = initial;
      $('sideAvatar').textContent = initial;
    }
  });
}

/* ═══════════════ NAVIGATION ═══════════════ */
function goSection(name) {
  if (['account', 'orders', 'codes'].includes(name) && !requireAuth()) return;
  document.querySelectorAll('.page-section').forEach(s => s.classList.add('hidden'));
  const target = $(name + 'Section');
  if (target) target.classList.remove('hidden');
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('on'));
  const navBtn = document.querySelector(`.nav-item[data-nav="${name}"]`);
  if (navBtn) navBtn.classList.add('on');
  window.scrollTo({ top: 0, behavior: 'smooth' });
  if (name === 'orders') loadOrders();
  if (name === 'codes') loadCodes();
}

/* ═══════════════ SLIDER ═══════════════ */
function renderHomeSlider() {
  const track = $('sliderTrack'), dots = $('sliderDots');
  if (allBanners.length === 0) {
    track.innerHTML = '<div class="slide"><img src="https://placehold.co/800x400/161B26/4F46E5?text=GLORY+X+BD"></div>';
    return;
  }
  let html = '', dotHtml = '';
  allBanners.forEach((b, i) => {
    html += `<div class="slide"><img src="${b.image}" onerror="this.src='https://placehold.co/800x400/161B26/4F46E5?text=GLORY+X+BD'"></div>`;
    dotHtml += `<i class="${i === 0 ? 'on' : ''}" onclick="goSlide(${i})"></i>`;
  });
  track.innerHTML = html;
  dots.innerHTML = dotHtml;
  bannerIndex = 0;
  updateSlider();
  clearInterval(bannerTimer);
  bannerTimer = setInterval(() => {
    bannerIndex = (bannerIndex + 1) % allBanners.length;
    updateSlider();
  }, 4000);
}
function goSlide(i) { bannerIndex = i; updateSlider(); }
function updateSlider() {
  $('sliderTrack').style.transform = `translateX(-${bannerIndex * 100}%)`;
  document.querySelectorAll('#sliderDots i').forEach((d, i) => d.classList.toggle('on', i === bannerIndex));
}

/* ═══════════════ PRODUCTS ═══════════════ */
function renderHomeProducts() {
  const grid = $('homeProductGrid');
  if (!grid) return;
  if (allGames.length === 0) {
    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:var(--muted);padding:40px 20px">No products available</div>';
    return;
  }
  const grouped = {};
  allGames.forEach(g => {
    const cn = (g.category || 'Other').trim();
    if (!grouped[cn]) grouped[cn] = [];
    grouped[cn].push(g);
  });
  let html = '';
  allCategories.forEach(cat => {
    if (grouped[cat.name]) {
      html += `<div class="section-title" style="grid-column:1/-1"><span></span><h2>${cat.name}</h2></div>`;
      grouped[cat.name].forEach(g => { html += gameCardHTML(g); });
      delete grouped[cat.name];
    }
  });
  Object.keys(grouped).forEach(cn => {
    html += `<div class="section-title" style="grid-column:1/-1"><span></span><h2>${cn}</h2></div>`;
    grouped[cn].forEach(g => { html += gameCardHTML(g); });
  });
  grid.innerHTML = html;
}
function gameCardHTML(g) {
  const img = g.image || 'https://placehold.co/300x300/161B26/4F46E5?text=Game';
  return `<div class="game-card" onclick="openGame('${g.id}')">
    <div class="game-thumb"><img src="${img}" onerror="this.src='https://placehold.co/300x300/161B26/4F46E5?text=Game'"></div>
    <div class="game-name">${g.name || 'Game'}</div>
  </div>`;
}

/* ═══════════════ OPEN GAME ═══════════════ */
function openGame(gid) {
  const g = gamesCache[gid];
  if (!g) return;
  currentGame = g;
  selectedPackage = null;
  selectedPayMethod = 'wallet';

  $('productImage').src = g.image || 'https://placehold.co/300x300/161B26/4F46E5?text=Game';
  setText('productName', g.name || 'Game');

  // Build fields array (multi-field support)
  let fields = [];
  if (Array.isArray(g.inputFields) && g.inputFields.length > 0) {
    fields = g.inputFields.map(f => ({
      label: f.label || 'Enter Value',
      type: f.type || 'text',
      placeholder: f.placeholder || '',
      required: f.required !== false
    }));
  } else {
    // Fallback for old games: single field
    fields = [{
      label: g.inputLabel || 'Enter Your Guild ID',
      type: g.inputType || 'text',
      placeholder: g.inputPlaceholder || g.inputLabel || 'Enter Guild ID',
      required: true
    }];
  }
  currentDynamicFields = fields;
  renderGameInputs(fields);

  $('nameResult').className = 'name-result';

  // Rules / Terms
  if (g.rules && g.rules.trim()) {
    $('rulesCard').classList.remove('hidden');
    const items = g.rules.split('\n').map(x => x.trim()).filter(Boolean);
    $('rulesList').innerHTML = items.map(l => `<li>${l}</li>`).join('');
  } else {
    $('rulesCard').classList.add('hidden');
  }

  // Packages
  $('packageGrid').innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:20px"><i class="fas fa-spinner fa-spin"></i></div>';
  db.collection('services').doc(gid).collection('products').orderBy('price', 'asc').get().then(snap => {
    if (snap.empty) {
      $('packageGrid').innerHTML = '<div style="grid-column:1/-1;text-align:center;color:var(--muted)">No packages</div>';
      return;
    }
    let html = '';
    snap.forEach(d => {
      const p = d.data();
      const inStock = p.stock !== false && p.stock !== 'out';
      const price = parseInt(p.price || 0);
      const name = (p.name || '-').replace(/'/g, '&#39;');
      html += `<button class="package-btn" data-id="${d.id}" data-name="${name}" data-price="${price}" ${inStock ? '' : 'disabled'} onclick="pickPackage(this)">
        <span>${name}</span><b>৳ ${price}</b>
      </button>`;
    });
    $('packageGrid').innerHTML = html;
  });

  goSection('product');
}

function renderGameInputs(fields) {
  const wrap = $('dynamicInputsWrap');
  wrap.innerHTML = fields.map((f, i) => {
    const req = f.required ? '<span class="req">*</span>' : '';
    if (f.type === 'select') {
      const opts = (f.options || []).map(o => `<option value="${o}">${o}</option>`).join('');
      return `<div class="dyn-field">
        <label class="dyn-field-label">${f.label}${req}</label>
        <select class="field-input" data-field-index="${i}">
          <option value="">Select...</option>${opts}
        </select>
      </div>`;
    }
    const inputMode = f.type === 'number' ? 'numeric' : (f.type === 'email' ? 'email' : 'text');
    return `<div class="dyn-field">
      <label class="dyn-field-label">${f.label}${req}</label>
      <input class="field-input" type="${f.type}" inputmode="${inputMode}" placeholder="${f.placeholder}" data-field-index="${i}">
    </div>`;
  }).join('');
}

function collectAccountData() {
  const inputs = document.querySelectorAll('#dynamicInputsWrap [data-field-index]');
  const data = {};
  const errors = [];
  inputs.forEach(el => {
    const idx = parseInt(el.dataset.fieldIndex);
    const field = currentDynamicFields[idx];
    const val = (el.value || '').trim();
    if (field.required && !val) errors.push(field.label);
    data[field.label] = val;
  });
  return { data, errors };
}

function pickPackage(btn) {
  document.querySelectorAll('.package-btn').forEach(b => b.classList.remove('on'));
  btn.classList.add('on');
  selectedPackage = {
    id: btn.dataset.id,
    name: btn.dataset.name,
    price: parseInt(btn.dataset.price)
  };
  setText('needAmount', selectedPackage.price);
}
function selectPayMethod(type) {
  document.querySelectorAll('.pay-option').forEach(p => p.classList.remove('on'));
  $('pay-' + type).classList.add('on');
  selectedPayMethod = type;
}

/* ═══════════════ PLAYER CHECK ═══════════════ */
async function checkPlayerName() {
  const { data } = collectAccountData();
  const firstValue = Object.values(data)[0] || '';
  const box = $('nameResult');
  if (!firstValue) {
    box.className = 'name-result err';
    box.textContent = 'Fill required fields first';
    return;
  }
  if (!playerApiConfig.url || !playerApiConfig.url.trim()) {
    box.className = 'name-result ok';
    box.innerHTML = `<svg class="ic"><use href="#i-check"/></svg> ID Verified: ${firstValue}`;
    return;
  }
  box.className = 'name-result';
  box.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Checking...';
  try {
    const built = buildApiUrl(playerApiConfig.url, firstValue);
    if (!built) throw new Error('Invalid API');
    const res = await fetch(built);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    const namePath = playerApiConfig.namePath || 'player.name';
    const name = getNested(data, namePath);
    if (name && typeof name === 'string' && name.trim()) {
      box.className = 'name-result ok';
      box.innerHTML = `<svg class="ic"><use href="#i-check"/></svg> ${name}`;
    } else {
      box.className = 'name-result err';
      box.innerHTML = '<svg class="ic"><use href="#i-x"/></svg> Player not found';
    }
  } catch (e) {
    box.className = 'name-result err';
    box.innerHTML = `<svg class="ic"><use href="#i-x"/></svg> ${e.message || 'Check failed'}`;
  }
}
function buildApiUrl(url, uid) {
  try {
    if (url.includes('{uid}')) return url.replace('{uid}', encodeURIComponent(uid));
    const u = new URL(url);
    if (!u.searchParams.get('uid')) u.searchParams.set('uid', uid);
    return u.toString();
  } catch (e) { return null; }
}
function getNested(obj, path) {
  if (!obj || !path) return undefined;
  return path.split('.').reduce((c, p) => c && c[p] !== undefined ? c[p] : undefined, obj);
}

/* ═══════════════ ORDER ═══════════════ */
async function placeOrder() {
  if (!requireAuth()) return;
  if (!selectedPackage) return toast('Select a package first');

  const { data: accountData, errors } = collectAccountData();
  if (errors.length > 0) return toast('Fill required: ' + errors.join(', '));

  // Build combined accountId string for admin view
  const accountId = Object.entries(accountData)
    .map(([k, v]) => `${k}: ${v}`).join(' | ');

  if (selectedPayMethod === 'wallet') {
    if (userBalance < selectedPackage.price) {
      Swal.fire({
        icon: 'error', title: 'Insufficient Balance',
        html: `Balance: <b>৳${userBalance}</b><br>Required: <b>৳${selectedPackage.price}</b>`,
        showCancelButton: true, confirmButtonText: 'Add Money', confirmButtonColor: '#4F46E5'
      }).then(r => { if (r.isConfirmed) goSection('addmoney'); });
      return;
    }
    const confirm = await Swal.fire({
      title: 'Confirm Order?',
      html: `<div style="text-align:left;font-size:13px;line-height:1.9">
        <b>Game:</b> ${currentGame.name}<br>
        <b>Package:</b> ${selectedPackage.name}<br>
        <b>Price:</b> ৳${selectedPackage.price}
        ${Object.entries(accountData).map(([k, v]) => `<br><b>${k}:</b> ${v}`).join('')}
      </div>`,
      icon: 'question', showCancelButton: true, confirmButtonText: 'Confirm', confirmButtonColor: '#4F46E5'
    });
    if (!confirm.isConfirmed) return;
    Swal.showLoading();

    try {
      const batch = db.batch();
      batch.update(db.collection('users').doc(currentUser.uid), {
        balance: firebase.firestore.FieldValue.increment(-selectedPackage.price),
        totalSpend: firebase.firestore.FieldValue.increment(selectedPackage.price),
        weeklySpend: firebase.firestore.FieldValue.increment(selectedPackage.price),
        totalOrders: firebase.firestore.FieldValue.increment(1)
      });
      batch.set(db.collection('orders').doc(), {
        userId: currentUser.uid,
        userName: userData.name || currentUser.email,
        userEmail: currentUser.email,
        gameId: currentGame.id,
        gameName: currentGame.name,
        accountData: accountData,
        accountId: accountId,
        inputLabel: currentDynamicFields.map(f => f.label).join(', '),
        productId: selectedPackage.id,
        productName: selectedPackage.name,
        price: selectedPackage.price,
        status: 'pending',
        paymentType: 'wallet',
        date: new Date()
      });
      await batch.commit();
      Swal.fire({ icon: 'success', title: 'Order Placed!', text: 'Admin will verify shortly', timer: 2000, showConfirmButton: false });
      goSection('home');
    } catch (e) { Swal.fire('Error', e.message, 'error'); }

  } else {
    // Instant pay
    checkoutContext = 'order';
    pendingOrder = {
      gameId: currentGame.id,
      gameName: currentGame.name,
      accountData: accountData,
      accountId: accountId,
      inputLabel: currentDynamicFields.map(f => f.label).join(', '),
      productId: selectedPackage.id,
      productName: selectedPackage.name,
      price: selectedPackage.price
    };
    depositAmount = selectedPackage.price;
    $('depositAmount').value = selectedPackage.price;
    goSection('addmoney');
    goToPayment();
  }
}

/* ═══════════════ ADD MONEY ═══════════════ */
function addAmount(a) {
  const inp = $('depositAmount');
  inp.value = (parseInt(inp.value) || 0) + a;
}
function goToPayment() {
  if (!requireAuth()) return;
  const amt = parseInt($('depositAmount').value);
  if (!amt || amt < 10) return toast('Minimum 10৳ required');
  depositAmount = amt;
  $('amountCard').classList.add('hidden');
  $('paymentCard').classList.remove('hidden');
  updatePaymentLogos();
  selectDepMethod('bkash');
}
function backToAmount() {
  $('paymentCard').classList.add('hidden');
  $('amountCard').classList.remove('hidden');
  if (checkoutContext === 'order') {
    checkoutContext = 'addmoney';
    pendingOrder = null;
  }
}
function updatePaymentLogos() {
  ['bkash', 'nagad', 'rocket'].forEach(k => {
    const box = $('depLogo-' + k);
    if (!box) return;
    const logoKey = 'logo' + k.charAt(0).toUpperCase() + k.slice(1);
    const url = paymentConfig[logoKey] || DEFAULT_LOGOS[k];
    box.innerHTML = `<img src="${url}" onerror="this.style.display='none';this.nextElementSibling.style.display='grid'">
      <div class="text-fallback" style="display:none;color:${THEME_COLORS[k].color}">${FALLBACK_TEXT[k]}</div>`;
  });
}

function selectDepMethod(method) {
  currentDepMethod = method;
  document.querySelectorAll('.pay-method-circle').forEach(el => el.classList.remove('on'));
  $('pm-' + method).classList.add('on');

  const theme = THEME_COLORS[method];
  $('brandBanner').style.background = theme.bg;

  const logoKey = 'logo' + method.charAt(0).toUpperCase() + method.slice(1);
  const logoUrl = paymentConfig[logoKey] || DEFAULT_LOGOS[method];
  $('selectedBrandLogo').innerHTML = `<img src="${logoUrl}" onerror="this.style.display='none';this.parentNode.innerHTML='<span style=\\'color:${theme.color};font-weight:900;font-size:10px;text-align:center\\'>${FALLBACK_TEXT[method]}</span>'">`;
  setText('selectedBrandName', method.charAt(0).toUpperCase() + method.slice(1));

  const number = paymentConfig[method] || '01XXXXXXXXX';
  setText('receiverNumber', number);

  const qr = paymentConfig[method + 'Qr'];
  if (qr && qr.trim()) {
    $('qrBox').classList.remove('hidden');
    $('qrImage').src = qr;
  } else {
    $('qrBox').classList.add('hidden');
  }

  let insts = paymentConfig['instruction' + method.charAt(0).toUpperCase() + method.slice(1)];
  if (insts) {
    insts = insts.split('\n').filter(x => x.trim());
  } else {
    insts = [
      `Open your <b>${method.toUpperCase()}</b> App and select <b>"Send Money"</b>`,
      `Enter the number <b>${number}</b> and amount <b>৳${depositAmount}</b>`,
      `Complete the transaction using your PIN`,
      `Copy the <b>Transaction ID (TrxID)</b> from success message`,
      `Paste the TrxID and your Sender Number below, then click Submit`
    ];
  }
  $('instructionList').innerHTML = insts.map(i => `<li>${i}</li>`).join('');

  $('senderNumber').value = '';
  $('trxId').value = '';
}

function copyNumber() {
  const num = $('receiverNumber').textContent;
  navigator.clipboard.writeText(num).then(() => toast('Number copied ✓'));
}

async function submitDeposit() {
  const sender = $('senderNumber').value.trim();
  const trx = $('trxId').value.trim().toUpperCase();

  if (!/^01\d{9}$/.test(sender)) return toast('Enter valid 11-digit sender number');
  if (!trx || trx.length < 4) return toast('Enter valid TrxID');

  const btn = $('submitDepositBtn');
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Verifying...';
  btn.disabled = true;

  try {
    const dup = await db.collection('deposits').where('trxId', '==', trx).limit(1).get();
    if (!dup.empty) throw new Error('This TrxID was already used');

    if (checkoutContext === 'order' && pendingOrder) {
      await db.collection('orders').add({
        userId: currentUser.uid,
        userName: userData.name || currentUser.email,
        userEmail: currentUser.email,
        gameId: pendingOrder.gameId,
        gameName: pendingOrder.gameName,
        accountData: pendingOrder.accountData,
        accountId: pendingOrder.accountId,
        inputLabel: pendingOrder.inputLabel,
        productId: pendingOrder.productId,
        productName: pendingOrder.productName,
        price: pendingOrder.price,
        status: 'pending',
        paymentType: 'direct',
        method: currentDepMethod,
        trxId: trx,
        senderNumber: sender,
        date: new Date()
      });
      Swal.fire({ icon: 'success', title: 'Order Submitted!', text: 'Admin will verify within 5-10 minutes', timer: 2200, showConfirmButton: false });
    } else {
      await db.collection('deposits').add({
        userId: currentUser.uid,
        userEmail: currentUser.email,
        amount: depositAmount,
        method: currentDepMethod,
        trxId: trx,
        senderNumber: sender,
        status: 'pending',
        date: new Date()
      });
      Swal.fire({ icon: 'success', title: 'Payment Submitted!', html: `৳${depositAmount} will be added within 5-10 minutes`, timer: 2400, showConfirmButton: false });
    }

    $('depositAmount').value = '';
    checkoutContext = 'addmoney';
    pendingOrder = null;
    goSection('home');
  } catch (e) {
    Swal.fire('Error', e.message, 'error');
  } finally {
    btn.innerHTML = 'Verify & Submit';
    btn.disabled = false;
  }
}

/* ═══════════════ PROMOTIONS ═══════════════ */
function renderPromoSlider() {
  const track = $('promoSliderTrack'), dots = $('promoSliderDots');
  if (!track || allPromotions.length === 0) return;
  let html = '', dotHtml = '';
  allPromotions.forEach((p, i) => {
    html += `<div class="promo-slide"><img src="${p.image}" onerror="this.src='https://placehold.co/800x400/161B26/4F46E5?text=Promo'"></div>`;
    dotHtml += `<i class="${i === 0 ? 'on' : ''}" onclick="goPromoSlide(${i})"></i>`;
  });
  track.innerHTML = html;
  dots.innerHTML = dotHtml;
  promoIndex = 0;
  updatePromoSlide();
}
function goPromoSlide(i) { promoIndex = i; updatePromoSlide(); }
function updatePromoSlide() {
  $('promoSliderTrack').style.transform = `translateX(-${promoIndex * 100}%)`;
  document.querySelectorAll('#promoSliderDots i').forEach((d, i) => d.classList.toggle('on', i === promoIndex));
}
function renderPromotionList() {
  const list = $('promotionList');
  if (!list) return;
  if (allPromotions.length === 0) {
    list.innerHTML = '<div style="text-align:center;color:var(--muted);padding:20px">No promotions available</div>';
    return;
  }
  list.innerHTML = allPromotions.map(p => `
    <div class="promo-card">
      <img src="${p.image}" onerror="this.src='https://placehold.co/800x400/161B26/4F46E5?text=Promo'">
      <div class="promo-body">
        <h3>${p.title || 'Offer'}</h3>
        ${p.link ? `<a class="promo-link" href="${p.link}" target="_blank">Claim Offer</a>` : ''}
      </div>
    </div>
  `).join('');
}

/* ═══════════════ DESC BOXES (Admin) ═══════════════ */
function renderDescBoxes() {
  const wrap = $('descBoxesWrap');
  if (!wrap) return;
  const boxes = Array.isArray(siteConfig.descBoxes) ? siteConfig.descBoxes : [];
  if (boxes.length === 0) { wrap.innerHTML = ''; return; }
  wrap.innerHTML = boxes.map(b => {
    const color = b.color || '#4F46E5';
    const icon = b.icon || 'fa-info-circle';
    return `<div class="desc-box" style="border-left-color:${color}">
      <div class="desc-box-head">
        <div class="desc-box-icon" style="background:${color}22;color:${color}"><i class="fas ${icon}"></i></div>
        <div class="desc-box-title">${b.title || ''}</div>
      </div>
      <div class="desc-box-body">${b.body || ''}</div>
    </div>`;
  }).join('');
}

/* ═══════════════ ADMIN POPUP ═══════════════ */
const POPUP_SESSION_KEY = 'gloryx_popup_seen';
function showAdminPopup() {
  if (!popupConfig || !popupConfig.enabled) return;
  // Show once per session
  const seenKey = POPUP_SESSION_KEY + '_' + (popupConfig.updatedAt?.seconds || 'default');
  if (sessionStorage.getItem(seenKey) === '1') return;

  setText('popupTitle', popupConfig.title || 'Announcement');
  setText('popupText', popupConfig.body || '');
  const btn = $('popupBtn');
  btn.textContent = popupConfig.buttonText || 'Got it';
  currentPopupLink = popupConfig.buttonLink || null;

  if (popupConfig.image && popupConfig.image.trim()) {
    $('popupImage').src = popupConfig.image;
    $('popupImageWrap').classList.remove('hidden');
  } else {
    $('popupImageWrap').classList.add('hidden');
  }

  $('adminPopup').classList.remove('hidden');
  // Save session seen
  sessionStorage.setItem(seenKey, '1');
}
function closeAdminPopup() {
  $('adminPopup').classList.add('hidden');
}
function popupAction() {
  if (currentPopupLink && currentPopupLink.trim()) {
    window.open(currentPopupLink, '_blank');
  }
  closeAdminPopup();
}

/* ═══════════════ ORDERS & CODES ═══════════════ */
async function loadOrders() {
  const list = $('ordersList');
  if (!list || !currentUser) return;
  list.innerHTML = '<div style="text-align:center;padding:20px"><i class="fas fa-spinner fa-spin"></i></div>';
  try {
    const snap = await db.collection('orders').where('userId', '==', currentUser.uid).get();
    if (snap.empty) {
      list.innerHTML = '<div style="text-align:center;color:var(--muted);padding:20px">No orders yet</div>';
      return;
    }
    let arr = [];
    snap.forEach(d => arr.push(Object.assign({ id: d.id }, d.data())));
    arr.sort((a, b) => {
      const da = a.date?.toDate ? a.date.toDate() : new Date(a.date || 0);
      const db2 = b.date?.toDate ? b.date.toDate() : new Date(b.date || 0);
      return db2 - da;
    });
    list.innerHTML = arr.map(o => {
      const st = (o.status || 'pending').toLowerCase();
      const cls = st === 'success' || st === 'complete' ? 'success' : (st === 'cancelled' || st === 'rejected') ? 'cancelled' : 'pending';
      // Render account fields (multi-field support)
      let accHtml = '';
      if (o.accountData && typeof o.accountData === 'object') {
        accHtml = Object.entries(o.accountData).map(([k, v]) => `<div class="order-row"><span>${k}</span><b>${v}</b></div>`).join('');
      } else {
        accHtml = `<div class="order-row"><span>${o.inputLabel || 'Guild ID'}</span><b>${o.accountId || '-'}</b></div>`;
      }
      return `<div class="order-card ${cls}">
        <div class="order-head">
          <b>${o.gameName || 'Game'}</b>
          <span class="order-status ${cls}">${st.toUpperCase()}</span>
        </div>
        <div class="order-row"><span>Package</span><b>${o.productName || '-'}</b></div>
        ${accHtml}
        <div class="order-row"><span>Price</span><b>৳${o.price || 0}</b></div>
      </div>`;
    }).join('');
  } catch (e) {
    list.innerHTML = `<div style="text-align:center;color:var(--muted);padding:20px">${e.message}</div>`;
  }
}

async function loadCodes() {
  const list = $('codesList');
  if (!list || !currentUser) return;
  list.innerHTML = '<div style="text-align:center;padding:20px"><i class="fas fa-spinner fa-spin"></i></div>';
  try {
    const snap = await db.collection('codes').where('usedBy', '==', currentUser.uid).get();
    if (snap.empty) {
      list.innerHTML = '<div style="text-align:center;color:var(--muted);padding:20px">No codes used</div>';
      return;
    }
    let html = '';
    snap.forEach(d => {
      const c = d.data();
      html += `<div class="order-card success">
        <div class="order-head"><b>${c.code}</b><span class="order-status success">USED</span></div>
        <div class="order-row"><span>Amount</span><b>৳${c.amount}</b></div>
      </div>`;
    });
    list.innerHTML = html;
  } catch (e) {
    list.innerHTML = `<div style="text-align:center;color:var(--muted);padding:20px">${e.message}</div>`;
  }
}

/* ═══════════════ UI HELPERS ═══════════════ */
function applySocialLinks() {
  const map = {
    'telegram-channel': siteConfig.telegram,
    'telegram-group': siteConfig.groupLink,
    'youtube-channel': siteConfig.youtube
  };
  Object.keys(map).forEach(k => {
    document.querySelectorAll(`[data-link="${k}"]`).forEach(a => {
      if (map[k]) { a.href = map[k]; a.target = '_blank'; a.rel = 'noopener'; }
      else { a.onclick = e => e.preventDefault(); }
    });
  });
}

function applyBrandingImages() {
  // Wallet / Instant pay images (admin controlled, fallback to default)
  const walletImg = siteConfig.walletImage || siteConfig.walletLogo;
  const instantImg = siteConfig.instantImage || siteConfig.instantLogo;

  const wBox = $('walletLogoBox');
  if (wBox) {
    if (walletImg && walletImg.trim()) {
      wBox.innerHTML = `<img src="${walletImg}" alt="Wallet" onerror="this.src='https://cdn-icons-png.flaticon.com/512/6963/6963703.png'">`;
    } else {
      wBox.innerHTML = `<img src="https://cdn-icons-png.flaticon.com/512/6963/6963703.png" alt="Wallet">`;
    }
  }

  const iBox = $('instantLogoBox');
  if (iBox) {
    if (instantImg && instantImg.trim()) {
      iBox.innerHTML = `<img src="${instantImg}" alt="Instant" onerror="this.src='https://cdn-icons-png.flaticon.com/512/2933/2933245.png'">`;
    } else {
      iBox.innerHTML = `<img src="https://cdn-icons-png.flaticon.com/512/2933/2933245.png" alt="Instant">`;
    }
  }
}

function openSidePanel() { $('sidePanel').classList.add('show'); }
function closeSidePanel(e) {
  if (!e || e.target.id === 'sidePanel') $('sidePanel').classList.remove('show');
}
function openEditProfile() {
  $('editPic').value = userData.profilePic || '';
  $('editName').value = userData.name || '';
  $('editPhone').value = userData.phone || '';
  $('editProfileModal').classList.remove('hidden');
}
function closeEditProfile() { $('editProfileModal').classList.add('hidden'); }
async function saveProfile() {
  const name = $('editName').value.trim();
  const pic = $('editPic').value.trim();
  const phone = $('editPhone').value.trim();
  if (!name) return toast('Name required');
  if (phone && !/^01\d{9}$/.test(phone)) return toast('Enter valid 11-digit phone');
  try {
    await db.collection('users').doc(currentUser.uid).update({
      name, phone, profilePic: pic
    });
    toast('Profile saved ✓');
    closeEditProfile();
  } catch (e) { toast(e.message); }
}

/* ═══════════════ INIT ═══════════════ */
document.addEventListener('DOMContentLoaded', () => {
  startPublicListeners();
  // Close popup on backdrop click
  $('adminPopup')?.addEventListener('click', (e) => {
    if (e.target.id === 'adminPopup') closeAdminPopup();
  });
});