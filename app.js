// ═══════════════════════════════════════════
//  SIAP – Sistem Informasi Absensi Pegawai KPU
//  app.js – Full Application Logic
// ═══════════════════════════════════════════

// ── DATABASE (localStorage) ──
const DB = {
  get: (k) => { try { return JSON.parse(localStorage.getItem('siap_' + k)); } catch { return null; } },
  set: (k, v) => { localStorage.setItem('siap_' + k, JSON.stringify(v)); return v; },
  del: (k) => localStorage.removeItem('siap_' + k)
};

// ── SEED DATA ──
function initDB() {
  if (DB.get('initialized')) return;

  const users = [
    { id:'u1', nip:'198501012010011001', nama:'Administrator KPU', golongan:'PNS', pangkat:'IVa',
      jabatan:'Administrator Sistem', unit:'Sekretariat', email:'admin@kpu.go.id', hp:'08111111111',
      username:'admin', password:'admin123', role:'admin', status:'Aktif',
      avatar:'https://ui-avatars.com/api/?name=Admin+KPU&background=c62828&color=fff&size=80' },
    { id:'u2', nip:'199001012015032001', nama:'Sri Tutut', golongan:'PNS', pangkat:'IIIa',
      jabatan:'Pranata Komputer', unit:'Bagian TI', email:'sritutut@kpu.go.id', hp:'08222222222',
      username:'pegawai', password:'pegawai123', role:'pegawai', status:'Aktif',
      avatar:'https://ui-avatars.com/api/?name=Sri+Tutut&background=1565c0&color=fff&size=80' },
    { id:'u3', nip:'199503152019081001', nama:'Budi Santoso', golongan:'PPPK', pangkat:'IIIb',
      jabatan:'Analis Kebijakan', unit:'Divisi Perencanaan', email:'budi@kpu.go.id', hp:'08333333333',
      username:'budi', password:'budi123', role:'pegawai', status:'Aktif',
      avatar:'https://ui-avatars.com/api/?name=Budi+Santoso&background=2e7d32&color=fff&size=80' },
    { id:'u4', nip:'198808202012042002', nama:'Dewi Rahayu', golongan:'PNS', pangkat:'IIIb',
      jabatan:'Pengelola Keuangan', unit:'Bagian Keuangan', email:'dewi@kpu.go.id', hp:'08444444444',
      username:'dewi', password:'dewi123', role:'pegawai', status:'Aktif',
      avatar:'https://ui-avatars.com/api/?name=Dewi+Rahayu&background=6a1b9a&color=fff&size=80' }
  ];
  DB.set('users', users);

  // Seed absensi
  const absensi = [];
  const now = new Date();
  for (let i = 1; i < now.getDate(); i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), i);
    if (d.getDay() === 0 || d.getDay() === 6) continue;
    const dateStr = formatDate(d);
    ['u2','u3','u4'].forEach(uid => {
      const mh = 7, mm = Math.floor(Math.random()*20+30);
      const masuk = `${mh}:${String(mm).padStart(2,'0')}`;
      absensi.push({
        id:`abs_${uid}_${dateStr}`, userId:uid, tanggal:dateStr,
        masuk, siang:'12:00', pulang:`16:${String(Math.floor(Math.random()*30+30)).padStart(2,'0')}`,
        status: mm > 45 ? 'Terlambat' : 'Hadir',
        catatan:'', lat:-2.9761+(Math.random()-.5)*.01, lon:104.7754+(Math.random()-.5)*.01
      });
    });
  }
  DB.set('absensi', absensi);
  DB.set('izincuti', []);
  DB.set('dokumen', []);
  DB.set('initialized', true);
}

// ── STATE ──
let currentUser = null;
let gpsLat = null, gpsLon = null;

// ── UTILS ──
function formatDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function formatDateID(d) {
  const months = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
  const dt = typeof d === 'string' ? new Date(d+'T00:00:00') : d;
  return `${dt.getDate()} ${months[dt.getMonth()]} ${dt.getFullYear()}`;
}
function formatDateLong(d) {
  const months = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
  const days   = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
  const dt = typeof d === 'string' ? new Date(d+'T00:00:00') : d;
  return `${dt.getDate()} ${months[dt.getMonth()]} ${dt.getFullYear()}`;
}
function getDayID(d) {
  return ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'][d.getDay()];
}
function todayStr() { return formatDate(new Date()); }
function nowTime() {
  const n = new Date();
  return `${String(n.getHours()).padStart(2,'0')}:${String(n.getMinutes()).padStart(2,'0')}`;
}
function nowDateTime() { return new Date().toLocaleString('id-ID'); }
function calcDurasi(masuk, pulang) {
  if (!masuk || !pulang) return '—';
  const [mh,mm] = masuk.split(':').map(Number);
  const [ph,pm] = pulang.split(':').map(Number);
  const diff = (ph*60+pm)-(mh*60+mm);
  if (diff <= 0) return '—';
  return `${Math.floor(diff/60)}j ${diff%60}m`;
}
function diffDays(a, b) {
  const da = new Date(a+'T00:00:00'), db = new Date(b+'T00:00:00');
  return Math.max(1, Math.round((db-da)/(1000*60*60*24))+1);
}
function showToast(msg, dur=2800) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.remove('hidden');
  setTimeout(()=>t.classList.add('hidden'), dur);
}
function showMsg(el, msg, type) {
  if (typeof el === 'string') el = document.getElementById(el);
  el.textContent = msg; el.className = `absen-msg ${type}`;
  el.classList.remove('hidden');
  setTimeout(()=>el.classList.add('hidden'), 4000);
}
function statusBadge(s) {
  const m = {Hadir:'green',Alpha:'red',Izin:'blue','Cuti':'orange',Terlambat:'orange',
    Menunggu:'yellow',Disetujui:'green',Ditolak:'red'};
  return `<span class="badge badge-${m[s]||'gray'}">${s}</span>`;
}

// ── LIVE CLOCK ──
function startClock() {
  function tick() {
    const n = new Date();
    const hms = `${String(n.getHours()).padStart(2,'0')}:${String(n.getMinutes()).padStart(2,'0')}:${String(n.getSeconds()).padStart(2,'0')}`;
    document.getElementById('live-clock').textContent = hms;
    document.getElementById('live-date').textContent = formatDateID(n);
    document.getElementById('w-date').textContent = formatDateLong(n);
    document.getElementById('w-day').textContent = getDayID(n);
  }
  tick(); setInterval(tick, 1000);
}

