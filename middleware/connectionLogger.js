const { formatISOWithOffset } = require('../utils/timestamps');

module.exports = function connectionLogger(action, username) {
  const time = formatISOWithOffset(new Date());
  console.log(`[${time}] ${action}: ${username}`);
};
