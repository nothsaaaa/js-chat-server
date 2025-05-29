const settings = require('../settings.json');

module.exports = (wss, data) => {
  wss.clients.forEach((client) => {
    if (
      client.readyState === 1 &&
      (!settings.authentication || client.authenticated)
    ) {
      client.send(JSON.stringify(data));
    }
  });
};
