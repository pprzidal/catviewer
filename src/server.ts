import express, { ErrorRequestHandler } from 'express'
import { WebSocketServer, createWebSocketStream, MessageEvent } from 'ws';
import 'dotenv/config';
import { config, Camera } from './camera/cam'
import { Server, createServer } from 'http';

const httpServer = createServer()
const app = express()
const wsServer = new WebSocketServer({
    perMessageDeflate: false,
    server: httpServer,
    path: "/camstream"
})

httpServer.on("request", app);

app.get('/camConfig', (_, res) => {
    return res.status(200).send(config);
})

wsServer.on('connection', (socket) => {
    const camera = new Camera();
    const camStream = camera.getStream();
    let garbage: NodeJS.Timeout;

    const stream = createWebSocketStream(socket)

    camStream.pipe(stream);

    socket.on("close", () => {
        camStream.unpipe();
        camStream.destroy();
        stream.end();
        stream.destroy();
        camera.stop();
    })

    socket.onmessage = (event: MessageEvent) => {
        clearTimeout(garbage);
        garbage = setTimeout(() => {
            socket.close();
        }, 30_000);
    }
});

const PORT = Number.parseInt(process.env['PORT'] ?? '') ?? 3021

/*app.listen(PORT, '127.0.0.1', () => {
    console.log(`listening on ${PORT}`)
})*/
httpServer.listen(PORT, "127.0.0.1", () => {
    console.log(`listening on ${PORT}`)
})