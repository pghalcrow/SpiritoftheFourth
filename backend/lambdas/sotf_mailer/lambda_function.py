import base64
import pathlib
import smtplib
import os
import json
from email import encoders
from email.mime.base import MIMEBase
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
import boto3
import uuid
from botocore.exceptions import ClientError
import requests
from backend.shared.submissions_mapping import map_live_submission
from backend.shared.submissions_repository import SubmissionsRepository
from backend.shared.runtime_mode import is_test_mode, test_mode_email
from backend.shared.time_utils import pacific_display_date, pacific_sheet_timestamp

DEFAULT_SOURCE_EMAIL = "no-reply@spiritofthefourth.org"

def get_submissions_repository():
    return SubmissionsRepository()


def cors_headers(event=None):
    headers = (event or {}).get("headers", {}) or {}
    origin = headers.get("Origin") or headers.get("origin") or "*"
    return {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Headers": "Content-Type,Authorization",
        "Access-Control-Allow-Methods": "POST,OPTIONS",
    }


def response_headers():
    return {
        "Content-Type": "application/json",
    }


def update_google_sheet(form, name, email, phone):
    import gspread

    credentials_path = os.environ.get("GOOGLE_SHEET_CREDENTIALS", "creds-sa.json")
    form_name = os.environ.get("GOOGLE_SHEET_NAME", "Forms Submissions")
    date = pacific_sheet_timestamp()
    gc = gspread.service_account(credentials_path)
    sheet = gc.open(form_name)
    sheet.sheet1.append_row([form, date, name, email, phone])


def create_submission_record(form, name, email, phone, source, raw_data):
    submission_id = raw_data.get("submission_id") or str(uuid.uuid4())
    record = map_live_submission(
        submission_id=submission_id,
        title=form,
        name=name,
        email=email,
        phone=phone,
        source=source,
        raw_data=raw_data,
    )
    get_submissions_repository().create_submission(record)
    print("✅ DynamoDB submission created")
    return record


def record_submission_parallel(form, name, email, phone, source, raw_data):
    create_submission_record(
        form=form,
        name=name,
        email=email,
        phone=phone,
        source=source,
        raw_data=raw_data,
    )
    try:
        update_google_sheet(form, name, email, phone)
    except Exception as error:
        print(f"⚠️ Google Sheet update failed after submission record was saved: {error}")


def storage_form_title(subject, form_type):
    form_titles = {
        "paradeEntryForm": "New Parade Entry Request - Parade",
        "carEntryForm": "New Parade Entry Request - Car",
        "vipEntryForm": "New Parade Entry Request - VIP",
        "volunteerForm": "Volunteer Request",
        "vendorApplicationForm": "New Vendor Application Submission",
        "artistSignUpForm": "New Artist Sign-Up",
        "sponsorshipForm": "New Sponsorship Submission",
    }
    if form_type in form_titles:
        return form_titles[form_type]
    return str(subject or "").split(" - Name:", 1)[0].strip()


def should_record_submission(subject, event_body):
    receipt_subjects = {
        "Wheels of Freedom Motor Show — Entry Confirmation",
    }
    return subject not in receipt_subjects


def get_pdf_bytes_with_pdfshift(html):
    url = "https://api.pdfshift.io/v3/convert/pdf"
    pdf_shift_api_key = os.environ['PDFSHIFTAPIKEY']
    response = requests.post(
        url,
        auth=("api", pdf_shift_api_key),
        json={
            "source": html,
            "landscape": False,
            "use_print": True
        }
    )
    if response.status_code == 200:
        return response.content
    else:
        raise Exception(f"PDFShift error: {response.text}")


def image_to_base64(image_path):
    with open(image_path, "rb") as img_file:
        return base64.b64encode(img_file.read()).decode("utf-8")

def format_email(email_file: str, variables: dict) -> str:
        """Format an email body with dynamic variables from a file."""
        with open(email_file, "r") as file:
            html_body = file.read()
        return html_body.format(**variables)


def resolve_email_recipients(mail_to, extra_recipients=None):
    override_to = os.environ.get("EMAIL_OVERRIDE_TO", "").strip()
    original_to = (mail_to or "").strip()
    original_recipients = [email.strip() for email in original_to.split(',') if email.strip()]

    for email in extra_recipients or []:
        if email and email.strip():
            original_recipients.append(email.strip())

    if is_test_mode():
        override_to = test_mode_email()

    if override_to:
        return {
            "send_to": [override_to],
            "header_to": override_to,
            "original_to": ", ".join(original_recipients) or original_to,
        }

    return {
        "send_to": original_recipients,
        "header_to": original_to,
        "original_to": None,
    }


