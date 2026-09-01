module.exports = {
  apps: [
    {
      name: 'family-tour-quiz',
      script: './server.js',
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production',
        PORT: 5500,
        BASE_PATH: '/family'
      },
      env_development: {
        NODE_ENV: 'development',
        PORT: 5500,
        BASE_PATH: '/family'
      }
    }
  ]
};
