from datetime import datetime
from decimal import Decimal
import uuid
import re
from zoneinfo import ZoneInfo
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
import json
import requests
import stripe
import os
import boto3
import smtplib
import traceback
from OAuthClient import OAuthClient
from PayPalOrderService import PayPalOrderService
from StripeOrderService import StripeOrderService
from EmailSender import EmailSender
from backend.shared.submissions_mapping import map_live_submission
from backend.shared.submissions_repository import SubmissionsRepository
from backend.shared.runtime_mode import (
    LIVE_PUBLISHABLE_KEY_DEFAULT,
    TEST_PUBLISHABLE_KEY_DEFAULT,
    is_test_mode,
)
from backend.shared.time_utils import pacific_display_date, pacific_now_iso, pacific_sheet_timestamp

EVENTS_CACHE = None

def get_submissions_repository():
    return SubmissionsRepository()


def get_stripe_secret_key():
    if is_test_mode():
        if os.environ.get("LOCAL_TEST_MODE"):
            return os.environ.get("STRIPE_TEST_API_KEY") or os.environ["STRIPE_API_KEY"]
        return os.environ["STRIPE_TEST_API_KEY"]
    return os.environ["STRIPE_API_KEY"]


def get_stripe_webhook_secret():
    if is_test_mode():
        if os.environ.get("LOCAL_TEST_MODE"):
            return os.environ.get("STRIPE_TEST_WEBHOOK_SECRET") or os.environ["WEBHOOK_SECRET"]
        return os.environ["STRIPE_TEST_WEBHOOK_SECRET"]
    return os.environ["WEBHOOK_SECRET"]


def get_stripe_publishable_key():
    if is_test_mode():
        return os.environ.get("STRIPE_TEST_PUBLISHABLE_KEY", TEST_PUBLISHABLE_KEY_DEFAULT)
    return os.environ.get("STRIPE_PUBLISHABLE_KEY", LIVE_PUBLISHABLE_KEY_DEFAULT)


def attach_stripe_publishable_key(response):
    if response.get("statusCode") != 200:
        return response
    try:
        body = json.loads(response.get("body") or "{}")
    except json.JSONDecodeError:
        return response
    body["publishable_key"] = get_stripe_publishable_key()
    return {**response, "body": json.dumps(body)}


def get_worksheet(sheet_name):
    import gspread

    credentials_path = os.environ.get("GOOGLE_SHEET_CREDENTIALS", "creds-sa.json")
    spreadsheet_name = os.environ.get("GOOGLE_SHEET_NAME", "Forms Submissions")
    try:
        gc = gspread.service_account(credentials_path)
        spreadsheet = gc.open(spreadsheet_name)
        return spreadsheet.worksheet(sheet_name)
    except gspread.SpreadsheetNotFound:
        print(f"❌ Spreadsheet '{spreadsheet_name}' not found")
        raise
    except gspread.WorksheetNotFound:
        print(f"❌ Worksheet '{sheet_name}' not found")
        raise
    except Exception as e:
        print(f"❌ Failed to get worksheet '{sheet_name}': {e}")
        raise

def get_paypal_token(is_test):
    try:
        client_id = os.environ['CLIENT_ID']
        client_secret = os.environ['CLIENT_SECRET']
        oauth_client = OAuthClient(client_id, client_secret, is_test)
        token = oauth_client.get_access_token()
        print("retrieved token: "+token)
        return token
    except Exception as e:
        print(f"❌ Failed to retrieve PayPal token: {e}")
        raise

def parse_custom_data(purchase_unit):
    custom_id_str = purchase_unit.get("custom_id", "{}")
    try:
        return json.loads(custom_id_str)
    except json.JSONDecodeError:
        return {}

def get_buyer_info(payer):
    return {
        "email": payer["email_address"],
        "first_name": payer["name"]["given_name"],
        "last_name": payer["name"]["surname"],
        "full_name": f"{payer['name']['given_name']} {payer['name']['surname']}"
    }

def get_form_data(custom_data):
    submission_id = custom_data.get("submission_id")
    submission_payload = lookup_dynamic_submission(submission_id) if submission_id else {}
    return submission_payload.get("formData", custom_data)

def get_section_fields(event_config):
    """
    Returns a list of field names that should be included in the table
    based on the event config's 'sections' key.
    """
    section_fields = []

    for section in event_config.get("sections", []):
        # Regular fields
        if section["type"] == "fields":
            section_fields.extend(section.get("fields", []))

        # Groups (e.g., team members or repeated fields)
        elif section["type"] == "group":
            group_field_name = section.get("field")
            if group_field_name:
                section_fields.append(group_field_name)

    return section_fields

def get_contact_emails(event_meta, resa_email):
    configured = event_meta.get("contactEmails")
    if isinstance(configured, list):
        emails = [str(email).strip() for email in configured if str(email or "").strip()]
    else:
        legacy_email = str(event_meta.get("contactEmail") or "").strip()
        emails = [legacy_email] if legacy_email else []

    return emails or ([resa_email] if resa_email else [])

def get_event_seller_recipients(event_meta, resa_email):
    return {recipient for recipient in [resa_email, *event_meta.get("contact_emails", [])] if recipient}

def get_event_meta(event_type, event_config, form_data, resa_email):
    event_meta = event_config.get("eventMeta", {})
    if event_type == "freedomClubDonation" and form_data.get("toContact"):
        contact_emails = [
            email.strip()
            for email in str(form_data.get("toContact", "")).split(",")
            if email.strip()
        ]
    else:
        contact_emails = get_contact_emails(event_meta, resa_email)

    fallback_titles = {
        "freedomClubDonation": "Freedom Club Donation",
    }
    event_title = event_config.get("title") or form_data.get("eventTitle") or fallback_titles.get(event_type, event_type)
    return {
        "event_title": event_title,
        "date_of_event": event_meta.get("dateOfEvent", ""),
        "location_of_event": event_meta.get("location", ""),
        "end_blurb": event_meta.get("endBlurb", ""),
        "contact_email": ", ".join(contact_emails),
        "contact_emails": contact_emails,
        "additional_team_members": form_data.get("teamMembers", [])
    }

def build_participants_table(form_data):
    # Build a unified participants list
    participants = []

    # Always include main person
    participants.append(form_data)

    # Add team members if they exist
    if isinstance(form_data.get("teamMembers"), list):
        participants.extend(form_data.get("teamMembers"))

    # Determine fields (exclude teamMembers and empty values)
    main_fields = [
        k for k, v in form_data.items()
        if k != "teamMembers" and v not in (None, "")
    ]

    # Start table
    table_html = """
    <table style="width:100%;margin-top:20px;border-collapse:collapse;text-align:left">
        <tbody>
            <tr style="background-color:#f9f9f9">
    """

    # Headers
    for field in main_fields:
        table_html += f'<th style="padding:10px;border:1px solid #ddd;color:#333">{field}</th>'
    table_html += "</tr>"

    # Rows
    for participant in participants:
        table_html += "<tr style='background-color:#fff'>"
        for field in main_fields:
            value = participant.get(field, "")
            table_html += f'<td style="padding:10px;border:1px solid #ddd;color:#333">{value}</td>'
        table_html += "</tr>"

    table_html += "</tbody></table>"
    return table_html

