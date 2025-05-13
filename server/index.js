const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const zlib = require('zlib');
const path = require('path');

const { Game } = require('../game/game');
const { MapManager } = require('../game/map');
const config = require('./config');
const { handleNewConnection } = require('./handlers/connectionHandler');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static(config.STATIC_PATH, {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript');
    }
  }
}));

// Route for the map editor
app.get('/mapeditor', (req, res) => {
  res.sendFile(path.join(config.STATIC_PATH, 'mapeditor.html'));
});

const mapManager = new MapManager();
const game = new Game(mapManager);

function broadcast(stringMessage, excludeWs = null) {
  const compressedMessage = zlib.gzipSync(Buffer.from(stringMessage));
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN && client !== excludeWs) {
      try {
        client.send(compressedMessage, { binary: true });
      } catch (e) {
        console.error('Failed to send message to client:', e);
      }
    }
  });
}

wss.on('connection', async (ws, req) => {
  await handleNewConnection(ws, req, game, broadcast);
});

game.start();

server.listen(config.PORT, () => {
  console.log(`Server running on port ${config.PORT}`);
  console.log(`Map editor available at http://localhost:${config.PORT}/mapeditor`);
});

process.on('SIGINT', () => {
  console.log('Shutting down server...');
  server.close(() => {
    console.log('Server closed');
    game.stop();
    process.exit(0);
  });
});

module.exports = { server, app, game }; 