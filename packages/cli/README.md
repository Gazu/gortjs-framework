# @gortjs/cli

`@gortjs/cli` is the official command-line entry point for common GortJS operational tasks.

Documented for release `0.7.0`.

## Commands

- `gortjs validate <configPath>`
- `gortjs start <configPath>`
- `gortjs inspect <url> [--token=TOKEN] [--path=/status]`
- `gortjs plugins <configPath>`
- `gortjs cluster <url> [--token=TOKEN]`

## Example

```bash
gortjs validate apps/basic-app/config/iot.config.json
gortjs start apps/basic-app/config/iot.config.json
gortjs inspect http://127.0.0.1:3000 --path=/runtime
gortjs cluster http://127.0.0.1:3000
```
