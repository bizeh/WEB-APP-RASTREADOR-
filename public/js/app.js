// Estado da Aplicação
const state = {
  token: localStorage.getItem('token') || null,
  user: JSON.parse(localStorage.getItem('user') || 'null'),
  devices: [],
  selectedDeviceId: null,
  filter: 'all',
  searchQuery: '',
  markers: {},
  historyPolyline: null,
  historyMarkers: [],
  map: null,
  socket: null,
  // Localização do Operador/Usuário via GPS
  userLocation: {
    lat: null,
    lng: null,
    accuracy: null,
    marker: null,
    circle: null,
    watchId: null,
    isTracking: false
  }
};

// Inicialização
document.addEventListener('DOMContentLoaded', () => {
  initAuth();
  initEventListeners();
});

// Autenticação
function initAuth() {
  const loginOverlay = document.getElementById('loginOverlay');
  const appContainer = document.getElementById('appContainer');

  if (state.token) {
    // Validar token no backend
    fetch('/api/auth/me', {
      headers: { 'Authorization': `Bearer ${state.token}` }
    })
      .then(res => {
        if (!res.ok) throw new Error('Sessão expirada');
        return res.json();
      })
      .then(data => {
        state.user = data.user;
        showApp();
      })
      .catch(() => {
        logout();
      });
  } else {
    showLogin();
  }
}

function showLogin() {
  document.getElementById('loginOverlay').classList.remove('hidden');
  document.getElementById('appContainer').classList.add('hidden');
}

function showApp() {
  document.getElementById('loginOverlay').classList.add('hidden');
  document.getElementById('appContainer').classList.remove('hidden');

  if (state.user) {
    document.getElementById('userNameLabel').innerText = state.user.name || state.user.username;
    document.getElementById('userRoleLabel').innerText = state.user.role || 'Operador';
  }

  if (!state.map) {
    initMap();
  } else {
    setTimeout(() => state.map.invalidateSize(), 200);
  }

  if (!state.socket) {
    initSocket();
  }

  loadDevices();

  // Iniciar solicitação amigável de GPS do usuário após login
  requestUserLocation(false);
}

function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  state.token = null;
  state.user = null;
  if (state.socket) {
    state.socket.disconnect();
    state.socket = null;
  }
  showLogin();
}

// Inicialização do Mapa Leaflet
function initMap() {
  // Ponto central padrão: São Paulo, Brasil
  state.map = L.map('map', {
    zoomControl: false
  }).setView([-23.561684, -46.655981], 13);

  // Adiciona controle de zoom no canto inferior direito
  L.control.zoom({ position: 'bottomright' }).addTo(state.map);

  // Tile layer OpenStreetMap (estilo limpo)
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(state.map);
}

// Conexão Socket.IO
function initSocket() {
  state.socket = io();

  const socketIndicator = document.getElementById('socketIndicator');
  const socketText = document.getElementById('socketText');

  state.socket.on('connect', () => {
    socketIndicator.className = 'status-dot dot-online';
    socketText.innerText = 'Conectado';
  });

  state.socket.on('disconnect', () => {
    socketIndicator.className = 'status-dot dot-offline';
    socketText.innerText = 'Desconectado';
  });

  // Lista inicial de dispositivos recebida
  state.socket.on('dispositivos_lista', (devices) => {
    state.devices = devices;
    renderDevices();
    updateMapMarkers();
    populateHistorySelect();
  });

  // Notificação de nova posição recebida
  state.socket.on('nova_posicao', (pos) => {
    const dev = state.devices.find(d => d.device_id === pos.device_id);
    if (dev) {
      dev.last_lat = pos.lat;
      dev.last_lng = pos.lng;
      dev.last_speed = pos.speed;
      dev.last_heading = pos.heading;
      dev.last_seen = pos.timestamp;
      dev.status = 'online';
    } else {
      // Se for um novo dispositivo recém reportado
      state.devices.push({
        device_id: pos.device_id,
        name: pos.name || pos.device_id,
        last_lat: pos.lat,
        last_lng: pos.lng,
        last_speed: pos.speed,
        last_heading: pos.heading,
        last_seen: pos.timestamp,
        status: 'online'
      });
      populateHistorySelect();
    }

    renderDevices();
    updateSingleMarker(pos);
    notifyRealtimeActivity(`Atualização de ${pos.name || pos.device_id}: ${pos.speed} km/h`);
  });

  // Mudança de status (ex: offline após timeout)
  state.socket.on('dispositivo_status', ({ device_id, status, last_seen }) => {
    const dev = state.devices.find(d => d.device_id === device_id);
    if (dev) {
      dev.status = status;
      if (last_seen) dev.last_seen = last_seen;
      renderDevices();
      updateMapMarkers();
    }
  });

  // Novo dispositivo cadastrado
  state.socket.on('dispositivo_criado', (device) => {
    const exists = state.devices.find(d => d.device_id === device.device_id);
    if (!exists) {
      state.devices.push(device);
      renderDevices();
      populateHistorySelect();
    }
  });
}

