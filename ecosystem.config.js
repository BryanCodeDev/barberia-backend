module.exports = {
  apps: [
    {
      name: 'barberia-el-bronx-api',
      script: './src/index.js',
      cwd: '/app/backend',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
      },
      error_file: './logs/error.log',
      out_file: './logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      max_memory_restart: '512M',
      restart_delay: 1000,
      max_restarts: 10,
    },
  ],
};