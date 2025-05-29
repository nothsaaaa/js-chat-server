const { clampUsername } = require('./colorUtils');
const { saveMessage } = require('./db');

const handleCommand = (msg, socket, wss, broadcast) => {
  if (msg.startsWith('/nick')) {
    const newName = clampUsername(msg.slice(5).trim());
    const oldName = socket.username;

    // Reject if new name is already in use
    if (wss.usernames.has(newName)) {
      socket.send(JSON.stringify({
        type: 'system',
        text: `Username "${newName}" is already taken.`,
      }));
      return true;
    }

    socket.username = newName;

    wss.usernames.delete(oldName);
    wss.usernames.add(newName);

    const nickChangeText = `${oldName} is now ${newName}`;
    broadcast(wss, { type: 'system', text: nickChangeText });
    saveMessage({ type: 'system', text: nickChangeText });
    return true;
  }

  if (msg === '/list') {
    const onlineUsers = Array.from(wss.usernames);
    socket.send(JSON.stringify({ type: 'system', text: `Online users: ${onlineUsers.join(', ')}` }));
    return true;
  }

  return false;
};

module.exports = handleCommand;
