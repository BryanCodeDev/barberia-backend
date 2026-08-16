const rateLimit = require('express-rate-limit');

function noopLimiter() {
  return (req, res, next) => next();
}

const isTest = process.env.NODE_ENV === 'test';

const authLimiter = isTest ? noopLimiter() : rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Demasiados intentos. Intenta de nuevo en 15 minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const otpLimiter = isTest ? noopLimiter() : rateLimit({
  windowMs: 60 * 1000,
  max: 3,
  message: { error: 'Demasiados códigos solicitados. Intenta de nuevo en 1 minuto.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const clientCreationLimiter = isTest ? noopLimiter() : rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  message: { error: 'Demasiados registros. Intenta de nuevo en 1 hora.' },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = { authLimiter, otpLimiter, clientCreationLimiter };
