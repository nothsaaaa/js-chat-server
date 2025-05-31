const url = require('url');

function serverInfoHandler(req, res, wss, settings) {
  const parsedUrl = url.parse(req.url, true);

  if (parsedUrl.pathname === '/server-info') {
    const info = {
      serverName: settings.serverName || "Unnamed Server",
      totalMaxConnections: settings.totalMaxConnections,
      currentOnline: wss.clients.size
    };

    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(JSON.stringify(info));
    return true;
  }

  return false;
}

module.exports = serverInfoHandler;
