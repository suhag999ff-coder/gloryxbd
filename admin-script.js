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
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ═══════════════ STATE ═══════════════ */
let allUsers = [], allOrders = [], allDeposits = [], allGames = [], allBanners = [], allPromos = [], allBroadcasts = [];
let currentOrderFilter = 'pending', currentDepFilter = 'pending';
let currentPayTab = 'bkash';
let generalConfig = {}, paymentConfig = {}, playerApiConfig = {}, popupConfig = {};
let confirmCallback = null;
let listenersStarted = false;
let editingDescBoxes = [];
let editingFields = [];

function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('show'), 2500);
}
function fmtDate(dv) {
  if (!dv) return 'N/A';
  const d = dv.toDate ? dv.toDate() : new Date(dv);
  return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
}
function shortId(id, pre = 'ORD') {
  if (!id) return '#' + pre + '-0000';
  const clean = String(id).replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  return '#' + pre + '-' + clean.slice(-4).padStart(4, '0');
}
function normalizeStatus(s) {
  s = (s || 'pending').toLowerCase();
  if (['success', 'complete', 'completed'].includes(s)) return 'success';
  if (['cancel', 'canceled', 'cancelled'].includes(s)) return 'cancelled';
  if (['refund', 'refunded'].includes(s)) return 'refunded';
  if (['reject', 'rejected'].includes(s)) return 'rejected';
  return 'pending';
}
function togglePass(id, btn) {
  const inp = $(id), i = btn.querySelector('i');
  if (inp.type === 'password') { inp.type = 'text'; i.classList.replace('fa-eye', 'fa-eye-slash'); }
  else { inp.type = 'password'; i.classList.replace('fa-eye-slash', 'fa-eye'); }
}

/* ═══════════════ AUTH ═══════════════ */
function adminLogin() {
  const e = $('adminEmail').value.trim(), p = $('adminPass').value;
  if (!e || !p) return Swal.fire('Error', 'Fill all fields', 'warning');
  Swal.showLoading();
  auth.signInWithEmailAndPassword(e, p)
    .then(() => Swal.close())
    .catch(err => Swal.fire('Login Failed', err.message, 'error'));
}
function adminLogout() {
  Swal.fire({
    title: 'Log Out?', icon: 'question', showCancelButton: true,
    confirmButtonText: 'Yes', confirmButtonColor: '#4F46E5'
  }).then(r => { if (r.isConfirmed) auth.signOut().then(() => location.reload()); });
}

auth.onAuthStateChanged(user => {
  if (user) {
    $('loginSection').classList.add('hidden');
    $('adminApp').classList.remove('hidden');
    if (!listenersStarted) { startListeners(); listenersStarted = true; }
  } else {
    $('loginSection').classList.remove('hidden');
    $('adminApp').classList.add('hidden');
  }
});

