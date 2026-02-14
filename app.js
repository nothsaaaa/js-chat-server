const http = require('http');
const WebSocket = require('ws');
const websocketHandler = require('./routes/websocket');
const serverInfoHandler = require('./utils/serverInfoHandler'); // <-- import here
const fs = require('fs');
const path = require('path');

const settingsPath = path.join(__dirname, 'settings.json');

const defaultSettings = {
  authentication: false, //enable auth system
  nickChangeCooldown: 30000, //how fast can users change nick
  maxMessagesPerSecond: 3, //maximum messages a user can send per second
  connectionWindowMs: 30000,
  maxConnectionsPerWindow: 2, //max connections within {connectionWindowMS} (eg 30 seconds)
  maxTotalConnections: 4, //maximum connections per ip
  totalMaxConnections: 20, //maximum users online
  serverName: "My Chat Server",
  port: 3000,
  motd: "Welcome to the chat! Be respectful and have fun.",
  heartbeatInterval: 30000, //client must ping within this interval
  heartbeatTimeout: 35000,
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

server.on('request', (req, res) => {
  if (!serverInfoHandler(req, res, wss, settings)) {
    res.writeHead(404);
    res.end();
  }
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
  socket.on('error', (err) => {
    console.error('WebSocket client error:', err);
  });

  websocketHandler(socket, req, wss, settings);
});

const PORT = settings.port || 3000;
server.listen(PORT, () => {
  console.log(`Server running on ws://localhost:${PORT}`);
});

const shutdown = () => {
  console.log('Shutting down server...');

  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN && client.username) {
      const leaveText = `${client.username} has left. (Server Shutdown)`;
      const leaveMsg = { type: 'system', text: leaveText };

      client.send(JSON.stringify(leaveMsg));
      console.log(leaveText);

      try {
        const { saveMessage } = require('./utils/db');
        saveMessage(leaveMsg);
        const connectionLogger = require('./middleware/connectionLogger');
        connectionLogger('LEAVE', client.username);
      } catch (err) {
        console.error('Error during shutdown logging:', err);
      }
    }

    client.close();
  });

  wss.close(() => {
    server.close(() => {
      console.log('Server closed gracefully.');
      process.exit(0);
    });
  });

  setTimeout(() => {
    console.warn('Force exiting after timeout.');
    process.exit(1);
  }, 5000);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);