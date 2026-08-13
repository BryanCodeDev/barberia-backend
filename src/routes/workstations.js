const express = require('express');
const pool = require('../config/database');
const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const workstations = await pool.execute('SELECT w.*, b.name AS barber_name FROM workstations w LEFT JOIN barbers b ON w.barber_id = b.id WHERE w.is_active = 1 ORDER BY w.id');
    res.json(workstations[0]);
  } catch (error) {
    console.error('Error fetching workstations:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

module.exports = router;