/* ═══════════════ NAVIGATION ═══════════════ */
function navTo(tab) {
  document.querySelectorAll('.tab-section').forEach(s => s.classList.add('hidden'));
  const target = $('tab-' + tab);
  if (target) target.classList.remove('hidden');
  document.querySelectorAll('.nav-btn').forEach(n => n.classList.remove('on'));
  const btn = document.querySelector(`.nav-btn[data-tab="${tab}"]`);
  if (btn) btn.classList.add('on');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ═══════════════ LISTENERS ═══════════════ */
function startListeners() {
  // USERS
  db.collection('users').onSnapshot(snap => {
    allUsers = [];
    snap.forEach(d => allUsers.push(Object.assign({ id: d.id }, d.data())));
    allUsers.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    setText('kpiUsers', allUsers.length);
    renderUsers();
    renderPushUserSelect();
  });

  // ORDERS
  db.collection('orders').onSnapshot(snap => {
    allOrders = [];
    snap.forEach(d => allOrders.push(Object.assign({ id: d.id }, d.data())));
    const pendingCount = allOrders.filter(o => normalizeStatus(o.status) === 'pending').length;
    setText('kpiOrders', allOrders.length);
    const badge = $('ordBadge');
    if (pendingCount > 0) { badge.textContent = pendingCount; badge.classList.remove('hidden'); }
    else badge.classList.add('hidden');
    renderOrders();
    renderDashboardExtras();
    renderRecentOrders();
  });

  // DEPOSITS
  db.collection('deposits').onSnapshot(snap => {
    allDeposits = [];
    snap.forEach(d => allDeposits.push(Object.assign({ id: d.id }, d.data())));
    const pending = allDeposits.filter(d => d.status === 'pending').length;
    setText('kpiDeposits', pending);
    const badge = $('depBadge');
    if (pending > 0) { badge.textContent = pending; badge.classList.remove('hidden'); }
    else badge.classList.add('hidden');
    renderDeposits();
    renderDashboardExtras();
  });

  // SERVICES (Games)
  db.collection('services').onSnapshot(snap => {
    allGames = [];
    snap.forEach(d => allGames.push(Object.assign({ id: d.id }, d.data())));
    renderGames();
  });

  // BANNERS
  db.collection('banners').onSnapshot(snap => {
    allBanners = [];
    snap.forEach(d => allBanners.push(Object.assign({ id: d.id }, d.data())));
    renderBanners();
  });

  // PROMOTIONS
  db.collection('promotions').onSnapshot(snap => {
    allPromos = [];
    snap.forEach(d => allPromos.push(Object.assign({ id: d.id }, d.data())));
    renderPromos();
  });

  // BROADCASTS
  db.collection('broadcasts').orderBy('sentAt', 'desc').limit(20).onSnapshot(snap => {
    allBroadcasts = [];
    snap.forEach(d => allBroadcasts.push(Object.assign({ id: d.id }, d.data())));
    renderBroadcasts();
  });

  // GENERAL settings
  db.collection('settings').doc('general').onSnapshot(doc => {
    generalConfig = doc.exists ? doc.data() : {};
    $('set-site-name').value = generalConfig.siteName || '';
    $('set-wallet-image').value = generalConfig.walletImage || generalConfig.walletLogo || '';
    $('set-instant-image').value = generalConfig.instantImage || generalConfig.instantLogo || '';
    $('set-telegram').value = generalConfig.telegram || '';
    $('set-group').value = generalConfig.groupLink || '';
    $('set-youtube').value = generalConfig.youtube || '';
    editingDescBoxes = Array.isArray(generalConfig.descBoxes) ? JSON.parse(JSON.stringify(generalConfig.descBoxes)) : [];
    renderDescBoxesBuilder();
  });

  // POPUP settings
  db.collection('settings').doc('popup').onSnapshot(doc => {
    popupConfig = doc.exists ? doc.data() : {};
    $('popupEnabled').checked = !!popupConfig.enabled;
    $('popupTitle').value = popupConfig.title || '';
    $('popupImage').value = popupConfig.image || '';
    $('popupBody').value = popupConfig.body || '';
    $('popupButtonText').value = popupConfig.buttonText || '';
    $('popupButtonLink').value = popupConfig.buttonLink || '';
  });

  // PAYMENT
  db.collection('admin').doc('payment').onSnapshot(doc => {
    paymentConfig = doc.exists ? doc.data() : {};
    ['bkash', 'nagad', 'rocket'].forEach(k => {
      const numEl = $('set-' + k);
      const logoEl = $('set-logo-' + k);
      const qrEl = $('set-' + k + '-qr');
      const instEl = $('set-' + k + '-inst');
      if (numEl) numEl.value = paymentConfig[k] || '';
      if (logoEl) logoEl.value = paymentConfig['logo' + k.charAt(0).toUpperCase() + k.slice(1)] || '';
      if (qrEl) qrEl.value = paymentConfig[k + 'Qr'] || '';
      if (instEl) instEl.value = paymentConfig['instruction' + k.charAt(0).toUpperCase() + k.slice(1)] || '';
    });
  });

  // PLAYER API
  db.collection('settings').doc('playerApi').onSnapshot(doc => {
    playerApiConfig = doc.exists ? doc.data() : {};
    $('set-api-url').value = playerApiConfig.url || '';
    $('set-api-path').value = playerApiConfig.namePath || 'player.name';
    $('set-api-method').value = playerApiConfig.method || 'GET';
  });
}

/* ═══════════════ DASHBOARD EXTRAS ═══════════════ */
function renderDashboardExtras() {
  // Revenue (success orders)
  let rev = 0, todayRev = 0, todayOrders = 0, pendingAll = 0;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  allOrders.forEach(o => {
    const st = normalizeStatus(o.status);
    if (st === 'success') rev += parseInt(o.price || 0);
    if (st === 'pending') pendingAll++;
    if (o.date) {
      const d = o.date.toDate ? o.date.toDate() : new Date(o.date);
      if (d >= today) {
        todayOrders++;
        if (st === 'success') todayRev += parseInt(o.price || 0);
      }
    }
  });
  const pendingDep = allDeposits.filter(d => d.status === 'pending').length;
  pendingAll += pendingDep;

  setText('kpiRevenue', rev.toLocaleString() + '৳');
  setText('kpiTodayRev', '৳ ' + todayRev.toLocaleString());
  setText('kpiTodayOrders', todayOrders);
  setText('kpiPendingAll', pendingAll);
}

function renderRecentOrders() {
  const box = $('recentOrders');
  if (!box) return;
  const recent = allOrders.slice().sort((a, b) => {
    const da = a.date?.toDate ? a.date.toDate() : new Date(a.date || 0);
    const db2 = b.date?.toDate ? b.date.toDate() : new Date(b.date || 0);
    return db2 - da;
  }).slice(0, 6);

  if (recent.length === 0) {
    box.innerHTML = '<div style="text-align:center;padding:30px;color:var(--muted);font-size:13px">No recent orders</div>';
    return;
  }
  box.innerHTML = recent.map(o => {
    const st = normalizeStatus(o.status);
    const cls = st === 'success' ? 'success' : (st === 'cancelled' || st === 'refunded' || st === 'rejected') ? 'cancelled' : '';
    const badgeCls = st === 'success' ? 'success' : (st === 'cancelled' || st === 'rejected') ? 'danger' : (st === 'refunded' ? 'info' : 'pending');
    return `<div class="data-card ${cls}" style="padding:14px">
      <div class="dc-header" style="margin-bottom:8px;padding-bottom:8px">
        <div>
          <div class="dc-title" style="font-size:13px">${esc(o.gameName || '-')}</div>
          <div class="dc-sub">${esc(o.productName || '')} · ৳${o.price || 0}</div>
        </div>
        <span class="badge ${badgeCls}">${st}</span>
      </div>
      <div class="dc-row"><span>User</span><span>${esc(o.userEmail || '-')}</span></div>
      <div class="dc-row"><span>Date</span><span>${fmtDate(o.date)}</span></div>
    </div>`;
  }).join('');
}

/* ═══════════════ ORDERS ═══════════════ */
function filterOrders(f) {
  currentOrderFilter = f;
  document.querySelectorAll('#tab-orders .ft').forEach(b => b.classList.toggle('on', b.dataset.f === f));
  renderOrders();
}
function renderOrders() {
  const list = $('ordersList');
  if (!list) return;
  const q = ($('ordersSearch')?.value || '').toLowerCase();
  let arr = allOrders.slice();
  if (currentOrderFilter !== 'all') arr = arr.filter(o => normalizeStatus(o.status) === currentOrderFilter);
  if (q) arr = arr.filter(o =>
    (o.userEmail || '').toLowerCase().includes(q) ||
    (o.gameName || '').toLowerCase().includes(q) ||
    (o.accountId || '').toLowerCase().includes(q) ||
    (o.trxId || '').toLowerCase().includes(q)
  );
  arr.sort((a, b) => {
    const da = a.date?.toDate ? a.date.toDate() : new Date(a.date || 0);
    const db2 = b.date?.toDate ? b.date.toDate() : new Date(b.date || 0);
    return db2 - da;
  });

  if (arr.length === 0) {
    list.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--muted);font-size:13px">No ${currentOrderFilter} orders</div>`;
    return;
  }

  list.innerHTML = arr.map(o => {
    const st = normalizeStatus(o.status);
    const cls = st === 'success' ? 'success' : (st === 'cancelled' || st === 'refunded' || st === 'rejected') ? 'cancelled' : '';
    const badgeCls = st === 'success' ? 'success' : (st === 'cancelled' || st === 'rejected') ? 'danger' : (st === 'refunded' ? 'info' : 'pending');

    // Account fields display (multi-field support)
    let accHtml = '';
    if (o.accountData && typeof o.accountData === 'object') {
      accHtml = Object.entries(o.accountData).map(([k, v]) =>
        `<div class="dc-row"><span>${esc(k)}</span><span>${esc(v)}</span></div>`
      ).join('');
    } else {
      accHtml = `<div class="dc-row"><span>${esc(o.inputLabel || 'Guild ID')}</span><span>${esc(o.accountId || '-')}</span></div>`;
    }

    const actions = st === 'pending'
      ? `<button class="btn-success" onclick="updateOrderStatus('${o.id}','success')"><i class="fas fa-check"></i> Approve</button>
         <button class="btn-danger" onclick="updateOrderStatus('${o.id}','cancelled')"><i class="fas fa-times"></i> Cancel</button>`
      : `<button class="btn-danger" onclick="deleteOrder('${o.id}')"><i class="fas fa-trash"></i> Delete</button>`;

    return `<div class="data-card ${cls}">
      <div class="dc-header">
        <div>
          <div class="dc-title">${esc(o.gameName || 'Game')}</div>
          <div class="dc-sub">${esc(o.productName || '-')} · ৳${o.price || 0}</div>
        </div>
        <span class="badge ${badgeCls}">${st}</span>
      </div>
      <div class="dc-row"><span>Order ID</span><span>${shortId(o.id, 'ORD')}</span></div>
      <div class="dc-row"><span>User</span><span>${esc(o.userEmail || '-')}</span></div>
      ${accHtml}
      <div class="dc-row"><span>Payment</span><span>${(o.paymentType || 'wallet').toUpperCase()}${o.trxId ? ' · ' + esc(o.trxId) : ''}</span></div>
      <div class="dc-row"><span>Date</span><span>${fmtDate(o.date)}</span></div>
      <div class="dc-actions">${actions}</div>
    </div>`;
  }).join('');
}