// Carregar dispositivos via API REST
async function loadDevices() {
  try {
    const res = await fetch('/api/dispositivos', {
      headers: { 'Authorization': `Bearer ${state.token}` }
    });
    if (res.ok) {
      const data = await res.json();
      state.devices = data.dispositivos || [];
      renderDevices();
      updateMapMarkers();
      populateHistorySelect();
    }
  } catch (err) {
    console.error('Erro ao carregar dispositivos:', err);
  }
}

// Renderizar lista na sidebar
function renderDevices() {
  const listEl = document.getElementById('deviceList');
  if (!listEl) return;

  const filtered = state.devices.filter(dev => {
    const matchesFilter =
      state.filter === 'all' ||
      (state.filter === 'online' && dev.status === 'online') ||
      (state.filter === 'offline' && dev.status === 'offline');

    const matchesSearch =
      dev.name.toLowerCase().includes(state.searchQuery.toLowerCase()) ||
      dev.device_id.toLowerCase().includes(state.searchQuery.toLowerCase());

    return matchesFilter && matchesSearch;
  });

  // Atualizar contadores no header
  const onlineCount = state.devices.filter(d => d.status === 'online').length;
  const offlineCount = state.devices.filter(d => d.status === 'offline').length;
  document.getElementById('statOnlineCount').innerText = onlineCount;
  document.getElementById('statOfflineCount').innerText = offlineCount;
  document.getElementById('statTotalCount').innerText = state.devices.length;

  if (filtered.length === 0) {
    listEl.innerHTML = `<div class="loading-state">Nenhum dispositivo encontrado.</div>`;
    return;
  }

  listEl.innerHTML = filtered.map(dev => {
    const isOnline = dev.status === 'online';
    const isSelected = dev.device_id === state.selectedDeviceId;
    const formattedDate = dev.last_seen ? new Date(dev.last_seen).toLocaleTimeString('pt-BR') : 'Nunca';
    const speed = dev.last_speed !== null && dev.last_speed !== undefined ? `${Number(dev.last_speed).toFixed(1)} km/h` : '0 km/h';

    return `
      <div class="device-card ${isSelected ? 'selected' : ''}" data-device-id="${dev.device_id}">
        <div class="device-card-header">
          <span class="device-title" title="${dev.name}">${dev.name}</span>
          <span class="badge-status ${isOnline ? 'online' : 'offline'}">${isOnline ? 'Online' : 'Offline'}</span>
        </div>
        <div class="device-id-code">${dev.device_id}</div>
        <div class="device-telemetry">
          <div><small>Vel:</small> <strong>${speed}</strong></div>
          <div><small>Visto:</small> <strong>${formattedDate}</strong></div>
        </div>
        <div class="device-actions">
          <button class="btn btn-sm btn-outline btn-ver-mapa" data-id="${dev.device_id}">
            Localizar
          </button>
          <button class="btn btn-sm btn-outline btn-ver-historico" data-id="${dev.device_id}">
            Histórico
          </button>
        </div>
      </div>
    `;
  }).join('');
}

// Atualizar marcadores no mapa Leaflet
function updateMapMarkers() {
  if (!state.map) return;

  state.devices.forEach(dev => {
    if (dev.last_lat && dev.last_lng) {
      updateSingleMarker(dev);
    }
  });
}

