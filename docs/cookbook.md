# GortJS Cookbook

## Create a secure local runtime

```bash
npm run cli -- create ./sandbox/secure-app --template=auth --name=secure-app
```

Then set `GORT_API_TOKEN` and run the app.

## Start a workflow-first demo

```bash
npm run cli -- create ./sandbox/automation-app --template=workflows --name=automation-app
```

This template includes:

- a scheduled workflow
- a rule triggered by device events
- a runtime that is safe to test locally with the mock driver

## Prototype a custom driver

```bash
npm run cli -- create ./sandbox/custom-driver-app --template=mock-drivers --name=custom-driver-app
```

The generated app includes a plugin module that registers a custom driver through the `0.8` plugin SDK helpers.

## Bootstrap a production-like topology

```bash
npm run cli -- create ./sandbox/edge-stack --template=production --name=edge-stack
```

The production template includes:

- a control-plane config
- an edge-node config
- env-backed auth and cluster secrets
- Redis persistence
- event adapters for Redis and webhook delivery

## Validate before booting

```bash
npm run cli -- validate apps/basic-app/config/iot.config.json
```

## Inspect runtime state without extra tooling

```bash
npm run cli -- dashboard http://127.0.0.1:3000
```

## Query cluster state

```bash
npm run cli -- cluster http://127.0.0.1:4000
```
