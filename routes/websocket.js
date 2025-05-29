const url = require('url');
const { clampUsername } = require('../utils/colorUtils');
const generateUsername = require('../utils/generateUsername');
const connectionLogger = require('../middleware/connectionLogger');
const { saveMessage, getRecentMessages } = require('../utils/db');
const handleCommand = require('../utils/commands');

const broadcast = (wss, data) => {
  wss.clients.forEach((client) => {
    if (client.readyState === 1) {
      client.send(JSON.stringify(data));
    }
  });
};

module.exports = (socket, req, wss) => {
  const query = url.parse(req.url, true).query;
  const desiredUsername = clampUsername(query.username || generateUsername());

  if (!wss.usernames) {
    wss.usernames = new Set();
  }

  // Reject duplicate usernames
  if (wss.usernames.has(desiredUsername)) {
    socket.send(JSON.stringify({
      type: 'system',
      text: `Username "${desiredUsername}" is already taken. Connection rejected.`,
    }));
    socket.close();
    return;
  }

  socket.username = desiredUsername;
  wss.usernames.add(socket.username);
  connectionLogger('JOIN', socket.username);

  getRecentMessages()
    .then((messages) => {
      socket.send(JSON.stringify({ type: 'history', messages }));

      const joinText = `${socket.username} has joined.`;
      broadcast(wss, { type: 'system', text: joinText });
      saveMessage({ type: 'system', text: joinText });
    })
    .catch((err) => {
      console.error('Failed to load message history:', err);
      socket.send(JSON.stringify({ type: 'system', text: 'Failed to load chat history.' }));
    });

  socket.on('message', (msg) => {
    msg = msg.toString().trim();

    // Delegate command handling
    const wasCommand = handleCommand(msg, socket, wss, broadcast);
    if (wasCommand) return;

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
    wss.usernames.delete(socket.username);

    const leaveText = `${socket.username} has left.`;
    broadcast(wss, { type: 'system', text: leaveText });
    saveMessage({ type: 'system', text: leaveText });
  });
};
