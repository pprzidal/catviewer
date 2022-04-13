const fs = require('fs');
const http = require('http'); //TODO vllt. gar nicht http anbieten
const https = require('https');
const express = require("express");
const app = express();
const WebSocketServer = require('websocket').server;
//const raspberryPiCamera = require('raspberry-pi-camera-native');
const raspberryPiCamera = require('pi-camera-native-ts');
const helmet = require('helmet');
const bcrypt = require('bcrypt');
//const qrcode = require('qrcode');
const speakeasy = require('speakeasy');
const rateLimit = require("express-rate-limit");
const session = require('express-session');
require('dotenv').config();

console.log(process.env.PORT);

//TODO: debug mmal: mmal_port_send_buffer: vc.ril.image_encode:out:0(JPEG): send failed: ENOMEM
//            mmal: mmal_port_send_buffer: vc.ril.image_encode:out:0(JPEG): send failed: ENOMEM
//            mmal: mmal_vc_port_send: discarding event 1148042681 on port 0x4e74e90

const limiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
const logFile = __dirname + "/.log/log.log";

app.use(session({
    secret: 'keyboard cat',
    resave: false,
    saveUninitialized: true
  }))

//TODO: email zum Funktionieren bringen (vllt. nicht notwendig)
//TODO: magenta anhauen das sie ipv4 am router freischalten
const privateKey  = fs.readFileSync(process.env.PRIVATE_KEY, 'utf8');
const certificate = fs.readFileSync(process.env.CERTIFICATE, 'utf8'); 

// OS ist Linux => '/' als "Pfad trenner". für OS unabhängigkeit sollte das package path verwendet werden
const users = JSON.parse(fs.readFileSync(process.env.USERS, 'utf8'));
console.log(users);
/*var secret = speakeasy.generateSecret({
    length: 60,
    name: "CatViewerApp"
});
console.log(secret);

qrcode.toDataURL(secret.otpauth_url, function(err, data_url) {
    console.log(data_url);
   
    // Display this data URL to the user in an <img> tag
    // Example:
    console.log('<img src="' + data_url + '">');
  });*/

sessions = [];

const camConfig = {
    width: 640,
    height: 480,
    fps: 1,
    encoding: 'JPEG',
    quality: 10,
    hf: false,
    vf: true
  };

//TODO: .png s nicht als base64 string schicken sondern als BLOB


app.use(helmet.hidePoweredBy());
app.use(helmet.xssFilter());
app.use(helmet.noSniff());
//app.use(helmet());
/*app.use(helmet.contentSecurityPolicy({
    connectSrc: ["echo-protocol", "ws://192.168.0.3:3444/"],
    scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
    styleSrc: ["'self'", "'unsafe-inline'"]
}))*/

const httpServer = http.createServer(app);
const web = http.createServer();
const httpsServer = https.createServer({key: privateKey, cert: certificate}, app);

const wsServer = new WebSocketServer({
    httpServer: web,
    autoAcceptConnections: false
});

var connection = null;

wsServer.on('request', async function(request) {
    connection = request.accept('echo-protocol', request.origin);
    fs.appendFile(logFile, `${new Date()}:' Connection accepted.`, err => {if(err) {return}});
    raspberryPiCamera.start(camConfig);

      connection.on('message', async function(message) {
        if (message.type === 'utf8') {
            try {
                raspberryPiCamera.stop(undefined);
            } catch(err) {
                fs.appendFile(logFile, err)
            }
            try {
            raspberryPiCamera.start({
                width: 640,
                height: 480,
                fps: Number.parseInt(message.utf8Data),
                encoding: 'JPEG',
                quality: 10,
                hf: false,
                vf: true
              }, undefined);
            } catch(err) {
                fs.appendFile(logFile, err)
            }
        }
    });
});

raspberryPiCamera.on('frame', (frameData) => {
    try {
        connection.sendUTF(frameData.toString('base64'));
    } catch(err) {
        console.log(err);
    }
});

function checkAuth(req, res, next) {
    if(req.session.uid === undefined) {
        res.redirect("/")
    } else {
        res.header('Cache-Control', 'no-cache, private, no-store, must-revalidate, max-stale=0, post-check=0, pre-check=0');
        next();
    }
}

app.use(express.urlencoded({extended: true}));

app.get('/', (req, res) => {
    console.log('got a request');
	res.sendFile(__dirname + "/.html/index.html");
})

app.get('/app', checkAuth, (req, res) => {
    //raspberryPiCamera.start(camConfig);
    res.sendFile(__dirname + '/.html/anzeige.html')
})

app.get('/logout', (req, res) => {
    //raspberryPiCamera.stop();
    //delete req.session.uid;
    req.session.destroy((err) => {
        console.log(err);
    });
    web.close();
    res.redirect("/");
})

app.post("/totp", limiter, (req, res) => {
    console.log(req.body.totp);
    if(req.body.totp === undefined) res.redirect("/");
    //if(!req.session.uid) res.redirect("/");
    var tokenValidates = speakeasy.totp.verify({
        secret: users[0].totpkey, //TODO: super insecure. besser machen
        encoding: 'ascii',
        token: req.body.totp,
        window: 1
      });
    if (tokenValidates === true) {
        try{
            web.listen(3444); // TODO: eine art heartbeat der detektet ob noch wer am anderen Ende ist.
        } catch(err) {
            console.log(err);
        }
        //sessions.push();
        req.session.uid = Math.random();
        res.redirect("/app");
    } else {
        res.redirect("/");
    }
})

app.post('/login', limiter, async (req, res) => {
    let user = null
    users.forEach(element => {
        if(element.lname === req.body.login) {
            user = element
        }
    });
    if(user === null) {
        fs.appendFile(logFile, `${new Date()}: Failed Auth from ${req.ip}\n`, err => {if(err) {return}});
        res.write("No user found")
        res.end()
        return;
    } else {
        try {
            if(await bcrypt.compare(req.body.pass, user.pwd)) {
                fs.appendFile(logFile, `${new Date()}: Logged In from ${req.ip}\n`, err => {if(err) {return}});
                //web.listen(3444); // TODO: eine art heartbeat der detektet ob noch wer am anderen Ende ist.
                //web.keepAliveTimeout()
                //res.redirect("/totp")
                res.sendFile(__dirname + "/.html/totp.html");
            }
        } catch {
            res.write("Something went wrong")
        }
    }
});

httpServer.listen(3000);
httpsServer.listen(3443);