def format_field_name(field):
    # Split camelCase or PascalCase into words
    words = re.sub(r'([a-z])([A-Z])', r'\1 \2', field)

    return words.title()

def build_motor_show_table(form_data):
    excluded = {
    "total",
    "additionalPlaques",
    "additionalSmall",
    "additionalMedium",
    "additionalLarge",
    "additionalXLarge",
    "additionalXXLarge",
    "additionalXXXLarge",
}

    fields = [
        k for k, v in form_data.items()
        if k not in excluded and v not in (None, "")
    ]

    html = """
    <div style="margin-top:20px;font-family:Arial,sans-serif">
        <div style="padding:12px;border:1px solid #ddd">
    """

    for field in fields:
        value = form_data.get(field, "")

        html += f"""
        <div style="margin-bottom:8px">
            <div style="font-size:12px;color:#666;text-transform:uppercase;letter-spacing:0.5px">
                {format_field_name(field)}
            </div>
            <div style="font-size:14px;color:#222;margin-top:2px">
                {value}
            </div>
        </div>
        <hr style="border:none;border-top:1px solid #eee;margin:8px 0"/>
        """

    html += """
        </div>
    </div>
    """

    return html


def build_item_row(name, quantity, value):
    return f"""
        <tr style="background-color: #fff;">
            <td style="padding: 10px; border: 1px solid #ddd; color: #333;">{name}</td>
            <td style="padding: 10px; border: 1px solid #ddd; color: #333;">{quantity}</td>
            <td style="padding: 10px; border: 1px solid #ddd; color: #333;">${value:.2f}</td>
        </tr>
    """


def _positive_int(value):
    try:
        return max(0, int(value or 0))
    except (TypeError, ValueError):
        return 0


def format_motor_show_add_ons(form_data):
    parts = []
    combo_size = form_data.get("comboSize")
    if combo_size:
        parts.append(f"T-Shirt & Plaque Bundle - {combo_size}")
    add_ons = [
        ("additionalPlaques", "Additional Plaque"),
        ("additionalSmall", "T-Shirt Small"),
        ("additionalMedium", "T-Shirt Medium"),
        ("additionalLarge", "T-Shirt Large"),
        ("additionalXLarge", "T-Shirt XL"),
        ("additionalXXLarge", "T-Shirt 2XL"),
        ("additionalXXXLarge", "T-Shirt 3XL"),
    ]
    for field, label in add_ons:
        qty = _positive_int(form_data.get(field))
        if qty:
            parts.append(f"{label} x{qty}")
    return ", ".join(parts)


def build_motor_show_items_html(form_data):
    rows = [build_item_row("Motor Show Entry", 1, 25)]

    combo_size = form_data.get("comboSize")
    if combo_size:
        rows.append(build_item_row(f"T-Shirt & Plaque Bundle - {combo_size}", 1, 35))

    add_ons = [
        ("additionalPlaques", "Additional Plaque", 5),
        ("additionalSmall", "Additional T-Shirt - Small", 24),
        ("additionalMedium", "Additional T-Shirt - Medium", 24),
        ("additionalLarge", "Additional T-Shirt - Large", 24),
        ("additionalXLarge", "Additional T-Shirt - XLarge", 24),
        ("additionalXXLarge", "Additional T-Shirt - XXLarge", 26),
        ("additionalXXXLarge", "Additional T-Shirt - XXXLarge", 26),
    ]

    for field, label, unit_price in add_ons:
        quantity = _positive_int(form_data.get(field))
        if quantity:
            rows.append(build_item_row(label, quantity, unit_price * quantity))

    return "".join(rows)


def build_email_context(event_title, order_id, event_meta, buyer_info, items_html, form_fields_html, participants_table_rows, total_price, purchased_date):
    return {
        "event": event_title,
        "order_id": order_id,
        "date_of_event": event_meta["date_of_event"],
        "location_of_event": event_meta["location_of_event"],
        "end_blurb": event_meta["end_blurb"],
        "contact_email": event_meta["contact_email"],
        "buyers_first_name": buyer_info["first_name"],
        "buyers_last_name": buyer_info["last_name"],
        "buyers_email": buyer_info["email"],
        "items_html": items_html,
        "total_price": total_price,
        "purchased_date": purchased_date,
        "form_fields_html": form_fields_html,
        "participants_table_rows": participants_table_rows,
        "participants": len(event_meta["additional_team_members"]) + 1,
    }

def send_order_emails(email_sender, buyers_body, sellers_body, buyers_email, seller_recipients, subject, mail_from):
    email_sender.send_email(body=buyers_body, subject=subject, mail_to=buyers_email, mail_from=mail_from)
    for recipient in seller_recipients:
        if recipient:
            email_sender.send_email(body=sellers_body, subject=subject, mail_to=recipient, mail_from=mail_from)

def build_vendor_email_contexts(form_data, purchased_date, total_price, buyer_full_name):
    vendor_type = form_data.get("vendorType", "")
    check_map = {
        "Non-Profit": "NON_PROFIT_CHECK",
        "Information Only": "INFO_ONLY_CHECK",
        "Non-Food Sales": "NON_FOOD_CHECK",
        "Daytime Only": "DAYTIME_ONLY_CHECK",
        "Evening Only": "EVENING_ONLY_CHECK",
        "Daytime AND Evening": "BOTH_EVENTS_CHECK",
    }
    checks = {v: "" for v in check_map.values()}
    if vendor_type in check_map:
        checks[check_map[vendor_type]] = "✓"

    is_free = float(total_price) == 0
    buyer_context = {
        "buyers_full_name": buyer_full_name,
        "payment_warning": "<p style='color:#c00;font-weight:bold;'>No payment required for Non-Profit vendors.</p>" if is_free else "",
        "vendor_type": vendor_type,
        "price": "No Fee" if is_free else total_price,
    }
    seller_context = {
        "LOGO_SRC": "https://spiritofthefourth.org/assets/logo.png",
        "ORG_NAME": form_data.get("companyName", ""),
        "CONTACT_NAME": form_data.get("contactName", ""),
        "ADDRESS": form_data.get("streetAddress", ""),
        "CITY": form_data.get("city", ""),
        "STATE": form_data.get("state", ""),
        "ZIP": form_data.get("zipcode", ""),
        "PHONE": form_data.get("phone", ""),
        "EMAIL": form_data.get("email", ""),
        "PRODUCT_DESCRIPTION": form_data.get("description", ""),
        "SPECIAL_REQUESTS": form_data.get("specialRequests", ""),
        "SIGNER_NAME": form_data.get("signatureName", ""),
        "DATE": purchased_date,
        **checks,
    }
    return buyer_context, seller_context

