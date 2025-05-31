const http = require('http');
const WebSocket = require('ws');
const url = require('url');
const generateUsername = require('../utils/generateusername');

const PORT = 3000;

const backendServers = {
  mainChat: 'ws://localhost:3001',
  testChat: 'ws://localhost:3002',
};

const settings = {
  serverName: "My Proxy Server",
  totalMaxConnections: 9999,
  port: PORT
};

const server = http.createServer();

const wss = new WebSocket.Server({ noServer: true, perMessageDeflate: false });

const clientUsernames = new Map();

function serverInfoHandler(req, res, wss, settings) {
  const parsedUrl = url.parse(req.url, true);

  if (parsedUrl.pathname === '/server-info') {
    const info = {
      serverName: settings.serverName || "Unnamed Proxy",
      totalMaxConnections: settings.totalMaxConnections,
      currentOnline: wss.clients.size
    };

    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(JSON.stringify(info));
    return true;
  }
  return false;
}

server.on('request', (req, res) => {
  if (!serverInfoHandler(req, res, wss, settings)) {
    res.writeHead(404);
    res.end('Not found');
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

wss.on('connection', (clientSocket, req) => {
  const { query } = url.parse(req.url, true);
  let username = query.username || generateUsername();

  console.log(`Client connected from ${req.socket.remoteAddress} as "${username}"`);
  clientUsernames.set(clientSocket, username);

  let backendSocket = null;
  let connected = false;
  let currentServerId = null;

  const sendToClient = (obj) => {
    if (clientSocket.readyState === WebSocket.OPEN) {
      clientSocket.send(JSON.stringify(obj));
    }
  };

  const connectToBackend = (serverId) => {
    const targetUrl = `${backendServers[serverId]}?username=${encodeURIComponent(username)}`;
    backendSocket = new WebSocket(targetUrl);
    currentServerId = serverId;

    backendSocket.on('open', () => {
      connected = true;
      sendToClient({ type: 'system', text: `Connected to ${serverId} as ${username}` });
    });

    backendSocket.on('message', (data) => {
      try {
        sendToClient(JSON.parse(data));
      } catch {
        sendToClient({ type: 'message', content: data.toString() });
      }
    });

    backendSocket.on('close', () => {
      connected = false;
      sendToClient({ type: 'system', text: `Disconnected from ${serverId}` });
    });

    backendSocket.on('error', (err) => {
      sendToClient({
        type: 'error',
        text: `Failed to connect to ${serverId}: ${err.message}`
      });
    });
  };

  sendToClient({
    type: 'system',
    text: `Welcome ${username}! Use /join <server_id> to connect`,
  });
  sendToClient({
    type: 'system',
    text: `Type /servers for a list of servers.`,
  });

  clientSocket.on('message', (data) => {
    let message;
    try {
      message = JSON.parse(data);
    } catch (err) {
      return sendToClient({ type: 'error', text: 'Invalid message format.' });
    }
    if (message.type !== 'message' || typeof message.content !== 'string') {
      return sendToClient({ type: 'error', text: 'Invalid message structure.' });
    }

    const raw = message.content.trim();
    const stripped = raw.replace(/^[^:\s]+:\s*/, '');

    if (stripped.startsWith('/nick ')) {
      const newNick = stripped.split(/\s+/)[1];
      if (newNick) {
        username = newNick;
        clientUsernames.set(clientSocket, newNick);
        return sendToClient({ type: 'system', text: `Username changed to ${newNick}` });
      } else {
        return sendToClient({ type: 'error', text: 'Usage: /nick <new_name>' });
      }
    }

    if (stripped === '/servers') {
      return sendToClient({
        type: 'system',
        text: `Available servers: ${Object.keys(backendServers).join(', ')}`
      });
    }

    const joinMatch = stripped.match(/^\/join\s+(\S+)$/);
    if (joinMatch) {
      const serverId = joinMatch[1];
      if (!backendServers[serverId]) {
        return sendToClient({
          type: 'error',
          text: `Unknown server ID "${serverId}". Available: ${Object.keys(backendServers).join(', ')}`
        });
      }
      if (backendSocket && backendSocket.readyState === WebSocket.OPEN) {
        backendSocket.close();
      }
      return connectToBackend(serverId);
    }

    if (!connected) {
      return sendToClient({ type: 'system', text: 'Use /join <server_id> to connect to a chat server.' });
    }

    if (backendSocket.readyState === WebSocket.OPEN) {
      backendSocket.send(JSON.stringify(message));
    } else {
      connected = false;
      sendToClient({ type: 'error', text: 'Lost connection to backend server.' });
    }
  });

  clientSocket.on('close', () => {
    if (backendSocket && backendSocket.readyState === WebSocket.OPEN) {
      backendSocket.close();
    }
    clientUsernames.delete(clientSocket);
    console.log(`Client from ${req.socket.remoteAddress} disconnected`);
  });
});

server.listen(PORT, () => {
  console.log(`Proxy listening on http://localhost:${PORT}`);
});
