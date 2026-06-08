// ╔══════════════════════════════════════════════════════════════╗
// ║  CONFIGURATION                                               ║
// ║  → Replace both values with your Supabase project details.  ║
// ║  → Find them at: supabase.com > Your Project > Settings     ║
// ║    > API > Project URL & anon public key                     ║
// ╚══════════════════════════════════════════════════════════════╝
const SUPABASE_URL      = 'https://nuipxfspjvbfeiejihop.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im51aXB4ZnNwanZiZmVpZWppaG9wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA2OTAzMDcsImV4cCI6MjA5NjI2NjMwN30.vA12O_ZqDy_zCCNmqrOLejL5QtNq9l1CDqKySQFF5UQ';


// ╔══════════════════════════════════════════════════════════════╗
// ║  SUPABASE CLIENT                                             ║
// ╚══════════════════════════════════════════════════════════════╝
const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);


// ╔══════════════════════════════════════════════════════════════╗
// ║  APPLICATION STATE                                           ║
// ╚══════════════════════════════════════════════════════════════╝
let currentUser     = null;  // Supabase user object
let currentRole     = null;  // 'admin' | 'client'
let allProjects     = [];    // Full project list from DB
let pendingDeleteId = null;  // ID of row pending delete confirmation


// ╔══════════════════════════════════════════════════════════════╗
// ║  BOOTSTRAP — runs once on page load                          ║
// ╚══════════════════════════════════════════════════════════════╝
document.addEventListener('DOMContentLoaded', async () => {

  // Set footer year
  $('footer-year').textContent = new Date().getFullYear();

  // Restore any existing session
  const { data: { session } } = await db.auth.getSession();
  if (session) {
    await initDashboard(session.user);
  } else {
    showView('login');
  }

  // React to future sign-in / sign-out events
  db.auth.onAuthStateChange(async (_event, session) => {
    if (session) {
      await initDashboard(session.user);
    } else {
      currentUser = null;
      currentRole = null;
      allProjects = [];
      showView('login');
    }
  });

  // ── Login form ─────────────────────────────────────────────
  $('btn-login').addEventListener('click', handleLogin);
  $('inp-email').addEventListener('keydown',    e => e.key === 'Enter' && $('inp-password').focus());
  $('inp-password').addEventListener('keydown', e => e.key === 'Enter' && handleLogin());
  $('btn-toggle-pw').addEventListener('click',  togglePassword);

  // ── Dashboard nav ──────────────────────────────────────────
  $('btn-logout').addEventListener('click', () => db.auth.signOut());
  $('btn-add-project').addEventListener('click', () => openProjectModal());

  // ── Project modal ──────────────────────────────────────────
  $('btn-modal-close').addEventListener('click',           closeProjectModal);
  $('btn-modal-cancel').addEventListener('click',          closeProjectModal);
  $('modal-project-backdrop').addEventListener('click',    closeProjectModal);
  $('btn-modal-save').addEventListener('click',            handleSave);

  // ── Delete modal ───────────────────────────────────────────
  $('btn-del-cancel').addEventListener('click',            closeDeleteModal);
  $('modal-delete-backdrop').addEventListener('click',     closeDeleteModal);
  $('btn-del-confirm').addEventListener('click',           handleDeleteConfirm);

  // ── Search & filters ───────────────────────────────────────
  $('inp-search').addEventListener('input',            renderTable);
  $('sel-project-status').addEventListener('change',   renderTable);
  $('sel-payment-status').addEventListener('change',   renderTable);

  // ── Keyboard shortcuts ─────────────────────────────────────
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if ($('modal-delete').style.display  !== 'none') { closeDeleteModal();  return; }
    if ($('modal-project').style.display !== 'none') { closeProjectModal(); }
  });
});


