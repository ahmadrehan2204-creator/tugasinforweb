(function() {
  // ================= KONFIGURASI =================
  // Koordinat SMAN 4 SIDOARJO (target tujuan)
  const TARGET_LAT = -7.4569;
  const TARGET_LNG = 112.7188;
  const TARGET_NAME = 'SMAN 4 Sidoarjo';

  // State
  let orders = [];
  let orderCounter = 0;
  let userLat = null;
  let userLng = null;
  let currentDistance = null;
  let map = null;
  let userMarker = null;
  let targetMarker = null;
  let routeLine = null;

  // ================= DOM ELEMENTS =================
  const orderList = document.getElementById('orderList');
  const jumlahPesanan = document.getElementById('jumlahPesanan');
  const btnTambah = document.getElementById('btnTambah');
  const btnReset = document.getElementById('btnReset');
  const btnProses = document.getElementById('btnProses');
  const resultContent = document.getElementById('resultContent');
  const toast = document.getElementById('toast');
  const toastMsg = document.getElementById('toastMsg');
  const loadingOverlay = document.getElementById('loadingOverlay');
  const loadingText = document.getElementById('loadingText');

  // Inputs
  const jenisRadios = document.getElementsByName('jenis');
  const volumeSelect = document.getElementById('volume');
  const lokasiSelect = document.getElementById('lokasi');
  const namaPenerimaInput = document.getElementById('namaPenerima');
  const noTelpInput = document.getElementById('noTelp');
  const provinsiSelect = document.getElementById('provinsi');
  const kabupatenInput = document.getElementById('kabupaten');
  const kecamatanInput = document.getElementById('kecamatan');
  const kodePosInput = document.getElementById('kodePos');
  const blokRumahInput = document.getElementById('blokRumah');
  const lokasiAktifInput = document.getElementById('lokasiAktif');
  const btnDeteksi = document.getElementById('btnDeteksi');
  const mapInfoText = document.getElementById('mapInfoText');
  const jarakInfo = document.getElementById('jarakInfo');
  const jarakKeSekolah = document.getElementById('jarakKeSekolah');

  // ================= HELPERS =================
  function showToast(msg, icon = 'fa-check-circle') {
    toastMsg.textContent = msg;
    toast.querySelector('i').className = `fas ${icon}`;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
  }

  function showLoading(text = 'Menghitung jarak & mengoptimasi rute...') {
    loadingText.textContent = text;
    loadingOverlay.classList.add('active');
  }

  function hideLoading() {
    loadingOverlay.classList.remove('active');
  }

  function getJenis() {
    for (let r of jenisRadios) if (r.checked) return r.value;
    return 'es';
  }

  // ================= HITUNG JARAK (Haversine) =================
  function hitungJarak(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLng/2) * Math.sin(dLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

  // ================= MAP INITIALIZATION =================
  function initMap() {
    map = L.map('map').setView([TARGET_LAT, TARGET_LNG], 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap',
      maxZoom: 19
    }).addTo(map);

    // Marker target (SMAN 4 Sidoarjo)
    targetMarker = L.marker([TARGET_LAT, TARGET_LNG], {
      icon: L.divIcon({
        className: 'custom-target-marker',
        html: '<div style="background:#dc2626; width:36px; height:36px; border-radius:50%; display:flex; align-items:center; justify-content:center; border:3px solid white; box-shadow:0 3px 10px rgba(0,0,0,0.4); font-size:18px;">🏫</div>',
        iconSize: [36, 36],
        iconAnchor: [18, 18]
      })
    }).addTo(map);
    targetMarker.bindPopup(`<strong>${TARGET_NAME}</strong><br>Target Pengiriman`);

    // Klik peta untuk set lokasi user
    map.on('click', function(e) {
      setUserLocation(e.latlng.lat, e.latlng.lng, 'Lokasi dipilih manual dari peta');
    });
  }

  // ================= SET USER LOCATION =================
  function setUserLocation(lat, lng, sourceText = '') {
    userLat = lat;
    userLng = lng;

    lokasiAktifInput.value = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;

    if (userMarker) map.removeLayer(userMarker);
    userMarker = L.marker([lat, lng], {
      icon: L.divIcon({
        className: 'custom-user-marker',
        html: '<div style="background:#10b981; width:32px; height:32px; border-radius:50%; display:flex; align-items:center; justify-content:center; border:3px solid white; box-shadow:0 3px 10px rgba(0,0,0,0.4); font-size:16px;">📍</div>',
        iconSize: [32, 32],
        iconAnchor: [16, 16]
      })
    }).addTo(map);
    userMarker.bindPopup('<strong>Lokasi Anda</strong><br>' + (sourceText || 'Titik terpilih')).openPopup();

    if (routeLine) map.removeLayer(routeLine);
    routeLine = L.polyline([[lat, lng], [TARGET_LAT, TARGET_LNG]], {
      color: '#10b981',
      weight: 4,
      opacity: 0.7,
      dashArray: '10, 10'
    }).addTo(map);

    map.fitBounds([[lat, lng], [TARGET_LAT, TARGET_LNG]], { padding: [50, 50] });

    currentDistance = hitungJarak(lat, lng, TARGET_LAT, TARGET_LNG);

    mapInfoText.innerHTML = `📍 Lokasi terdeteksi: <strong>${lat.toFixed(4)}, ${lng.toFixed(4)}</strong>`;
    jarakInfo.style.display = 'flex';
    jarakKeSekolah.textContent = currentDistance.toFixed(2);

    showToast(`Lokasi terdeteksi! Jarak ke ${TARGET_NAME}: ${currentDistance.toFixed(2)} km`, 'fa-location-dot');
  }

  // ================= DETEKSI LOKASI AKTIF =================
  function deteksiLokasi() {
    if (!navigator.geolocation) {
      showToast('Browser tidak mendukung geolokasi', 'fa-triangle-exclamation');
      return;
    }

    showLoading('Mendeteksi lokasi aktif Anda...');
    navigator.geolocation.getCurrentPosition(
      function(position) {
        hideLoading();
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        setUserLocation(lat, lng, 'Lokasi aktif (GPS)');
      },
      function(error) {
        hideLoading();
        let msg = 'Gagal mendeteksi lokasi. ';
        switch(error.code) {
          case error.PERMISSION_DENIED: msg += 'Izin lokasi ditolak.'; break;
          case error.POSITION_UNAVAILABLE: msg += 'Informasi lokasi tidak tersedia.'; break;
          case error.TIMEOUT: msg += 'Waktu habis.'; break;
          default: msg += 'Error tidak diketahui.';
        }
        showToast(msg, 'fa-triangle-exclamation');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  }

  // ================= RENDER ORDER LIST =================
  function renderOrders() {
    if (orders.length === 0) {
      orderList.innerHTML = `
        <div class="empty-state" id="emptyList" style="padding: 1.5rem;">
          <i class="fas fa-receipt" style="font-size: 2.5rem;"></i>
          <p>Belum ada pesanan. Tambahkan pesanan di atas.</p>
        </div>`;
      jumlahPesanan.textContent = '0';
      btnProses.disabled = true;
      return;
    }

    let html = '';
    orders.forEach((order, index) => {
      const isEs = order.jenis === 'es';
      const jenisLabel = isEs ? 'Es/Sensitif' : 'Kering/Hangat';
      const jenisIcon = isEs ? 'fa-ice-cream' : 'fa-bread-slice';
      const volumeLabel = order.volume === 'besar' ? 'Sangat Besar' : 'Kecil/Sedang';
      const volumeIcon = order.volume === 'besar' ? 'fa-boxes-stacked' : 'fa-box';
      const lokasiLabel = order.lokasi === 'macet' ? 'Macet Parah' : 'Lancar';
      const lokasiIcon = order.lokasi === 'macet' ? 'fa-traffic-light' : 'fa-road';
      const jarakLabel = order.jarak !== null ? `${order.jarak.toFixed(2)} km` : '-';

      html += `
        <div class="order-item">
          <div class="item-num">${index + 1}</div>
          <div class="item-info">
            <strong><i class="fas ${jenisIcon}"></i> ${jenisLabel}</strong>
            <small>
              <span><i class="fas ${volumeIcon}"></i> ${volumeLabel}</span>
              <span><i class="fas ${lokasiIcon}"></i> ${lokasiLabel}</span>
              <span><i class="fas fa-route"></i> ${jarakLabel}</span>
            </small>
            <div class="receiver">
              <i class="fas fa-user"></i> ${order.namaPenerima}
              <i class="fas fa-phone" style="margin-left: 8px;"></i> ${order.noTelp}
            </div>
            <div class="receiver" style="font-size: 0.7rem; opacity: 0.8; margin-top: 2px;">
              <i class="fas fa-location-dot"></i> ${order.alamatLengkap}
            </div>
          </div>
          <button class="btn-icon" onclick="window.__hapusPesanan(${index})" title="Hapus">
            <i class="fas fa-circle-xmark"></i>
          </button>
        </div>`;
    });

    orderList.innerHTML = html;
    jumlahPesanan.textContent = orders.length;
    btnProses.disabled = false;
  }

  // ================= TAMBAH PESANAN =================
  function tambahPesanan() {
    const namaPenerima = namaPenerimaInput.value.trim();
    const noTelp = noTelpInput.value.trim();
    const provinsi = provinsiSelect.value;
    const kabupaten = kabupatenInput.value.trim();
    const kecamatan = kecamatanInput.value.trim();
    const kodePos = kodePosInput.value.trim();
    const blokRumah = blokRumahInput.value.trim();

    if (!namaPenerima) { showToast('Nama penerima wajib diisi!', 'fa-triangle-exclamation'); namaPenerimaInput.focus(); return; }
    if (!noTelp) { showToast('Nomor telepon wajib diisi!', 'fa-triangle-exclamation'); noTelpInput.focus(); return; }
    if (!provinsi) { showToast('Provinsi wajib dipilih!', 'fa-triangle-exclamation'); provinsiSelect.focus(); return; }
    if (!kabupaten) { showToast('Kabupaten/Kota wajib diisi!', 'fa-triangle-exclamation'); kabupatenInput.focus(); return; }
    if (!kecamatan) { showToast('Kecamatan wajib diisi!', 'fa-triangle-exclamation'); kecamatanInput.focus(); return; }
    if (!kodePos) { showToast('Kode pos wajib diisi!', 'fa-triangle-exclamation'); kodePosInput.focus(); return; }
    if (userLat === null || userLng === null) { showToast('Deteksi lokasi aktif terlebih dahulu!', 'fa-triangle-exclamation'); return; }

    const alamatParts = [blokRumah, kecamatan, kabupaten, provinsi, kodePos].filter(Boolean);
    const alamatLengkap = alamatParts.join(', ');

    const order = {
      id: ++orderCounter,
      jenis: getJenis(),
      volume: volumeSelect.value,
      lokasi: lokasiSelect.value,
      namaPenerima,
      noTelp,
      provinsi,
      kabupaten,
      kecamatan,
      kodePos,
      blokRumah,
      alamatLengkap,
      lat: userLat,
      lng: userLng,
      jarak: currentDistance
    };

    orders.push(order);
    renderOrders();
    showToast(`Pesanan #${orderCounter} untuk ${namaPenerima} ditambahkan! (Jarak: ${currentDistance.toFixed(2)} km)`, 'fa-circle-check');

    namaPenerimaInput.value = '';
    noTelpInput.value = '';
    kabupatenInput.value = '';
    kecamatanInput.value = '';
    kodePosInput.value = '';
    blokRumahInput.value = '';
    namaPenerimaInput.focus();
  }

  // ================= HAPUS PESANAN =================
  window.__hapusPesanan = function(index) {
    if (index >= 0 && index < orders.length) {
      orders.splice(index, 1);
      renderOrders();
      showToast('Pesanan dihapus.', 'fa-trash-can');
    }
  };

  // ================= RESET =================
  function resetAll() {
    if (orders.length === 0) return;
    if (confirm('Yakin ingin menghapus semua pesanan?')) {
      orders = [];
      orderCounter = 0;
      renderOrders();
      resetResult();
      showToast('Semua pesanan direset.', 'fa-rotate-left');
    }
  }

  function resetResult() {
    resultContent.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-robot"></i>
        <p>Belum ada hasil.<br>Silakan tambahkan pesanan lalu klik <strong>Proses</strong>.</p>
      </div>`;
  }

  // ================= LOGIKA ALGORITMA =================
  function prosesPesanan() {
    if (orders.length === 0) {
      showToast('Tambahkan minimal 1 pesanan!', 'fa-triangle-exclamation');
      return;
    }

    showLoading('Menghitung jarak & mengoptimasi rute...');

    setTimeout(() => {
      const logLines = [];
      logLines.push({ icon: 'fa-play', text: 'MULAI ALGORITMA Penentuan_Kurir_Dan_Rute' });
      logLines.push({ icon: 'fa-database', text: `INPUT: ${orders.length} pesanan, 2 kurir (A: Motor, B: Mobil Box)` });
      logLines.push({ icon: 'fa-map-location-dot', text: `TARGET: ${TARGET_NAME} (${TARGET_LAT}, ${TARGET_LNG})` });

      const kurirA = [];
      const kurirB = [];

      orders.forEach((order, i) => {
        const nomor = i + 1;
        const isEs = order.jenis === 'es';
        const isMacet = order.lokasi === 'macet';
        const isVolumeBesar = order.volume === 'besar';
        const isVolumeKecil = order.volume === 'kecil';
        const jarak = order.jarak || 0;

        let assigned = null;

        if (isEs) {
          assigned = 'A';
          logLines.push({ icon: 'fa-ice-cream', text: `Pesanan #${nomor} (${order.namaPenerima}): ES → KURIR A (Motor) | Jarak: ${jarak.toFixed(2)} km` });
        } else if (isMacet && isVolumeKecil) {
          assigned = 'A';
          logLines.push({ icon: 'fa-motorcycle', text: `Pesanan #${nomor} (${order.namaPenerima}): MACET+KECIL → KURIR A | Jarak: ${jarak.toFixed(2)} km` });
        } else if (isVolumeBesar) {
          assigned = 'B';
          logLines.push({ icon: 'fa-truck', text: `Pesanan #${nomor} (${order.namaPenerima}): VOLUME BESAR → KURIR B | Jarak: ${jarak.toFixed(2)} km` });
        } else {
          assigned = 'B';
          logLines.push({ icon: 'fa-box', text: `Pesanan #${nomor} (${order.namaPenerima}): KERING+LANCAR → KURIR B | Jarak: ${jarak.toFixed(2)} km` });
        }

        const item = { nomor, ...order, assigned };
        if (assigned === 'A') kurirA.push(item);
        else kurirB.push(item);
      });

      const sortByPriority = (a, b) => {
        const scoreA = (a.jenis === 'es' ? 10 : 0) + (a.lokasi === 'macet' ? 5 : 0) + (a.volume === 'besar' ? 3 : 0);
        const scoreB = (b.jenis === 'es' ? 10 : 0) + (b.lokasi === 'macet' ? 5 : 0) + (b.volume === 'besar' ? 3 : 0);
        return scoreB - scoreA;
      };
      kurirA.sort(sortByPriority);
      kurirB.sort(sortByPriority);

      logLines.push({ icon: 'fa-sort', text: 'Rute diurutkan berdasarkan prioritas (Es+Macet = tertinggi)' });

      const avgDistA = kurirA.length > 0 ? kurirA.reduce((s, x) => s + x.jarak, 0) / kurirA.length : 0;
      const avgDistB = kurirB.length > 0 ? kurirB.reduce((s, x) => s + x.jarak, 0) / kurirB.length : 0;
      const waktuA = kurirA.length > 0 ? kurirA.length * (8 + avgDistA * 2) : 0;
      const waktuB = kurirB.length > 0 ? kurirB.length * (10 + avgDistB * 2.5) : 0;
      const totalWaktu = Math.max(waktuA, waktuB);
      const isTepatWaktu = totalWaktu < 120;

      logLines.push({ icon: 'fa-clock', text: `Estimasi waktu: Kurir A = ${waktuA.toFixed(0)} mnt, Kurir B = ${waktuB.toFixed(0)} mnt` });
      logLines.push({
        icon: isTepatWaktu ? 'fa-check-circle' : 'fa-exclamation-triangle',
        text: `CEK ULANG: Total = ${totalWaktu.toFixed(0)} menit → ${isTepatWaktu ? 'TEPAT WAKTU (< 2 jam)' : 'MELEBIHI BATAS!'}`
      });
      logLines.push({ icon: 'fa-flag-checkered', text: 'SELESAI' });

      renderHasil(kurirA, kurirB, totalWaktu, isTepatWaktu, logLines, avgDistA, avgDistB);
      hideLoading();
      showToast('Optimasi selesai!', 'fa-check-circle');
    }, 800);
  }

  // ================= RENDER HASIL =================
  function renderHasil(kurirA, kurirB, totalWaktu, isTepatWaktu, logLines, avgDistA, avgDistB) {
    let html = '';

    if (kurirA.length > 0) {
      html += renderKurirCard('A', kurirA, 'fa-motorcycle', 'Motor', 'Sangat lincah menembus kemacetan', avgDistA);
    } else {
      html += renderKurirCardEmpty('A', 'fa-motorcycle', 'Motor');
    }

    if (kurirB.length > 0) {
      html += renderKurirCard('B', kurirB, 'fa-truck', 'Mobil Box', 'Kapasitas besar, kurang fleksibel', avgDistB);
    } else {
      html += renderKurirCardEmpty('B', 'fa-truck', 'Mobil Box');
    }

    html += `
      <div class="summary-bar">
        <div class="summary-item">
          <span><i class="fas fa-hourglass-half" style="color: var(--emerald-500);"></i> Estimasi Waktu</span>
          <span>${totalWaktu.toFixed(0)} menit</span>
        </div>
        <div class="summary-item">
          <span><i class="fas fa-clock" style="color: var(--emerald-500);"></i> Status Ketepatan</span>
          <span>
            ${isTepatWaktu
              ? '<span class="badge-success"><i class="fas fa-check"></i> TEPAT WAKTU</span>'
              : '<span class="badge-warning"><i class="fas fa-exclamation"></i> MELEBIHI BATAS</span>'}
          </span>
        </div>
        <div class="summary-item">
          <span><i class="fas fa-boxes-stacked" style="color: var(--emerald-500);"></i> Total Pesanan</span>
          <span>${kurirA.length + kurirB.length}</span>
        </div>
        <div class="summary-item">
          <span><i class="fas fa-route" style="color: var(--emerald-500);"></i> Beban Kurir A / B</span>
          <span>${kurirA.length} / ${kurirB.length}</span>
        </div>
        <div class="summary-item">
          <span><i class="fas fa-map-location-dot" style="color: var(--emerald-500);"></i> Target Tujuan</span>
          <span style="font-size: 0.8rem;">${TARGET_NAME}</span>
        </div>
      </div>
    `;

    html += `<div class="algo-log" id="algoLog">`;
    logLines.forEach((line) => {
      html += `<span class="log-line"><i class="fas ${line.icon}"></i> ${line.text}</span>`;
    });
    html += `</div>`;

    resultContent.innerHTML = html;
  }

  function renderKurirCard(kurir, items, icon, label, desc, avgDist) {
    let itemsHtml = '';
    items.forEach(item => {
      const isEs = item.jenis === 'es';
      const jenisIcon = isEs ? 'fa-ice-cream' : 'fa-bread-slice';
      const jenisLabel = isEs ? 'Es' : 'Kering';
      const lokasiIcon = item.lokasi === 'macet' ? 'fa-traffic-light' : 'fa-road';
      const lokasiLabel = item.lokasi === 'macet' ? 'Macet' : 'Lancar';
      const volumeIcon = item.volume === 'besar' ? 'fa-boxes-stacked' : 'fa-box';
      const volumeLabel = item.volume === 'besar' ? 'Besar' : 'Kecil';

      itemsHtml += `
        <li>
          <i class="fas fa-hashtag" style="font-size: 0.7rem;"></i>
          <strong>#${item.nomor}</strong> — ${item.namaPenerima}
          <span class="detail">
            <i class="fas ${jenisIcon}"></i> ${jenisLabel} · 
            <i class="fas ${volumeIcon}"></i> ${volumeLabel} · 
            <i class="fas ${lokasiIcon}"></i> ${lokasiLabel} · 
            <i class="fas fa-route"></i> Jarak: <strong>${item.jarak.toFixed(2)} km</strong>
          </span>
          <span class="detail">
            <i class="fas fa-phone"></i> ${item.noTelp}
          </span>
          <span class="detail">
            <i class="fas fa-location-dot"></i> ${item.alamatLengkap}
          </span>
        </li>`;
    });

    return `
      <div class="result-card">
        <div class="kurir-header">
          <div class="kurir-avatar"><i class="fas ${icon}"></i></div>
          <div>
            <h3>KURIR ${kurir} <small>${label} · ${desc}</small></h3>
            <small style="font-size: 0.7rem; opacity: 0.9;">Rata-rata jarak: ${avgDist.toFixed(2)} km</small>
          </div>
        </div>
        <ul class="item-list-result">${itemsHtml}</ul>
      </div>`;
  }

  function renderKurirCardEmpty(kurir, icon, label) {
    return `
      <div class="result-card" style="background: var(--emerald-100); color: var(--emerald-700); box-shadow: 0 8px 0 var(--emerald-300);">
        <div class="kurir-header" style="border-bottom-color: var(--emerald-300);">
          <div class="kurir-avatar" style="background: var(--emerald-300); color: var(--emerald-700);">
            <i class="fas ${icon}"></i>
          </div>
          <div>
            <h3 style="color: var(--emerald-800);">KURIR ${kurir} <small style="color: var(--emerald-600);">${label}</small></h3>
          </div>
        </div>
        <p style="font-size: 0.85rem; font-weight: 500; text-align: center; opacity: 0.7;">
          <i class="fas fa-inbox"></i> Tidak ada pesanan dialokasikan
        </p>
      </div>`;
  }

  // ================= EVENT LISTENERS =================
  btnTambah.addEventListener('click', tambahPesanan);
  btnReset.addEventListener('click', resetAll);
  btnProses.addEventListener('click', prosesPesanan);
  btnDeteksi.addEventListener('click', deteksiLokasi);

  blokRumahInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') tambahPesanan();
  });

  // ================= INIT =================
  initMap();
  renderOrders();
})();