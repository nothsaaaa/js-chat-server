module.exports = (wss, data, settings) => {
  wss.clients.forEach((client) => {
    if (
      client.readyState === 1 &&
      (!settings.authentication || client.authenticated)
    ) {
      client.send(JSON.stringify(data));
    }
  });
};
