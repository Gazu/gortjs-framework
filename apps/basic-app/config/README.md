# basic-app cluster configs

Local cluster example files for `0.8.0`:

- `iot.config.cluster.control-plane.json`: control plane on `127.0.0.1:4000`
- `iot.config.cluster.edge.json`: edge node on `127.0.0.1:3000` that registers into the control plane
- `iot.config.cluster.edge-2.json`: second edge node on `127.0.0.1:3002` that also registers into the same control plane

Suggested local startup:

```bash
GORT_CONFIG_PATH=apps/basic-app/config/iot.config.cluster.control-plane.json npm start
```

In another terminal:

```bash
GORT_CONFIG_PATH=apps/basic-app/config/iot.config.cluster.edge.json npm start
```

In a third terminal:

```bash
GORT_CONFIG_PATH=apps/basic-app/config/iot.config.cluster.edge-2.json npm start
```

Useful checks:

```bash
curl http://127.0.0.1:4000/cluster
curl http://127.0.0.1:4000/cluster/nodes
curl -X POST http://127.0.0.1:4000/devices/led1/commands \
  -H 'Content-Type: application/json' \
  -d '{"command":"on"}'
curl -X POST http://127.0.0.1:4000/devices/led2/commands \
  -H 'Content-Type: application/json' \
  -d '{"command":"on"}'
```
