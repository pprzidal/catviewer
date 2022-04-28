import * as fs from 'fs';
import * as http from 'http'; //TODO vllt. gar nicht http anbieten
import * as https from 'https';
import express from 'express';
//const express = require("express");
import { WebSocketServer } from 'ws';
//import raspberryPiCamera from 'pi-camera-native-ts';
import helmet from 'helmet';
import * as bcrypt from 'bcrypt';
import { totp } from 'speakeasy';
import rateLimit from "express-rate-limit";
import session from 'express-session';
import * as dotenv from 'dotenv';
import pkg from "@zino-hofmann/pi-camera-connect";
import { Gpio } from 'onoff';
const { StillCamera, ExposureMode, Flip, AwbMode } = pkg;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const app = express();
const env = dotenv.config();

if(env.error) {
    console.error('Problem with parseing the env file: ' + env.error);
    process.exit(1);
}

env.parsed.LED_PIN = Number.parseInt(env.parsed.LED_PIN);
const RED_LED = new Gpio(env.parsed.LED_PIN, 'out');

console.log(process.env.PORT);

//TODO: debug mmal: mmal_port_send_buffer: vc.ril.image_encode:out:0(JPEG): send failed: ENOMEM
//            mmal: mmal_port_send_buffer: vc.ril.image_encode:out:0(JPEG): send failed: ENOMEM
//            mmal: mmal_vc_port_send: discarding event 1148042681 on port 0x4e74e90

const limiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
const logFile =  "/home/pi/catviewerapp/.log/log.log";

app.use(session({
    secret: env.parsed.SECRET,
    resave: false,
    saveUninitialized: true,
    cookie: {secure: true},
  }))

const privateKey  = fs.readFileSync(env.parsed.PRIVATE_KEY, 'utf8');
const certificate = fs.readFileSync(env.parsed.CERTIFICATE, 'utf8'); 

const users = JSON.parse(fs.readFileSync(env.parsed.USERS, 'utf8'));


app.use(helmet.hidePoweredBy());
app.use(helmet.xssFilter());
app.use(helmet.noSniff());

const httpServer = http.createServer(app);
const httpsServer = https.createServer({key: privateKey, cert: certificate}, app);

const wsServer = new WebSocketServer({
    server: httpsServer,
    autoAcceptConnections: false,
});

const wsToCameraMapping = {};

wsServer.on('connection', async function(ws) {
    wsToCameraMapping[ws] = new StillCamera({
        flip: Flip.Both,
        width: 640,
        height: 540,
        awbMode: AwbMode.Auto,
        exposureMode: ExposureMode.Off,
    });

    wsToCameraMapping[ws].sleep = 1000;
    wsToCameraMapping[ws].shouldRun = true;
    wsToCameraMapping[ws].lastMessage = Date.now();

    async function sendImages() {
        const usedCamera = wsToCameraMapping[ws];
        while(usedCamera.shouldRun) {
            const buffer = await usedCamera.takeImage();
            ws.send(buffer);
            await sleep(usedCamera.sleep);
            if((Date.now() - usedCamera.lastMessage) >= env.parsed.TIMEOUT) break;
        }
    }

    ws.on('close', async () => {
        delete wsToCameraMapping[ws];
    });

    ws.on('message', async function(message) {
        wsToCameraMapping[ws].lastMessage = Date.now();
    });

    await sendImages();

    ws.close();
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
	res.sendFile(env.parsed.HTML_DIR + 'index.html');
})

app.get('/app', checkAuth, (req, res) => {
    //raspberryPiCamera.start(camConfig);
    res.sendFile(env.parsed.HTML_DIR + 'anzeige.html')
})

app.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        console.log(err);
    });
    res.redirect("/");
});

app.post('/toggle', checkAuth, (req, res) => {
    console.log('here');
    RED_LED.writeSync(RED_LED.readSync() ^ 1);
    res.status(200).send();
});

app.post("/totp", limiter, (req, res) => {
    if([req.body.totp, req.session.uname].includes(undefined)) res.redirect("/");
    const totpKey = users.find(element => element.lname === req.session.uname).totpkey;
    const tokenValidates = totp.verify({
        secret: totpKey,
        encoding: 'ascii',
        token: req.body.totp,
        window: 1
      });
    if (tokenValidates) {
        req.session.uid = Math.random();
        res.redirect("/app");
    } else {
        // TODO send error page instead?
        res.send({'error': 'wrong totp token'});
    }
})

app.post('/login', limiter, async (req, res) => {
    const user = users.find(user => user.lname === req.body.login);
    if(!user) {
        res.status(400).send({"error": "specified user not found"});
    } else {
        try {
            if(await bcrypt.compare(req.body.pass, user.pwd)) {
                if(!user.totpkey) {
                    req.session.uid = Math.random();
                    res.redirect("/app");
                } else {
                    req.session.uname = req.body.login;
                    res.sendFile(env.parsed.HTML_DIR + 'totp.html');
                }
            } else {
                await sleep(3000);
                res.sendFile(env.parsed.HTML_DIR + 'fehler.html');
            }
        } catch(err) {
            res.status(500).send({"error": "Something went wrong"});
        }
    }
});

httpServer.listen(env.parsed.PORT);
httpsServer.listen(env.parsed.PORT_SECURE);

function stopServers() {
    console.log('here');
    console.warn('SIGTERM was sent. Now im stopping the server');
    RED_LED.unexport();
    httpServer.close((err) => console.error(err));
    httpsServer.close((err) => console.error(err));
    process.exit(1);
}

process.on('SIGTERM', stopServers);
process.on('SIGINT', stopServers);