// ── LOGIN ──
function doLogin() {
  const nip = document.getElementById('login-nip').value.trim();
  const pw  = document.getElementById('login-pw').value;
  const users = DB.get('users') || [];
  const user = users.find(u=>(u.username===nip||u.nip===nip)&&u.password===pw&&u.status==='Aktif');
  if (!user) { document.getElementById('login-error').classList.remove('hidden'); return; }
  currentUser = user;
  DB.set('session', user.id);
  document.getElementById('login-error').classList.add('hidden');
  enterApp();
}
function doLogoutFromLogin() {
  DB.del('session'); currentUser = null;
  showToast('Anda telah keluar dari sistem');
}
function togglePw() {
  const inp = document.getElementById('login-pw');
  inp.type = inp.type === 'password' ? 'text' : 'password';
}
document.getElementById('login-pw').addEventListener('keydown', e=>{ if(e.key==='Enter') doLogin(); });
document.getElementById('login-nip').addEventListener('keydown', e=>{ if(e.key==='Enter') doLogin(); });

// ── SESSION ──
function checkSession() {
  const sid = DB.get('session');
  if (sid) {
    const users = DB.get('users') || [];
    const user = users.find(u=>u.id===sid);
    if (user) { currentUser = user; enterApp(); return; }
  }
  document.getElementById('page-login').classList.add('active');
}

function enterApp() {
  document.getElementById('page-login').classList.remove('active');
  document.getElementById('page-login').classList.add('hidden');
  document.getElementById('page-app').classList.remove('hidden');
  document.getElementById('page-app').style.display = 'flex';
  document.body.setAttribute('data-role', currentUser.role);

  const isAdmin = currentUser.role === 'admin';

  // Role badge
  const badge = document.getElementById('role-badge');
  if (badge) {
    badge.textContent = isAdmin ? '⚙ ADMINISTRATOR' : '👤 PEGAWAI';
    badge.className = `role-badge ${isAdmin ? 'admin' : 'pegawai'}`;
  }

  // Show/hide elements
  document.querySelectorAll('.admin-only').forEach(el=>el.style.display= isAdmin ? '' : 'none');
  document.querySelectorAll('.pegawai-only').forEach(el=>el.style.display= isAdmin ? 'none' : '');

  // Admin panel & nav
  if (isAdmin) {
    document.getElementById('admin-panel').style.display = '';
    document.getElementById('nav-pegawai').style.display = '';
    document.getElementById('ic-admin-filter').style.display = '';
    document.getElementById('dok-admin-filter').style.display = '';
    // Hide form izin for admin
    const formIzin = document.getElementById('form-izincuti');
    if (formIzin) formIzin.style.display = 'none';
    const formDok = document.getElementById('form-dokumen');
    if (formDok) formDok.style.display = 'none';
    // Show admin labels
    document.querySelectorAll('.admin-only').forEach(el=>el.style.display='');
    document.querySelectorAll('.pegawai-only').forEach(el=>el.style.display='none');
    // Izin/cuti thead admin columns
    document.querySelectorAll('.th-admin-ic').forEach(el=>el.style.display='');
    document.querySelectorAll('.th-admin-dok').forEach(el=>el.style.display='');
  } else {
    document.getElementById('admin-panel').style.display = 'none';
    document.getElementById('nav-pegawai').style.display = 'none';
    document.querySelectorAll('.th-admin-ic').forEach(el=>el.style.display='none');
    document.querySelectorAll('.th-admin-dok').forEach(el=>el.style.display='none');
    // Quick panel for pegawai
    const qp = document.getElementById('quick-pegawai');
    if(qp) qp.style.display='';
  }

  loadUserUI();
  showSection('beranda');
  startClock();
  getGPS();
  populateAllFilters();
}

function doLogout() {
  if (!confirm('Yakin ingin keluar dari sistem?')) return;
  DB.del('session');
  currentUser = null;
  document.body.removeAttribute('data-role');
  document.getElementById('page-app').style.display = 'none';
  document.getElementById('page-login').classList.remove('hidden');
  document.getElementById('page-login').classList.add('active');
  document.getElementById('login-nip').value = '';
  document.getElementById('login-pw').value = '';
}

// ── LOAD USER UI ──  (called after login AND after admin edits data)
function loadUserUI() {
  const u = currentUser;
  // Re-read from DB to get latest data
  const users = DB.get('users') || [];
  const fresh = users.find(x=>x.id===u.id) || u;
  currentUser = fresh;

  document.getElementById('sidebar-name').textContent = fresh.nama.split(' ')[0];
  document.getElementById('sidebar-role').textContent  = fresh.jabatan;
  document.getElementById('sidebar-avatar').src = fresh.avatar;
  document.getElementById('welcome-name').textContent  = fresh.nama;
  document.getElementById('welcome-unit').textContent  = `• ${fresh.jabatan} | ${fresh.unit}`;
  document.getElementById('profil-name').textContent   = fresh.nama;
  document.getElementById('profil-role').textContent   = fresh.jabatan;
  document.getElementById('profil-avatar').src         = fresh.avatar;
  document.getElementById('p-nip').textContent    = fresh.nip;
  document.getElementById('p-gol').textContent    = fresh.golongan + (fresh.pangkat ? ` (${fresh.pangkat})` : '');
  document.getElementById('p-jabatan').textContent= fresh.jabatan;
  document.getElementById('p-unit').textContent   = fresh.unit;
  document.getElementById('p-email').textContent  = fresh.email;
  loadBerandaStats();
}

