const { clampUsername } = require('../utils/colorUtils');
const { saveMessage, getRecentMessages } = require('../utils/db');
const { registerUser, authenticateUser } = require('../utils/auth');
const validateUsername = require('./validateUsername');

module.exports = (socket, req, wss, settings, adminUsers, broadcast, loginLimiter, bannedUsers, connectionLogger, handleCommand) => {
  socket.send(JSON.stringify({
    type: 'system',
    text: 'Authentication required. Use /register <username> <password> or /login <username> <password>',
  }));

  const messageHandler = require('./messageHandler')(socket, wss, broadcast, settings, adminUsers, handleCommand);

  socket.on('message', async (msg) => {
    msg = msg.toString().trim();
    if (socket.authenticated) return messageHandler(msg);

    const parts = msg.split(' ');
    const command = parts[0];
    const rawUsername = parts[1];
    const password = parts.slice(2).join(' ');

    if (!rawUsername || !password) {
      socket.send(JSON.stringify({ type: 'system', text: 'Username and password required.' }));
      return;
    }

    const username = clampUsername(rawUsername);

    if (!validateUsername(username)) {
      socket.send(JSON.stringify({ type: 'system', text: 'Illegal username.' }));
      return;
    }

    if (password.length < 8 || password.length > 32) {
      socket.send(JSON.stringify({ type: 'system', text: 'Password length invalid.' }));
      return;
    }

    if (bannedUsers.includes(username)) {
      socket.send(JSON.stringify({ type: 'system', text: 'You are banned.' }));
      socket.close();
      return;
    }

    if (command === '/register') {
      const success = await registerUser(username, password);
      socket.send(JSON.stringify({ type: 'system', text: success ? 'Registered. Please /login.' : 'Username exists.' }));
    } else if (command === '/login') {
      if (loginLimiter.isBlocked(req.socket.remoteAddress, username)) {
        socket.send(JSON.stringify({ type: 'system', text: 'Too many failed attempts. Blocked for 1 hour.' }));
        return;
      }

      if (await authenticateUser(username, password)) {
        if (wss.usernames.has(username)) {
          socket.send(JSON.stringify({ type: 'system', text: 'Username in use.' }));
          socket.close();
          return;
        }

        socket.username = username;
        socket.authenticated = true;
        socket.isAdmin = adminUsers.includes(username);
        loginLimiter.resetAttempts(req.socket.remoteAddress, username);
        wss.usernames.add(username);
        wss.authenticatedClients.add(socket);
        connectionLogger('JOIN', username);

        const messages = await getRecentMessages();
        socket.send(JSON.stringify({ type: 'history', messages }));
        if (settings.motd) socket.send(JSON.stringify({ type: 'system', text: `MOTD: ${settings.motd}` }));

        const joinText = `${username} has joined.`;
        broadcast(wss, { type: 'system', text: joinText }, settings);
        saveMessage({ type: 'system', text: joinText });
      } else {
        loginLimiter.recordFailedAttempt(req.socket.remoteAddress, username);
        socket.send(JSON.stringify({ type: 'system', text: 'Login failed.' }));
      }
    }
  });
};
