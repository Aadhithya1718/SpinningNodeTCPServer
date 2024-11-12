require("dotenv").config(); //Config File for storing credentials variables.
global.express = require("express"); //Http Webmethod api
const compression = require("compression"); //Gzip,Deflate,Broili Compression
const bodyParser = require("body-parser"); //Parse JSON in http response and requests
const helmet = require("helmet"); //Express Security System
const cors = require("cors"); //Cross Origin Request Enabler

global.fs = require("fs"); //Access Files in Local System
global.path = require("path"); //Simplify getting paths for the files in local system
global.moment = require("moment"); //Daterequest Formatter library
global.request = require("request"); //Http Fetch Api
global.os = require("os");
global.app = express();

global.http = require("http").Server(app);

app.set("trust proxy", true);

app.use(bodyParser.json());
app.use(compression());
app.use(
  helmet({
    contentSecurityPolicy: false,
  })
);
app.use(cors());

app.use(express.static(path.join(__dirname, "/public")));

const usterspinning = require("./js/uster-spinning");
app.use("/uster-spinning", usterspinning.router);

function exitHandler(options, exitCode) {
  if (options.cleanup) {
    console.log("cleanup");
  }
  if (exitCode || exitCode === 0) console.log(exitCode);
  if (options.exit) {
    console.log("exitHandler completed , exiting now");
    process.exit();
  }
}

//do something when app is closing
process.on("exit", exitHandler.bind(null, { cleanup: true })).setMaxListeners(15);

//catches ctrl+c event
process.on("SIGINT", exitHandler.bind(null, { exit: true })).setMaxListeners(15);

// catches "kill pid" (for example: nodemon restart)
process.on("SIGUSR1", exitHandler.bind(null, { exit: true })).setMaxListeners(15);
process.on("SIGUSR2", exitHandler.bind(null, { exit: true })).setMaxListeners(15);

//catches uncaught exceptions
process.on("uncaughtException", exitHandler.bind(null, { exit: true })).setMaxListeners(15);

const server = http.listen(process.env.NODE_PORT, () => {
  console.log(`Spinning Node Server Started at Port : ${server.address().port}`);
});