function updateOrderStatus(id, status) {
  showConfirm('Update Order?', `Mark this order as ${status}?`, async () => {
    try {
      await db.collection('orders').doc(id).update({ status, updatedAt: new Date() });
      toast('Order ' + status + ' ✓');
    } catch (e) { toast('Error: ' + e.message); }
  });
}
function deleteOrder(id) {
  showConfirm('Delete Order?', 'This cannot be undone.', async () => {
    try {
      await db.collection('orders').doc(id).delete();
      toast('Order deleted');
    } catch (e) { toast('Error: ' + e.message); }
  });
}

/* ═══════════════ DEPOSITS ═══════════════ */
function filterDeposits(f) {
  currentDepFilter = f;
  document.querySelectorAll('#tab-deposits .ft').forEach(b => b.classList.toggle('on', b.dataset.f === f));
  renderDeposits();
}
function renderDeposits() {
  const list = $('depositsList');
  if (!list) return;
  let arr = allDeposits.slice();
  if (currentDepFilter !== 'all') arr = arr.filter(d => d.status === currentDepFilter);
  arr.sort((a, b) => {
    const da = a.date?.toDate ? a.date.toDate() : new Date(a.date || 0);
    const db2 = b.date?.toDate ? b.date.toDate() : new Date(b.date || 0);
    return db2 - da;
  });

  if (arr.length === 0) {
    list.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--muted);font-size:13px">No ${currentDepFilter} deposits</div>`;
    return;
  }

  list.innerHTML = arr.map(d => {
    const st = d.status || 'pending';
    const cls = st === 'approved' ? 'success' : st === 'rejected' ? 'cancelled' : '';
    const badgeCls = st === 'approved' ? 'success' : st === 'rejected' ? 'danger' : 'pending';
    const actions = st === 'pending'
      ? `<button class="btn-success" onclick="approveDeposit('${d.id}','${d.userId}',${d.amount})"><i class="fas fa-check"></i> Approve</button>
         <button class="btn-danger" onclick="rejectDeposit('${d.id}')"><i class="fas fa-times"></i> Reject</button>`
      : `<button class="btn-danger" onclick="deleteDeposit('${d.id}')"><i class="fas fa-trash"></i> Delete</button>`;

    return `<div class="data-card ${cls}">
      <div class="dc-header">
        <div>
          <div class="dc-title">৳ ${d.amount || 0}</div>
          <div class="dc-sub">${(d.method || 'bkash').toUpperCase()}</div>
        </div>
        <span class="badge ${badgeCls}">${st}</span>
      </div>
      <div class="dc-row"><span>User</span><span>${esc(d.userEmail || d.userId)}</span></div>
      <div class="dc-row"><span>TrxID</span><span>${esc(d.trxId || '-')}</span></div>
      <div class="dc-row"><span>Sender</span><span>${esc(d.senderNumber || '-')}</span></div>
      <div class="dc-row"><span>Date</span><span>${fmtDate(d.date)}</span></div>
      <div class="dc-actions">${actions}</div>
    </div>`;
  }).join('');
}

