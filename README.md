# Clippersku · HihuClip

Aplikasi lokal untuk mengubah podcast, wawancara, atau VOD menjadi klip vertikal 9:16 dengan subtitle dan watermark **@HihuClip**. Dikembangkan dari [mutonby/openshorts](https://github.com/mutonby/openshorts).

## Instalasi dan cara menjalankan

Pastikan Docker dan Docker Compose sudah aktif. Di Windows, gunakan Docker Desktop dengan backend WSL 2.

```sh
git clone https://github.com/riofach/clippersku.git
cd clippersku
docker compose up -d --build
```

Buka [Clip Generator](http://localhost:5175/#app). Build pertama mengunduh dependensi. Untuk menyalakan lagi setelah dihentikan, cukup jalankan `docker compose up -d`.

## Cara membuat klip

1. Di **Settings → Gemini API Key**, masukkan key dari [Google AI Studio](https://aistudio.google.com/app/apikey).
2. Buka **Clip Generator**. Unggah file sendiri atau tempel URL YouTube yang boleh kamu proses.
3. Pilih **9:16** dan layout di **Advanced options**. Pakai **Two speakers stacked** untuk podcast dua orang, **Podcast · 3–4 people (2×2)** untuk lebih banyak pembicara, atau **Gaming · 60% gameplay / 40% facecam** untuk VOD dengan facecam.
4. Isi **Clips to aim for** untuk menentukan target jumlah klip, lalu klik **Generate Clips**.
5. Jika crop perlu dikoreksi, buka **Reframing** pada klip dan klik **Apply reframing** setelah selesai. **Download All** mengemas MP4, judul YouTube, dan caption TikTok/Instagram.

Gemini memilih momen dan menulis hook. Transkripsi, framing, dan render berjalan di perangkatmu. Upload-Post hanya diperlukan untuk publikasi langsung dari aplikasi.

## GPU NVIDIA (opsional)

Perintah instalasi biasa memakai CPU dan bisa dijalankan di perangkat tanpa GPU. Jika Docker sudah bisa mengakses GPU NVIDIA, gunakan konfigurasi tambahan ini untuk mempercepat Whisper:

```sh
docker compose -f docker-compose.yml -f docker-compose.cuda.yml up -d --build
```

Jika Whisper mengalami kegagalan CUDA saat memproses, aplikasi mencoba ulang transkripsi di CPU. Untuk menghentikan OpenShorts, jalankan `docker compose stop`.

## Sumber dan lisensi

Clippersku adalah turunan self-hosted dari [OpenShorts oleh mutonby](https://github.com/mutonby/openshorts). Aplikasi inti memakai [lisensi MIT](LICENSE). Direktori [`cloud/`](cloud/LICENSE) memiliki lisensi terpisah.
