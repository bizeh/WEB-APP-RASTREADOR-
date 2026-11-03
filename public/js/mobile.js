// Estado do Rastreador Mobile
const trackerState = {
  isTracking: false,
  watchId: null,
  timerId: null,
  wakeLock: null,

  // Usuário autenticado
  user: JSON.parse(localStorage.getItem('tracker_user') || 'null'),

  // Configurações
  token: localStorage.getItem('tracker_token') || 'token-secreto-tracker-001',
  deviceName: localStorage.getItem('tracker_device_name') || 'TRACKER-001',
  serverUrl: localStorage.getItem('tracker_server_url') || '',
  intervalSec: parseInt(localStorage.getItem('tracker_interval') || '5', 10),
  simulateGps: localStorage.getItem('tracker_simulate') === 'true',

  // Telemetria atual
  currentPosition: {
    lat: -23.561684,
    lng: -46.655981,
    accuracy: null,
    speed: 0,
    heading: 0,
    timestamp: null
  },

  // Simulação
  simStep: 0,

  // Métricas
  packetsSent: 0,
  packetsError: 0,
  routePoints: [],

  // Leaflet
  map: null,
  marker: null,
  polyline: null
};

// Pontos de simulação para modo de teste (em São Paulo)
const SIMULATED_PATH = [
  { lat: -23.561684, lng: -46.655981, speed: 35.2, heading: 45 },
  { lat: -23.560412, lng: -46.654210, speed: 42.0, heading: 45 },
  { lat: -23.558910, lng: -46.652130, speed: 48.5, heading: 50 },
  { lat: -23.557100, lng: -46.649800, speed: 39.1, heading: 52 },
  { lat: -23.555200, lng: -46.647500, speed: 28.0, heading: 48 },
  { lat: -23.553900, lng: -46.645900, speed: 32.7, heading: 45 }
];

// Inicialização ao carregar a página
document.addEventListener('DOMContentLoaded', () => {
  initUI();
  initMiniMap();
  setupEventListeners();
  setupAccountHandlers();
  updateConfigForm();
  updateAccountUI();
});

function initUI() {
  const displayName = trackerState.user ? trackerState.user.name : (trackerState.deviceName || trackerState.token.slice(0, 20));
  document.getElementById('infoDeviceName').textContent = displayName;
  updateTelemetryUI();
}

function initMiniMap() {
  const initialLat = trackerState.currentPosition.lat;
  const initialLng = trackerState.currentPosition.lng;

  trackerState.map = L.map('miniMap', {
    zoomControl: false,
    attributionControl: false
  }).setView([initialLat, initialLng], 15);

  L.control.zoom({ position: 'bottomright' }).addTo(trackerState.map);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19
  }).addTo(trackerState.map);

  // Marcador de rastreamento customizado com pulso (visão do próprio usuário)
  const pulseIcon = L.divIcon({
    className: 'tracker-pulse-marker',
    html: '<div class="pulse-ring"></div><div class="pulse-center"></div>',
    iconSize: [20, 20],
    iconAnchor: [10, 10]
  });

  trackerState.marker = L.marker([initialLat, initialLng], { icon: pulseIcon }).addTo(trackerState.map);

  // Linha da rota percorrida pelo próprio usuário
  trackerState.polyline = L.polyline([], {
    color: '#38bdf8',
    weight: 4,
    opacity: 0.85,
    smoothFactor: 1
  }).addTo(trackerState.map);
}

