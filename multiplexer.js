/**
 * Multiplexer with Authentication (using utils/auth.js)
 *
 * To use this, ensure each downstream server’s connection limits are set high enough
 * (e.g., 0 or 99999) since the multiplexer will enforce rate and connection limits itself.
 *
 * This script forwards WebSocket connections from clients to specific “room” servers,
 * adding an authentication layer if enabled in settings.json.
 */

const WebSocket = require('ws');
const url = require('url');
const fs = require('fs');
const path = require('path');
const { registerUser, authenticateUser } = require('./utils/auth');
const loginLimiter = require('./utils/loginLimiter');

// Load settings and admin list:
const settingsPath = path.join(__dirname, 'multiplexer_settings.json');
const adminsPath = path.join(__dirname, 'admins.json');

// Default settings if files do not exist:
const SETTINGS = fs.existsSync(settingsPath)
  ? JSON.parse(fs.readFileSync(settingsPath))
  : {
      authentication: false,
      maxMessagesPerSecond: 3,
      connectionWindowMs: 30000,
      maxConnectionsPerWindow: 2,
      maxConnectionsPerIP: 4,
      totalMaxConnections: 20,
      messageRateLimit: 3,
      motd: null,
    };

const ADMIN_USERS = fs.existsSync(adminsPath)
  ? JSON.parse(fs.readFileSync(adminsPath))
  : [];


const ROOM_SERVERS = {
  room1: 'ws://localhost:3001',
  // add more rooms here, e.g. room2: 'ws://localhost:3002'
};


const proxyServer = new WebSocket.Server({ port: 3000 });
console.log(
  `[${new Date().toISOString()}] [Multiplexer] Proxy server started on ws://localhost:3000`
);


const ipConnectionTimestamps = new Map(); // Map<IP, Array<timestamp>>
const ipConnectionCount = new Map(); // Map<IP, currentConnections>

// Track which usernames are in use, and which client Sockets are authenticated:
proxyServer.usernames = new Set(); // Set<username>
proxyServer.authenticatedClients = new Set(); // Set<clientSocket>

