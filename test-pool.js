require('dotenv').config();
const mysql = require('mysql2/promise');

async function test() {
  const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT, 10) || 3307,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'Santimajo101219@',
    database: process.env.DB_NAME || 'barber_trebol',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    charset: 'utf8mb4',
  });

  try {
    console.log('Getting connection...');
    const connection = await pool.getConnection();
    console.log('Connected. Running query...');
    const [rows] = await connection.query('SELECT id FROM clients WHERE phone = ?', ['3001234567']);
    console.log('Result:', rows);
    connection.release();
    console.log('Done');
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await pool.end();
  }
}

test();
