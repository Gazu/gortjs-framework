# @gortjs/cli

`@gortjs/cli` is the official command-line entry point for common GortJS operational tasks.

Documented for release `0.8.0`.

## Commands

- `gortjs validate <configPath>`
- `gortjs start <configPath>`
- `gortjs inspect <url> [--token=TOKEN] [--path=/status]`
- `gortjs dashboard <url> [--token=TOKEN]`
- `gortjs plugins <configPath>`
- `gortjs cluster <url> [--token=TOKEN]`
- `gortjs templates`
- `gortjs create <targetDir> [--template=...]`
- `gortjs scaffold <plugin|driver|device> <targetDir> --name=name`
- `gortjs compat`

## Example

```bash
gortjs validate apps/basic-app/config/iot.config.json
gortjs start apps/basic-app/config/iot.config.json
gortjs inspect http://127.0.0.1:3000 --path=/runtime
gortjs dashboard http://127.0.0.1:3000
gortjs cluster http://127.0.0.1:3000
gortjs create ./sandbox/demo --template=workflows --name=demo
gortjs scaffold plugin ./sandbox/demo/src/plugins --name=my-plugin
```
