const http = require('http');
const WebSocket = require('ws');
const websocketHandler = require('./routes/websocket');

const server = http.createServer();
const wss = new WebSocket.Server({ server });

wss.on('connection', (socket, req) => {
  websocketHandler(socket, req, wss);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`WebSocket server running on ws://localhost:${PORT}`);
});