def generate_vendor_form_pdf(seller_ctx, s3_folder=None):
    """Render the vendor form HTML, convert to PDF via PDFShift, and upload to S3.
    Returns the S3 folder key containing the PDF (and any existing customer uploads)."""
    email_sender = EmailSender()
    rendered_html = email_sender.format_email("emails/vender__application_form.html", seller_ctx)

    pdf_shift_api_key = os.environ.get("PDFSHIFTAPIKEY", "")
    response = requests.post(
        "https://api.pdfshift.io/v3/convert/pdf",
        auth=("api", pdf_shift_api_key),
        json={"source": rendered_html, "landscape": False, "use_print": True}
    )
    if response.status_code != 200:
        raise Exception(f"PDFShift error: {response.text}")

    if not s3_folder:
        s3_folder = uuid.uuid4().hex

    s3 = boto3.client("s3")
    bucket_name = os.environ.get("S3_ATTACHMENT_BUCKET", "sotf-file-upload")
    pdf_key = f"{s3_folder}/vendor_form.pdf"
    s3.put_object(Bucket=bucket_name, Key=pdf_key, Body=response.content)
    print(f"✅ Vendor form PDF uploaded to s3://{bucket_name}/{pdf_key}")

    return s3_folder

def send_vendor_emails_direct(form_data, submission_id):
    """Handle vendor applications that skip PayPal (e.g. Non-Profit with no fee)."""
    email_sender = EmailSender()
    resa_email = os.environ.get("RESA_EMAIL")
    sotf_representative = os.environ.get("PO_VENDOR_EMAIL", resa_email)

    purchased_date = pacific_display_date()
    buyer_full_name = form_data.get("contactName", "")
    buyer_email = form_data.get("email", "")

    buyer_ctx, seller_ctx = build_vendor_email_contexts(form_data, purchased_date, "0.00", buyer_full_name)

    buyers_body = email_sender.format_email("emails/vender__application_receipt.html", buyer_ctx)
    sellers_body = email_sender.format_email("emails/vender__application_form.html", seller_ctx)

    raw_attachments = form_data.get("attachments", "")
    existing_folder = raw_attachments if isinstance(raw_attachments, str) and len(raw_attachments) > 3 else None
    s3_attachments_key = generate_vendor_form_pdf(seller_ctx, s3_folder=existing_folder)

    storage_subject = "New Vendor Application Submission"
    email_subject = build_form_email_subject(
        storage_subject,
        form_data.get("companyName") or buyer_full_name,
        buyer_email,
    )
    email_sender.send_email(body=buyers_body, subject=email_subject, mail_to=buyer_email, mail_from=sotf_representative)

    seller_recipients = {resa_email, sotf_representative, form_data.get("toContact")}
    for recipient in seller_recipients:
        if recipient:
            if s3_attachments_key:
                email_sender.send_email_with_s3_attachments(body=sellers_body, subject=email_subject, mail_to=recipient, mail_from=sotf_representative, s3_folder_key=s3_attachments_key)
            else:
                email_sender.send_email(body=sellers_body, subject=email_subject, mail_to=recipient, mail_from=sotf_representative)

    update_google_sheet(
        form=storage_subject,
        name=buyer_full_name,
        email=buyer_email,
        phone=form_data.get("phone", ""),
        sheet_name="Event Submissions",
    )
    create_submission_record(
        form=storage_subject,
        name=buyer_full_name,
        email=buyer_email,
        phone=form_data.get("phone", ""),
        source="vendorApplication",
        raw_data={**form_data, "submission_id": submission_id},
        payment_status="none",
        payment_provider="none",
        amount=0,
        only_if_missing=True,
    )
    print("✅ Non-profit vendor emails sent and DynamoDB submission created")


def update_google_sheet(form, name, email, phone, sheet_name, add_ons=""):
    date = pacific_sheet_timestamp()
    worksheet = get_worksheet(sheet_name)
    worksheet.append_row([form, date, name, email, phone, add_ons])


def mark_google_processed_submission(submission_id):
    worksheet = get_worksheet("Processed Submissions")
    records = [row[0] for row in worksheet.get_all_values() if row]
    if submission_id in records:
        print(f"⚠️ Submission {submission_id} already processed in Google Sheet")
        return False

    worksheet.append_row([submission_id, pacific_sheet_timestamp()])
    print(f"✅ Submission {submission_id} marked as processed in Google Sheet")
    return True


def create_submission_record(
    form,
    name,
    email,
    phone,
    source,
    raw_data,
    payment_status="none",
    payment_provider="none",
    amount=None,
    only_if_missing=False,
    submitted_at=None,
):
    submission_id = raw_data.get("submission_id") or raw_data.get("submissionId") or uuid.uuid4().hex[:12]
    dynamodb_amount = Decimal(str(amount)) if amount is not None else None
    dynamodb_raw_data = to_dynamodb_safe(raw_data)
    record = map_live_submission(
        submission_id=submission_id,
        title=form,
        name=name,
        email=email,
        phone=phone,
        source=source,
        raw_data=dynamodb_raw_data,
        payment_status=payment_status,
        payment_provider=payment_provider,
        amount=dynamodb_amount,
        currency="USD",
        submitted_at=submitted_at,
    )
    repo = get_submissions_repository()
    if only_if_missing:
        created = repo.create_submission_if_missing(record)
        if not created:
            print(f"⚠️ DynamoDB submission {submission_id} already exists")
            return record
    else:
        repo.create_submission(record)
    print("✅ DynamoDB submission created")
    return record


def to_dynamodb_safe(value):
    if isinstance(value, float):
        return Decimal(str(value))
    if isinstance(value, list):
        return [to_dynamodb_safe(item) for item in value]
    if isinstance(value, dict):
        return {key: to_dynamodb_safe(item) for key, item in value.items()}
    return value

def build_dynamic_event_items(event):
    pricing = event.get("pricing", {})
    players = event.get("players", 1)
    add_ons = event.get("addOns", [])

    items = []

    # main entry line
    items.append({
        "name": event.get("eventTitle", "Event Entry"),
        "quantity": str(players),
        "category": "DONATION",
        "unit_amount": {
            "currency_code": "USD",
            "value": f"{float(pricing.get('pricePerPlayer', 0)):.2f}"
        }
    })

    # add-ons
    for addon in add_ons:
        items.append({
            "name": addon.get("field", "Add On"),
            "quantity": "1",
            "category": "DONATION",
            "unit_amount": {
                "currency_code": "USD",
                "value": f"{float(addon.get('price', 0)):.2f}"
            }
        })

    return items

