const url = require('url');
const { clampUsername } = require('../utils/colorUtils');
const generateUsername = require('../utils/generateUsername');
const connectionLogger = require('../middleware/connectionLogger');
const { saveMessage, getRecentMessages } = require('../utils/db');

const broadcast = (wss, data) => {
  wss.clients.forEach((client) => {
    if (client.readyState === 1) {
      client.send(JSON.stringify(data));
    }
  });
};

module.exports = (socket, req, wss) => {
  const query = url.parse(req.url, true).query;
  const username = clampUsername(query.username || generateUsername());

  socket.username = username;
  connectionLogger('JOIN', username);

  // Initialize the usernames set if not already present
  if (!wss.usernames) {
    wss.usernames = new Set();
  }
  wss.usernames.add(username);

  // Send recent messages history to the new client
  getRecentMessages()
    .then((messages) => {
      socket.send(JSON.stringify({ type: 'history', messages }));

      const joinText = `${username} has joined.`;
      broadcast(wss, { type: 'system', text: joinText });
      saveMessage({ type: 'system', text: joinText });
    })
    .catch((err) => {
      console.error('Failed to load message history:', err);
      socket.send(JSON.stringify({ type: 'system', text: 'Failed to load chat history.' }));
    });

  socket.on('message', (msg) => {
    msg = msg.toString().trim();

    if (msg.startsWith('/nick')) {
      const newName = clampUsername(msg.slice(5).trim());
      const oldName = socket.username;
      socket.username = newName;

      // Update the username set
      wss.usernames.delete(oldName);
      wss.usernames.add(newName);

      const nickChangeText = `${oldName} is now ${newName}`;
      broadcast(wss, { type: 'system', text: nickChangeText });
      saveMessage({ type: 'system', text: nickChangeText });
      return;
    }

    if (msg === '/list') {
      const onlineUsers = Array.from(wss.usernames);
      socket.send(JSON.stringify({ type: 'system', text: `Online users: ${onlineUsers.join(', ')}` }));
      return;
    }

    // Regular chat message
    const messageObj = {
      type: 'chat',
      username: socket.username,
      text: msg,
      timestamp: new Date().toISOString(),
    };

    saveMessage(messageObj);
    broadcast(wss, messageObj);
  });

  socket.on('close', () => {
    connectionLogger('LEAVE', socket.username);

    // Remove user from the usernames set
    wss.usernames.delete(socket.username);

    const leaveText = `${socket.username} has left.`;
    broadcast(wss, { type: 'system', text: leaveText });
    saveMessage({ type: 'system', text: leaveText });
  });
};
