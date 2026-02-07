import Joi from 'joi';

const storeSchema = Joi.object({
  name: Joi.string()
    .min(2)
    .max(60)
    .required()
    .messages({
      'string.min': 'Store name must be at least 2 characters',
      'string.max': 'Store name must be at most 60 characters',
    }),
  type: Joi.string().valid('woocommerce', 'medusa').default('woocommerce'),
  adminUser: Joi.string().min(3).max(30).pattern(/^[a-zA-Z0-9_-]+$/).default('admin'),
  adminPassword: Joi.string().min(6).max(64).default(null),
});

/**
 * Generate a DNS-safe slug from any display name.
 * e.g. "My Awesome Store!" → "my-awesome-store"
 */
export function slugify(name) {
  return name
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')   // remove accents
    .replace(/[^a-z0-9]+/g, '-')                         // non-alphanumeric → hyphen
    .replace(/^-+|-+$/g, '')                              // trim leading/trailing hyphens
    .replace(/-{2,}/g, '-')                               // collapse multiple hyphens
    .slice(0, 53);                                        // keep within K8s limits (63 - "store-" prefix)
}

export function validateStoreName(name) {
  const { error } = storeSchema.extract('name').validate(name);
  return { valid: !error, error: error?.message };
}

export function validateStoreInput(data) {
  return storeSchema.validate(data, { abortEarly: false });
}
