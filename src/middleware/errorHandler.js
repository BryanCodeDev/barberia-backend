const logger = require('../utils/logger');

const errorHandler = (err, req, res, next) => {
  logger.error(err.stack);

  if (err.name === 'ValidationError') {
    return res.status(400).json({ error: err.message });
  }

  if (err.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({ error: 'Ya existe un registro con esos datos' });
  }

  if (err.code === 'ER_NO_REFERENCED_ROW_2') {
    return res.status(400).json({ error: 'Referencia inválida en los datos proporcionados' });
  }

  if (err.code === 'ER_LOCK_DEADLOCK') {
    return res.status(409).json({ error: 'Conflicto de concurrencia. Inténtalo de nuevo.' });
  }

  res.status(500).json({ error: 'Error interno del servidor' });
};

module.exports = errorHandler;