def get_email_transport():
    return os.environ.get("EMAIL_TRANSPORT", "smtp").strip().lower()


def get_ses_region():
    return os.environ.get("SES_REGION", "us-east-1").strip()


def get_source_email(mail_from):
    ses_source_email = os.environ.get("SES_SOURCE_EMAIL", "").strip()
    if get_email_transport() == "ses" and ses_source_email:
        return ses_source_email
    return DEFAULT_SOURCE_EMAIL


def apply_sender_headers(msg, mail_from):
    source_email = get_source_email(mail_from)
    msg['From'] = source_email
    if source_email != mail_from:
        msg['X-Original-From'] = mail_from
    return source_email


def send_message(msg, host, port, username, password, mail_from, recipients, context):
    source_email = get_source_email(mail_from)

    try:
        if get_email_transport() == "ses":
            ses_client = boto3.client("ses", region_name=get_ses_region())
            ses_client.send_raw_email(
                Source=source_email,
                Destinations=recipients,
                RawMessage={"Data": msg.as_string()},
            )
            print("SES send_raw_email result", json.dumps({"subject": msg.get("Subject", ""), "context": context}))
            return True

        server = smtplib.SMTP(host, port)
        server.ehlo()
        server.starttls()
        server.login(username, password)

        refused = server.sendmail(source_email, recipients, msg.as_string())
        print("SMTP sendmail result", json.dumps({"subject": msg.get("Subject", ""), "refused": refused, "context": context}))
        server.close()
        return True
    except Exception as ex:
        print(f"Error sending {context}:", ex)
        return False


def send_email(host, port, username, password, subject, body, attachments, mail_to, mail_from, reply_to=''):
    recipients = resolve_email_recipients(mail_to)
    print(
        "Preparing email",
        json.dumps({
            "subject": subject,
            "send_to": recipients["send_to"],
            "header_to": recipients["header_to"],
            "original_to": recipients["original_to"],
            "reply_to": reply_to,
            "has_attachments": bool(attachments),
        })
    )
    msg = MIMEMultipart('alternative')
    msg['Subject'] = subject
    apply_sender_headers(msg, mail_from)
    msg['To'] = recipients["header_to"]
    if recipients["original_to"]:
        msg['X-Original-To'] = recipients["original_to"]

    if reply_to:
        msg['Reply-To'] = reply_to

    html_body = MIMEText(body, 'html')

    if attachments is not None:
        s3_resource = boto3.resource("s3")
        S3_BUCKET_NAME = os.environ.get("S3_ATTACHMENT_BUCKET", "sotf-file-upload")

        bucket = s3_resource.Bucket(S3_BUCKET_NAME)

        for object_summary in bucket.objects.filter(Prefix=attachments):
            if '.' in object_summary.key:
                file_path = object_summary.key
                file_name = file_path.split('/')[-1]
                file = s3_resource.Object(S3_BUCKET_NAME, file_path).get()

                part = None
                file_type = file_path.split('.')[-1].lower()
                if file_type in ['jpg', 'jpeg', 'png']:
                    part = MIMEBase('image', file_type)
                elif file_type == 'pdf':
                    part = MIMEBase('application', file_type)
                elif file_type in ['docx', 'xlsx']:
                    part = MIMEBase('application', "octet-stream")

                if part:
                    part.set_payload(file['Body'].read())
                    part['Content-Disposition'] = f'attachment; filename="{file_name}"'
                    encoders.encode_base64(part)
                    msg.attach(part)

    msg.attach(html_body)

    return send_message(msg, host, port, username, password, mail_from, recipients["send_to"], "email")