proxyServer.on('connection', (clientSocket, req) => {
  const ip = req.socket.remoteAddress;
  console.log(`[${new Date().toISOString()}] CONNECT: New client from IP ${ip}`);

  if (proxyServer.clients.size > SETTINGS.totalMaxConnections) {
    console.log(`[${new Date().toISOString()}] REJECT: Server full for IP ${ip}`);
    clientSocket.send(
      JSON.stringify({
        type: 'system',
        text: 'Server is full. Please try again later.',
      })
    );
    clientSocket.close();
    return;
  }

  const now = Date.now();
  if (!ipConnectionTimestamps.has(ip)) {
    ipConnectionTimestamps.set(ip, []);
  }

  let timestamps = ipConnectionTimestamps
    .get(ip)
    .filter((ts) => now - ts < SETTINGS.connectionWindowMs);
  timestamps.push(now);
  ipConnectionTimestamps.set(ip, timestamps);

  if (timestamps.length > SETTINGS.maxConnectionsPerWindow) {
    console.log(
      `[${new Date().toISOString()}] REJECT: Connection rate limit exceeded for IP ${ip}`
    );
    clientSocket.send(
      JSON.stringify({
        type: 'system',
        text: `Too many connections from this IP. Limit is ${SETTINGS.maxConnectionsPerWindow} per ${SETTINGS.connectionWindowMs /
          1000} seconds.`,
      })
    );
    clientSocket.close();
    return;
  }

  ipConnectionCount.set(ip, (ipConnectionCount.get(ip) || 0) + 1);
  if (ipConnectionCount.get(ip) > SETTINGS.maxConnectionsPerIP) {
    console.log(
      `[${new Date().toISOString()}] REJECT: Too many simultaneous connections from IP ${ip}`
    );
    clientSocket.send(
      JSON.stringify({
        type: 'system',
        text: `Too many simultaneous connections from this IP. Limit is ${SETTINGS.maxConnectionsPerIP}.`,
      })
    );
    clientSocket.close();
    // Decrement the count since we’re rejecting
    ipConnectionCount.set(ip, ipConnectionCount.get(ip) - 1);
    return;
  }

  let username = null;
  let authenticated = false;
  let isAdmin = false;
  let currentRoom = null;
  let roomSocket = null;
  const messageTimestamps = [];

  function isValidUsername(name) {
    return /^[A-Za-z0-9_-]{3,20}$/.test(name);
  }


  function connectToRoom(roomName) {
    if (!ROOM_SERVERS[roomName]) {
      clientSocket.send(
        JSON.stringify({
          type: 'system',
          text: `Room "${roomName}" does not exist.`,
        })
      );
      console.log(
        `[${new Date().toISOString()}] JOIN FAIL: Room "${roomName}" does not exist (User: ${username ||
          'unknown'}, IP: ${ip})`
      );
      return;
    }

    if (!authenticated) {
      clientSocket.send(
        JSON.stringify({
          type: 'system',
          text: 'You must authenticate before joining a room. Use /register or /login.',
        })
      );
      console.log(
        `[${new Date().toISOString()}] JOIN FAIL: User not authenticated (IP: ${ip})`
      );
      return;
    }
    if (roomSocket) {
      try {
        roomSocket.close();
      } catch (e) {
        // ignore
      }
      console.log(
        `[${new Date().toISOString()}] LEAVE: ${currentRoom} (User: ${username}, IP: ${ip})`
      );
      roomSocket = null;
      currentRoom = null;
    }

    const roomUrl = `${ROOM_SERVERS[roomName]}?username=${encodeURIComponent(username)}`;
    roomSocket = new WebSocket(roomUrl);
    console.log(
      `[${new Date().toISOString()}] CONNECTING: Forwarding user "${username}" from IP ${ip} to room "${roomName}" at ${roomUrl}`
    );

    roomSocket.on('open', () => {
      currentRoom = roomName;
      clientSocket.send(
        JSON.stringify({
          type: 'system',
          text: `Joined room "${roomName}" as "${username}".`,
        })
      );
      console.log(`[${new Date().toISOString()}] JOIN: ${username}`);
    });

    roomSocket.on('message', (data, isBinary) => {
      if (isBinary) {
        clientSocket.send(data);
      } else {
        clientSocket.send(data.toString());
      }
    });

    roomSocket.on('close', () => {
      clientSocket.send(
        JSON.stringify({
          type: 'system',
          text: `Disconnected from room "${roomName}".`,
        })
      );
      console.log(
        `[${new Date().toISOString()}] LEAVE: ${currentRoom ||
          roomName} (User: ${username}, IP: ${ip})`
      );
      currentRoom = null;
      roomSocket = null;
    });

    roomSocket.on('error', (err) => {
      clientSocket.send(
        JSON.stringify({
          type: 'system',
          text: `Error connecting to room "${roomName}".`,
        })
      );
      console.log(
        `[${new Date().toISOString()}] ERROR: Connection to room "${roomName}" failed for user "${username}", IP ${ip} - ${err.message}`
      );
    });
  }

  function handleRateLimiting() {
    const now = Date.now();
    messageTimestamps.push(now);
    while (messageTimestamps.length && now - messageTimestamps[0] > 1000) {
      messageTimestamps.shift();
    }
    if (messageTimestamps.length > SETTINGS.maxMessagesPerSecond) {
      clientSocket.send(
        JSON.stringify({
          type: 'system',
          text: `You are sending messages too fast. Max ${SETTINGS.maxMessagesPerSecond} per second.`,
        })
      );
      console.log(
        `[${new Date().toISOString()}] RATE LIMIT: User "${username ||
          'unknown'}" from IP ${ip} is sending messages too fast.`
      );
      return false;
    }
    return true;
  }

  if (SETTINGS.authentication) {
    clientSocket.send(
      JSON.stringify({
        type: 'system',
        text:
          'Authentication required. Use /register <username> <password> or /login <username> <password>.',
      })
    );
  } else {
    const parsedUrl = url.parse(req.url, true);
    const desiredUsername = parsedUrl.query.username
      ? parsedUrl.query.username.trim()
      : `Anonymous${Math.floor(Math.random() * 10000)}`;

    if (!isValidUsername(desiredUsername)) {
      clientSocket.send(
        JSON.stringify({
          type: 'system',
          text:
            'Invalid username provided in connection URL. Connection rejected.',
        })
      );
      console.log(
        `[${new Date().toISOString()}] INVALID USERNAME ATTEMPT from IP ${ip}: "${desiredUsername}"`
      );
      clientSocket.close();
      return;
    }

    if (ADMIN_USERS.includes(desiredUsername)) {
      isAdmin = true;
    }

    if (proxyServer.usernames.has(desiredUsername)) {
      clientSocket.send(
        JSON.stringify({
          type: 'system',
          text: `Username "${desiredUsername}" is already in use. Connection rejected.`,
        })
      );
      console.log(
        `[${new Date().toISOString()}] CONNECTION REJECTED: Username "${desiredUsername}" already taken. IP ${ip}`
      );
      clientSocket.close();
      return;
    }

    username = desiredUsername;
    authenticated = true;
    proxyServer.usernames.add(username);
    proxyServer.authenticatedClients.add(clientSocket);
    console.log(
      `[${new Date().toISOString()}] GUEST LOGIN: "${username}" from IP ${ip}`
    );

    clientSocket.send(
      JSON.stringify({
        type: 'system',
        text: `You are connected as "${username}". Use /join <room> to join a room.`,
      })
    );
  }

  clientSocket.on('message', async (msg, isBinary) => {
    if (!handleRateLimiting()) {
      return;
    }

    const text = isBinary ? msg.toString() : msg.toString().trim();

    if (SETTINGS.authentication && !authenticated) {
      const parts = text.split(' ');
      const command = parts[0].toLowerCase();
      const rawUsername = parts[1] ? parts[1].trim() : null;
      const password = parts.slice(2).join(' ').trim();

      if (!rawUsername || !password) {
        clientSocket.send(
          JSON.stringify({
            type: 'system',
            text:
              'Username and password required. Use /register <username> <password> or /login <username> <password>.',
          })
        );
        return;
      }

      const desiredUsername = rawUsername.trim();
      if (!isValidUsername(desiredUsername)) {
        clientSocket.send(
          JSON.stringify({
            type: 'system',
            text:
              'Invalid username. Must be 3-20 chars, letters, digits, underscore, dash.',
          })
        );
        console.log(
          `[${new Date().toISOString()}] INVALID USERNAME ATTEMPT: "${desiredUsername}" from IP ${ip}`
        );
        return;
      }

      // Registration flow
      if (command === '/register') {
        if (password.length < 8 || password.length > 32) {
          clientSocket.send(
            JSON.stringify({
              type: 'system',
              text: 'Password must be 8-32 characters long.',
            })
          );
          return;
        }

        const success = await registerUser(desiredUsername, password);
        if (success) {
          clientSocket.send(
            JSON.stringify({
              type: 'system',
              text:
                'Registration successful. Please log in with /login <username> <password>.',
            })
          );
          console.log(
            `[${new Date().toISOString()}] REGISTER: "${desiredUsername}" (IP: ${ip})`
          );
        } else {
          clientSocket.send(
            JSON.stringify({
              type: 'system',
              text: 'Username already exists. Choose a different one.',
            })
          );
          console.log(
            `[${new Date().toISOString()}] REGISTER FAILED: Username "${desiredUsername}" already taken (IP: ${ip})`
          );
        }
        return;
      }

      // Login flow
      if (command === '/login') {
        // Rate-limit failed attempts
        if (loginLimiter.isBlocked(ip, desiredUsername)) {
          clientSocket.send(
            JSON.stringify({
              type: 'system',
              text: 'Too many failed attempts. Login blocked for 1 hour.',
            })
          );
          console.log(
            `[${new Date().toISOString()}] LOGIN BLOCKED: "${desiredUsername}" from IP ${ip}`
          );
          return;
        }

        const authSuccess = await authenticateUser(desiredUsername, password);
        if (authSuccess) {
          if (proxyServer.usernames.has(desiredUsername)) {
            clientSocket.send(
              JSON.stringify({
                type: 'system',
                text: `Username "${desiredUsername}" is already in use.`,
              })
            );
            clientSocket.close();
            console.log(
              `[${new Date().toISOString()}] LOGIN REJECTED: "${desiredUsername}" already in use (IP: ${ip})`
            );
            return;
          }

          username = desiredUsername;
          authenticated = true;
          isAdmin = ADMIN_USERS.includes(username);
          loginLimiter.resetAttempts(ip, username);

          proxyServer.usernames.add(username);
          proxyServer.authenticatedClients.add(clientSocket);
          console.log(
            `[${new Date().toISOString()}] LOGIN SUCCESS: "${username}" (IP: ${ip})`
          );

          // Send welcome message (MOTD, if any)
          if (SETTINGS.motd) {
            clientSocket.send(
              JSON.stringify({
                type: 'system',
                text: `MOTD: ${SETTINGS.motd}`,
              })
            );
          }

          clientSocket.send(
            JSON.stringify({
              type: 'system',
              text:
                'Login successful. Use /join <room> to join a room, or /nick <newusername> to change your username.',
            })
          );
        } else {
          loginLimiter.recordFailedAttempt(ip, desiredUsername);
          clientSocket.send(
            JSON.stringify({
              type: 'system',
              text: 'Login failed. Please try again.',
            })
          );
          console.log(
            `[${new Date().toISOString()}] LOGIN FAILED: "${desiredUsername}" (IP: ${ip})`
          );
        }
        return;
      }

      clientSocket.send(
        JSON.stringify({
          type: 'system',
          text:
            'You must authenticate first. Use /register <username> <password> or /login <username> <password>.',
        })
      );
      return;
    }

    //from here, user is either “authenticated” (auth-enabled) or in “guest” mode (auth-disabled) ====

    if (text.startsWith('/join ')) {
      const parts = text.split(' ');
      if (parts.length < 2) {
        clientSocket.send(
          JSON.stringify({
            type: 'system',
            text: 'Usage: /join <room>',
          })
        );
        return;
      }
      const roomName = parts[1].trim();
      console.log(
        `[${new Date().toISOString()}] COMMAND: User "${username ||
          'unknown'}" from IP ${ip} requests to join room "${roomName}"`
      );
      connectToRoom(roomName);
      return;
    }

    if (text.startsWith('/nick ')) {
      const parts = text.split(' ');
      if (parts.length < 2) {
        clientSocket.send(
          JSON.stringify({
            type: 'system',
            text: 'Usage: /nick <username>',
          })
        );
        return;
      }
      const newName = parts[1].trim();
      if (!isValidUsername(newName)) {
        clientSocket.send(
          JSON.stringify({
            type: 'system',
            text:
              'Invalid username. Must be 3-20 chars, letters, digits, underscore, dash.',
          })
        );
        console.log(
          `[${new Date().toISOString()}] INVALID USERNAME ATTEMPT: "${newName}" from IP ${ip}`
        );
        return;
      }
      if (proxyServer.usernames.has(newName)) {
        clientSocket.send(
          JSON.stringify({
            type: 'system',
            text: `Username "${newName}" is already in use.`,
          })
        );
        return;
      }
      proxyServer.usernames.delete(username);
      username = newName;
      proxyServer.usernames.add(username);
      clientSocket.send(
        JSON.stringify({
          type: 'system',
          text: `Username set to "${username}".`,
        })
      );
      console.log(
        `[${new Date().toISOString()}] USERNAME CHANGE: "${username}" from IP ${ip}`
      );
      if (currentRoom) {
        connectToRoom(currentRoom);
      }
      return;
    }

    if (text === '/servers') {
      const serverList = Object.keys(ROOM_SERVERS);
      clientSocket.send(
        JSON.stringify({
          type: 'system',
          text: `Available rooms: ${serverList.join(', ')}`,
        })
      );
      console.log(
        `[${new Date().toISOString()}] COMMAND: User "${username ||
          'unknown'}" from IP ${ip} requested server list`
      );
      return;
    }

    if (!roomSocket || roomSocket.readyState !== WebSocket.OPEN) {
      clientSocket.send(
        JSON.stringify({
          type: 'system',
          text: 'You must join a room first using /join <room>. Use /servers to find rooms.',
        })
      );
      return;
    }

    try {
      roomSocket.send(text);
      console.log(
        `[${new Date().toISOString()}] FORWARD: Message from "${username}" forwarded to room "${currentRoom}"`
      );
    } catch (err) {
      clientSocket.send(
        JSON.stringify({
          type: 'system',
          text: 'Failed to send message to room server.',
        })
      );
      console.log(
        `[${new Date().toISOString()}] ERROR: Failed to send message from "${username}" to room "${currentRoom}": ${err.message}`
      );
    }
  });

  clientSocket.on('close', () => {
    if (roomSocket) {
      try {
        roomSocket.close();
      } catch (e) {
        // ignore
      }
      console.log(
        `[${new Date().toISOString()}] LEAVE: ${currentRoom} (User: ${username ||
          'unknown'}, IP: ${ip})`
      );
      currentRoom = null;
      roomSocket = null;
    }
    if (username && proxyServer.usernames.has(username)) {
      proxyServer.usernames.delete(username);
      console.log(
        `[${new Date().toISOString()}] DISCONNECT: "${username}" (IP: ${ip})`
      );
    } else {
      console.log(
        `[${new Date().toISOString()}] DISCONNECT: Client from IP ${ip} closed connection (no username set)`
      );
    }
    proxyServer.authenticatedClients.delete(clientSocket);
    ipConnectionCount.set(
      ip,
      Math.max((ipConnectionCount.get(ip) || 1) - 1, 0)
    );
  });

  clientSocket.on('error', (err) => {
    console.log(
      `[${new Date().toISOString()}] ERROR: Client socket error from IP ${ip} - ${err.message}`
    );
  });
});
