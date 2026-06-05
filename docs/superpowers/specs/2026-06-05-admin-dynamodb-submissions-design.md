# Admin DynamoDB Submissions Backend Design

## Goal

Replace the current Google Sheet submission tracking with a DynamoDB-backed admin backend. DynamoDB will become the system of record for visible admin submissions and the hidden payment workflow records that currently live in Google Sheet tabs.

The admin side of the website should retain the familiar spreadsheet feel of the existing Google Sheet while adding lightweight editable admin fields.

## Current State

The site currently writes to the Google spreadsheet named `Forms Submissions`.

Observed worksheets:

- `Sheet1`: legacy/general form rows with `Form`, `SubmittedDate`, `Name`, `Email`, `Phone`.
- `Event Submissions`: final event/vendor/payment rows with `Submissions`, `Date`, `Name`, `Email`, `Phone`.
- `Event Hold`: hidden payment/session payloads keyed by `submission_id`.
- `Processed Submissions`: hidden idempotency records used to avoid duplicate email/sheet processing.
- `Golf Event` and `Golf Event Hold`: older event-specific rows that should be imported as historical data.

The production Lambda source currently used for email/payment processing is present locally under `aws-export/`, which is ignored by git because it includes deployment artifacts, credentials, logs, zip content, and vendored dependencies. New backend source should be created in tracked project files and deployed from there.

## Recommended Architecture

Use structured DynamoDB records instead of mirroring raw Google Sheet rows one-for-one.

Create DynamoDB storage for these record types:

- `submission`: admin-visible form/payment submission records.
- `payment_hold`: hidden temporary payloads used before Stripe or PayPal payment completion.
- `processed_payment`: hidden idempotency records used by webhooks and payment capture paths.

The admin UI will show only `submission` records. `payment_hold` and `processed_payment` records are backend infrastructure and should not appear in the admin table.

## Data Model

Use one DynamoDB table for the first version, with a typed single-table design.

Recommended table name:

- Production: `sotf-submissions`
- Development/testing: `sotf-submissions-dev`

Recommended key shape:

- `pk`: record grouping key.
- `sk`: sortable record key.
- `recordType`: `submission`, `payment_hold`, or `processed_payment`.

Submission records:

- `pk`: `SUBMISSION`
- `sk`: ISO timestamp plus submission id, for example `2026-06-05T15:30:00Z#abc123`.
- `submissionId`
- `source`: original source such as `Sheet1`, `Event Submissions`, `vendor`, `event`, `contact`, or `payment`.
- `submissionTitle`: the visible sheet-style submission/form/order name.
- `submittedAt`
- `name`
- `email`
- `phone`
- `paymentStatus`: `none`, `pending`, `paid`, `failed`, or `unknown`.
- `paymentProvider`: `stripe`, `paypal`, `check`, `none`, or `unknown`.
- `amount`
- `currency`
- `rawData`: original submitted payload or imported row data.
- `status`: editable admin status.
- `assignedTo`: editable admin owner.
- `notes`: editable admin notes.
- `createdAt`
- `updatedAt`
- `updatedBy`

Payment hold records:

- `pk`: `PAYMENT_HOLD`
- `sk`: `submissionId`
- `submissionId`
- `payload`
- `createdAt`
- `expiresAt` for automatic cleanup where appropriate.

Processed payment records:

- `pk`: `PROCESSED_PAYMENT`
- `sk`: `submissionId`
- `submissionId`
- `provider`
- `providerSessionId`
- `processedAt`

This keeps the admin-facing data simple while preserving the exact workflow safeguards the payment system needs.

## Backend Components

Create tracked backend source outside `aws-export/`.

Recommended structure:

- `backend/lambdas/create_order/`
- `backend/lambdas/sotf_mailer/`
- `backend/lambdas/events_service/`
- `backend/shared/submissions_repository.py`
- `backend/scripts/import_google_sheet.py`
- `backend/scripts/deploy_lambdas.sh`

The shared repository module will provide:

- `create_submission(record)`
- `save_payment_hold(submission_id, payload)`
- `get_payment_hold(submission_id)`
- `mark_processed_payment(submission_id, provider, metadata)`
- `is_processed_payment(submission_id)`
- `list_submissions(filters, pagination)`
- `update_submission_admin_fields(submission_id, status, assigned_to, notes, updated_by)`

Existing Google Sheet calls in `create_order` and `sotf_mailer` will be replaced with calls to this repository.

## Admin API

Extend the existing `events_service` admin backend used by `/admin` with these endpoints:

- `GET /admin/submissions`: list submissions with pagination, search, status filter, source filter, date range, and sort.
- `GET /admin/submissions/{submissionId}`: return one submission with full raw payload.
- `PATCH /admin/submissions/{submissionId}`: update `status`, `assignedTo`, and `notes`.

The existing admin login/token flow can be reused for the first version. The new endpoints must require the same admin authorization used for event CMS edits.

## Admin UI

Keep the current `/admin` route and add a top-level admin section switcher:

