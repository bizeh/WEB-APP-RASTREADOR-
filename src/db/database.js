const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

const dbPath = process.env.DB_PATH || path.join(__dirname, '../../data.db');

// Garante que o diretório existe se for um caminho relativo ou customizado
const dir = path.dirname(dbPath);
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'operador',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS devices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      token TEXT UNIQUE NOT NULL,
      status TEXT NOT NULL DEFAULT 'offline',
      last_lat REAL,
      last_lng REAL,
      last_speed REAL DEFAULT 0,
      last_heading REAL DEFAULT 0,
      last_seen DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS positions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id TEXT NOT NULL,
      lat REAL NOT NULL,
      lng REAL NOT NULL,
      speed REAL DEFAULT 0,
      heading REAL DEFAULT 0,
      timestamp DATETIME NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (device_id) REFERENCES devices(device_id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_positions_device_time
      ON positions(device_id, timestamp DESC);
  `);

  // Seed do usuário admin se a tabela users estiver vazia
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
  if (userCount === 0) {
    const adminHash = bcrypt.hashSync('admin123', 10);
    db.prepare(`
      INSERT INTO users (username, password_hash, name, role)
      VALUES (?, ?, ?, ?)
    `).run('admin', adminHash, 'Administrador Central', 'admin');
    console.log('[DB] Usuário padrão criado: admin / admin123');
  }

  // Seed de rastreadores demonstrativos para teste imediato
  const deviceCount = db.prepare('SELECT COUNT(*) as count FROM devices').get().count;
  if (deviceCount === 0) {
    const insertDevice = db.prepare(`
      INSERT INTO devices (device_id, name, token, status, last_lat, last_lng, last_speed, last_seen)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `);

    // Rastreador 1 - Frota Caminhão SP (Av. Paulista)
    insertDevice.run(
      'TRACKER-001',
      'Caminhão Entrega 01 (São Paulo)',
      'token-secreto-tracker-001',
      'offline',
      -23.561684,
      -46.655981,
      45.0
    );

    // Rastreador 2 - Moto Entrega Express (Vila Mariana)
    insertDevice.run(
      'TRACKER-002',
      'Moto Express 02 (São Paulo)',
      'token-secreto-tracker-002',
      'offline',
      -23.589541,
      -46.634603,
      32.5
    );

    // Inserir histórico inicial para TRACKER-001
    const insertPos = db.prepare(`
      INSERT INTO positions (device_id, lat, lng, speed, heading, timestamp)
      VALUES (?, ?, ?, ?, ?, datetime('now', ?))
    `);

    insertPos.run('TRACKER-001', -23.565000, -46.660000, 40.0, 45, '-15 minutes');
    insertPos.run('TRACKER-001', -23.563500, -46.658000, 42.0, 45, '-10 minutes');
    insertPos.run('TRACKER-001', -23.562200, -46.656800, 44.0, 45, '-5 minutes');
    insertPos.run('TRACKER-001', -23.561684, -46.655981, 45.0, 45, '0 minutes');

    console.log('[DB] Dispositivos de teste criados: TRACKER-001 e TRACKER-002');
  }
}

// Inicializar tabelas e seeds
initDb();

// Métodos auxiliares
const dbMethods = {
  // Usuários
  getUserByUsername(username) {
    return db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  },
  getUserById(id) {
    return db.prepare('SELECT id, username, name, role, created_at FROM users WHERE id = ?').get(id);
  },
  createUser({ username, password, name, role = 'usuario' }) {
    const passwordHash = bcrypt.hashSync(password, 10);
    const stmt = db.prepare(`
      INSERT INTO users (username, password_hash, name, role)
      VALUES (?, ?, ?, ?)
    `);
    const info = stmt.run(username, passwordHash, name, role);
    return {
      id: Number(info.lastInsertRowid),
      username,
      name,
      role
    };
  },

  // Dispositivos
  getDeviceByToken(token) {
    return db.prepare('SELECT * FROM devices WHERE token = ?').get(token);
  },
  getDeviceByDeviceId(deviceId) {
    return db.prepare('SELECT * FROM devices WHERE device_id = ?').get(deviceId);
  },
  listDevices() {
    return db.prepare(`
      SELECT id, device_id, name, token, status, last_lat, last_lng, last_speed, last_heading, last_seen, created_at
      FROM devices
      ORDER BY name ASC
    `).all();
  },
  createDevice({ device_id, name, token }) {
    const stmt = db.prepare(`
      INSERT INTO devices (device_id, name, token, status)
      VALUES (?, ?, ?, 'offline')
    `);
    const info = stmt.run(device_id, name, token);
    return { id: info.lastInsertRowid, device_id, name, token, status: 'offline' };
  },
  updateDevicePosition(deviceId, { lat, lng, speed = 0, heading = 0, timestamp }) {
    const formattedTimestamp = timestamp || new Date().toISOString();
    const update = db.prepare(`
      UPDATE devices
      SET last_lat = ?,
          last_lng = ?,
          last_speed = ?,
          last_heading = ?,
          last_seen = ?,
          status = 'online'
      WHERE device_id = ?
    `);
    update.run(lat, lng, speed, heading, formattedTimestamp, deviceId);

    const insertPos = db.prepare(`
      INSERT INTO positions (device_id, lat, lng, speed, heading, timestamp)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    insertPos.run(deviceId, lat, lng, speed, heading, formattedTimestamp);

    return db.prepare('SELECT * FROM devices WHERE device_id = ?').get(deviceId);
  },
  updateDeviceStatus(deviceId, status) {
    db.prepare('UPDATE devices SET status = ? WHERE device_id = ?').run(status, deviceId);
  },
  markInactiveDevicesOffline(thresholdSeconds = 60) {
    const cutoff = new Date(Date.now() - thresholdSeconds * 1000).toISOString();
    const stmt = db.prepare(`
      UPDATE devices
      SET status = 'offline'
      WHERE status = 'online' AND (last_seen IS NULL OR last_seen < ?)
    `);
    const result = stmt.run(cutoff);
    return result.changes;
  },

  // Posições / Histórico
  getDeviceHistory(deviceId, { from, to, limit = 500 } = {}) {
    let query = `
      SELECT id, device_id, lat, lng, speed, heading, timestamp
      FROM positions
      WHERE device_id = ?
    `;
    const params = [deviceId];

    if (from) {
      query += ' AND timestamp >= ?';
      params.push(from);
    }
    if (to) {
      query += ' AND timestamp <= ?';
      params.push(to);
    }

    query += ' ORDER BY timestamp ASC LIMIT ?';
    params.push(limit);

    return db.prepare(query).all(...params);
  },

  // Instância crua para testes
  _rawDb: db
};

module.exports = dbMethods;
