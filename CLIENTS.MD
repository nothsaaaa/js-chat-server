# WebSocket Chat Client Documentation

This document explains how to create a WebSocket client to connect and communicate with the chat server.
Example clients are in `examples/clients/`.

---

## Overview

The chat server uses a WebSocket connection to handle real-time messaging. Clients can:

* Connect with an optional username
* Receive chat and system messages
* Send chat messages and commands
* Maintain connection with periodic pings (OPTIONAL)

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

* **Session Token**

  Upon connection, the server generates and sends a unique session token to your client in a message like this:

  ```json
  {
    "type": "session-token",
    "token": "<your-session-token>"
  }
  ```

  Your client **must** save this token and include it in **every** message you send to the server (except ping messages). Messages without the correct token will be rejected.

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

* **`chat`**: Regular chat message from a user, after processing by the server (including filtering, commands, etc.)

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

* **General requirements**

  * All outgoing messages **must** be JSON strings with the following common structure:

    ```json
    {
      "type": "<message-type>",
      "token": "<your-session-token>",
      // other fields depending on type
    }
    ```

  * The server validates the `token` field against your session; messages with missing or invalid tokens are rejected.

* **Chat message**

  To send a chat message (including commands starting with `/`), send:

  ```js
  ws.send(JSON.stringify({
    type: "chat",
    token: "<your-session-token>",
    content: "Hello everyone!"
  }));
  ```

  * The `content` field must be a string.
  * Messages longer than 2000 characters or 5KB in UTF-8 size will be rejected.
  * Messages sent too frequently (more than the server's rate limit) will be rejected.
  * Commands like `/nick newname` or `/help` are handled internally by the server when sent as `content` in a `"chat"` message.

* **Ping**

  To keep the connection alive (especially in browsers), send a ping message every \~25 seconds:

  ```js
  ws.send(JSON.stringify({
    type: "ping"
  }));
  ```

  * The server ignores this message but uses it to keep the connection open.
  * The server does **not** require a token for ping messages.

---

### Notes

* Messages **must** be valid JSON strings.
* Sending malformed JSON or missing the `token` (except on ping) will cause the server to send an error system message.
* The server broadcasts messages in JSON format to all connected clients.
* Your client should listen for `"history"` on connection and `"chat"` and `"system"` messages during the session.
