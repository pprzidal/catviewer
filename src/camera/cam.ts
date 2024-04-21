import { StreamCamera, StillCamera, ExposureMode, Flip, AwbMode, Rotation, StillOptions, StreamOptions, Codec } from "@zino-hofmann/pi-camera-connect";
import EventEmitter from "events";
import { Readable } from "stream";

export class Camera {
    private static readonly defaults: StreamOptions = {
        codec: Codec.MJPEG,
        fps: 2,
        width: 500,
        height: 500,
    };
    private camera: StreamCamera;

    constructor(camoptions?: StreamOptions) {  
        const opts = {...(camoptions ?? Camera.defaults)};
        this.camera = new StreamCamera(opts);
    }

    async stop() {
        await this.camera.stopCapture();
        this.camera.removeAllListeners();
    }

    async changeOpts(camoptions: StreamOptions) {
        await this.stop();
        this.camera = new StreamCamera(camoptions);
    }

    async start() {
        await this.camera.startCapture();
    }

    async takeImage(): Promise<Buffer> {
        return this.camera.takeImage();
    }

    getStream(): Readable {
        return this.camera.createStream();
    }

    onFrame(handler: (img: Buffer) => void): void {
        this.camera.on('frame', handler);
    }

    onError(handler: (err: any) => void): void {
        (this.camera as EventEmitter).on('error', handler);
    }
}

export const config = {
    width: {
        type: 'number',
        default: 500,
        min: 0,
        max: 1000,
        unit: 'pixels',
    },
    height: {
        type: 'number',
        default: 500,
        min: 0,
        max: 1000,
        unit: 'pixels',
    },
    rotation: {
        type: 'select',
        options: Rotation,
        default: Rotation.Rotate0,
        unit: 'degrees',
    },
    flip: {
        type: 'select',
        options: Flip,
        default: Flip.Both,
    },
    fps: {
        type: 'number',
        default: 2,
        min: 2,
        max: 10,
        unit: 'fps',
    },
    shutter: {
        type: 'number',
        default: 1,
        min: 1,
        max: 100,
    },
    sharpness: {
        type: 'number',
        default: 0,
        min: -100,
        max: 100,
    },
    contrast: {
        type: 'number',
        default: 0,
        min: -100,
        max: 100,
    },
    brightness: {
        type: 'number',
        default: 50,
        min: 0,
        max: 100,
    },
    saturation: {
        type: 'number',
        default: 0,
        min: -100,
        max: 100,
    },
    iso: {
        type: 'number',
        default: 0,
        min: -100,
        max: 100,
    },
    exposureCompensation: {
        type: 'number',
        default: 0,
        min: -100,
        max: 100,
    },
    exposureMode: {
        type: 'select',
        default: ExposureMode.Auto,
        options: ExposureMode,
    },
    awbMode: {
        type: 'select',
        default: AwbMode.Auto,
        options: AwbMode,
    },
    analogGain: {
        type: 'number',
        default: 0,
        min: -10,
        max: 10,
    },
    digitalGain: {
        type: 'number',
        default: 0,
        min: -10,
        max: 10,
    }
};