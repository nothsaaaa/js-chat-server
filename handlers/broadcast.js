const BLOCK_DURATION_MS = 12 * 60 * 60 * 10;

module.exports = (wss, data, settings) => {
  settings = settings || {};

  wss.clients.forEach((client) => {
    if (
      client.readyState !== 1 ||
      (settings.authentication && !client.authenticated)
    ) return;

    if (data.type === 'system') {
      client.send(JSON.stringify(data));
      return;
    }

    if (client.blockedUsers && data.username) {
      const blockedAt = client.blockedUsers[data.username];
      if (blockedAt) {
        if (Date.now() - blockedAt > BLOCK_DURATION_MS) {
          delete client.blockedUsers[data.username];
        } else {
          return;
        }
      }
    }

    client.send(JSON.stringify(data));
  });
};
