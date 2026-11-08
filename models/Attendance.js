const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema({
  sessionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Session',
    required: true
  },
  memberId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Member',
    required: true
  },
  waktuPresensi: {
    type: Date,
    default: Date.now
  },
  status: {
    type: String,
    enum: ['Hadir Tepat Waktu', 'Terlambat', 'Izin', 'Sakit', 'Tugas Khusus'],
    default: 'Hadir Tepat Waktu'
  },
  metode: {
    type: String,
    enum: ['Scan QR Sesi', 'Scan ID Card', 'Manual Input'],
    default: 'Scan QR Sesi'
  },
  catatanLiputan: {
    type: String,
    default: ''
  },
  judulBerita: {
    type: String,
    default: ''
  }
}, {
  timestamps: true
});

// 1 jurnalis hanya bisa absen 1 kali per sesi
attendanceSchema.index({ sessionId: 1, memberId: 1 }, { unique: true });

module.exports = mongoose.model('Attendance', attendanceSchema);

