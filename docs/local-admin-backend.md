# Local Admin Backend Validation

Run the local backend without deploying AWS Lambdas.

## Setup

```bash
python3 -m venv backend/.venv
source backend/.venv/bin/activate
pip install -r backend/requirements-dev.txt
```

For local admin login, set:

```bash
export ADMIN_PASSWORD=admin
```

For local Stripe checkout, use the test secret key that matches `environment.local.ts`:

```bash
export STRIPE_API_KEY="$(aws lambda get-function-configuration \
  --region us-west-2 \
  --function-name dev_create_order \
  --query 'Environment.Variables.STRIPE_API_KEY' \
  --output text)"
export PDFSHIFTAPIKEY="$(aws lambda get-function-configuration \
  --region us-west-2 \
  --function-name dev_create_order \
  --query 'Environment.Variables.PDFSHIFTAPIKEY' \
  --output text)"
export RETURN_URL=http://localhost:4200
```

To also append test rows to a Google Sheet, use a non-production sheet and set:

```bash
export LOCAL_WRITE_GOOGLE_SHEET=true
export GOOGLE_SHEET_CREDENTIALS=/absolute/path/to/creds-sa.json
export GOOGLE_SHEET_NAME="Forms Submissions Local"
export GOOGLE_SHEET_WORKSHEET="Sheet1"
```

If `LOCAL_WRITE_GOOGLE_SHEET` is unset, local test submissions only write to `backend/.local/submissions.json`.

## Run

Terminal 1:

```bash
source backend/.venv/bin/activate
python3 backend/local_server.py
```

Terminal 2:

```bash
npm run start:local
```

Open `http://localhost:4200/admin` and log in with `ADMIN_PASSWORD`.

## Seed A Submission

```bash
curl -s -X POST http://localhost:5001/local/test-submission \
  -H 'Content-Type: application/json' \
  -d '{"submissionId":"local-1","submissionTitle":"Volunteer Request","name":"Pat","email":"pat@example.com","phone":"555-1212"}' \
  | python3 -m json.tool
```

Refresh the admin Submissions section. Edit status, assigned to, and notes, then save. The local DB is `backend/.local/submissions.json`.