async function approveDeposit(id, uid, amount) {
  const ok = await Swal.fire({
    title: 'Approve Deposit?',
    html: `Add <b>৳${amount}</b> to user wallet?`,
    icon: 'question', showCancelButton: true,
    confirmButtonText: 'Yes, Approve', confirmButtonColor: '#10B981'
  });
  if (!ok.isConfirmed) return;
  Swal.showLoading();
  try {
    const userRef = db.collection('users').doc(uid);
    await db.runTransaction(async t => {
      const ud = await t.get(userRef);
      const current = ud.exists ? (ud.data().balance || 0) : 0;
      if (ud.exists) t.update(userRef, { balance: current + parseInt(amount) });
      else t.set(userRef, { balance: parseInt(amount) });
      t.update(db.collection('deposits').doc(id), { status: 'approved', approvedAt: new Date() });
    });
    Swal.fire('Approved ✓', `৳${amount} added`, 'success');
  } catch (e) { Swal.fire('Error', e.message, 'error'); }
}
function rejectDeposit(id) {
  showConfirm('Reject Deposit?', 'User will not receive money.', async () => {
    try {
      await db.collection('deposits').doc(id).update({ status: 'rejected', rejectedAt: new Date() });
      toast('Deposit rejected');
    } catch (e) { toast('Error: ' + e.message); }
  });
}
function deleteDeposit(id) {
  showConfirm('Delete Deposit?', 'Cannot be undone.', async () => {
    try { await db.collection('deposits').doc(id).delete(); toast('Deleted'); }
    catch (e) { toast('Error: ' + e.message); }
  });
}

/* ═══════════════ USERS ═══════════════ */
function renderUsers() {
  const list = $('usersList');
  if (!list) return;
  const q = ($('usersSearch')?.value || '').toLowerCase();
  let arr = allUsers.filter(u =>
    !q || (u.name || '').toLowerCase().includes(q) ||
    (u.email || '').toLowerCase().includes(q) ||
    (u.phone || '').toLowerCase().includes(q)
  );

  if (arr.length === 0) {
    list.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--muted)">No users found</div>';
    return;
  }

  list.innerHTML = arr.map(u => {
    const initial = (u.name || 'U').charAt(0).toUpperCase();
    const pic = u.profilePic && u.profilePic.trim()
      ? `<img src="${esc(u.profilePic)}" onerror="this.parentNode.textContent='${initial}'">`
      : initial;
    return `<div class="data-card">
      <div class="dc-header">
        <div style="display:flex;gap:12px;align-items:center;flex:1;min-width:0">
          <div class="uh-avatar" style="width:44px;height:44px;font-size:16px">${pic}</div>
          <div style="min-width:0">
            <div class="dc-title" style="font-size:13px">${esc(u.name || 'User')}</div>
            <div class="dc-sub" style="font-size:10.5px;word-break:break-all">${esc(u.email || '-')}</div>
          </div>
        </div>
        <span class="badge success">৳${u.balance || 0}</span>
      </div>
      <div class="dc-row"><span>Orders</span><span>${u.totalOrders || 0}</span></div>
      <div class="dc-row"><span>Total Spent</span><span>৳${u.totalSpend || 0}</span></div>
      <div class="dc-row"><span>Phone</span><span>${esc(u.phone || '-')}</span></div>
      <div class="dc-actions">
        <button class="btn-edit" onclick="openUserModal('${u.id}')"><i class="fas fa-edit"></i> Manage</button>
      </div>
    </div>`;
  }).join('');
}

function openUserModal(uid) {
  const u = allUsers.find(x => x.id === uid);
  if (!u) return;
  $('userIdInput').value = uid;
  $('uName').value = u.name || '';
  $('uPhone').value = u.phone || '';
  $('uBalance').value = u.balance || 0;
  $('uVerified').checked = !!u.isVerified;
  $('uPremium').checked = !!u.isPremium;

  const initial = (u.name || 'U').charAt(0).toUpperCase();
  $('uhAvatar').innerHTML = u.profilePic
    ? `<img src="${esc(u.profilePic)}" onerror="this.parentNode.textContent='${initial}'">`
    : initial;
  setText('uhName', u.name || 'User');
  setText('uhEmail', u.email || '-');
  setText('uhPhone', u.phone || '');

  $('userModal').classList.remove('hidden');
}

async function saveUser() {
  const uid = $('userIdInput').value;
  if (!uid) return;
  try {
    await db.collection('users').doc(uid).update({
      name: $('uName').value.trim(),
      phone: $('uPhone').value.trim(),
      balance: parseInt($('uBalance').value) || 0,
      isVerified: $('uVerified').checked,
      isPremium: $('uPremium').checked
    });
    toast('User saved ✓');
    closeModal('userModal');
  } catch (e) { toast('Error: ' + e.message); }
}

/* ═══════════════ GAMES ═══════════════ */
function renderGames() {
  const list = $('gamesList');
  if (!list) return;
  if (allGames.length === 0) {
    list.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--muted)">No games yet. Click "Add Game" to start.</div>';
    return;
  }
  list.innerHTML = allGames.map(g => {
    const fieldCount = Array.isArray(g.inputFields) ? g.inputFields.length : 1;
    return `<div class="data-card">
      <div class="dc-header">
        <div style="display:flex;gap:12px;align-items:center;flex:1;min-width:0">
          <div class="uh-avatar" style="width:48px;height:48px;font-size:14px">
            <img src="${esc(g.image || '')}" onerror="this.parentNode.textContent='?'">
          </div>
          <div style="min-width:0">
            <div class="dc-title" style="font-size:13px">${esc(g.name || 'Game')}</div>
            <div class="dc-sub">${esc(g.category || 'Uncategorized')}</div>
          </div>
        </div>
      </div>
      <div class="dc-row"><span>Input Fields</span><span>${fieldCount} field${fieldCount > 1 ? 's' : ''}</span></div>
      <div class="dc-actions">
        <button class="btn-edit" onclick="openGameEditor('${g.id}')"><i class="fas fa-edit"></i> Edit</button>
        <button class="btn-info" onclick="openPackages('${g.id}')"><i class="fas fa-box"></i> Packages</button>
        <button class="btn-danger" onclick="deleteGame('${g.id}')"><i class="fas fa-trash"></i></button>
      </div>
    </div>`;
  }).join('');
}

