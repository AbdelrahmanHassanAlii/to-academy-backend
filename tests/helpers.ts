export const testEnvironment = {
  NODE_ENV: 'test',
  PORT: '4000',
  MONGODB_URI: 'mongodb://127.0.0.1:27017/to_academy_test',
  SESSION_SECRET: 'test-only-secret-with-at-least-48-characters-1234567890',
  SESSION_COOKIE_NAME: 'toacademy.sid',
  PUBLIC_APP_URL: 'http://localhost:5173',
  ADMIN_APP_URL: 'http://localhost:5174',
  ALLOWED_ORIGINS: 'http://localhost:5173,http://localhost:5174',
  TRUST_PROXY_HOPS: '0',
};

export const productionEnvironment = {
  ...testEnvironment,
  NODE_ENV: 'production',
  PUBLIC_APP_URL: 'https://toacademy.com',
  ADMIN_APP_URL: 'https://admin.toacademy.com',
  ALLOWED_ORIGINS: 'https://toacademy.com,https://admin.toacademy.com',
  TRUST_PROXY_HOPS: '1',
};
