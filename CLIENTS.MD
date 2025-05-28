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

* The server WebSocket URL is:

  ```
  ws://localhost:3000
  ```

* You can optionally pass a username as a URL query parameter:

  ```
  ws://localhost:3000?username=YourName
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

* **`chat`**: Regular chat message from a user.

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

  Simply send the message text as a string over the WebSocket.

  Example:

  ```js
  ws.send("Hello everyone!");
  ```

* **Change nickname**

  Send a message starting with `/nick` followed by the new username:

  ```js
  ws.send("/nick NewName");
  ```

---

## Notes

* The client should not send system messages.
* The server handles system messages internally (e.g., join/leave notifications).
* Messages must be sent as plain strings.
* The server broadcasts all messages to connected clients in JSON format.
* Timestamps are ISO 8601 strings.