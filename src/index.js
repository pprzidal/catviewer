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
import cors from 'cors';
import { config } from './cam.js';
//import expressWs = require('express-ws')(app);
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
const privateKey  = fs.readFileSync(env.parsed.PRIVATE_KEY, 'utf8');
const certificate = fs.readFileSync(env.parsed.CERTIFICATE, 'utf8'); 
const users = JSON.parse(fs.readFileSync(env.parsed.USERS, 'utf8'));

app.use(session({
    secret: JSON.parse(env.parsed.SECRET),
    resave: false,
    saveUninitialized: true,
    cookie: {secure: true},
  }));
app.use(helmet.hidePoweredBy());
app.use(helmet.xssFilter());
app.use(helmet.noSniff());
app.use(cors());

const httpServer = http.createServer(app);
const httpsServer = https.createServer({key: privateKey, cert: certificate}, app);

const wsServer = new WebSocketServer({
    server: httpsServer,
    autoAcceptConnections: false,
});

const wsToCameraMapping = {};

wsServer.on('connection', async function(ws) {
    console.log('m8 oida', ws.upgradeReq);

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
        res.status(400).send({error: true, message: 'Not authenticated'})
    } else {
        res.header('Cache-Control', 'no-cache, private, no-store, must-revalidate, max-stale=0, post-check=0, pre-check=0');
        next();
    }
}

//app.use(express.urlencoded({extended: true}));

app.get('/authenticated', (req, res) => {
    console.log('got a request');
	//res.sendFile(env.parsed.HTML_DIR + 'index.html');
})

app.get('/app', checkAuth, (req, res) => {
    //raspberryPiCamera.start(camConfig);
    //res.sendFile(env.parsed.HTML_DIR + 'anzeige.html')
    res.status(200).send({error: false, message: 'Authenticated', ok: 'ok'})
})

app.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if(err) res.status(500).send({err: true, message: 'A problem occured while signing you out'});
        res.status(200).send({err: false, message: 'bye :)'});
    });
});

app.get('/camconfig', (req, res) => {
    res.status(200).send(config);
});

app.post('/toggle', checkAuth, (req, res) => {
    console.log('here');
    RED_LED.writeSync(RED_LED.readSync() ^ 1);
    res.status(200).send();
});

app.post("/totp", limiter, express.json(), (req, res) => {
    console.debug(`totp token: ${req.body.totp}; session uname: ${req.session.uname}`)
    if([req.body.totp, req.session.uname].includes(undefined)) res.status(400).send({error: true, message: 'didnt provide totp token or no login before totp'});//redirect("/");
    const totpKey = users.find(element => element.lname === req.session.uname).totpkey;
    const tokenValidates = totp.verify({
        secret: totpKey,
        encoding: 'ascii',
        token: req.body.totp,
        window: 1
      });
    if (tokenValidates) {
        req.session.loggedIn = true;
        // save the session before redirection to ensure page
        // load does not happen before session is saved
        req.session.save(function (err) {
            if (err) res.status(500).send({});
            else res.status(200).send({next: 'app'});
        });
    } else {
        // TODO send error page instead?
        res.status(400).send({err: true, message: 'wrong totp token'});
    }
})

app.post('/login', limiter, express.json(), async (req, res) => {
    const user = users.find(user => user.lname === req.body.login);
    if(!user) {
        res.status(400).send({error: true, message: "specified user not found"});
    } else {
        try {
            if(await bcrypt.compare(req.body.pass, user.pwd)) {
                if(!user.totpkey) {
                    req.session.regenerate(function (err) {
                        if (err) next(err);
                    
                        // store user information in session, typically a user id
                        req.session.uname = req.body.login;
                        req.session.loggedIn = true;
                    
                        // save the session before redirection to ensure page
                        // load does not happen before session is saved
                        req.session.save(function (err) {
                          if (err) return next(err);
                          res.status(200).send({next: 'app'});
                        })
                    });
                } else {
                    req.session.regenerate(function (err) {
                        if (err) next(err);
                    
                        // store user information in session, typically a user id
                        req.session.uname = req.body.login;
                    
                        // save the session before redirection to ensure page
                        // load does not happen before session is saved
                        req.session.save(function (err) {
                          if (err) return next(err);
                          res.status(200).send({next: 'totp'});//sendFile(env.parsed.HTML_DIR + 'totp.html');
                        })
                    });
                }
            } else {
                await sleep(3000);
                res.status(400).send({error: true, message: 'm8'})//.sendFile(env.parsed.HTML_DIR + 'fehler.html');
            }
        } catch(err) {
            res.status(500).send({error: true, message: "Something went wrong"});
        }
    }
});

httpServer.listen(env.parsed.PORT);
httpsServer.listen(env.parsed.PORT_SECURE);

function stopServers() {
    console.log('here');
    console.warn('SIGTERM/SIGINT was sent. Now im stopping the server');
    RED_LED.unexport();
    httpServer.close((err) => console.error(err));
    httpsServer.close((err) => console.error(err));
    for(const ws of Object.keys(wsToCameraMapping)) {
        ws.close();
    }
    console.warn('Stopped everything successfully');
    process.exit(1);
}

process.on('SIGTERM', stopServers);
process.on('SIGINT', stopServers);