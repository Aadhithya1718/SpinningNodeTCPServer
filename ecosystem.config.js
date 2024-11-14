module.exports = {
  apps: [
    {
      name: "ALCSpinningNodeServer",
      script: "index.js",
      watch: true,
      exp_backoff_restart_delay: 300,
      ignore_watch: ["node_modules", "err.log", "access.log", "temp"],
      watch_options: {
        followSymlinks: false,
      },
      error_file: "err.log",
      merge_logs: true,
      log_date_format: "---  dddd, MMMM D YYYY, h:mm:ss a  ---",
      instances: 1,
    },
  ],
};
