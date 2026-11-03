const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const db = require('../db/database');
const crypto = require('crypto');
const { authUser, JWT_SECRET } = require('../middleware/auth');

// POST /api/auth/register - Cadastro de nova conta pelo web app
router.post('/register', (req, res) => {
  const { username, password, name, device_name } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Usuário e senha são obrigatórios' });
  }

  if (typeof username !== 'string' || username.trim().length < 3) {
    return res.status(400).json({ error: 'O nome de usuário deve ter no mínimo 3 caracteres' });
  }

  if (typeof password !== 'string' || password.length < 4) {
    return res.status(400).json({ error: 'A senha deve ter no mínimo 4 caracteres' });
  }

  const cleanUsername = username.trim().toLowerCase();
  const existingUser = db.getUserByUsername(cleanUsername);
  if (existingUser) {
    return res.status(409).json({ error: 'Este nome de usuário já está em uso' });
  }

  const displayName = name ? name.trim() : cleanUsername;

  try {
    const newUser = db.createUser({
      username: cleanUsername,
      password,
      name: displayName,
      role: 'usuario'
    });

    // Criar automaticamente um dispositivo/token de rastreamento para o usuário
    const deviceId = `USR-${cleanUsername.toUpperCase().replace(/[^A-Z0-9]/g, '')}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
    const deviceToken = `token-usr-${crypto.randomBytes(16).toString('hex')}`;
    const trackerName = device_name ? device_name.trim() : `${displayName} (Mobile)`;

    const device = db.createDevice({
      device_id: deviceId,
      name: trackerName,
      token: deviceToken
    });

    const token = jwt.sign(
      { id: newUser.id, username: newUser.username, role: newUser.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    return res.status(201).json({
      message: 'Conta criada com sucesso!',
      token,
      user: newUser,
      device: {
        device_id: device.device_id,
        name: device.name,
        token: device.token
      }
    });
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao registrar usuário: ' + err.message });
  }
});

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Usuário e senha são obrigatórios' });
  }

  const user = db.getUserByUsername(username);
  if (!user) {
    return res.status(401).json({ error: 'Credenciais inválidas' });
  }

  const match = bcrypt.compareSync(password, user.password_hash);
  if (!match) {
    return res.status(401).json({ error: 'Credenciais inválidas' });
  }

  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: '24h' }
  );

  return res.json({
    message: 'Login realizado com sucesso',
    token,
    user: {
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role
    }
  });
});

// GET /api/auth/me
router.get('/me', authUser, (req, res) => {
  res.json({
    user: req.user
  });
});

module.exports = router;
