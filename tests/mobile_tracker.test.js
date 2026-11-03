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
    assert.ok(htmlRastreador.includes('INICIAR TRANSMISSÃO'));
    assert.ok(htmlRastreador.includes('Criar Nova Conta'));

    const resMobile = await fetch(`${baseUrl}/mobile`);
    assert.strictEqual(resMobile.status, 200);
    const htmlMobile = await resMobile.text();
    assert.ok(htmlMobile.includes('Rastreador Mobile - Transmissão GPS'));
  });

  test('2. Criação de nova conta de usuário pelo Web App (POST /api/auth/register)', async () => {
    const testUsername = `user_app_${Date.now()}`;
    const payload = {
      username: testUsername,
      password: 'password123',
      name: 'Entregador Carlos',
      device_name: 'Moto Entrega Carlos'
    };

    const res = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    assert.strictEqual(res.status, 201);
    const data = await res.json();
    assert.strictEqual(data.message, 'Conta criada com sucesso!');
    assert.ok(data.token, 'Deve retornar token JWT');
    assert.strictEqual(data.user.username, testUsername);
    assert.strictEqual(data.user.name, payload.name);
    assert.ok(data.device.token.startsWith('token-usr-'));
    assert.strictEqual(data.device.name, payload.device_name);

    // Enviar posição usando o token do dispositivo recém-criado
    const posRes = await fetch(`${baseUrl}/api/posicao`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${data.device.token}`
      },
      body: JSON.stringify({
        latitude: -23.55052,
        longitude: -46.633308,
        speed: 25.0
      })
    });

    assert.strictEqual(posRes.status, 201);
    const posData = await posRes.json();
    assert.strictEqual(posData.device.name, payload.device_name);
    assert.strictEqual(posData.device.lat, -23.55052);
    assert.strictEqual(posData.device.lng, -46.633308);
  });

  test('3. Rejeição de cadastro duplicado ou inválido', async () => {
    // Cadastro sem senha
    const resNoPass = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'someone' })
    });
    assert.strictEqual(resNoPass.status, 400);

    // Cadastro com usuário já existente (admin)
    const resAdmin = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'password123' })
    });
    assert.strictEqual(resAdmin.status, 409);
  });

  test('4. Envio de telemetria pelo Rastreador Mobile com token válido', async () => {
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

  test('5. Envio de telemetria sem token (401) e com token inválido (403)', async () => {
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

  test('6. Validação de coordenadas inválidas ou fora dos limites', async () => {
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
