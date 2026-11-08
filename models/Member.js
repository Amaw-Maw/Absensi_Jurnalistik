const mongoose = require('mongoose');

const memberSchema = new mongoose.Schema({
  idPers: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    uppercase: true
  },
  nama: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    trim: true,
    lowercase: true,
    default: ''
  },
  noHp: {
    type: String,
    trim: true,
    default: ''
  },
  divisi: {
    type: String,
    required: true,
    enum: ['Pembina', 'Anggota Kelas 7', 'Anggota Kelas 8'],
    default: 'Anggota Kelas 7'
  },
  jabatan: {
    type: String,
    default: 'Anggota Redaksi'
  },
  instansi: {
    type: String,
    default: 'Lembaga Pers Jurnalistik'
  },
  qrCodeToken: {
    type: String,
    required: true,
    unique: true
  },
  statusAktif: {
    type: Boolean,
    default: true
  },
  fotoUrl: {
    type: String,
    default: ''
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Member', memberSchema);
