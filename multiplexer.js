const WebSocket = require("ws");
const fs = require("fs");
const path = require("path");

const backendsFile = path.join(__dirname, "backends.json");

const defaultBackends = {
  room1: "ws://localhost:3001",
  room2: "ws://localhost:3002",
};

if (!fs.existsSync(backendsFile)) {
  console.log("backends.json not found. creating default backends.json");
  fs.writeFileSync(backendsFile, JSON.stringify(defaultBackends, null, 2), "utf-8");
  console.log("created backends.json with default servers:", Object.keys(defaultBackends).join(", "));
}

const backends = JSON.parse(fs.readFileSync(backendsFile));

const wss = new WebSocket.Server({ port: 3000 });
console.log("Proxy listening on ws://localhost:3000");

function getMotd() {
  return "Welcome to the Multiplexer Proxy! Use /servers to list rooms, /join <room> to connect.";
}

function handleCommand(message, client, context) {
  const [cmd, ...args] = message.slice(1).trim().split(/\s+/);

  if (cmd === "join") {
    const targetServer = args[0];
    if (!context.backends[targetServer]) {
      client.send(JSON.stringify({ type: "system", text: `Unknown server: ${targetServer}` }));
    } else {
      client.send(JSON.stringify({ type: "system", text: `Connecting to ${targetServer}...` }));
      context.switchServer(client, targetServer);
    }
    return true;
  }

  if (cmd === "servers") {
    const list = Object.keys(context.backends).join(", ");
    client.send(JSON.stringify({ type: "system", text: `Available servers: ${list}` }));
    return true;
  }

  return false;
}

function createRouter(backends) {
  const clientToBackend = new Map();

  function switchServer(client, targetName) {
    const url = backends[targetName];
    if (!url) return;

    if (clientToBackend.has(client)) {
      clientToBackend.get(client).terminate();
    }

    const backend = new WebSocket(url);
    clientToBackend.set(client, backend);
    client._connectedTo = targetName;

    backend.on("open", () => {
      client.send(JSON.stringify({ type: "system", text: `Connected to ${targetName}` }));
    });

    backend.on("message", (data, isBinary) => {
      if (isBinary) {
        const text = data.toString();
        try {
          const json = JSON.parse(text);
          client.send(JSON.stringify(json));
        } catch (err) {
          client.send(JSON.stringify({ type: "system", text: "§cReceived invalid binary message from backend." }));
        }
      } else {
        client.send(data.toString());
      }
    });

    backend.on("close", () => {
      client.send(JSON.stringify({ type: "system", text: "Disconnected from backend." }));
    });

    backend.on("error", (err) => {
      client.send(JSON.stringify({ type: "system", text: `Backend error: ${err.message}` }));
    });

    client.on("close", () => {
      if (backend.readyState === WebSocket.OPEN) backend.close();
      clientToBackend.delete(client);
    });
  }

  function getBackend(client) {
    return clientToBackend.get(client);
  }

  return { switchServer, getBackend };
}

const { switchServer, getBackend } = createRouter(backends);

wss.on("connection", (ws) => {
  ws.send(JSON.stringify({ type: "motd", text: getMotd() }));
  ws.send(JSON.stringify({
    type: "system",
    text: "Type /servers to list rooms, /join <room> to connect."
  }));

  ws.on("message", (msg) => {
    const str = msg.toString();

    if (str.startsWith("/")) {
      handleCommand(str, ws, { backends, switchServer });
      return;
    }

    const backend = getBackend(ws);
    if (!backend || backend.readyState !== WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: "system",
        text: "You are not connected to a server. Type /servers or /join <room>."
      }));
      return;
    }

    backend.send(msg);
  });

  ws.on("close", () => {
    const backend = getBackend(ws);
    if (backend && backend.readyState === WebSocket.OPEN) {
      backend.close();
    }
  });
});
