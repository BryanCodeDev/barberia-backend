const express = require('express');
const pool = require('../config/database');
const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const services = await pool.execute('SELECT * FROM services WHERE is_active = 1 ORDER BY category, name');
    res.json(services[0]);
  } catch (error) {
    console.error('Error fetching services:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const [service] = await pool.execute('SELECT * FROM services WHERE id = ? AND is_active = 1', [id]);
    if (service.length === 0) {
      return res.status(404).json({ error: 'Servicio no encontrado' });
    }
    res.json(service[0]);
  } catch (error) {
    console.error('Error fetching service:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

module.exports = router;