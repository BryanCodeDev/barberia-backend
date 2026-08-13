const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const pool = require('../config/database');
const { validate } = require('../middleware/validate');
const { sendOtpCode } = require('../utils/notifications');
require('dotenv').config();

const router = express.Router();

const OTP_EXPIRY_MINUTES = 5;
const OTP_MAX_ATTEMPTS = 5;
const OTP_RESEND_COOLDOWN_SECONDS = 60;

router.post('/login', [
  body('username').notEmpty().withMessage('El usuario es requerido'),
  body('password').notEmpty().withMessage('La contraseña es requerida'),
], validate, async (req, res) => {
  try {
    const { username, password } = req.body;

    const [rows] = await pool.execute('SELECT * FROM admin_users WHERE username = ? AND is_active = 1', [username]);
    const admin = rows[0];

    if (!admin) {
      return res.status(401).json({ error: 'Credenciales incorrectas' });
    }

    const validPassword = await bcrypt.compare(password, admin.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Credenciales incorrectas' });
    }

    const token = jwt.sign(
      { id: admin.id, username: admin.username },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
    );

    res.json({ token, user: { id: admin.id, username: admin.username } });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

router.post('/client/request-otp', [
  body('phone').matches(/^\d{10}$/).withMessage('El teléfono debe tener 10 dígitos'),
], validate, async (req, res) => {
  try {
    const { phone } = req.body;

    const [recent] = await pool.execute(
      'SELECT id FROM otp_codes WHERE phone = ? AND expires_at > NOW() AND used = 0 AND created_at > DATE_SUB(NOW(), INTERVAL ? SECOND)',
      [phone, OTP_RESEND_COOLDOWN_SECONDS]
    );
    if (recent.length > 0) {
      return res.status(429).json({
        error: `Debes esperar ${OTP_RESEND_COOLDOWN_SECONDS} segundos entre solicitudes de código`,
      });
    }

    await pool.execute(
      'DELETE FROM otp_codes WHERE phone = ? AND (expires_at <= NOW() OR used = 1)',
      [phone]
    );

    const code = Math.floor(100000 + Math.random() * 900000).toString();

    await pool.execute(
      'INSERT INTO otp_codes (phone, code, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? MINUTE))',
      [phone, code, OTP_EXPIRY_MINUTES]
    );

    await sendOtpCode(phone, code);

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

router.post('/client/verify-otp', [
  body('phone').matches(/^\d{10}$/).withMessage('El teléfono debe tener 10 dígitos'),
  body('code').matches(/^\d{6}$/).withMessage('El código debe tener 6 dígitos'),
], validate, async (req, res) => {
  try {
    const { phone, code } = req.body;

    const [rows] = await pool.execute(
      'SELECT * FROM otp_codes WHERE phone = ? AND used = 0 AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1',
      [phone]
    );

    const otpRecord = rows[0];

    if (!otpRecord) {
      return res.status(401).json({ error: 'Código incorrecto o expirado. Solicita uno nuevo.' });
    }

    if (otpRecord.attempts >= OTP_MAX_ATTEMPTS) {
      await pool.execute('DELETE FROM otp_codes WHERE id = ?', [otpRecord.id]);
      return res.status(429).json({ error: `Demasiados intentos fallidos (${OTP_MAX_ATTEMPTS}). Solicita un nuevo código.` });
    }

    if (otpRecord.code !== code) {
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
      [phone]
    );

    const client = clientRows[0];
    if (!client) {
      return res.status(404).json({
        error: 'No se encontró un cliente con este teléfono. Agenda una cita primero desde la página principal.',
        needs_registration: true,
      });
    }

    const token = jwt.sign(
      { clientId: client.id, phone: client.phone },
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

module.exports = router;