const ATTEMPT_LIMIT = 5;
const BAN_DURATION_MS = 60 * 60 * 1000; // 1 hour

// Format: { 'ip:username': { count, bannedUntil } }
const loginAttempts = new Map();

function isBlocked(ip, username) {
  const key = `${ip}:${username}`;
  const entry = loginAttempts.get(key);

  if (entry && entry.bannedUntil && Date.now() < entry.bannedUntil) {
    return true;
  }

  return false;
}

function recordFailedAttempt(ip, username) {
  const key = `${ip}:${username}`;
  const now = Date.now();

  let entry = loginAttempts.get(key) || { count: 0, bannedUntil: null };

  entry.count += 1;

  if (entry.count >= ATTEMPT_LIMIT) {
    entry.bannedUntil = now + BAN_DURATION_MS;
    entry.count = 0;
  }

  loginAttempts.set(key, entry);
}

function resetAttempts(ip, username) {
  const key = `${ip}:${username}`;
  loginAttempts.delete(key);
}

module.exports = {
  isBlocked,
  recordFailedAttempt,
  resetAttempts,
};