def build_stripe_line_items(event):
    event_type = event.get("type", "")
    items = []

    if event_type == "motorShowOrder":
        total = float(event.get("total", 0)) or float(event.get("grandTotal", 0))
        if total > 0:
            items.append({
                "price_data": {
                    "currency": "usd",
                    "product_data": {"name": "Motor Show Entry"},
                    "unit_amount": int(total * 100)
                },
                "quantity": 1
            })
    elif event_type == "vendorApplication":
        grand_total = float(event.get("grandTotal", 0))
        vendor_type = event.get("vendorType", "Vendor")
        if grand_total > 0:
            items.append({
                "price_data": {
                    "currency": "usd",
                    "product_data": {"name": f"Vendor Booth Fee - {vendor_type}"},
                    "unit_amount": int(grand_total * 100)
                },
                "quantity": 1
            })
    elif event_type == "sponsor":
        amount = float(event.get("grandTotal", 100))
        items.append({
            "price_data": {
                "currency": "usd",
                "product_data": {"name": "T Sign Hole Sponsorship"},
                "unit_amount": int(amount * 100)
            },
            "quantity": 1
        })
    elif event_type == "freedomClubDonation":
        amount = float(event.get("grandTotal", 0))
        if amount > 0:
            items.append({
                "price_data": {
                    "currency": "usd",
                    "product_data": {"name": "Freedom Club Donation"},
                    "unit_amount": int(amount * 100)
                },
                "quantity": 1
            })
    else:
        pricing = event.get("pricing", {})
        players = int(event.get("players", 1))
        add_ons = event.get("addOns", [])
        price_per_player = float(pricing.get("pricePerPlayer", 0))
        event_title = event.get("eventTitle", "Event Entry")

        if price_per_player > 0 and players > 0:
            items.append({
                "price_data": {
                    "currency": "usd",
                    "product_data": {"name": event_title},
                    "unit_amount": int(price_per_player * 100)
                },
                "quantity": players
            })

        for addon in add_ons:
            addon_price = float(addon.get("price", 0))
            if addon_price > 0:
                items.append({
                    "price_data": {
                        "currency": "usd",
                        "product_data": {"name": addon.get("field", "Add On")},
                        "unit_amount": int(addon_price * 100)
                    },
                    "quantity": 1
                })

    return items


def get_form_full_name(form_data):
    explicit_name = form_data.get("fullName") or form_data.get("contactName") or form_data.get("name")
    if explicit_name:
        return str(explicit_name).strip()

    first_name = str(form_data.get("firstName") or "").strip()
    last_name = str(form_data.get("lastName") or "").strip()
    return " ".join(part for part in (first_name, last_name) if part)


def build_form_email_subject(form_title, name="", email=""):
    clean_title = str(form_title or "").strip()
    details = []
    clean_name = str(name or "").strip()
    clean_email = str(email or "").strip()
    if clean_name:
        details.append(f"Name: {clean_name}")
    if clean_email:
        details.append(f"Email: {clean_email}")
    return f"{clean_title} - {' | '.join(details)}" if details else clean_title


def get_stripe_buyer_info(session, form_data):
    customer_email = session.get("customer_email") or form_data.get("email", "")
    full_name = get_form_full_name(form_data) or customer_email
    name_parts = full_name.split() if full_name else []
    first_name = name_parts[0] if name_parts else "Customer"
    last_name = " ".join(name_parts[1:]) if len(name_parts) > 1 else ""
    return {
        "email": customer_email,
        "first_name": first_name,
        "last_name": last_name,
        "full_name": full_name
    }


def format_paypal_date(timestamp):
    if timestamp:
        for date_format in ("%Y-%m-%dT%H:%M:%S.%fZ", "%Y-%m-%dT%H:%M:%SZ"):
            try:
                parsed = datetime.strptime(timestamp, date_format).replace(tzinfo=ZoneInfo("UTC"))
                return parsed.astimezone(ZoneInfo("America/Los_Angeles")).strftime("%m/%d/%Y")
            except ValueError:
                pass
    return pacific_display_date()


def paypal_timestamp_to_iso(timestamp):
    if timestamp:
        for date_format in ("%Y-%m-%dT%H:%M:%S.%fZ", "%Y-%m-%dT%H:%M:%SZ"):
            try:
                return datetime.strptime(timestamp, date_format).replace(tzinfo=ZoneInfo("UTC")).astimezone(ZoneInfo("America/Los_Angeles")).isoformat(timespec="seconds")
            except ValueError:
                pass
    return None


def stripe_timestamp_to_iso(timestamp):
    if timestamp:
        return datetime.fromtimestamp(timestamp, tz=ZoneInfo("UTC")).astimezone(ZoneInfo("America/Los_Angeles")).isoformat(timespec="seconds")
    return None


