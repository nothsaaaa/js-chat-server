const http = require('http');
const https = require('https');
const WebSocket = require('ws');
const websocketHandler = require('./routes/websocket');
const serverInfoHandler = require('./utils/serverInfoHandler');
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
  port: 8443, //default port
  motd: "Welcome to the chat! Be respectful and have fun.",
  heartbeatInterval: 30000, //client must ping within this interval (seconds)
  heartbeatTimeout: 120000, //server disconnects if no ping received within this time (seconds)

  wss: {
    enabled: false,
    key: "certs/key.pem",
    cert: "certs/cert.pem"
  },
  
  // webrtc is incredibly unfinished and buggy.
  // i do not recommend anyone to use this, but i am not yet removing it due to its potential use
  // (and my previous effort to make it work to this point) 
  webrtc: {
    enabled: false, //enable WebRTC
    maxParticipants: 8, //maximum users in voice chat simultaneously
    allowVideo: false, //allow video streams
    allowScreenShare: false, //allow screen sharing
    forceRelay: true, //force all traffic through TURN; prevents ip leaks to other callers
  },
};

// it should be duly noted i do not know how to properly use webrtc
// to me, this is an abomination. i am sorry.
// i dont know if webrtc can be used anywhere other than... web.
// if it cannot this might be removed

// TODO: update serverinfo endpoint to mention webrtc things and what is supported
// some clients could auto adjust for this (like my wip one)

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

/*
if WSS is enabled, attempt to load TLS certificates
if WSS disabled, run normal HTTP server
*/

let server;

if (settings.wss && settings.wss.enabled) {
  const keyPath = path.join(__dirname, settings.wss.key);
  const certPath = path.join(__dirname, settings.wss.cert);

  if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
    console.error("WSS is enabled but certificate files were not found.");
    console.error(`Expected key: ${keyPath}`);
    console.error(`Expected cert: ${certPath}`);
    process.exit(1);
  }

  const httpsOptions = {
    key: fs.readFileSync(keyPath),
    cert: fs.readFileSync(certPath)
  };

  server = https.createServer(httpsOptions);
  console.log("Starting server with TLS (WSS enabled)");
} else {
  server = http.createServer();
  console.log("Starting server without TLS (WS)");
}

const wss = new WebSocket.Server({
  noServer: true,
  perMessageDeflate: false  // Disable deflate to avoid RSV issues
});

const initWebRTC = require('./handlers/webrtcHandler');
initWebRTC(wss, settings);

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
  const protocol = (settings.wss && settings.wss.enabled) ? "wss" : "ws";
  console.log(`Server running on ${protocol}://localhost:${PORT}`);
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