function openGameEditor(gid) {
  if (gid) {
    const g = allGames.find(x => x.id === gid);
    if (!g) return;
    setText('gameEditorTitle', 'Edit Game');
    $('gameEditId').value = gid;
    $('gameName').value = g.name || '';
    $('gameImage').value = g.image || '';
    $('gameCategory').value = g.category || '';
    $('gameRules').value = g.rules || '';

    // Load fields
    if (Array.isArray(g.inputFields) && g.inputFields.length > 0) {
      editingFields = g.inputFields.map(f => ({
        label: f.label || '',
        type: f.type || 'text',
        placeholder: f.placeholder || '',
        required: f.required !== false,
        options: f.options || []
      }));
    } else {
      // Migrate old single-field
      editingFields = [{
        label: g.inputLabel || 'Enter Your Guild ID',
        type: g.inputType || 'text',
        placeholder: g.inputPlaceholder || '',
        required: true,
        options: []
      }];
    }
  } else {
    setText('gameEditorTitle', 'Add New Game');
    $('gameEditId').value = '';
    $('gameName').value = '';
    $('gameImage').value = '';
    $('gameCategory').value = '';
    $('gameRules').value = '';
    editingFields = [{
      label: 'Enter Your Guild ID',
      type: 'text',
      placeholder: 'Enter Guild ID',
      required: true,
      options: []
    }];
  }
  renderFieldsBuilder();
  $('gameEditorModal').classList.remove('hidden');
}

function renderFieldsBuilder() {
  const box = $('inputFieldsBuilder');
  if (!box) return;
  if (editingFields.length === 0) {
    box.innerHTML = '<div style="text-align:center;padding:14px;color:var(--muted);font-size:12px">No fields yet. Add one below.</div>';
    return;
  }
  box.innerHTML = editingFields.map((f, i) => `
    <div class="field-row">
      <input type="text" class="field-input" placeholder="Label (e.g. Guild ID)" value="${esc(f.label)}" oninput="editingFields[${i}].label=this.value">
      <select class="field-input field-type" onchange="editingFields[${i}].type=this.value;renderFieldsBuilder()">
        <option value="text" ${f.type === 'text' ? 'selected' : ''}>Text</option>
        <option value="number" ${f.type === 'number' ? 'selected' : ''}>Number</option>
        <option value="email" ${f.type === 'email' ? 'selected' : ''}>Email</option>
        <option value="select" ${f.type === 'select' ? 'selected' : ''}>Select</option>
      </select>
      <input type="text" class="field-input" placeholder="Placeholder" value="${esc(f.placeholder)}" oninput="editingFields[${i}].placeholder=this.value">
      <button class="field-row-del" onclick="removeInputField(${i})"><i class="fas fa-trash"></i></button>
      <label class="field-required" style="grid-column:1/2">
        <input type="checkbox" ${f.required ? 'checked' : ''} onchange="editingFields[${i}].required=this.checked"> Required
      </label>
      ${f.type === 'select' ? `<div class="field-options-row"><input type="text" class="field-input" placeholder="Options separated by comma (e.g. BD, IN, PK)" value="${esc((f.options || []).join(', '))}" oninput="editingFields[${i}].options=this.value.split(',').map(s=>s.trim()).filter(Boolean)"></div>` : ''}
    </div>
  `).join('');
}

function addInputField() {
  editingFields.push({ label: '', type: 'text', placeholder: '', required: true, options: [] });
  renderFieldsBuilder();
}
function removeInputField(i) {
  editingFields.splice(i, 1);
  renderFieldsBuilder();
}

async function saveGame() {
  const name = $('gameName').value.trim();
  const image = $('gameImage').value.trim();
  if (!name) return toast('Game name required');
  if (!image) return toast('Image URL required');
  if (editingFields.length === 0) return toast('Add at least one input field');
  const invalidField = editingFields.find(f => !f.label.trim());
  if (invalidField) return toast('All fields need a label');

  const payload = {
    name,
    image,
    category: $('gameCategory').value.trim() || 'Other',
    inputFields: editingFields.map(f => ({
      label: f.label.trim(),
      type: f.type || 'text',
      placeholder: (f.placeholder || '').trim(),
      required: f.required !== false,
      options: Array.isArray(f.options) ? f.options : []
    })),
    rules: $('gameRules').value,
    updatedAt: new Date()
  };

  try {
    const gid = $('gameEditId').value;
    if (gid) {
      await db.collection('services').doc(gid).update(payload);
      toast('Game updated ✓');
    } else {
      payload.createdAt = new Date();
      await db.collection('services').add(payload);
      toast('Game created ✓');
    }
    closeModal('gameEditorModal');
  } catch (e) { toast('Error: ' + e.message); }
}

function deleteGame(id) {
  showConfirm('Delete Game?', 'Packages will also be removed.', async () => {
    try {
      // Delete subcollection first
      const pkgs = await db.collection('services').doc(id).collection('products').get();
      const batch = db.batch();
      pkgs.forEach(d => batch.delete(d.ref));
      batch.delete(db.collection('services').doc(id));
      await batch.commit();
      toast('Game deleted');
    } catch (e) { toast('Error: ' + e.message); }
  });
}

/* ═══════════════ PACKAGES ═══════════════ */
async function openPackages(gid) {
  const g = allGames.find(x => x.id === gid);
  if (!g) return;
  $('pkgGameId').value = gid;
  setText('pkgGameName', g.name || 'Game');
  $('packagesModal').classList.remove('hidden');
  loadPackages(gid);
}

