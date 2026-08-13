const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/database');
const { sendOtpCode } = require('../utils/notifications');
require('dotenv').config();

const router = express.Router();

const OTP_EXPIRY_MINUTES = 5;
const OTP_MAX_ATTEMPTS = 5;
const OTP_RESEND_COOLDOWN_SECONDS = 60;

router.post('/login', async (req, res) => {
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

    const token = jwt.sign(
      { id: admin.id, username: admin.username, role: admin.role, entity_id: admin.entity_id },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
    );

    res.json({ token, user: { id: admin.id, username: admin.username } });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

router.post('/client/request-otp', async (req, res) => {
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

router.post('/client/verify-otp', async (req, res) => {
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

router.post('/client/google', async (req, res) => {
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
    console.error('Google login error:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

module.exports = router;