function setupEventListeners() {
  // Botão Iniciar / Parar Rastreamento
  document.getElementById('btnToggleTracking').addEventListener('click', toggleTracking);

  // Centralizar mapa
  document.getElementById('btnRecenter').addEventListener('click', () => {
    if (trackerState.map && trackerState.currentPosition.lat && trackerState.currentPosition.lng) {
      trackerState.map.setView([trackerState.currentPosition.lat, trackerState.currentPosition.lng], 16, { animate: true });
    }
  });

  // Modal de Configurações
  const configModal = document.getElementById('configModal');
  document.getElementById('btnOpenConfig').addEventListener('click', () => {
    updateConfigForm();
    configModal.classList.remove('hidden');
  });

  document.getElementById('btnCloseConfig').addEventListener('click', () => {
    configModal.classList.add('hidden');
  });

  // Salvar Configurações
  document.getElementById('configForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const token = document.getElementById('cfgToken').value.trim();
    const serverUrl = document.getElementById('cfgServerUrl').value.trim();
    const intervalSec = parseInt(document.getElementById('cfgInterval').value, 10);
    const simulateGps = document.getElementById('cfgSimulateGps').checked;

    trackerState.token = token;
    trackerState.serverUrl = serverUrl;
    trackerState.intervalSec = intervalSec;
    trackerState.simulateGps = simulateGps;

    localStorage.setItem('tracker_token', token);
    localStorage.setItem('tracker_server_url', serverUrl);
    localStorage.setItem('tracker_interval', intervalSec.toString());
    localStorage.setItem('tracker_simulate', simulateGps.toString());

    document.getElementById('infoDeviceName').textContent = trackerState.user ? trackerState.user.name : (token ? token.slice(0, 24) : 'Não configurado');
    configModal.classList.add('hidden');
    addLog(`Configurações salvas: Token [${token.slice(0, 12)}...], Envio: ${intervalSec}s`, 'success');
  });

  // Botões de Tokens Rápidos
  document.querySelectorAll('.btn-token-quick').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById('cfgToken').value = btn.dataset.token;
    });
  });

  // Limpar Log
  document.getElementById('btnClearLog').addEventListener('click', () => {
    document.getElementById('logList').innerHTML = '<div class="log-item empty">Nenhuma transmissão recente.</div>';
  });
}

// Lógica de Gestão de Conta e Criação de Contas no Web App
function setupAccountHandlers() {
  const accountModal = document.getElementById('accountModal');
  const btnOpen = document.getElementById('btnOpenAccountModal');
  const btnClose = document.getElementById('btnCloseAccountModal');
  const btnQuick = document.getElementById('btnQuickAccount');
  const tabRegister = document.getElementById('tabRegister');
  const tabLogin = document.getElementById('tabLogin');
  const registerForm = document.getElementById('registerForm');
  const loginForm = document.getElementById('loginForm');
  const loggedInView = document.getElementById('loggedInView');
  const btnLogout = document.getElementById('btnLogoutUser');

  function openAccountModal() {
    updateAccountModalView();
    accountModal.classList.remove('hidden');
  }

  btnOpen.addEventListener('click', openAccountModal);
  if (btnQuick) btnQuick.addEventListener('click', openAccountModal);
  btnClose.addEventListener('click', () => accountModal.classList.add('hidden'));

  tabRegister.addEventListener('click', () => {
    tabRegister.style.background = 'var(--accent-blue)';
    tabRegister.style.color = '#04101e';
    tabLogin.style.background = 'var(--bg-card)';
    tabLogin.style.color = 'var(--text-secondary)';
    registerForm.classList.remove('hidden');
    loginForm.classList.add('hidden');
  });

  tabLogin.addEventListener('click', () => {
    tabLogin.style.background = 'var(--accent-blue)';
    tabLogin.style.color = '#04101e';
    tabRegister.style.background = 'var(--bg-card)';
    tabRegister.style.color = 'var(--text-secondary)';
    loginForm.classList.remove('hidden');
    registerForm.classList.add('hidden');
  });

  // Submit Criar Conta
  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('regName').value.trim();
    const username = document.getElementById('regUsername').value.trim();
    const password = document.getElementById('regPassword').value;
    const deviceName = document.getElementById('regDeviceName').value.trim();

    try {
      const endpoint = trackerState.serverUrl
        ? `${trackerState.serverUrl.replace(/\/$/, '')}/api/auth/register`
        : '/api/auth/register';

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, username, password, device_name: deviceName })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erro ao criar conta');
      }

      // Sucesso na criação de conta
      trackerState.user = data.user;
      trackerState.token = data.device.token;
      trackerState.deviceName = data.device.name;

      localStorage.setItem('tracker_user', JSON.stringify(data.user));
      localStorage.setItem('tracker_token', data.device.token);
      localStorage.setItem('tracker_device_name', data.device.name);
      localStorage.setItem('tracker_auth_jwt', data.token);

      accountModal.classList.add('hidden');
      updateAccountUI();
      updateConfigForm();
      addLog(`Conta criada para ${data.user.name}! Rastreador ativado automaticamente.`, 'success');
      alert(`Conta criada com sucesso! Seu identificador na central é: ${data.device.name}`);
    } catch (err) {
      alert(err.message);
      addLog(`Falha no cadastro: ${err.message}`, 'error');
    }
  });

  // Submit Login
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value;

    try {
      const endpoint = trackerState.serverUrl
        ? `${trackerState.serverUrl.replace(/\/$/, '')}/api/auth/login`
        : '/api/auth/login';

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Credenciais inválidas');
      }

      trackerState.user = data.user;
      localStorage.setItem('tracker_user', JSON.stringify(data.user));
      localStorage.setItem('tracker_auth_jwt', data.token);

      accountModal.classList.add('hidden');
      updateAccountUI();
      addLog(`Login efetuado como ${data.user.name}`, 'success');
    } catch (err) {
      alert(err.message);
      addLog(`Falha no login: ${err.message}`, 'error');
    }
  });

  // Logout
  btnLogout.addEventListener('click', () => {
    trackerState.user = null;
    localStorage.removeItem('tracker_user');
    localStorage.removeItem('tracker_auth_jwt');
    updateAccountUI();
    updateAccountModalView();
    addLog('Você saiu da sua conta.', 'info');
  });
}

