const pool = require('../config/database');

const getAllWorkstations = async () => {
  const [rows] = await pool.execute('SELECT w.*, b.name AS barber_name FROM workstations w LEFT JOIN barbers b ON w.barber_id = b.id WHERE w.is_active = 1 ORDER BY w.id');
  return rows;
};

const getWorkstationById = async (id) => {
  const [rows] = await pool.execute('SELECT * FROM workstations WHERE id = ? AND is_active = 1', [id]);
  return rows[0] || null;
};

module.exports = { getAllWorkstations, getWorkstationById };