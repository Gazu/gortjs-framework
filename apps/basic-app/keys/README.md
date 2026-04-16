# Auth Test Assets

- `static-token.txt`: bearer token for `iot.config.static-auth.json`
- `jwt-private.pem`: private key used to generate the JWT test token
- `jwt-public.pem`: public key referenced by JWT auth config
- `jwt-token.txt`: bearer token for `iot.config.jwt-auth.json`

Example:

```bash
GORT_CONFIG_PATH=apps/basic-app/config/iot.config.jwt-auth.json npm start
TOKEN=$(cat apps/basic-app/keys/jwt-token.txt)
curl http://127.0.0.1:3000/status -H "Authorization: Bearer $TOKEN"
npx wscat -c "ws://127.0.0.1:3000/ws?token=$TOKEN"
```
