const http = require('http');
const WebSocket = require('ws');
const websocketHandler = require('./routes/websocket');
const fs = require('fs');
const path = require('path');

const settingsPath = path.join(__dirname, 'settings.json');

const defaultSettings = {
  authentication: false,
  nickChangeCooldown: 30000,
  maxMessagesPerSecond: 3,
  connectionWindowMs: 30000,
  maxConnectionsPerWindow: 2,
  maxTotalConnections: 4
};

if (!fs.existsSync(settingsPath)) {
  fs.writeFileSync(settingsPath, JSON.stringify(defaultSettings, null, 2));
  console.log('Settings file created with default settings.');
}

const settings = JSON.parse(fs.readFileSync(settingsPath));

const adminsPath = path.join(__dirname, 'admins.json');
if (!fs.existsSync(adminsPath)) {
  const defaultAdmin = "admin";
  fs.writeFileSync(adminsPath, JSON.stringify([defaultAdmin], null, 2));
  console.log(`Default admin is being created with username: "${defaultAdmin}"`);
  console.warn(`CHANGE THIS CHANGE THIS CHANGE THIS!`);
  console.warn(`ANYONE WITH THE USERNAME "ADMIN" HAS FULL CONTROL OF MODERATION COMMANDS!`);
}

const server = http.createServer();

const wss = new WebSocket.Server({
  noServer: true,
  perMessageDeflate: false  // Disable deflate to avoid RSV issues
});

server.on('upgrade', (request, socket, head) => {
  if (request.headers['upgrade'] !== 'websocket') {
    socket.destroy();
    return;
  }

  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});

wss.on('connection', (socket, req) => {
  // Add error handler on each connection to prevent crashes
  socket.on('error', (err) => {
    console.error('WebSocket client error:', err);
  });

  websocketHandler(socket, req, wss, settings);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`WebSocket server running on ws://localhost:${PORT}`);
});
