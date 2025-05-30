module.exports = (wss, data, settings) => {
  settings = settings || {};  // fallback to empty object

  wss.clients.forEach((client) => {
    if (
      client.readyState === 1 &&
      (!settings.authentication || client.authenticated)
    ) {
      client.send(JSON.stringify(data));
    }
  });
};
