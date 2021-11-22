module.exports = {
  apps : [{
    name: 'Arbitr',
    script: 'npm',
    args: 'start finder ',
    watch: './bot/finder.ts',
    restart_delay: 10000
  }],

  deploy : {
    production : {
      // user : 'SSH_USERNAME',
      // host : 'SSH_HOSTMACHINE',
      ref  : 'origin/prod',
      repo : 'https://github.com/viacheslavvbogdanov/amm-arbitrageur.git',
      ssh_options: "StrictHostKeyChecking=no",
      path: "/home/ubuntu/amm-arbitrageur",
      // path : 'DESTINATION_PATH',
      'pre-deploy-local': '',
      'post-deploy' : 'npm install && pm2 reload ecosystem.config.js --env production',
      'post_update': ['npm install'],
      'pre-setup': ''
    }
  }
};