function updateAccountModalView() {
  const tabs = document.querySelector('.account-tabs');
  const registerForm = document.getElementById('registerForm');
  const loginForm = document.getElementById('loginForm');
  const loggedInView = document.getElementById('loggedInView');

  if (trackerState.user) {
    if (tabs) tabs.classList.add('hidden');
    registerForm.classList.add('hidden');
    loginForm.classList.add('hidden');
    loggedInView.classList.remove('hidden');

    document.getElementById('viewUsername').textContent = trackerState.user.username;
    document.getElementById('viewName').textContent = trackerState.user.name;
    document.getElementById('viewToken').textContent = trackerState.token || 'Nenhum token ativo';
  } else {
    if (tabs) tabs.classList.remove('hidden');
    registerForm.classList.remove('hidden');
    loginForm.classList.add('hidden');
    loggedInView.classList.add('hidden');
  }
}

function updateAccountUI() {
  const banner = document.getElementById('accountBanner');
  const nameLabel = document.getElementById('bannerAccountName');
  const statusLabel = document.getElementById('bannerAccountStatus');
  const headerSubtitle = document.getElementById('headerUserSubtitle');
  const infoDeviceName = document.getElementById('infoDeviceName');

  if (trackerState.user) {
    nameLabel.textContent = `Olá, ${trackerState.user.name}`;
    statusLabel.textContent = `Conta ativa (@${trackerState.user.username}) • Transmitindo à central`;
    if (headerSubtitle) headerSubtitle.textContent = trackerState.user.name;
    if (infoDeviceName) infoDeviceName.textContent = trackerState.deviceName || trackerState.user.name;
    const btnQuick = document.getElementById('btnQuickAccount');
    if (btnQuick) btnQuick.textContent = 'Ver Conta';
  } else {
    nameLabel.textContent = 'Usuário não autenticado';
    statusLabel.textContent = 'Crie uma conta para transmitir sua localização à central';
    if (headerSubtitle) headerSubtitle.textContent = 'Web App do Usuário';
    if (infoDeviceName) infoDeviceName.textContent = trackerState.deviceName || trackerState.token.slice(0, 20);
    const btnQuick = document.getElementById('btnQuickAccount');
    if (btnQuick) btnQuick.textContent = 'Entrar / Criar Conta';
  }
}

function updateConfigForm() {
  document.getElementById('cfgToken').value = trackerState.token;
  document.getElementById('cfgServerUrl').value = trackerState.serverUrl;
  document.getElementById('cfgInterval').value = trackerState.intervalSec;
  document.getElementById('cfgSimulateGps').checked = trackerState.simulateGps;
}

// Iniciar ou Parar Rastreamento
async function toggleTracking() {
  if (trackerState.isTracking) {
    stopTracking();
  } else {
    await startTracking();
  }
}

