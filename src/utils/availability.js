const pool = require('../config/database');

const getAvailableTimeSlots = async (date, serviceDurationMinutes, workstationId = null) => {
  const dayOfWeek = new Date(date).getDay();
  const [settingsResult] = await pool.execute('SELECT * FROM business_settings LIMIT 1');
  const settings = settingsResult[0];

  let allSlots = [];
  if (dayOfWeek === 0) {
    allSlots = ['09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '12:00', '12:30', '13:00', '13:30', '14:00', '14:30', '15:00', '15:30', '16:00'];
  } else if (dayOfWeek === 6) {
    allSlots = ['08:00', '08:30', '09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '12:00', '12:30', '13:00', '13:30', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00', '17:30', '18:00'];
  } else {
    allSlots = ['08:00', '08:30', '09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '12:00', '12:30', '13:00', '13:30', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00', '17:30', '18:00', '18:30', '19:00'];
  }

  const [occupiedResult] = await pool.execute(
    'SELECT appointment_time FROM appointments WHERE appointment_date = ? AND status != ? AND (workstation_id = ? OR ? IS NULL)',
    [date, 'cancelled', workstationId, workstationId]
  );

  const occupiedTimes = occupiedResult.map((row) => row.appointment_time);

  const bufferMinutes = settings.buffer_minutes_between_appointments || 0;
  const availableSlots = [];

  for (const slot of allSlots) {
    const [hours, minutes] = slot.split(':').map(Number);
    const slotEndMinutes = hours * 60 + minutes + serviceDurationMinutes + bufferMinutes;
    const slotEnd = `${String(Math.floor(slotEndMinutes / 60)).padStart(2, '0')}:${String(slotEndMinutes % 60).padStart(2, '0')}`;

    const isOccupied = occupiedTimes.some((occupied) => {
      const [oh, om] = occupied.split(':').map(Number);
      const occupiedEndMinutes = oh * 60 + om + serviceDurationMinutes + bufferMinutes;
      return slotEndMinutes > oh * 60 + om && occupiedEndMinutes > hours * 60 + minutes;
    });

    if (!isOccupied) {
      availableSlots.push(slot);
    }
  }

  return availableSlots;
};

module.exports = { getAvailableTimeSlots };