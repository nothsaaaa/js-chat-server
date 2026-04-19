const BLOCK_DURATION_MS = 12 * 60 * 60 * 1000; // 12 hours

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

    if (client.blockedUsers && data.senderIp) {
      const blockedAt = client.blockedUsers[data.senderIp];
      if (blockedAt) {
        if (Date.now() - blockedAt > BLOCK_DURATION_MS) {
          delete client.blockedUsers[data.senderIp];
        } else {
          return;
        }
      }
    }

    const { senderIp, ...outbound } = data;
    client.send(JSON.stringify(outbound));
  });
};