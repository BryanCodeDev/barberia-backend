const pool = require('../config/database');

const createAppointment = async (data) => {
  const { client_id, service_id, workstation_id, barber_id, appointment_date, appointment_time, duration_minutes, client_message } = data;
  const [result] = await pool.execute(
    'INSERT INTO appointments (client_id, service_id, workstation_id, barber_id, appointment_date, appointment_time, duration_minutes, status, client_message) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [client_id, service_id, workstation_id, barber_id, appointment_date, appointment_time, duration_minutes, 'pending', client_message || '']
  );
  return result;
};

const getAppointmentById = async (id) => {
  const [rows] = await pool.execute(
    'SELECT a.*, s.name AS service_name, s.duration_minutes AS service_duration, s.price_cents, c.name AS client_name, c.phone AS client_phone, c.email AS client_email, w.name AS workstation_name, b.name AS barber_name FROM appointments a LEFT JOIN services s ON a.service_id = s.id LEFT JOIN clients c ON a.client_id = c.id LEFT JOIN workstations w ON a.workstation_id = w.id LEFT JOIN barbers b ON a.barber_id = b.id WHERE a.id = ?',
    [id]
  );
  return rows[0] || null;
};

const getAppointmentsByDate = async (date) => {
  const [rows] = await pool.execute(
    'SELECT a.*, s.name AS service_name, s.duration_minutes AS service_duration, s.price_cents, c.name AS client_name, c.phone AS client_phone, w.name AS workstation_name, b.name AS barber_name FROM appointments a LEFT JOIN services s ON a.service_id = s.id LEFT JOIN clients c ON a.client_id = c.id LEFT JOIN workstations w ON a.workstation_id = w.id LEFT JOIN barbers b ON a.barber_id = b.id WHERE a.appointment_date = ? ORDER BY a.appointment_time',
    [date]
  );
  return rows;
};

const getAppointmentsByClient = async (clientId) => {
  const [rows] = await pool.execute(
    'SELECT a.*, s.name AS service_name, s.duration_minutes AS service_duration, s.price_cents FROM appointments a LEFT JOIN services s ON a.service_id = s.id WHERE a.client_id = ? ORDER BY a.appointment_date DESC, a.appointment_time DESC',
    [clientId]
  );
  return rows;
};

const updateAppointmentStatus = async (id, status, cancelledReason = null) => {
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
  if (status === 'cancelled') {
    await pool.execute(
      'UPDATE appointments SET status = ?, cancelled_reason = ?, cancelled_at = ? WHERE id = ?',
      [status, cancelledReason, now, id]
    );
  } else {
    await pool.execute(
      'UPDATE appointments SET status = ? WHERE id = ?',
      [status, id]
    );
  }
};

const deleteAppointment = async (id) => {
  await pool.execute('DELETE FROM appointments WHERE id = ?', [id]);
};

const getOccupiedTimeSlots = async (date, workstationId = null) => {
  const query = workstationId
    ? 'SELECT appointment_time FROM appointments WHERE appointment_date = ? AND status != ? AND workstation_id = ?'
    : 'SELECT appointment_time FROM appointments WHERE appointment_date = ? AND status != ?';
  const params = workstationId ? [date, 'cancelled', workstationId] : [date, 'cancelled'];
  const [rows] = await pool.execute(query, params);
  return rows.map((row) => row.appointment_time);
};

const getAppointmentsByStatus = async (status) => {
  const [rows] = await pool.execute(
    'SELECT a.*, s.name AS service_name, c.name AS client_name, c.phone AS client_phone FROM appointments a LEFT JOIN services s ON a.service_id = s.id LEFT JOIN clients c ON a.client_id = c.id WHERE a.status = ? ORDER BY a.appointment_date, a.appointment_time',
    [status]
  );
  return rows;
};

const getTodayAppointments = async () => {
  const today = new Date().toISOString().split('T')[0];
  return getAppointmentsByDate(today);
};

const getStats = async () => {
  const [total] = await pool.execute('SELECT COUNT(*) AS count FROM appointments');
  const [pending] = await pool.execute("SELECT COUNT(*) AS count FROM appointments WHERE status = 'pending'");
  const [confirmed] = await pool.execute("SELECT COUNT(*) AS count FROM appointments WHERE status = 'confirmed'");
  const [cancelled] = await pool.execute("SELECT COUNT(*) AS count FROM appointments WHERE status = 'cancelled'");
  const today = new Date().toISOString().split('T')[0];
  const [todayCount] = await pool.execute('SELECT COUNT(*) AS count FROM appointments WHERE appointment_date = ?', [today]);

  return {
    total: total[0].count,
    pending: pending[0].count,
    confirmed: confirmed[0].count,
    cancelled: cancelled[0].count,
    today: todayCount[0].count,
  };
};

module.exports = {
  createAppointment,
  getAppointmentById,
  getAppointmentsByDate,
  getAppointmentsByClient,
  updateAppointmentStatus,
  deleteAppointment,
  getOccupiedTimeSlots,
  getAppointmentsByStatus,
  getTodayAppointments,
  getStats,
};