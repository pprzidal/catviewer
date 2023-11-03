import express, { ErrorRequestHandler } from 'express'
import { WebSocketServer, createWebSocketStream, MessageEvent } from 'ws';
import 'dotenv/config';
import { config, Camera } from './camera/cam'
import { Server, createServer } from 'http';
import { checkToken } from './token/jwt';

const app = express()

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
    try {
        const camera = new Camera();

        camera.onError((err: any) => {
            console.error(`camera emitted error event: ${err}`);
            socket.close();
        });

        await camera.start();

        //const camStream = camera.getStream();
        let timeout: NodeJS.Timeout;

        //const stream = createWebSocketStream(socket)

        socket.on("close", () => {
            //camStream.unpipe();
            //camStream.destroy();
            camera.stop();
            //stream.end();
            //stream.destroy();
            //camera.stop();
        })

        //camStream.pipe(stream);

        socket.onmessage = (event: MessageEvent) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => {
                socket.close();
            }, 30_000);
            // TODO handle new config for stream
        }

        camera.onFrame((img: Buffer) => {
            socket.send(img);
        });
    } catch(err) {
        console.error(err);
        return socket.close();
    }
});

const PORT = Number.parseInt(process.env['PORT'] ?? '') ?? 3021

/*app.listen(PORT, '127.0.0.1', () => {
    console.log(`listening on ${PORT}`)
})*/
httpServer.listen(PORT, () => {
    console.log(`listening on ${PORT}`)
})