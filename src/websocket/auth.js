const jwt = require('jsonwebtoken');
const pool = require('../config/database');

async function authenticateSocket(token) {
  if (!token || typeof token !== 'string') {
    return { authenticated: false, reason: 'Token missing' };
  }

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    return { authenticated: false, reason: 'Token invalid' };
  }

  const sessionId = decoded.session_id;
  if (!sessionId) {
    return { authenticated: false, reason: 'No session id in token' };
  }

  try {
    const [sessionRows] = await pool.execute(
      'SELECT id, is_active, expires_at, replaced_at FROM sessions WHERE session_id = ? AND user_id = ? AND user_role = ? LIMIT 1',
      [sessionId, decoded.id || decoded.clientId, decoded.role]
    );

    if (sessionRows.length === 0 || !sessionRows[0].is_active) {
      return { authenticated: false, reason: 'SESSION_REPLACED' };
    }

    if (sessionRows[0].replaced_at) {
      return { authenticated: false, reason: 'SESSION_REPLACED' };
    }

    if (new Date(sessionRows[0].expires_at) < new Date()) {
      await pool.execute('UPDATE sessions SET is_active = 0 WHERE id = ?', [sessionRows[0].id]);
      return { authenticated: false, reason: 'Session expired' };
    }

    await pool.execute('UPDATE sessions SET updated_at = NOW() WHERE id = ?', [sessionRows[0].id]);
  } catch (dbErr) {
    return { authenticated: false, reason: 'Database error' };
  }

  return {
    authenticated: true,
    user: {
      id: decoded.id || decoded.clientId,
      role: decoded.role,
      username: decoded.username,
      entity_id: decoded.entity_id,
      session_id: sessionId,
    },
  };
}

module.exports = { authenticateSocket };
