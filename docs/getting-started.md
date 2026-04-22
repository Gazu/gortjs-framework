# Getting Started with GortJS 0.8.0

GortJS `0.8.0` focuses on developer experience and adoption. The quickest way to start is through the official CLI.

## 1. Install dependencies

```bash
npm install
npm run build
```

## 2. Explore the official templates

```bash
npm run cli -- templates
```

Templates available in `0.8.0`:

- `minimal`: smallest runnable runtime with REST and WebSocket
- `auth`: env-backed auth and secure API defaults
- `workflows`: scheduled workflows and rule examples
- `mock-drivers`: custom driver plugin scaffold based on the mock runtime
- `production`: control-plane and edge-oriented topology with Redis persistence and stronger runtime defaults

## 3. Create a new project

```bash
npm run cli -- create ./sandbox/my-gort-app --template=minimal --name=my-gort-app
cd sandbox/my-gort-app
npm install
npm run validate
npm run dev
```

## 4. Open the runtime inspector

Once the runtime is running:

```bash
npm run cli -- dashboard http://127.0.0.1:3000
```

That command returns the inspector URL. Open it in a browser to visualize:

- devices and their live state
- workflows and scheduled jobs
- recent events
- plugin catalog and compatibility status
- cluster summary and operational metrics

## 5. Generate extensions

Use the official scaffolds when you need to extend the framework:

```bash
npm run cli -- scaffold plugin ./src/plugins --name=my-demo-plugin
npm run cli -- scaffold driver ./src/drivers --name=modbus
npm run cli -- scaffold device ./src/devices --name=air-quality
```

## 6. Check compatibility

```bash
npm run cli -- compat
```

This prints:

- framework version
- expected plugin API version
- supported plugin API versions
- package version alignment across the monorepo

## Recommended next reads

- [Cookbook](./cookbook.md)
- [Distributed runtime guide](./guides/distributed-runtime.md)
- [Mock to hardware guide](./guides/mock-to-hardware.md)
- [Migration from 0.7.0 to 0.8.0](./migration-guides/0.7-to-0.8.md)
