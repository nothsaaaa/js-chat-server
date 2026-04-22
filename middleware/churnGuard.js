const ipState = new Map();

function onConnect(ip, socket, settings) {
  const cfg = _config(settings);
  if (!cfg.enabled) return true;

  _prune(ip, cfg);

  const state = _getState(ip);

  if (state.blockedUntil !== null) {
    if (Date.now() < state.blockedUntil) {
      const remaining = Math.ceil((state.blockedUntil - Date.now()) / 1000);
      try {
        socket.send(JSON.stringify({
          type: 'system',
          text: `Your IP is temporarily blocked due to repeated reconnections. Try again in ${remaining}s.`,
        }));
      } catch (_) {}
      socket.close(1008, 'Churn block');
      return false;
    } else {
      state.blockedUntil = null;
      state.cycles = [];
    }
  }

  state.pendingConnect = Date.now();

  return true;
}

function onDisconnect(ip, settings) {
  const cfg = _config(settings);
  if (!cfg.enabled) return;

  const state = _getState(ip);

  if (state.pendingConnect !== null) {
    state.cycles.push(Date.now());
    state.pendingConnect = null;
  }

  _prune(ip, cfg);

  if (state.cycles.length >= cfg.maxCycles) {
    state.blockedUntil = Date.now() + cfg.blockDurationMs;
    state.cycles = [];
    console.log(
      `[CHURN GUARD] Blocked ${ip} for ${cfg.blockDurationMs / 1000}s ` +
      `(${cfg.maxCycles} rapid cycles detected)`
    );
  }
}

function _getState(ip) {
  if (!ipState.has(ip)) {
    ipState.set(ip, { cycles: [], pendingConnect: null, blockedUntil: null });
  }
  return ipState.get(ip);
}

function _prune(ip, cfg) {
  const state = _getState(ip);
  const cutoff = Date.now() - cfg.windowMs;
  state.cycles = state.cycles.filter(ts => ts > cutoff);
}

function _config(settings) {
  const defaults = {
    enabled: true,
    windowMs: 300000,
    maxCycles: 5,
    blockDurationMs: 600000,
  };
  return Object.assign({}, defaults, settings.churnGuard || {});
}

module.exports = { onConnect, onDisconnect };