def process_paypal_order_completion(resource, event_create_time=None):
    purchase_unit = resource["purchase_units"][0]
    order_id = resource["id"]
    custom_data = parse_custom_data(purchase_unit)
    submission_id = custom_data.get("submission_id") or order_id
    print("🔥 CUSTOM DATA:")
    print(custom_data)

    repo = get_submissions_repository()
    if not repo.claim_payment_processing(submission_id, "paypal", {"orderId": order_id}):
        print(f"⚠️ Submission {submission_id} already processed. Skipping emails.")
        return

    try:
        if not mark_google_processed_submission(submission_id):
            repo.release_payment_processing(submission_id)
            return

        order_type = custom_data.get("type", "dynamic_event")
        event_config = get_event_config(order_type)
        buyer_info = get_buyer_info(resource["payer"])
        form_data = get_form_data(custom_data)

        email_sender = EmailSender()
        resa_email = os.environ.get('RESA_EMAIL')

        event_meta = get_event_meta(order_type, event_config, form_data, resa_email)
        items = [item for item in purchase_unit.get("items", []) if int(item.get("quantity", 0)) > 0]
        items_html = email_sender.loop_through_items_2(items)
        allowed_fields = get_section_fields(event_config)
        filtered_form_data = {k: v for k, v in form_data.items() if k in allowed_fields}

        excluded_fields = {
            "action",
            "type",
            "eventTitle",
            "paymentMethod",
            "grandTotal",
            "pricing",
            "addOns",
            "players",
            "tSignHoleSponsor"
        }

        clean_form_data = {
            k: v for k, v in form_data.items()
            if k not in excluded_fields
        }

        form_fields_html = email_sender.build_form_fields_html(filtered_form_data)
        participants_table_rows = build_participants_table(clean_form_data)
        if order_type == "Motor Show Event":
            items_html = build_motor_show_items_html(form_data)
            participants_table_rows = build_motor_show_table(clean_form_data)

        purchased_date = format_paypal_date(event_create_time or resource.get("update_time") or resource.get("create_time"))
        submitted_at = paypal_timestamp_to_iso(event_create_time or resource.get("update_time") or resource.get("create_time"))
        total_price = purchase_unit["amount"]["value"]

        context = build_email_context(
            event_meta["event_title"], order_id, event_meta, buyer_info,
            items_html, form_fields_html, participants_table_rows, total_price, purchased_date
        )

        if order_type == "vendorApplication":
            buyer_ctx, seller_ctx = build_vendor_email_contexts(
                form_data, purchased_date, total_price, buyer_info["full_name"]
            )
            buyers_body = email_sender.format_email("emails/vender__application_receipt.html", buyer_ctx)
            sellers_body = email_sender.format_email("emails/vender__application_form.html", seller_ctx)
            sotf_representative = os.environ.get("PO_VENDOR_EMAIL", resa_email)
            seller_recipients = {resa_email, sotf_representative, form_data.get("toContact")}
            storage_subject = "New Vendor Application Submission"
            email_subject = build_form_email_subject(
                storage_subject,
                form_data.get("companyName") or get_form_full_name(form_data) or buyer_info["full_name"],
                form_data.get("email", buyer_info["email"]),
            )
            raw_attachments = form_data.get("attachments", "")
            existing_folder = raw_attachments if isinstance(raw_attachments, str) and len(raw_attachments) > 3 else None
            s3_attachments_key = generate_vendor_form_pdf(seller_ctx, s3_folder=existing_folder)
        else:
            customer_email_template = "emails/buyer__receipt.html"
            po_email_template = "emails/seller__po.html"

            buyers_body = email_sender.format_email(customer_email_template, context)
            sellers_body = email_sender.format_email(po_email_template, context)

            sotf_representative = os.environ.get(f"PO_{order_type.upper()}_EMAIL", resa_email)
            seller_recipients = get_event_seller_recipients(event_meta, resa_email)
            if order_type == "Motor Show Event":
                motor_show_email1 = os.environ.get("PO_MOTOR_SHOW_EMAIL_1")
                motor_show_email2 = os.environ.get("PO_MOTOR_SHOW_EMAIL_2")
                seller_recipients = {resa_email, motor_show_email1, motor_show_email2}
            storage_subject = f"{event_meta['event_title']} Order"
            email_subject = build_form_email_subject(
                storage_subject,
                get_form_full_name(form_data) or buyer_info["full_name"],
                form_data.get("email", buyer_info["email"]),
            )
            s3_attachments_key = None

        if submission_id:
            email_sender.send_email(body=buyers_body, subject=email_subject, mail_to=buyer_info["email"], mail_from=sotf_representative)
            for recipient in seller_recipients:
                if recipient:
                    if s3_attachments_key:
                        email_sender.send_email_with_s3_attachments(body=sellers_body, subject=email_subject, mail_to=recipient, mail_from=sotf_representative, s3_folder_key=s3_attachments_key)
                    else:
                        email_sender.send_email(body=sellers_body, subject=email_subject, mail_to=recipient, mail_from=sotf_representative)

            update_google_sheet(
                form=storage_subject,
                name=get_form_full_name(form_data) or buyer_info["full_name"],
                email=form_data.get("email", buyer_info["email"]),
                phone=form_data.get("phone", ""),
                sheet_name="Event Submissions",
                add_ons=format_motor_show_add_ons(form_data) if order_type == "Motor Show Event" else "",
            )
            create_submission_record(
                form=storage_subject,
                name=get_form_full_name(form_data) or buyer_info["full_name"],
                email=form_data.get("email", buyer_info["email"]),
                phone=form_data.get("phone", ''),
                source=order_type,
                raw_data={**form_data, "submission_id": submission_id, "paypal_order_id": order_id},
                payment_status="paid",
                payment_provider="paypal",
                amount=total_price,
                only_if_missing=True,
                submitted_at=submitted_at,
            )
            repo.complete_payment_processing(submission_id, "paypal", {"orderId": order_id})
            print("✅ PayPal order processed and DynamoDB submission created")
    except Exception:
        repo.release_payment_processing(submission_id)
        raise


def stripe_items_to_email_html(email_sender, stripe_service, session_id):
    try:
        line_items_response = stripe_service.list_line_items(session_id)
        items = []
        for item in line_items_response.get("data", []):
            unit_amount = item.get("price", {}).get("unit_amount", 0) / 100
            items.append({
                "name": item.get("description", "Item"),
                "quantity": str(item.get("quantity", 1)),
                "unit_amount": {"value": f"{unit_amount:.2f}"}
            })
        return email_sender.loop_through_items_2(items)
    except Exception as e:
        print(f"❌ Failed to build Stripe items HTML: {e}")
        return ""


