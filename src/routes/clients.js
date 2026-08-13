const express = require('express');
const { body, validationResult } = require('express-validator');
const pool = require('../config/database');
const { validate } = require('../middleware/validate');
require('dotenv').config();

const router = express.Router();

router.post('/validate-empty', validate, async (req, res) => {
  console.log('[VALIDATE-EMPTY] hit');
  res.status(201).json({ ok: true });
});

router.post('/', [
  body('name').trim().isLength({ min: 2, max: 100 }).withMessage('El nombre es requerido'),
  body('phone').matches(/^\d{10}$/).withMessage('El teléfono debe tener 10 dígitos'),
  body('email').optional().isEmail().withMessage('Email inválido'),
  body('notes').optional().isString().isLength({ max: 500 }),
], validate, async (req, res) => {
  try {
    const { name, phone, email, notes } = req.body;

    const [existing] = await pool.execute('SELECT id FROM clients WHERE phone = ?', [phone]);
    if (existing.length > 0) {
      return res.status(409).json({ error: 'Ya existe un cliente con este teléfono', clientId: existing[0].id });
    }

    const [result] = await pool.execute(
      'INSERT INTO clients (name, phone, email, notes) VALUES (?, ?, ?, ?)',
      [name, phone, email || null, notes || null]
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
    res.json(client[0]);
  } catch (error) {
    console.error('Error fetching client:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

module.exports = router;