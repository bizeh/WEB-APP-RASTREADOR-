const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');

describe('Suíte de Testes do Web App Rastreador Mobile', () => {
  let appModule;
  let server;
  let port;
  let baseUrl;

  before(async () => {
    // Carregar app e iniciar porta livre
    appModule = require('../src/server');
    server = appModule.server;

    await new Promise((resolve) => {
      server.listen(0, () => {
        port = server.address().port;
        baseUrl = `http://localhost:${port}`;
        resolve();
      });
    });
  });

  after(async () => {
    if (appModule.stopOfflineCheck) {
      appModule.stopOfflineCheck();
    }
    await new Promise((resolve) => server.close(resolve));
  });

  test('1. Acesso às rotas do Web App Mobile (/rastreador e /mobile)', async () => {
    const resRastreador = await fetch(`${baseUrl}/rastreador`);
    assert.strictEqual(resRastreador.status, 200);
    const htmlRastreador = await resRastreador.text();
    assert.ok(htmlRastreador.includes('Rastreador Mobile - Transmissão GPS'));
    assert.ok(htmlRastreador.includes('INICIAR RASTREAMENTO'));

    const resMobile = await fetch(`${baseUrl}/mobile`);
    assert.strictEqual(resMobile.status, 200);
    const htmlMobile = await resMobile.text();
    assert.ok(htmlMobile.includes('Rastreador Mobile - Transmissão GPS'));
  });

  test('2. Envio de telemetria pelo Rastreador Mobile com token válido', async () => {
    const payload = {
      latitude: -23.561684,
      longitude: -46.655981,
      speed: 38.5,
      heading: 90,
      timestamp: new Date().toISOString()
    };

    const res = await fetch(`${baseUrl}/api/posicao`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer token-secreto-tracker-001'
      },
      body: JSON.stringify(payload)
    });

    assert.strictEqual(res.status, 201);
    const data = await res.json();
    assert.strictEqual(data.message, 'Posição registrada com sucesso');
    assert.strictEqual(data.device.device_id, 'TRACKER-001');
    assert.strictEqual(data.device.status, 'online');
    assert.strictEqual(data.device.lat, payload.latitude);
    assert.strictEqual(data.device.lng, payload.longitude);
    assert.strictEqual(data.device.speed, payload.speed);
  });

  test('3. Envio de telemetria sem token (401) e com token inválido (403)', async () => {
    // Sem token -> 401
    const resNoToken = await fetch(`${baseUrl}/api/posicao`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ latitude: -23.5, longitude: -46.6 })
    });
    assert.strictEqual(resNoToken.status, 401);

    // Token inexistente -> 403
    const resBadToken = await fetch(`${baseUrl}/api/posicao`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer token-inexistente-123'
      },
      body: JSON.stringify({ latitude: -23.5, longitude: -46.6 })
    });
    assert.strictEqual(resBadToken.status, 403);
    const data = await resBadToken.json();
    assert.ok(data.error.includes('Token de rastreador inválido'));
  });

  test('4. Validação de coordenadas inválidas ou fora dos limites', async () => {
    // Coordenada fora do limite
    const res = await fetch(`${baseUrl}/api/posicao`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer token-secreto-tracker-001'
      },
      body: JSON.stringify({ latitude: 120.0, longitude: -46.6 })
    });

    assert.strictEqual(res.status, 400);
  });
});
