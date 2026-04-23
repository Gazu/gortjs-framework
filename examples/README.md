# Examples

GortJS `0.9.0` ships its adoption story through the CLI rather than through a large number of baked monorepo apps.

Recommended entry points:

- `gortjs create <dir> --template=minimal`
- `gortjs create <dir> --template=auth`
- `gortjs create <dir> --template=workflows`
- `gortjs create <dir> --template=mock-drivers`
- `gortjs create <dir> --template=production`

The `production` template is the closest starting point to a real multi-node deployment because it includes:

- control-plane and edge-node configs
- env-backed auth and cluster token resolution
- Redis persistence
- distributed runtime settings
- stronger WebSocket defaults
