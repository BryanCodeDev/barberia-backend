const { body, validationResult } = require('express-validator');

const validate = (validations) => {
  return async (req, res, next) => {
    await Promise.all(validations.map((v) => v.run(req)));

    const errors = validationResult(req);
    if (errors.isEmpty()) {
      return next();
    }

    const formatted = errors.array().map((e) => ({
      field: e.path,
      message: e.msg,
    }));

    res.status(400).json({ error: 'Error de validación', details: formatted });
  };
};

module.exports = { validate };