// ── NAVIGATION ──
const sectionTitles = {
  beranda:'Beranda', absensi:'Absensi Kehadiran', pegawai:'Data Pegawai',
  'izin-cuti':'Izin & Cuti', dokumen:'Dokumen Kegiatan',
  laporan:'Laporan Presensi', profil:'Profil Saya'
};
function showSection(name) {
  document.querySelectorAll('.section').forEach(s=>s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(b=>b.classList.remove('active'));
  const sec = document.getElementById('section-'+name);
  if (sec) sec.classList.add('active');
  document.querySelectorAll('.nav-item').forEach(b=>{
    if (b.getAttribute('onclick')&&b.getAttribute('onclick').includes(`'${name}'`)) b.classList.add('active');
  });
  document.getElementById('topbar-title').textContent = sectionTitles[name] || name;

  if (name==='absensi')   loadAbsensiPage();
  if (name==='beranda')   loadBerandaStats();
  if (name==='pegawai' && currentUser.role==='admin') { renderPegawai(); populateAllFilters(); }
  if (name==='laporan')   initLaporan();
  if (name==='izin-cuti') { renderIzinCuti(); populateAllFilters(); }
  if (name==='dokumen')   { renderDokumen();  populateAllFilters(); }
  if (window.innerWidth < 640) document.getElementById('sidebar').classList.remove('open');
}

function toggleSidebar() {
  const sb = document.getElementById('sidebar');
  if (window.innerWidth < 640) { sb.classList.toggle('open'); }
  else { sb.classList.toggle('collapsed'); document.querySelector('.main-content').classList.toggle('expanded'); }
}

// ── GPS ──
function getGPS() {
  if (!navigator.geolocation) {
    setGpsStatus('Tidak Didukung', 'red');
    document.getElementById('gps-addr').textContent = 'GPS tidak tersedia di browser ini';
    return;
  }
  setGpsStatus('Mendeteksi...', 'gray');
  navigator.geolocation.getCurrentPosition(pos=>{
    gpsLat = pos.coords.latitude; gpsLon = pos.coords.longitude;
    document.getElementById('gps-lat').textContent = `Latitude: ${gpsLat.toFixed(6)}`;
    document.getElementById('gps-lon').textContent = `Longitude: ${gpsLon.toFixed(6)}`;
    document.getElementById('gps-acc').textContent = `Akurasi: ±${Math.round(pos.coords.accuracy)} meter`;
    setGpsStatus('Terdeteksi ✓', 'green');
    fetch(`https://nominatim.openstreetmap.org/reverse?lat=${gpsLat}&lon=${gpsLon}&format=json`)
      .then(r=>r.json()).then(d=>{ document.getElementById('gps-addr').textContent=`Alamat: ${d.display_name}`; })
      .catch(()=>{ document.getElementById('gps-addr').textContent=`Koordinat: ${gpsLat.toFixed(5)}, ${gpsLon.toFixed(5)}`; });
  }, err=>{
    setGpsStatus('Gagal – Izinkan Akses', 'red');
    document.getElementById('gps-addr').textContent='Izinkan akses lokasi di browser Anda';
  }, {enableHighAccuracy:true, timeout:12000});
}
function setGpsStatus(txt, type) {
  const el = document.getElementById('gps-status');
  el.textContent = txt; el.className = `badge badge-${type}`;
}

// ── ABSENSI ──
function getTodayAbsen() {
  const all = DB.get('absensi') || [];
  return all.find(a=>a.userId===currentUser.id&&a.tanggal===todayStr()) || null;
}
function loadAbsensiPage() {
  const ab = getTodayAbsen();
  document.getElementById('abs-masuk').textContent  = (ab&&ab.masuk)  ? ab.masuk  : '--:--';
  document.getElementById('abs-siang').textContent  = (ab&&ab.siang)  ? ab.siang  : '--:--';
  document.getElementById('abs-pulang').textContent = (ab&&ab.pulang) ? ab.pulang : '--:--';
  document.getElementById('btn-masuk').disabled  = !!ab;
  document.getElementById('btn-siang').disabled  = !ab||!!ab.siang;
  document.getElementById('btn-pulang').disabled = !ab||!ab.siang||!!ab.pulang;
  renderRiwayat();
}
function doAbsen(type) {
  const all = DB.get('absensi') || [];
  const now = nowTime();
  const catatan = document.getElementById('absen-catatan').value;
  let rec = all.find(a=>a.userId===currentUser.id&&a.tanggal===todayStr());
  if (!rec) {
    rec = { id:`abs_${currentUser.id}_${todayStr()}`, userId:currentUser.id, tanggal:todayStr(),
      masuk:null, siang:null, pulang:null, status:'Hadir', catatan:'', lat:gpsLat, lon:gpsLon };
    all.push(rec);
  }
  rec[type] = now;
  if (catatan) rec.catatan = catatan;
  if (rec.masuk) {
    const [h,m] = rec.masuk.split(':').map(Number);
    rec.status = (h>8||(h===8&&m>0)) ? 'Terlambat' : 'Hadir';
  }
  DB.set('absensi', all);
  const labels={masuk:'Masuk',siang:'Jam Siang',pulang:'Pulang'};
  showMsg('absen-msg', `✅ Absen ${labels[type]} berhasil: ${now}`, 'success');
  showToast(`Absen ${labels[type]} pukul ${now}`);
  loadAbsensiPage(); loadBerandaStats();
}
function renderRiwayat() {
  const all = DB.get('absensi') || [];
  const now = new Date();
  const prefix = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const data = all.filter(a=>a.userId===currentUser.id&&a.tanggal.startsWith(prefix))
    .sort((a,b)=>b.tanggal.localeCompare(a.tanggal));
  const tb = document.getElementById('riwayat-body');
  if (!data.length) { tb.innerHTML='<tr><td colspan="6" class="empty-row">Belum ada data absensi bulan ini</td></tr>'; return; }
  tb.innerHTML = data.map(a=>`<tr>
    <td>${formatDateID(a.tanggal)}</td>
    <td class="td-time">${a.masuk||'—'}</td>
    <td class="td-time">${a.siang||'—'}</td>
    <td class="td-time">${a.pulang||'—'}</td>
    <td>${statusBadge(a.status)}</td>
  </tr>`).join('');
}

// ── BERANDA STATS ──
function loadBerandaStats() {
  const ab = getTodayAbsen();
  document.getElementById('dash-masuk').textContent  = (ab&&ab.masuk)  ? ab.masuk  : '--:--';
  document.getElementById('dash-siang').textContent  = (ab&&ab.siang)  ? ab.siang  : '--:--';
  document.getElementById('dash-pulang').textContent = (ab&&ab.pulang) ? ab.pulang : '--:--';
  const badge = document.getElementById('today-status-badge');
  if (ab) {
    badge.textContent = ab.status;
    badge.className = `badge badge-${ab.status==='Hadir'?'green':ab.status==='Terlambat'?'orange':'gray'}`;
  } else { badge.textContent='Belum Absen'; badge.className='badge badge-gray'; }

  const all = DB.get('absensi') || [];
  const now = new Date();
  const prefix = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const mine = all.filter(a=>a.userId===currentUser.id&&a.tanggal.startsWith(prefix));
  document.getElementById('stat-hadir').textContent = mine.filter(a=>a.status==='Hadir'||a.status==='Terlambat').length;
  document.getElementById('stat-alpha').textContent = mine.filter(a=>a.status==='Alpha').length;

  const ic = DB.get('izincuti') || [];
  const myIC = ic.filter(x=>x.userId===currentUser.id);
  document.getElementById('stat-cuti').textContent = myIC.filter(x=>x.jenis.startsWith('Cuti')).length;
  document.getElementById('stat-izin').textContent = myIC.filter(x=>x.jenis==='Izin').length;
}

// ═══════════════════════════════════════
//  DATA PEGAWAI  (admin)
// ═══════════════════════════════════════
function renderPegawai() {
  const users = DB.get('users') || [];
  const search = (document.getElementById('search-pegawai').value||'').toLowerCase();
  const gol    = document.getElementById('filter-golongan').value;
  const unit   = document.getElementById('filter-unit').value;
  const filtered = users.filter(u=>
    (!search||(u.nama.toLowerCase().includes(search)||u.nip.includes(search)))&&
    (!gol||u.golongan===gol)&&(!unit||u.unit===unit)
  );
  const tb = document.getElementById('pegawai-body');
  if (!filtered.length) { tb.innerHTML='<tr><td colspan="8" class="empty-row">Data tidak ditemukan</td></tr>'; return; }
  tb.innerHTML = filtered.map((u,i)=>`<tr>
    <td>${i+1}</td>
    <td><code style="font-size:.75rem;background:#f1f3f5;padding:.1rem .4rem;border-radius:4px">${u.nip}</code></td>
    <td><b>${u.nama}</b></td>
    <td><span class="badge badge-${u.golongan==='PNS'?'blue':'orange'}">${u.golongan}</span>${u.pangkat?` <small style="color:var(--text-muted)">(${u.pangkat})</small>`:''}</td>
    <td>${u.jabatan}</td><td>${u.unit}</td>
    <td><span class="badge badge-${u.status==='Aktif'?'green':'red'}">${u.status}</span></td>
    <td style="white-space:nowrap">
      <button class="btn-outline" style="padding:.28rem .65rem;font-size:.75rem" onclick="editPegawai('${u.id}')">✏️ Edit</button>
      <button onclick="hapusPegawai('${u.id}')" style="background:#ffebee;color:#b71c1c;border:none;border-radius:6px;padding:.28rem .65rem;font-size:.75rem;cursor:pointer;margin-left:.3rem">🗑</button>
    </td>
  </tr>`).join('');
}
function populateAllFilters() {
  const users = DB.get('users') || [];
  const units = [...new Set(users.map(u=>u.unit))];

  // Unit filter in pegawai table
  const uSel = document.getElementById('filter-unit');
  if (uSel) { const cur=uSel.value; uSel.innerHTML='<option value="">Semua Unit</option>'+units.map(u=>`<option value="${u}">${u}</option>`).join(''); uSel.value=cur; }

  // Laporan filter
  const lapSel = document.getElementById('lap-pegawai-filter');
  if (lapSel) lapSel.innerHTML='<option value="">Semua Pegawai</option>'+users.map(u=>`<option value="${u.id}">${u.nama}</option>`).join('');

  // Izin/cuti admin filter
  const icSel = document.getElementById('ic-filter-pegawai');
  if (icSel) icSel.innerHTML='<option value="">Semua Pegawai</option>'+users.map(u=>`<option value="${u.id}">${u.nama}</option>`).join('');

  // Dokumen admin filter
  const dSel = document.getElementById('dok-filter-pegawai');
  if (dSel) dSel.innerHTML='<option value="">Semua Pegawai</option>'+users.map(u=>`<option value="${u.id}">${u.nama}</option>`).join('');
}
function openModalPegawai() {
  document.getElementById('pegawai-id').value='';
  document.getElementById('modal-pegawai-title').textContent='Tambah Pegawai';
  ['nip','nama','jabatan','unit','email','hp','username'].forEach(f=>document.getElementById('f-'+f).value='');
  document.getElementById('f-password').value='';
  document.getElementById('f-golongan').value='PNS';
  document.getElementById('f-pangkat').value='';
  document.getElementById('f-status').value='Aktif';
  document.getElementById('f-role').value='pegawai';
  document.getElementById('modal-pegawai').classList.remove('hidden');
}
function editPegawai(id) {
  const users = DB.get('users') || [];
  const u = users.find(x=>x.id===id); if (!u) return;
  document.getElementById('pegawai-id').value = u.id;
  document.getElementById('modal-pegawai-title').textContent = 'Edit Data Pegawai';
  ['nip','nama','jabatan','unit','email','hp','username'].forEach(f=>document.getElementById('f-'+f).value=u[f]||'');
  document.getElementById('f-password').value='';
  document.getElementById('f-golongan').value=u.golongan;
  document.getElementById('f-pangkat').value=u.pangkat||'';
  document.getElementById('f-status').value=u.status;
  document.getElementById('f-role').value=u.role;
  document.getElementById('modal-pegawai').classList.remove('hidden');
}
function closeModalPegawai() { document.getElementById('modal-pegawai').classList.add('hidden'); }
function savePegawai() {
  const nip      = document.getElementById('f-nip').value.trim();
  const nama     = document.getElementById('f-nama').value.trim();
  const username = document.getElementById('f-username').value.trim();
  const jabatan  = document.getElementById('f-jabatan').value.trim();
  const unit     = document.getElementById('f-unit').value.trim();

  // ── Validasi wajib ──
  if (!nip || !nama) { showToast('⚠️ NIP dan Nama wajib diisi'); return; }
  if (!jabatan || !unit) { showToast('⚠️ Jabatan dan Unit Kerja wajib diisi'); return; }

  // ── Ambil data terbaru langsung dari localStorage ──
  const users  = DB.get('users') || [];
  const editId = document.getElementById('pegawai-id').value;
  const newPw  = document.getElementById('f-password').value;

  // ── Validasi duplikat NIP & username (kecuali diri sendiri saat edit) ──
  const dupNIP = users.find(u => u.nip === nip && u.id !== editId);
  if (dupNIP) { showToast(`⚠️ NIP ${nip} sudah digunakan oleh ${dupNIP.nama}`); return; }
  if (username) {
    const dupUser = users.find(u => u.username === username && u.id !== editId);
    if (dupUser) { showToast(`⚠️ Username "${username}" sudah digunakan`); return; }
  }

  const fields = {
    nip, nama,
    golongan: document.getElementById('f-golongan').value,
    pangkat:  document.getElementById('f-pangkat').value,
    jabatan, unit,
    email:    document.getElementById('f-email').value.trim(),
    hp:       document.getElementById('f-hp').value.trim(),
    username: username || nip,           // fallback ke NIP jika username kosong
    status:   document.getElementById('f-status').value,
    role:     document.getElementById('f-role').value,
    ...(newPw ? { password: newPw } : {})
  };

  if (editId) {
    // ════ MODE EDIT ════
    const idx = users.findIndex(u => u.id === editId);
    if (idx >= 0) {
      // Gabung data lama + data baru (pertahankan avatar & password lama jika tidak diubah)
      users[idx] = { ...users[idx], ...fields };

      // ── REAL-TIME SYNC ke localStorage ──
      DB.set('users', users);

      // ── REAL-TIME SYNC ke currentUser di memori (jika yang diedit adalah user aktif) ──
      if (editId === currentUser.id) {
        currentUser = { ...users[idx] };
        // Perbarui session agar sinkron
        DB.set('session', currentUser.id);
        // Refresh semua elemen UI yang menampilkan data user
        loadUserUI();
        showToast('✅ Data Anda berhasil diperbarui & tampilan diperbarui otomatis');
      } else {
        showToast(`✅ Data ${nama} berhasil diperbarui`);
      }
    }
  } else {
    // ════ MODE TAMBAH BARU ════
    const newId     = 'u' + Date.now();
    const password  = newPw || 'kpu123';   // password default jika tidak diisi
    // Generate warna avatar berdasarkan golongan
    const avatarBg  = fields.golongan === 'PPPK' ? '2e7d32' : '1565c0';
    const newUser   = {
      id: newId,
      ...fields,
      password,
      avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(nama)}&background=${avatarBg}&color=fff&size=80`
    };

    // ── Simpan ke localStorage (push ke array users yang sudah ada) ──
    users.push(newUser);
    DB.set('users', users);

    // ── Verifikasi: baca ulang dari localStorage untuk memastikan tersimpan ──
    const verify = (DB.get('users') || []).find(u => u.id === newId);
    if (verify) {
      showToast(`✅ Pegawai "${nama}" berhasil ditambahkan & tersimpan ke database`);
    } else {
      showToast(`⚠️ Gagal menyimpan – coba lagi`);
      return;
    }

    // ── Tampilkan ringkasan akun baru ──
    setTimeout(() => {
      showToast(`🔑 Username: ${newUser.username} | Password: ${password}`);
    }, 3000);
  }

  // ── Tutup modal & refresh semua tampilan terkait ──
  closeModalPegawai();
  renderPegawai();
  populateAllFilters();

  // ── Refresh stats beranda ──
  loadBerandaStats();
}
function hapusPegawai(id) {
  if (id === 'u1') { showToast('❌ Tidak dapat menghapus akun Administrator'); return; }
  const users = DB.get('users') || [];
  const target = users.find(u => u.id === id);
  if (!target) { showToast('❌ Data tidak ditemukan'); return; }
  if (!confirm(`Yakin ingin menghapus pegawai "${target.nama}"?\nData absensi pegawai ini juga akan tetap tersimpan.`)) return;

  // ── Hapus dari localStorage ──
  DB.set('users', users.filter(u => u.id !== id));

  // ── Verifikasi penghapusan ──
  const verify = (DB.get('users') || []).find(u => u.id === id);
  if (!verify) {
    showToast(`🗑 ${target.nama} berhasil dihapus dari database`);
  } else {
    showToast('⚠️ Gagal menghapus – coba lagi');
    return;
  }

  renderPegawai();
  populateAllFilters();
}
function showAllAbsensi() {
  const panel = document.getElementById('all-absensi-panel');
  panel.classList.toggle('hidden');
  if (!panel.classList.contains('hidden')) {
    const all = DB.get('absensi') || [];
    const users = DB.get('users') || [];
    const tb = document.getElementById('all-absensi-body');
    const recent = all.slice().sort((a,b)=>b.tanggal.localeCompare(a.tanggal)).slice(0,60);
    tb.innerHTML = recent.map(a=>{
      const u = users.find(x=>x.id===a.userId)||{};
      return `<tr>
        <td><b>${u.nama||'—'}</b></td><td>${formatDateID(a.tanggal)}</td>
        <td class="td-time">${a.masuk||'—'}</td>
        <td class="td-time">${a.siang||'—'}</td>
        <td class="td-time">${a.pulang||'—'}</td>
        <td>${statusBadge(a.status)}</td>
      </tr>`;
    }).join('');
  }
}

// ═══════════════════════════════════════
//  IZIN & CUTI
// ═══════════════════════════════════════
function handleFileSelect(inputId, displayId) {
  const inp = document.getElementById(inputId);
  const disp = document.getElementById(displayId);
  if (inp.files&&inp.files[0]) {
    const f = inp.files[0];
    disp.innerHTML = `📎 ${f.name} <small>(${(f.size/1024).toFixed(1)} KB)</small>`;
    disp.classList.remove('hidden');
  }
}

function fileToBase64(file) {
  return new Promise((res,rej)=>{
    const r = new FileReader();
    r.onload = ()=>res(r.result.split(',')[1]);
    r.onerror = ()=>rej(new Error('Gagal membaca file'));
    r.readAsDataURL(file);
  });
}

async function uploadToGDrive(gscriptUrl, filename, base64Data, mimeType) {
  if (!gscriptUrl||!gscriptUrl.trim()) return null;
  try {
    const payload = { filename, content:base64Data, mimeType, isBase64:true };
    const resp = await fetch(gscriptUrl.trim(), {
      method:'POST', body:JSON.stringify(payload),
      headers:{'Content-Type':'text/plain'}
    });
    const data = await resp.json();
    return data.fileUrl || data.url || null;
  } catch(e) {
    console.warn('GDrive upload failed:', e);
    return null;
  }
}

async function submitIzinCuti() {
  const jenis   = document.getElementById('ic-jenis').value;
  const mulai   = document.getElementById('ic-mulai').value;
  const selesai = document.getElementById('ic-selesai').value;
  const alasan  = document.getElementById('ic-alasan').value.trim();
  if (!mulai||!selesai||!alasan) { showMsg('ic-msg','⚠️ Lengkapi semua field wajib','error'); return; }
  if (selesai < mulai) { showMsg('ic-msg','⚠️ Tanggal selesai tidak boleh sebelum tanggal mulai','error'); return; }

  const gdriveUrl = document.getElementById('ic-gdrive-url').value.trim();
  const fileInp   = document.getElementById('ic-file');
  let driveUrl = null;
  let fileName = null;

  if (fileInp.files&&fileInp.files[0]) {
    const file = fileInp.files[0];
    fileName = file.name;
    showMsg('ic-msg','⏳ Mengupload dokumen...','success');
    try {
      const b64 = await fileToBase64(file);
      if (gdriveUrl) {
        driveUrl = await uploadToGDrive(gdriveUrl, `IzinCuti_${currentUser.nama.replace(/\s+/g,'_')}_${mulai}_${fileName}`, b64, file.type);
        if (driveUrl) showToast('✅ Dokumen berhasil dikirim ke Google Drive');
        else showToast('⚠️ Upload Drive gagal – data tetap tersimpan lokal');
      }
    } catch(e) { console.warn(e); }
  }

  const ic = DB.get('izincuti') || [];
  ic.push({
    id:'ic'+Date.now(), userId:currentUser.id,
    jenis, mulai, selesai, hari:diffDays(mulai,selesai),
    alasan, fileName, driveUrl,
    status:'Menunggu', tglAjuan:nowDateTime(), catatanAdmin:''
  });
  DB.set('izincuti', ic);

  // Clear form
  document.getElementById('ic-mulai').value='';
  document.getElementById('ic-selesai').value='';
  document.getElementById('ic-alasan').value='';
  document.getElementById('ic-file').value='';
  document.getElementById('ic-filename').classList.add('hidden');

  showMsg('ic-msg',`✅ Permohonan ${jenis} berhasil diajukan. Menunggu persetujuan.`,'success');
  showToast(`📅 ${jenis} berhasil diajukan`);
  renderIzinCuti();
  loadBerandaStats();
}

function renderIzinCuti() {
  const isAdmin = currentUser.role==='admin';
  const ic = DB.get('izincuti') || [];
  const users = DB.get('users') || [];

  let data = isAdmin ? [...ic] : ic.filter(x=>x.userId===currentUser.id);

  const filterP = isAdmin ? (document.getElementById('ic-filter-pegawai')?.value||'') : '';
  const filterS = isAdmin ? (document.getElementById('ic-filter-status')?.value||'') : '';
  if (filterP) data = data.filter(x=>x.userId===filterP);
  if (filterS) data = data.filter(x=>x.status===filterS);

  data.sort((a,b)=>b.tglAjuan.localeCompare(a.tglAjuan));

  const tb = document.getElementById('izincuti-body');
  if (!data.length) {
    const cols = isAdmin ? 10 : 8;
    tb.innerHTML=`<tr><td colspan="${cols}" class="empty-row">${isAdmin?'Tidak ada permohonan izin/cuti':'Belum ada pengajuan izin/cuti'}</td></tr>`;
    return;
  }

  tb.innerHTML = data.map((x,i)=>{
    const u = users.find(u=>u.id===x.userId)||{};
    const docCell = x.fileName
      ? (x.driveUrl
          ? `<a href="${x.driveUrl}" target="_blank" class="drive-chip">🔗 Drive</a>`
          : `<span class="badge badge-gray" title="${x.fileName}">📎 Lokal</span>`)
      : '—';
    const adminActions = isAdmin
      ? (x.status==='Menunggu'
          ? `<button onclick="approveIC('${x.id}','Disetujui')" class="btn-absen masuk" style="padding:.3rem .65rem;font-size:.72rem;border-radius:6px">✅ Setujui</button>
             <button onclick="approveIC('${x.id}','Ditolak')" style="background:#ffebee;color:#b71c1c;border:none;border-radius:6px;padding:.3rem .65rem;font-size:.72rem;cursor:pointer;margin-left:.3rem">❌ Tolak</button>`
          : `<span style="font-size:.78rem;color:var(--text-muted)">Sudah diproses</span>`)
      : '';
    return `<tr>
      <td>${i+1}</td>
      ${isAdmin?`<td><b>${u.nama||'—'}</b></td>`:''}
      <td><span class="badge badge-blue">${x.jenis}</span></td>
      <td>${formatDateID(x.mulai)}</td>
      <td>${formatDateID(x.selesai)}</td>
      <td><span class="durasi-chip">${x.hari} hari</span></td>
      <td style="max-width:180px;overflow:hidden;text-overflow:ellipsis" title="${x.alasan}">${x.alasan}</td>
      <td>${docCell}</td>
      <td>${statusBadge(x.status)}</td>
      ${isAdmin?`<td style="white-space:nowrap">${adminActions}</td>`:''}
    </tr>`;
  }).join('');
}

function approveIC(id, status) {
  const ic = DB.get('izincuti') || [];
  const idx = ic.findIndex(x=>x.id===id);
  if (idx>=0) { ic[idx].status=status; ic[idx].tglProses=nowDateTime(); }
  DB.set('izincuti', ic);
  renderIzinCuti();
  showToast(`${status==='Disetujui'?'✅':'❌'} Permohonan ${status.toLowerCase()}`);
}

// ═══════════════════════════════════════
//  DOKUMEN KEGIATAN
// ═══════════════════════════════════════
async function submitDokumen() {
  const judul   = document.getElementById('dok-judul').value.trim();
  const tanggal = document.getElementById('dok-tanggal').value;
  if (!judul||!tanggal) { showMsg('dok-msg','⚠️ Judul dan tanggal wajib diisi','error'); return; }

  const fileInp   = document.getElementById('dok-file');
  if (!fileInp.files||!fileInp.files[0]) { showMsg('dok-msg','⚠️ Pilih file dokumen terlebih dahulu','error'); return; }

  const file = fileInp.files[0];
  const gdriveUrl = document.getElementById('dok-gdrive-url').value.trim();
  let driveUrl = null;

  showMsg('dok-msg','⏳ Mengupload dokumen...','success');
  try {
    const b64 = await fileToBase64(file);
    if (gdriveUrl) {
      driveUrl = await uploadToGDrive(gdriveUrl, `Kegiatan_${currentUser.nama.replace(/\s+/g,'_')}_${tanggal}_${file.name}`, b64, file.type);
      if (driveUrl) showToast('✅ Dokumen berhasil dikirim ke Google Drive');
      else showToast('⚠️ Upload Drive gagal – data tetap tersimpan lokal');
    }
  } catch(e) { console.warn(e); }

  const dok = DB.get('dokumen') || [];
  dok.push({
    id:'dok'+Date.now(), userId:currentUser.id,
    judul, tanggal,
    jenis: document.getElementById('dok-jenis').value,
    ket:   document.getElementById('dok-ket').value,
    fileName: file.name, fileSize: file.size, driveUrl,
    tglUpload: nowDateTime()
  });
  DB.set('dokumen', dok);

  // Clear form
  document.getElementById('dok-judul').value='';
  document.getElementById('dok-tanggal').value='';
  document.getElementById('dok-ket').value='';
  document.getElementById('dok-file').value='';
  document.getElementById('dok-filename').classList.add('hidden');

  showMsg('dok-msg','✅ Dokumen berhasil disimpan','success');
  showToast('📁 Dokumen kegiatan berhasil diupload');
  renderDokumen();
}

function renderDokumen() {
  const isAdmin = currentUser.role==='admin';
  const dok = DB.get('dokumen') || [];
  const users = DB.get('users') || [];

  let data = isAdmin ? [...dok] : dok.filter(d=>d.userId===currentUser.id);

  const filterP = isAdmin ? (document.getElementById('dok-filter-pegawai')?.value||'') : '';
  const filterJ = isAdmin ? (document.getElementById('dok-filter-jenis')?.value||'') : '';
  if (filterP) data = data.filter(d=>d.userId===filterP);
  if (filterJ) data = data.filter(d=>d.jenis===filterJ);

  data.sort((a,b)=>b.tglUpload.localeCompare(a.tglUpload));

  const tb = document.getElementById('dokumen-body');
  const cols = isAdmin ? 9 : 8;
  if (!data.length) {
    tb.innerHTML=`<tr><td colspan="${cols}" class="empty-row">${isAdmin?'Belum ada dokumen diupload':'Belum ada dokumen yang diupload'}</td></tr>`;
    return;
  }
  tb.innerHTML = data.map((d,i)=>{
    const u = users.find(u=>u.id===d.userId)||{};
    const fileCell = d.fileName
      ? `<span style="font-size:.78rem;color:var(--text-muted)" title="${d.fileName}">📄 ${d.fileName.length>20?d.fileName.slice(0,18)+'…':d.fileName}</span>`
      : '—';
    const driveCell = d.driveUrl
      ? `<a href="${d.driveUrl}" target="_blank" class="drive-chip">🔗 Buka Drive</a>`
      : `<span style="font-size:.75rem;color:var(--text-muted)">Tidak ada</span>`;
    return `<tr>
      <td>${i+1}</td>
      ${isAdmin?`<td><b>${u.nama||'—'}</b></td>`:''}
      <td><b>${d.judul}</b></td>
      <td><span class="badge badge-blue">${d.jenis}</span></td>
      <td>${formatDateID(d.tanggal)}</td>
      <td style="font-size:.8rem;color:var(--text-muted)">${d.ket||'—'}</td>
      <td>${fileCell}</td>
      <td>${driveCell}</td>
      <td style="font-size:.75rem;color:var(--text-muted)">${d.tglUpload}</td>
    </tr>`;
  }).join('');
}

// ═══════════════════════════════════════
//  LAPORAN
// ═══════════════════════════════════════
function gpsCell(lat, lon) {
  if (!lat||!lon) return '<span style="color:var(--text-muted);font-size:.78rem">—</span>';
  const la=parseFloat(lat).toFixed(6), lo=parseFloat(lon).toFixed(6);
  return `<a href="https://www.google.com/maps?q=${la},${lo}" target="_blank" class="gps-coord-link">
    <span>📍</span> <span class="gps-num">${la}</span><span class="gps-num">${lo}</span>
  </a>`;
}
function initLaporan() {
  const now = new Date();
  document.getElementById('lap-bulan').value = now.getMonth()+1;
  const ySel = document.getElementById('lap-tahun');
  ySel.innerHTML = '';
  for(let y=now.getFullYear(); y>=now.getFullYear()-3; y--)
    ySel.innerHTML+=`<option value="${y}">${y}</option>`;
  populateAllFilters();
}
function generateLaporan() {
  const bulan    = parseInt(document.getElementById('lap-bulan').value);
  const tahun    = parseInt(document.getElementById('lap-tahun').value);
  const pegawaiId = document.getElementById('lap-pegawai-filter')?.value||'';
  const isAdmin  = currentUser.role==='admin';
  const bNames   = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
  const prefix   = `${tahun}-${String(bulan).padStart(2,'0')}`;
  const all      = DB.get('absensi')||[];
  const users    = DB.get('users')||[];

  let data = all.filter(a=>a.tanggal.startsWith(prefix));
  if (!isAdmin) data = data.filter(a=>a.userId===currentUser.id);
  else if (pegawaiId) data = data.filter(a=>a.userId===pegawaiId);
  data.sort((a,b)=>a.tanggal.localeCompare(a.tanggal)||a.userId.localeCompare(b.userId));

  document.getElementById('lap-title').textContent = isAdmin
    ? `Laporan Presensi – ${bNames[bulan-1]} ${tahun}`
    : `Presensi Saya – ${bNames[bulan-1]} ${tahun}`;

  const hadir = data.filter(a=>a.status==='Hadir'||a.status==='Terlambat').length;
  document.getElementById('lap-stats').innerHTML=`
    <div class="stat-card blue"><div class="stat-icon">📋</div><div class="stat-val">${data.length}</div><div class="stat-lbl">Total Record</div></div>
    <div class="stat-card green"><div class="stat-icon">✅</div><div class="stat-val">${hadir}</div><div class="stat-lbl">Hadir</div></div>
    <div class="stat-card orange"><div class="stat-icon">⏰</div><div class="stat-val">${data.filter(a=>a.status==='Terlambat').length}</div><div class="stat-lbl">Terlambat</div></div>
    <div class="stat-card red"><div class="stat-icon">❌</div><div class="stat-val">${data.filter(a=>a.status==='Alpha').length}</div><div class="stat-lbl">Alpha</div></div>
  `;

  const thead = document.getElementById('laporan-thead');
  if (isAdmin) {
    thead.innerHTML=`<tr><th>No</th><th>Nama</th><th>Gol.</th><th>Tanggal</th><th>Jam Masuk</th><th>Jam Siang</th><th>Jam Pulang</th><th>Durasi</th><th>Koordinat GPS</th><th>Status</th></tr>`;
  } else {
    thead.innerHTML=`<tr><th>No</th><th>Tanggal</th><th>Jam Masuk</th><th>Jam Siang</th><th>Jam Pulang</th><th>Durasi</th><th>Koordinat GPS</th><th>Status</th><th>Catatan</th></tr>`;
  }

  const tb = document.getElementById('laporan-body');
  const cols = isAdmin ? 10 : 9;
  if (!data.length) { tb.innerHTML=`<tr><td colspan="${cols}" class="empty-row">Tidak ada data untuk periode ini</td></tr>`; }
  else tb.innerHTML = data.map((a,i)=>{
    const u = users.find(u=>u.id===a.userId)||{};
    return isAdmin
      ? `<tr>
          <td>${i+1}</td><td><b>${u.nama||'—'}</b></td>
          <td><span class="badge badge-${u.golongan==='PNS'?'blue':'orange'}">${u.golongan||'—'}</span></td>
          <td>${formatDateID(a.tanggal)}</td>
          <td class="td-time">${a.masuk||'—'}</td>
          <td class="td-time">${a.siang||'—'}</td>
          <td class="td-time">${a.pulang||'—'}</td>
          <td><span class="durasi-chip">${calcDurasi(a.masuk,a.pulang)}</span></td>
          <td>${gpsCell(a.lat,a.lon)}</td><td>${statusBadge(a.status)}</td>
        </tr>`
      : `<tr>
          <td>${i+1}</td><td>${formatDateID(a.tanggal)}</td>
          <td class="td-time">${a.masuk||'—'}</td>
          <td class="td-time">${a.siang||'—'}</td>
          <td class="td-time">${a.pulang||'—'}</td>
          <td><span class="durasi-chip">${calcDurasi(a.masuk,a.pulang)}</span></td>
          <td>${gpsCell(a.lat,a.lon)}</td><td>${statusBadge(a.status)}</td>
          <td style="font-size:.78rem;color:var(--text-muted)">${a.catatan||'—'}</td>
        </tr>`;
  }).join('');

  document.getElementById('laporan-result').style.display='';
  window._laporanData = data; window._laporanUsers = users;
}
function exportCSV() {
  if (!window._laporanData) { showToast('⚠️ Generate laporan terlebih dahulu'); return; }
  const users = window._laporanUsers;
  const rows = [['No','NIP','Nama','Golongan','Pangkat','Tanggal','Jam Masuk','Jam Siang','Jam Pulang','Durasi','Latitude','Longitude','Status','Catatan']];
  window._laporanData.forEach((a,i)=>{
    const u = users.find(x=>x.id===a.userId)||{};
    rows.push([i+1,u.nip||'',u.nama||'',u.golongan||'',u.pangkat||'',
      formatDateID(a.tanggal),a.masuk||'',a.siang||'',a.pulang||'',
      calcDurasi(a.masuk,a.pulang),
      a.lat?parseFloat(a.lat).toFixed(6):'', a.lon?parseFloat(a.lon).toFixed(6):'',
      a.status,a.catatan||'']);
  });
  const csv = rows.map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8;'});
  const url  = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href=url; a.download='Laporan_Absensi_KPU.csv'; a.click();
  URL.revokeObjectURL(url);
  showToast('📥 File CSV berhasil diunduh');
}
function sendToGoogleDrive() {
  if (!window._laporanData) { showToast('⚠️ Generate laporan terlebih dahulu'); return; }
  document.getElementById('modal-gdrive').classList.remove('hidden');
}
function closeGDrive() { document.getElementById('modal-gdrive').classList.add('hidden'); }
async function kirimGDrive() {
  const url = document.getElementById('gdrive-url').value.trim();
  const filename = document.getElementById('gdrive-filename').value.trim()||'Laporan_Absensi_KPU.csv';
  if (!url) { showToast('⚠️ Masukkan URL Google Apps Script'); return; }
  const users = window._laporanUsers;
  const rows = [['No','NIP','Nama','Golongan','Pangkat','Tanggal','Jam Masuk','Jam Siang','Jam Pulang','Durasi','Latitude','Longitude','Status','Catatan']];
  window._laporanData.forEach((a,i)=>{
    const u=users.find(x=>x.id===a.userId)||{};
    rows.push([i+1,u.nip||'',u.nama||'',u.golongan||'',u.pangkat||'',
      formatDateID(a.tanggal),a.masuk||'',a.siang||'',a.pulang||'',
      calcDurasi(a.masuk,a.pulang),
      a.lat?parseFloat(a.lat).toFixed(6):'',a.lon?parseFloat(a.lon).toFixed(6):'',
      a.status,a.catatan||'']);
  });
  const csv = rows.map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
  showToast('📤 Mengirim ke Google Drive...');
  try {
    const resp = await fetch(url, {method:'POST', body:JSON.stringify({filename,content:csv,mimeType:'text/csv'}), headers:{'Content-Type':'text/plain'}});
    await resp.text();
    closeGDrive(); showToast('✅ Laporan berhasil dikirim ke Google Drive!');
  } catch(e) { showToast('❌ Gagal kirim. Periksa URL Apps Script.'); }
}

// ═══════════════════════════════════════
//  GANTI PASSWORD  (real-time sync)
// ═══════════════════════════════════════
function gantiPassword() {
  const lama   = document.getElementById('pw-lama').value;
  const baru   = document.getElementById('pw-baru').value;
  const konfirm= document.getElementById('pw-konfirm').value;
  const msg    = 'pw-msg';
  // Ambil password terbaru dari DB (bukan hanya dari memori)
  const users = DB.get('users') || [];
  const dbUser = users.find(u=>u.id===currentUser.id);
  const pwCheck = dbUser ? dbUser.password : currentUser.password;

  if (lama !== pwCheck) { showMsg(msg,'❌ Password lama tidak sesuai','error'); return; }
  if (baru.length < 6)   { showMsg(msg,'❌ Password baru minimal 6 karakter','error'); return; }
  if (baru !== konfirm)  { showMsg(msg,'❌ Konfirmasi password tidak cocok','error'); return; }

  const idx = users.findIndex(u=>u.id===currentUser.id);
  if (idx>=0) {
    users[idx].password = baru;
    // ── REAL-TIME SYNC: update currentUser di memori juga ──
    currentUser = users[idx];
  }
  DB.set('users', users);
  showMsg(msg,'✅ Password berhasil diubah. Berlaku mulai login berikutnya.','success');
  document.getElementById('pw-lama').value='';
  document.getElementById('pw-baru').value='';
  document.getElementById('pw-konfirm').value='';
  showToast('🔒 Password berhasil diperbarui');
}

// ── EMPTY ROW STYLE inline ──
const style=document.createElement('style');
style.textContent='.empty-row{text-align:center;padding:2rem;color:var(--text-muted);font-style:italic}';
document.head.appendChild(style);

// ── INIT ──
initDB();
checkSession();
