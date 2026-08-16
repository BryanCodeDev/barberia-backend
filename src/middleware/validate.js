const validate = (schema) => {
  return async (req, res, next) => {
    try {
      const errors = [];
      const body = req.body || {};
      const params = req.params || {};
      const query = req.query || {};

      if (schema.body) {
        for (const [field, rules] of Object.entries(schema.body)) {
          const value = body[field];
          if (rules.required && (value === undefined || value === null || String(value).trim() === '')) {
            errors.push({ field, message: rules.requiredMessage || `El campo ${field} es requerido` });
          }
          if (value !== undefined && value !== null && String(value).trim() !== '' && rules.pattern && !rules.pattern.test(String(value).trim())) {
            errors.push({ field, message: rules.patternMessage || `El campo ${field} tiene formato inválido` });
          }
          if (value !== undefined && value !== null && String(value).trim() !== '' && rules.minLength && String(value).trim().length < rules.minLength) {
            errors.push({ field, message: rules.minLengthMessage || `El campo ${field} debe tener al menos ${rules.minLength} caracteres` });
          }
          if (value !== undefined && value !== null && rules.type === 'number' && isNaN(Number(value))) {
            errors.push({ field, message: rules.typeMessage || `El campo ${field} debe ser numérico` });
          }
          if (value !== undefined && value !== null && rules.type === 'number' && !isNaN(Number(value))) {
            const num = Number(value);
            if (rules.min !== undefined && num < rules.min) {
              errors.push({ field, message: rules.minMessage || `El campo ${field} debe ser mayor o igual a ${rules.min}` });
            }
            if (rules.max !== undefined && num > rules.max) {
              errors.push({ field, message: rules.maxMessage || `El campo ${field} debe ser menor o igual a ${rules.max}` });
            }
          }
        }
      }

      if (schema.params) {
        for (const [field, rules] of Object.entries(schema.params)) {
          const value = params[field];
          if (rules.required && (value === undefined || value === null || String(value).trim() === '')) {
            errors.push({ field, message: rules.requiredMessage || `El parámetro ${field} es requerido` });
          }
          if (value !== undefined && value !== null && String(value).trim() !== '' && rules.type === 'number' && isNaN(Number(value))) {
            errors.push({ field, message: rules.typeMessage || `El parámetro ${field} debe ser numérico` });
          }
          if (value !== undefined && value !== null && !isNaN(Number(value)) && rules.type === 'number' && Number(value) <= 0) {
            errors.push({ field, message: rules.typeMessage || `El parámetro ${field} debe ser mayor a 0` });
          }
        }
      }

      if (schema.query) {
        for (const [field, rules] of Object.entries(schema.query)) {
          const value = query[field];
          if (rules.required && (value === undefined || value === null || String(value).trim() === '')) {
            errors.push({ field, message: rules.requiredMessage || `El parámetro ${field} es requerido` });
          }
          if (value !== undefined && value !== null && String(value).trim() !== '' && rules.type === 'number' && isNaN(Number(value))) {
            errors.push({ field, message: rules.typeMessage || `El parámetro ${field} debe ser numérico` });
          }
          if (value !== undefined && value !== null && !isNaN(Number(value)) && rules.type === 'number') {
            const num = Number(value);
            if (rules.min !== undefined && num < rules.min) {
              errors.push({ field, message: rules.minMessage || `El parámetro ${field} debe ser mayor o igual a ${rules.min}` });
            }
            if (rules.max !== undefined && num > rules.max) {
              errors.push({ field, message: rules.maxMessage || `El parámetro ${field} debe ser menor o igual a ${rules.max}` });
            }
          }
        }
      }

      if (errors.length > 0) {
        return res.status(400).json({ error: 'Datos inválidos', errors });
      }

      next();
    } catch (err) {
      next(err);
    }
  };
};

module.exports = { validate };
