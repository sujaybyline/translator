module.exports = {
  apps: [
    {
      name: 'xliff-translator-api',
      script: 'server.ts',
      interpreter: 'node',
      interpreter_args: '--import tsx/esm',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
      },
      // Logs go to ~/.pm2/logs/ by default; override here if needed:
      // out_file: '/var/log/xliff-translator/out.log',
      // error_file: '/var/log/xliff-translator/error.log',
      // merge_logs: true,
    },
  ],
};
