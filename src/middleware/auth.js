const jwt = require('jsonwebtoken');
const db = require('../db/database');

const JWT_SECRET = process.env.JWT_SECRET || 'central_rastreamento_jwt_secret_super_seguro_2025';

// Autenticação para operadores/usuários da central
function authUser(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) {
    return res.status(401).json({ error: 'Token de autenticação não fornecido' });
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return res.status(401).json({ error: 'Formato do cabeçalho Authorization inválido. Use: Bearer <token>' });
  }

  const token = parts[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = db.getUserById(decoded.id);
    if (!user) {
      return res.status(401).json({ error: 'Usuário não encontrado ou inativo' });
    }
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token inválido ou expirado' });
  }
}

// Autenticação para rastreadores (dispositivos físicos ou simuladores)
function authDevice(req, res, next) {
  let token = null;

  // 1. Bearer Token
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  }

  // 2. Header customizado X-Device-Token ou X-Token
  if (!token && req.headers['x-device-token']) {
    token = req.headers['x-device-token'].trim();
  }
  if (!token && req.headers['x-token']) {
    token = req.headers['x-token'].trim();
  }

  // 3. Query param token (opcional, comum em dispositivos IoT de baixo custo)
  if (!token && req.query && req.query.token) {
    token = req.query.token;
  }

  // 4. Body token
  if (!token && req.body && req.body.token) {
    token = req.body.token;
  }

  if (!token) {
    return res.status(401).json({
      error: 'Token do rastreador não fornecido. Envie via Authorization: Bearer <token>, X-Device-Token ou no corpo da requisição.'
    });
  }

  const device = db.getDeviceByToken(token);
  if (!device) {
    return res.status(403).json({ error: 'Token de rastreador inválido ou dispositivo não cadastrado.' });
  }

  req.device = device;
  next();
}

module.exports = {
  authUser,
  authDevice,
  JWT_SECRET
};
