(() => {
  const connectBtn = document.getElementById('connectBtn');
  const usernameInput = document.getElementById('usernameInput');
  const chatDiv = document.getElementById('chat');
  const messagesDiv = document.getElementById('messages');
  const messageInput = document.getElementById('messageInput');
  const sendBtn = document.getElementById('sendBtn');
  const serverInfoBtn = document.getElementById('serverInfoBtn');

  let ws;
  let heartbeatInterval = null;
  let sessionToken = null;
  let heartbeatConfig = {
    interval: 30000,
    timeout: 35000
  };

  const userColors = {};
  const originalTitle = document.title;
  const serverIP = "localhost:3000";
  let windowFocused = true;
  let newMessagesWhileUnfocused = false;

  async function fetchServerInfo() {
    try {
      const res = await fetch('http://' + serverIP + '/server-info');
      if (!res.ok) throw new Error('Failed to fetch server info');

      const info = await res.json();

      // Basic info
      if (info.serverName)
        addMessage(`Name: ${info.serverName}`, 'system');

      if (info.motd)
        addMessage(`MOTD: ${info.motd}`, 'system');

      if (info.port)
        addMessage(`Port: ${info.port}`, 'system');

      if (typeof info.authentication === 'boolean')
        addMessage(`Authentication: ${info.authentication ? 'Enabled' : 'Disabled'}`, 'system');

      // Messaging
      if (info.maxMessagesPerSecond !== undefined)
        addMessage(`Max Messages/sec: ${info.maxMessagesPerSecond}`, 'system');

      if (info.nickChangeCooldown !== undefined)
        addMessage(`Nick Change Cooldown: ${info.nickChangeCooldown} ms`, 'system');

      // Connection limits
      if (info.connectionLimits) {
        if (info.connectionLimits.totalMaxConnections !== undefined)
          addMessage(`Max Total Connections: ${info.connectionLimits.totalMaxConnections}`, 'system');

        if (info.connectionLimits.maxConnectionsPerIP !== undefined)
          addMessage(`Max Connections Per IP: ${info.connectionLimits.maxConnectionsPerIP}`, 'system');

        if (info.connectionLimits.maxConnectionsPerWindow !== undefined)
          addMessage(`Max Connections Per Window: ${info.connectionLimits.maxConnectionsPerWindow}`, 'system');

        if (info.connectionLimits.connectionWindowMs !== undefined)
          addMessage(`Connection Window: ${info.connectionLimits.connectionWindowMs} ms`, 'system');
      }

      // Heartbeat
      if (info.heartbeat) {
        if (info.heartbeat.interval !== undefined)
          addMessage(`Interval: ${info.heartbeat.interval} ms`, 'system');

        if (info.heartbeat.timeout !== undefined)
          addMessage(`Timeout: ${info.heartbeat.timeout} ms`, 'system');
      }

      // WebRTC
      if (info.webrtc) {
        addMessage(`Enabled: ${info.webrtc.enabled ? 'Yes' : 'No'}`, 'system');

        if (info.webrtc.enabled) {
          if (info.webrtc.maxParticipants !== undefined)
            addMessage(`Max Participants: ${info.webrtc.maxParticipants}`, 'system');

          if (info.webrtc.allowVideo !== undefined)
            addMessage(`Video Allowed: ${info.webrtc.allowVideo ? 'Yes' : 'No'}`, 'system');

          if (info.webrtc.allowScreenShare !== undefined)
            addMessage(`Screen Share Allowed: ${info.webrtc.allowScreenShare ? 'Yes' : 'No'}`, 'system');

          if (info.webrtc.forceRelay !== undefined)
            addMessage(`Force Relay: ${info.webrtc.forceRelay ? 'Yes' : 'No'}`, 'system');
        }
      }

      // Live stats
      if (info.currentStats) {
        if (info.currentStats.connectedUsers !== undefined)
          addMessage(`Connected Users: ${info.currentStats.connectedUsers}`, 'system');

        if (info.currentStats.voiceParticipants !== undefined)
          addMessage(`Voice Participants: ${info.currentStats.voiceParticipants}`, 'system');
      }

    } catch (err) {
      addMessage(`Error fetching server info: ${err.message}`, 'system');
    }
  }

  function hashCode(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
      hash |= 0;
    }
    return hash;
  }

  function getColorForUsername(username) {
    if (userColors[username]) return userColors[username];
    const hash = hashCode(username);
    const hue = Math.abs(hash) % 360;
    const color = `hsl(${hue}, 60%, 75%)`;
    userColors[username] = color;
    return color;
  }

  function escapeHTML(str) {
    return str.replace(/[&<>"']/g, (tag) => {
      const charsToReplace = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      };
      return charsToReplace[tag] || tag;
    });
  }

  function convertLinksSafe(text) {
    const escapedText = escapeHTML(text);
    const urlRegex = /(\bhttps?:\/\/[^\s]+)/gi;

    let linkedText = escapedText.replace(urlRegex, (url) => {
      const safeUrl = url.replace(/"/g, "&quot;");
      return `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer">${url}</a>`;
    });

    linkedText = linkedText
      .replace(/\*\*\*(.+?)\*\*\*/g, '<b><i>$1</i></b>')
      .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
      .replace(/\*(.+?)\*/g, '<i>$1</i>')
      .replace(/\|\|(.+?)\|\|/g, (_, spoilerText) => {
        const safeText = escapeHTML(spoilerText);
        return `<span class="spoiler" onclick="this.classList.add('revealed')">${safeText}</span>`;
      });

    return linkedText;
  }

  function addMessage(text, className = '', username = null) {
    const p = document.createElement('p');
    if (className) p.classList.add(className);

    if (username) {
      const userSpan = document.createElement('span');
      userSpan.textContent = `${username}: `;
      userSpan.style.color = getColorForUsername(username);
      userSpan.classList.add('username');
      p.appendChild(userSpan);

      const msgSpan = document.createElement('span');
      msgSpan.innerHTML = convertLinksSafe(text);
      p.appendChild(msgSpan);
    } else {
      p.innerHTML = convertLinksSafe(text);
    }

    messagesDiv.appendChild(p);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;

    if (!windowFocused) {
      if (!newMessagesWhileUnfocused) {
        document.title = `*${originalTitle}`;
        newMessagesWhileUnfocused = true;
      }
    }
  }

  function startHeartbeat() {
    stopHeartbeat();

    if (!heartbeatConfig.interval || !sessionToken) return;

    heartbeatInterval = setInterval(() => {
      if (ws && ws.readyState === WebSocket.OPEN && sessionToken) {
        ws.send(JSON.stringify({
          type: "ping",
          token: sessionToken
        }));
      }
    }, heartbeatConfig.interval);
  }

  function stopHeartbeat() {
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
      heartbeatInterval = null;
    }
  }

  window.addEventListener('focus', () => {
    windowFocused = true;
    if (newMessagesWhileUnfocused) {
      document.title = originalTitle;
      newMessagesWhileUnfocused = false;
    }
  });

  window.addEventListener('blur', () => {
    windowFocused = false;
  });

  connectBtn.addEventListener('click', () => {
    const username = usernameInput.value.trim();

    const serverUrl = username
      ? `ws://${serverIP}?username=${encodeURIComponent(username)}`
      : `ws://${serverIP}`;

    ws = new WebSocket(serverUrl);

    ws.onopen = () => {
      addMessage('Connected to server.', 'system');
      chatDiv.style.display = 'block';
      connectBtn.disabled = true;
      usernameInput.disabled = true;
    };

    ws.onmessage = (event) => {
      try {
        const msgObj = JSON.parse(event.data);

        switch (msgObj.type) {

          case 'session-token':
            sessionToken = msgObj.token;
            addMessage('[Client] Session token received.', 'system');
            startHeartbeat();
            break;

          case 'heartbeat-config':
            heartbeatConfig.interval = msgObj.interval;
            heartbeatConfig.timeout = msgObj.timeout;
            addMessage(`[Client] Heartbeat configured (${msgObj.interval}ms)`, 'system');
            startHeartbeat();
            break;

          case 'pong':
            // Optional debug/logging
            // addMessage('[Client] Pong received.', 'system');
            break;

          case 'history':
            messagesDiv.innerHTML = '';
            msgObj.messages.forEach(m => {
              if (m.type === 'system') {
                addMessage(m.text, 'system');
              } else if (m.type === 'chat') {
                addMessage(m.text, '', m.username);
              }
            });
            break;

          case 'system':
            addMessage(msgObj.text, 'system');
            break;

          case 'chat':
            addMessage(msgObj.text, '', msgObj.username);
            break;

          default:
            // Ignore unsupported types for now
            break;
        }

      } catch {
        addMessage(event.data);
      }
    };

    ws.onclose = () => {
      addMessage('Disconnected from server.', 'system');
      connectBtn.disabled = false;
      usernameInput.disabled = false;
      stopHeartbeat();
      sessionToken = null;
    };

    ws.onerror = () => {
      addMessage('WebSocket error.', 'system');
    };
  });

  sendBtn.addEventListener('click', () => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      alert('Not connected');
      return;
    }

    if (!sessionToken) {
      alert('Session not established yet.');
      return;
    }

    const msg = messageInput.value.trim();
    if (!msg) return;

    ws.send(JSON.stringify({
      type: "chat",
      token: sessionToken,
      content: msg
    }));

    messageInput.value = '';
    messageInput.focus();
  });

  serverInfoBtn.addEventListener('click', fetchServerInfo);

  messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendBtn.click();
    }
  });

})();
