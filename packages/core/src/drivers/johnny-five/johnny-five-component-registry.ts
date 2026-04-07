import type { DeviceConfig, DeviceConstructor, GenericComponentConfig, GenericComponentKind } from '@gortjs/contracts';
import { GenericComponentDevice } from '@gortjs/devices';

type JohnnyFiveComponentDefinition = {
  type: string;
  componentClass: string;
  componentKind: GenericComponentKind;
  commandMethods?: string[];
  events?: GenericComponentConfig['events'];
  primaryValuePath?: string;
  initialState?: Record<string, unknown>;
};

function createGenericComponentConstructor(
  definition: JohnnyFiveComponentDefinition,
): DeviceConstructor {
  return class extends GenericComponentDevice {
    constructor(config: DeviceConfig) {
      super({
        ...(config as GenericComponentConfig),
        componentClass: (config as GenericComponentConfig).componentClass ?? definition.componentClass,
        componentKind: (config as GenericComponentConfig).componentKind ?? definition.componentKind,
        commandMethods: (config as GenericComponentConfig).commandMethods ?? definition.commandMethods,
        events: (config as GenericComponentConfig).events ?? definition.events,
        primaryValuePath: (config as GenericComponentConfig).primaryValuePath ?? definition.primaryValuePath,
        initialState: (config as GenericComponentConfig).initialState ?? definition.initialState,
      });
    }
  };
}