async function loadPackages(gid) {
  const list = $('packagesList');
  list.innerHTML = '<div style="text-align:center;padding:20px;color:var(--muted)">Loading...</div>';
  try {
    const snap = await db.collection('services').doc(gid).collection('products').orderBy('price', 'asc').get();
    if (snap.empty) {
      list.innerHTML = '<div style="text-align:center;padding:20px;color:var(--muted)">No packages yet</div>';
      return;
    }
    list.innerHTML = snap.docs.map(d => {
      const p = d.data();
      const inStock = p.stock !== false && p.stock !== 'out';
      return `<div class="pkg-row">
        <div class="pkg-row-info">
          <b>${esc(p.name || '-')}</b>
          <small>৳ ${p.price || 0}</small>
        </div>
        <span class="pkg-stock-toggle ${inStock ? 'in' : 'out'}" onclick="togglePkgStock('${gid}','${d.id}',${inStock})">
          <i class="fas fa-${inStock ? 'check-circle' : 'times-circle'}"></i> ${inStock ? 'IN' : 'OUT'}
        </span>
        <div class="pkg-row-actions">
          <button class="btn-danger" onclick="deletePackage('${gid}','${d.id}')"><i class="fas fa-trash"></i></button>
        </div>
      </div>`;
    }).join('');
  } catch (e) {
    list.innerHTML = `<div style="text-align:center;padding:20px;color:var(--danger)">${e.message}</div>`;
  }
}

async function addPackage() {
  const gid = $('pkgGameId').value;
  const name = $('pkgName').value.trim();
  const price = parseInt($('pkgPrice').value);
  if (!name) return toast('Package name required');
  if (!price || price <= 0) return toast('Valid price required');
  try {
    await db.collection('services').doc(gid).collection('products').add({
      name, price, stock: true, createdAt: new Date()
    });
    $('pkgName').value = '';
    $('pkgPrice').value = '';
    toast('Package added ✓');
    loadPackages(gid);
  } catch (e) { toast('Error: ' + e.message); }
}

async function togglePkgStock(gid, pkgId, currentIn) {
  try {
    await db.collection('services').doc(gid).collection('products').doc(pkgId).update({ stock: !currentIn });
    loadPackages(gid);
  } catch (e) { toast('Error: ' + e.message); }
}

async function deletePackage(gid, pkgId) {
  showConfirm('Delete Package?', 'Cannot be undone.', async () => {
    try {
      await db.collection('services').doc(gid).collection('products').doc(pkgId).delete();
      loadPackages(gid);
      toast('Deleted');
    } catch (e) { toast('Error: ' + e.message); }
  });
}

/* ═══════════════ BANNERS ═══════════════ */
function renderBanners() {
  const list = $('bannersList');
  if (!list) return;
  if (allBanners.length === 0) {
    list.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:24px;color:var(--muted);font-size:12px">No banners yet</div>';
    return;
  }
  list.innerHTML = allBanners.map(b => `
    <div class="img-tile">
      <img src="${esc(b.image || '')}" onerror="this.src='https://placehold.co/400x225/161B26/4F46E5?text=Banner'">
      <button class="img-tile-del" onclick="deleteBanner('${b.id}')"><i class="fas fa-trash"></i></button>
    </div>
  `).join('');
}
function openBannerEditor() {
  $('bannerImage').value = '';
  $('bannerLink').value = '';
  $('bannerModal').classList.remove('hidden');
}
async function saveBanner() {
  const image = $('bannerImage').value.trim();
  if (!image) return toast('Image URL required');
  try {
    await db.collection('banners').add({
      image,
      link: $('bannerLink').value.trim(),
      createdAt: new Date()
    });
    closeModal('bannerModal');
    toast('Banner added ✓');
  } catch (e) { toast('Error: ' + e.message); }
}
function deleteBanner(id) {
  showConfirm('Delete Banner?', '', async () => {
    try { await db.collection('banners').doc(id).delete(); toast('Deleted'); }
    catch (e) { toast('Error: ' + e.message); }
  });
}

/* ═══════════════ PROMOTIONS ═══════════════ */
function renderPromos() {
  const list = $('promosList');
  if (!list) return;
  if (allPromos.length === 0) {
    list.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:24px;color:var(--muted);font-size:12px">No promotions yet</div>';
    return;
  }
  list.innerHTML = allPromos.map(p => `
    <div class="data-card">
      <div style="aspect-ratio:16/9;border-radius:8px;overflow:hidden;margin-bottom:10px;background:var(--bg2)">
        <img src="${esc(p.image || '')}" style="width:100%;height:100%;object-fit:cover" onerror="this.src='https://placehold.co/400x225/161B26/4F46E5?text=Promo'">
      </div>
      <div class="dc-title" style="font-size:13px">${esc(p.title || 'Promotion')}</div>
      ${p.link ? `<div class="dc-sub" style="font-size:10.5px;word-break:break-all">${esc(p.link)}</div>` : ''}
      <div class="dc-actions">
        <button class="btn-danger" onclick="deletePromo('${p.id}')"><i class="fas fa-trash"></i> Delete</button>
      </div>
    </div>
  `).join('');
}
function openPromoEditor() {
  $('promoImage').value = '';
  $('promoTitle').value = '';
  $('promoLink').value = '';
  $('promoModal').classList.remove('hidden');
}
async function savePromo() {
  const image = $('promoImage').value.trim();
  if (!image) return toast('Image URL required');
  try {
    await db.collection('promotions').add({
      image,
      title: $('promoTitle').value.trim(),
      link: $('promoLink').value.trim(),
      active: true,
      createdAt: new Date()
    });
    closeModal('promoModal');
    toast('Promotion added ✓');
  } catch (e) { toast('Error: ' + e.message); }
}
function deletePromo(id) {
  showConfirm('Delete Promotion?', '', async () => {
    try { await db.collection('promotions').doc(id).delete(); toast('Deleted'); }
    catch (e) { toast('Error: ' + e.message); }
  });
}

