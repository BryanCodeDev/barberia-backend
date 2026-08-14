const express = require('express');
const pool = require('../config/database');
const { requireRole } = require('../middleware/auth');

const router = express.Router();

router.use(requireRole(['admin', 'barber']));

function getPeriodRange(period) {
  const now = new Date();
  let start, end;

  switch (period) {
    case 'today':
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      end = new Date(start);
      end.setDate(start.getDate() + 1);
      break;
    case 'week':
      const dayOfWeek = now.getDay() || 7;
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek + 1);
      end = new Date(start);
      end.setDate(start.getDate() + 7);
      break;
    case 'month':
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      break;
    default:
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      end = new Date(start);
      end.setDate(start.getDate() + 1);
  }

  return { start, end };
}

const formatDate = (d) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getBarberId = (req) => {
  if (req.user.role !== 'barber') return null;
  if (req.user.entity_id) return req.user.entity_id;
  const username = req.user.username || '';
  const parts = username.replace(/\./g, ' ').split(' ').filter(Boolean);
  if (!parts.length) return null;
  const likePattern = parts.map(p => `%${p}%`).join('');
  const [rows] = pool.execute(`SELECT id FROM barbers WHERE name LIKE ? LIMIT 1`, [likePattern]);
  return rows[0]?.id || null;
};

const isAdmin = (req) => req.user.role === 'admin';

const baseAppointmentWhere = (req) => {
  const barberId = getBarberId(req);
  return barberId ? 'a.barber_id = ?' : '1=1';
};

const appendBarberFilter = (params, req) => {
  const barberId = getBarberId(req);
  if (barberId) params.push(barberId);
};

