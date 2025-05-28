module.exports = function connectionLogger(action, username) {
  const time = new Date().toISOString();
  console.log(`[${time}] ${action}: ${username}`);
};