// ╔══════════════════════════════════════════════════════════════╗
// ║  AUTHENTICATION                                              ║
// ╚══════════════════════════════════════════════════════════════╝
async function handleLogin() {
  const email    = $('inp-email').value.trim();
  const password = $('inp-password').value;

  if (!email || !password) {
    showLoginError('Please enter your email and password.');
    return;
  }

  setLoginLoading(true);
  hideLoginError();

  const { error } = await db.auth.signInWithPassword({ email, password });

  if (error) {
    showLoginError(error.message || 'Invalid email or password.');
    setLoginLoading(false);
    return;
  }
  // Success handled by onAuthStateChange above
}

function togglePassword() {
  const inp  = $('inp-password');
  const icon = $('btn-toggle-pw').querySelector('i');
  if (inp.type === 'password') {
    inp.type       = 'text';
    icon.className = 'fa-regular fa-eye-slash';
  } else {
    inp.type       = 'password';
    icon.className = 'fa-regular fa-eye';
  }
}

function setLoginLoading(on) {
  $('btn-login').disabled         = on;
  $('login-btn-label').textContent = on ? 'Signing in…' : 'Sign In';
  $('login-spinner').classList.toggle('hidden', !on);
}

function showLoginError(msg) {
  $('login-error-text').textContent = msg;
  $('login-error').classList.remove('hidden');
}

function hideLoginError() {
  $('login-error').classList.add('hidden');
}


// ╔══════════════════════════════════════════════════════════════╗
// ║  DASHBOARD INITIALISATION                                    ║
// ╚══════════════════════════════════════════════════════════════╝
async function initDashboard(user) {
  currentUser = user;

  // Fetch this user's role from the profiles table
  const { data: profile, error } = await db
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (error || !profile) {
    toast('Could not load your user profile. Please contact an admin.', 'error');
    db.auth.signOut();
    return;
  }

  currentRole = profile.role;

  // Populate nav info
  $('nav-user-email').textContent = user.email;

  const badge = $('nav-role-badge');
  if (currentRole === 'admin') {
    badge.className = 'hidden sm:inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-violet-100 text-violet-700 role-badge';
    badge.innerHTML = '<i class="fa-solid fa-shield-halved text-[10px]"></i> Admin';
    // Reveal admin-only UI elements
    $('btn-add-project').style.display = 'inline-flex';
    $('th-actions').style.display      = 'table-cell';
  } else {
    badge.className = 'hidden sm:inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 role-badge';
    badge.innerHTML = '<i class="fa-solid fa-user text-[10px]"></i> Client';
  }

  setLoginLoading(false);
  showView('dashboard');
  await loadProjects();
}


// ╔══════════════════════════════════════════════════════════════╗
// ║  DATA — Load, Stats, Render                                  ║
// ╚══════════════════════════════════════════════════════════════╝
async function loadProjects() {
  setTableState('loading');

  const { data, error } = await db
    .from('projects')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    toast('Failed to load projects: ' + error.message, 'error');
    setTableState('empty');
    return;
  }

  allProjects = data || [];
  updateStats();
  renderTable();
}

function updateStats() {
  $('stat-total').textContent     = allProjects.length;
  $('stat-ongoing').textContent   = allProjects.filter(p => p.project_status === 'Ongoing').length;
  $('stat-completed').textContent = allProjects.filter(p => p.project_status === 'Completed').length;
  $('stat-overdue').textContent   = allProjects.filter(p => p.payment_status === 'Overdue').length;
}