router.get('/stats', async (req, res) => {
  try {
    const barberFilter = baseAppointmentWhere(req);
    const barberId = getBarberId(req);
    const baseParams = barberId ? [barberId] : [];

    const [total] = await pool.execute(`SELECT COUNT(*) AS count FROM appointments a WHERE ${barberFilter}`, baseParams);
    const [pending] = await pool.execute(`SELECT COUNT(*) AS count FROM appointments a WHERE ${barberFilter} AND a.status = 'pending'`, baseParams);
    const [confirmed] = await pool.execute(`SELECT COUNT(*) AS count FROM appointments a WHERE ${barberFilter} AND a.status = 'confirmed'`, baseParams);
    const [cancelled] = await pool.execute(`SELECT COUNT(*) AS count FROM appointments a WHERE ${barberFilter} AND a.status = 'cancelled'`, baseParams);
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const today = `${year}-${month}-${day}`;
    const [todayCount] = await pool.execute(`SELECT COUNT(*) AS count FROM appointments a WHERE ${barberFilter} AND a.appointment_date = ?`, barberId ? [barberId, today] : [today]);

    const [confirmedRevenue] = await pool.execute(
      `SELECT COALESCE(SUM(s.price_cents), 0) AS total FROM appointments a LEFT JOIN services s ON a.service_id = s.id WHERE ${barberFilter} AND a.status = 'confirmed'`,
      baseParams
    );
    const [completedRevenue] = await pool.execute(
      `SELECT COALESCE(SUM(s.price_cents), 0) AS total FROM appointments a LEFT JOIN services s ON a.service_id = s.id WHERE ${barberFilter} AND a.status = 'completed'`,
      baseParams
    );
    const [todayRevenue] = await pool.execute(
      `SELECT COALESCE(SUM(s.price_cents), 0) AS total FROM appointments a LEFT JOIN services s ON a.service_id = s.id WHERE ${barberFilter} AND a.appointment_date = ? AND a.status = 'completed'`,
      barberId ? [barberId, today] : [today]
    );

    res.json({
      total: total[0].count,
      pending: pending[0].count,
      confirmed: confirmed[0].count,
      cancelled: cancelled[0].count,
      today: todayCount[0].count,
      confirmed_revenue_cents: confirmedRevenue[0].total || 0,
      completed_revenue_cents: completedRevenue[0].total || 0,
      today_revenue_cents: todayRevenue[0].total || 0,
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

router.get('/appointments', async (req, res) => {
  try {
    const { status, date, page, limit, search } = req.query;
    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 10;
    const offset = (pageNum - 1) * limitNum;
    const safeLimit = Math.max(1, Math.min(limitNum, 100));
    const safeOffset = Math.max(0, offset);

    let query = 'SELECT a.*, s.name AS service_name, s.duration_minutes AS service_duration, s.price_cents, c.name AS client_name, c.phone AS client_phone, w.name AS workstation_name, b.name AS barber_name FROM appointments a LEFT JOIN services s ON a.service_id = s.id LEFT JOIN clients c ON a.client_id = c.id LEFT JOIN workstations w ON a.workstation_id = w.id LEFT JOIN barbers b ON a.barber_id = b.id WHERE 1=1';
    const params = [];

    const barberId = getBarberId(req);
    if (barberId) {
      query += ' AND a.barber_id = ?';
      params.push(barberId);
    }

    if (status) {
      query += ' AND a.status = ?';
      params.push(status);
    }
    if (date) {
      query += ' AND a.appointment_date = ?';
      params.push(date);
    }
    if (search) {
      query += ' AND (c.name LIKE ? OR c.phone LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    query += ` ORDER BY a.appointment_date DESC, a.appointment_time DESC LIMIT ${safeLimit} OFFSET ${safeOffset}`;

    const [rows] = await pool.execute(query, params);
    res.json(rows);
  } catch (error) {
    console.error('Error fetching appointments:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

router.get('/workstations', async (req, res) => {
  try {
    const barberId = getBarberId(req);
    let query = 'SELECT w.*, b.name AS barber_name FROM workstations w LEFT JOIN barbers b ON w.barber_id = b.id WHERE w.is_active = 1';
    const params = [];
    if (barberId) {
      query += ' AND w.barber_id = ?';
      params.push(barberId);
    }
    query += ' ORDER BY w.id';
    const workstations = await pool.execute(query, params);
    res.json(workstations[0]);
  } catch (error) {
    console.error('Error fetching workstations:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

router.get('/notifications', async (req, res) => {
  try {
    const barberId = getBarberId(req);
    let query = 'SELECT n.*, a.appointment_date, a.appointment_time FROM notifications n LEFT JOIN appointments a ON n.appointment_id = a.id WHERE 1=1';
    const params = [];
    if (barberId) {
      query += ' AND a.barber_id = ?';
      params.push(barberId);
    }
    query += ' ORDER BY n.sent_at DESC LIMIT 100';
    const [rows] = await pool.execute(query, params);
    res.json(rows);
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

router.get('/revenue', async (req, res) => {
  try {
    const { period = 'today' } = req.query;
    const now = new Date();
    let currentStart, currentEnd, previousStart, previousEnd;

    switch (period) {
      case 'today':
        currentStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        currentEnd = new Date(currentStart);
        currentEnd.setDate(currentStart.getDate() + 1);
        previousStart = new Date(currentStart);
        previousStart.setDate(previousStart.getDate() - 1);
        previousEnd = new Date(currentStart);
        break;
      case 'week':
        const dayOfWeek = now.getDay() || 7;
        currentStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek + 1);
        currentEnd = new Date(currentStart);
        currentEnd.setDate(currentStart.getDate() + 7);
        previousStart = new Date(currentStart);
        previousStart.setDate(previousStart.getDate() - 7);
        previousEnd = new Date(currentStart);
        break;
      case 'month':
        currentStart = new Date(now.getFullYear(), now.getMonth(), 1);
        currentEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        previousStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        previousEnd = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      default:
        currentStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        currentEnd = new Date(currentStart);
        currentEnd.setDate(currentStart.getDate() + 1);
        previousStart = new Date(currentStart);
        previousStart.setDate(previousStart.getDate() - 1);
        previousEnd = new Date(currentStart);
    }

    const barberId = getBarberId(req);
    const barberFilter = barberId ? 'AND a.barber_id = ?' : '';
    const currentParams = barberId ? [formatDate(currentStart), formatDate(currentEnd), barberId] : [formatDate(currentStart), formatDate(currentEnd)];
    const previousParams = barberId ? [formatDate(previousStart), formatDate(previousEnd), barberId] : [formatDate(previousStart), formatDate(previousEnd)];

    const [currentRows] = await pool.execute(
      `SELECT SUM(s.price_cents) AS total_revenue, COUNT(a.id) AS total_appointments
       FROM appointments a
       LEFT JOIN services s ON a.service_id = s.id
       WHERE a.status IN ('completed', 'confirmed')
         AND a.appointment_date >= ?
         AND a.appointment_date < ?
         ${barberFilter}`,
      currentParams
    );

    const [currentCompletedRows] = await pool.execute(
      `SELECT SUM(s.price_cents) AS total_revenue, COUNT(a.id) AS total_appointments
       FROM appointments a
       LEFT JOIN services s ON a.service_id = s.id
       WHERE a.status = 'completed'
         AND a.appointment_date >= ?
         AND a.appointment_date < ?
         ${barberFilter}`,
      currentParams
    );

    const [currentConfirmedRows] = await pool.execute(
      `SELECT SUM(s.price_cents) AS total_revenue, COUNT(a.id) AS total_appointments
       FROM appointments a
       LEFT JOIN services s ON a.service_id = s.id
       WHERE a.status = 'confirmed'
         AND a.appointment_date >= ?
         AND a.appointment_date < ?
         ${barberFilter}`,
      currentParams
    );

    const [previousRows] = await pool.execute(
      `SELECT SUM(s.price_cents) AS total_revenue, COUNT(a.id) AS total_appointments
       FROM appointments a
       LEFT JOIN services s ON a.service_id = s.id
       WHERE a.status IN ('completed', 'confirmed')
         AND a.appointment_date >= ?
         AND a.appointment_date < ?
         ${barberFilter}`,
      previousParams
    );

    const [previousCompletedRows] = await pool.execute(
      `SELECT SUM(s.price_cents) AS total_revenue, COUNT(a.id) AS total_appointments
       FROM appointments a
       LEFT JOIN services s ON a.service_id = s.id
       WHERE a.status = 'completed'
         AND a.appointment_date >= ?
         AND a.appointment_date < ?
         ${barberFilter}`,
      previousParams
    );

    const [previousConfirmedRows] = await pool.execute(
      `SELECT SUM(s.price_cents) AS total_revenue, COUNT(a.id) AS total_appointments
       FROM appointments a
       LEFT JOIN services s ON a.service_id = s.id
       WHERE a.status = 'confirmed'
         AND a.appointment_date >= ?
         AND a.appointment_date < ?
         ${barberFilter}`,
      previousParams
    );

    const current = currentRows[0] || { total_revenue: 0, total_appointments: 0 };
    const previous = previousRows[0] || { total_revenue: 0, total_appointments: 0 };
    const currentCompleted = currentCompletedRows[0] || { total_revenue: 0, total_appointments: 0 };
    const currentConfirmed = currentConfirmedRows[0] || { total_revenue: 0, total_appointments: 0 };
    const previousCompleted = previousCompletedRows[0] || { total_revenue: 0, total_appointments: 0 };
    const previousConfirmed = previousConfirmedRows[0] || { total_revenue: 0, total_appointments: 0 };

    const currentRevenue = current.total_revenue || 0;
    const previousRevenue = previous.total_revenue || 0;
    const currentCount = current.total_appointments || 0;
    const previousCount = previous.total_appointments || 0;

    const averageTicket = currentCount > 0 ? currentRevenue / currentCount : 0;
    const changePercent = previousRevenue > 0 ? ((currentRevenue - previousRevenue) / previousRevenue) * 100 : (currentRevenue > 0 ? 100 : 0);

    res.json({
      period,
      current: {
        revenue_cents: currentRevenue,
        appointments: currentCount,
        average_ticket_cents: averageTicket,
        completed_revenue_cents: currentCompleted.total_revenue || 0,
        completed_appointments: currentCompleted.total_appointments || 0,
        confirmed_revenue_cents: currentConfirmed.total_revenue || 0,
        confirmed_appointments: currentConfirmed.total_appointments || 0,
      },
      previous: {
        revenue_cents: previousRevenue,
        appointments: previousCount,
        completed_revenue_cents: previousCompleted.total_revenue || 0,
        completed_appointments: previousCompleted.total_appointments || 0,
        confirmed_revenue_cents: previousConfirmed.total_revenue || 0,
        confirmed_appointments: previousConfirmed.total_appointments || 0,
      },
      change_percent: changePercent,
    });
  } catch (error) {
    console.error('Error fetching revenue:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

router.get('/performance', async (req, res) => {
  try {
    const { period = 'week' } = req.query;
    const { start, end } = getPeriodRange(period);

    const barberId = getBarberId(req);
    const barberFilter = barberId ? 'AND a.barber_id = ?' : '';
    const params = [formatDate(start), formatDate(end)];
    const havingParams = [formatDate(start), formatDate(end)];

    const [byBarber] = await pool.execute(
      `SELECT b.id AS barber_id, b.name AS barber_name, COUNT(a.id) AS appointments, COALESCE(SUM(s.price_cents), 0) AS revenue_cents
       FROM appointments a
       LEFT JOIN barbers b ON a.barber_id = b.id
       LEFT JOIN services s ON a.service_id = s.id
       WHERE a.status IN ('completed', 'confirmed')
         AND a.appointment_date >= ?
         AND a.appointment_date < ?
         ${barberFilter}
       GROUP BY b.id, b.name
       ORDER BY revenue_cents DESC`,
       barberId ? [...params, barberId, ...havingParams] : params
    );

    const [byBarberCompleted] = await pool.execute(
      `SELECT b.id AS barber_id, b.name AS barber_name, COUNT(a.id) AS appointments, COALESCE(SUM(s.price_cents), 0) AS revenue_cents
       FROM appointments a
       LEFT JOIN barbers b ON a.barber_id = b.id
       LEFT JOIN services s ON a.service_id = s.id
       WHERE a.status = 'completed'
         AND a.appointment_date >= ?
         AND a.appointment_date < ?
         ${barberFilter}
       GROUP BY b.id, b.name
       ORDER BY revenue_cents DESC`,
       barberId ? [...params, barberId, ...havingParams] : params
    );

    const [byService] = await pool.execute(
      `SELECT s.id AS service_id, s.name AS service_name, COUNT(a.id) AS appointments, COALESCE(SUM(s.price_cents), 0) AS revenue_cents
       FROM appointments a
       LEFT JOIN services s ON a.service_id = s.id
       WHERE a.status IN ('completed', 'confirmed')
         AND a.appointment_date >= ?
         AND a.appointment_date < ?
         ${barberFilter}
       GROUP BY s.id, s.name
       ORDER BY appointments DESC`,
       barberId ? [...params, barberId] : params
    );

    const [byServiceCompleted] = await pool.execute(
      `SELECT s.id AS service_id, s.name AS service_name, COUNT(a.id) AS appointments, COALESCE(SUM(s.price_cents), 0) AS revenue_cents
       FROM appointments a
       LEFT JOIN services s ON a.service_id = s.id
       WHERE a.status = 'completed'
         AND a.appointment_date >= ?
         AND a.appointment_date < ?
         ${barberFilter}
       GROUP BY s.id, s.name
       ORDER BY appointments DESC`,
       barberId ? [...params, barberId] : params
    );

    const [byHour] = await pool.execute(
      `SELECT HOUR(a.appointment_time) AS hour, COUNT(a.id) AS appointments
       FROM appointments a
       WHERE a.status = 'completed'
         AND a.appointment_date >= ?
         AND a.appointment_date < ?
         ${barberFilter}
       GROUP BY HOUR(a.appointment_time)
       ORDER BY hour`,
      barberId ? [...params, barberId] : params
    );

    const [byWeekday] = await pool.execute(
      `SELECT DAYOFWEEK(a.appointment_date) AS weekday, COUNT(a.id) AS appointments
       FROM appointments a
       WHERE a.status = 'completed'
         AND a.appointment_date >= ?
         AND a.appointment_date < ?
         ${barberFilter}
       GROUP BY DAYOFWEEK(a.appointment_date)
       ORDER BY weekday`,
      barberId ? [...params, barberId] : params
    );

    res.json({
      period,
      by_barber: byBarber,
      by_barber_completed: byBarberCompleted,
      by_service: byService,
      by_service_completed: byServiceCompleted,
      by_hour: byHour,
      by_weekday: byWeekday,
    });
  } catch (error) {
    console.error('Error fetching performance:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

router.get('/clients', async (req, res) => {
  try {
    const { search = '', period = 'month' } = req.query;
    const { start, end } = getPeriodRange(period);

    let query = `SELECT c.id, c.name, c.phone, c.email, c.total_visits, c.last_visit,
                        COUNT(a.id) AS total_appointments,
                        MAX(a.appointment_date) AS last_appointment_date
                 FROM clients c
                 LEFT JOIN appointments a ON c.id = a.client_id`;
    const params = [];

    const barberId = getBarberId(req);
    if (barberId) {
      query += ' WHERE (a.barber_id = ? OR a.barber_id IS NULL)';
      params.push(barberId);
    }

    if (search) {
      query += barberId ? ' AND' : ' WHERE';
      query += ' (c.name LIKE ? OR c.phone LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    query += ' GROUP BY c.id, c.name, c.phone, c.email, c.total_visits, c.last_visit ORDER BY c.name ASC';

    const [rows] = await pool.execute(query, params);
    res.json(rows);
  } catch (error) {
    console.error('Error fetching clients:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

router.get('/clients/inactive', async (req, res) => {
  try {
    const { days = 40 } = req.query;

    let query = `SELECT c.id, c.name, c.phone, c.email, c.total_visits, c.last_visit,
                    DATEDIFF(NOW(), c.last_visit) AS days_since_last_visit
             FROM clients c
             WHERE c.last_visit IS NOT NULL
               AND c.last_visit < DATE_SUB(NOW(), INTERVAL ? DAY)`;
    const params = [parseInt(days, 10)];

    const barberId = getBarberId(req);
    if (barberId) {
      query += ' AND EXISTS (SELECT 1 FROM appointments a WHERE a.client_id = c.id AND a.barber_id = ?)';
      params.push(barberId);
    }

    query += ' ORDER BY c.last_visit ASC';
    const [rows] = await pool.execute(query, params);
    res.json(rows);
  } catch (error) {
    console.error('Error fetching inactive clients:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

router.get('/clients/summary', async (req, res) => {
  try {
    const { period = 'month' } = req.query;
    const { start, end } = getPeriodRange(period);
    const barberId = getBarberId(req);
    const barberFilter = barberId ? 'AND a.barber_id = ?' : '';

    const [newClientsRows] = await pool.execute(
      `SELECT COUNT(DISTINCT c.id) AS count
       FROM clients c
       JOIN appointments a ON c.id = a.client_id
       WHERE a.appointment_date >= ?
         AND a.appointment_date < ?
         ${barberFilter}
         AND NOT EXISTS (
           SELECT 1 FROM appointments a2
           WHERE a2.client_id = c.id
             AND a2.appointment_date < ?
         )`,
      barberId ? [formatDate(start), formatDate(end), barberId, formatDate(start)] : [formatDate(start), formatDate(end), formatDate(start)]
    );

    const [returningClientsRows] = await pool.execute(
      `SELECT COUNT(DISTINCT c.id) AS count
       FROM clients c
       JOIN appointments a ON c.id = a.client_id
       WHERE a.appointment_date >= ?
         AND a.appointment_date < ?
         ${barberFilter}
         AND EXISTS (
           SELECT 1 FROM appointments a2
           WHERE a2.client_id = c.id
             AND a2.appointment_date < ?
         )`,
      barberId ? [formatDate(start), formatDate(end), barberId, formatDate(start)] : [formatDate(start), formatDate(end), formatDate(start)]
    );

    res.json({
      period,
      new_clients: newClientsRows[0]?.count || 0,
      returning_clients: returningClientsRows[0]?.count || 0,
    });
  } catch (error) {
    console.error('Error fetching clients summary:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

router.get('/barbers', async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM barbers ORDER BY name');
    res.json(rows);
  } catch (error) {
    console.error('Error fetching barbers:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

router.post('/barbers', async (req, res) => {
  try {
    if (!isAdmin(req)) {
      return res.status(403).json({ error: 'No tienes permisos para crear barberos' });
    }
    const { name, email, phone, is_active } = req.body;
    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: 'El nombre del barbero es requerido' });
    }
    const [result] = await pool.execute(
      'INSERT INTO barbers (name, email, phone, is_active) VALUES (?, ?, ?, ?)',
      [String(name).trim(), email ? String(email).trim() : null, phone ? String(phone).trim() : null, is_active ? 1 : 0]
    );
    const [rows] = await pool.execute('SELECT * FROM barbers WHERE id = ?', [result.insertId]);
    res.status(201).json(rows[0]);
  } catch (error) {
    console.error('Error creating barber:', error);
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Ya existe un barbero con ese nombre' });
    }
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

router.patch('/barbers/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const barberId = getBarberId(req);
    if (barberId && barberId !== Number(id)) {
      return res.status(403).json({ error: 'No tienes permisos para editar este barbero' });
    }
    const { name, email, phone, is_active } = req.body;
    const [existing] = await pool.execute('SELECT * FROM barbers WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Barbero no encontrado' });
    }
    const updates = [];
    const values = [];
    if (name !== undefined) { updates.push('name = ?'); values.push(String(name).trim()); }
    if (email !== undefined) { updates.push('email = ?'); values.push(email ? String(email).trim() : null); }
    if (phone !== undefined) { updates.push('phone = ?'); values.push(phone ? String(phone).trim() : null); }
    if (is_active !== undefined) { updates.push('is_active = ?'); values.push(is_active ? 1 : 0); }
    if (updates.length === 0) {
      return res.status(400).json({ error: 'No hay campos para actualizar' });
    }
    values.push(id);
    await pool.execute(`UPDATE barbers SET ${updates.join(', ')} WHERE id = ?`, values);
    const [rows] = await pool.execute('SELECT * FROM barbers WHERE id = ?', [id]);
    res.json(rows[0]);
  } catch (error) {
    console.error('Error updating barber:', error);
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Ya existe un barbero con ese nombre' });
    }
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

router.delete('/barbers/:id', async (req, res) => {
  try {
    if (!isAdmin(req)) {
      return res.status(403).json({ error: 'No tienes permisos para desactivar barberos' });
    }
    const { id } = req.params;
    const [existing] = await pool.execute('SELECT * FROM barbers WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Barbero no encontrado' });
    }
    await pool.execute('UPDATE barbers SET is_active = 0 WHERE id = ?', [id]);
    res.json({ message: 'Barbero desactivado' });
  } catch (error) {
    console.error('Error deleting barber:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

router.post('/workstations', async (req, res) => {
  try {
    if (!isAdmin(req)) {
      return res.status(403).json({ error: 'No tienes permisos para crear estaciones' });
    }
    const { name, barber_id, is_active } = req.body;
    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: 'El nombre de la estación es requerido' });
    }
    const [result] = await pool.execute(
      'INSERT INTO workstations (name, barber_id, is_active) VALUES (?, ?, ?)',
      [String(name).trim(), barber_id ? Number(barber_id) : null, is_active ? 1 : 0]
    );
    const [rows] = await pool.execute('SELECT w.*, b.name AS barber_name FROM workstations w LEFT JOIN barbers b ON w.barber_id = b.id WHERE w.id = ?', [result.insertId]);
    res.status(201).json(rows[0]);
  } catch (error) {
    console.error('Error creating workstation:', error);
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Ya existe una estación con ese nombre' });
    }
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

router.patch('/workstations/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const barberId = getBarberId(req);
    if (barberId) {
      const [ws] = await pool.execute('SELECT * FROM workstations WHERE id = ?', [id]);
      if (ws.length === 0 || ws[0].barber_id !== barberId) {
        return res.status(403).json({ error: 'No tienes permisos para editar esta estación' });
      }
    }
    const { name, barber_id, is_active } = req.body;
    const [existing] = await pool.execute('SELECT * FROM workstations WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Estación no encontrada' });
    }
    const updates = [];
    const values = [];
    if (name !== undefined) { updates.push('name = ?'); values.push(String(name).trim()); }
    if (barber_id !== undefined) { updates.push('barber_id = ?'); values.push(barber_id ? Number(barber_id) : null); }
    if (is_active !== undefined) { updates.push('is_active = ?'); values.push(is_active ? 1 : 0); }
    if (updates.length === 0) {
      return res.status(400).json({ error: 'No hay campos para actualizar' });
    }
    values.push(id);
    await pool.execute(`UPDATE workstations SET ${updates.join(', ')} WHERE id = ?`, values);
    const [rows] = await pool.execute('SELECT w.*, b.name AS barber_name FROM workstations w LEFT JOIN barbers b ON w.barber_id = b.id WHERE w.id = ?', [id]);
    res.json(rows[0]);
  } catch (error) {
    console.error('Error updating workstation:', error);
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Ya existe una estación con ese nombre' });
    }
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

router.delete('/workstations/:id', async (req, res) => {
  try {
    if (!isAdmin(req)) {
      return res.status(403).json({ error: 'No tienes permisos para desactivar estaciones' });
    }
    const { id } = req.params;
    const [existing] = await pool.execute('SELECT * FROM workstations WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Estación no encontrada' });
    }
    await pool.execute('UPDATE workstations SET is_active = 0 WHERE id = ?', [id]);
    res.json({ message: 'Estación desactivada' });
  } catch (error) {
    console.error('Error deleting workstation:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

router.get('/services', async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM services ORDER BY category, name');
    res.json(rows);
  } catch (error) {
    console.error('Error fetching services:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

router.post('/services', async (req, res) => {
  try {
    if (!isAdmin(req)) {
      return res.status(403).json({ error: 'No tienes permisos para crear servicios' });
    }
    const { name, category, duration_minutes, price_cents, description, is_popular, is_active } = req.body;
    if (!name || !String(name).trim() || !category || !duration_minutes || price_cents === undefined) {
      return res.status(400).json({ error: 'Nombre, categoría, duración y precio son requeridos' });
    }
    const [result] = await pool.execute(
      'INSERT INTO services (name, category, duration_minutes, price_cents, description, is_popular, is_active) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [String(name).trim(), category, Number(duration_minutes), Number(price_cents), description ? String(description).trim() : null, is_popular ? 1 : 0, is_active ? 1 : 0]
    );
    const [rows] = await pool.execute('SELECT * FROM services WHERE id = ?', [result.insertId]);
    res.status(201).json(rows[0]);
  } catch (error) {
    console.error('Error creating service:', error);
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Ya existe un servicio con ese nombre' });
    }
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

router.patch('/services/:id', async (req, res) => {
  try {
    if (!isAdmin(req)) {
      return res.status(403).json({ error: 'No tienes permisos para editar servicios' });
    }
    const { id } = req.params;
    const { name, category, duration_minutes, price_cents, description, is_popular, is_active } = req.body;
    const [existing] = await pool.execute('SELECT * FROM services WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Servicio no encontrado' });
    }
    const updates = [];
    const values = [];
    if (name !== undefined) { updates.push('name = ?'); values.push(String(name).trim()); }
    if (category !== undefined) { updates.push('category = ?'); values.push(category); }
    if (duration_minutes !== undefined) { updates.push('duration_minutes = ?'); values.push(Number(duration_minutes)); }
    if (price_cents !== undefined) { updates.push('price_cents = ?'); values.push(Number(price_cents)); }
    if (description !== undefined) { updates.push('description = ?'); values.push(description ? String(description).trim() : null); }
    if (is_popular !== undefined) { updates.push('is_popular = ?'); values.push(is_popular ? 1 : 0); }
    if (is_active !== undefined) { updates.push('is_active = ?'); values.push(is_active ? 1 : 0); }
    if (updates.length === 0) {
      return res.status(400).json({ error: 'No hay campos para actualizar' });
    }
    values.push(id);
    await pool.execute(`UPDATE services SET ${updates.join(', ')} WHERE id = ?`, values);
    const [rows] = await pool.execute('SELECT * FROM services WHERE id = ?', [id]);
    res.json(rows[0]);
  } catch (error) {
    console.error('Error updating service:', error);
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Ya existe un servicio con ese nombre' });
    }
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

router.delete('/services/:id', async (req, res) => {
  try {
    if (!isAdmin(req)) {
      return res.status(403).json({ error: 'No tienes permisos para desactivar servicios' });
    }
    const { id } = req.params;
    const [existing] = await pool.execute('SELECT * FROM services WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Servicio no encontrado' });
    }
    await pool.execute('UPDATE services SET is_active = 0 WHERE id = ?', [id]);
    res.json({ message: 'Servicio desactivado' });
  } catch (error) {
    console.error('Error deleting service:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

router.post('/clients', async (req, res) => {
  try {
    if (!isAdmin(req)) {
      return res.status(403).json({ error: 'No tienes permisos para crear clientes' });
    }
    const { name, phone, email, notes } = req.body;
    if (!name || !String(name).trim() || !phone || !/^\d{10}$/.test(String(phone).trim())) {
      return res.status(400).json({ error: 'Nombre y teléfono (10 dígitos) son requeridos' });
    }
    const [existing] = await pool.execute('SELECT id FROM clients WHERE phone = ?', [String(phone).trim()]);
    if (existing.length > 0) {
      return res.status(409).json({ error: 'Ya existe un cliente con este teléfono', clientId: existing[0].id });
    }
    const [result] = await pool.execute(
      'INSERT INTO clients (name, phone, email, notes) VALUES (?, ?, ?, ?)',
      [String(name).trim(), String(phone).trim(), email ? String(email).trim() : null, notes ? String(notes).trim() : null]
    );
    const [rows] = await pool.execute('SELECT * FROM clients WHERE id = ?', [result.insertId]);
    res.status(201).json(rows[0]);
  } catch (error) {
    console.error('Error creating client:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

router.patch('/clients/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, phone, email, notes } = req.body;
    const [existing] = await pool.execute('SELECT * FROM clients WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Cliente no encontrado' });
    }
    const updates = [];
    const values = [];
    if (name !== undefined) { updates.push('name = ?'); values.push(String(name).trim()); }
    if (phone !== undefined) { updates.push('phone = ?'); values.push(String(phone).trim()); }
    if (email !== undefined) { updates.push('email = ?'); values.push(email ? String(email).trim() : null); }
    if (notes !== undefined) { updates.push('notes = ?'); values.push(notes ? String(notes).trim() : null); }
    if (updates.length === 0) {
      return res.status(400).json({ error: 'No hay campos para actualizar' });
    }
    values.push(id);
    await pool.execute(`UPDATE clients SET ${updates.join(', ')} WHERE id = ?`, values);
    const [rows] = await pool.execute('SELECT * FROM clients WHERE id = ?', [id]);
    res.json(rows[0]);
  } catch (error) {
    console.error('Error updating client:', error);
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Ya existe un cliente con ese teléfono' });
    }
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

router.delete('/clients/:id', async (req, res) => {
  try {
    if (!isAdmin(req)) {
      return res.status(403).json({ error: 'No tienes permisos para eliminar clientes' });
    }
    const { id } = req.params;
    const [existing] = await pool.execute('SELECT * FROM clients WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Cliente no encontrado' });
    }
    await pool.execute('DELETE FROM clients WHERE id = ?', [id]);
    res.json({ message: 'Cliente eliminado' });
  } catch (error) {
    console.error('Error deleting client:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

router.patch('/appointments/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { client_id, service_id, workstation_id, barber_id, appointment_date, appointment_time, duration_minutes, status, client_message, source, reminder_sent } = req.body;
    const [existing] = await pool.execute('SELECT * FROM appointments WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Cita no encontrada' });
    }

    const barberId = getBarberId(req);
    if (barberId && existing[0].barber_id !== barberId) {
      return res.status(403).json({ error: 'No tienes permisos para editar esta cita' });
    }

    const updates = [];
    const values = [];
    if (client_id !== undefined) { updates.push('client_id = ?'); values.push(Number(client_id)); }
    if (service_id !== undefined) { updates.push('service_id = ?'); values.push(Number(service_id)); }
    if (workstation_id !== undefined) { updates.push('workstation_id = ?'); values.push(workstation_id ? Number(workstation_id) : null); }
    if (barber_id !== undefined) { updates.push('barber_id = ?'); values.push(barber_id ? Number(barber_id) : null); }
    if (appointment_date !== undefined) { updates.push('appointment_date = ?'); values.push(String(appointment_date).trim()); }
    if (appointment_time !== undefined) { updates.push('appointment_time = ?'); values.push(String(appointment_time).trim()); }
    if (duration_minutes !== undefined) { updates.push('duration_minutes = ?'); values.push(Number(duration_minutes)); }
    if (status !== undefined) { updates.push('status = ?'); values.push(status); }
    if (client_message !== undefined) { updates.push('client_message = ?'); values.push(client_message ? String(client_message).trim() : null); }
    if (source !== undefined) { updates.push('source = ?'); values.push(String(source).trim()); }
    if (reminder_sent !== undefined) { updates.push('reminder_sent = ?'); values.push(reminder_sent ? 1 : 0); }
    if (updates.length === 0) {
      return res.status(400).json({ error: 'No hay campos para actualizar' });
    }
    values.push(id);
    await pool.execute(`UPDATE appointments SET ${updates.join(', ')} WHERE id = ?`, values);
    const [rows] = await pool.execute('SELECT a.*, s.name AS service_name, c.name AS client_name, c.phone AS client_phone, w.name AS workstation_name, b.name AS barber_name FROM appointments a LEFT JOIN services s ON a.service_id = s.id LEFT JOIN clients c ON a.client_id = c.id LEFT JOIN workstations w ON a.workstation_id = w.id LEFT JOIN barbers b ON a.barber_id = b.id WHERE a.id = ?', [id]);
    res.json(rows[0]);
  } catch (error) {
    console.error('Error updating appointment:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

router.get('/barbers/agenda', async (req, res) => {
  try {
    const { date } = req.query;
    const now = new Date();
    const targetDate = date || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    const barberId = getBarberId(req);
    let barbersQuery = 'SELECT id, name FROM barbers WHERE is_active = 1';
    const barbersParams = [];
    if (barberId) {
      barbersQuery += ' AND id = ?';
      barbersParams.push(barberId);
    }
    barbersQuery += ' ORDER BY name ASC';
    const [barbers] = await pool.execute(barbersQuery, barbersParams);
    console.log('[AGENDA] user role=', req.user?.role, 'entity_id=', req.user?.entity_id, 'barberId=', barberId, 'date=', targetDate, 'barbers found=', barbers.length, barbers.map(b => ({ id: b.id, name: b.name })));

    const [appointments] = await pool.execute(
      `SELECT a.id, a.appointment_time, a.duration_minutes, a.status, a.client_message,
              s.name AS service_name, s.price_cents,
              c.name AS client_name, c.phone AS client_phone,
              w.name AS workstation_name, a.barber_id
       FROM appointments a
       LEFT JOIN services s ON a.service_id = s.id
       LEFT JOIN clients c ON a.client_id = c.id
       LEFT JOIN workstations w ON a.workstation_id = w.id
       WHERE a.appointment_date = ?
         AND a.status != 'cancelled'
         ${barberId ? 'AND a.barber_id = ?' : ''}
       ORDER BY a.appointment_time ASC`,
      barberId ? [targetDate, barberId] : [targetDate]
    );
    console.log('[AGENDA] appointments found=', appointments.length, appointments.map(a => ({ id: a.id, barber_id: a.barber_id, time: a.appointment_time, status: a.status })));

    const agenda = barbers.map((barber) => {
      const barberAppointments = appointments.filter((apt) => apt.barber_id === barber.id);
      return {
        barber_id: barber.id,
        barber_name: barber.name,
        appointments: barberAppointments.map((apt) => ({
          id: apt.id,
          appointment_time: apt.appointment_time,
          duration_minutes: apt.duration_minutes,
          status: apt.status,
          service_name: apt.service_name,
          price_cents: apt.price_cents,
          client_name: apt.client_name,
          client_phone: apt.client_phone,
          workstation_name: apt.workstation_name,
          client_message: apt.client_message,
        })),
      };
    });

    res.json({ date: targetDate, agenda });
  } catch (error) {
    console.error('Error fetching barbers agenda:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

    res.json({ date: targetDate, agenda });
  } catch (error) {
    console.error('Error fetching barbers agenda:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

module.exports = router;