const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

const Member = require('./models/Member');
const Session = require('./models/Session');
const Attendance = require('./models/Attendance');

const app = express();
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/absensi_jurnalistik';

// Middleware
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// In-Memory Fallback Storage jika MongoDB belum aktif
let isMongoConnected = false;
let memoryStore = {
  members: [
    {
      _id: 'm1',
      idPers: 'JRN-001',
      nama: 'Ustadz Ahmad Fauzi',
      email: 'pembina@pers-jurnalistik.org',
      noHp: '081234567801',
      divisi: 'Pembina',
      jabatan: 'Pembina Ekstra Jurnalistik',
      instansi: 'MTs Al Machmudi',
      qrCodeToken: 'PERS_JRN-001_FAUZI',
      statusAktif: true,
      createdAt: new Date().toISOString()
    },
    {
      _id: 'm2',
      idPers: 'JRN-002',
      nama: 'Annisa Larasati',
      email: 'annisa@pers-jurnalistik.org',
      noHp: '081234567802',
      divisi: 'Anggota Kelas 8',
      jabatan: 'Ketua Redaksi (Kelas 8)',
      instansi: 'MTs Al Machmudi',
      qrCodeToken: 'PERS_JRN-002_ANNISA',
      statusAktif: true,
      createdAt: new Date().toISOString()
    },
    {
      _id: 'm3',
      idPers: 'JRN-003',
      nama: 'Bagas Wicaksono',
      email: 'bagas@pers-jurnalistik.org',
      noHp: '081234567803',
      divisi: 'Anggota Kelas 7',
      jabatan: 'Anggota Baru (Kelas 7)',
      instansi: 'MTs Al Machmudi',
      qrCodeToken: 'PERS_JRN-003_BAGAS',
      statusAktif: true,
      createdAt: new Date().toISOString()
    }
  ],
  sessions: [
    {
      _id: 's1',
      kodeSesi: 'SESI-JRN-2026-01',
      judul: 'Rapat Proyeksi Liputan Khusus Edisi Tahunan',
      kategori: 'Rapat Redaksi',
      deskripsi: 'Penetapan topik utama headline, pembagian pos liputan, dan deadline rubrik.',
      lokasi: 'Ruang Multimedia & Redaksi Pers',
      tanggal: new Date().toISOString().split('T')[0],
      jamMulai: '09:00',
      jamSelesai: '17:00',
      qrCodeToken: 'SESI_TOKEN_SESI-JRN-2026-01',
      status: 'Aktif',
      createdAt: new Date().toISOString()
    }
  ],
  attendances: []
};

// Seed default data if MongoDB is empty
async function seedMongoDefaultData() {
  try {
    const memberCount = await Member.countDocuments();
    if (memberCount === 0) {
      console.log('Menyiapkan data awal jurnalis ke MongoDB...');
      await Member.insertMany(memoryStore.members.map(m => {
        const { _id, ...rest } = m;
        return rest;
      }));
    }

    const sessionCount = await Session.countDocuments();
    if (sessionCount === 0) {
      console.log('Menyiapkan data sesi awal ke MongoDB...');
      await Session.insertMany(memoryStore.sessions.map(s => {
        const { _id, ...rest } = s;
        return rest;
      }));
    }
  } catch (err) {
    console.warn('Peringatan seed MongoDB:', err.message);
  }
}

// Koneksi ke MongoDB
console.log(`Menghubungkan ke MongoDB (${MONGODB_URI})...`);
mongoose.connect(MONGODB_URI, {
  serverSelectionTimeoutMS: 4000
})
.then(async () => {
  isMongoConnected = true;
  console.log('✓ Berhasil terhubung ke MongoDB Database!');
  await seedMongoDefaultData();
})
.catch((err) => {
  isMongoConnected = false;
  console.warn('! MongoDB belum aktif / tidak dapat dijangkau:', err.message);
  console.log('ℹ Sistem beralih otomatis ke In-Memory Storage sementara agar aplikasi tetap dapat berjalan!');
  console.log('  (Silakan jalankan mongod di komputer atau gunakan MongoDB Atlas di .env untuk persistensi permanen)');
});