function renderTable() {
  const search   = $('inp-search').value.toLowerCase().trim();
  const pStat    = $('sel-project-status').value;
  const payStat  = $('sel-payment-status').value;

  const rows = allProjects.filter(p => {
    const matchSearch = !search ||
      p.company_name?.toLowerCase().includes(search) ||
      p.project_title?.toLowerCase().includes(search);
    const matchP  = !pStat    || p.project_status === pStat;
    const matchPy = !payStat  || p.payment_status  === payStat;
    return matchSearch && matchP && matchPy;
  });

  if (rows.length === 0) { setTableState('empty'); return; }
  setTableState('table');

  const tbody = $('tbl-body');
  tbody.innerHTML = '';

  rows.forEach((p, i) => {
    const tr = document.createElement('tr');
    tr.className = 'table-row group';

    // Currency cells
    const phpCell = p.total_php != null
      ? `<span class="font-semibold text-slate-700">₱${fmtNum(p.total_php, 'en-PH')}</span>`
      : '<span class="text-slate-300">—</span>';

    const ntdCell = p.total_ntd != null
      ? `<span class="font-semibold text-slate-700">NT$${fmtNum(p.total_ntd, 'zh-TW')}</span>`
      : '<span class="text-slate-300">—</span>';

    // URL cell
    const urlCell = p.live_url
      ? `<a href="${esc(p.live_url)}" target="_blank" rel="noopener noreferrer"
              class="inline-flex items-center gap-1 text-violet-600 hover:text-violet-900 hover:underline max-w-[120px] group/link">
            <i class="fa-solid fa-arrow-up-right-from-square text-[9px] flex-shrink-0 opacity-50 group-hover/link:opacity-100"></i>
            <span class="truncate text-[12px]">${esc(p.live_url.replace(/^https?:\/\/(www\.)?/, ''))}</span>
          </a>`
      : '<span class="text-slate-300">—</span>';

    // Remarks cell
    const remarkCell = p.remarks
      ? `<span class="text-slate-500 text-[12px] block max-w-[170px] truncate" title="${esc(p.remarks)}">${esc(p.remarks)}</span>`
      : '<span class="text-slate-300">—</span>';

    // Actions (admin only)
    const actionsCell = currentRole === 'admin'
      ? `<td class="td text-center">
           <div class="flex items-center justify-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
             <button onclick="openProjectModal('${p.id}')" title="Edit project"
               class="action-btn amber">
               <i class="fa-solid fa-pen-to-square text-xs"></i>
             </button>
             <button onclick="openDeleteModal('${p.id}', ${JSON.stringify(p.project_title || '')})" title="Delete project"
               class="action-btn red">
               <i class="fa-solid fa-trash text-xs"></i>
             </button>
           </div>
         </td>`
      : '';

    tr.innerHTML = `
      <td class="td text-slate-300 text-[12px] w-10">${i + 1}</td>
      <td class="td"><span class="font-semibold text-slate-800 whitespace-nowrap text-[13px]">${esc(p.company_name)}</span></td>
      <td class="td"><span class="text-slate-700 whitespace-nowrap text-[13px]">${esc(p.project_title)}</span></td>
      <td class="td">${pkgBadge(p.package_category)}</td>
      <td class="td">${projBadge(p.project_status)}</td>
      <td class="td">${payBadge(p.payment_status)}</td>
      <td class="td text-right">${phpCell}</td>
      <td class="td text-right">${ntdCell}</td>
      <td class="td">${urlCell}</td>
      <td class="td">${remarkCell}</td>
      ${actionsCell}
    `;
    tbody.appendChild(tr);
  });

  $('tbl-count').textContent = rows.length === allProjects.length
    ? `${allProjects.length} project${allProjects.length !== 1 ? 's' : ''}`
    : `${rows.length} of ${allProjects.length} projects`;
  $('tbl-footer').style.display = 'flex';
}


// ╔══════════════════════════════════════════════════════════════╗
// ║  PROJECT MODAL — Add / Edit                                  ║
// ╚══════════════════════════════════════════════════════════════╝
function openProjectModal(id = null) {
  const isEdit = id !== null;
  const modal  = $('modal-project');

  $('modal-title').textContent       = isEdit ? 'Edit Project'               : 'Add New Project';
  $('modal-subtitle').textContent    = isEdit ? 'Update the project details'  : 'Fill in all project details below';
  $('modal-save-label').textContent  = isEdit ? 'Update Project'             : 'Save Project';

  // Clear form first
  ['f-company', 'f-title', 'f-url', 'f-remarks', 'f-php', 'f-ntd'].forEach(fid => $(fid).value = '');
  $('f-package').value        = 'Package 1: Basic';
  $('f-project-status').value = 'Ongoing';
  $('f-payment-status').value = 'Pending';

  if (isEdit) {
    const p = allProjects.find(pr => pr.id === id);
    if (!p) return;
    $('f-company').value         = p.company_name     ?? '';
    $('f-title').value           = p.project_title    ?? '';
    $('f-package').value         = p.package_category ?? 'Package 1: Basic';
    $('f-project-status').value  = p.project_status   ?? 'Ongoing';
    $('f-payment-status').value  = p.payment_status   ?? 'Pending';
    $('f-php').value             = p.total_php        ?? '';
    $('f-ntd').value             = p.total_ntd        ?? '';
    $('f-url').value             = p.live_url         ?? '';
    $('f-remarks').value         = p.remarks          ?? '';
    modal.dataset.editId         = id;
  } else {
    delete modal.dataset.editId;
  }

  modal.style.display = 'flex';
  setTimeout(() => $('f-company').focus(), 120);
}