- `Events`
- `Submissions`

The `Events` section continues to behave as it does now.

The `Submissions` section should look and feel like a spreadsheet:

- Dense table layout.
- Sticky or clearly persistent column headers.
- Columns: `Submission`, `Date`, `Name`, `Email`, `Phone`, `Payment`, `Status`, `Assigned To`, `Notes`.
- Search by name, email, phone, submission title, and notes.
- Filters for status, source/type, payment status, and date range.
- Sort by date, submission title, name, status, or payment status.
- Row click opens a detail panel or modal with the full raw submission data.
- Status, assigned-to, and notes can be edited from the row detail view.

Status values for the first version:

- `New`
- `In Review`
- `Follow Up`
- `Complete`
- `Archived`

Imported records should default to `New` unless a better status is known from existing data.

## Import Plan

The import script will read the existing Google spreadsheet using the existing service account credentials available to the Lambda environment.

It will import:

- `Sheet1` rows as historical `submission` records.
- `Event Submissions` rows as historical `submission` records.
- `Golf Event` rows as historical `submission` records.
- `Event Hold` rows as historical `payment_hold` records.
- `Golf Event Hold` rows as historical `payment_hold` records.
- `Processed Submissions` rows as historical `processed_payment` records.

The import should be idempotent. Re-running it should not duplicate records. Imported records should include enough source metadata to trace them back to the original worksheet and row number.

## Data Flow

Contact/vendor/email-only submissions:

1. Public form submits to the existing mailer path.
2. Lambda sends the required customer/admin emails through SES.
3. Lambda creates a `submission` record in DynamoDB.

Stripe submissions:

1. Public form creates a checkout session.
2. Lambda saves a `payment_hold` record in DynamoDB.
3. Stripe webhook confirms successful payment.
4. Lambda checks `processed_payment`.
5. If not processed, Lambda sends emails, creates a `submission` record, and creates a `processed_payment` record.

PayPal submissions:

1. Public form creates a PayPal order.
2. Lambda saves a `payment_hold` record in DynamoDB.
3. Frontend capture or PayPal webhook confirms successful payment.
4. Lambda checks `processed_payment`.
5. If not processed, Lambda sends emails, creates a `submission` record, and creates a `processed_payment` record.

Admin review:

1. Admin logs in at `/admin`.
2. Admin opens `Submissions`.
3. UI calls admin submissions endpoints.
4. Admin views rows, opens details, and edits `status`, `assignedTo`, or `notes`.
5. API writes only the admin fields back to DynamoDB, leaving original submitted data unchanged.

## Error Handling

Payment processing should continue to avoid duplicate emails and duplicate submissions.

If DynamoDB write fails after a successful payment:

- Log the failure with submission id and provider metadata.
- Do not send emails until the idempotency record can be created.
- Return an error to the payment provider webhook when DynamoDB cannot record the processed payment, so the provider can retry.
- Preserve enough payment/session metadata in logs to recover manually.

If email sending fails:

- Keep the existing behavior where practical.
- Record the submission with an email status field if the failure occurs after the submission is known.

If Google Sheet import fails:

- The script should stop with a clear worksheet and row identifier.
- Previously imported rows should remain valid.
- Re-running the script should resume without duplicating rows.

## Testing

Backend tests should cover:

- Repository create/list/update behavior.
- Idempotent payment processing.
- Payment hold save and lookup.
- Import row mapping for each worksheet type.
- Admin endpoint authorization and patch validation.

Frontend tests should cover:

- Admin section switching between `Events` and `Submissions`.
- Loading and rendering submission rows.
- Filtering/search interactions.
- Opening detail view.
- Updating status, assigned-to, and notes.

Manual verification should cover:

- Volunteer/contact form email path creates a DynamoDB submission.
- Vendor without payment creates a DynamoDB submission.
- Stripe payment success sends emails, creates one submission, and creates one processed marker.
- PayPal payment success path is verified as strongly as practical and creates the same records.
- Imported Google Sheet rows appear in the admin table.

## Deployment

Create DynamoDB tables in AWS before deploying Lambda changes.

Production Lambdas should use:

- `SUBMISSIONS_TABLE=sotf-submissions`

Development Lambdas should use:

- `SUBMISSIONS_TABLE=sotf-submissions-dev`

Lambda IAM roles need DynamoDB permissions for the relevant table:

- `dynamodb:PutItem`
- `dynamodb:GetItem`
- `dynamodb:UpdateItem`
- `dynamodb:Query`
- `dynamodb:Scan` only if the final implementation requires it for admin search/filtering

Deploy frontend changes after backend endpoints are live. The admin UI should degrade clearly if the submissions API is unavailable.

## Out of Scope For First Version

- Replacing the current admin login system with a full identity provider.
- Custom workflow screens per submission type.
- Bulk editing submissions.
- Deleting submissions from the admin UI.
- Exposing hidden payment hold or processed payment rows to admins.
- Removing the old Google Sheet until the DynamoDB path has been verified in production.