def send_vender_email(host, port, username, password, subject, attachments, mail_to, mail_from, reply_to=''):
    recipients = resolve_email_recipients(mail_to, [reply_to])
    print(
        "Preparing vendor email",
        json.dumps({
            "subject": subject,
            "send_to": recipients["send_to"],
            "header_to": recipients["header_to"],
            "original_to": recipients["original_to"],
            "reply_to": reply_to,
            "has_attachments": bool(attachments),
        })
    )
    msg = MIMEMultipart('mixed')
    msg['Subject'] = subject
    apply_sender_headers(msg, mail_from)
    msg['To'] = recipients["header_to"]
    if recipients["original_to"]:
        msg['X-Original-To'] = recipients["original_to"]
    if len(reply_to) > 0:
        msg['Reply-To'] = reply_to

    if attachments is not None:
        s3_resource = boto3.resource("s3")
        S3_BUCKET_NAME = os.environ.get("S3_ATTACHMENT_BUCKET", "sotf-file-upload")
        bucket = s3_resource.Bucket(S3_BUCKET_NAME)

        file_keys = []

        # If it's a string, treat it as a folder prefix
        if isinstance(attachments, str):
            for object_summary in bucket.objects.filter(Prefix=attachments):
                if '.' in object_summary.key:
                    file_keys.append(object_summary.key)

        # If it's a list of specific keys
        elif isinstance(attachments, list):
            file_keys.extend(attachments)

        # Process all file keys
        for file_path in file_keys:
            file_name = file_path.split('/')[-1]
            file = s3_resource.Object(S3_BUCKET_NAME, file_path).get()

            file_type = file_path.split('.')[-1].lower()
            if file_type in ['jpg', 'jpeg', 'png']:
                part = MIMEBase('image', file_type)
            elif file_type == 'pdf':
                part = MIMEBase('application', 'pdf')
            elif file_type in ['docx', 'xlsx']:
                part = MIMEBase('application', "octet-stream")
            else:
                continue  # Skip unknown file types

            part.set_payload(file['Body'].read())
            part['Content-Disposition'] = f'attachment; filename="{file_name}"'
            encoders.encode_base64(part)
            msg.attach(part)


    return send_message(msg, host, port, username, password, mail_from, recipients["send_to"], "vendor email")



