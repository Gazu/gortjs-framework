export const appEventNames = {
  starting: 'app:starting',
  ready: 'app:ready',
};

export const boardEventNames = {
  ready: 'board:ready',
  stopped: 'board:stopped',
};

export const deviceEventNames = {
  registered: 'device:registered',
  ready: (deviceId: string) => `device:${deviceId}:ready`,
  stateChanged: (deviceId: string) => `device:${deviceId}:state-changed`,
  sensorReading: (deviceId: string) => `device:${deviceId}:sensor:reading`,
  sensorData: (deviceId: string) => `device:${deviceId}:sensor:data-read`,
  commandReceived: (deviceId: string) => `device:${deviceId}:command:received`,
  commandExecuted: (deviceId: string) => `device:${deviceId}:command:executed`,
  commandFailed: (deviceId: string) => `device:${deviceId}:command:failed`,
};
