const test = require('node:test');
const assert = require('node:assert');
const http = require('http');

// Configurar ambiente de teste com banco em memória ou arquivo temporário
process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test_secret_key_123';
process.env.OFFLINE_THRESHOLD_SECONDS = '2';

const { app, server } = require('../src/server');
const db = require('../src/db/database');

function makeRequest({ path, method = 'GET', headers = {}, body = null }) {
  return new Promise((resolve, reject) => {
    const dataString = body ? JSON.stringify(body) : null;
    const reqHeaders = { ...headers };
    if (dataString) {
      reqHeaders['Content-Type'] = 'application/json';
      reqHeaders['Content-Length'] = Buffer.byteLength(dataString);
    }

    const addr = server.address();
    const req = http.request({
      hostname: '127.0.0.1',
      port: addr.port,
      path,
      method,
      headers: reqHeaders
    }, (res) => {
      let respBody = '';
      res.on('data', chunk => respBody += chunk);
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(respBody);
        } catch {
          json = respBody;
        }
        resolve({ status: res.statusCode, body: json });
      });
    });

    req.on('error', reject);
    if (dataString) req.write(dataString);
    req.end();
  });
}

test('Suíte de Testes da Central de Rastreamento', async (t) => {
  // Iniciar servidor em porta aleatória para testes
  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  let authToken = null;

  await t.test('1. Status da API', async () => {
    const res = await makeRequest({ path: '/api/status' });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.status, 'online');
  });

  await t.test('2. Autenticação de Operador (Login com JWT)', async () => {
    // Tentativa inválida
    const failRes = await makeRequest({
      path: '/api/auth/login',
      method: 'POST',
      body: { username: 'admin', password: 'wrongpassword' }
    });
    assert.strictEqual(failRes.status, 401);

    // Sucesso
    const res = await makeRequest({
      path: '/api/auth/login',
      method: 'POST',
      body: { username: 'admin', password: 'admin123' }
    });
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.token);
    assert.strictEqual(res.body.user.username, 'admin');

    authToken = res.body.token;

    // Checar /me com token
    const meRes = await makeRequest({
      path: '/api/auth/me',
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    assert.strictEqual(meRes.status, 200);
    assert.strictEqual(meRes.body.user.username, 'admin');
  });

  await t.test('3. Envio de Posição pelo Rastreador (POST /api/posicao)', async () => {
    // Sem token
    const noToken = await makeRequest({
      path: '/api/posicao',
      method: 'POST',
      body: { lat: -23.56, lng: -46.65 }
    });
    assert.strictEqual(noToken.status, 401);

    // Token inválido
    const invalidToken = await makeRequest({
      path: '/api/posicao',
      method: 'POST',
      headers: { 'Authorization': 'Bearer token-inexistente' },
      body: { lat: -23.56, lng: -46.65 }
    });
    assert.strictEqual(invalidToken.status, 403);

    // Token válido (TRACKER-001)
    const validRes = await makeRequest({
      path: '/api/posicao',
      method: 'POST',
      headers: { 'Authorization': 'Bearer token-secreto-tracker-001' },
      body: {
        lat: -23.561684,
        lng: -46.655981,
        speed: 48.5,
        heading: 90
      }
    });
    assert.strictEqual(validRes.status, 201);
    assert.strictEqual(validRes.body.device.status, 'online');
    assert.strictEqual(validRes.body.device.lat, -23.561684);
  });

  await t.test('4. Consulta de Dispositivos e Histórico na Central', async () => {
    // Listar dispositivos
    const listRes = await makeRequest({
      path: '/api/dispositivos',
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    assert.strictEqual(listRes.status, 200);
    assert.ok(Array.isArray(listRes.body.dispositivos));
    assert.ok(listRes.body.dispositivos.length >= 2);

    // Consultar histórico do TRACKER-001
    const histRes = await makeRequest({
      path: '/api/dispositivos/TRACKER-001/historico',
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    assert.strictEqual(histRes.status, 200);
    assert.ok(Array.isArray(histRes.body.historico));
    assert.ok(histRes.body.historico.length >= 1);
  });

  await t.test('5. Cadastro de Novo Dispositivo Rastreador', async () => {
    const createRes = await makeRequest({
      path: '/api/dispositivos',
      method: 'POST',
      headers: { 'Authorization': `Bearer ${authToken}` },
      body: {
        device_id: 'TRACKER-NEW-99',
        name: 'Van de Carga 99',
        token: 'token-custom-99'
      }
    });
    assert.strictEqual(createRes.status, 201);
    assert.strictEqual(createRes.body.dispositivo.device_id, 'TRACKER-NEW-99');

    // Testar envio de posição com o novo dispositivo
    const posRes = await makeRequest({
      path: '/api/posicao',
      method: 'POST',
      headers: { 'X-Device-Token': 'token-custom-99' },
      body: { lat: -23.50, lng: -46.60, speed: 20 }
    });
    assert.strictEqual(posRes.status, 201);
  });

  // Finalizar servidor
  await new Promise(resolve => server.close(resolve));
});
