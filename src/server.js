require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

const db = require('./db/database');
const authRoutes = require('./routes/authRoutes');
const createDeviceRoutes = require('./routes/deviceRoutes');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3000;
const OFFLINE_THRESHOLD_SECONDS = parseInt(process.env.OFFLINE_THRESHOLD_SECONDS, 10) || 60;

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../public')));

// Rotas da API
app.use('/api/auth', authRoutes);
app.use('/api', createDeviceRoutes(io));

// Atalho amigável para o Web App Mobile
app.get('/rastreador', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/rastreador.html'));
});

app.get('/mobile', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/rastreador.html'));
});

// Rota de status do sistema
app.get('/api/status', (req, res) => {
  res.json({
    status: 'online',
    app: 'Central de Monitoramento e Rastreamento',
    versao: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// Socket.IO para a Central de Monitoramento
io.on('connection', (socket) => {
  console.log(`[Socket.IO] Cliente conectado: ${socket.id}`);

  // Envia lista atualizada de dispositivos ao conectar
  const devices = db.listDevices();
  socket.emit('dispositivos_lista', devices);

  socket.on('solicitar_dispositivos', () => {
    socket.emit('dispositivos_lista', db.listDevices());
  });

  socket.on('disconnect', () => {
    console.log(`[Socket.IO] Cliente desconectado: ${socket.id}`);
  });
});

// Verificação periódica de dispositivos offline
// Se um dispositivo não enviar sinal há mais de OFFLINE_THRESHOLD_SECONDS segundos, fica 'offline'
const offlineCheckInterval = setInterval(() => {
  try {
    const devicesBefore = db.listDevices();
    const cutoff = new Date(Date.now() - OFFLINE_THRESHOLD_SECONDS * 1000).toISOString();

    devicesBefore.forEach(dev => {
      if (dev.status === 'online' && (!dev.last_seen || dev.last_seen < cutoff)) {
        db.updateDeviceStatus(dev.device_id, 'offline');
        io.emit('dispositivo_status', {
          device_id: dev.device_id,
          status: 'offline',
          last_seen: dev.last_seen
        });
        console.log(`[Status] Dispositivo ${dev.device_id} marcado como OFFLINE`);
      }
    });
  } catch (err) {
    console.error('[Interval Offline Check Error]', err);
  }
}, 10000);
offlineCheckInterval.unref();

function stopOfflineCheck() {
  clearInterval(offlineCheckInterval);
}

// Iniciar servidor caso não seja chamado via teste
if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(` CENTRAL DE MONITORAMENTO & RASTREAMENTO INICIADA `);
    console.log(`====================================================`);
    console.log(` Servidor rodando em: http://localhost:${PORT}`);
    console.log(` Endpoint rastreador: POST http://localhost:${PORT}/api/posicao`);
    console.log(` Painel Web Central: http://localhost:${PORT}`);
    console.log(`====================================================`);
  });
}

module.exports = { app, server, io, stopOfflineCheck };
