const express = require('express');
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
require('dotenv').config();

const router = express.Router();

router.post('/', async (req, res) => {
  try {
    const { name, phone, email, notes } = req.body;

    if (!name || !name.trim() || name.trim().length < 2) {
      return res.status(400).json({ error: 'El nombre es requerido' });
    }
    if (!phone || !/^\d{10}$/.test(String(phone).trim())) {
      return res.status(400).json({ error: 'El teléfono debe tener 10 dígitos' });
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim())) {
      return res.status(400).json({ error: 'Email inválido' });
    }

    const [existing] = await pool.execute('SELECT id FROM clients WHERE phone = ?', [String(phone).trim()]);
    if (existing.length > 0) {
      return res.status(409).json({ error: 'Ya existe un cliente con este teléfono', clientId: existing[0].id });
    }

    const [result] = await pool.execute(
      'INSERT INTO clients (name, phone, email, notes) VALUES (?, ?, ?, ?)',
      [name.trim(), String(phone).trim(), email ? String(email).trim() : null, notes ? String(notes).trim() : null]
    );

    res.status(201).json({ id: result.insertId, message: 'Cliente creado exitosamente' });
  } catch (error) {
    console.error('Error creating client:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const [client] = await pool.execute('SELECT id, name, phone, email, notes, total_visits, last_visit FROM clients WHERE id = ?', [id]);
    if (client.length === 0) {
      return res.status(404).json({ error: 'Cliente no encontrado' });
    }

    const [appointments] = await pool.execute(
      'SELECT a.*, s.name AS service_name, s.duration_minutes AS service_duration, s.price_cents, w.name AS workstation_name, b.name AS barber_name FROM appointments a LEFT JOIN services s ON a.service_id = s.id LEFT JOIN workstations w ON a.workstation_id = w.id LEFT JOIN barbers b ON a.barber_id = b.id WHERE a.client_id = ? ORDER BY a.appointment_date DESC, a.appointment_time DESC',
      [id]
    );

    res.json({ ...client[0], appointments });
  } catch (error) {
    console.error('Error fetching client:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

module.exports = router;
