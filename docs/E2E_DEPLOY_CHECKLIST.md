# End-to-End Deploy Checklist

Use this checklist before deploying changes to the live site. The goal is to prove that deployed configuration, credentials, form processing, payment processing, email delivery, Google Sheets, and admin database behavior all work together.

## Deployment Target

- [ ] Confirm the target environment: staging, dev, or production.
- [ ] Confirm the branch/commit being tested is the same code intended for deployment.
- [ ] Confirm no local-only test credentials or localhost URLs are configured for the live environment.
- [ ] Confirm the live deployment caveat: localhost is always test mode; live test mode is controlled by the Developer-only admin option.

## Required Automated Checks

- [ ] Run backend tests:
  ```bash
  backend/.venv/bin/python -m unittest discover backend/tests
  ```
- [ ] Run Angular tests:
  ```bash
  npx ng test --watch=false --browsers=ChromeHeadless
  ```
- [ ] Run the production build:
  ```bash
  npx ng build --configuration production
  ```
- [ ] Review warnings from the production build and confirm none are new blockers.

## Admin Auth And Roles

- [ ] Confirm Cognito environment variables are configured for the deployed backend:
  - `COGNITO_USER_POOL_ID`
  - `COGNITO_CLIENT_ID`
  - `COGNITO_CLIENT_SECRET` if the app client uses a secret
- [ ] Confirm Cognito groups exist:
  - `Developer`
  - `SuperAdmin`
  - `Admin`
  - `Viewer`
- [ ] Confirm Lambda has the required Cognito permissions.
- [ ] Create or verify one user per role.
- [ ] Confirm each role receives a setup/reset email.
- [ ] Confirm each role can set a password from the reset page.
- [ ] Confirm each role can log in.
- [ ] Confirm Viewer can view admin data but cannot create, edit, update, or delete.
- [ ] Confirm Admin can edit allowed admin data and can create Viewer accounts only.
- [ ] Confirm Admin cannot delete submissions.
- [ ] Confirm Super Admin can create allowed users and delete submissions.
- [ ] Confirm Developer can access the test mode control.
- [ ] Confirm unknown password-reset emails do not expose whether an account exists.

## Runtime Mode, Email, And Stripe Configuration

- [ ] In test mode, confirm all admin notification emails go only to `pghalcrow@gmail.com`.
- [ ] In test mode, confirm Stripe uses test credentials.
- [ ] With test mode disabled, confirm admin emails use the normal recipient lists.
- [ ] With test mode disabled, confirm Stripe uses production credentials.
- [ ] Confirm no test Stripe keys are present in production runtime configuration.
- [ ] Confirm no production Stripe keys are used in local-only test runs.

## Public Form Workflow Matrix

For each workflow below, confirm:

- [ ] User-facing submit/payment response is correct.
- [ ] Email is sent to the expected recipient list.
- [ ] Google Sheet receives exactly one correct row.
- [ ] Admin database receives exactly one correct record.
- [ ] Admin submissions list displays a readable form type/title.
- [ ] Admin details panel displays complete normalized details.

Workflows:

- [ ] Volunteer form.
- [ ] Vendor form without attachments, if allowed.
- [ ] Vendor form with attachments.
- [ ] Vendor card payment.
- [ ] Motor show pay by card.
- [ ] Motor show pay by check.
- [ ] Motor show pay by check confirmation email.
- [ ] Freedom Club donation by card.
- [ ] Freedom Club donation by PayPal, if enabled.
- [ ] Special event card payment.
- [ ] Special event PayPal payment, if enabled.
- [ ] Special event free signup, if configured.

## Payment-Specific Checks

- [ ] Stripe test card success completes post-payment processing.
- [ ] Stripe test card decline shows an appropriate failure path.
- [ ] Pay by check creates an unpaid admin record.
- [ ] Pay by check records are highlighted red until payment is marked received.
- [ ] Marking payment received updates the admin record and refreshes the list.
- [ ] Post-payment processing does not create duplicate Google Sheet rows.
- [ ] Post-payment processing does not create duplicate admin records.
- [ ] A payment success with downstream processing failure gives the correct support message.

## Admin Data Management

- [ ] Admin events load.
- [ ] Admin submissions load.
- [ ] User management loads for roles that should see it.
- [ ] Viewer cannot see or use mutation controls.
- [ ] Add event works for allowed roles.
- [ ] Save event changes works for allowed roles.
- [ ] Hide/show event works as expected on `/upcomingevents`.
- [ ] Delete submission works for Developer and Super Admin only.
- [ ] Delete submission gives loading feedback and success/failure feedback.
- [ ] Clicking outside a submission detail panel closes it.

## Upcoming Events

- [ ] Visible events show on `/upcomingevents`.
- [ ] Hidden events do not show.
- [ ] Event date is displayed.
- [ ] No-upcoming-events placeholder displays when appropriate.
- [ ] Deleted events do not continue to appear from stale local or deployed data.

## Google Sheets And Database

- [ ] Google Sheet target is correct for the environment.
- [ ] Service account credentials are present in the deployed Lambda package or runtime configuration.
- [ ] DynamoDB table name is correct for the environment.
- [ ] Timestamps are recorded in PDT/Pacific time.
- [ ] Submission titles are normalized:
  - `Freedom Club Donation`
  - `Motor Show Event`
  - Special event names do not end with `Order`
- [ ] Duplicate confirmation-only rows are not written to Google Sheets or admin submissions.

## Final Deployment Approval

- [ ] Record the commit hash being deployed.
- [ ] Record who performed the verification.
- [ ] Record the verification date and environment.
- [ ] Confirm all blockers are resolved.
- [ ] Confirm this checklist was reviewed immediately before deployment.

