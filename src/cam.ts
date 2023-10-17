import { StillCamera, ExposureMode, Flip, AwbMode, Rotation, StillOptions } from "@zino-hofmann/pi-camera-connect";

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
        default: Flip.None,
    },
    delay: {
        type: 'number',
        default: 5,
        min: 1,
        max: 100,
        unit: 'seconds',
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

//module.exports = {'config': config};