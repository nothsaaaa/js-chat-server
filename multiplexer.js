/* VERY EXPERIMENTAL MULTIPLEXER (LIKE BUNGEECORD)
** 
** to use this, set all the limits on each server to 99999 or 0 (depending on variable)
** this multiplexer has more authority over the servers it forwards people to
** this is my solution to server networks
*/ 

const WebSocket = require('ws');
const url = require('url');

const ROOM_SERVERS = {
  room1: 'ws://localhost:3001',
};

const SETTINGS = {
  maxMessagesPerSecond: 3,
  connectionWindowMs: 30000,
  maxConnectionsPerWindow: 2,
  maxConnectionsPerIP: 4,
  totalMaxConnections: 20,
};

const proxyServer = new WebSocket.Server({ port: 3000 });
console.log(`[${new Date().toISOString()}] [Multiplexer] Proxy server started on ws://localhost:3000`);

const ipConnectionTimestamps = new Map();
const ipConnectionCount = new Map();

proxyServer.on('connection', (clientSocket, req) => {
  const ip = req.socket.remoteAddress;
  console.log(`[${new Date().toISOString()}] CONNECT: New client from IP ${ip}`);

  if (proxyServer.clients.size >= SETTINGS.totalMaxConnections) {
    console.log(`[${new Date().toISOString()}] REJECT: Server full for IP ${ip}`);
    clientSocket.send(JSON.stringify({
      type: 'system',
      text: 'Server is full. Please try again later.',
    }));
    clientSocket.close();
    return;
  }

  const now = Date.now();
  if (!ipConnectionTimestamps.has(ip)) {
    ipConnectionTimestamps.set(ip, []);
  }
  let timestamps = ipConnectionTimestamps.get(ip).filter(ts => now - ts < SETTINGS.connectionWindowMs);
  timestamps.push(now);
  ipConnectionTimestamps.set(ip, timestamps);

  if (timestamps.length > SETTINGS.maxConnectionsPerWindow) {
    console.log(`[${new Date().toISOString()}] REJECT: Connection rate limit exceeded for IP ${ip}`);
    clientSocket.send(JSON.stringify({
      type: 'system',
      text: `Too many connections from this IP. Limit is ${SETTINGS.maxConnectionsPerWindow} per ${SETTINGS.connectionWindowMs / 1000} seconds.`,
    }));
    clientSocket.close();
    return;
  }

  ipConnectionCount.set(ip, (ipConnectionCount.get(ip) || 0) + 1);
  if (ipConnectionCount.get(ip) > SETTINGS.maxConnectionsPerIP) {
    console.log(`[${new Date().toISOString()}] REJECT: Too many simultaneous connections from IP ${ip}`);
    clientSocket.send(JSON.stringify({
      type: 'system',
      text: `Too many simultaneous connections from this IP. Limit is ${SETTINGS.maxConnectionsPerIP}.`,
    }));
    clientSocket.close();
    ipConnectionCount.set(ip, ipConnectionCount.get(ip) - 1);
    return;
  }

  let username = null;
  let currentRoom = null;
  let roomSocket = null;
  const messageTimestamps = [];

  function isValidUsername(name) {
    return /^[A-Za-z0-9_-]{3,20}$/.test(name);
  }

  const parsedUrl = url.parse(req.url, true);
  if (parsedUrl.query && parsedUrl.query.username) {
    const name = parsedUrl.query.username.trim();
    if (isValidUsername(name)) {
      username = name;
      clientSocket.send(JSON.stringify({
        type: 'system',
        text: `Username set to "${username}" from connection.`,
      }));
      console.log(`[${new Date().toISOString()}] USERNAME SET: "${username}" from connection URL for IP ${ip}`);
    } else {
      clientSocket.send(JSON.stringify({
        type: 'system',
        text: 'Invalid username provided in connection URL. Use /nick <username> to set a valid one.',
      }));
      console.log(`[${new Date().toISOString()}] INVALID USERNAME ATTEMPT from IP ${ip}: "${name}"`);
    }
  }

  function connectToRoom(roomName) {
    if (!ROOM_SERVERS[roomName]) {
      clientSocket.send(JSON.stringify({
        type: 'system',
        text: `Room "${roomName}" does not exist.`,
      }));
      console.log(`[${new Date().toISOString()}] JOIN FAIL: Room "${roomName}" does not exist (User: ${username || 'unknown'}, IP: ${ip})`);
      return;
    }
    if (!username) {
      clientSocket.send(JSON.stringify({
        type: 'system',
        text: 'You must set a username before joining a room. Use /nick <username>.',
      }));
      console.log(`[${new Date().toISOString()}] JOIN FAIL: Username not set, IP ${ip}`);
      return;
    }
    if (roomSocket) {
      try { roomSocket.close(); } catch {}
      console.log(`[${new Date().toISOString()}] LEAVE: ${currentRoom} (User: ${username}, IP: ${ip})`);
      roomSocket = null;
      currentRoom = null;
    }

    const roomUrl = `${ROOM_SERVERS[roomName]}?username=${encodeURIComponent(username)}`;
    roomSocket = new WebSocket(roomUrl);
    console.log(`[${new Date().toISOString()}] CONNECTING: Forwarding user "${username}" from IP ${ip} to room "${roomName}" at ${roomUrl}`);

    roomSocket.on('open', () => {
      currentRoom = roomName;
      clientSocket.send(JSON.stringify({
        type: 'system',
        text: `Joined room "${roomName}" as "${username}".`,
      }));
      console.log(`[${new Date().toISOString()}] JOIN: ${username}`);
    });

    roomSocket.on('message', (data, isBinary) => {
      if (isBinary) {
        const text = data.toString();
        clientSocket.send(text);
      } else {
        clientSocket.send(data.toString());
      }
    });

    roomSocket.on('close', () => {
      clientSocket.send(JSON.stringify({
        type: 'system',
        text: `Disconnected from room "${roomName}".`,
      }));
      console.log(`[${new Date().toISOString()}] LEAVE: ${currentRoom || roomName} (User: ${username}, IP: ${ip})`);
      currentRoom = null;
      roomSocket = null;
    });

    roomSocket.on('error', (err) => {
      clientSocket.send(JSON.stringify({
        type: 'system',
        text: `Error connecting to room "${roomName}".`,
      }));
      console.log(`[${new Date().toISOString()}] ERROR: Connection to room "${roomName}" failed for user "${username}", IP ${ip} - ${err.message}`);
    });
  }

  clientSocket.on('message', (msg, isBinary) => {
    const now = Date.now();

    messageTimestamps.push(now);
    while (messageTimestamps.length && now - messageTimestamps[0] > 1000) {
      messageTimestamps.shift();
    }
    if (messageTimestamps.length > SETTINGS.maxMessagesPerSecond) {
      clientSocket.send(JSON.stringify({
        type: 'system',
        text: `You are sending messages too fast. Max ${SETTINGS.maxMessagesPerSecond} per second.`,
      }));
      console.log(`[${new Date().toISOString()}] RATE LIMIT: User "${username || 'unknown'}" from IP ${ip} is sending messages too fast.`);
      return;
    }

    const message = isBinary ? msg.toString() : msg.toString().trim();

    if (message.startsWith('/join ')) {
      const parts = message.split(' ');
      if (parts.length < 2) {
        clientSocket.send(JSON.stringify({
          type: 'system',
          text: 'Usage: /join <room>',
        }));
        return;
      }
      const roomName = parts[1];
      console.log(`[${new Date().toISOString()}] COMMAND: User "${username || 'unknown'}" from IP ${ip} requests to join room "${roomName}"`);
      connectToRoom(roomName);
      return;
    }

    if (message.startsWith('/nick ')) {
      const parts = message.split(' ');
      if (parts.length < 2) {
        clientSocket.send(JSON.stringify({
          type: 'system',
          text: 'Usage: /nick <username>',
        }));
        return;
      }
      const newName = parts[1];
      if (!isValidUsername(newName)) {
        clientSocket.send(JSON.stringify({
          type: 'system',
          text: 'Invalid username. Must be 3-20 chars, letters, digits, underscore, dash.',
        }));
        console.log(`[${new Date().toISOString()}] INVALID USERNAME ATTEMPT from IP ${ip}: "${newName}"`);
        return;
      }
      username = newName;
      clientSocket.send(JSON.stringify({
        type: 'system',
        text: `Username set to "${username}".`,
      }));
      console.log(`[${new Date().toISOString()}] USERNAME SET: "${username}" from IP ${ip}`);
      if (currentRoom) {
        connectToRoom(currentRoom);
      }
      return;
    }

    if (!roomSocket || roomSocket.readyState !== WebSocket.OPEN) {
      clientSocket.send(JSON.stringify({
        type: 'system',
        text: 'You must join a room first using /join <room>.',
      }));
      return;
    }

    try {
      roomSocket.send(message);
      console.log(`[${new Date().toISOString()}] FORWARD: Message from "${username}" forwarded to room "${currentRoom}"`);
    } catch {
      clientSocket.send(JSON.stringify({
        type: 'system',
        text: 'Failed to send message to room server.',
      }));
      console.log(`[${new Date().toISOString()}] ERROR: Failed to send message from "${username}" to room "${currentRoom}"`);
    }
  });

  clientSocket.on('close', () => {
    if (roomSocket) {
      try { roomSocket.close(); } catch {}
      console.log(`[${new Date().toISOString()}] LEAVE: ${currentRoom} (User: ${username || 'unknown'}, IP: ${ip})`);
      roomSocket = null;
    }
    ipConnectionCount.set(ip, Math.max((ipConnectionCount.get(ip) || 1) - 1, 0));
    console.log(`[${new Date().toISOString()}] DISCONNECT: Client from IP ${ip} closed connection (User: ${username || 'unknown'})`);
  });

  clientSocket.on('error', (err) => {
    console.log(`[${new Date().toISOString()}] ERROR: Client socket error from IP ${ip} - ${err.message}`);
  });
});