def process_free_event_signup(form_data, submission_id=None):
    submission_id = submission_id or uuid.uuid4().hex[:12]
    event_type = form_data.get("type", "dynamic_event")
    resa_email = os.environ.get("RESA_EMAIL")
    event_config = get_event_config(event_type)
    event_meta = get_event_meta(event_type, event_config, form_data, resa_email)
    email_sender = EmailSender()

    full_name = get_form_full_name(form_data) or form_data.get("email", "Customer")
    name_parts = full_name.split()
    buyer_info = {
        "email": form_data.get("email", ""),
        "first_name": name_parts[0] if name_parts else "Customer",
        "last_name": " ".join(name_parts[1:]) if len(name_parts) > 1 else "",
        "full_name": full_name,
    }

    allowed_fields = get_section_fields(event_config)
    filtered_form_data = {k: v for k, v in form_data.items() if k in allowed_fields}
    excluded_fields = {
        "action", "type", "eventTitle", "paymentMethod", "grandTotal",
        "pricing", "addOns", "players", "tSignHoleSponsor"
    }
    clean_form_data = {k: v for k, v in form_data.items() if k not in excluded_fields}

    items_html = """
        <tr style="background-color: #fff;">
            <td style="padding: 10px; border: 1px solid #ddd; color: #333;">No payment required</td>
            <td style="padding: 10px; border: 1px solid #ddd; color: #333;">1</td>
            <td style="padding: 10px; border: 1px solid #ddd; color: #333;">$0.00</td>
        </tr>
    """
    form_fields_html = email_sender.build_form_fields_html(filtered_form_data)
    participants_table_rows = build_participants_table(clean_form_data)
    purchased_date = pacific_display_date()
    submitted_at = pacific_now_iso()

    context_data = build_email_context(
        event_meta["event_title"], submission_id, event_meta, buyer_info,
        items_html, form_fields_html, participants_table_rows, "0.00", purchased_date
    )

    buyers_body = email_sender.format_email("emails/buyer__receipt.html", context_data)
    sellers_body = email_sender.format_email("emails/seller__po.html", context_data)
    sotf_representative = os.environ.get(f"PO_{event_type.upper()}_EMAIL", resa_email)
    seller_recipients = get_event_seller_recipients(event_meta, resa_email)
    storage_subject = f"{event_meta['event_title']} Signup"
    email_subject = build_form_email_subject(storage_subject, full_name, form_data.get("email", ""))

    if buyer_info["email"]:
        email_sender.send_email(body=buyers_body, subject=email_subject, mail_to=buyer_info["email"], mail_from=sotf_representative)
    for recipient in seller_recipients:
        if recipient:
            email_sender.send_email(body=sellers_body, subject=email_subject, mail_to=recipient, mail_from=sotf_representative)

    update_google_sheet(
        form=storage_subject,
        name=full_name,
        email=form_data.get("email", ""),
        phone=form_data.get("phone", ""),
        sheet_name="Event Submissions",
    )
    create_submission_record(
        form=storage_subject,
        name=full_name,
        email=form_data.get("email", ""),
        phone=form_data.get("phone", ""),
        source=event_type,
        raw_data={**form_data, "submission_id": submission_id},
        payment_status="none",
        payment_provider="none",
        amount=0,
        submitted_at=submitted_at,
    )
    return {"status": "submitted", "submission_id": submission_id}


def store_dynamic_submission(event, submission_id):
    try:
        payload = {
            "type": event.get("type"),
            "eventTitle": event.get("title"),
            "formData": event
        }

        get_worksheet("Event Hold").append_row([
            submission_id,
            json.dumps(payload)
        ])
        get_submissions_repository().save_payment_hold(submission_id, payload)

        print("✅ dynamic submission stored in Google Sheet and DynamoDB")

    except Exception as e:
        print("❌ failed storing dynamic submission", e)
        raise

def lookup_dynamic_submission(submission_id):
    try:
        payload = get_submissions_repository().get_payment_hold(submission_id)
        if payload:
            return payload

        records = get_worksheet("Event Hold").get_all_records()
        for row in records:
            if row.get("submission_id") == submission_id:
                return json.loads(row.get("data"))

        print("⚠️ submission not found")
        return {}

    except Exception as e:
        print("❌ submission lookup failed", e)
        return {}

def load_events_config():
    global EVENTS_CACHE
    if EVENTS_CACHE:
        print (f"⚡️ {EVENTS_CACHE}")
        return EVENTS_CACHE

    try:
        s3 = boto3.client('s3')
        bucket = os.environ['EVENTS_BUCKET']
        key = "events.json"

        response = s3.get_object(Bucket=bucket, Key=key)
        data = response['Body'].read().decode('utf-8')

        EVENTS_CACHE = json.loads(data)
        print (f"⚡️ {EVENTS_CACHE}")
        return EVENTS_CACHE

    except Exception as e:
        print("❌ Failed to load events config:", e)
        return {}

def get_event_config(event_type):
    config = load_events_config()
    events = config.get("events", [])

    for event in events:
        if event.get("type") == event_type:
            return event

    return {}


