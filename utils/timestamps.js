// iso 8601 format with timezone offset, e.g. 2027-08-30T15:30:00+02:00
function formatISOWithOffset(date) {
  const utc = new Date(date.toISOString());
  const offMs = utc.getTime() - Date.UTC(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate(), utc.getUTCHours(), utc.getUTCMinutes(), utc.getUTCSeconds(), 0);
  const totalMin = Math.floor(offMs / 60000);
  const sign = totalMin >= 0 ? '+' : '-';
  const absH = Math.abs(Math.trunc(totalMin / 60));
  const absM = Math.abs(totalMin) % 60;
  return `${utc.toISOString().slice(0, -1)}${sign}${String(absH).padStart(2, '0')}:${String(absM).padStart(2, '0')}`;
}

function parseISOToUTC(iso) {
  const d = new Date(iso);
  return d.toISOString();
}

module.exports = { formatISOWithOffset, parseISOToUTC };
