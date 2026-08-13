const express = require('express');
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { getAvailableTimeSlots } = require('../utils/availability');
const { sendBookingConfirmation } = require('../utils/notifications');
require('dotenv').config();

const router = express.Router();

router.get('/available-slots', async (req, res) => {
  try {
    const { date, service_id, workstation_id } = req.query;

    if (!date) {
      return res.status(400).json({ error: 'El parámetro date es requerido' });
    }

    let serviceDuration = 30;
    if (service_id) {
      const [serviceRows] = await pool.execute('SELECT duration_minutes FROM services WHERE id = ? AND is_active = 1', [service_id]);
      if (serviceRows.length > 0) {
        serviceDuration = serviceRows[0].duration_minutes;
      }
    }

    const wid = workstation_id ? parseInt(workstation_id, 10) : null;
    const slots = await getAvailableTimeSlots(date, serviceDuration, wid);

    res.json({ date, slots });
  } catch (error) {
    console.error('Error fetching slots:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { client_id, service_id, workstation_id, appointment_date, appointment_time, client_message } = req.body;

    if (!client_id || !Number.isInteger(Number(client_id))) {
      return res.status(400).json({ error: 'El cliente es requerido' });
    }
    if (!service_id || !Number.isInteger(Number(service_id))) {
      return res.status(400).json({ error: 'El servicio es requerido' });
    }
    if (!appointment_date || !/^\d{4}-\d{2}-\d{2}$/.test(String(appointment_date))) {
      return res.status(400).json({ error: 'La fecha es requerida' });
    }
    if (!appointment_time || !/^([01]\d|2[0-3]):[0-5]\d$/.test(String(appointment_time))) {
      return res.status(400).json({ error: 'La hora es requerida' });
    }
    if (workstation_id !== undefined && workstation_id !== null && !Number.isInteger(Number(workstation_id))) {
      return res.status(400).json({ error: 'La estación es inválida' });
    }
    if (client_message && typeof client_message !== 'string') {
      return res.status(400).json({ error: 'El mensaje es inválido' });
    }

    const [serviceResult] = await pool.execute('SELECT duration_minutes FROM services WHERE id = ? AND is_active = 1', [service_id]);
    if (serviceResult.length === 0) {
      return res.status(400).json({ error: 'Servicio no encontrado' });
    }
    const duration_minutes = serviceResult[0].duration_minutes;

    const [occupied] = await pool.execute(
      'SELECT id FROM appointments WHERE appointment_date = ? AND appointment_time = ? AND status != ? AND (workstation_id = ? OR ? IS NULL)',
      [appointment_date, appointment_time, 'cancelled', workstation_id || null, workstation_id || null]
    );
    if (occupied.length > 0) {
      return res.status(409).json({ error: 'Este horario ya no está disponible' });
    }

    let barberId = null;
    if (workstation_id) {
      const [wsRows] = await pool.execute('SELECT barber_id FROM workstations WHERE id = ?', [workstation_id]);
      if (wsRows.length > 0) {
        barberId = wsRows[0].barber_id;
      }
    }

    const [result] = await pool.execute(
      'INSERT INTO appointments (client_id, service_id, workstation_id, barber_id, appointment_date, appointment_time, duration_minutes, status, client_message) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [client_id, service_id, workstation_id || null, barberId, appointment_date, appointment_time, duration_minutes, 'pending', client_message || '']
    );

    const [appointment] = await pool.execute(
      'SELECT a.*, s.name AS service_name, s.duration_minutes AS service_duration, s.price_cents, c.name AS client_name, c.phone AS client_phone FROM appointments a LEFT JOIN services s ON a.service_id = s.id LEFT JOIN clients c ON a.client_id = c.id WHERE a.id = ?',
      [result.insertId]
    );

    sendBookingConfirmation(appointment[0]).catch((err) => {
      console.error('Error sending booking confirmation:', err);
    });

    res.status(201).json({ id: result.insertId, message: 'Cita creada exitosamente', appointment: appointment[0] });
  } catch (error) {
    console.error('Error creating appointment:', error);
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Este horario ya no está disponible' });
    }
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

router.get('/my', authenticateToken, async (req, res) => {
  try {
    const appointments = await pool.execute(
      'SELECT a.*, s.name AS service_name, s.duration_minutes AS service_duration, s.price_cents FROM appointments a LEFT JOIN services s ON a.service_id = s.id WHERE a.client_id = ? ORDER BY a.appointment_date DESC, a.appointment_time DESC',
      [req.user.clientId]
    );
    res.json(appointments[0]);
  } catch (error) {
    console.error('Error fetching appointments:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

router.patch('/:id/status', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, cancelled_reason } = req.body;

    const allowedStatuses = ['pending', 'confirmed', 'completed', 'cancelled', 'no-show'];
    if (!status || !allowedStatuses.includes(status)) {
      return res.status(400).json({ error: 'Estado inválido' });
    }

    const [existing] = await pool.execute('SELECT * FROM appointments WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Cita no encontrada' });
    }

    await pool.execute(
      'UPDATE appointments SET status = ?, cancelled_reason = ?, cancelled_at = CASE WHEN ? = ? THEN NOW() ELSE cancelled_at END WHERE id = ?',
      [status, cancelled_reason || null, status, 'cancelled', id]
    );

    res.json({ message: 'Estado actualizado exitosamente' });
  } catch (error) {
    console.error('Error updating appointment:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

router.get('/occupied-slots', async (req, res) => {
  try {
    const { date } = req.query;
    if (!date) {
      return res.status(400).json({ error: 'El parámetro date es requerido' });
    }
    const [rows] = await pool.execute(
      'SELECT appointment_time FROM appointments WHERE appointment_date = ? AND status != ?',
      [date, 'cancelled']
    );
    const occupiedSlots = rows.map((row) => row.appointment_time);
    res.json({ date, occupied_slots: occupiedSlots });
  } catch (error) {
    console.error('Error fetching occupied slots:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const [existing] = await pool.execute('SELECT * FROM appointments WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Cita no encontrada' });
    }

    await pool.execute('DELETE FROM appointments WHERE id = ?', [id]);
    res.json({ message: 'Cita eliminada exitosamente' });
  } catch (error) {
    console.error('Error deleting appointment:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

module.exports = router;