def lambda_handler(event, context):
    print("in Now!")
    if 'body' in event:
        payload = event.get("body")
        headers = event.get("headers", {})
        sig_header = headers.get("Stripe-Signature") or headers.get("stripe-signature")
        try:
            event = json.loads(event['body'])
            print("event reduced to body content")
        except Exception as e:
            print("Payload is not JSON-parsable. Assuming raw body for webhook.")

    is_test = True

    try:
        print(event)
        environment = os.environ['ENVIRONMENT']
        if environment.lower() == 'prod':
            is_test = False
        is_order_complete_callback = False
        response_code = 400
        response_body = {}
        order_details = None

        if "action" in event and event["action"] == "processFreeEventSignup":
            response_code = 200
            response_body = process_free_event_signup(event)

        # 4005 5192 0000 0004
        # Paypal - json for creating a paypal session
        elif "action" in event and event['action'] == 'createOrder':
            print("🔥 CREATE ORDER EVENT:")
            print(json.dumps(event, indent=2))
            print("create order action received")
            token = get_paypal_token(is_test)
            return_url = os.environ['RETURN_URL']

            paypalOrderService = PayPalOrderService(token, is_test)
            if event.get('type') == 'motorShowOrder':
                submission_id = uuid.uuid4().hex[:12]

                order_details = paypalOrderService.create_order(
                    event['comboSize'],
                    event['additionalPlaques'],
                    event['additionalSmall'],
                    event['additionalMedium'],
                    event['additionalLarge'],
                    event['additionalXLarge'],
                    event['additionalXXLarge'],
                    event['additionalXXXLarge'],
                    return_url,
                    custom_id=json.dumps({"type": "Motor Show Event", "submission_id": submission_id}),
                    order_type="motor_show",
                )

                store_dynamic_submission(event, submission_id)

            elif event.get('pricing'):

                print("🔥 dynamic event order received")

                submission_id = uuid.uuid4().hex[:12]

                store_dynamic_submission(event, submission_id)

                items = build_dynamic_event_items(event)

                custom_id = json.dumps({
                    "type": event.get("type"),
                    "submission_id": submission_id
                })

                order_details = paypalOrderService.modular_create_order(
                    items,
                    return_url,
                    None,
                    None,
                    custom_id=custom_id,
                    order_type="dynamic_event"
                )

            elif event.get('type') == 'sponsor':

                print("🔥 sponsor order received")


                submission_id = uuid.uuid4().hex[:12]

                store_dynamic_submission(event, submission_id)

                amount = f"{float(event.get('grandTotal', 100)):.2f}"

                items = [
                    {
                        "name": "Sponsor Payment",
                        "quantity": "1",
                        "category": "DONATION",
                        "unit_amount": {
                            "currency_code": "USD",
                            "value": amount
                        }
                    }
                ]

                custom_id = json.dumps({
                    "type": "T Sign Sponsor (Only)",
                    "submission_id": submission_id
                })

                order_details = paypalOrderService.modular_create_order(
                    items,
                    return_url,
                    None,
                    None,
                    custom_id=custom_id,
                    order_type="dynamic_event"
                )

            elif event.get('type') == 'freedomClubDonation':

                print("🔥 freedom club donation received")

                submission_id = uuid.uuid4().hex[:12]

                store_dynamic_submission(event, submission_id)

                amount = f"{float(event.get('grandTotal', 0)):.2f}"

                items = [
                    {
                        "name": "Freedom Club Donation",
                        "quantity": "1",
                        "category": "DONATION",
                        "unit_amount": {
                            "currency_code": "USD",
                            "value": amount
                        }
                    }
                ]

                custom_id = json.dumps({
                    "type": "freedomClubDonation",
                    "submission_id": submission_id
                })

                order_details = paypalOrderService.modular_create_order(
                    items,
                    return_url,
                    None,
                    None,
                    custom_id=custom_id,
                    order_type="freedom_club_donation"
                )

            elif event.get('type') == 'vendorApplication':
                print("🔥 vendor application order received")

                submission_id = uuid.uuid4().hex[:12]
                store_dynamic_submission(event, submission_id)

                grand_total = float(event.get('grandTotal', 0))
                vendor_type = event.get('vendorType', 'Vendor')

                if grand_total == 0:
                    print("🆓 non-profit vendor — skipping PayPal")
                    send_vendor_emails_direct(event, submission_id)
                    response_code = 200
                    response_body = {"status": "submitted", "submission_id": submission_id}
                else:
                    amount = f"{grand_total:.2f}"
                    items = [
                        {
                            "name": f"Vendor Booth Fee - {vendor_type}",
                            "quantity": "1",
                            "category": "DONATION",
                            "unit_amount": {
                                "currency_code": "USD",
                                "value": amount
                            }
                        }
                    ]

                    custom_id = json.dumps({
                        "type": "vendorApplication",
                        "submission_id": submission_id
                    })

                    order_details = paypalOrderService.modular_create_order(
                        items,
                        return_url,
                        None,
                        None,
                        custom_id=custom_id,
                        order_type="vendor_application"
                    )

            if order_details is not None:
                response_code = 200
                response_body = order_details
            elif response_code != 200:
                response_code = 500
                response_body = {"error": "Failed to create PayPal order"}

        # Papal -
        elif "action" in event and event['action'] == 'captureOrder':
            order_id = event['orderId']
            ## add capture order api call to paypal order service class and provide order id
            print("capture order action received")

            token = get_paypal_token(is_test)

            paypalOrderService = PayPalOrderService(token, is_test)
            capture_order_details = paypalOrderService.capture_order(order_id)
            if capture_order_details.get("status") == "COMPLETED":
                process_paypal_order_completion(
                    capture_order_details,
                    capture_order_details.get("update_time") or capture_order_details.get("create_time")
                )
            response_code = 200
            response_body = capture_order_details

        # PayPal approval means the buyer approved the order, but the capture may not be complete yet.
        # The frontend captureOrder path and CHECKOUT.ORDER.COMPLETED webhook do the email/sheet work.
        elif event.get("event_type") == "CHECKOUT.ORDER.APPROVED":
            print("🔥 PAYPAL WEBHOOK EVENT:")
            print(json.dumps(event, indent=2))
            response_code = 200
            response_body = {"status": "approved"}

        elif event.get("event_type") == "CHECKOUT.ORDER.COMPLETED":
            print("🔥 PAYPAL COMPLETED WEBHOOK EVENT:")
            print(json.dumps(event, indent=2))
            process_paypal_order_completion(event["resource"], event.get("create_time"))
            response_code = 200
            response_body = {"status": "completed"}

        # Stripe - create checkout session (generic for any event type)
        elif "action" in event and event['action'] in ('createStripeSession', 'createStripeEmbeddedSession'):
            return_url = os.environ['RETURN_URL']
            stripe_api_key = get_stripe_secret_key()
            stripe_service = StripeOrderService(stripe_api_key)

            event_type = event.get('type', 'general_order')
            submission_id = uuid.uuid4().hex[:12]

            if event_type == 'vendorApplication' and float(event.get('grandTotal', 0)) == 0:
                send_vendor_emails_direct(event, submission_id)
                return {"statusCode": 200, "body": json.dumps({"status": "submitted", "submission_id": submission_id})}

            store_dynamic_submission(event, submission_id)

            line_items = build_stripe_line_items(event)
            if not line_items:
                return {"statusCode": 400, "body": json.dumps({"error": "No line items could be built from order data"})}

            customer_email = event.get('email', '')

            cancel_paths = {
                "vendorApplication": "/vendors",
                "motorShowOrder": "/wheelsoffreedom",
                "sponsor": "/upcomingevents",
                "freedomClubDonation": "/freedom-club"
            }
            cancel_path = cancel_paths.get(event_type, "/upcomingevents")

            # Match PayPal display names so webhook subject lines are identical
            display_type_map = {
                "sponsor": "T Sign Sponsor (Only)"
            }
            metadata_event_type = display_type_map.get(event_type, event_type)

            if event['action'] == 'createStripeEmbeddedSession':
                return attach_stripe_publishable_key(
                    stripe_service.create_embedded_checkout_session(
                        event_type=metadata_event_type,
                        submission_id=submission_id,
                        line_items=line_items,
                        customer_email=customer_email,
                        return_base_url=return_url
                    )
                )

            return attach_stripe_publishable_key(
                stripe_service.create_checkout_session(
                    event_type=metadata_event_type,
                    submission_id=submission_id,
                    line_items=line_items,
                    customer_email=customer_email,
                    return_base_url=return_url,
                    cancel_path=cancel_path
                )
            )

        # Stripe - webhook handler (generic for any event type, mirrors PayPal webhook)
        elif sig_header:
            claim_acquired = False
            claimed_submission_id = None
            try:
                endpoint_secret = get_stripe_webhook_secret()
                # construct_event verifies the signature — use return value only for that;
                # access data from the already-parsed dict to avoid SDK object .get() issues
                stripe.Webhook.construct_event(
                    payload=payload,
                    sig_header=sig_header,
                    secret=endpoint_secret
                )
                stripe_event = event  # plain dict, same data

                if stripe_event["type"] != "checkout.session.completed":
                    return {"statusCode": 200, "body": json.dumps({"status": "ignored"})}

                session = stripe_event["data"]["object"]
                session_id = session.get("id")
                metadata = session.get("metadata", {})

                submission_id = metadata.get("submission_id") or session_id
                event_type = metadata.get("event_type", "dynamic_event")

                repo = get_submissions_repository()
                if not repo.claim_payment_processing(submission_id, "stripe", {"sessionId": session_id}):
                    print(f"⚠️ Submission {submission_id} already processed. Skipping.")
                    return {"statusCode": 200, "body": json.dumps({"status": "already processed"})}
                claim_acquired = True
                claimed_submission_id = submission_id
                if not mark_google_processed_submission(submission_id):
                    repo.release_payment_processing(submission_id)
                    claim_acquired = False
                    return {"statusCode": 200, "body": json.dumps({"status": "already processed"})}

                submission_payload = lookup_dynamic_submission(submission_id)
                form_data = submission_payload.get("formData", {})

                stripe_api_key = get_stripe_secret_key()
                stripe_service = StripeOrderService(stripe_api_key)

                buyer_info = get_stripe_buyer_info(session, form_data)
                resa_email = os.environ.get('RESA_EMAIL')
                event_config = get_event_config(event_type)
                event_meta = get_event_meta(event_type, event_config, form_data, resa_email)

                email_sender = EmailSender()
                items_html = stripe_items_to_email_html(email_sender, stripe_service, session_id)

                purchased_date = datetime.fromtimestamp(
                    session["created"], tz=ZoneInfo("UTC")
                ).astimezone(ZoneInfo("America/Los_Angeles")).strftime("%m/%d/%Y")
                submitted_at = stripe_timestamp_to_iso(session.get("created"))
                total_price = f"{session.get('amount_total', 0) / 100:.2f}"

                allowed_fields = get_section_fields(event_config)
                filtered_form_data = {k: v for k, v in form_data.items() if k in allowed_fields}

                EXCLUDED_FIELDS = {
                    "action", "type", "eventTitle", "paymentMethod", "grandTotal",
                    "pricing", "addOns", "players", "tSignHoleSponsor"
                }
                clean_form_data = {k: v for k, v in form_data.items() if k not in EXCLUDED_FIELDS}

                form_fields_html = email_sender.build_form_fields_html(filtered_form_data)
                participants_table_rows = build_participants_table(clean_form_data)
                if event_type in ("Motor Show Event", "motorShowOrder"):
                    items_html = build_motor_show_items_html(form_data)
                    participants_table_rows = build_motor_show_table(clean_form_data)

                context_data = build_email_context(
                    event_meta["event_title"], session_id, event_meta, buyer_info,
                    items_html, form_fields_html, participants_table_rows, total_price, purchased_date
                )

                if event_type == "vendorApplication":
                    buyer_ctx, seller_ctx = build_vendor_email_contexts(
                        form_data, purchased_date, total_price, buyer_info["full_name"]
                    )
                    buyers_body = email_sender.format_email("emails/vender__application_receipt.html", buyer_ctx)
                    sellers_body = email_sender.format_email("emails/vender__application_form.html", seller_ctx)
                    sotf_representative = os.environ.get("PO_VENDOR_EMAIL", resa_email)
                    seller_recipients = {resa_email, sotf_representative, form_data.get("toContact")}
                    storage_subject = "New Vendor Application Submission"
                    email_subject = build_form_email_subject(
                        storage_subject,
                        form_data.get("companyName") or get_form_full_name(form_data) or buyer_info["full_name"],
                        form_data.get("email", buyer_info["email"]),
                    )
                    raw_attachments = form_data.get("attachments", "")
                    existing_folder = raw_attachments if isinstance(raw_attachments, str) and len(raw_attachments) > 3 else None
                    s3_attachments_key = generate_vendor_form_pdf(seller_ctx, s3_folder=existing_folder)
                else:
                    buyers_body = email_sender.format_email("emails/buyer__receipt.html", context_data)
                    sellers_body = email_sender.format_email("emails/seller__po.html", context_data)
                    sotf_representative = os.environ.get(f"PO_{event_type.upper()}_EMAIL", resa_email)
                    seller_recipients = get_event_seller_recipients(event_meta, resa_email)
                    if event_type == "motorShowOrder":
                        motor_show_email1 = os.environ.get("PO_MOTOR_SHOW_EMAIL_1")
                        motor_show_email2 = os.environ.get("PO_MOTOR_SHOW_EMAIL_2")
                        seller_recipients = {resa_email, motor_show_email1, motor_show_email2}
                    storage_subject = "Motor Show Event Order" if event_type == "motorShowOrder" else f"{event_meta['event_title']} Order"
                    email_subject = build_form_email_subject(
                        storage_subject,
                        get_form_full_name(form_data) or buyer_info["full_name"],
                        form_data.get("email", buyer_info["email"]),
                    )
                    s3_attachments_key = None

                email_sender.send_email(body=buyers_body, subject=email_subject, mail_to=buyer_info["email"], mail_from=sotf_representative)
                for recipient in seller_recipients:
                    if recipient:
                        if s3_attachments_key:
                            email_sender.send_email_with_s3_attachments(body=sellers_body, subject=email_subject, mail_to=recipient, mail_from=sotf_representative, s3_folder_key=s3_attachments_key)
                        else:
                            email_sender.send_email(body=sellers_body, subject=email_subject, mail_to=recipient, mail_from=sotf_representative)

                update_google_sheet(
                    form=storage_subject,
                    name=get_form_full_name(form_data) or buyer_info["full_name"],
                    email=form_data.get("email", buyer_info["email"]),
                    phone=form_data.get("phone", ""),
                    sheet_name="Event Submissions",
                    add_ons=format_motor_show_add_ons(form_data) if event_type in ("Motor Show Event", "motorShowOrder") else "",
                )
                create_submission_record(
                    form=storage_subject,
                    name=get_form_full_name(form_data) or buyer_info["full_name"],
                    email=form_data.get("email", buyer_info["email"]),
                    phone=form_data.get("phone", ""),
                    source=event_type,
                    raw_data={**form_data, "submission_id": submission_id, "stripe_session_id": session_id},
                    payment_status="paid",
                    payment_provider="stripe",
                    amount=session.get("amount_total", 0) / 100,
                    only_if_missing=True,
                    submitted_at=submitted_at,
                )
                repo.complete_payment_processing(submission_id, "stripe", {"sessionId": session_id})
                claim_acquired = False
                print("✅ Stripe webhook processed, DynamoDB submission created")

                return {"statusCode": 200, "body": json.dumps({"status": "webhook processed"})}

            except stripe.error.SignatureVerificationError as e:
                print(f"❌ Stripe signature verification failed: {e}")
                return {"statusCode": 400, "body": json.dumps({"error": "Invalid signature"})}
            except Exception as e:
                if claim_acquired and claimed_submission_id:
                    get_submissions_repository().release_payment_processing(claimed_submission_id)
                print(f"❌ Stripe webhook error: {e}")
                return {"statusCode": 400, "body": json.dumps({"message": "Stripe webhook error", "error": str(e)})}


    except Exception as e:
        response_code = 400
        response_body = {
            "message": "an error has occurred",
            "error": str(e)
        }
        print(e)
        print(traceback.format_exc())

    print("returning")
    print(response_body)
    return {
        "statusCode": response_code,
        "body": json.dumps(response_body),
    }
