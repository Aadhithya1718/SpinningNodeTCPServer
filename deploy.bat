ECHO Hello, Start Deploying. note that ecosystem.config.js should be present in the same folder of the deploy.bat file
git reset --hard HEAD
git checkout .
git pull
call npm install
call pm2 restart ecosystem.config.js
call pm2 save
echo Deploy Batch File Completed
pause
call pm2 monit