async function startTracking() {
  if (!trackerState.token) {
    alert('Por favor, informe o Token do Dispositivo nas configurações ou crie uma conta.');
    document.getElementById('accountModal').classList.remove('hidden');
    return;
  }

  trackerState.isTracking = true;
  updateStatusBanner(true, 'Rastreador Conectado e Transmitindo para a Central');
  updateTrackingButtonUI(true);

  // Solicitar Wake Lock para não desligar a tela no celular
  requestWakeLock();

  // Enviar imediatamente uma primeira posição
  if (trackerState.simulateGps) {
    stepSimulation();
  } else if ('geolocation' in navigator) {
    navigator.geolocation.getCurrentPosition(
      (pos) => handleNewGpsPosition(pos),
      (err) => {
        console.warn('Aviso ao obter posição inicial via GPS:', err);
        addLog(`Aviso GPS: ${err.message}. Ativando modo simulação.`, 'error');
        // Fallback para teste
        stepSimulation();
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );

    // Iniciar watchPosition
    try {
      trackerState.watchId = navigator.geolocation.watchPosition(
        (pos) => handleNewGpsPosition(pos),
        (err) => console.warn('watchPosition erro:', err),
        { enableHighAccuracy: true, maximumAge: 3000, timeout: 15000 }
      );
    } catch (e) {
      console.warn('Erro ao chamar watchPosition:', e);
    }
  } else {
    addLog('Navegador não suporta Geolocation API. Usando simulação.', 'error');
    trackerState.simulateGps = true;
    stepSimulation();
  }

  // Agendar transmissão periódica
  const intervalMs = Math.max(1000, trackerState.intervalSec * 1000);
  trackerState.timerId = setInterval(() => {
    if (trackerState.simulateGps) {
      stepSimulation();
    } else {
      transmitPosition(trackerState.currentPosition);
    }
  }, intervalMs);

  addLog(`Transmissão iniciada (Ciclo: ${trackerState.intervalSec}s)`, 'success');
}

function stopTracking() {
  trackerState.isTracking = false;
  updateStatusBanner(false, 'Rastreador Parado');
  updateTrackingButtonUI(false);

  if (trackerState.watchId !== null) {
    navigator.geolocation.clearWatch(trackerState.watchId);
    trackerState.watchId = null;
  }

  if (trackerState.timerId !== null) {
    clearInterval(trackerState.timerId);
    trackerState.timerId = null;
  }

  releaseWakeLock();
  addLog('Rastreamento pausado pelo usuário.', 'error');
}

function handleNewGpsPosition(position) {
  const coords = position.coords;
  const speedKmH = coords.speed !== null && !isNaN(coords.speed) ? Math.round(coords.speed * 3.6 * 10) / 10 : 0;

  trackerState.currentPosition = {
    lat: coords.latitude,
    lng: coords.longitude,
    accuracy: Math.round(coords.accuracy || 0),
    speed: speedKmH,
    heading: Math.round(coords.heading || 0),
    timestamp: new Date().toISOString()
  };

  updateTelemetryUI();
  updateMapPosition(coords.latitude, coords.longitude);
  transmitPosition(trackerState.currentPosition);
}

function stepSimulation() {
  const currentStep = SIMULATED_PATH[trackerState.simStep % SIMULATED_PATH.length];
  trackerState.simStep++;

  // Leve jitter para parecer movimento fluido em testes longos
  const latJitter = (Math.random() - 0.5) * 0.0003;
  const lngJitter = (Math.random() - 0.5) * 0.0003;

  trackerState.currentPosition = {
    lat: currentStep.lat + latJitter,
    lng: currentStep.lng + lngJitter,
    accuracy: 8,
    speed: currentStep.speed,
    heading: currentStep.heading,
    timestamp: new Date().toISOString()
  };

  updateTelemetryUI();
  updateMapPosition(trackerState.currentPosition.lat, trackerState.currentPosition.lng);
  transmitPosition(trackerState.currentPosition);
}

// Transmissão de telemetria via POST /api/posicao para a central
async function transmitPosition(pos) {
  if (!pos || pos.lat === null || pos.lng === null) return;

  const endpoint = trackerState.serverUrl
    ? `${trackerState.serverUrl.replace(/\/$/, '')}/api/posicao`
    : '/api/posicao';

  const payload = {
    latitude: pos.lat,
    longitude: pos.lng,
    speed: pos.speed || 0,
    heading: pos.heading || 0,
    timestamp: pos.timestamp || new Date().toISOString()
  };

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${trackerState.token}`
      },
      body: JSON.stringify(payload)
    });

    const data = await res.json();

    if (res.ok) {
      trackerState.packetsSent++;
      document.getElementById('telemetryLastSent').textContent = new Date().toLocaleTimeString('pt-BR');
      addLog(`Enviado à central (${pos.lat.toFixed(4)}, ${pos.lng.toFixed(4)}) - ${pos.speed} km/h`, 'success');
    } else {
      trackerState.packetsError++;
      addLog(`Erro na central: ${data.error || res.statusText}`, 'error');
    }
  } catch (err) {
    trackerState.packetsError++;
    addLog(`Falha na conexão: ${err.message}`, 'error');
  }

  updateMetricsUI();
}

function updateTelemetryUI() {
  const p = trackerState.currentPosition;
  document.getElementById('telemetrySpeed').textContent = p.speed !== null ? Number(p.speed).toFixed(1) : '0.0';
  document.getElementById('telemetryAccuracy').textContent = p.accuracy !== null ? p.accuracy : '--';
  document.getElementById('telemetryHeading').textContent = p.heading !== null ? `${p.heading}` : '--';
  document.getElementById('telemetryLat').textContent = p.lat !== null ? p.lat.toFixed(6) : '--';
  document.getElementById('telemetryLng').textContent = p.lng !== null ? p.lng.toFixed(6) : '--';
}

function updateMetricsUI() {
  document.getElementById('telemetryPackets').textContent = trackerState.packetsSent;
  document.getElementById('telemetryErrors').textContent = `/ ${trackerState.packetsError} erros`;
}

function updateMapPosition(lat, lng) {
  if (!trackerState.map) return;

  const latLng = [lat, lng];
  trackerState.marker.setLatLng(latLng);

  trackerState.routePoints.push(latLng);
  // Manter no máximo 100 pontos para leveza no mobile
  if (trackerState.routePoints.length > 100) {
    trackerState.routePoints.shift();
  }
  trackerState.polyline.setLatLngs(trackerState.routePoints);

  trackerState.map.panTo(latLng, { animate: true });
}

function updateStatusBanner(isActive, message) {
  const banner = document.getElementById('statusBanner');
  const text = document.getElementById('statusText');

  if (isActive) {
    banner.className = 'status-banner status-active';
  } else {
    banner.className = 'status-banner status-inactive';
  }
  text.textContent = message;
}

function updateTrackingButtonUI(isTracking) {
  const btn = document.getElementById('btnToggleTracking');
  const title = document.getElementById('btnTrackingTitle');
  const subtitle = document.getElementById('btnTrackingSubtitle');
  const iconStart = document.getElementById('iconStart');
  const iconStop = document.getElementById('iconStop');

  if (isTracking) {
    btn.className = 'btn-tracking btn-stop';
    title.textContent = 'PARAR RASTREAMENTO';
    subtitle.textContent = 'Toque para interromper a transmissão à central';
    iconStart.classList.add('hidden');
    iconStop.classList.remove('hidden');
  } else {
    btn.className = 'btn-tracking btn-start';
    title.textContent = 'INICIAR TRANSMISSÃO';
    subtitle.textContent = 'Enviar localização atual para a central';
    iconStart.classList.remove('hidden');
    iconStop.classList.add('hidden');
  }
}

// Wake Lock API para manter a tela do celular acesa
async function requestWakeLock() {
  if ('wakeLock' in navigator) {
    try {
      trackerState.wakeLock = await navigator.wakeLock.request('screen');
      document.getElementById('wakeLockBadge').classList.remove('hidden');
    } catch (err) {
      console.warn('Wake Lock request falhou:', err);
      document.getElementById('wakeLockBadge').classList.add('hidden');
    }
  } else {
    document.getElementById('wakeLockBadge').classList.add('hidden');
  }
}

function releaseWakeLock() {
  if (trackerState.wakeLock !== null) {
    trackerState.wakeLock.release().then(() => {
      trackerState.wakeLock = null;
      document.getElementById('wakeLockBadge').classList.add('hidden');
    });
  }
}

function addLog(msg, type = 'info') {
  const logList = document.getElementById('logList');
  const empty = logList.querySelector('.empty');
  if (empty) empty.remove();

  const time = new Date().toLocaleTimeString('pt-BR');
  const item = document.createElement('div');
  item.className = `log-item ${type}`;
  item.innerHTML = `<span>${msg}</span><span style="opacity:0.6;margin-left:8px;">${time}</span>`;

  logList.insertBefore(item, logList.firstChild);

  // Limite de 20 logs no display
  while (logList.children.length > 20) {
    logList.removeChild(logList.lastChild);
  }
}
