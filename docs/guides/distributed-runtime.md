# Guide: Distributed Runtime

Use GortJS `0.9.0` when you want a smoother path from local prototypes to connected runtimes with more production-ready health and diagnostics.

## Recommended local topology

- control plane on `127.0.0.1:4000`
- edge node on `127.0.0.1:3000`
- optional second edge node on `127.0.0.1:3002`

Existing example configs are available in:

- `apps/basic-app/config/iot.config.cluster.control-plane.json`
- `apps/basic-app/config/iot.config.cluster.edge.json`
- `apps/basic-app/config/iot.config.cluster.edge-2.json`

## Production-oriented starting point

Generate a production scaffold:

```bash
npm run cli -- create ./sandbox/edge-stack --template=production --name=edge-stack
```

Then:

```bash
cd sandbox/edge-stack
npm install
GORT_CLUSTER_TOKEN=cluster-secret GORT_API_TOKEN=api-secret npm run start:control-plane
GORT_CLUSTER_TOKEN=cluster-secret GORT_API_TOKEN=api-secret npm run start:edge
```

## Inspect the topology

- runtime JSON: `GET /runtime`
- cluster state: `GET /cluster`
- node inventory: `GET /cluster/nodes`
- browser inspector: `GET /inspector`
- runtime logs: `GET /logs`
- audit trail: `GET /audit`
- readiness probe: `GET /health/ready`

## Operational notes

- Prefer `127.0.0.1` over `localhost` in local setups.
- If the control plane is unavailable, nodes should now degrade instead of crashing.
- MQTT remains contract-ready, but Redis and webhook are the implemented event adapters in this build.
