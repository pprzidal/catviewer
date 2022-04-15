import * as fs from 'fs';
import * as http from 'http'; //TODO vllt. gar nicht http anbieten
import * as https from 'https';
import express from 'express';
//const express = require("express");
const app = express();
import { WebSocketServer } from 'ws';
//import { server as WebSocketServer } from 'websocket';
//const WebSocketServer = server;
//const raspberryPiCamera = require('raspberry-pi-camera-native');
import raspberryPiCamera from 'pi-camera-native-ts';
import helmet from 'helmet';
import * as bcrypt from 'bcrypt';
//const qrcode = require('qrcode');
import {totp} from 'speakeasy';
import rateLimit from "express-rate-limit";
import session from 'express-session';
import * as dotenv from 'dotenv';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config();

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
    secret: process.env.SECRET,
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

//sessions = [];

const camConfig = {
    width: 640,
    height: 480,
    fps: 1,
    encoding: 'JPEG',
    quality: 10,
    mirror: raspberryPiCamera.Mirror.BOTH,
  };

//TODO: .png s nicht als base64 string schicken sondern als BLOB


app.use(helmet.hidePoweredBy());
app.use(helmet.xssFilter());
app.use(helmet.noSniff());

const httpServer = http.createServer(app);
const httpsServer = https.createServer({key: privateKey, cert: certificate}, app);

/*httpServer.on('request', app);
httpsServer.on('request', app);*/

const wsServer = new WebSocketServer({
    //httpServer: web,
    server: httpsServer,
    autoAcceptConnections: false
});

var connection = null;

wsServer.on('connection', async function(request) {
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
    //console.log(typeof frameData);
    console.log('length of this frameData', frameData.length);
    console.log('bytelength of buffer encoded as base64', Buffer.byteLength(frameData, 'base64'));
    console.log('like its send', frameData.toString('base64').length);
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
    const tokenValidates = totp.verify({
        secret: users[0].totpkey, //TODO: super insecure. besser machen
        encoding: 'ascii',
        token: req.body.totp,
        window: 1
      });
    if (tokenValidates === true) {
        try{
            //web.listen(3444); // TODO: eine art heartbeat der detektet ob noch wer am anderen Ende ist.
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
    const user = users.find(user => user.lname === req.body.login);
    if(!user) {
        fs.appendFile(logFile, `${new Date()}: Failed Auth from ${req.ip}\n`, err => {if(err) {return}});
        res.status(400).send({"error": "No user found"});
    } else {
        try {
            if(await bcrypt.compare(req.body.pass, user.pwd)) {
                fs.appendFile(logFile, `${new Date()}: Logged In from ${req.ip}\n`, err => {if(err) {return}});
                //web.listen(3444); // TODO: eine art heartbeat der detektet ob noch wer am anderen Ende ist.
                //web.keepAliveTimeout()
                //res.redirect("/totp")
                res.sendFile(__dirname + "/.html/totp.html");
            }
        } catch(err) {
            res.status(500).send({"error": "Something went wrong"});
        }
    }
});

httpServer.listen(process.env.PORT);
httpsServer.listen(process.env.PORT_SECURE);
