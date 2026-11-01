/**
 * Script Simulador de Rastreador GPS
 * Simula a emissão periódica de coordenadas (lat, lng, speed, heading)
 * para o endpoint POST /api/posicao com token de autenticação.
 *
 * Uso:
 *   node scripts/simulador.js
 *   node scripts/simulador.js --token=token-secreto-tracker-001 --interval=3000
 *   node scripts/simulador.js --all (simula múltiplos rastreadores simultâneos)
 */

const http = require('http');

// Configurações padrão
const SERVER_URL = process.env.API_URL || 'http://localhost:3000';
const DEFAULT_INTERVAL_MS = 3000;

// Trajetos simulados em São Paulo (Avenida Paulista -> Consolação -> Centro)
const ROTA_SP_CAMINHAO = [
  { lat: -23.567084, lng: -46.649981, speed: 38.0, heading: 45 },
  { lat: -23.565184, lng: -46.652181, speed: 42.5, heading: 45 },
  { lat: -23.563084, lng: -46.654581, speed: 45.0, heading: 50 },
  { lat: -23.561684, lng: -46.655981, speed: 48.0, heading: 50 },
  { lat: -23.558284, lng: -46.659981, speed: 50.2, heading: 52 },
  { lat: -23.555084, lng: -46.662581, speed: 41.0, heading: 60 },
  { lat: -23.552084, lng: -46.659581, speed: 35.5, heading: 70 },
  { lat: -23.548984, lng: -46.654281, speed: 39.0, heading: 80 },
  { lat: -23.546084, lng: -46.648081, speed: 32.0, heading: 90 },
  { lat: -23.543584, lng: -46.642081, speed: 28.5, heading: 85 },
  { lat: -23.541084, lng: -46.637081, speed: 30.0, heading: 75 },
  { lat: -23.538584, lng: -46.633081, speed: 34.0, heading: 65 }
];

// Rota 2 (Vila Mariana -> Ibirapuera -> Moema)
const ROTA_SP_MOTO = [
  { lat: -23.589541, lng: -46.634603, speed: 35.0, heading: 220 },
  { lat: -23.588141, lng: -46.638603, speed: 40.5, heading: 230 },
  { lat: -23.586241, lng: -46.643603, speed: 44.0, heading: 240 },
  { lat: -23.584041, lng: -46.649603, speed: 52.0, heading: 250 },
  { lat: -23.582541, lng: -46.655603, speed: 48.0, heading: 260 },
  { lat: -23.585541, lng: -46.662603, speed: 42.0, heading: 200 },
  { lat: -23.591041, lng: -46.665603, speed: 38.0, heading: 180 },
  { lat: -23.597541, lng: -46.667603, speed: 45.0, heading: 170 },
  { lat: -23.602541, lng: -46.665603, speed: 49.0, heading: 160 }
];

// Parser de argumentos
const args = process.argv.slice(2).reduce((acc, arg) => {
  if (arg.startsWith('--')) {
    const [key, val] = arg.slice(2).split('=');
    acc[key] = val !== undefined ? val : true;
  }
  return acc;
}, {});

const targetToken = args.token || 'token-secreto-tracker-001';
const intervalMs = parseInt(args.interval, 10) || DEFAULT_INTERVAL_MS;
const simulateAll = !!args.all;

// Função para enviar posição via HTTP POST
function enviarPosicao(token, ponto, rastreadorNome) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${SERVER_URL}/api/posicao`);
    const payload = JSON.stringify({
      lat: ponto.lat,
      lng: ponto.lng,
      speed: ponto.speed,
      heading: ponto.heading,
      timestamp: new Date().toISOString()
    });

    const options = {
      hostname: url.hostname,
      port: url.port || 80,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'Content-Length': Buffer.byteLength(payload)
      }
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          const resp = JSON.parse(body);
          console.log(`[Rastreador: ${rastreadorNome}] Posição enviada com sucesso! Coords: (${ponto.lat.toFixed(5)}, ${ponto.lng.toFixed(5)}) | Vel: ${ponto.speed} km/h`);
          resolve(resp);
        } else {
          console.error(`[Rastreador: ${rastreadorNome}] Falha ao enviar (Status ${res.statusCode}): ${body}`);
          resolve(null);
        }
      });
    });

    req.on('error', (err) => {
      console.error(`[Rastreador: ${rastreadorNome}] Erro na conexão: ${err.message}`);
      resolve(null);
    });

    req.write(payload);
    req.end();
  });
}

// Iniciar simulação
console.log('========================================================');
console.log(' SIMULADOR DE RASTREADOR GPS INICIADO');
console.log(` Servidor Alvo: ${SERVER_URL}/api/posicao`);
console.log(` Intervalo de envio: ${intervalMs} ms`);
console.log('========================================================');

if (simulateAll) {
  // Simular ambos os veículos
  console.log('Simulando 2 rastreadores em simultâneo (TRACKER-001 e TRACKER-002)...');

  let index1 = 0;
  let index2 = 0;

  setInterval(() => {
    const p1 = ROTA_SP_CAMINHAO[index1 % ROTA_SP_CAMINHAO.length];
    enviarPosicao('token-secreto-tracker-001', p1, 'TRACKER-001');
    index1++;

    const p2 = ROTA_SP_MOTO[index2 % ROTA_SP_MOTO.length];
    enviarPosicao('token-secreto-tracker-002', p2, 'TRACKER-002');
    index2++;
  }, intervalMs);

} else {
  // Simula o dispositivo específico informado
  const rota = targetToken.includes('002') ? ROTA_SP_MOTO : ROTA_SP_CAMINHAO;
  const nome = targetToken.includes('002') ? 'TRACKER-002' : 'TRACKER-001';

  console.log(`Simulando envio para Token: ${targetToken} (${nome})`);

  let index = 0;
  // Envia primeiro ponto imediatamente
  enviarPosicao(targetToken, rota[0], nome);
  index++;

  setInterval(() => {
    const ponto = rota[index % rota.length];
    // Adiciona leve variação de ruído GPS para parecer realista
    const pontoReal = {
      lat: ponto.lat + (Math.random() - 0.5) * 0.0002,
      lng: ponto.lng + (Math.random() - 0.5) * 0.0002,
      speed: Math.round(ponto.speed + (Math.random() - 0.5) * 4),
      heading: ponto.heading
    };

    enviarPosicao(targetToken, pontoReal, nome);
    index++;
  }, intervalMs);
}
