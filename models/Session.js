const mongoose = require('mongoose');

const sessionSchema = new mongoose.Schema({
  kodeSesi: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true
  },
  judul: {
    type: String,
    required: true,
    trim: true
  },
  kategori: {
    type: String,
    required: true,
    enum: ['Rapat Redaksi', 'Liputan Lapangan', 'Pelatihan / Workshop', 'Penyuntingan & Layout', 'Kunjungan Media', 'Lainnya'],
    default: 'Rapat Redaksi'
  },
  deskripsi: {
    type: String,
    default: ''
  },
  lokasi: {
    type: String,
    default: 'Ruang Redaksi'
  },
  tanggal: {
    type: String, // YYYY-MM-DD
    required: true
  },
  jamMulai: {
    type: String, // HH:mm
    required: true
  },
  jamSelesai: {
    type: String, // HH:mm
    required: true
  },
  qrCodeToken: {
    type: String,
    required: true,
    unique: true
  },
  status: {
    type: String,
    enum: ['Aktif', 'Selesai', 'Dibatalkan'],
    default: 'Aktif'
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Session', sessionSchema);
