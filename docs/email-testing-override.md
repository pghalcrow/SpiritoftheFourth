# Email Testing Override

Temporary testing recipient:

```text
pghalcrow@gmail.com
```

The deployed mail-capable Lambdas use `EMAIL_OVERRIDE_TO` to redirect outbound email during testing. Existing form recipient addresses and order recipient environment variables are preserved in source and Lambda configuration.

Functions currently using the override:

```text
sotf_mailer
dev_sotf_mailer
create_order
dev_create_order
```

To restore live delivery, remove `EMAIL_OVERRIDE_TO` from each function's environment variables. Keep every other environment variable unchanged.

Example rollback flow:

```bash
for fn in sotf_mailer dev_sotf_mailer create_order dev_create_order; do
  aws lambda get-function-configuration \
    --function-name "$fn" \
    --region us-west-2 \
    --query 'Environment.Variables' \
    --output json > "/tmp/${fn}-env.json"

  python3 - "$fn" <<'PY'
import json
import sys
from pathlib import Path

fn = sys.argv[1]
path = Path(f"/tmp/{fn}-env.json")
env = json.loads(path.read_text())
env.pop("EMAIL_OVERRIDE_TO", None)
path.write_text(json.dumps({"Variables": env}, separators=(",", ":")))
PY

  aws lambda update-function-configuration \
    --function-name "$fn" \
    --region us-west-2 \
    --environment "file:///tmp/${fn}-env.json"

  aws lambda wait function-updated \
    --function-name "$fn" \
    --region us-west-2
done
```
