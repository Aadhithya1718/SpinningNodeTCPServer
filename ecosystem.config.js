module.exports = {
  apps: [
    {
      name: "ALCSpinningNodeServer",
      script: "index.js",
      watch: false,
      exp_backoff_restart_delay: 300,
      ignore_watch: ["node_modules",  "temp"],
      watch_options: {
        followSymlinks: false,
      },
      error_file: "err.log",
      merge_logs: true,
      log_date_format: "---  dddd, MMMM D YYYY, h:mm:ss a  ---",
      instances: 1,
      env: {
        NODE_ENV: "production",
        PORT: 3002,
      },
    },
  ],
};
// "err.log", "access.log",