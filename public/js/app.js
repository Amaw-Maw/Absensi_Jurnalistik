/**
 * PERSMA - Sistem Absensi Jurnalistik QR Code
 * Client-side Controller & UI State Engine
 */

// Application State
const state = {
  members: [],
  sessions: [],
  attendances: [],
  stats: {},
  activeSession: null,
  activeFilterDivisi: 'All',
  scanMode: 'member_scans_session', // 'member_scans_session' atau 'admin_scans_idcard'
  isScanning: false,
  html5QrScanner: null,
  mongoConnected: false,
  isCooldown: false
};

// API Base URL - Otomatis mendeteksi jika dibuka dari Live Server (port 5500, dll) atau port 3000
function resolveApiBase() {
  if (window.location.port === '3000') {
    return window.location.origin;
  }
  return 'http://localhost:3000';
}
const API_BASE = resolveApiBase();

// ======================== INITIALIZATION ======================== //

document.addEventListener('DOMContentLoaded', () => {
  initRealtimeClock();
  initDateInputs();
  checkDatabaseStatus();
  loadAllData();

  // Periodic health check
  setInterval(checkDatabaseStatus, 20000);
});

// Clock widget
function initRealtimeClock() {
  const clockEl = document.getElementById('realtimeClock');
  const update = () => {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('id-ID', { hour12: false }) + ' WIB';
    if (clockEl) clockEl.innerText = timeStr;
  };
  update();
  setInterval(update, 1000);
}

// Set default dates for session forms
function initDateInputs() {
  const today = new Date().toISOString().split('T')[0];
  const sessDate = document.getElementById('inputSessTanggal');
  if (sessDate) sessDate.value = today;
}

// Check MongoDB status
async function checkDatabaseStatus() {
  const badge = document.getElementById('mongoStatusBadge');
  const text = document.getElementById('mongoStatusText');
  try {
    const res = await fetch(`${API_BASE}/api/status`);
    const data = await res.json();
    state.mongoConnected = data.mongoConnected;

    if (data.mongoConnected) {
      badge.className = 'flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full bg-emerald-950/80 text-emerald-300 border border-emerald-600/50';
      badge.innerHTML = `<span class="w-2 h-2 rounded-full bg-emerald-400"></span><span>MongoDB Aktif</span>`;
    } else {
      badge.className = 'flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full bg-amber-950/80 text-amber-300 border border-amber-600/50';
      badge.innerHTML = `<span class="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span><span>In-Memory (Siap Sambung Mongo)</span>`;
    }
  } catch (err) {
    if (badge) {
      badge.className = 'flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full bg-rose-950/80 text-rose-300 border border-rose-600/50';
      badge.innerHTML = `<span class="w-2 h-2 rounded-full bg-rose-400"></span><span>Offline Mode</span>`;
    }
  }
}

// Fetch all data
async function loadAllData() {
  await Promise.all([
    fetchMembers(),
    fetchSessions(),
    fetchAttendances(),
    fetchStats()
  ]);
  renderDashboard();
  renderSessions();
  renderMembers();
  renderAttendanceTable();
  populateDropdowns();
}

// ======================== API CALLS ======================== //

async function fetchMembers() {
  try {
    const res = await fetch(`${API_BASE}/api/members`);
    const result = await res.json();
    if (result.success) state.members = result.data;
  } catch (e) {
    console.warn('Gagal memuat anggota:', e);
  }
}

async function fetchSessions() {
  try {
    const res = await fetch(`${API_BASE}/api/sessions`);
    const result = await res.json();
    if (result.success) {
      state.sessions = result.data;
      state.activeSession = state.sessions.find(s => s.status === 'Aktif') || state.sessions[0] || null;
    }
  } catch (e) {
    console.warn('Gagal memuat sesi:', e);
  }
}

async function fetchAttendances() {
  try {
    const filterSessId = document.getElementById('filterHistorySession')?.value || '';
    const url = filterSessId ? `${API_BASE}/api/attendances?sessionId=${filterSessId}` : `${API_BASE}/api/attendances`;
    const res = await fetch(url);
    const result = await res.json();
    if (result.success) state.attendances = result.data;
  } catch (e) {
    console.warn('Gagal memuat rekap presensi:', e);
  }
}

async function fetchStats() {
  try {
    const res = await fetch(`${API_BASE}/api/stats`);
    const result = await res.json();
    if (result.success) {
      state.stats = result.data;
      updateStatCounters();
    }
  } catch (e) {
    console.warn('Gagal memuat stats:', e);
  }
}

