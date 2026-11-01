const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const db = require('../db/database');
const { authUser, authDevice } = require('../middleware/auth');

module.exports = function(io) {
  // POST /api/posicao - Usado pelos rastreadores (autenticado por token)
  router.post('/posicao', authDevice, (req, res) => {
    let { lat, lng, latitude, longitude, speed, heading, timestamp } = req.body;

    // Normalização das chaves lat/latitude, lng/longitude
    const finalLat = lat !== undefined ? Number(lat) : (latitude !== undefined ? Number(latitude) : null);
    const finalLng = lng !== undefined ? Number(lng) : (longitude !== undefined ? Number(longitude) : null);

    if (finalLat === null || isNaN(finalLat) || finalLng === null || isNaN(finalLng)) {
      return res.status(400).json({
        error: 'Coordenadas inválidas. Os campos lat (ou latitude) e lng (ou longitude) devem ser números válidos.'
      });
    }

    if (finalLat < -90 || finalLat > 90 || finalLng < -180 || finalLng > 180) {
      return res.status(400).json({ error: 'Coordenadas geográficas fora dos limites válidos.' });
    }

    const finalSpeed = speed !== undefined ? Math.max(0, Number(speed)) : 0;
    const finalHeading = heading !== undefined ? Number(heading) : 0;
    const finalTimestamp = timestamp ? new Date(timestamp).toISOString() : new Date().toISOString();

    const device = req.device;

    // Salvar no SQLite e atualizar status do dispositivo
    const updatedDevice = db.updateDevicePosition(device.device_id, {
      lat: finalLat,
      lng: finalLng,
      speed: finalSpeed,
      heading: finalHeading,
      timestamp: finalTimestamp
    });

    const positionPayload = {
      device_id: device.device_id,
      name: device.name,
      lat: finalLat,
      lng: finalLng,
      speed: finalSpeed,
      heading: finalHeading,
      timestamp: finalTimestamp,
      status: 'online'
    };

    // Emitir atualização em tempo real para os clientes conectados na central
    if (io) {
      io.emit('nova_posicao', positionPayload);
      io.emit('dispositivo_status', {
        device_id: device.device_id,
        status: 'online',
        last_seen: finalTimestamp
      });
    }

    return res.status(201).json({
      message: 'Posição registrada com sucesso',
      device: {
        device_id: updatedDevice.device_id,
        name: updatedDevice.name,
        status: 'online',
        lat: finalLat,
        lng: finalLng,
        speed: finalSpeed,
        heading: finalHeading,
        timestamp: finalTimestamp
      }
    });
  });

  // GET /api/dispositivos - Central de monitoramento (pode ser consultado com JWT ou aberto se preferir, protegemos com authUser para segurança mas flexível)
  router.get('/dispositivos', authUser, (req, res) => {
    const devices = db.listDevices();
    return res.json({ dispositivos: devices });
  });

  // POST /api/dispositivos - Cadastro de novo rastreador
  router.post('/dispositivos', authUser, (req, res) => {
    const { device_id, name, token } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Nome do dispositivo é obrigatório' });
    }

    const finalDeviceId = device_id ? device_id.trim() : `DEV-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    const finalToken = token ? token.trim() : `token-${crypto.randomBytes(16).toString('hex')}`;

    const existing = db.getDeviceByDeviceId(finalDeviceId);
    if (existing) {
      return res.status(409).json({ error: `Dispositivo com ID "${finalDeviceId}" já existe.` });
    }

    const created = db.createDevice({
      device_id: finalDeviceId,
      name: name.trim(),
      token: finalToken
    });

    // Notificar central via Socket
    if (io) {
      io.emit('dispositivo_criado', created);
    }

    return res.status(201).json({
      message: 'Dispositivo cadastrado com sucesso',
      dispositivo: created
    });
  });

  // GET /api/dispositivos/:id/historico - Histórico de trajeto
  router.get('/dispositivos/:id/historico', authUser, (req, res) => {
    const deviceId = req.params.id;
    const device = db.getDeviceByDeviceId(deviceId);

    if (!device) {
      return res.status(404).json({ error: 'Dispositivo não encontrado' });
    }

    const { from, to, limit } = req.query;
    const history = db.getDeviceHistory(deviceId, {
      from,
      to,
      limit: limit ? Number(limit) : 500
    });

    return res.json({
      device: {
        device_id: device.device_id,
        name: device.name,
        status: device.status
      },
      historico: history,
      total_pontos: history.length
    });
  });

  return router;
};
