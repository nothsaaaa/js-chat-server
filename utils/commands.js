const fs = require('fs');
const path = require('path');
const { clampUsername } = require('./colorUtils');
const { saveMessage } = require('./db');

const isIllegalUsername = (username) => {
  return !/^[A-Za-z0-9_-]{3,20}$/.test(username);
};

const handleCommand = (msg, socket, wss, broadcast, settings, adminUsers) => {
  const isAuth = settings.authentication;

  if (msg.startsWith('/nick')) {
    if (isAuth) {
      socket.send(JSON.stringify({ type: 'system', text: 'Nick change is disabled on authentication servers.' }));
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

  if (msg.startsWith('/kick')) {
    if (!settings.authentication || !socket.isAdmin) {
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
      socket.send(JSON.stringify({
        type: 'system',
        text: 'Illegal username in /kick command.',
      }));
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
    if (!settings.authentication || !socket.isAdmin) {
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
      socket.send(JSON.stringify({
        type: 'system',
        text: 'Illegal username in /ban command.',
      }));
      return true;
    }

    // Load banned users from file
    const bannedPath = path.join(__dirname, '../banned.json');
    let bannedUsers = [];
    if (fs.existsSync(bannedPath)) {
      bannedUsers = JSON.parse(fs.readFileSync(bannedPath));
    }

    if (bannedUsers.includes(target)) {
      socket.send(JSON.stringify({ type: 'system', text: `${target} is already banned.` }));
      return true;
    }

    // Add target to banned users list and save file
    bannedUsers.push(target);
    fs.writeFileSync(bannedPath, JSON.stringify(bannedUsers, null, 2));

    // Kick the user if online
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

  return false;
};

module.exports = handleCommand;
