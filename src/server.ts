import express, { ErrorRequestHandler } from 'express'
import { WebSocketServer, createWebSocketStream, MessageEvent } from 'ws';
import 'dotenv/config';
import { config, Camera } from './camera/cam'
import { Server, createServer } from 'http';
import { checkToken } from './token/jwt';
import { logger } from './logging/logging';
import { StreamOptions } from '@zino-hofmann/pi-camera-connect';
import cors from 'cors';

const PORT = Number.parseInt(process.env.PORT ?? '') || 3021

const app = express()

if(process.env.DEV) {
    logger.info('running in dev mode (allowing all Cross Origin Requests)')
    app.use(cors())
}

const httpServer = createServer()

const wsServer = new WebSocketServer({
    perMessageDeflate: false,
    server: httpServer,
    path: "/camstream"
})

httpServer.on("request", app);

app.get('/camConfig', (_, res) => {
    return res.setHeader('Cache-Control', 'max-age=3600').status(200).send(config);
})

wsServer.on('connection', async (socket) => {
    // TODO not sure if its save to put the token into the url??
    // TODO maybe check with tcpdump if url search Params are also encrypted when useing wss
    //const token = (new URL(socket.url)).searchParams.get("token");

    // no token no stream :)
    //if(token == null) return socket.close(1, "No token");

    /*try {
        await checkToken(token);
    } catch(e) {
        console.error(e);
        // TODO actually token could be valid but there were problems with validateing it
        return socket.close(1, "Invalid token");
    }*/
    const camera = new Camera();

    camera.onError((err: any) => {
        logger.error(`camera emitted error event: ${err}`);
        logger.error(`now closeing socket`);
        socket.close();
    });

    try {
        await camera.start();

        socket.on("close", () => {
            logger.error(`closeing socket. stopping camera`);
            camera.stop();
        });

        camera.onError((err: any) => {
            logger.error(`camera emitted error event: ${err}`);
            logger.error(`now closeing socket`);
            socket.close();
        });

        camera.onFrame((img: Buffer) => {
            socket.send(img);
        });

        socket.on('message', async (event: MessageEvent) => {
            logger.info(`event ${event}`);
            /*clearTimeout(timeout);
            timeout = setTimeout(() => {
                socket.close();
            }, 30_000);*/
            // TODO handle new config for stream
            if(event.type === 'config') {
                const opts = (event.data as StreamOptions);
                console.log('changeing camera opts');
                await camera.changeOpts(opts);
            }
        })
    } catch(err) {
        logger.error(`Problem dureing camera startup: ${err}`);
        await camera.stop();
        return socket.close(1, JSON.stringify(err));
    }
});

httpServer.listen(PORT, () => {
    logger.info(`http and ws server listening on Port ${PORT}`)
});