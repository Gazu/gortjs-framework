export type Cleanup = () => void;
export type DevicePin = string | number;
export type DevicePins = DevicePin[] | Record<string, DevicePin>;
export type DeviceOptions = Record<string, unknown>;
export type DeviceStatus = 'created' | 'attached' | 'ready' | 'stopped' | 'disposed' | 'error';
export type DeviceLifecycleAction = 'attach' | 'start' | 'stop' | 'dispose';
export type DeviceType = string;
export type GenericComponentKind = 'sensor' | 'actuator' | 'hybrid';

export type DeviceCommand =
  | { name: 'on' }
  | { name: 'off' }
  | { name: 'toggle' }
  | { name: 'blink'; payload?: { interval?: number } }
  | { name: 'stop' }
  | { name: 'open' }
  | { name: 'close' }
  | { name: 'forward'; payload?: { speed?: number } }
  | { name: 'reverse'; payload?: { speed?: number } }
  | { name: 'start'; payload?: { speed?: number } }
  | { name: 'brake' }
  | { name: 'release' }
  | { name: 'to'; payload?: { degrees?: number; position?: number } }
  | { name: 'step'; payload?: { degrees?: number; step?: number } }
  | { name: 'min' }
  | { name: 'max' }
  | { name: 'center' }
  | { name: 'sweep' }
  | { name: 'frequency'; payload?: { frequency?: number; duration?: number } }
  | { name: 'noTone' }
  | { name: 'play'; payload?: { song?: unknown; notes?: unknown } }
  | { name: 'clear' }
  | { name: 'print'; payload?: { message?: string; value?: string } }
  | { name: 'cursor'; payload?: { row?: number; column?: number } }
  | { name: 'backlight' }
  | { name: 'noBacklight' };

export interface DeviceState {
  id: string;
  type: string;
  pin?: DevicePin;
  pins?: DevicePins;
  status: DeviceStatus;
  state: Record<string, unknown> | null;
}

export interface DeviceConfig {
  id: string;
  type: string;
  pin?: DevicePin;
  pins?: DevicePins;
  options?: DeviceOptions;
}

export interface ComponentEventConfig {
  sourceEvent: string;
  targetEvent?: string;
  valuePath?: string;
  statePath?: string;
  debounceMs?: number;
}

export interface GenericComponentConfig extends DeviceConfig {
  componentClass: string;
  componentKind?: GenericComponentKind;
  commandMethods?: string[];
  events?: ComponentEventConfig[];
  primaryValuePath?: string;
  initialState?: Record<string, unknown>;
}
