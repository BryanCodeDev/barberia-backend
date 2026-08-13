const express = require('express');
const pool = require('../config/database');
const router = express.Router();

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

router.get('/stats', async (req, res) => {
  try {
    const [total] = await pool.execute('SELECT COUNT(*) AS count FROM appointments');
    const [pending] = await pool.execute("SELECT COUNT(*) AS count FROM appointments WHERE status = 'pending'");
    const [confirmed] = await pool.execute("SELECT COUNT(*) AS count FROM appointments WHERE status = 'confirmed'");
    const [cancelled] = await pool.execute("SELECT COUNT(*) AS count FROM appointments WHERE status = 'cancelled'");
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const today = `${year}-${month}-${day}`;
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
    const { status, date, page, limit, search } = req.query;
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
    if (search) {
      query += ' AND (c.name LIKE ? OR c.phone LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
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

router.get('/notifications', async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT n.*, a.appointment_date, a.appointment_time FROM notifications n LEFT JOIN appointments a ON n.appointment_id = a.id ORDER BY n.sent_at DESC LIMIT 100');
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

    const [currentRows] = await pool.execute(
      `SELECT SUM(s.price_cents) AS total_revenue, COUNT(a.id) AS total_appointments
       FROM appointments a
       LEFT JOIN services s ON a.service_id = s.id
       WHERE a.status = 'completed'
         AND a.appointment_date >= ?
         AND a.appointment_date < ?`,
      [formatDate(currentStart), formatDate(currentEnd)]
    );

    const [previousRows] = await pool.execute(
      `SELECT SUM(s.price_cents) AS total_revenue, COUNT(a.id) AS total_appointments
       FROM appointments a
       LEFT JOIN services s ON a.service_id = s.id
       WHERE a.status = 'completed'
         AND a.appointment_date >= ?
         AND a.appointment_date < ?`,
      [formatDate(previousStart), formatDate(previousEnd)]
    );

    const current = currentRows[0] || { total_revenue: 0, total_appointments: 0 };
    const previous = previousRows[0] || { total_revenue: 0, total_appointments: 0 };

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
      },
      previous: {
        revenue_cents: previousRevenue,
        appointments: previousCount,
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

    const [byBarber] = await pool.execute(
      `SELECT b.id AS barber_id, b.name AS barber_name, COUNT(a.id) AS appointments, COALESCE(SUM(s.price_cents), 0) AS revenue_cents
       FROM appointments a
       LEFT JOIN barbers b ON a.barber_id = b.id
       LEFT JOIN services s ON a.service_id = s.id
       WHERE a.status = 'completed'
         AND a.appointment_date >= ?
         AND a.appointment_date < ?
       GROUP BY b.id, b.name
       ORDER BY revenue_cents DESC`,
      [formatDate(start), formatDate(end)]
    );

    const [byService] = await pool.execute(
      `SELECT s.id AS service_id, s.name AS service_name, COUNT(a.id) AS appointments, COALESCE(SUM(s.price_cents), 0) AS revenue_cents
       FROM appointments a
       LEFT JOIN services s ON a.service_id = s.id
       WHERE a.status = 'completed'
         AND a.appointment_date >= ?
         AND a.appointment_date < ?
       GROUP BY s.id, s.name
       ORDER BY appointments DESC`,
      [formatDate(start), formatDate(end)]
    );

    const [byHour] = await pool.execute(
      `SELECT HOUR(a.appointment_time) AS hour, COUNT(a.id) AS appointments
       FROM appointments a
       WHERE a.status = 'completed'
         AND a.appointment_date >= ?
         AND a.appointment_date < ?
       GROUP BY HOUR(a.appointment_time)
       ORDER BY hour`,
      [formatDate(start), formatDate(end)]
    );

    const [byWeekday] = await pool.execute(
      `SELECT DAYOFWEEK(a.appointment_date) AS weekday, COUNT(a.id) AS appointments
       FROM appointments a
       WHERE a.status = 'completed'
         AND a.appointment_date >= ?
         AND a.appointment_date < ?
       GROUP BY DAYOFWEEK(a.appointment_date)
       ORDER BY weekday`,
      [formatDate(start), formatDate(end)]
    );

    res.json({
      period,
      by_barber: byBarber,
      by_service: byService,
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

    if (search) {
      query += ' WHERE c.name LIKE ? OR c.phone LIKE ?';
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

    const [rows] = await pool.execute(
      `SELECT c.id, c.name, c.phone, c.email, c.total_visits, c.last_visit,
              DATEDIFF(NOW(), c.last_visit) AS days_since_last_visit
       FROM clients c
       WHERE c.last_visit IS NOT NULL
         AND c.last_visit < DATE_SUB(NOW(), INTERVAL ? DAY)
       ORDER BY c.last_visit ASC`,
      [parseInt(days, 10)]
    );
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

    const [newClientsRows] = await pool.execute(
      `SELECT COUNT(DISTINCT c.id) AS count
       FROM clients c
       JOIN appointments a ON c.id = a.client_id
       WHERE a.appointment_date >= ?
         AND a.appointment_date < ?
         AND NOT EXISTS (
           SELECT 1 FROM appointments a2
           WHERE a2.client_id = c.id
             AND a2.appointment_date < ?
         )`,
      [formatDate(start), formatDate(end), formatDate(start)]
    );

    const [returningClientsRows] = await pool.execute(
      `SELECT COUNT(DISTINCT c.id) AS count
       FROM clients c
       JOIN appointments a ON c.id = a.client_id
       WHERE a.appointment_date >= ?
         AND a.appointment_date < ?
         AND EXISTS (
           SELECT 1 FROM appointments a2
           WHERE a2.client_id = c.id
             AND a2.appointment_date < ?
         )`,
      [formatDate(start), formatDate(end), formatDate(start)]
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

module.exports = router;