# js-chat-server

A lightweight, feature-rich WebSocket chat server written in JavaScript.

Possibly the most complete WebSocket chat server available.

---

## Features

* **Real-time messaging** - WebSocket-based instant communication
* **Flexible authentication** - Optional usernames, session-based security
* **Command system** - Extensible modular commands + built-in commands
* **Chat history** - New clients receive recent message history
* **WebRTC support** - Built-in voice and video chat (SFU architecture)
* **Heartbeat monitoring** - Automatic dead connection detection
* **Rate limiting** - Protection against spam and abuse
* **Extensible** - Easy to add custom commands and features

---

## Quick Start

```bash
# Install and run server
npm install
npm start
```

Server runs on `ws://localhost:3000` by default.

For client examples, see [docs/QUICKSTART.md](docs/QUICKSTART.md).

---

## Documentation

### For Client Developers

* **[Quickstart Guide](docs/QUICKSTART.md)** - Get a very basic client running in 5 minutes
* **[Protocol Specification](docs/PROTOCOL.md)** - Complete wire protocol reference
* **[Commands Reference](docs/COMMANDS.md)** - Available chat commands
* **[WebRTC Guide](docs/WEBRTC.md)** - Voice/video chat integration

### For Server Administrators

* **Server Configuration** - _(Coming soon)_
* **Deployment Guide** - _(Coming soon)_

### Additional Resources

* **[Example Clients](docs/EXAMPLES.md)** - Reference implementations & working clients to start with

---

## Architecture

```
Client (Browser/App)
    ↕ WebSocket + JSON messages
Server (Node.js)
    ↕ WebRTC signaling only
Client ←→ Client (P2P Audio/Video)
```

The server acts as a **WebRTC signaling server**, relaying connection setup messages between clients. Once connected, audio/video streams flow **peer-to-peer** (or through TURN if `forceRelay` is enabled to prevent IP leaks).

---

## Requirements

**Server:**
* Node.js 14+ 
* npm or yarn

**Client:**
* WebSocket support (all modern browsers)
* WebRTC support (optional, for voice/video)

---

## Contributing

Contributions are welcome! Please ensure:

* Client examples work with the current protocol
* Documentation stays up-to-date
* Code follows existing style conventions

---

**Next Steps:**

1. Read the [Quickstart Guide](docs/QUICKSTART.md) to build your first client
2. Review the [Protocol Specification](docs/PROTOCOL.md) for complete details
3. Check out [Example Clients](docs/EXAMPLES.md) for reference implementations