/* ═══════════════ DESC BOXES ═══════════════ */
function renderDescBoxesBuilder() {
  const box = $('descBoxesBuilder');
  if (!box) return;
  if (editingDescBoxes.length === 0) {
    box.innerHTML = '<div style="text-align:center;padding:20px;color:var(--muted);font-size:12px">No description boxes yet. Add one below.</div>';
    return;
  }
  box.innerHTML = editingDescBoxes.map((b, i) => `
    <div class="desc-item" style="border-left-color:${b.color || '#4F46E5'}">
      <div class="desc-item-head">
        <h4>Box #${i + 1}</h4>
        <button class="desc-item-del" onclick="removeDescBox(${i})"><i class="fas fa-trash"></i></button>
      </div>
      <div class="desc-item-grid">
        <div><label style="font-size:10px;font-weight:800;color:var(--muted);display:block;margin-bottom:4px">TITLE</label>
          <input type="text" class="field-input" placeholder="Why Choose Us?" value="${esc(b.title || '')}" oninput="editingDescBoxes[${i}].title=this.value">
        </div>
        <div><label style="font-size:10px;font-weight:800;color:var(--muted);display:block;margin-bottom:4px">COLOR</label>
          <div class="color-input-wrap">
            <input type="color" value="${b.color || '#4F46E5'}" oninput="editingDescBoxes[${i}].color=this.value;this.parentNode.querySelector('input[type=text]').value=this.value">
            <input type="text" class="field-input" value="${esc(b.color || '#4F46E5')}" oninput="editingDescBoxes[${i}].color=this.value;this.parentNode.querySelector('input[type=color]').value=this.value">
          </div>
        </div>
        <div><label style="font-size:10px;font-weight:800;color:var(--muted);display:block;margin-bottom:4px">ICON</label>
          <input type="text" class="field-input" placeholder="fa-info-circle" value="${esc(b.icon || 'fa-info-circle')}" oninput="editingDescBoxes[${i}].icon=this.value">
        </div>
        <div class="full"><label style="font-size:10px;font-weight:800;color:var(--muted);display:block;margin-bottom:4px">BODY</label>
          <textarea class="field-input" placeholder="Description text..." oninput="editingDescBoxes[${i}].body=this.value">${esc(b.body || '')}</textarea>
        </div>
      </div>
    </div>
  `).join('');
}
function addDescBox() {
  editingDescBoxes.push({ title: '', body: '', color: '#4F46E5', icon: 'fa-info-circle' });
  renderDescBoxesBuilder();
}
function removeDescBox(i) {
  editingDescBoxes.splice(i, 1);
  renderDescBoxesBuilder();
}
async function saveDescBoxes() {
  try {
    await db.collection('settings').doc('general').set({
      descBoxes: editingDescBoxes
    }, { merge: true });
    toast('Description boxes saved ✓');
  } catch (e) { toast('Error: ' + e.message); }
}

/* ═══════════════ POPUP ═══════════════ */
async function togglePopup() {
  try {
    await db.collection('settings').doc('popup').set({
      enabled: $('popupEnabled').checked
    }, { merge: true });
    toast($('popupEnabled').checked ? 'Popup enabled' : 'Popup disabled');
  } catch (e) { toast('Error: ' + e.message); }
}
async function savePopupSettings() {
  try {
    await db.collection('settings').doc('popup').set({
      enabled: $('popupEnabled').checked,
      title: $('popupTitle').value.trim(),
      image: $('popupImage').value.trim(),
      body: $('popupBody').value.trim(),
      buttonText: $('popupButtonText').value.trim() || 'Got it',
      buttonLink: $('popupButtonLink').value.trim(),
      updatedAt: new Date()
    }, { merge: true });
    toast('Popup settings saved ✓');
  } catch (e) { toast('Error: ' + e.message); }
}

/* ═══════════════ PUSH NOTIFICATION ═══════════════ */
function togglePushTarget() {
  const t = $('pushTarget').value;
  $('pushUserGroup').style.display = t === 'specific' ? 'block' : 'none';
}
function renderPushUserSelect() {
  const sel = $('pushUserSelect');
  if (!sel) return;
  const current = sel.value;
  sel.innerHTML = '<option value="">-- Select User --</option>' +
    allUsers.map(u => `<option value="${u.id}">${esc((u.name || u.email || u.id) + ' · ' + (u.email || ''))}</option>`).join('');
  if (current) sel.value = current;
}

async function sendPushNotification() {
  const target = $('pushTarget').value;
  const title = $('pushTitle').value.trim();
  const body = $('pushBody').value.trim();
  if (!title) return toast('Title required');
  if (!body) return toast('Body required');

  let recipients = [];
  if (target === 'all') recipients = allUsers;
  else {
    const uid = $('pushUserSelect').value;
    if (!uid) return toast('Select a user');
    const u = allUsers.find(x => x.id === uid);
    if (!u) return toast('User not found');
    recipients = [u];
  }

  if (recipients.length === 0) return toast('No recipients');

  const ok = await Swal.fire({
    title: 'Send Notification?',
    html: `Sending to <b>${recipients.length}</b> user${recipients.length > 1 ? 's' : ''}`,
    icon: 'question', showCancelButton: true,
    confirmButtonText: 'Send', confirmButtonColor: '#4F46E5'
  });
  if (!ok.isConfirmed) return;

  Swal.showLoading();
  try {
    // Save broadcast record
    const broadcastRef = await db.collection('broadcasts').add({
      title, body,
      target: target === 'all' ? 'all' : 'specific',
      targetUid: target === 'specific' ? $('pushUserSelect').value : null,
      recipientCount: recipients.length,
      sentAt: new Date(),
      sentBy: auth.currentUser.email
    });

    // Save to each user's inbox
    const batch = db.batch();
    recipients.forEach(u => {
      const ref = db.collection('users').doc(u.id).collection('notifications').doc();
      batch.set(ref, {
        title, body,
        broadcastId: broadcastRef.id,
        read: false,
        createdAt: new Date(),
        source: 'admin'
      });
    });
    await batch.commit();

    Swal.fire('Sent ✓', `Notification sent to ${recipients.length} user(s)`, 'success');
    $('pushTitle').value = '';
    $('pushBody').value = '';
  } catch (e) {
    Swal.fire('Error', e.message, 'error');
  }
}

