const fs = require('fs');
const path = require('path');
const { clampUsername } = require('./colorUtils');
const { saveMessage } = require('./db');

const isIllegalUsername = (username) => {
  return !/^[A-Za-z0-9_-]{3,20}$/.test(username);
};

const BLOCK_DURATION_MS = 12 * 60 * 60 * 1000; // 12 hours

const handleCommand = (msg, socket, wss, broadcast, settings, adminUsers) => {
  const isAuth = settings.authentication;
  const nickChangeCooldown = typeof settings.nickChangeCooldown === 'number' ? settings.nickChangeCooldown : 60000;

  if (msg.startsWith('/nick')) {
    if (isAuth) {
      socket.send(JSON.stringify({ type: 'system', text: 'Nick change is disabled on authentication servers.' }));
      return true;
    }

    const now = Date.now();
    if (socket.lastNickChange && now - socket.lastNickChange < nickChangeCooldown) {
      const secondsLeft = Math.ceil((nickChangeCooldown - (now - socket.lastNickChange)) / 1000);
      socket.send(JSON.stringify({
        type: 'system',
        text: `You can only change your nickname once every ${nickChangeCooldown / 1000} seconds. Please wait ${secondsLeft} more seconds.`,
      }));
      return true;
    }

    const newName = clampUsername(msg.slice(5).trim());
    if (isIllegalUsername(newName)) {
      socket.send(JSON.stringify({
        type: 'system',
        text: 'Illegal username. Must be 3-20 characters, only letters, digits, underscore, dash.',
      }));
      return true;
    }

    const oldName = socket.username;
    if (wss.usernames.has(newName)) {
      socket.send(JSON.stringify({ type: 'system', text: `Username "${newName}" is already taken.` }));
      return true;
    }

    socket.username = newName;
    socket.lastNickChange = now;

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

  if (msg.startsWith('/kick')) {
    if (!isAuth || !socket.isAdmin) {
      socket.send(JSON.stringify({ type: 'system', text: 'You do not have permission to use /kick.' }));
      return true;
    }

    const targetRaw = msg.slice(5).trim();
    if (!targetRaw) {
      socket.send(JSON.stringify({ type: 'system', text: 'Please specify a username to kick.' }));
      return true;
    }

    const target = clampUsername(targetRaw);
    if (isIllegalUsername(target)) {
      socket.send(JSON.stringify({ type: 'system', text: 'Illegal username in /kick command.' }));
      return true;
    }

    let found = false;
    wss.clients.forEach((client) => {
      if (client.username === target && client !== socket) {
        client.send(JSON.stringify({ type: 'system', text: 'You have been kicked by an admin.' }));
        client.close();
        found = true;
      }
    });

    if (found) {
      broadcast(wss, { type: 'system', text: `${target} was kicked by ${socket.username}.` });
    } else {
      socket.send(JSON.stringify({ type: 'system', text: `User "${target}" not found.` }));
    }

    return true;
  }

  if (msg.startsWith('/ban')) {
    if (!isAuth || !socket.isAdmin) {
      socket.send(JSON.stringify({ type: 'system', text: 'You do not have permission to use /ban.' }));
      return true;
    }

    const targetRaw = msg.slice(4).trim();
    if (!targetRaw) {
      socket.send(JSON.stringify({ type: 'system', text: 'Please specify a username to ban.' }));
      return true;
    }

    const target = clampUsername(targetRaw);
    if (isIllegalUsername(target)) {
      socket.send(JSON.stringify({ type: 'system', text: 'Illegal username in /ban command.' }));
      return true;
    }

    const bannedPath = path.join(__dirname, '../banned.json');
    let bannedUsers = [];
    if (fs.existsSync(bannedPath)) {
      bannedUsers = JSON.parse(fs.readFileSync(bannedPath));
    }

    if (bannedUsers.includes(target)) {
      socket.send(JSON.stringify({ type: 'system', text: `${target} is already banned.` }));
      return true;
    }

    bannedUsers.push(target);
    fs.writeFileSync(bannedPath, JSON.stringify(bannedUsers, null, 2));

    let found = false;
    wss.clients.forEach((client) => {
      if (client.username === target && client !== socket) {
        client.send(JSON.stringify({ type: 'system', text: 'You have been banned by an admin.' }));
        client.close();
        found = true;
      }
    });

    broadcast(wss, { type: 'system', text: `${target} was banned by ${socket.username}.` });
    saveMessage({ type: 'system', text: `${target} was banned by ${socket.username}.` });

    if (!found) {
      socket.send(JSON.stringify({ type: 'system', text: `User "${target}" is now banned.` }));
    }

    return true;
  }

  if (msg.startsWith('/unban')) {
    if (!isAuth || !socket.isAdmin) {
      socket.send(JSON.stringify({ type: 'system', text: 'You do not have permission to use /unban.' }));
      return true;
    }

    const targetRaw = msg.slice(6).trim();
    if (!targetRaw) {
      socket.send(JSON.stringify({ type: 'system', text: 'Please specify a username to unban.' }));
      return true;
    }

    const target = clampUsername(targetRaw);
    if (isIllegalUsername(target)) {
      socket.send(JSON.stringify({ type: 'system', text: 'Illegal username in /unban command.' }));
      return true;
    }

    const bannedPath = path.join(__dirname, '../banned.json');
    let bannedUsers = [];
    if (fs.existsSync(bannedPath)) {
      bannedUsers = JSON.parse(fs.readFileSync(bannedPath));
    }

    if (!bannedUsers.includes(target)) {
      socket.send(JSON.stringify({ type: 'system', text: `${target} is not banned.` }));
      return true;
    }

    bannedUsers = bannedUsers.filter(user => user !== target);
    fs.writeFileSync(bannedPath, JSON.stringify(bannedUsers, null, 2));

    socket.send(JSON.stringify({ type: 'system', text: `${target} has been unbanned.` }));
    broadcast(wss, { type: 'system', text: `${target} was unbanned by ${socket.username}.` });
    saveMessage({ type: 'system', text: `${target} was unbanned by ${socket.username}.` });

    return true;
  }

  if (msg.startsWith('/block')) {
    const targetRaw = msg.slice(6).trim();
    if (!targetRaw) {
      socket.send(JSON.stringify({ type: 'system', text: 'Usage: /block <username>' }));
      return true;
    }

    const target = clampUsername(targetRaw);
    if (target === socket.username) {
      socket.send(JSON.stringify({ type: 'system', text: 'You cannot block yourself.' }));
      return true;
    }

    if (!socket.blockedUsers) socket.blockedUsers = {};
    socket.blockedUsers[target] = Date.now();
    socket.send(JSON.stringify({ type: 'system', text: `You have blocked ${target} for 12 hours.` }));
    return true;
  }

  if (msg.startsWith('/unblock')) {
    const targetRaw = msg.slice(8).trim();
    if (!targetRaw) {
      socket.send(JSON.stringify({ type: 'system', text: 'Usage: /unblock <username>' }));
      return true;
    }

    const target = clampUsername(targetRaw);
    if (socket.blockedUsers && socket.blockedUsers[target]) {
      delete socket.blockedUsers[target];
      socket.send(JSON.stringify({ type: 'system', text: `You have unblocked ${target}.` }));
    } else {
      socket.send(JSON.stringify({ type: 'system', text: `${target} was not blocked.` }));
    }

    return true;
  }

  if (msg === '/help') {
    const helpText = [
      '/nick <name> - Change your nickname (disabled if authentication is enabled).',
      '/list - List online users.',
      '/kick <username> - Kick a user (admins only).',
      '/ban <username> - Ban a user (admins only).',
      '/unban <username> - Unban a user (admins only).',
      '/block <username> - Block a user for 12 hours.',
      '/unblock <username> - Unblock a user.',
      '/help - Show this help message.'
    ].join('\n');

    socket.send(JSON.stringify({ type: 'system', text: helpText }));
    return true;
  }

  return false;
};

module.exports = handleCommand;
