const { getRecentMessages, saveMessage } = require('../utils/db');
const validateUsername = require('./validateUsername');

module.exports = (socket, req, wss, settings, bannedUsers, broadcast, generateUsername, clampUsername, connectionLogger, handleCommand) => {
  const desiredUsername = clampUsername(require('url').parse(req.url, true).query.username || generateUsername());

  if (!validateUsername(desiredUsername)) {
    socket.send(JSON.stringify({ type: 'system', text: 'Illegal username.' }));
    socket.close();
    return;
  }

  if (bannedUsers.includes(desiredUsername)) {
    socket.send(JSON.stringify({ type: 'system', text: 'You are banned.' }));
    socket.close();
    return;
  }

  if (wss.usernames.has(desiredUsername)) {
    socket.send(JSON.stringify({ type: 'system', text: 'Username taken.' }));
    socket.close();
    return;
  }

  socket.username = desiredUsername;
  wss.usernames.add(desiredUsername);
  connectionLogger('JOIN', desiredUsername);

  getRecentMessages().then((messages) => {
    socket.send(JSON.stringify({ type: 'history', messages }));
    if (settings.motd) socket.send(JSON.stringify({ type: 'system', text: `MOTD: ${settings.motd}` }));
    const joinText = `${desiredUsername} has joined.`;
    broadcast(wss, { type: 'system', text: joinText }, settings);
    saveMessage({ type: 'system', text: joinText });
  });

  const messageHandler = require('./messageHandler')(socket, wss, broadcast, settings, [], handleCommand);
  socket.on('message', messageHandler);
};
