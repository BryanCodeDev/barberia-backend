const express = require('express');
const pool = require('../config/database');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { getAvailableTimeSlots } = require('../utils/availability');
const { sendBookingConfirmation, sendRealtimeNotification } = require('../utils/notifications');
const { getBroker } = require('../websocket/broker');
require('dotenv').config();

const router = express.Router();

const findOrCreateClient = async ({ name, phone, email, googleId }) => {
  const trimmedPhone = String(phone || '').trim();
  const trimmedEmail = String(email || '').trim().toLowerCase();
  let client = null;

  if (trimmedPhone) {
    const [byPhone] = await pool.execute('SELECT * FROM clients WHERE phone = ? LIMIT 1', [trimmedPhone]);
    if (byPhone[0]) client = byPhone[0];
  }

  if (!client && trimmedEmail) {
    const [byEmail] = await pool.execute('SELECT * FROM clients WHERE email = ? LIMIT 1', [trimmedEmail]);
    if (byEmail[0]) client = byEmail[0];
  }

  if (!client && googleId) {
    const [byGoogle] = await pool.execute('SELECT * FROM clients WHERE google_id = ? LIMIT 1', [googleId]);
    if (byGoogle[0]) client = byGoogle[0];
  }

  if (client) {
    if (trimmedEmail && client.email !== trimmedEmail) {
      await pool.execute('UPDATE clients SET email = ? WHERE id = ?', [trimmedEmail, client.id]);
    }
    if (trimmedPhone && client.phone !== trimmedPhone) {
      await pool.execute('UPDATE clients SET phone = ? WHERE id = ?', [trimmedPhone, client.id]);
    }
    if (googleId && !client.google_id) {
      await pool.execute('UPDATE clients SET google_id = ? WHERE id = ?', [googleId, client.id]);
    }
    return client;
  }

  const [result] = await pool.execute(
    'INSERT INTO clients (name, phone, email, google_id) VALUES (?, ?, ?, ?)',
    [name, trimmedPhone, trimmedEmail || null, googleId || null]
  );

  const [rows] = await pool.execute('SELECT * FROM clients WHERE id = ? LIMIT 1', [result.insertId]);
  return rows[0];
};

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
    const { client_id, service_id, workstation_id, appointment_date, appointment_time, client_message, client_name, client_phone, client_email } = req.body;

    let finalClientId = client_id;
    let clientName = client_name;
    let clientPhone = client_phone;
    let clientEmail = client_email;

    if (!finalClientId && !clientPhone) {
      return res.status(400).json({ error: 'Debes proporcionar un teléfono para agendar.' });
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

    if (!finalClientId) {
      const client = await findOrCreateClient({
        name: clientName,
        phone: clientPhone,
        email: clientEmail,
      });
      finalClientId = client.id;
      clientName = client.name;
      clientPhone = client.phone;
      clientEmail = client.email;
    } else {
      const [existingClient] = await pool.execute('SELECT * FROM clients WHERE id = ? LIMIT 1', [finalClientId]);
      if (existingClient[0]) {
        clientName = existingClient[0].name;
        clientPhone = existingClient[0].phone;
        clientEmail = existingClient[0].email;
      }
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
      [finalClientId, service_id, workstation_id || null, barberId, appointment_date, appointment_time, duration_minutes, 'pending', client_message || '']
    );

    const [appointment] = await pool.execute(
      'SELECT a.*, s.name AS service_name, s.duration_minutes AS service_duration, s.price_cents, c.name AS client_name, c.phone AS client_phone, c.email AS client_email FROM appointments a LEFT JOIN services s ON a.service_id = s.id LEFT JOIN clients c ON a.client_id = c.id WHERE a.id = ?',
      [result.insertId]
    );

    sendBookingConfirmation(appointment[0]).catch((err) => {
      console.error('Error sending booking confirmation:', err);
    });

    if (barberId) {
      const [barber] = await pool.execute('SELECT id, name FROM barbers WHERE id = ? LIMIT 1', [barberId]);
      if (barber[0]) {
        sendRealtimeNotification({
          userId: barber[0].id,
          userRole: 'barber',
          type: 'new_appointment',
          title: 'Nueva cita agendada',
          message: `${clientName} agendó ${appointment[0].service_name} para ${appointment_date} ${appointment_time}`,
        }).catch(() => {});
      }
    }

    const broker = getBroker();
    if (broker) {
      broker.emitAppointmentCreated(appointment[0], req.user?.role || 'client');
    }

    res.status(201).json({ id: result.insertId, message: 'Cita creada exitosamente', appointment: appointment[0] });
  } catch (error) {
    console.error('Error creating appointment:', error);
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Este horario ya no está disponible' });
    }
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

router.get('/my', authenticateToken, requireRole(['client']), async (req, res) => {
  try {
    const clientId = req.user.clientId;
    if (!clientId) {
      return res.status(403).json({ error: 'Token inválido para este recurso' });
    }
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

router.patch('/:id/status', authenticateToken, requireRole(['admin', 'barber']), async (req, res) => {
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

    const appointment = existing[0];

    if (status === 'no-show' && req.user.role === 'barber') {
      if (appointment.barber_id !== req.user.entity_id) {
        return res.status(403).json({ error: 'Solo puedes marcar no-asistencia en tus propias citas.' });
      }
      await pool.execute(
        'INSERT INTO attendance_logs (appointment_id, action, performed_by, performed_role, notes) VALUES (?, ?, ?, ?, ?)',
        [id, 'no-show-auto', req.user.id, 'barber', 'Marcado por barbero desde panel']
      );
    } else if (req.user.role === 'barber' && appointment.barber_id !== req.user.entity_id) {
      return res.status(403).json({ error: 'No tienes permisos para cambiar esta cita' });
    }

    await pool.execute(
      'UPDATE appointments SET status = ?, cancelled_reason = ?, cancelled_at = CASE WHEN ? = ? THEN NOW() ELSE cancelled_at END WHERE id = ?',
      [status, cancelled_reason || null, status, 'cancelled', id]
    );

    const [updated] = await pool.execute(
      'SELECT a.*, s.name AS service_name, s.duration_minutes AS service_duration, s.price_cents, c.name AS client_name, c.phone AS client_phone FROM appointments a LEFT JOIN services s ON a.service_id = s.id LEFT JOIN clients c ON a.client_id = c.id WHERE a.id = ?',
      [id]
    );

    const broker = getBroker();
    if (broker) {
      broker.emitAppointmentStatusChanged(updated[0], req.user?.role || 'unknown');
    }

    res.json({ message: 'Estado actualizado exitosamente', appointment: updated[0] });
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

router.delete('/:id', authenticateToken, requireRole(['admin', 'barber']), async (req, res) => {
  try {
    const { id } = req.params;
    const [existing] = await pool.execute('SELECT * FROM appointments WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Cita no encontrada' });
    }

    if (req.user.role === 'barber' && existing[0].barber_id !== req.user.entity_id) {
      return res.status(403).json({ error: 'No tienes permisos para eliminar esta cita' });
    }

    await pool.execute('DELETE FROM appointments WHERE id = ?', [id]);

    const broker = getBroker();
    if (broker) {
      broker.emitAppointmentDeleted(id, req.user?.role || 'unknown');
    }

    res.json({ message: 'Cita eliminada exitosamente' });
  } catch (error) {
    console.error('Error deleting appointment:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

module.exports = router;
