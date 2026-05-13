# Sistem Kas Kelas

Aplikasi React lengkap untuk mengelola sistem kas kelas dengan tema warna pink.

## Fitur Tambahan

- **Hari Libur**: Tandai hari libur per minggu, sehingga tidak dihitung dalam kontribusi.
- **Status Anggota**: Setiap anggota menampilkan status "Lunas" atau "Belum Lunas - Rp X" berdasarkan pembayaran.

## Cara Menjalankan

1. Install dependencies: `npm install`
2. Jalankan dev server: `npm run dev`
3. Buka http://localhost:5173

## Setup Supabase

1. Buat project di Supabase.
2. Buka SQL Editor, lalu jalankan isi file `supabase-schema.sql`.
3. Salin `.env.example` menjadi `.env.local`.
4. Isi:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
5. Jalankan ulang dev server.

Jika env Supabase belum diisi, aplikasi tetap berjalan dengan `localStorage`.

## Build

`npm run build`
