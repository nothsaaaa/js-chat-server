const loadSettings = require('../handlers/loadSettings');
const loadBansAndAdmins = require('../handlers/loadBansAndAdmins');
const connectionLimiter = require('../handlers/connectionLimiter');
const broadcast = require('../handlers/broadcast');
const authHandler = require('../handlers/authHandler');
const unauthHandler = require('../handlers/unauthHandler');
const { clampUsername } = require('../utils/colorUtils');
const generateUsername = require('../utils/generateUsername');
const connectionLogger = require('../middleware/connectionLogger');
const handleCommand = require('../utils/commands');
const loginLimiter = require('../utils/loginLimiter');

module.exports = (socket, req, wss) => {
  const ip = req.socket.remoteAddress;
  const settings = loadSettings();
  const { bannedUsers, adminUsers } = loadBansAndAdmins();

  if (!connectionLimiter(ip, socket, wss, settings)) return;

  if (!wss.usernames) wss.usernames = new Set();
  if (!wss.authenticatedClients) wss.authenticatedClients = new Set();

  if (settings.authentication) {
    authHandler(socket, req, wss, settings, adminUsers, broadcast, loginLimiter, bannedUsers, connectionLogger, handleCommand);
  } else {
    unauthHandler(socket, req, wss, settings, bannedUsers, broadcast, generateUsername, clampUsername, connectionLogger, handleCommand);
  }

  socket.on('close', () => {
    if (socket.username) {
      connectionLogger('LEAVE', socket.username);
      wss.usernames.delete(socket.username);
      const leaveText = `${socket.username} has left.`;
      broadcast(wss, { type: 'system', text: leaveText }, settings);
      const { saveMessage } = require('../utils/db');
      saveMessage({ type: 'system', text: leaveText });
    }
  });
};
