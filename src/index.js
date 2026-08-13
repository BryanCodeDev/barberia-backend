const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

process.on('unhandledRejection', (err) => {
  console.error('Unhandled promise rejection', err);
});
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception', err);
  process.exit(1);
});

const logger = require('./utils/logger');
const pool = require('./config/database');
const { authenticateToken } = require('./middleware/auth');
const errorHandler = require('./middleware/errorHandler');
const authRoutes = require('./routes/auth');
const appointmentRoutes = require('./routes/appointments');
const serviceRoutes = require('./routes/services');
const clientRoutes = require('./routes/clients');
const adminRoutes = require('./routes/admin');
const workstationRoutes = require('./routes/workstations');
const { migrate } = require('./middleware/migrate');

const app = express();

const corsOrigins = (process.env.FRONTEND_URL || 'http://localhost:5173')
  .split(',')
  .map((s) => s.trim());

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || corsOrigins.includes(origin) || origin === 'http://localhost:5173') {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));
app.use(helmet());
app.set('trust proxy', 1);
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

app.use((req, res, next) => {
  console.log('[MIDDLEWARE] request:', req.method, req.url);
  next();
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  console.log('[BODY] parsed keys:', Object.keys(req.body || {}));
  next();
});

app.use((req, res, next) => {
  next();
});

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Demasiadas solicitudes, intenta de nuevo más tarde' },
});
// app.use('/api/', limiter);

app.use((req, res, next) => {
  const timeout = setTimeout(() => {
    console.error('[TIMEOUT] Request hanging:', req.method, req.url);
  }, 10000);
  res.on('finish', () => clearTimeout(timeout));
  res.on('close', () => clearTimeout(timeout));
  next();
});

app.use((req, res, next) => {
  const timeout = setTimeout(() => {
    console.error('[TIMEOUT] Request hanging:', req.method, req.url);
  }, 10000);
  res.on('finish', () => clearTimeout(timeout));
  res.on('close', () => clearTimeout(timeout));
  next();
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), env: process.env.NODE_ENV || 'development' });
});

app.get('/api/business-settings', async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM business_settings ORDER BY id DESC LIMIT 1');
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Configuración no encontrada' });
    }
    res.json(rows[0]);
  } catch (error) {
    console.error('Error fetching business settings:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

app.patch('/api/business-settings', authenticateToken, async (req, res) => {
  try {
    const allowed = [
      'business_name', 'barber_name', 'address', 'phone', 'whatsapp_number', 'email',
      'timezone', 'max_advance_booking_days', 'min_cancel_hours', 'buffer_minutes_between_appointments'
    ];
    const updates = [];
    const values = [];
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        updates.push(`${key} = ?`);
        values.push(req.body[key]);
      }
    }
    if (updates.length === 0) {
      return res.status(400).json({ error: 'No hay campos para actualizar' });
    }
    values.push(new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().split('T')[0]);
    await pool.execute(`UPDATE business_settings SET ${updates.join(', ')}, updated_at = ? WHERE id = (SELECT id FROM business_settings ORDER BY id DESC LIMIT 1)`, values);
    const [rows] = await pool.execute('SELECT * FROM business_settings ORDER BY id DESC LIMIT 1');
    res.json(rows[0]);
  } catch (error) {
    console.error('Error updating business settings:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/services', serviceRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/workstations', workstationRoutes);
app.use('/api/admin', authenticateToken, adminRoutes);

app.use(errorHandler);

const PORT = process.env.PORT || 3001;

async function waitForDatabase() {
  if (!process.env.MYSQL_URL && !process.env.DB_HOST && !process.env.MYSQLHOST) {
    logger.error('No hay configuración de base de datos. Definí MYSQL_URL o DB_HOST/MYSQLHOST.');
    process.exit(1);
  }

  const maxAttempts = 40;
  const delayMs = 3000;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const connection = await pool.getConnection();
      connection.release();
      logger.info('Conectado a MySQL');
      return;
    } catch (err) {
      const message = err.message || String(err);
      logger.warn(`Intento ${attempt}/${maxAttempts}: Error conectando a MySQL. ${message}. Reintentando en ${delayMs / 1000}s...`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  logger.error('No se pudo conectar a MySQL después de varios intentos');
  process.exit(1);
}

async function startServer() {
  await waitForDatabase();
  await migrate();

  const server = app.listen(PORT, () => {
    logger.info(`Servidor backend corriendo en puerto ${PORT} [${process.env.NODE_ENV || 'development'}]`);
  });

  server.on('error', (err) => {
    logger.error('Error en servidor HTTP', err);
  });
}

startServer();

module.exports = app;