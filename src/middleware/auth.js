const jwt = require('jsonwebtoken');
const pool = require('../config/database');
require('dotenv').config();

const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Token de acceso requerido' });
  }

  jwt.verify(token, process.env.JWT_SECRET, async (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Token inválido o expirado' });
    }

    try {
      const sessionId = user.session_id;
      if (sessionId) {
        const [sessionRows] = await pool.execute(
          'SELECT id, is_active, expires_at, replaced_at FROM sessions WHERE session_id = ? AND user_id = ? AND user_role = ? LIMIT 1',
          [sessionId, user.id || user.clientId, user.role]
        );

        if (sessionRows.length === 0 || !sessionRows[0].is_active) {
          return res.status(409).json({ error: 'SESSION_REPLACED', message: 'Tu sesión fue cerrada porque se inició sesión en otro dispositivo.' });
        }

        if (sessionRows[0].replaced_at) {
          return res.status(409).json({ error: 'SESSION_REPLACED', message: 'Tu sesión fue cerrada porque se inició sesión en otro dispositivo.' });
        }

        if (new Date(sessionRows[0].expires_at) < new Date()) {
          await pool.execute('UPDATE sessions SET is_active = 0 WHERE id = ?', [sessionRows[0].id]);
          return res.status(403).json({ error: 'Token expirado', message: 'La sesión ha expirado.' });
        }

        await pool.execute('UPDATE sessions SET updated_at = NOW() WHERE id = ?', [sessionRows[0].id]);
      }

      req.user = user;
      next();
    } catch (dbErr) {
      console.error('Error verificando sesión:', dbErr);
      return res.status(500).json({ error: 'Error interno del servidor' });
    }
  });
};

const requireRole = (allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Token de acceso requerido' });
    }
    const role = req.user.role;
    if (!allowedRoles.includes(role)) {
      return res.status(403).json({ error: 'No tienes permisos para acceder a este recurso' });
    }
    next();
  };
};

module.exports = { authenticateToken, requireRole };