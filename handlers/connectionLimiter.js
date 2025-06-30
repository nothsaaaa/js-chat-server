const ipConnectionTimestamps = new Map();

module.exports = (ip, socket, wss, settings) => {
  const totalMaxConnections = settings.totalMaxConnections || 20;
  if (wss.clients.size >= totalMaxConnections) {
    socket.send(JSON.stringify({
      type: 'system',
      text: 'Server is full. Please try again later.',
    }));
    socket.close();
    return false;
  }

  const now = Date.now();
  const windowSize = settings.connectionWindowMs || 30000;
  const maxConnectionsPerWindow = settings.maxConnectionsPerWindow || 2;
  const maxTotalConnectionsPerIP = settings.maxTotalConnections || 4;

  const timestamps = ipConnectionTimestamps.get(ip) || [];
  const recent = timestamps.filter(ts => now - ts < windowSize);
  recent.push(now);
  ipConnectionTimestamps.set(ip, recent);

  if (recent.length > maxConnectionsPerWindow) {
    socket.send(JSON.stringify({
      type: 'system',
      text: `Too many connections from this IP. Limit is ${maxConnectionsPerWindow} per ${windowSize / 1000} seconds.`,
    }));
    socket.close();
    return false;
  }

  const currentIPConnections = Array.from(wss.clients).filter(client => client._ip === ip).length;
  if (currentIPConnections >= maxTotalConnectionsPerIP) {
    socket.send(JSON.stringify({
      type: 'system',
      text: `Too many concurrent connections from this IP. Maximum allowed is ${maxTotalConnectionsPerIP}.`,
    }));
    socket.close();
    return false;
  }

  return true;
};
