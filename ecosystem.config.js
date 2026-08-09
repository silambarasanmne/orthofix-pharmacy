module.exports = {
  apps: [
    {
      name: 'orthofix-pharmacy-app',
      script: 'backend/server.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        PORT: 5000,
        JWT_SECRET: 'orthofix_secret_jwt_key_2026_super_secure'
      }
    }
  ]
};
