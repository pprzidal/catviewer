import { Logger } from "pino";

function handleError(err: any, logger: Logger, socket: WebSocket) {
    logger.error(`camera emitted error event: ${err}`);
    logger.error(`now closeing socket`);
    socket.close();
}

function sendBufferToSocket(buffer: Buffer, socket: WebSocket) {
    socket.send(buffer);
}

export { sendBufferToSocket, handleError }