export const JOHNNY_FIVE_COMPONENT_DEFINITIONS: JohnnyFiveComponentDefinition[] = [
  { type: 'accelerometer', componentClass: 'Accelerometer', componentKind: 'sensor', events: [{ sourceEvent: 'change' }], primaryValuePath: 'x' },
  { type: 'altimeter', componentClass: 'Altimeter', componentKind: 'sensor', events: [{ sourceEvent: 'change' }], primaryValuePath: 'meters' },
  { type: 'animation', componentClass: 'Animation', componentKind: 'actuator', commandMethods: ['enqueue', 'stop', 'pause', 'next', 'play', 'speed'] },
  { type: 'barometer', componentClass: 'Barometer', componentKind: 'sensor', events: [{ sourceEvent: 'change' }], primaryValuePath: 'pressure' },
  { type: 'button', componentClass: 'Button', componentKind: 'sensor', events: [{ sourceEvent: 'press' }, { sourceEvent: 'release' }, { sourceEvent: 'hold' }], primaryValuePath: 'isDown' },
  { type: 'compass', componentClass: 'Compass', componentKind: 'sensor', events: [{ sourceEvent: 'change' }], primaryValuePath: 'heading' },
  { type: 'esc', componentClass: 'ESC', componentKind: 'actuator', commandMethods: ['speed', 'stop', 'start', 'brake'] },
  { type: 'escs', componentClass: 'ESCs', componentKind: 'actuator', commandMethods: ['speed', 'stop', 'start', 'brake'] },
  { type: 'expander', componentClass: 'Expander', componentKind: 'hybrid', commandMethods: ['normalize'] },
  { type: 'gps', componentClass: 'GPS', componentKind: 'sensor', events: [{ sourceEvent: 'change' }], primaryValuePath: 'latitude' },
  { type: 'gyro', componentClass: 'Gyro', componentKind: 'sensor', events: [{ sourceEvent: 'change' }], primaryValuePath: 'x' },
  { type: 'hygrometer', componentClass: 'Hygrometer', componentKind: 'sensor', events: [{ sourceEvent: 'change' }], primaryValuePath: 'relativeHumidity' },
  { type: 'imu', componentClass: 'IMU', componentKind: 'sensor', events: [{ sourceEvent: 'change' }], primaryValuePath: 'accelerometer.x' },
  { type: 'joystick', componentClass: 'Joystick', componentKind: 'sensor', events: [{ sourceEvent: 'change' }], primaryValuePath: 'x' },
  { type: 'keypad', componentClass: 'Keypad', componentKind: 'sensor', events: [{ sourceEvent: 'press' }, { sourceEvent: 'hold' }, { sourceEvent: 'release' }] },
  { type: 'lcd', componentClass: 'LCD', componentKind: 'actuator', commandMethods: ['clear', 'cursor', 'print', 'blink', 'noBlink', 'autoscroll', 'noAutoscroll', 'useChar', 'backlight', 'noBacklight', 'home'] },
  { type: 'led_rgb', componentClass: 'Led.RGB', componentKind: 'actuator', commandMethods: ['on', 'off', 'toggle', 'blink', 'stop', 'color', 'intensity'], initialState: { on: false } },
  { type: 'led_matrix', componentClass: 'Led.Matrix', componentKind: 'actuator', commandMethods: ['on', 'off', 'draw', 'clear', 'brightness'], initialState: { on: false } },
  { type: 'led_digits', componentClass: 'Led.Digits', componentKind: 'actuator', commandMethods: ['on', 'off', 'print', 'clear', 'brightness'], initialState: { on: false } },
  { type: 'leds', componentClass: 'Leds', componentKind: 'actuator', commandMethods: ['on', 'off', 'toggle', 'blink', 'stop'], initialState: { on: false } },
  { type: 'light', componentClass: 'Light', componentKind: 'sensor', events: [{ sourceEvent: 'change' }], primaryValuePath: 'level' },
  { type: 'motion', componentClass: 'Motion', componentKind: 'sensor', events: [{ sourceEvent: 'motionstart' }, { sourceEvent: 'motionend' }] },
  { type: 'motors', componentClass: 'Motors', componentKind: 'actuator', commandMethods: ['forward', 'reverse', 'stop', 'brake', 'release'] },
  { type: 'multi', componentClass: 'Multi', componentKind: 'sensor', events: [{ sourceEvent: 'change' }] },
  { type: 'piezo', componentClass: 'Piezo', componentKind: 'actuator', commandMethods: ['frequency', 'noTone', 'play'] },
  { type: 'pin', componentClass: 'Pin', componentKind: 'hybrid', commandMethods: ['high', 'low', 'query', 'mode', 'write', 'servoWrite', 'pwmWrite'], events: [{ sourceEvent: 'data' }] },
  { type: 'proximity', componentClass: 'Proximity', componentKind: 'sensor', events: [{ sourceEvent: 'change' }], primaryValuePath: 'cm' },
  { type: 'reflectance_array', componentClass: 'ReflectanceArray', componentKind: 'sensor', events: [{ sourceEvent: 'change' }] },
  { type: 'relays', componentClass: 'Relays', componentKind: 'actuator', commandMethods: ['open', 'close', 'toggle'] },
  { type: 'sensor', componentClass: 'Sensor', componentKind: 'sensor', events: [{ sourceEvent: 'data' }, { sourceEvent: 'change' }], primaryValuePath: 'value' },
  { type: 'servo', componentClass: 'Servo', componentKind: 'actuator', commandMethods: ['to', 'step', 'min', 'max', 'center', 'sweep', 'stop'], initialState: { position: 0 } },
  { type: 'servos', componentClass: 'Servos', componentKind: 'actuator', commandMethods: ['to', 'step', 'min', 'max', 'center', 'sweep', 'stop'] },
  { type: 'shift_register', componentClass: 'ShiftRegister', componentKind: 'actuator', commandMethods: ['send', 'clear', 'reset'] },
  { type: 'sip', componentClass: 'SIP', componentKind: 'sensor', events: [{ sourceEvent: 'change' }] },
  { type: 'system_in_package', componentClass: 'SIP', componentKind: 'sensor', events: [{ sourceEvent: 'change' }] },
  { type: 'stepper', componentClass: 'Stepper', componentKind: 'actuator', commandMethods: ['rpm', 'ccw', 'cw', 'step'] },
  { type: 'switch', componentClass: 'Switch', componentKind: 'sensor', events: [{ sourceEvent: 'open' }, { sourceEvent: 'close' }, { sourceEvent: 'change' }] },
  { type: 'thermometer', componentClass: 'Thermometer', componentKind: 'sensor', events: [{ sourceEvent: 'change' }], primaryValuePath: 'celsius' },
];

export const johnnyFiveComponentConstructors: Record<string, DeviceConstructor> =
  Object.fromEntries(
    JOHNNY_FIVE_COMPONENT_DEFINITIONS.map((definition) => [
      definition.type,
      createGenericComponentConstructor(definition),
    ]),
  );
