const pool = require('../config/database');
const { sendRealtimeNotification } = require('../utils/notifications');

const markNoShows = async () => {
  try {
    const now = new Date();
    const currentDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:00`;

    const [appointments] = await pool.execute(
      `SELECT a.*, b.name AS barber_name, c.name AS client_name, c.phone AS client_phone
       FROM appointments a
       LEFT JOIN barbers b ON a.barber_id = b.id
       LEFT JOIN clients c ON a.client_id = c.id
       WHERE a.appointment_date = ?
         AND a.appointment_time <= ?
         AND a.status = 'confirmed'`,
       [currentDate, currentTime]
    );

    const fifteenMinutesAgo = new Date(now.getTime() - 15 * 60 * 1000);
    const cutoffTime = `${String(fifteenMinutesAgo.getHours()).padStart(2, '0')}:${String(fifteenMinutesAgo.getMinutes()).padStart(2, '0')}:00`;

    const toMark = appointments.filter((apt) => apt.appointment_time < cutoffTime);

    for (const apt of toMark) {
      await pool.execute('UPDATE appointments SET status = ? WHERE id = ?', ['no-show', apt.id]);
      await pool.execute(
        'INSERT INTO attendance_logs (appointment_id, action, performed_by, performed_role, notes) VALUES (?, ?, ?, ?, ?)',
        [apt.id, 'no-show-auto', null, 'system', 'Marcado automáticamente por no presentarse dentro del plazo de 15 minutos']
      );

      if (apt.barber_id) {
        await sendRealtimeNotification({
          userId: apt.barber_id,
          userRole: 'barber',
          type: 'no_show_auto',
          title: 'No-show automático',
          message: `El cliente ${apt.client_name || 'sin nombre'} no se presentó a la cita de ${apt.appointment_time}.`,
        }).catch(() => {});
      }
    }

    if (toMark.length > 0) {
      console.log(`[ATTENDANCE] ${toMark.length} citas marcadas como no-show automáticamente`);
    }

    return toMark.length;
  } catch (error) {
    console.error('Error running attendance automation:', error);
    return 0;
  }
};

module.exports = { markNoShows };
