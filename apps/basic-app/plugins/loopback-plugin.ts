import { MockDriver, createPluginManifest, defineDriverFactory, definePlugin } from '@gortjs/core';
import { LedDevice } from '@gortjs/devices';

class LoopbackDriver extends MockDriver {
  readonly name = 'loopback';
}

const loopbackPlugin = definePlugin({
  manifest: createPluginManifest({
    name: 'loopback-plugin',
    version: '0.9.0',
    apiVersion: '0.9',
    description: 'Adds a loopback driver and a virtual LED device type for local runtime demos.',
    keywords: ['demo', 'loopback', 'mock', 'plugin'],
    capabilities: {
      drivers: [
        {
          id: 'loopback',
          driverName: 'loopback',
          description: 'A mock-backed driver that can be selected from config.',
        },
      ],
      deviceTypes: [
        {
          id: 'virtual-led',
          description: 'A virtual LED device type registered by the loopback plugin.',
        },
      ],
      actions: [
        {
          id: 'device:virtual-led:toggle',
          description: 'Use regular LED commands against the plugin-provided virtual LED type.',
        },
      ],
      workflows: [
        {
          id: 'plugin-heartbeat',
          description: 'Can be used by scheduled workflows in the demo configuration.',
        },
      ],
    },
  }),
  register(api) {
    api.registerDriver('loopback', defineDriverFactory(() => new LoopbackDriver()));
    api.registerDeviceType('virtual-led', LedDevice);
  },
  healthCheck() {
    return {
      ok: true,
      message: 'loopback plugin ready',
    };
  },
});

export default loopbackPlugin;
