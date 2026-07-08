# js-chat-server

A lightweight, feature-rich WebSocket chat server written in JavaScript.

Possibly the most complete WebSocket chat server available.

---

## Features

* **Real-time messaging** - WebSocket-based instant communication
* **Flexible authentication** - Optional usernames, session-based security
* **Command system** - Extensible modular commands + built-in commands
* **Chat history** - New clients receive recent message history
* **Work-In-Progress WebRTC support**
* **Heartbeat monitoring** - Automatic dead connection detection
* **Rate limiting** - Protection against spam and abuse
* **Timezone support** - IANA timezone-aware timestamps for all messages (default: `'UTC'`)

---

## Quick Start

```bash
# Install and run server
npm install
npm start
```

Server runs on `ws://localhost:8443` by default.

For client examples, see [docs/EXAMPLES.md](docs/EXAMPLES.md).

* **[Quickstart Guide](docs/QUICKSTART.md)** - Get a very basic client running in 5 minutes
* **[Protocol Specification](docs/PROTOCOL.md)** - Complete protocol reference
* **[Commands Reference](docs/COMMANDS.md)** - Available chat commands
* **[WebRTC Guide](docs/WEBRTC.md)** - Voice/video chat integration

### For Server Administrators

* **Server Configuration** - _(Coming 2037)_
* **Deployment Guide** - _(Coming 2037)_

### Additional Resources

* **[Example Clients](docs/EXAMPLES.md)** - Reference implementations & working clients to start with

---

## Requirements

**Server:**
* Node.js 14+ 
* npm or yarn

**Client:**
* WebSocket support (all modern browsers)
* WebRTC support (optional, for voice/video)

---

## Client Timestamp Guidelines

All messages include an ISO 8601 timestamp with a timezone offset (e.g. `2027-08-30T15:30:00+02:00`). To display these correctly in the user's local time, clients should:

1. Fetch the server's configured timezone from `GET /server-info` (returns `{ configured, actual }`)
2. Use that timezone when formatting received timestamps with `Intl.DateTimeFormat()`
3. Fall back to UTC if the `/server-info` call fails or no timezone is available

The example clients in this repo (`examples/client/js-web/`, `examples/client/minimal-example.js`) demonstrate both patterns.

---

## Contributing

Contributions are welcome! Please ensure:

* Client examples work with the current protocol
* Documentation stays up-to-date
* Code follows existing style conventions