function updateSingleMarker(dev) {
  if (!state.map || !dev.last_lat || !dev.last_lng) return;

  const isOnline = dev.status === 'online';
  const latLng = [dev.last_lat, dev.last_lng];

  // Ícone HTML personalizado
  const iconHtml = `
    <div class="custom-tracker-icon">
      <div class="tracker-marker-pin ${isOnline ? 'online' : 'offline'}">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2">
          <rect x="1" y="3" width="15" height="13"/>
          <polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/>
          <circle cx="5.5" cy="18.5" r="2.5"/>
          <circle cx="18.5" cy="18.5" r="2.5"/>
        </svg>
      </div>
      <div class="tracker-marker-label">${dev.name || dev.device_id}</div>
    </div>
  `;

  const customIcon = L.divIcon({
    className: 'leaflet-tracker-div-icon',
    html: iconHtml,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    popupAnchor: [0, -18]
  });

  const lastSeenStr = dev.last_seen ? new Date(dev.last_seen).toLocaleString('pt-BR') : 'Não disponível';
  const speedStr = (dev.last_speed || dev.speed || 0).toFixed(1);

  const popupContent = `
    <div class="tracker-popup">
      <h3>${dev.name || dev.device_id}</h3>
      <p><strong>ID:</strong> ${dev.device_id}</p>
      <p><strong>Status:</strong> <span style="color:${isOnline ? '#10b981' : '#ef4444'}; font-weight:700;">${isOnline ? 'ONLINE' : 'OFFLINE'}</span></p>
      <p><strong>Velocidade:</strong> ${speedStr} km/h</p>
      <p><strong>Última atualização:</strong> ${lastSeenStr}</p>
      <p><strong>Coordenadas:</strong> ${Number(dev.last_lat || dev.lat).toFixed(5)}, ${Number(dev.last_lng || dev.lng).toFixed(5)}</p>
    </div>
  `;

  if (state.markers[dev.device_id]) {
    // Atualizar marcador existente
    const marker = state.markers[dev.device_id];
    marker.setLatLng(latLng);
    marker.setIcon(customIcon);
    marker.setPopupContent(popupContent);
  } else {
    // Criar novo marcador
    const marker = L.marker(latLng, { icon: customIcon }).addTo(state.map);
    marker.bindPopup(popupContent);
    marker.on('click', () => {
      selectDevice(dev.device_id, false);
    });
    state.markers[dev.device_id] = marker;
  }
}

// Selecionar dispositivo
function selectDevice(deviceId, panTo = true) {
  state.selectedDeviceId = deviceId;
  renderDevices();

  const dev = state.devices.find(d => d.device_id === deviceId);
  if (dev && dev.last_lat && dev.last_lng && panTo && state.map) {
    state.map.flyTo([dev.last_lat, dev.last_lng], 15, { duration: 1 });
    if (state.markers[deviceId]) {
      state.markers[deviceId].openPopup();
    }
  }
}

// Histórico de Trajeto
function populateHistorySelect() {
  const select = document.getElementById('historyDeviceSelect');
  if (!select) return;

  const currentVal = select.value;
  select.innerHTML = '<option value="">Selecione um dispositivo...</option>' +
    state.devices.map(d => `<option value="${d.device_id}">${d.name} (${d.device_id})</option>`).join('');

  if (currentVal) select.value = currentVal;
}