function renderBroadcasts() {
  const list = $('broadcastsList');
  if (!list) return;
  if (allBroadcasts.length === 0) {
    list.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:24px;color:var(--muted);font-size:12px">No broadcasts yet</div>';
    return;
  }
  list.innerHTML = allBroadcasts.map(b => `
    <div class="data-card" style="border-left-color:var(--accent)">
      <div class="dc-header">
        <div>
          <div class="dc-title" style="font-size:13px">${esc(b.title || '-')}</div>
          <div class="dc-sub">${b.target === 'all' ? 'All Users' : 'Specific'} · ${b.recipientCount || 0} recipients</div>
        </div>
        <span class="badge info">SENT</span>
      </div>
      <div class="dc-row"><span>Body</span><span style="font-family:inherit;text-align:left">${esc(b.body || '')}</span></div>
      <div class="dc-row"><span>Sent</span><span>${fmtDate(b.sentAt)}</span></div>
    </div>
  `).join('');
}

/* ═══════════════ PAYMENT SETTINGS ═══════════════ */
function switchPayTab(method) {
  currentPayTab = method;
  document.querySelectorAll('.pt').forEach(t => t.classList.toggle('on', t.dataset.p === method));
  ['bkash', 'nagad', 'rocket'].forEach(k => {
    const panel = $('payPanel-' + k);
    if (panel) panel.classList.toggle('hidden', k !== method);
  });
}

async function savePayment() {
  try {
    const data = {};
    ['bkash', 'nagad', 'rocket'].forEach(k => {
      const cap = k.charAt(0).toUpperCase() + k.slice(1);
      data[k] = $('set-' + k)?.value.trim() || '';
      data['logo' + cap] = $('set-logo-' + k)?.value.trim() || '';
      data[k + 'Qr'] = $('set-' + k + '-qr')?.value.trim() || '';
      data['instruction' + cap] = $('set-' + k + '-inst')?.value.trim() || '';
    });
    await db.collection('admin').doc('payment').set(data, { merge: true });
    toast('Payment settings saved ✓');
  } catch (e) { toast('Error: ' + e.message); }
}

/* ═══════════════ BRANDING ═══════════════ */
async function saveBranding() {
  try {
    await db.collection('settings').doc('general').set({
      siteName: $('set-site-name').value.trim(),
      walletImage: $('set-wallet-image').value.trim(),
      instantImage: $('set-instant-image').value.trim()
    }, { merge: true });
    toast('Branding saved ✓');
  } catch (e) { toast('Error: ' + e.message); }
}

async function saveSocial() {
  try {
    await db.collection('settings').doc('general').set({
      telegram: $('set-telegram').value.trim(),
      groupLink: $('set-group').value.trim(),
      youtube: $('set-youtube').value.trim()
    }, { merge: true });
    toast('Social links saved ✓');
  } catch (e) { toast('Error: ' + e.message); }
}

/* ═══════════════ PLAYER API ═══════════════ */
async function savePlayerApi() {
  try {
    await db.collection('settings').doc('playerApi').set({
      url: $('set-api-url').value.trim(),
      namePath: $('set-api-path').value.trim() || 'player.name',
      method: $('set-api-method').value || 'GET'
    }, { merge: true });
    toast('API config saved ✓');
  } catch (e) { toast('Error: ' + e.message); }
}

async function testPlayerApi() {
  const box = $('apiTestResult');
  const uid = $('apiTestUid').value.trim();
  const url = $('set-api-url').value.trim();
  const path = $('set-api-path').value.trim() || 'player.name';
  if (!url) { box.className = 'api-result error'; box.classList.remove('hidden'); box.textContent = '❌ Enter API URL first'; return; }
  if (!uid) { box.className = 'api-result error'; box.classList.remove('hidden'); box.textContent = '❌ Enter test UID'; return; }

  box.className = 'api-result info';
  box.classList.remove('hidden');
  box.innerHTML = '⏳ Testing...';

  try {
    let finalUrl;
    if (url.includes('{uid}')) finalUrl = url.replace('{uid}', encodeURIComponent(uid));
    else {
      const u = new URL(url);
      if (!u.searchParams.get('uid')) u.searchParams.set('uid', uid);
      finalUrl = u.toString();
    }
    const res = await fetch(finalUrl);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    const name = path.split('.').reduce((c, p) => c && c[p] !== undefined ? c[p] : undefined, data);

    if (name) {
      box.className = 'api-result success';
      box.innerHTML = `✅ <b>Player Found:</b> ${esc(String(name))}<br><pre>${esc(JSON.stringify(data, null, 2).slice(0, 500))}</pre>`;
    } else {
      box.className = 'api-result error';
      box.innerHTML = `❌ Name not found at path: <code>${esc(path)}</code><pre>${esc(JSON.stringify(data, null, 2).slice(0, 500))}</pre>`;
    }
  } catch (e) {
    box.className = 'api-result error';
    box.textContent = '❌ ' + (e.message || 'Failed');
  }
}

/* ═══════════════ MODAL HELPERS ═══════════════ */
function closeModal(id) { $(id).classList.add('hidden'); }

function showConfirm(title, msg, cb) {
  setText('confirmTitle', title);
  setText('confirmMsg', msg || '');
  confirmCallback = cb;
  $('confirmModal').classList.remove('hidden');
  const yesBtn = $('confirmYes');
  yesBtn.onclick = () => {
    if (typeof confirmCallback === 'function') confirmCallback();
    closeModal('confirmModal');
  };
}