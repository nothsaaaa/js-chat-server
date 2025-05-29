const url = require('url');
const fs = require('fs');
const path = require('path');
const { clampUsername } = require('../utils/colorUtils');
const generateUsername = require('../utils/generateUsername');
const connectionLogger = require('../middleware/connectionLogger');
const { saveMessage, getRecentMessages } = require('../utils/db');
const handleCommand = require('../utils/commands');
const { registerUser, authenticateUser } = require('../utils/auth');
const loginLimiter = require('../utils/loginLimiter');

const settingsPath = path.join(__dirname, '../settings.json');
const adminsPath = path.join(__dirname, '../admins.json');

const settings = fs.existsSync(settingsPath)
  ? JSON.parse(fs.readFileSync(settingsPath))
  : { authentication: false };

const adminUsers = fs.existsSync(adminsPath)
  ? JSON.parse(fs.readFileSync(adminsPath))
  : [];

const MAX_MESSAGE_LENGTH = 2000;
const MAX_MESSAGE_SIZE = 5120; // 5 KB

const isIllegalUsername = (username) => {
  return !/^[A-Za-z0-9_-]{3,20}$/.test(username);
};

const broadcast = (wss, data) => {
  wss.clients.forEach((client) => {
    if (
      client.readyState === 1 &&
      (!settings.authentication || client.authenticated)
    ) {
      client.send(JSON.stringify(data));
    }
  });
};

// Track connections per IP
const ipConnectionTimestamps = new Map();