async function loadHistory(deviceId, period) {
  if (!deviceId) {
    alert('Selecione um dispositivo para visualizar o histórico.');
    return;
  }

  let fromDate = null;
  const now = new Date();

  if (period === 'last3h') {
    fromDate = new Date(now.getTime() - 3 * 3600 * 1000).toISOString();
  } else if (period === 'today') {
    fromDate = new Date(now.getTime() - 24 * 3600 * 1000).toISOString();
  }

  let url = `/api/dispositivos/${deviceId}/historico`;
  if (fromDate) {
    url += `?from=${encodeURIComponent(fromDate)}`;
  }

  try {
    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${state.token}` }
    });
    const data = await res.json();

    if (!res.ok) {
      alert(data.error || 'Erro ao carregar histórico');
      return;
    }

    displayHistoryRoute(data.historico, data.device);
  } catch (err) {
    console.error('Erro ao carregar histórico:', err);
    alert('Erro de conexão ao carregar histórico.');
  }
}

function displayHistoryRoute(points, device) {
  clearHistoryRoute();

  if (!points || points.length === 0) {
    alert('Nenhum ponto de trajeto encontrado para o período selecionado.');
    return;
  }

  const latLngs = points.map(p => [p.lat, p.lng]);

  // Desenhar linha poligonal do trajeto no mapa Leaflet
  state.historyPolyline = L.polyline(latLngs, {
    color: '#3b82f6',
    weight: 4,
    opacity: 0.8,
    dashArray: '8, 8',
    lineJoin: 'round'
  }).addTo(state.map);

  // Marcador de Início
  const startPoint = points[0];
  const startMarker = L.circleMarker([startPoint.lat, startPoint.lng], {
    radius: 7,
    fillColor: '#10b981',
    color: '#fff',
    weight: 2,
    opacity: 1,
    fillOpacity: 0.9
  }).addTo(state.map).bindPopup(`
    <strong>Início do Trajeto</strong><br>
    Data: ${new Date(startPoint.timestamp).toLocaleString('pt-BR')}<br>
    Velocidade: ${startPoint.speed} km/h
  `);

  // Marcador de Fim
  const endPoint = points[points.length - 1];
  const endMarker = L.circleMarker([endPoint.lat, endPoint.lng], {
    radius: 7,
    fillColor: '#ef4444',
    color: '#fff',
    weight: 2,
    opacity: 1,
    fillOpacity: 0.9
  }).addTo(state.map).bindPopup(`
    <strong>Ponto Mais Recente</strong><br>
    Data: ${new Date(endPoint.timestamp).toLocaleString('pt-BR')}<br>
    Velocidade: ${endPoint.speed} km/h
  `);

  state.historyMarkers = [startMarker, endMarker];

  // Ajustar zoom do mapa para englobar todo o trajeto
  state.map.fitBounds(state.historyPolyline.getBounds(), { padding: [40, 40] });

  // Calcular estatísticas da rota
  let maxSpeed = 0;
  let totalSpeed = 0;
  let totalDistanceKm = 0;

  for (let i = 0; i < points.length; i++) {
    const sp = points[i].speed || 0;
    if (sp > maxSpeed) maxSpeed = sp;
    totalSpeed += sp;

    if (i > 0) {
      totalDistanceKm += calculateDistance(points[i - 1].lat, points[i - 1].lng, points[i].lat, points[i].lng);
    }
  }

  const avgSpeed = (totalSpeed / points.length).toFixed(1);

  document.getElementById('histTotalPoints').innerText = points.length;
  document.getElementById('histMaxSpeed').innerText = `${maxSpeed.toFixed(1)} km/h`;
  document.getElementById('histAvgSpeed').innerText = `${avgSpeed} km/h`;
  document.getElementById('histDistance').innerText = `${totalDistanceKm.toFixed(2)} km`;

  document.getElementById('historyStats').classList.remove('hidden');
  document.getElementById('btnClearHistory').classList.remove('hidden');
}

function clearHistoryRoute() {
  if (state.historyPolyline) {
    state.map.removeLayer(state.historyPolyline);
    state.historyPolyline = null;
  }
  if (state.historyMarkers && state.historyMarkers.length) {
    state.historyMarkers.forEach(m => state.map.removeLayer(m));
    state.historyMarkers = [];
  }
  document.getElementById('historyStats').classList.add('hidden');
  document.getElementById('btnClearHistory').classList.add('hidden');
}

// Distância aproximada em KM (fórmula Haversine)
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Raio da Terra em km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Notificação visual no mapa
function notifyRealtimeActivity(message) {
  const noticeEl = document.getElementById('realtimeMessage');
  if (noticeEl) {
    noticeEl.innerText = message;
  }
}

// Event Listeners da Interface
function initEventListeners() {
  // Formulário de Login
  const loginForm = document.getElementById('loginForm');
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;
    const loginError = document.getElementById('loginError');

    loginError.classList.add('hidden');

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      const data = await res.json();
      if (!res.ok) {
        loginError.innerText = data.error || 'Credenciais inválidas';
        loginError.classList.remove('hidden');
        return;
      }

      state.token = data.token;
      state.user = data.user;
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));

      showApp();
    } catch (err) {
      loginError.innerText = 'Erro ao conectar ao servidor.';
      loginError.classList.remove('hidden');
    }
  });

  // Botão Sair (Logout)
  document.getElementById('btnLogout').addEventListener('click', () => {
    logout();
  });

  // Alternar Sidebar (Responsivo)
  document.getElementById('btnToggleSidebar').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('closed');
    setTimeout(() => {
      if (state.map) state.map.invalidateSize();
    }, 300);
  });

  // Troca de Abas da Sidebar
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

      btn.classList.add('active');
      const targetTab = document.getElementById(btn.dataset.tab);
      if (targetTab) targetTab.classList.add('active');
    });
  });

  // Filtro Online/Offline/Todos
  document.querySelectorAll('.pill-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.pill-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.filter = btn.dataset.filter;
      renderDevices();
    });
  });

  // Campo de busca
  document.getElementById('deviceSearchInput').addEventListener('input', (e) => {
    state.searchQuery = e.target.value;
    renderDevices();
  });

  // Cliques na lista de dispositivos
  document.getElementById('deviceList').addEventListener('click', (e) => {
    const card = e.target.closest('.device-card');
    if (!card) return;

    const deviceId = card.dataset.deviceId;

    if (e.target.closest('.btn-ver-mapa')) {
      selectDevice(deviceId, true);
    } else if (e.target.closest('.btn-ver-historico')) {
      // Abre a aba de histórico e seleciona o dispositivo
      const historyTabBtn = document.querySelector('[data-tab="tab-history"]');
      if (historyTabBtn) historyTabBtn.click();
      const select = document.getElementById('historyDeviceSelect');
      if (select) {
        select.value = deviceId;
        loadHistory(deviceId, document.getElementById('historyPeriodSelect').value);
      }
    } else {
      selectDevice(deviceId, true);
    }
  });

  // Ações de Histórico
  document.getElementById('btnLoadHistory').addEventListener('click', () => {
    const deviceId = document.getElementById('historyDeviceSelect').value;
    const period = document.getElementById('historyPeriodSelect').value;
    loadHistory(deviceId, period);
  });

  document.getElementById('btnClearHistory').addEventListener('click', () => {
    clearHistoryRoute();
  });

  // Cadastro de Novo Rastreador
  const newDeviceForm = document.getElementById('newDeviceForm');
  newDeviceForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const device_id = document.getElementById('newDeviceId').value.trim();
    const name = document.getElementById('newDeviceName').value.trim();
    const token = document.getElementById('newDeviceToken').value.trim();
    const resultBox = document.getElementById('newDeviceResult');

    try {
      const res = await fetch('/api/dispositivos', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${state.token}`
        },
        body: JSON.stringify({ device_id, name, token })
      });

      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Erro ao cadastrar dispositivo');
        return;
      }

      resultBox.innerHTML = `
        <strong>Dispositivo Cadastrado com Sucesso!</strong><br>
        <strong>ID:</strong> ${data.dispositivo.device_id}<br>
        <strong>Nome:</strong> ${data.dispositivo.name}<br>
        <strong>Token de Acesso:</strong> <code>${data.dispositivo.token}</code><br>
        <small>Guarde o token para configurar o rastreador GPS físico ou no script simulador.</small>
      `;
      resultBox.classList.remove('hidden');
      newDeviceForm.reset();

      // Recarrega lista
      loadDevices();
    } catch (err) {
      alert('Erro de conexão ao cadastrar dispositivo.');
    }
  });

  // Botão Enquadrar Todos no Mapa
  document.getElementById('btnFitAll').addEventListener('click', () => {
    if (!state.map) return;
    const markerCoords = Object.values(state.markers).map(m => m.getLatLng());
    if (markerCoords.length > 0) {
      const bounds = L.latLngBounds(markerCoords);
      state.map.fitBounds(bounds, { padding: [50, 50] });
    } else {
      alert('Nenhum dispositivo com coordenadas válidas para enquadrar.');
    }
  });

  // Botões de Localização GPS do Usuário
  const btnUserLocation = document.getElementById('btnUserLocation');
  if (btnUserLocation) {
    btnUserLocation.addEventListener('click', () => {
      toggleUserLocationTracking(true);
    });
  }

  const btnMapLocateMe = document.getElementById('btnMapLocateMe');
  if (btnMapLocateMe) {
    btnMapLocateMe.addEventListener('click', () => {
      requestUserLocation(true);
    });
  }

  const btnCloseLocationBanner = document.getElementById('btnCloseLocationBanner');
  if (btnCloseLocationBanner) {
    btnCloseLocationBanner.addEventListener('click', () => {
      document.getElementById('userLocationBanner').classList.add('hidden');
    });
  }
}

