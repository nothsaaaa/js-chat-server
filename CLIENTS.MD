# WebSocket Chat Client Documentation

This document explains how to create a WebSocket client to connect and communicate with the chat server.
Example clients in examples/clients/

---

## Overview

The chat server uses a WebSocket connection to handle real-time messaging. Clients can:

* Connect with an optional username
* Receive chat and system messages
* Send chat messages and commands

---

## Connecting to the Server

* The public community server URL is:

  ```
  ws://147.185.221.28:61429
  ```

* You can optionally pass a username as a URL query parameter:

  ```
  ws://147.185.221.28:61429?username=YourName
  ```

* If no username is provided, the server assigns a random anonymous username.

---

## Message Types

The server sends and expects JSON messages with the following types:

### Incoming Messages from Server

* **`history`**: Sent once on connection. Contains recent messages.

  ```json
  {
    "type": "history",
    "messages": [
      {
        "type": "chat" | "system",
        "username": "User1",  // null for system messages
        "text": "Message text",
        "timestamp": "2025-05-28T15:04:05.000Z"
      },
      ...
    ]
  }
  ```

* **`chat`**: Regular chat message from a user. This is outgoing, after the server processed it (including things like filtering, commands, etc.)

  ```json
  {
    "type": "chat",
    "username": "User1",
    "text": "Hello everyone!",
    "timestamp": "2025-05-28T15:05:00.000Z"
  }
  ```

* **`system`**: System messages like joins, leaves, or nickname changes.

  ```json
  {
    "type": "system",
    "text": "User1 has joined."
  }
  ```

---

## Sending Messages to the Server

* **Chat message**

  Send a JSON string representing an object with `type: "message"` and the message content in the `content` field.

  Example:

  ```js
  ws.send(JSON.stringify({
    type: "message",
    content: "Hello everyone!"
  }));
  ```

* **Change nickname**

  Send a message starting with `/nick` followed by the new username as a plain string:

  ```js
  ws.send("/nick NewName");
  ```

* **Ping**

  This is for web browsers which don't send keepalive requests by default.
  If you don't send a ping, the connection may close when idle.

  The ping message is a JSON string like this:

  ```json
  { "type": "ping" }
  ```

  The server ignores this message; clients typically send it every 25 seconds.

---

### Notes

* Messages **must** be sent as strings, but chat messages should be JSON strings with the structure shown above.
* Nickname changes and commands remain as plain string messages starting with `/`.
* The server broadcasts messages in JSON format to all connected clients.
* Sending invalid or malformed JSON will result in an error message from the server.
