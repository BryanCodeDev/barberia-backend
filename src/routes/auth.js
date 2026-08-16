const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const pool = require('../config/database');
const { sendOtpCode } = require('../utils/notifications');
const { validate } = require('../middleware/validate');
require('dotenv').config();

const router = express.Router();

const { authenticateToken, requireRole } = require('../middleware/auth');
const { authLimiter, otpLimiter } = require('../middleware/rateLimiter');

const SESSION_DURATION_HOURS = 24;

function generateSessionId() {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
}

async function createSession(userId, userRole, userAgent, ipAddress) {
  const sessionId = generateSessionId();
  const expiresAt = new Date(Date.now() + SESSION_DURATION_HOURS * 60 * 60 * 1000);

  await pool.execute(
    'UPDATE sessions SET is_active = 0, replaced_at = NOW() WHERE user_id = ? AND user_role = ? AND is_active = 1',
    [userId, userRole]
  );

  await pool.execute(
    'INSERT INTO sessions (user_id, user_role, session_id, user_agent, ip_address, expires_at) VALUES (?, ?, ?, ?, ?, ?)',
    [userId, userRole, sessionId, userAgent || null, ipAddress || null, expiresAt]
  );

  return sessionId;
}

async function invalidateSession(sessionId) {
  await pool.execute(
    'UPDATE sessions SET is_active = 0, replaced_at = NOW() WHERE session_id = ?',
    [sessionId]
  );
}

const loginSchema = {
  body: {
    username: {
      required: true,
      requiredMessage: 'El usuario es requerido',
      minLength: 2,
      minLengthMessage: 'El usuario debe tener al menos 2 caracteres',
    },
    password: {
      required: true,
      requiredMessage: 'La contraseña es requerida',
    },
  },
};

const otpRequestSchema = {
  body: {
    phone: {
      required: true,
      requiredMessage: 'El teléfono es requerido',
      pattern: /^\d{10}$/,
      patternMessage: 'El teléfono debe tener 10 dígitos',
    },
  },
};

const otpVerifySchema = {
  body: {
    phone: {
      required: true,
      requiredMessage: 'El teléfono es requerido',
      pattern: /^\d{10}$/,
      patternMessage: 'El teléfono debe tener 10 dígitos',
    },
    code: {
      required: true,
      requiredMessage: 'El código es requerido',
      pattern: /^\d{6}$/,
      patternMessage: 'El código debe tener 6 dígitos',
    },
  },
};

const googleSchema = {
  body: {
    id_token: {
      required: true,
      requiredMessage: 'El token de Google es requerido',
      type: 'string',
    },
  },
};

router.get('/verify', authenticateToken, (req, res) => {
  const user = req.user;
  if (user.role === 'client') {
    return res.json({ id: user.clientId, phone: user.phone, role: user.role });
  }
  res.json({ id: user.id, username: user.username, role: user.role, entity_id: user.entity_id });
});

