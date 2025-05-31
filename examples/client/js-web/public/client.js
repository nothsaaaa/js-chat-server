(() => {
  const connectBtn = document.getElementById('connectBtn');
  const usernameInput = document.getElementById('usernameInput');
  const chatDiv = document.getElementById('chat');
  const messagesDiv = document.getElementById('messages');
  const messageInput = document.getElementById('messageInput');
  const sendBtn = document.getElementById('sendBtn');
  const serverInfoBtn = document.getElementById('serverInfoBtn');

  let ws;
  let pingInterval;

  const userColors = {};
  const originalTitle = document.title;
  const serverIP = "147.185.221.28:61429"
  let windowFocused = true;
  let newMessagesWhileUnfocused = false;

  async function fetchServerInfo() {
    try {
      const res = await fetch('http://' + serverIP + '/server-info');
      if (!res.ok) throw new Error('Failed to fetch server info');
      const info = await res.json();

      addMessage(`Server Name: ${info.serverName}`,'system')
      addMessage(`Max Connections: ${info.totalMaxConnections}`,'system')
      addMessage(`Current Online: ${info.currentOnline}`,'system')
      
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
      msgSpan.textContent = text;
      p.appendChild(msgSpan);
    } else {
      p.textContent = text;
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
      ? 'ws://' + serverIP + `/?username=${encodeURIComponent(username)}`
      : 'ws://' + serverIP;

    ws = new WebSocket(serverUrl);

    ws.onopen = () => {
      addMessage('Connected to server.', 'system');
      chatDiv.style.display = 'block';
      connectBtn.disabled = true;
      usernameInput.disabled = true;

      // Browsers sometimes don't send keepalive requests, infact, they rarely do.
      // Because of this it is optimal to send custom ones, which the server recieves and effectively discards.
      // However, it keeps the connection alive especially during tab throttling.
      pingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ping' }));
        }
      }, 25000);
    };

    ws.onmessage = (event) => {
      try {
        const msgObj = JSON.parse(event.data);

        if (msgObj.type === 'history') {
          messagesDiv.innerHTML = '';
          msgObj.messages.forEach(m => {
            if (m.type === 'system') {
              addMessage(m.text, 'system');
            } else if (m.type === 'chat') {
              addMessage(m.text, '', m.username);
            }
          });
          return;
        }

        if (msgObj.type === 'system') {
          addMessage(msgObj.text, 'system');
        } else if (msgObj.type === 'chat') {
          addMessage(msgObj.text, '', msgObj.username);
        }
      } catch {
        addMessage(event.data);
      }
    };

    ws.onclose = () => {
      addMessage('Disconnected from server.', 'system');
      connectBtn.disabled = false;
      usernameInput.disabled = false;

      clearInterval(pingInterval);
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
    const msg = messageInput.value.trim();
    if (!msg) return;

    ws.send(JSON.stringify({
      type: "message",
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