module.exports = (socket, req, wss) => {
  const ip = req.socket.remoteAddress;

  // Enforce total max connections
  const totalMaxConnections = settings.totalMaxConnections || 100;
  if (wss.clients.size >= totalMaxConnections) {
    socket.send(JSON.stringify({
      type: 'system',
      text: 'Server is full. Please try again later.',
    }));
    socket.close();
    return;
  }

  // Enforce per-IP connection rate limit
  const now = Date.now();
  const windowSize = settings.connectionRateLimitWindow || 30000; // 30 sec
  const maxPerIP = settings.connectionLimitPerIP || 2;

  if (!ipConnectionTimestamps.has(ip)) {
    ipConnectionTimestamps.set(ip, []);
  }

  const timestamps = ipConnectionTimestamps.get(ip).filter(ts => now - ts < windowSize);
  timestamps.push(now);
  ipConnectionTimestamps.set(ip, timestamps);

  if (timestamps.length > maxPerIP) {
    socket.send(JSON.stringify({
      type: 'system',
      text: `Too many connections from this IP. Limit is ${maxPerIP} every ${windowSize / 1000} seconds.`,
    }));
    socket.close();
    return;
  }

  const query = url.parse(req.url, true).query;

  if (!wss.usernames) wss.usernames = new Set();
  if (!wss.authenticatedClients) wss.authenticatedClients = new Set();

  const bannedPath = path.join(__dirname, '../banned.json');
  let bannedUsers = [];
  if (fs.existsSync(bannedPath)) {
    bannedUsers = JSON.parse(fs.readFileSync(bannedPath));
  }

  const messageTimestamps = [];

  const handleMessage = (msg) => {
    const now = Date.now();
    const rateLimit = settings.messageRateLimit || 5;
    messageTimestamps.push(now);
    while (messageTimestamps.length && now - messageTimestamps[0] > 1000) {
      messageTimestamps.shift();
    }

    if (messageTimestamps.length > rateLimit) {
      socket.send(JSON.stringify({
        type: 'system',
        text: `You are sending messages too fast. Limit is ${rateLimit} per second.`,
      }));
      return;
    }

    msg = msg.toString().trim();

    if (msg.length > MAX_MESSAGE_LENGTH) {
      socket.send(JSON.stringify({
        type: 'system',
        text: `Your message is too long. Maximum length is ${MAX_MESSAGE_LENGTH} characters.`,
      }));
      return;
    }

    if (Buffer.byteLength(msg, 'utf-8') > MAX_MESSAGE_SIZE) {
      socket.send(JSON.stringify({
        type: 'system',
        text: `Your message is too large. Maximum size is ${MAX_MESSAGE_SIZE / 1024}KB.`,
      }));
      return;
    }

    if (handleCommand(msg, socket, wss, broadcast, settings, adminUsers)) return;

    const messageObj = {
      type: 'chat',
      username: socket.username,
      text: msg,
      timestamp: new Date().toISOString(),
    };

    saveMessage(messageObj);
    broadcast(wss, messageObj);
  };

  if (settings.authentication) {
    socket.send(JSON.stringify({
      type: 'system',
      text: 'Authentication required. Use /register <username> <password> or /login <username> <password>',
    }));

    socket.on('message', async (msg) => {
      msg = msg.toString().trim();

      if (socket.authenticated) {
        handleMessage(msg);
        return;
      }

      const parts = msg.split(' ');
      const command = parts[0];
      const rawUsername = parts[1];
      const password = parts.slice(2).join(' ');

      if (!rawUsername || !password) {
        socket.send(JSON.stringify({
          type: 'system',
          text: 'Username and password required. Use /register or /login with both.',
        }));
        return;
      }

      const username = clampUsername(rawUsername);

      if (isIllegalUsername(username)) {
        socket.send(JSON.stringify({
          type: 'system',
          text: 'Illegal username. Must be 3-20 characters, only letters, digits, underscore, dash.',
        }));
        return;
      }

      if (password.length < 8 || password.length > 32) {
        socket.send(JSON.stringify({
          type: 'system',
          text: 'Password must be between 8 and 32 characters long.',
        }));
        return;
      }

      if (bannedUsers.includes(username)) {
        socket.send(JSON.stringify({
          type: 'system',
          text: 'You are banned from the server.',
        }));
        socket.close();
        return;
      }

      if (command === '/register') {
        if (await registerUser(username, password)) {
          socket.send(JSON.stringify({ type: 'system', text: 'Registration successful. Please /login.' }));
        } else {
          socket.send(JSON.stringify({ type: 'system', text: 'Username already exists.' }));
        }

      } else if (command === '/login') {
        if (loginLimiter.isBlocked(ip, username)) {
          socket.send(JSON.stringify({
            type: 'system',
            text: `Too many failed attempts. Login blocked for 1 hour.`,
          }));
          return;
        }

        if (await authenticateUser(username, password)) {
          if (wss.usernames.has(username)) {
            socket.send(JSON.stringify({
              type: 'system',
              text: `Username "${username}" is already in use.`,
            }));
            socket.close();
            return;
          }

          socket.username = username;
          socket.authenticated = true;
          socket.isAdmin = adminUsers.includes(username);
          loginLimiter.resetAttempts(ip, username);
          wss.usernames.add(username);
          wss.authenticatedClients.add(socket);
          connectionLogger('JOIN', username);

          const messages = await getRecentMessages();
          socket.send(JSON.stringify({ type: 'history', messages }));

          const joinText = `${username} has joined.`;
          broadcast(wss, { type: 'system', text: joinText });
          saveMessage({ type: 'system', text: joinText });
        } else {
          loginLimiter.recordFailedAttempt(ip, username);
          socket.send(JSON.stringify({ type: 'system', text: 'Login failed. Please try again.' }));
        }

      } else {
        socket.send(JSON.stringify({
          type: 'system',
          text: 'You must authenticate. Use /register <username> <password> or /login <username> <password>',
        }));
      }
    });

  } else {
    const desiredUsername = clampUsername(query.username || generateUsername());

    if (isIllegalUsername(desiredUsername)) {
      socket.send(JSON.stringify({
        type: 'system',
        text: `Illegal username. Must be 3-20 characters, only letters, digits, underscore, dash. Connection rejected.`,
      }));
      socket.close();
      return;
    }

    if (bannedUsers.includes(desiredUsername)) {
      socket.send(JSON.stringify({
        type: 'system',
        text: `You are banned from this chatroom. Connection rejected.`,
      }));
      socket.close();
      return;
    }

    if (wss.usernames.has(desiredUsername)) {
      socket.send(JSON.stringify({
        type: 'system',
        text: `Username "${desiredUsername}" is already taken. Connection rejected.`,
      }));
      socket.close();
      return;
    }

    socket.username = desiredUsername;
    wss.usernames.add(desiredUsername);
    connectionLogger('JOIN', desiredUsername);

    getRecentMessages()
      .then((messages) => {
        socket.send(JSON.stringify({ type: 'history', messages }));

        const joinText = `${desiredUsername} has joined.`;
        broadcast(wss, { type: 'system', text: joinText });
        saveMessage({ type: 'system', text: joinText });
      })
      .catch((err) => {
        console.error('Failed to load message history:', err);
        socket.send(JSON.stringify({ type: 'system', text: 'Failed to load chat history.' }));
      });

    socket.on('message', handleMessage);
  }

  socket.on('close', () => {
    if (socket.username) {
      connectionLogger('LEAVE', socket.username);
      wss.usernames.delete(socket.username);

      const leaveText = `${socket.username} has left.`;
      broadcast(wss, { type: 'system', text: leaveText });
      saveMessage({ type: 'system', text: leaveText });
    }
  });
};