// ==========================================
// Funcionalidade de Localização GPS do Usuário
// ==========================================

function requestUserLocation(panTo = true) {
  if (!('geolocation' in navigator)) {
    alert('Seu navegador não possui suporte para Geolocation (GPS).');
    return;
  }

  const btnText = document.getElementById('btnUserLocationText');
  if (btnText) btnText.textContent = 'Buscando GPS...';

  navigator.geolocation.getCurrentPosition(
    (position) => {
      updateUserLocation(position.coords, panTo);
      if (btnText) btnText.textContent = 'Meu GPS (Ativo)';
      showLocationBanner(position.coords);
    },
    (error) => {
      console.warn('Aviso ao obter GPS:', error.message);
      if (btnText) btnText.textContent = 'Meu GPS';
      if (panTo) {
        alert('Não foi possível obter a sua localização GPS: ' + error.message);
      }
    },
    { enableHighAccuracy: true, timeout: 12000, maximumAge: 10000 }
  );
}

function toggleUserLocationTracking(panTo = true) {
  if (state.userLocation.isTracking) {
    // Parar acompanhamento
    if (state.userLocation.watchId !== null) {
      navigator.geolocation.clearWatch(state.userLocation.watchId);
      state.userLocation.watchId = null;
    }
    state.userLocation.isTracking = false;
    const btnText = document.getElementById('btnUserLocationText');
    if (btnText) btnText.textContent = 'Meu GPS';
    const banner = document.getElementById('userLocationBanner');
    if (banner) banner.classList.add('hidden');
    notifyRealtimeActivity('Rastreamento da sua posição pausado');
  } else {
    // Iniciar acompanhamento contínuo
    if (!('geolocation' in navigator)) {
      alert('Geolocalização não disponível no navegador.');
      return;
    }

    state.userLocation.isTracking = true;
    const btnText = document.getElementById('btnUserLocationText');
    if (btnText) btnText.textContent = 'Meu GPS (Ativo)';

    requestUserLocation(panTo);

    try {
      state.userLocation.watchId = navigator.geolocation.watchPosition(
        (position) => {
          updateUserLocation(position.coords, false);
          showLocationBanner(position.coords);
        },
        (err) => console.warn('Erro contínuo de GPS:', err),
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
      );
    } catch (e) {
      console.error('Falha ao iniciar watchPosition:', e);
    }
  }
}