// ======================== API ROUTES ======================== //

// 0. Status Koneksi & Database
app.get('/api/status', (req, res) => {
  res.json({
    appName: 'Sistem Absensi Jurnalistik QR Code',
    version: '1.0.0',
    database: isMongoConnected ? 'MongoDB (Connected)' : 'In-Memory Fallback (Offline MongoDB)',
    mongoConnected: isMongoConnected,
    serverTime: new Date()
  });
});

// 1. Data Anggota Jurnalis (Members)
app.get('/api/members', async (req, res) => {
  try {
    if (isMongoConnected) {
      const members = await Member.find().sort({ createdAt: -1 });
      return res.json({ success: true, data: members, source: 'mongodb' });
    }
    return res.json({ success: true, data: memoryStore.members, source: 'memory' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/members', async (req, res) => {
  try {
    const { idPers, nama, email, noHp, divisi, jabatan, instansi } = req.body;
    if (!idPers || !nama || !divisi) {
      return res.status(400).json({ success: false, message: 'ID Pers, Nama, dan Divisi wajib diisi!' });
    }

    const cleanIdPers = idPers.toUpperCase().trim();
    const qrCodeToken = `PERS_${cleanIdPers}_${Date.now()}`;

    if (isMongoConnected) {
      const existing = await Member.findOne({ idPers: cleanIdPers });
      if (existing) {
        return res.status(400).json({ success: false, message: 'ID Pers sudah terdaftar!' });
      }
      const newMember = await Member.create({
        idPers: cleanIdPers,
        nama,
        email: email || '',
        noHp: noHp || '',
        divisi,
        jabatan: jabatan || 'Anggota Redaksi',
        instansi: instansi || 'Lembaga Pers Jurnalistik',
        qrCodeToken
      });
      return res.status(201).json({ success: true, data: newMember, message: 'Jurnalis berhasil ditambahkan!' });
    }

    // Memory Fallback
    const existingMem = memoryStore.members.find(m => m.idPers === cleanIdPers);
    if (existingMem) {
      return res.status(400).json({ success: false, message: 'ID Pers sudah terdaftar!' });
    }

    const newMem = {
      _id: 'm_' + Date.now(),
      idPers: cleanIdPers,
      nama,
      email: email || '',
      noHp: noHp || '',
      divisi,
      jabatan: jabatan || 'Anggota Redaksi',
      instansi: instansi || 'Lembaga Pers Jurnalistik',
      qrCodeToken,
      statusAktif: true,
      createdAt: new Date().toISOString()
    };
    memoryStore.members.unshift(newMem);
    return res.status(201).json({ success: true, data: newMem, message: 'Jurnalis berhasil ditambahkan!' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.delete('/api/members/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (isMongoConnected) {
      await Member.findByIdAndDelete(id);
      return res.json({ success: true, message: 'Data jurnalis berhasil dihapus' });
    }
    memoryStore.members = memoryStore.members.filter(m => m._id !== id);
    res.json({ success: true, message: 'Data jurnalis berhasil dihapus' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 2. Data Sesi Kegiatan (Sessions)
app.get('/api/sessions', async (req, res) => {
  try {
    if (isMongoConnected) {
      const sessions = await Session.find().sort({ createdAt: -1 });
      return res.json({ success: true, data: sessions, source: 'mongodb' });
    }
    return res.json({ success: true, data: memoryStore.sessions, source: 'memory' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/sessions', async (req, res) => {
  try {
    const { judul, kategori, deskripsi, lokasi, tanggal, jamMulai, jamSelesai } = req.body;
    if (!judul || !tanggal || !jamMulai || !jamSelesai) {
      return res.status(400).json({ success: false, message: 'Judul, Tanggal, Jam Mulai & Selesai wajib diisi!' });
    }

    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const kodeSesi = `SESI-JRN-${tanggal.replace(/-/g, '')}-${randomSuffix}`;
    const qrCodeToken = `SESI_TOKEN_${kodeSesi}`;

    if (isMongoConnected) {
      const newSession = await Session.create({
        kodeSesi,
        judul,
        kategori: kategori || 'Rapat Redaksi',
        deskripsi: deskripsi || '',
        lokasi: lokasi || 'Ruang Redaksi',
        tanggal,
        jamMulai,
        jamSelesai,
        qrCodeToken,
        status: 'Aktif'
      });
      return res.status(201).json({ success: true, data: newSession, message: 'Sesi absensi baru berhasil dibuka!' });
    }

    const newSess = {
      _id: 's_' + Date.now(),
      kodeSesi,
      judul,
      kategori: kategori || 'Rapat Redaksi',
      deskripsi: deskripsi || '',
      lokasi: lokasi || 'Ruang Redaksi',
      tanggal,
      jamMulai,
      jamSelesai,
      qrCodeToken,
      status: 'Aktif',
      createdAt: new Date().toISOString()
    };
    memoryStore.sessions.unshift(newSess);
    return res.status(201).json({ success: true, data: newSess, message: 'Sesi absensi baru berhasil dibuka!' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.put('/api/sessions/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body; // 'Aktif', 'Selesai', 'Dibatalkan'

    if (isMongoConnected) {
      const updated = await Session.findByIdAndUpdate(id, { status }, { new: true });
      return res.json({ success: true, data: updated, message: `Status sesi diubah menjadi ${status}` });
    }

    const session = memoryStore.sessions.find(s => s._id === id);
    if (session) {
      session.status = status;
      return res.json({ success: true, data: session, message: `Status sesi diubah menjadi ${status}` });
    }
    res.status(404).json({ success: false, message: 'Sesi tidak ditemukan' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 3. Presensi & Scanning QR Code
// Scan QR code logic: bisa scan QR Code Sesi Kegiatan oleh Anggota, ATAU scan ID Card Anggota oleh Petugas
app.post('/api/attendances/scan', async (req, res) => {
  try {
    const { qrData, sessionId, memberId, catatanLiputan, judulBerita } = req.body;

    if (!qrData) {
      return res.status(400).json({ success: false, message: 'Data QR Code tidak terdeteksi!' });
    }

    let detectedMember = null;
    let targetSession = null;
    let scanMethod = 'Scan QR Sesi';

    if (isMongoConnected) {
      // Skenario A: Yang di-scan adalah ID Card Jurnalis (PERS_...)
      if (qrData.startsWith('PERS_') || qrData.startsWith('JRN-')) {
        scanMethod = 'Scan ID Card';
        detectedMember = await Member.findOne({
          $or: [{ qrCodeToken: qrData }, { idPers: qrData }]
        });

        if (!detectedMember) {
          return res.status(404).json({ success: false, message: 'ID Card Jurnalis tidak terdaftar dalam sistem!' });
        }

        if (sessionId) {
          targetSession = await Session.findById(sessionId);
        } else {
          // Cari sesi aktif saat ini
          targetSession = await Session.findOne({ status: 'Aktif' }).sort({ createdAt: -1 });
        }
      }
      // Skenario B: Yang di-scan adalah QR Sesi Kegiatan (SESI_TOKEN_...)
      else if (qrData.startsWith('SESI_TOKEN_') || qrData.startsWith('SESI-JRN-')) {
        scanMethod = 'Scan QR Sesi';
        targetSession = await Session.findOne({
          $or: [{ qrCodeToken: qrData }, { kodeSesi: qrData }]
        });

        if (!targetSession) {
          return res.status(404).json({ success: false, message: 'QR Code Sesi Kegiatan tidak valid atau kadaluarsa!' });
        }

        if (!memberId) {
          return res.status(400).json({ success: false, message: 'Pilih profil jurnalis Anda untuk memvalidasi absensi!' });
        }

        detectedMember = await Member.findById(memberId);
      } else {
        // Fallback coba cocokkan ke ID Pers atau Token Member
        detectedMember = await Member.findOne({
          $or: [{ qrCodeToken: qrData }, { idPers: qrData.trim().toUpperCase() }]
        });

        if (detectedMember) {
          scanMethod = 'Scan ID Card';
          targetSession = sessionId ? await Session.findById(sessionId) : await Session.findOne({ status: 'Aktif' }).sort({ createdAt: -1 });
        } else {
          return res.status(400).json({ success: false, message: 'Format QR Code tidak dikenali oleh sistem presensi jurnalistik!' });
        }
      }

      if (!targetSession) {
        return res.status(400).json({ success: false, message: 'Tidak ada sesi kegiatan aktif untuk absensi ini!' });
      }

      if (targetSession.status !== 'Aktif') {
        return res.status(400).json({ success: false, message: `Sesi '${targetSession.judul}' sudah berstatus: ${targetSession.status}` });
      }

      // Periksa apakah sudah pernah absen di sesi ini
      const alreadyAttended = await Attendance.findOne({
        sessionId: targetSession._id,
        memberId: detectedMember._id
      });

      if (alreadyAttended) {
        return res.status(400).json({
          success: false,
          message: `Jurnalis ${detectedMember.nama} (${detectedMember.idPers}) sudah melakukan presensi pada sesi ini!`,
          attendedAt: alreadyAttended.waktuPresensi
        });
      }

      // Tentukan status ketepatan waktu
      const now = new Date();
      const [sh, sm] = (targetSession.jamMulai || '09:00').split(':').map(Number);
      const sessionStartTime = new Date();
      sessionStartTime.setHours(sh, sm, 0, 0);

      // Toleransi 15 menit
      let attendanceStatus = 'Hadir Tepat Waktu';
      const toleranceMs = 15 * 60 * 1000;
      if (now.getTime() > (sessionStartTime.getTime() + toleranceMs)) {
        attendanceStatus = 'Terlambat';
      }

      const attendanceRecord = await Attendance.create({
        sessionId: targetSession._id,
        memberId: detectedMember._id,
        waktuPresensi: now,
        status: attendanceStatus,
        metode: scanMethod,
        catatanLiputan: catatanLiputan || '',
        judulBerita: judulBerita || ''
      });

      const populated = await Attendance.findById(attendanceRecord._id)
        .populate('memberId')
        .populate('sessionId');

      return res.status(201).json({
        success: true,
        message: `Presensi Berhasil: ${detectedMember.nama} (${attendanceStatus})`,
        data: populated
      });
    }

    // ================= Memory Store Fallback ================= //
    if (qrData.startsWith('PERS_') || qrData.startsWith('JRN-')) {
      scanMethod = 'Scan ID Card';
      detectedMember = memoryStore.members.find(m => m.qrCodeToken === qrData || m.idPers === qrData);
      if (!detectedMember) {
        return res.status(404).json({ success: false, message: 'ID Card Jurnalis tidak terdaftar dalam sistem!' });
      }
      targetSession = sessionId ? memoryStore.sessions.find(s => s._id === sessionId) : memoryStore.sessions.find(s => s.status === 'Aktif');
    } else if (qrData.startsWith('SESI_TOKEN_') || qrData.startsWith('SESI-JRN-')) {
      scanMethod = 'Scan QR Sesi';
      targetSession = memoryStore.sessions.find(s => s.qrCodeToken === qrData || s.kodeSesi === qrData);
      if (!targetSession) {
        return res.status(404).json({ success: false, message: 'QR Code Sesi Kegiatan tidak valid atau kadaluarsa!' });
      }
      if (!memberId) {
        return res.status(400).json({ success: false, message: 'Pilih profil jurnalis Anda untuk memvalidasi absensi!' });
      }
      detectedMember = memoryStore.members.find(m => m._id === memberId);
    } else {
      detectedMember = memoryStore.members.find(m => m.qrCodeToken === qrData || m.idPers === qrData.trim().toUpperCase());
      if (detectedMember) {
        scanMethod = 'Scan ID Card';
        targetSession = sessionId ? memoryStore.sessions.find(s => s._id === sessionId) : memoryStore.sessions.find(s => s.status === 'Aktif');
      } else {
        return res.status(400).json({ success: false, message: 'Format QR Code tidak dikenali oleh sistem presensi jurnalistik!' });
      }
    }

    if (!targetSession) {
      return res.status(400).json({ success: false, message: 'Tidak ada sesi kegiatan aktif untuk absensi ini!' });
    }

    const alreadyAttended = memoryStore.attendances.find(
      a => (a.sessionId === targetSession._id || (a.sessionId && a.sessionId._id === targetSession._id)) &&
           (a.memberId === detectedMember._id || (a.memberId && a.memberId._id === detectedMember._id))
    );

    if (alreadyAttended) {
      return res.status(400).json({
        success: false,
        message: `Jurnalis ${detectedMember.nama} (${detectedMember.idPers}) sudah melakukan presensi sebelumnya!`,
        attendedAt: alreadyAttended.waktuPresensi
      });
    }

    const now = new Date();
    const [sh, sm] = (targetSession.jamMulai || '09:00').split(':').map(Number);
    const sessionStartTime = new Date();
    sessionStartTime.setHours(sh, sm, 0, 0);

    let attendanceStatus = 'Hadir Tepat Waktu';
    const toleranceMs = 15 * 60 * 1000;
    if (now.getTime() > (sessionStartTime.getTime() + toleranceMs)) {
      attendanceStatus = 'Terlambat';
    }

    const newRecord = {
      _id: 'att_' + Date.now(),
      sessionId: targetSession,
      memberId: detectedMember,
      waktuPresensi: now,
      status: attendanceStatus,
      metode: scanMethod,
      catatanLiputan: catatanLiputan || '',
      judulBerita: judulBerita || ''
    };

    memoryStore.attendances.unshift(newRecord);
    return res.status(201).json({
      success: true,
      message: `Presensi Berhasil: ${detectedMember.nama} (${attendanceStatus})`,
      data: newRecord
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 4. Presensi Manual (Izin / Sakit / Hadir)
app.post('/api/attendances/manual', async (req, res) => {
  try {
    const { sessionId, memberId, status, catatanLiputan, judulBerita } = req.body;
    if (!sessionId || !memberId || !status) {
      return res.status(400).json({ success: false, message: 'Sesi, Anggota Jurnalis, dan Status kehadiran wajib diisi!' });
    }

    if (isMongoConnected) {
      const existing = await Attendance.findOne({ sessionId, memberId });
      if (existing) {
        return res.status(400).json({ success: false, message: 'Jurnalis ini sudah memiliki catatan absensi pada sesi ini!' });
      }

      const record = await Attendance.create({
        sessionId,
        memberId,
        waktuPresensi: new Date(),
        status,
        metode: 'Manual Input',
        catatanLiputan: catatanLiputan || '',
        judulBerita: judulBerita || ''
      });

      const populated = await Attendance.findById(record._id)
        .populate('memberId')
        .populate('sessionId');

      return res.status(201).json({ success: true, message: 'Status presensi manual berhasil disimpan', data: populated });
    }

    const member = memoryStore.members.find(m => m._id === memberId);
    const session = memoryStore.sessions.find(s => s._id === sessionId);

    if (!member || !session) {
      return res.status(404).json({ success: false, message: 'Sesi atau Anggota tidak ditemukan' });
    }

    const existingMem = memoryStore.attendances.find(a => 
      (a.sessionId._id === sessionId || a.sessionId === sessionId) &&
      (a.memberId._id === memberId || a.memberId === memberId)
    );

    if (existingMem) {
      return res.status(400).json({ success: false, message: 'Jurnalis ini sudah memiliki catatan absensi pada sesi ini!' });
    }

    const newRecord = {
      _id: 'att_' + Date.now(),
      sessionId: session,
      memberId: member,
      waktuPresensi: new Date(),
      status,
      metode: 'Manual Input',
      catatanLiputan: catatanLiputan || '',
      judulBerita: judulBerita || ''
    };

    memoryStore.attendances.unshift(newRecord);
    return res.status(201).json({ success: true, message: 'Status presensi manual berhasil disimpan', data: newRecord });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 5. Riwayat Kehadiran (List Attendances)
app.get('/api/attendances', async (req, res) => {
  try {
    const { sessionId } = req.query;

    if (isMongoConnected) {
      const query = sessionId ? { sessionId } : {};
      const list = await Attendance.find(query)
        .populate('memberId')
        .populate('sessionId')
        .sort({ waktuPresensi: -1 });

      return res.json({ success: true, data: list, source: 'mongodb' });
    }

    let list = memoryStore.attendances;
    if (sessionId) {
      list = list.filter(a => a.sessionId._id === sessionId || a.sessionId === sessionId);
    }
    res.json({ success: true, data: list, source: 'memory' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 6. Ringkasan Statistik
app.get('/api/stats', async (req, res) => {
  try {
    let totalMembers = 0;
    let totalSessions = 0;
    let totalAttendances = 0;
    let hadirCount = 0;
    let izinCount = 0;
    let sakitCount = 0;
    let terlambatCount = 0;

    if (isMongoConnected) {
      totalMembers = await Member.countDocuments({ statusAktif: true });
      totalSessions = await Session.countDocuments();
      totalAttendances = await Attendance.countDocuments();
      hadirCount = await Attendance.countDocuments({ status: 'Hadir Tepat Waktu' });
      terlambatCount = await Attendance.countDocuments({ status: 'Terlambat' });
      izinCount = await Attendance.countDocuments({ status: 'Izin' });
      sakitCount = await Attendance.countDocuments({ status: 'Sakit' });
    } else {
      totalMembers = memoryStore.members.length;
      totalSessions = memoryStore.sessions.length;
      totalAttendances = memoryStore.attendances.length;
      hadirCount = memoryStore.attendances.filter(a => a.status === 'Hadir Tepat Waktu').length;
      terlambatCount = memoryStore.attendances.filter(a => a.status === 'Terlambat').length;
      izinCount = memoryStore.attendances.filter(a => a.status === 'Izin').length;
      sakitCount = memoryStore.attendances.filter(a => a.status === 'Sakit').length;
    }

    res.json({
      success: true,
      data: {
        totalMembers,
        totalSessions,
        totalAttendances,
        hadirCount,
        terlambatCount,
        izinCount,
        sakitCount,
        database: isMongoConnected ? 'MongoDB' : 'In-Memory (Siap Sambung MongoDB)'
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Handle 404 for API routes so it never returns HTML to fetch()
app.all('/api/*', (req, res) => {
  res.status(404).json({ success: false, message: `Endpoint API ${req.method} ${req.originalUrl} tidak ditemukan.` });
});

// Serve Single Page Application fallback for web navigation
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start Server
app.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`🚀 Sistem Absensi Jurnalistik siap digunakan!`);
  console.log(`📡 URL Lokal : http://localhost:${PORT}`);
  console.log(`💾 Database  : ${isMongoConnected ? 'MongoDB Connected' : 'In-Memory Cache (MongoDB Ready)'}`);
  console.log(`======================================================\n`);
});

