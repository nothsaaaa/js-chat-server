module.exports = (username) => {
  return /^[A-Za-z0-9_-]{3,20}$/.test(username);
};
