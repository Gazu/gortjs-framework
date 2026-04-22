# Guide: From Mock to Hardware

One of the main adoption paths for GortJS is to start with `mock` and move to real hardware later.

## Start with mock

Use either the `minimal` or `workflows` template:

```bash
npm run cli -- create ./sandbox/demo --template=minimal --name=demo
```

Mock gives you:

- deterministic local testing
- no board dependency during early development
- fast feedback through REST, WebSocket, and the inspector

## Move to Johnny-Five later

When you are ready:

1. Keep your device IDs, rules, and workflows stable.
2. Switch `runtime.driver` from `mock` to `johnny-five`.
3. Adjust board configuration under `runtime.board`.
4. Validate the config again before starting.

## When to use a custom driver

Generate a custom driver scaffold if:

- your board needs a different transport or protocol
- you want to adapt vendor SDKs behind the GortJS device model
- you need richer component creation than the built-in drivers expose

```bash
npm run cli -- scaffold driver ./src/drivers --name=modbus
```
