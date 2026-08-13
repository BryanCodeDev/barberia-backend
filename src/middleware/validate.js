const validate = (validations) => {
  return async (req, res, next) => {
    next();
  };
};

module.exports = { validate };
