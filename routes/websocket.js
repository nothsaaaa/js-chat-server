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

// Define illegal username check with max length 20
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

module.exports = (socket, req, wss) => {
  const query = url.parse(req.url, true).query;

  if (!wss.usernames) wss.usernames = new Set();
  if (!wss.authenticatedClients) wss.authenticatedClients = new Set();

  // Load banned users once on connection
  const bannedPath = path.join(__dirname, '../banned.json');
  let bannedUsers = [];
  if (fs.existsSync(bannedPath)) {
    bannedUsers = JSON.parse(fs.readFileSync(bannedPath));
  }

  const handleMessage = (msg) => {
    msg = msg.toString().trim();
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
      const ip = req.socket.remoteAddress;

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

      // Reject banned users before allowing login
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

    // Reject banned users before allowing connection
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
