const http = require('http');
const WebSocket = require('ws');
const url = require('url');
const generateUsername = require('../utils/generateusername');
const validateUsername = require('../handlers/validateUsername');
const asettings = require('../settings.json');
const lastNickChange = new Map();

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
  let username = (query.username && validateUsername(query.username))
    ? query.username
    : generateUsername();

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
      sendToClient({ type: 'system', text: `PROXY: Connected to ${serverId} as ${username}` });
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
      sendToClient({ type: 'system', text: `PROXY: Disconnected from ${serverId}` });
    });

    backendSocket.on('system', (err) => {
      sendToClient({
        type: 'system',
        text: `PROXY: Failed to connect to ${serverId}: ${err.message}`
      });
    });
  };

  sendToClient({
    type: 'system',
    text: `PROXY: Welcome ${username}! Use /join <server_id> to connect`,
  });
  sendToClient({
    type: 'system',
    text: `PROXY: Type /servers for a list of servers.`,
  });

  clientSocket.on('message', (data) => {
    let message;
    try {
      message = JSON.parse(data);
    } catch (err) {
      sendToClient({ type: 'system', text: 'PROXY: Invalid message format.' });
      return;
    }

    // Ignore ping messages
    if (message.type === 'ping') {
      return;
    }

    if (message.type !== 'message' || typeof message.content !== 'string') {
      sendToClient({ type: 'system', text: 'PROXY: Invalid message structure.' });
      return;
    }

    const content = message.content.trim();
    const raw = message.content.trim();
    const stripped = raw.replace(/^[^:\s]+:\s*/, '');

    if (stripped.startsWith('/nick ')) {
      const newNick = stripped.split(/\s+/)[1];
      if (!newNick) {
        sendToClient({ type: 'system', text: 'PROXY: Usage: /nick <new_name>' });
        return;
      }

      if (!validateUsername(newNick)) {
        sendToClient({ type: 'system', text: 'PROXY: Illegal username. Requirement: 3-20 characters alphanumeric.' });
        return;
      }

      const lastChange = lastNickChange.get(clientSocket) || 0;
      const now = Date.now();

      if (now - lastChange < asettings.nickChangeCooldown * 1000) {
        const wait = Math.ceil((asettings.nickChangeCooldown * 1000 - (now - lastChange)) / 1000);
        sendToClient({ type: 'system', text: `PROXY: You must wait ${wait}s before changing your nickname again.` });
        return;
      }

      username = newNick;
      clientUsernames.set(clientSocket, newNick);
      lastNickChange.set(clientSocket, now);

      if (backendSocket && backendSocket.readyState === WebSocket.OPEN) {
        backendSocket.send(JSON.stringify({ type: 'message', content }));
      }

      sendToClient({ type: 'system', text: `PROXY: Username changed to ${newNick}` });
      return;
    }

    if (stripped === '/servers') {
      return sendToClient({
        type: 'system',
        text: `PROXY: Available servers: ${Object.keys(backendServers).join(', ')}`
      });
    }

    const joinMatch = stripped.match(/^\/join\s+(\S+)$/);
    if (joinMatch) {
      const serverId = joinMatch[1];
      if (!backendServers[serverId]) {
        return sendToClient({
          type: 'system',
          text: `PROXY: Unknown server ID "${serverId}".`
        });
      }
      if (backendSocket && backendSocket.readyState === WebSocket.OPEN) {
        backendSocket.close();
      }
      return connectToBackend(serverId);
    }

    if (!connected) {
      return sendToClient({ type: 'system', text: 'PROXY: Use /join <server_id> to connect to a chat server.' });
    }

    if (backendSocket.readyState === WebSocket.OPEN) {
      backendSocket.send(JSON.stringify(message));
    } else {
      connected = false;
      sendToClient({ type: 'system', text: 'PROXY: Lost connection to server.' });
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
