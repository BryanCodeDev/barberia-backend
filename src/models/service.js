const pool = require('../config/database');

const getAllServices = async () => {
  const [rows] = await pool.execute('SELECT * FROM services WHERE is_active = 1 ORDER BY category, name');
  return rows;
};

const getServiceById = async (id) => {
  const [rows] = await pool.execute('SELECT * FROM services WHERE id = ? AND is_active = 1', [id]);
  return rows[0] || null;
};

module.exports = { getAllServices, getServiceById };