function updateUserLocation(coords, panTo = false) {
  const { latitude, longitude, accuracy } = coords;
  state.userLocation.lat = latitude;
  state.userLocation.lng = longitude;
  state.userLocation.accuracy = accuracy;

  if (!state.map) return;

  const latLng = [latitude, longitude];

  // Ícone especial para o operador/usuário atual
  const userIcon = L.divIcon({
    className: 'user-gps-marker',
    html: `
      <div class="user-beacon-pulse"></div>
      <div class="user-beacon-dot"></div>
      <div class="user-marker-badge">Você (${state.user ? (state.user.name || state.user.username) : 'Operador'})</div>
    `,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -16]
  });

  const accuracyText = accuracy ? `±${Math.round(accuracy)}m` : 'N/A';
  const popupHtml = `
    <div class="tracker-popup">
      <h3 style="color:#38bdf8;">📍 Sua Localização Atual</h3>
      <p><strong>Usuário:</strong> ${state.user ? (state.user.name || state.user.username) : 'Operador Central'}</p>
      <p><strong>Latitude:</strong> ${latitude.toFixed(6)}</p>
      <p><strong>Longitude:</strong> ${longitude.toFixed(6)}</p>
      <p><strong>Precisão do GPS:</strong> ${accuracyText}</p>
      <p><strong>Horário:</strong> ${new Date().toLocaleTimeString('pt-BR')}</p>
    </div>
  `;

  if (state.userLocation.marker) {
    state.userLocation.marker.setLatLng(latLng);
    state.userLocation.marker.setPopupContent(popupHtml);
  } else {
    state.userLocation.marker = L.marker(latLng, { icon: userIcon, zIndexOffset: 1000 }).addTo(state.map);
    state.userLocation.marker.bindPopup(popupHtml);
  }

  // Círculo de precisão
  if (accuracy && accuracy < 1000) {
    if (state.userLocation.circle) {
      state.userLocation.circle.setLatLng(latLng);
      state.userLocation.circle.setRadius(accuracy);
    } else {
      state.userLocation.circle = L.circle(latLng, {
        radius: accuracy,
        color: '#0284c7',
        fillColor: '#38bdf8',
        fillOpacity: 0.15,
        weight: 1.5,
        dashArray: '4, 4'
      }).addTo(state.map);
    }
  }

  if (panTo) {
    state.map.flyTo(latLng, Math.max(state.map.getZoom(), 15), { duration: 1.2 });
    state.userLocation.marker.openPopup();
  }

  notifyRealtimeActivity(`Sua posição GPS atualizada (${latitude.toFixed(4)}, ${longitude.toFixed(4)})`);
}

function showLocationBanner(coords) {
  const banner = document.getElementById('userLocationBanner');
  const text = document.getElementById('userLocationCoords');
  if (banner && text) {
    const acc = coords.accuracy ? ` (Precisão: ±${Math.round(coords.accuracy)}m)` : '';
    text.textContent = `${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)}${acc}`;
    banner.classList.remove('hidden');
  }
}