function updateStatCounters() {
  const s = state.stats;
  const elTotal = document.getElementById('statTotalMembers');
  const elHadir = document.getElementById('statTotalHadir');
  const elTerlambat = document.getElementById('statTotalTerlambat');
  const elIzin = document.getElementById('statTotalIzin');

  if (elTotal) elTotal.innerText = s.totalMembers ?? state.members.length;
  if (elHadir) elHadir.innerText = s.hadirCount ?? 0;
  if (elTerlambat) elTerlambat.innerText = s.terlambatCount ?? 0;
  if (elIzin) elIzin.innerText = (s.izinCount || 0) + (s.sakitCount || 0);
}

// ======================== TAB NAVIGATION ======================== //

function switchTab(tabId) {
  // Hide all contents
  document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));

  // Show active content
  const activeEl = document.getElementById(`tab-${tabId}`);
  if (activeEl) activeEl.classList.remove('hidden');

  // Update nav buttons styling
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.className = 'nav-btn px-3.5 py-2 rounded-lg text-sm font-semibold transition-all duration-200 text-slate-600 hover:text-slate-900 hover:bg-slate-100 flex items-center space-x-2';
  });
  const activeBtn = document.getElementById(`nav-${tabId}`);
  if (activeBtn) {
    activeBtn.className = 'nav-btn px-3.5 py-2 rounded-lg text-sm font-semibold transition-all duration-200 text-rose-600 bg-rose-50 flex items-center space-x-2';
  }

  // Stop camera if navigating away from scanner
  if (tabId !== 'scanner' && state.isScanning) {
    stopScannerCamera();
  }

  // Reload relevant views
  if (tabId === 'dashboard') {
    renderDashboard();
    fetchStats();
  } else if (tabId === 'history') {
    loadAttendanceList();
  }
}