function closeProjectModal() {
  $('modal-project').style.display = 'none';
  $('btn-modal-save').disabled     = false;
  $('modal-save-spinner').classList.add('hidden');
}

async function handleSave() {
  const modal  = $('modal-project');
  const editId = modal.dataset.editId || null;

  const company  = $('f-company').value.trim();
  const title    = $('f-title').value.trim();
  const pkg      = $('f-package').value;
  const projStat = $('f-project-status').value;
  const payStat  = $('f-payment-status').value;
  const phpRaw   = $('f-php').value;
  const ntdRaw   = $('f-ntd').value;
  const url      = $('f-url').value.trim();
  const remarks  = $('f-remarks').value.trim();

  // Validation
  if (!company) { toast('Company name is required.',  'error'); $('f-company').focus(); return; }
  if (!title)   { toast('Project title is required.', 'error'); $('f-title').focus();   return; }

  const payload = {
    company_name:     company,
    project_title:    title,
    package_category: pkg,
    project_status:   projStat,
    payment_status:   payStat,
    total_php:        phpRaw !== '' ? parseFloat(phpRaw) : null,
    total_ntd:        ntdRaw !== '' ? parseFloat(ntdRaw) : null,
    live_url:         url     || null,
    remarks:          remarks || null,
    updated_at:       new Date().toISOString(),
  };

  setSaveLoading(true);

  if (editId) {
    // UPDATE
    const { error } = await db.from('projects').update(payload).eq('id', editId);
    setSaveLoading(false);
    if (error) { toast('Update failed: ' + error.message, 'error'); return; }
    const idx = allProjects.findIndex(p => p.id === editId);
    if (idx !== -1) allProjects[idx] = { ...allProjects[idx], ...payload };
    toast('Project updated successfully.', 'success');
  } else {
    // INSERT
    const { data: newRow, error } = await db.from('projects').insert([payload]).select().single();
    setSaveLoading(false);
    if (error) { toast('Could not save project: ' + error.message, 'error'); return; }
    allProjects.unshift(newRow);
    toast('Project added successfully.', 'success');
  }

  closeProjectModal();
  updateStats();
  renderTable();
}

function setSaveLoading(on) {
  $('btn-modal-save').disabled = on;
  $('modal-save-spinner').classList.toggle('hidden', !on);
}


// ╔══════════════════════════════════════════════════════════════╗
// ║  DELETE MODAL                                                ║
// ╚══════════════════════════════════════════════════════════════╝
function openDeleteModal(id, title) {
  pendingDeleteId = id;
  $('del-project-label').textContent = `"${title}"`;
  $('modal-delete').style.display    = 'flex';
}

function closeDeleteModal() {
  pendingDeleteId = null;
  $('modal-delete').style.display = 'none';
  $('btn-del-confirm').disabled   = false;
  $('del-confirm-label').textContent = 'Delete';
  $('del-spinner').classList.add('hidden');
}

async function handleDeleteConfirm() {
  if (!pendingDeleteId) return;

  $('btn-del-confirm').disabled      = true;
  $('del-confirm-label').textContent = 'Deleting…';
  $('del-spinner').classList.remove('hidden');

  const { error } = await db.from('projects').delete().eq('id', pendingDeleteId);

  if (error) {
    toast('Delete failed: ' + error.message, 'error');
    closeDeleteModal();
    return;
  }

  allProjects = allProjects.filter(p => p.id !== pendingDeleteId);
  closeDeleteModal();
  updateStats();
  renderTable();
  toast('Project deleted.', 'success');
}


