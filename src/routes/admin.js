const express = require('express');
const pool = require('../config/database');
const router = express.Router();

router.get('/stats', async (req, res) => {
  try {
    const [total] = await pool.execute('SELECT COUNT(*) AS count FROM appointments');
    const [pending] = await pool.execute("SELECT COUNT(*) AS count FROM appointments WHERE status = 'pending'");
    const [confirmed] = await pool.execute("SELECT COUNT(*) AS count FROM appointments WHERE status = 'confirmed'");
    const [cancelled] = await pool.execute("SELECT COUNT(*) AS count FROM appointments WHERE status = 'cancelled'");
    const today = new Date().toISOString().split('T')[0];
    const [todayCount] = await pool.execute('SELECT COUNT(*) AS count FROM appointments WHERE appointment_date = ?', [today]);

    res.json({
      total: total[0].count,
      pending: pending[0].count,
      confirmed: confirmed[0].count,
      cancelled: cancelled[0].count,
      today: todayCount[0].count,
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

router.get('/appointments', async (req, res) => {
  try {
    const { status, date, page, limit } = req.query;
    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 10;
    const offset = (pageNum - 1) * limitNum;

    let query = 'SELECT a.*, s.name AS service_name, s.duration_minutes AS service_duration, s.price_cents, c.name AS client_name, c.phone AS client_phone, w.name AS workstation_name, b.name AS barber_name FROM appointments a LEFT JOIN services s ON a.service_id = s.id LEFT JOIN clients c ON a.client_id = c.id LEFT JOIN workstations w ON a.workstation_id = w.id LEFT JOIN barbers b ON a.barber_id = b.id WHERE 1=1';
    const params = [];

    if (status) {
      query += ' AND a.status = ?';
      params.push(status);
    }
    if (date) {
      query += ' AND a.appointment_date = ?';
      params.push(date);
    }

    query += ' ORDER BY a.appointment_date DESC, a.appointment_time DESC LIMIT ? OFFSET ?';
    params.push(limitNum, offset);

    const [rows] = await pool.execute(query, params);
    res.json(rows);
  } catch (error) {
    console.error('Error fetching appointments:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

router.get('/workstations', async (req, res) => {
  try {
    const workstations = await pool.execute('SELECT w.*, b.name AS barber_name FROM workstations w LEFT JOIN barbers b ON w.barber_id = b.id WHERE w.is_active = 1 ORDER BY w.id');
    res.json(workstations[0]);
  } catch (error) {
    console.error('Error fetching workstations:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

module.exports = router;