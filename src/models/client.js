const pool = require('../config/database');

const createClient = async (data) => {
  const { name, phone, email, notes } = data;
  const [result] = await pool.execute(
    'INSERT INTO clients (name, phone, email, notes) VALUES (?, ?, ?, ?)',
    [name, phone, email || null, notes || null]
  );
  return result;
};

const getClientByPhone = async (phone) => {
  const [rows] = await pool.execute('SELECT * FROM clients WHERE phone = ?', [phone]);
  return rows[0] || null;
};

const getClientById = async (id) => {
  const [rows] = await pool.execute('SELECT * FROM clients WHERE id = ?', [id]);
  return rows[0] || null;
};

const updateClient = async (id, data) => {
  const { name, phone, email, notes } = data;
  await pool.execute(
    'UPDATE clients SET name = ?, phone = ?, email = ?, notes = ? WHERE id = ?',
    [name, phone, email || null, notes || null, id]
  );
};

const incrementClientVisits = async (id) => {
  await pool.execute('UPDATE clients SET total_visits = total_visits + 1, last_visit = CURDATE() WHERE id = ?', [id]);
};

module.exports = {
  createClient,
  getClientByPhone,
  getClientById,
  updateClient,
  incrementClientVisits,
};