// ╔══════════════════════════════════════════════════════════════╗
// ║  BADGE RENDERERS                                             ║
// ╚══════════════════════════════════════════════════════════════╝
function projBadge(status) {
  const MAP = {
    'Ongoing':   { cls: 'badge-ongoing',   icon: 'fa-rotate',       dot: true },
    'Completed': { cls: 'badge-completed', icon: 'fa-circle-check', dot: false },
  };
  const { cls, icon } = MAP[status] || { cls: 'badge-default', icon: 'fa-circle' };
  return `<span class="badge ${cls}"><i class="fa-solid ${icon} text-[9px] mr-1"></i>${esc(status)}</span>`;
}

function payBadge(status) {
  const MAP = {
    'Pending':        'badge-pending',
    'Partially Paid': 'badge-partial',
    'Fully Paid':     'badge-paid',
    'Overdue':        'badge-overdue',
  };
  return `<span class="badge ${MAP[status] || 'badge-default'}">${esc(status)}</span>`;
}

function pkgBadge(pkg) {
  const MAP = {
    'Package 1: Basic':       'pkg-1',
    'Package 2: Dynamic':     'pkg-2',
    'Package 3: E-commerce':  'pkg-3',
    'Package 4: Enhancement': 'pkg-4',
    'Website Translation':    'pkg-t',
    'Unspecified':            'pkg-u',
  };
  return `<span class="pkg-badge ${MAP[pkg] || 'pkg-u'}">${esc(pkg)}</span>`;
}


// ╔══════════════════════════════════════════════════════════════╗
// ║  TOAST NOTIFICATIONS                                         ║
// ╚══════════════════════════════════════════════════════════════╝
function toast(msg, type = 'info') {
  const container = $('toasts');
  const el = document.createElement('div');

  const theme = {
    success: { bg: 'bg-emerald-500', icon: 'fa-circle-check' },
    error:   { bg: 'bg-red-500',     icon: 'fa-circle-exclamation' },
    info:    { bg: 'bg-violet-600',  icon: 'fa-circle-info' },
  };
  const { bg, icon } = theme[type] || theme.info;

  el.className = `toast pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl text-white text-[13px] font-medium shadow-xl ${bg} min-w-[260px] max-w-[380px]`;
  el.innerHTML = `
    <i class="fa-solid ${icon} flex-shrink-0 text-base"></i>
    <span class="flex-1 leading-snug">${msg}</span>
    <button onclick="this.parentElement.remove()" class="ml-1 opacity-50 hover:opacity-100 transition text-lg leading-none">&times;</button>
  `;
  container.appendChild(el);

  // Auto-dismiss after 4s
  setTimeout(() => {
    el.classList.add('toast-exit');
    setTimeout(() => el.remove(), 350);
  }, 4000);
}


// ╔══════════════════════════════════════════════════════════════╗
// ║  UI HELPERS                                                  ║
// ╚══════════════════════════════════════════════════════════════╝

/** Switch between 'login' and 'dashboard' views */
function showView(view) {
  $('login-screen').style.display = view === 'login'     ? 'flex'  : 'none';
  $('dashboard').style.display    = view === 'dashboard' ? 'flex'  : 'none';
}

/** Control the table's loading / empty / data state */
function setTableState(state) {
  $('tbl-loading').style.display  = state === 'loading' ? 'flex'  : 'none';
  $('tbl-empty').style.display    = state === 'empty'   ? 'flex'  : 'none';
  $('tbl-projects').style.display = state === 'table'   ? 'table' : 'none';
  if (state !== 'table') $('tbl-footer').style.display = 'none';
}

/** Shorthand for document.getElementById */
function $(id) { return document.getElementById(id); }

/** HTML-escape a string to prevent XSS */
function esc(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/** Format a number with locale-appropriate thousands separators */
function fmtNum(n, locale) {
  return Number(n).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
