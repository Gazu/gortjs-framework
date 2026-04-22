# Basic App Plugins

This folder contains local plugin examples for `basic-app`.

## Loopback Plugin

`loopback-plugin.ts` registers:

- a `loopback` driver backed by the mock runtime
- a `virtual-led` device type backed by `LedDevice`
- a `0.8` plugin manifest using the new SDK helpers

## Try it

```bash
GORT_CONFIG_PATH=apps/basic-app/config/iot.config.plugin.json npm start
curl http://127.0.0.1:3000/plugins
curl http://127.0.0.1:3000/runtime
curl -X POST http://127.0.0.1:3000/devices/plugin-led/commands \
  -H 'Content-Type: application/json' \
  -d '{"command":"toggle"}'
```