function openQuickScanModal() {
  switchTab('scanner');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ======================== RENDERING ======================== //

// Render Dashboard
function renderDashboard() {
  const cardContainer = document.getElementById('activeSessionCard');
  const feedContainer = document.getElementById('recentAttendanceFeed');

  // Active Session Hero
  if (!state.activeSession) {
    cardContainer.innerHTML = `
      <div class="text-center py-8">
        <i class="fa-regular fa-calendar-xmark text-3xl text-slate-300 mb-2"></i>
        <h4 class="text-base font-bold text-slate-700">Belum Ada Sesi Presensi Aktif</h4>
        <p class="text-xs text-slate-500 mt-1">Silakan buka sesi liputan atau rapat redaksi baru untuk memulai absensi.</p>
        <button onclick="openNewSessionModal()" class="mt-4 px-4 py-2 bg-rose-600 text-white rounded-xl text-xs font-bold shadow hover:bg-rose-700 transition">
          <i class="fa-solid fa-plus mr-1"></i> Buka Sesi Baru
        </button>
      </div>
    `;
  } else {
    const s = state.activeSession;
    cardContainer.innerHTML = `
      <div class="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div class="flex-1">
          <div class="flex items-center space-x-2 mb-2">
            <span class="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-100 text-rose-700">
              ${s.kategori}
            </span>
            <span class="text-xs font-mono text-slate-500 font-semibold">${s.kodeSesi}</span>
          </div>
          <h3 class="text-xl font-black text-slate-900 leading-snug">${s.judul}</h3>
          <p class="text-xs text-slate-600 mt-1.5 leading-relaxed">${s.deskripsi || 'Sesi presensi dewan redaksi pers.'}</p>
          
          <div class="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs text-slate-600">
            <div class="flex items-center space-x-1.5">
              <i class="fa-regular fa-calendar text-rose-500"></i>
              <span>${s.tanggal}</span>
            </div>
            <div class="flex items-center space-x-1.5">
              <i class="fa-regular fa-clock text-rose-500"></i>
              <span>${s.jamMulai} - ${s.jamSelesai}</span>
            </div>
            <div class="flex items-center space-x-1.5 col-span-2 sm:col-span-1">
              <i class="fa-solid fa-location-dot text-rose-500"></i>
              <span class="truncate">${s.lokasi}</span>
            </div>
          </div>
        </div>

        <div class="flex sm:flex-col items-center gap-2">
          <button onclick="showSessionQrModal('${s._id}')" class="w-full px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs shadow-md transition-all flex items-center justify-center space-x-1.5">
            <i class="fa-solid fa-qrcode text-rose-400"></i>
            <span>Tampilkan QR</span>
          </button>
          <button onclick="switchTab('scanner')" class="w-full px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-md shadow-rose-600/20 transition-all flex items-center justify-center space-x-1.5">
            <i class="fa-solid fa-camera"></i>
            <span>Scan Masuk</span>
          </button>
        </div>
      </div>
    `;
  }

  // Recent Attendance Live Feed
  if (state.attendances.length === 0) {
    feedContainer.innerHTML = `
      <div class="text-center py-10 text-slate-400">
        <i class="fa-solid fa-inbox text-3xl mb-2 text-slate-300"></i>
        <p class="text-xs">Belum ada jurnalis yang melakukan presensi hari ini.</p>
      </div>
    `;
  } else {
    feedContainer.innerHTML = state.attendances.slice(0, 6).map(att => {
      const mem = att.memberId || {};
      const waktu = new Date(att.waktuPresensi).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
      const statusColor = att.status === 'Hadir Tepat Waktu' ? 'bg-emerald-100 text-emerald-800' :
        att.status === 'Terlambat' ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-800';

      return `
        <div class="p-3 rounded-xl bg-slate-50 border border-slate-100 hover:bg-white hover:shadow-sm transition-all flex items-center justify-between">
          <div class="flex items-center space-x-3">
            <div class="w-8 h-8 rounded-full bg-slate-800 text-white font-black text-xs flex items-center justify-center">
              ${(mem.nama || 'J').charAt(0)}
            </div>
            <div>
              <p class="text-xs font-bold text-slate-900 leading-tight">${mem.nama || 'Jurnalis'}</p>
              <p class="text-[11px] text-slate-500">${mem.divisi || 'Redaksi'} • <span class="font-mono text-[10px]">${mem.idPers || ''}</span></p>
            </div>
          </div>
          <div class="text-right">
            <span class="inline-block px-2 py-0.5 rounded text-[10px] font-bold ${statusColor}">
              ${att.status}
            </span>
            <p class="text-[10px] text-slate-400 mt-0.5 font-mono">${waktu} WIB</p>
          </div>
        </div>
      `;
    }).join('');
  }
}

// Render Sesi Kegiatan
function renderSessions() {
  const container = document.getElementById('sessionGridList');
  if (!container) return;

  if (state.sessions.length === 0) {
    container.innerHTML = `
      <div class="col-span-full text-center py-12 bg-white rounded-2xl border border-slate-200">
        <i class="fa-regular fa-calendar-plus text-4xl text-slate-300 mb-3"></i>
        <h4 class="font-bold text-slate-700">Belum Ada Sesi Kegiatan</h4>
        <p class="text-xs text-slate-500 mt-1">Buat agenda pertemuan redaksi pertama Anda.</p>
        <button onclick="openNewSessionModal()" class="mt-4 px-4 py-2 bg-rose-600 text-white font-bold rounded-xl text-xs">
          Buka Sesi Baru
        </button>
      </div>
    `;
    return;
  }

  container.innerHTML = state.sessions.map(s => {
    const isAktif = s.status === 'Aktif';
    return `
      <div class="bg-white rounded-2xl border ${isAktif ? 'border-rose-400 ring-2 ring-rose-100' : 'border-slate-200'} p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
        <div>
          <div class="flex items-center justify-between mb-3">
            <span class="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${isAktif ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}">
              ${s.status}
            </span>
            <span class="text-xs font-mono text-slate-400">${s.kodeSesi}</span>
          </div>

          <h3 class="text-base font-extrabold text-slate-900">${s.judul}</h3>
          <p class="text-xs text-rose-600 font-semibold mt-0.5"><i class="fa-solid fa-tag mr-1"></i>${s.kategori}</p>
          <p class="text-xs text-slate-500 mt-2 line-clamp-2">${s.deskripsi || 'Tidak ada catatan pos liputan.'}</p>

          <div class="mt-4 pt-3 border-t border-slate-100 space-y-1.5 text-xs text-slate-600">
            <div class="flex items-center space-x-2">
              <i class="fa-regular fa-calendar text-slate-400 w-4"></i>
              <span>${s.tanggal}</span>
            </div>
            <div class="flex items-center space-x-2">
              <i class="fa-regular fa-clock text-slate-400 w-4"></i>
              <span>${s.jamMulai} - ${s.jamSelesai} WIB</span>
            </div>
            <div class="flex items-center space-x-2">
              <i class="fa-solid fa-location-dot text-slate-400 w-4"></i>
              <span class="truncate">${s.lokasi}</span>
            </div>
          </div>
        </div>

        <div class="mt-5 pt-3 border-t border-slate-100 flex items-center gap-2">
          <button onclick="showSessionQrModal('${s._id}')" class="flex-1 py-2 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs flex items-center justify-center space-x-1.5 transition">
            <i class="fa-solid fa-qrcode text-rose-400"></i>
            <span>Tampilkan QR</span>
          </button>
          ${isAktif ? `
            <button onclick="toggleSessionStatus('${s._id}', 'Selesai')" class="py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition" title="Tutup Sesi">
              <i class="fa-solid fa-check"></i> Selesai
            </button>
          ` : `
            <button onclick="toggleSessionStatus('${s._id}', 'Aktif')" class="py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition" title="Buka Kembali">
              <i class="fa-solid fa-rotate-left"></i> Buka
            </button>
          `}
        </div>
      </div>
    `;
  }).join('');
}

// Render Anggota Jurnalis
function renderMembers() {
  const container = document.getElementById('membersGrid');
  if (!container) return;

  let list = state.members;
  if (state.activeFilterDivisi !== 'All') {
    list = list.filter(m => m.divisi && m.divisi.toLowerCase().includes(state.activeFilterDivisi.toLowerCase()));
  }

  if (list.length === 0) {
    container.innerHTML = `
      <div class="col-span-full text-center py-12 bg-white rounded-2xl border border-slate-200">
        <i class="fa-solid fa-user-slash text-4xl text-slate-300 mb-3"></i>
        <h4 class="font-bold text-slate-700">Tidak Ada Anggota Jurnalis Ditemukan</h4>
        <p class="text-xs text-slate-500 mt-1">Tambahkan data wartawan/redaktur pers Anda.</p>
        <button onclick="openNewMemberModal()" class="mt-4 px-4 py-2 bg-slate-900 text-white font-bold rounded-xl text-xs">
          Tambah Jurnalis
        </button>
      </div>
    `;
    return;
  }

  container.innerHTML = list.map(m => {
    return `
      <div class="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
        <div>
          <div class="flex items-start justify-between">
            <div class="flex items-center space-x-3">
              <div class="w-12 h-12 rounded-2xl bg-gradient-to-tr from-slate-900 to-slate-700 text-white flex items-center justify-center font-bold text-lg shadow-sm">
                ${m.nama.charAt(0)}
              </div>
              <div>
                <span class="inline-block px-2 py-0.5 rounded text-[10px] font-extrabold bg-rose-50 text-rose-700 uppercase tracking-wider mb-0.5">
                  ${m.divisi}
                </span>
                <h3 class="text-base font-extrabold text-slate-900 leading-snug">${m.nama}</h3>
              </div>
            </div>
            <button onclick="deleteMember('${m._id}', '${m.nama}')" class="text-slate-300 hover:text-rose-600 transition" title="Hapus Data">
              <i class="fa-solid fa-trash-can text-sm"></i>
            </button>
          </div>

          <div class="mt-4 space-y-1.5 text-xs text-slate-600">
            <div class="flex items-center justify-between py-1 border-b border-slate-100">
              <span class="text-slate-400">ID Pers / NIM:</span>
              <span class="font-mono font-bold text-slate-800">${m.idPers}</span>
            </div>
            <div class="flex items-center justify-between py-1 border-b border-slate-100">
              <span class="text-slate-400">Jabatan:</span>
              <span class="font-semibold text-slate-700">${m.jabatan || '-'}</span>
            </div>
            <div class="flex items-center justify-between py-1">
              <span class="text-slate-400">WhatsApp:</span>
              <span class="font-medium text-slate-700">${m.noHp || '-'}</span>
            </div>
          </div>
        </div>

        <div class="mt-5 pt-3 border-t border-slate-100 flex items-center gap-2">
          <button onclick="openIdCardModal('${m._id}')" class="flex-1 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs flex items-center justify-center space-x-1.5 shadow transition">
            <i class="fa-solid fa-id-card text-rose-400"></i>
            <span>Kartu Pers (QR)</span>
          </button>
        </div>
      </div>
    `;
  }).join('');
}

function filterMembers(divisi) {
  state.activeFilterDivisi = divisi;
  document.querySelectorAll('.filter-div-btn').forEach(btn => {
    btn.className = 'filter-div-btn px-3 py-1 rounded-full text-xs font-semibold bg-slate-200 text-slate-700 hover:bg-slate-300';
    if (btn.innerText.toLowerCase().includes(divisi.toLowerCase()) || (divisi === 'All' && btn.innerText === 'Semua')) {
      btn.className = 'filter-div-btn px-3 py-1 rounded-full text-xs font-semibold bg-rose-600 text-white';
    }
  });
  renderMembers();
}

// Render Attendance Table
function renderAttendanceTable() {
  const tbody = document.getElementById('attendanceTableBody');
  const countEl = document.getElementById('historyRowCount');
  if (!tbody) return;

  if (countEl) countEl.innerText = state.attendances.length;

  if (state.attendances.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" class="text-center py-10 text-slate-400">
          <i class="fa-solid fa-file-circle-question text-3xl mb-2 text-slate-300"></i>
          <p>Belum ada rekaman presensi yang cocok dengan filter ini.</p>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = state.attendances.map((att, idx) => {
    const mem = att.memberId || {};
    const sess = att.sessionId || {};
    const waktu = new Date(att.waktuPresensi);
    const dateStr = waktu.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
    const timeStr = waktu.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) + ' WIB';

    const statusBadge = att.status === 'Hadir Tepat Waktu' ? 'bg-emerald-100 text-emerald-800 border-emerald-200' :
      att.status === 'Terlambat' ? 'bg-amber-100 text-amber-800 border-amber-200' :
        att.status === 'Izin' ? 'bg-blue-100 text-blue-800 border-blue-200' :
          'bg-rose-100 text-rose-800 border-rose-200';

    return `
      <tr class="hover:bg-slate-50 transition-colors">
        <td class="py-3 px-4 font-bold text-slate-400">${idx + 1}</td>
        <td class="py-3 px-4 font-bold text-slate-900">${mem.nama || 'Wartawan'}</td>
        <td class="py-3 px-4">
          <span class="font-mono text-slate-600 text-xs">${mem.idPers || '-'}</span>
          <span class="block text-[11px] text-slate-400">${mem.divisi || '-'}</span>
        </td>
        <td class="py-3 px-4">
          <span class="font-semibold text-slate-800">${sess.judul || 'Sesi Redaksi'}</span>
          <span class="block text-[11px] text-slate-400">${sess.kodeSesi || ''}</span>
        </td>
        <td class="py-3 px-4 font-mono text-xs">
          <span>${dateStr}</span>
          <span class="block text-slate-400 text-[11px]">${timeStr}</span>
        </td>
        <td class="py-3 px-4">
          <span class="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${statusBadge}">
            ${att.status}
          </span>
        </td>
        <td class="py-3 px-4 text-xs font-semibold text-slate-600">
          <i class="fa-solid ${att.metode?.includes('QR') ? 'fa-qrcode text-rose-500' : 'fa-keyboard text-slate-400'} mr-1"></i>
          ${att.metode || 'Scan QR'}
        </td>
        <td class="py-3 px-4 text-xs text-slate-600 italic">
          ${att.catatanLiputan || att.judulBerita || '-'}
        </td>
      </tr>
    `;
  }).join('');
}

// Populate Dropdown Menus
function populateDropdowns() {
  // Scanner member selector
  const scanMem = document.getElementById('selectScannerMember');
  if (scanMem) {
    scanMem.innerHTML = `<option value="">-- Pilih Profil Jurnalis Anda Sebelum Scan --</option>` +
      state.members.map(m => `<option value="${m._id}">${m.nama} (${m.idPers} - ${m.divisi})</option>`).join('');
  }

  // Filter history session
  const filtSess = document.getElementById('filterHistorySession');
  if (filtSess) {
    const curVal = filtSess.value;
    filtSess.innerHTML = `<option value="">-- Semua Sesi Kegiatan --</option>` +
      state.sessions.map(s => `<option value="${s._id}" ${s._id === curVal ? 'selected' : ''}>${s.judul} (${s.tanggal})</option>`).join('');
  }

  // Manual attendance modals
  const manSess = document.getElementById('manualSelectSession');
  if (manSess) {
    manSess.innerHTML = state.sessions.map(s => `<option value="${s._id}">${s.judul} (${s.status})</option>`).join('');
  }

  const manMem = document.getElementById('manualSelectMember');
  if (manMem) {
    manMem.innerHTML = state.members.map(m => `<option value="${m._id}">${m.nama} (${m.idPers})</option>`).join('');
  }
}

// ======================== QR SCANNER ENGINE ======================== //

function setScanMode(mode) {
  state.scanMode = mode;
  const btnMem = document.getElementById('modeBtnMember');
  const btnAdm = document.getElementById('modeBtnAdmin');
  const selectorWrapper = document.getElementById('jurnalisSelectorWrapper');

  if (mode === 'member_scans_session') {
    btnMem.className = 'flex-1 py-2 rounded-lg bg-white text-slate-900 shadow-sm transition-all flex items-center justify-center space-x-2';
    btnAdm.className = 'flex-1 py-2 rounded-lg text-slate-600 hover:text-slate-900 transition-all flex items-center justify-center space-x-2';
    selectorWrapper.classList.remove('hidden');
  } else {
    btnAdm.className = 'flex-1 py-2 rounded-lg bg-white text-slate-900 shadow-sm transition-all flex items-center justify-center space-x-2';
    btnMem.className = 'flex-1 py-2 rounded-lg text-slate-600 hover:text-slate-900 transition-all flex items-center justify-center space-x-2';
    selectorWrapper.classList.add('hidden');
  }
}

async function startScannerCamera() {
  if (state.isScanning) return;

  const placeholder = document.getElementById('cameraPlaceholder');
  const laser = document.getElementById('scannerLaser');
  const btnStart = document.getElementById('btnStartScan');
  const btnStop = document.getElementById('btnStopScan');

  try {
    state.html5QrScanner = new Html5Qrcode("reader");

    // Config: fps 10, qrbox 250
    const config = { fps: 10, qrbox: { width: 250, height: 250 } };

    await state.html5QrScanner.start(
      { facingMode: "environment" },
      config,
      onScanSuccess,
      onScanFailure
    );

    state.isScanning = true;
    placeholder.classList.add('hidden');
    laser.classList.remove('hidden');
    btnStart.classList.add('hidden');
    btnStop.classList.remove('hidden');

  } catch (err) {
    console.error('Camera start error:', err);
    Swal.fire({
      icon: 'error',
      title: 'Kamera Tidak Dapat Diakses',
      text: 'Pastikan izin akses kamera diizinkan pada browser Anda atau gunakan input manual di bawah.',
      confirmButtonColor: '#e11d48'
    });
  }
}

async function stopScannerCamera() {
  if (!state.isScanning || !state.html5QrScanner) return;

  try {
    await state.html5QrScanner.stop();
    state.html5QrScanner.clear();
  } catch (e) {
    console.warn('Stop scanner warning:', e);
  }

  state.isScanning = false;
  state.html5QrScanner = null;

  document.getElementById('cameraPlaceholder').classList.remove('hidden');
  document.getElementById('scannerLaser').classList.add('hidden');
  document.getElementById('btnStartScan').classList.remove('hidden');
  document.getElementById('btnStopScan').classList.add('hidden');
}

function onScanSuccess(decodedText, decodedResult) {
  if (state.isCooldown) return;
  state.isCooldown = true;

  // Sound beep
  playBeep();

  // Process decoded QR
  processAttendanceSubmission(decodedText);

  // 3 seconds cooldown to prevent repeated scans of same QR
  setTimeout(() => {
    state.isCooldown = false;
  }, 3000);
}

function onScanFailure(error) {
  // Silent frame parse error, normal while waiting for QR
}

function playBeep() {
  const audio = document.getElementById('beepAudio');
  if (audio) {
    audio.currentTime = 0;
    audio.play().catch(() => { });
  }
}

async function processAttendanceSubmission(qrString) {
  const selectedMemberId = document.getElementById('selectScannerMember')?.value;
  const coverageNote = document.getElementById('scannerCoverageNote')?.value || '';

  // Validasi mode Jurnalis Scan QR Sesi
  if (state.scanMode === 'member_scans_session') {
    if (!selectedMemberId && (qrString.startsWith('SESI_') || qrString.startsWith('SESI-JRN-'))) {
      Swal.fire({
        icon: 'warning',
        title: 'Pilih Profil Jurnalis',
        text: 'Silakan pilih nama jurnalis Anda pada menu dropdown di atas sebelum melakukan scan QR sesi!',
        confirmButtonColor: '#e11d48'
      });
      return;
    }
  }

  Swal.fire({
    title: 'Memverifikasi Presensi...',
    text: 'Menghubungkan data ke database...',
    allowOutsideClick: false,
    didOpen: () => Swal.showLoading()
  });

  try {
    const payload = {
      qrData: qrString.trim(),
      memberId: selectedMemberId || undefined,
      sessionId: state.activeSession?._id || undefined,
      catatanLiputan: coverageNote
    };

    const res = await fetch(`${API_BASE}/api/attendances/scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();

    if (data.success) {
      // Confetti celebration
      if (typeof confetti === 'function') {
        confetti({
          particleCount: 80,
          spread: 70,
          origin: { y: 0.6 }
        });
      }

      Swal.fire({
        icon: 'success',
        title: 'Presensi Sukses!',
        html: `
          <div class="text-left text-xs sm:text-sm bg-slate-50 p-4 rounded-xl border border-slate-200 mt-2 space-y-1.5">
            <p><strong>Nama:</strong> ${data.data.memberId?.nama || 'Jurnalis'}</p>
            <p><strong>ID Pers:</strong> ${data.data.memberId?.idPers || '-'}</p>
            <p><strong>Status:</strong> <span class="font-bold text-emerald-600">${data.data.status}</span></p>
            <p><strong>Waktu:</strong> ${new Date(data.data.waktuPresensi).toLocaleTimeString('id-ID')} WIB</p>
            ${coverageNote ? `<p><strong>Catatan:</strong> ${coverageNote}</p>` : ''}
          </div>
        `,
        confirmButtonColor: '#10b981',
        confirmButtonText: 'Selesai'
      });

      // Clear note
      document.getElementById('scannerCoverageNote').value = '';

      // Reload fresh data
      loadAllData();
    } else {
      Swal.fire({
        icon: 'error',
        title: 'Gagal Presensi',
        text: data.message || 'QR Code tidak valid atau sudah digunakan.',
        confirmButtonColor: '#e11d48'
      });
    }
  } catch (err) {
    Swal.fire({
      icon: 'error',
      title: 'Kesalahan Sistem',
      text: err.message || 'Tidak dapat terhubung ke server backend.',
      confirmButtonColor: '#e11d48'
    });
  }
}

function handleManualQrSubmit() {
  const val = document.getElementById('manualQrInput')?.value;
  if (!val) {
    Swal.fire({ icon: 'warning', title: 'Input Kosong', text: 'Ketik ID Pers atau Token QR terlebih dahulu.' });
    return;
  }
  processAttendanceSubmission(val);
  document.getElementById('manualQrInput').value = '';
}

// ======================== MODAL: QR SESI LAYAR PENUH ======================== //

let currentSessionQrCodeObj = null;

function showSessionQrModal(sessionId) {
  const sess = state.sessions.find(s => s._id === sessionId);
  if (!sess) return;

  document.getElementById('modalSessionTitle').innerText = sess.judul;
  document.getElementById('modalSessionMeta').innerText = `${sess.tanggal} • ${sess.jamMulai} - ${sess.jamSelesai} WIB • ${sess.lokasi}`;
  document.getElementById('modalSessionTokenText').innerText = sess.qrCodeToken;

  const canvasContainer = document.getElementById('modalQrCanvas');
  canvasContainer.innerHTML = '';

  currentSessionQrCodeObj = new QRCode(canvasContainer, {
    text: sess.qrCodeToken,
    width: 230,
    height: 230,
    colorDark: '#0f172a',
    colorLight: '#ffffff',
    correctLevel: QRCode.CorrectLevel.H
  });

  document.getElementById('modalQrSession').classList.remove('hidden');
}

function closeQrModal() {
  document.getElementById('modalQrSession').classList.add('hidden');
}

function downloadQrSession() {
  const img = document.querySelector('#modalQrCanvas img');
  if (img) {
    const a = document.createElement('a');
    a.href = img.src;
    a.download = `QR-SESI-${document.getElementById('modalSessionTokenText').innerText}.png`;
    a.click();
  } else {
    Swal.fire({ icon: 'info', title: 'Tunggu Sebentar', text: 'QR Code sedang dirender.' });
  }
}

// ======================== MODAL: ID CARD KARTU PERS ======================== //

let currentCardQrObj = null;

function openIdCardModal(memberId) {
  const m = state.members.find(x => x._id === memberId);
  if (!m) return;

  document.getElementById('cardMemberName').innerText = m.nama;
  document.getElementById('cardMemberDivisi').innerText = `${m.jabatan || m.divisi} (${m.divisi})`;
  document.getElementById('cardMemberIdPers').innerText = `ID PERS: ${m.idPers}`;
  document.getElementById('cardMemberInstansi').innerText = m.instansi || 'Lembaga Pers Jurnalistik';

  const qrContainer = document.getElementById('cardQrContainer');
  qrContainer.innerHTML = '';

  currentCardQrObj = new QRCode(qrContainer, {
    text: m.qrCodeToken,
    width: 72,
    height: 72,
    colorDark: '#0f172a',
    colorLight: '#ffffff',
    correctLevel: QRCode.CorrectLevel.M
  });

  document.getElementById('modalIdCard').classList.remove('hidden');
}

function closeIdCardModal() {
  document.getElementById('modalIdCard').classList.add('hidden');
}

function printIdCardOnly() {
  window.print();
}

// ======================== FORM HANDLERS ======================== //

// Tambah Sesi Baru
function openNewSessionModal() {
  document.getElementById('modalNewSession').classList.remove('hidden');
}
function closeNewSessionModal() {
  document.getElementById('modalNewSession').classList.add('hidden');
}

async function handleCreateSession(e) {
  e.preventDefault();
  const payload = {
    judul: document.getElementById('inputSessJudul').value,
    kategori: document.getElementById('inputSessKategori').value,
    lokasi: document.getElementById('inputSessLokasi').value,
    tanggal: document.getElementById('inputSessTanggal').value,
    jamMulai: document.getElementById('inputSessJamMulai').value,
    jamSelesai: document.getElementById('inputSessJamSelesai').value,
    deskripsi: document.getElementById('inputSessDeskripsi').value
  };

  try {
    const res = await fetch(`${API_BASE}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await res.json();
    if (result.success) {
      closeNewSessionModal();
      document.getElementById('formNewSession').reset();
      initDateInputs();
      Swal.fire({
        icon: 'success',
        title: 'Sesi Berhasil Dibuat!',
        text: 'QR Code sesi otomatis di-generate dan siap digunakan.',
        confirmButtonColor: '#e11d48'
      });
      await loadAllData();
      showSessionQrModal(result.data._id);
    } else {
      Swal.fire({ icon: 'error', title: 'Gagal', text: result.message });
    }
  } catch (err) {
    Swal.fire({ icon: 'error', title: 'Error', text: err.message });
  }
}

async function toggleSessionStatus(sessionId, newStatus) {
  try {
    const res = await fetch(`${API_BASE}/api/sessions/${sessionId}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus })
    });
    const data = await res.json();
    if (data.success) {
      loadAllData();
    }
  } catch (e) {
    console.error(e);
  }
}

// Tambah Member Jurnalis Baru
function openNewMemberModal() {
  document.getElementById('modalNewMember').classList.remove('hidden');
}
function closeNewMemberModal() {
  document.getElementById('modalNewMember').classList.add('hidden');
}

async function handleCreateMember(e) {
  e.preventDefault();
  const payload = {
    idPers: document.getElementById('inputMemIdPers').value,
    nama: document.getElementById('inputMemNama').value,
    divisi: document.getElementById('inputMemDivisi').value,
    jabatan: document.getElementById('inputMemJabatan').value,
    email: document.getElementById('inputMemEmail').value,
    noHp: document.getElementById('inputMemHp').value,
    instansi: document.getElementById('inputMemInstansi').value
  };

  try {
    const res = await fetch(`${API_BASE}/api/members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await res.json();
    if (result.success) {
      closeNewMemberModal();
      document.getElementById('formNewMember').reset();
      Swal.fire({
        icon: 'success',
        title: 'Jurnalis Berhasil Ditambahkan!',
        text: 'Kartu Pers dan QR Code unik telah siap.',
        confirmButtonColor: '#0f172a'
      });
      await loadAllData();
      openIdCardModal(result.data._id);
    } else {
      Swal.fire({ icon: 'error', title: 'Gagal', text: result.message });
    }
  } catch (err) {
    Swal.fire({ icon: 'error', title: 'Error', text: err.message });
  }
}

async function deleteMember(memberId, name) {
  const confirm = await Swal.fire({
    title: 'Hapus Jurnalis?',
    text: `Data ${name} akan dihapus dari sistem.`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#e11d48',
    cancelButtonColor: '#64748b',
    confirmButtonText: 'Ya, Hapus',
    cancelButtonText: 'Batal'
  });

  if (confirm.isConfirmed) {
    try {
      const res = await fetch(`${API_BASE}/api/members/${memberId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        Swal.fire({ icon: 'success', title: 'Terhapus', text: data.message });
        loadAllData();
      }
    } catch (e) {
      Swal.fire({ icon: 'error', title: 'Error', text: e.message });
    }
  }
}

// Presensi Manual Modal
function openManualAttendanceModal() {
  populateDropdowns();
  document.getElementById('modalManualAtt').classList.remove('hidden');
}
function closeManualAttModal() {
  document.getElementById('modalManualAtt').classList.add('hidden');
}

async function handleManualAttendanceSubmit(e) {
  e.preventDefault();
  const payload = {
    sessionId: document.getElementById('manualSelectSession').value,
    memberId: document.getElementById('manualSelectMember').value,
    status: document.getElementById('manualSelectStatus').value,
    catatanLiputan: document.getElementById('manualCatatan').value
  };

  try {
    const res = await fetch(`${API_BASE}/api/attendances/manual`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await res.json();
    if (result.success) {
      closeManualAttModal();
      document.getElementById('formManualAtt').reset();
      Swal.fire({ icon: 'success', title: 'Tersimpan', text: result.message });
      loadAllData();
    } else {
      Swal.fire({ icon: 'error', title: 'Gagal', text: result.message });
    }
  } catch (err) {
    Swal.fire({ icon: 'error', title: 'Error', text: err.message });
  }
}

async function loadAttendanceList() {
  await fetchAttendances();
  renderAttendanceTable();
}

// ======================== EXPORT DATA ======================== //

function exportToCSV() {
  if (state.attendances.length === 0) {
    Swal.fire({ icon: 'info', title: 'Data Kosong', text: 'Tidak ada data presensi untuk diekspor.' });
    return;
  }

  const headers = ['No', 'ID Pers', 'Nama Jurnalis', 'Divisi', 'Sesi', 'Tanggal', 'Jam Presensi', 'Status', 'Metode', 'Catatan'];
  const rows = state.attendances.map((a, i) => {
    const m = a.memberId || {};
    const s = a.sessionId || {};
    const d = new Date(a.waktuPresensi);
    return [
      i + 1,
      `"${m.idPers || ''}"`,
      `"${m.nama || ''}"`,
      `"${m.divisi || ''}"`,
      `"${s.judul || ''}"`,
      `"${d.toISOString().split('T')[0]}"`,
      `"${d.toLocaleTimeString('id-ID')}"`,
      `"${a.status || ''}"`,
      `"${a.metode || ''}"`,
      `"${(a.catatanLiputan || '').replace(/"/g, '""')}"`
    ];
  });

  const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', `Rekap_Presensi_Jurnalistik_${new Date().toISOString().split('T')[0]}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