router.post('/logout', authenticateToken, async (req, res) => {
  try {
    const sessionId = req.user.session_id;
    if (sessionId) {
      await invalidateSession(sessionId);
    }
    res.json({ success: true, message: 'Sesión cerrada correctamente' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

const OTP_EXPIRY_MINUTES = 5;
const OTP_MAX_ATTEMPTS = 5;
const OTP_RESEND_COOLDOWN_SECONDS = 60;

router.use('/login', authLimiter);
router.post('/login', validate(loginSchema), async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !username.trim()) {
      return res.status(400).json({ error: 'El usuario es requerido' });
    }
    if (!password || !password.trim()) {
      return res.status(400).json({ error: 'La contraseña es requerida' });
    }

    const [rows] = await pool.execute('SELECT * FROM admin_users WHERE username = ? AND is_active = 1', [username.trim()]);
    const admin = rows[0];

    if (!admin) {
      return res.status(401).json({ error: 'Credenciales incorrectas' });
    }

    const validPassword = await bcrypt.compare(password, admin.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Credenciales incorrectas' });
    }

    const sessionId = await createSession(admin.id, admin.role, req.headers['user-agent'], req.ip);

    const token = jwt.sign(
      { id: admin.id, username: admin.username, role: admin.role, entity_id: admin.entity_id, session_id: sessionId },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
    );

    res.json({ token, user: { id: admin.id, username: admin.username } });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

router.use('/client/request-otp', otpLimiter);
router.post('/client/request-otp', validate(otpRequestSchema), async (req, res) => {
  try {
    const { phone } = req.body;

    if (!phone || !/^\d{10}$/.test(String(phone).trim())) {
      return res.status(400).json({ error: 'El teléfono debe tener 10 dígitos' });
    }

    const [recent] = await pool.execute(
      'SELECT id FROM otp_codes WHERE phone = ? AND expires_at > NOW() AND used = 0 AND created_at > DATE_SUB(NOW(), INTERVAL ? SECOND)',
      [String(phone).trim(), OTP_RESEND_COOLDOWN_SECONDS]
    );
    if (recent.length > 0) {
      return res.status(429).json({
        error: `Debes esperar ${OTP_RESEND_COOLDOWN_SECONDS} segundos entre solicitudes de código`,
      });
    }

    await pool.execute(
      'DELETE FROM otp_codes WHERE phone = ? AND (expires_at <= NOW() OR used = 1)',
      [String(phone).trim()]
    );

    const code = Math.floor(100000 + Math.random() * 900000).toString();

    await pool.execute(
      'INSERT INTO otp_codes (phone, code, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? MINUTE))',
      [String(phone).trim(), code, OTP_EXPIRY_MINUTES]
    );

    sendOtpCode(phone, code).catch((err) => {
      console.error('Error sending OTP code:', err);
    });

    res.json({
      success: true,
      message: 'Código de verificación enviado por WhatsApp',
      expires_in_minutes: OTP_EXPIRY_MINUTES,
    });
  } catch (error) {
    console.error('Error requesting OTP:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

router.use('/client/verify-otp', authLimiter);
router.post('/client/verify-otp', validate(otpVerifySchema), async (req, res) => {
  try {
    const { phone, code } = req.body;

    if (!phone || !/^\d{10}$/.test(String(phone).trim())) {
      return res.status(400).json({ error: 'El teléfono debe tener 10 dígitos' });
    }
    if (!code || !/^\d{6}$/.test(String(code).trim())) {
      return res.status(400).json({ error: 'El código debe tener 6 dígitos' });
    }

    const [rows] = await pool.execute(
      'SELECT * FROM otp_codes WHERE phone = ? AND used = 0 AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1',
      [String(phone).trim()]
    );

    const otpRecord = rows[0];

    if (!otpRecord) {
      return res.status(401).json({ error: 'Código incorrecto o expirado. Solicita uno nuevo.' });
    }

    if (otpRecord.attempts >= OTP_MAX_ATTEMPTS) {
      await pool.execute('DELETE FROM otp_codes WHERE id = ?', [otpRecord.id]);
      return res.status(429).json({ error: `Demasiados intentos fallidos (${OTP_MAX_ATTEMPTS}). Solicita un nuevo código.` });
    }

    if (otpRecord.code !== String(code).trim()) {
      await pool.execute(
        'UPDATE otp_codes SET attempts = attempts + 1 WHERE id = ?',
        [otpRecord.id]
      );
      const remaining = OTP_MAX_ATTEMPTS - otpRecord.attempts - 1;
      return res.status(401).json({
        error: 'Código incorrecto',
        remaining_attempts: remaining,
      });
    }

    await pool.execute('UPDATE otp_codes SET used = 1 WHERE id = ?', [otpRecord.id]);

    const [clientRows] = await pool.execute(
      'SELECT id, name, phone, email, total_visits, last_visit FROM clients WHERE phone = ?',
      [String(phone).trim()]
    );

    const client = clientRows[0];
    if (!client) {
      return res.status(404).json({
        error: 'No se encontró un cliente con este teléfono. Agenda una cita primero desde la página principal.',
        needs_registration: true,
      });
    }

    await pool.execute('UPDATE clients SET phone_verified = 1 WHERE id = ?', [client.id]);

    const sessionId = await createSession(client.id, 'client', req.headers['user-agent'], req.ip);

    const token = jwt.sign(
      { clientId: client.id, phone: client.phone, role: 'client', session_id: sessionId },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      id: client.id,
      name: client.name,
      phone: client.phone,
      token,
    });
  } catch (error) {
    console.error('Error verifying OTP:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

router.use('/client/google', authLimiter);
router.post('/client/google', validate(googleSchema), async (req, res) => {
  try {
    const { id_token } = req.body;

    if (!id_token || typeof id_token !== 'string') {
      return res.status(400).json({ error: 'Token de Google requerido' });
    }

    const googleResponse = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(id_token)}`);
    if (!googleResponse.ok) {
      return res.status(401).json({ error: 'Token de Google inválido' });
    }

    const googleData = await googleResponse.json();
    const email = googleData.email;
    const name = googleData.name;
    const googleId = googleData.sub;

    if (!email || !googleId) {
      return res.status(400).json({ error: 'No se pudo obtener información de Google' });
    }

    const [clientRows] = await pool.execute(
      'SELECT id, name, phone, email, phone_verified FROM clients WHERE google_id = ? OR email = ?',
      [googleId, email]
    );

    let client = clientRows[0];

    if (!client) {
      const [insertResult] = await pool.execute(
        'INSERT INTO clients (name, email, google_id, phone_verified) VALUES (?, ?, ?, 0)',
        [name, email, googleId]
      );
      client = {
        id: insertResult.insertId,
        name,
        phone: null,
        email,
        phone_verified: 0,
      };
    } else if (!client.phone_verified || !client.phone) {
      return res.status(200).json({
        needs_phone_verification: true,
        client_id: client.id,
        message: 'Verifica tu número de teléfono para continuar',
      });
    }

    const sessionId = await createSession(client.id, 'client', req.headers['user-agent'], req.ip);

    const token = jwt.sign(
      { clientId: client.id, phone: client.phone, role: 'client', session_id: sessionId },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      id: client.id,
      name: client.name,
      phone: client.phone,
      token,
    });
  } catch (error) {
    console.error('Google login error:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

module.exports = router;