def lambda_handler(event, context):
    if event.get("requestContext", {}).get("http", {}).get("method") == "OPTIONS" or event.get("httpMethod") == "OPTIONS":
        return {
            "isBase64Encoded": False,
            "statusCode": 204,
            "headers": cors_headers(event),
            "body": "",
        }

    event_body = json.loads(event['body'])
    response = {
        "isBase64Encoded": False,
        "headers": response_headers(),
    }
    if 'getSignedURLs' in event_body and event_body['getSignedURLs']:
        s3_client = boto3.client('s3')
        custom_key = str(uuid.uuid4())
        files = event_body['fileNames']
        try:
            presigned_urls = {}
            for file in files:
                presigned_url = s3_client.generate_presigned_post(os.environ.get("S3_ATTACHMENT_BUCKET", "sotf-file-upload"),
                                                                  custom_key+'/'+file,
                                                                  ExpiresIn=(10 * 60))
                presigned_urls[file] = presigned_url
            response["statusCode"] = 200
            response["body"] = '{"status":true, "folderKey":"'+custom_key+'", "signedURLs": '+json.dumps(presigned_urls)+'}'
        except ClientError as e:
            print(e)
            response["statusCode"] = 400
            response["body"] = '{"status":false}'
    else:
        # initialize variables
        username = os.environ['USERNAME']
        password = os.environ['PASSWORD']
        host = os.environ['SMTPHOST']
        port = os.environ['SMTPPORT']
        subject = event_body['subject']
        body = event_body['body']
        contact_name = event_body['name']
        contact_phone = event_body['phone']

        if 'vendorStatus' in event_body and event_body['vendorStatus']:
            # vendor data from the event
            org_name = event_body['companyName']
            contact_form_name = event_body['contactName']
            address = event_body['streetAddress']
            city = event_body['city']
            state = event_body['state']
            zip_code = event_body['zipcode']
            phone = event_body['phone']
            email = event_body['email']
            product_description = event_body['description']
            special_requests = event_body['specialRequests']
            signer_name = event_body['signatureName']

            date = pacific_display_date()

            vendor_prices = {
                "Non-Profit": 0,
                "Information Only": 40,
                "Non-Food Sales": 55,
                "Food Sales - Day Only": 100,
                "Food Sales - Evening Only": 250,
                "Food Sales - Day and Evening": 175
            }

            vendor_type = event_body['vendorType']
            price = vendor_prices.get(vendor_type, 0)

            non_profit_check = "X" if vendor_type == "Non-Profit" else ""
            info_only_check = "X" if vendor_type == "Information Only" else ""
            non_food_check = "X" if vendor_type == "Non-Food Sales" else ""
            daytime_only_check = "X" if vendor_type == "Food Sales - Day Only" else ""
            evening_only_check = "X" if vendor_type == "Food Sales - Evening Only" else ""
            both_events_check = "X" if vendor_type == "Food Sales - Day and Evening" else ""

            # HTML template variables
            base_dir = pathlib.Path(__file__).parent
            logo_path = base_dir / "emails" / "logo.png"
            html_template_path = base_dir / "emails" / "vender__application_form.html"


            with open(html_template_path, "r", encoding="utf-8") as file:
                html_template = file.read()

            logo_base64 = image_to_base64(logo_path)

            replacements = {
                    "{ORG_NAME}": org_name,
                    "{CONTACT_NAME}": contact_form_name,
                    "{ADDRESS}": address,
                    "{CITY}": city,
                    "{STATE}": state,
                    "{ZIP}": zip_code,
                    "{PHONE}": phone,
                    "{EMAIL}": email,
                    "{PRODUCT_DESCRIPTION}": product_description,
                    "{SPECIAL_REQUESTS}": special_requests or "None",
                    "{SIGNER_NAME}": signer_name,
                    "{TITLE}": org_name,
                    "{DATE}": date,
                    "{NON_PROFIT_CHECK}": non_profit_check,
                    "{INFO_ONLY_CHECK}": info_only_check,
                    "{NON_FOOD_CHECK}": non_food_check,
                    "{DAYTIME_ONLY_CHECK}": daytime_only_check,
                    "{EVENING_ONLY_CHECK}": evening_only_check,
                    "{BOTH_EVENTS_CHECK}": both_events_check,
                    "{LOGO_SRC}": f"data:image/png;base64,{logo_base64}"
                }

            rendered_html = html_template
            for placeholder, value in replacements.items():
                rendered_html = rendered_html.replace(placeholder, value)

            # Convert html to PDF file with PDFShift
            pdf_bytes = get_pdf_bytes_with_pdfshift(rendered_html)

            # Upload to S3
            s3 = boto3.client('s3')
            s3_folder = event_body['attachments'] if "attachments" in event_body else str(uuid.uuid4())
            pdf_key = f"{s3_folder}/vendor_form.pdf"
            s3.put_object(Bucket=os.environ.get("S3_ATTACHMENT_BUCKET", "sotf-file-upload"), Key=pdf_key, Body=pdf_bytes)

            # Conditional warning
            payment_warning = (
                '<p style="color: #b22222; font-weight: bold; font-size: 18px; text-align: center; background-color: #fff3cd; border: 1px solid #ffeeba; padding: 10px; border-radius: 5px;">'
                '⚠️ <strong>To complete your application, you must submit payment.</strong> ⚠️</p>'
                '<p style="color: #333;"><b>If paying by check please mail to:</b></p>'
                '<p style="color: #333;">Spirit of the Fourth, Inc., Attn: Community Fair, PO Box 270736, San Diego CA 92198</p>'
                '<p style="color: #333;"><b>Payments also accepted by Venmo:</b> @SpiritOf-TheFourth or PayPal.Me/Spiritofthefourth</p>'
                if vendor_type != "Non-Profit" else ''
            )

            context = {
                "buyers_full_name" : contact_form_name,
                "vendor_type" : vendor_type,
                "price" : price,
                "payment_warning": payment_warning,
            }

            vendor_body = format_email("emails/vender__application_receipt.html", context)

            # send vender app mail
            mail_to = event_body['toContact']
            reply_to = event_body['replyTo']
            attachments = None
            if "attachments" in event_body and len(event_body['attachments']) > 3:
                attachments = s3_folder  # This will include all files in the folder (including the PDF)
            else:
                attachments = [pdf_key] # This will include just the PDF

            success = send_vender_email(host, port, username, password, subject, attachments, mail_to, username, reply_to)
            send_email(host, port, username, password, subject, body=vendor_body, attachments=None, mail_to=email, mail_from=username, reply_to=reply_to)
            record_submission_parallel(
                form=storage_form_title(subject, event_body.get("formType", "vendorApplicationForm")),
                name=contact_name,
                email=reply_to,
                phone=contact_phone,
                source=event_body.get("formType", "mailer"),
                raw_data={**event_body, "submission_id": str(uuid.uuid4())},
            )

        else:

            #send mail
            mail_to = event_body['toContact']
            reply_to = event_body['replyTo']
            attachments = None
            if "attachments" in event_body and len(event_body['attachments']) > 3:
                attachments = event_body['attachments']

            success = send_email(host, port, username, password, subject, body, attachments, mail_to, username, reply_to)
            if success and should_record_submission(subject, event_body):
                form_type = event_body.get("formType", "mailer")
                record_submission_parallel(
                    form=storage_form_title(subject, form_type),
                    name=contact_name,
                    email=reply_to,
                    phone=contact_phone,
                    source=form_type,
                    raw_data={**event_body, "submission_id": str(uuid.uuid4())},
                )

        if success:
            response["statusCode"] = 200
            response["body"] = '{"status":true}'
        else:
            response["statusCode"] = 400
            response["body"] = '{"status":false}'

    return response
