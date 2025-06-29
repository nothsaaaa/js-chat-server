const { clampUsername } = require('../utils/colorUtils');
const { saveMessage, getRecentMessages } = require('../utils/db');
const { registerUser, authenticateUser } = require('../utils/auth');
const validateUsername = require('./validateUsername');

module.exports = (socket, req, wss, settings, adminUsers, broadcast, loginLimiter, bannedUsers, connectionLogger, handleCommand) => {
  socket.send(JSON.stringify({
    type: 'system',
    text: 'Authentication required. Use /register <username> <password> or /login <username> <password> in message content.',
  }));

  const messageHandler = require('./messageHandler')(socket, wss, broadcast, settings, adminUsers, handleCommand);

  socket.on('message', async (rawMsg) => {
    let msg;
    try {
      msg = JSON.parse(rawMsg);
    } catch {
      socket.send(JSON.stringify({
        type: 'system',
        text: 'Invalid message format. Must be JSON.',
      }));
      return;
    }

    if (socket.authenticated) {
      return messageHandler(rawMsg);
    }

    if (msg.type === 'ping') return;

    if (msg.type !== 'chat' || typeof msg.content !== 'string') {
      socket.send(JSON.stringify({
        type: 'system',
        text: 'Please authenticate first using /register or /login commands in message content.',
      }));
      return;
    }

    const content = msg.content.trim();

    const parts = content.split(' ');
    const command = parts[0];
    const rawUsername = parts[1];
    const password = parts.slice(2).join(' ');

    if (command !== '/register' && command !== '/login') {
      socket.send(JSON.stringify({
        type: 'system',
        text: 'Please authenticate first using /register or /login commands.',
      }));
      return;
    }

    if (!rawUsername || !password) {
      socket.send(JSON.stringify({
        type: 'system',
        text: 'Username and password required.',
      }));
      return;
    }

    const username = clampUsername(rawUsername);

    if (!validateUsername(username)) {
      socket.send(JSON.stringify({
        type: 'system',
        text: 'Illegal username. Requirement: 3-20 characters alphanumeric.',
      }));
      return;
    }

    if (password.length < 8 || password.length > 32) {
      socket.send(JSON.stringify({
        type: 'system',
        text: 'Password length invalid. Must be 8-32 characters.',
      }));
      return;
    }

    if (bannedUsers.includes(username)) {
      socket.send(JSON.stringify({
        type: 'system',
        text: 'You are banned.',
      }));
      socket.close();
      return;
    }

    if (command === '/register') {
      const success = await registerUser(username, password);
      socket.send(JSON.stringify({
        type: 'system',
        text: success ? 'Registered. Please /login.' : 'Username exists.',
      }));
      return;
    }

    if (command === '/login') {
      const ip = req.socket.remoteAddress;
      if (loginLimiter.isBlocked(ip, username)) {
        socket.send(JSON.stringify({
          type: 'system',
          text: 'Too many failed attempts. Blocked for 1 hour.',
        }));
        return;
      }

      if (await authenticateUser(username, password)) {
        if (wss.usernames.has(username)) {
          socket.send(JSON.stringify({
            type: 'system',
            text: 'Username in use.',
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

        if (settings.motd) {
          socket.send(JSON.stringify({ type: 'system', text: `MOTD: ${settings.motd}` }));
        }

        const joinText = `${username} has joined.`;
        broadcast(wss, { type: 'system', text: joinText }, settings);
        saveMessage({ type: 'system', text: joinText });
      } else {
        loginLimiter.recordFailedAttempt(ip, username);
        socket.send(JSON.stringify({
          type: 'system',
          text: 'Login failed.',
        }));
      }
    }
  });
};
