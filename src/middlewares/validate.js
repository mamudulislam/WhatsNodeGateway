const Joi = require('joi');

const validate = (schema) => (req, res, next) => {
  const { value, error } = Joi.compile(schema)
    .prefs({ errors: { label: 'key' }, abortEarly: false })
    .validate(req.body);

  if (error) {
    const errorMessage = error.details.map((details) => details.message).join(', ');
    return res.status(400).json({ error: errorMessage });
  }
  Object.assign(req, value);
  return next();
};

module.exports = validate;
