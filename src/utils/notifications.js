const pool = require('../config/database');

const sendNotification = async (appointmentId, channel, recipient, message) => {
  try {
    await pool.execute(
      'INSERT INTO notifications (appointment_id, channel, recipient, status) VALUES (?, ?, ?, ?)',
      [appointmentId, channel, recipient, 'pending']
    );
    console.log(`[NOTIFICATION] ${channel} to ${recipient}: ${message}`);
    return true;
  } catch (error) {
    console.error('Notification error:', error);
    return false;
  }
};

const sendBookingConfirmation = async (appointment) => {
  const [settingsResult] = await pool.execute('SELECT * FROM business_settings LIMIT 1');
  const settings = settingsResult[0];

  if (!settings) {
    console.warn('No hay configuración de negocio, saltando notificaciones de booking');
    return;
  }

  const message = `Hola ${appointment.client_name}, tu cita para "${appointment.service_name}" el ${appointment.appointment_date} a las ${appointment.appointment_time} ha sido confirmada. Te contactaremos pronto.`;

  await sendNotification(appointment.id, 'whatsapp', appointment.client_phone, message);

  if (settings.email) {
    await sendNotification(appointment.id, 'email', settings.email, message);
  }
};

const sendReminder = async (appointment) => {
  const message = `Recordatorio: tienes una cita mañana (${appointment.appointment_date}) a las ${appointment.appointment_time} para "${appointment.service_name}". Por favor llega 5 minutos antes.`;

  await sendNotification(appointment.id, 'whatsapp', appointment.client_phone, message);
};

module.exports = { sendNotification, sendBookingConfirmation, sendReminder };