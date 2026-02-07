import Joi from 'joi';

const storeSchema = Joi.object({
  name: Joi.string()
    .min(3)
    .max(40)
    .pattern(/^[a-z][a-z0-9-]*[a-z0-9]$/)
    .required()
    .messages({
      'string.pattern.base':
        'Store name must start with a letter, contain only lowercase letters, numbers, and hyphens, and end with a letter or number',
    }),
  type: Joi.string().valid('woocommerce', 'medusa').default('woocommerce'),
  adminUser: Joi.string().min(3).max(30).pattern(/^[a-zA-Z0-9_-]+$/).default('admin'),
  adminPassword: Joi.string().min(6).max(64).default(null),
});

export function validateStoreName(name) {
  const { error } = storeSchema.extract('name').validate(name);
  return { valid: !error, error: error?.message };
}

export function validateStoreInput(data) {
  return storeSchema.validate(data, { abortEarly: false });
}
