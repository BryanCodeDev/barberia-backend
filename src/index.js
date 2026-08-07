const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const logger = require('./utils/logger');
require('dotenv').config();

const pool = require('./config/database');
const { authenticateToken } = require('./middleware/auth');
const errorHandler = require('./middleware/errorHandler');
const authRoutes = require('./routes/auth');
const appointmentRoutes = require('./routes/appointments');
const serviceRoutes = require('./routes/services');
const clientRoutes = require('./routes/clients');
const adminRoutes = require('./routes/admin');

const app = express();

const corsOrigins = (process.env.FRONTEND_URL || 'http://localhost:3000')
  .split(',')
  .map((s) => s.trim());

app.use(cors({
  origin: corsOrigins,
  credentials: true,
}));
app.use(helmet());
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Demasiadas solicitudes, intenta de nuevo más tarde' },
});
app.use('/api/', limiter);

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

app.use('/api/auth', authRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/services', serviceRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/admin', authenticateToken, adminRoutes);

app.use(errorHandler);

const PORT = process.env.PORT || 3001;

async function startServer() {
  try {
    await pool.getConnection();
    logger.info('Conectado a MySQL');
  } catch (err) {
    logger.error('Error conectando a MySQL:', err.message);
    process.exit(1);
  }

  app.listen(PORT, () => {
    logger.info(`Servidor backend corriendo en puerto ${PORT} [${process.env.NODE_ENV || 'development'}]`);
  });
}

startServer();

module.exports = app;