const http = require('http');
const WebSocket = require('ws');
const websocketHandler = require('./routes/websocket');
const fs = require('fs');
const path = require('path');

const settingsPath = path.join(__dirname, 'settings.json');
const defaultSettings = {
  authentication: false
};

if (!fs.existsSync(settingsPath)) {
  fs.writeFileSync(settingsPath, JSON.stringify(defaultSettings, null, 2));
  console.log('Settings file created with authentication DEFAULTED TO OFF');
}

const adminsPath = path.join(__dirname, 'admins.json');
if (!fs.existsSync(adminsPath)) {
  const defaultAdmin = "admin";
  fs.writeFileSync(adminsPath, JSON.stringify([defaultAdmin], null, 2));
  console.log(`Default admin is being created with username: "${defaultAdmin}"`);
  console.warn(`CHANGE THIS CHANGE THIS CHANGE THIS!`)
  console.warn(`ANYONE WITH THE USERNAME "ADMIN" HAS FULL CONTROL OF MODERATION COMMANDS!`)

}

const server = http.createServer();
const wss = new WebSocket.Server({ server });

wss.on('connection', (socket, req) => {
  websocketHandler(socket, req, wss);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`WebSocket server running on ws://localhost:${PORT}`);
});
