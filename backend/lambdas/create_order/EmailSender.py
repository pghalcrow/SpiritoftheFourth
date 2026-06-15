from email import encoders
from email.mime.base import MIMEBase
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
import html
import os
from pathlib import Path
import re
import smtplib
import boto3
from backend.shared.runtime_mode import is_test_mode, test_mode_email

_PLACEHOLDER_RE = re.compile(r"\{([A-Za-z_][A-Za-z0-9_]*)\}")


def resolve_email_recipient(mail_to: str) -> dict:
    override_to = os.environ.get("EMAIL_OVERRIDE_TO", "").strip()
    original_to = (mail_to or "").strip()
    if is_test_mode():
        override_to = test_mode_email()

    if override_to:
        return {
            "send_to": override_to,
            "header_to": override_to,
            "original_to": original_to,
        }

    return {
        "send_to": original_to,
        "header_to": original_to,
        "original_to": None,
    }

class EmailSender:
    def __init__(self):
        self.email_transport = os.environ.get("EMAIL_TRANSPORT", "smtp").strip().lower()
        self.host = os.environ.get("SMTPHOST", "")
        self.port = int(os.environ.get("SMTPPORT", "587"))
        self.username = os.environ.get("USERNAME", "")
        self.password = os.environ.get("PASSWORD", "")
        self.ses_region = os.environ.get("SES_REGION", "us-east-1").strip()
        self.ses_source_email = os.environ.get("SES_SOURCE_EMAIL", "").strip()

    def _source_email(self, mail_from: str) -> str:
        if self.email_transport == "ses" and self.ses_source_email:
            return self.ses_source_email
        return mail_from

    def _apply_sender_headers(self, msg, mail_from: str):
        source_email = self._source_email(mail_from)
        msg['From'] = source_email
        if source_email != mail_from:
            msg['X-Original-From'] = mail_from
        return source_email

    def _send_message(self, msg, mail_from: str, recipients: list, failure_context: str) -> bool:
        source_email = self._source_email(mail_from)

        try:
            if self.email_transport == "local":
                print(f"LOCAL email skipped: {msg.get('Subject', '')} -> {', '.join(recipients)}")
                return True

            if self.email_transport == "ses":
                ses_client = boto3.client("ses", region_name=self.ses_region)
                ses_client.send_raw_email(
                    Source=source_email,
                    Destinations=recipients,
                    RawMessage={"Data": msg.as_string()},
                )
                print(f"SES sent email: {msg.get('Subject', '')}")
                return True

            server = smtplib.SMTP(self.host, self.port)
            server.ehlo()
            server.starttls()
            server.login(self.username, self.password)
            server.sendmail(source_email, recipients, msg.as_string())
            server.quit()
            return True
        except Exception as ex:
            print(f"❌ Failed to send {failure_context}: {ex}")
            return False

    def format_email(self, email_file: str, variables: dict) -> str:
        """Format an email body with dynamic variables from a file.

        Only substitutes `{identifier}` tokens that match a key in `variables`.
        Any other braces (inline CSS/JS, JSON snippets, etc.) are left as-is
        so templates don't need to double-escape them for str.format.
        """
        template_path = Path(email_file)
        if not template_path.is_absolute():
            template_path = Path(__file__).resolve().parent / template_path

        with open(template_path, "r") as file:
            html_body = file.read()

        def _replace(match: "re.Match") -> str:
            key = match.group(1)
            if key in variables:
                return str(variables[key])
            return match.group(0)

        return _PLACEHOLDER_RE.sub(_replace, html_body)

    def loop_through_items(self, items):
                # generates HTML table rows for each item.
                return "".join(f"""
                    <tr style="background-color: #fff;">
                        <td style="padding: 10px; border: 1px solid #ddd; color: #333;">{item['name']}</td>
                        <td style="padding: 10px; border: 1px solid #ddd; color: #333;">{item["quantity"]}</td>
                        <td style="padding: 10px; border: 1px solid #ddd; color: #333;">${item['unit_amount']['value']}</td>
                    </tr>
                """ for item in items)

    def loop_through_items_2(self,items):
                return "".join(f"""
                    <tr style="background-color: #fff;">
                        <td style="padding: 10px; border: 1px solid #ddd; color: #333;">{item['name']}</td>
                        <td style="padding: 10px; border: 1px solid #ddd; color: #333;">{item["quantity"]}</td>
                        <td style="padding: 10px; border: 1px solid #ddd; color: #333;">
                            ${float(item['unit_amount']['value']) * float(item['quantity']):.2f}
                        </td>
                    </tr>
                """ for item in items)

    def loop_through_items_3(self,items):
                return "".join(f"""
                    <tr style="background-color: #fff;">
                        <td style="padding: 10px; border: 1px solid #ddd; color: #333;">{item['name']}</td>
                        <td style="padding: 10px; border: 1px solid #ddd; color: #333;">-</td>
                        <td style="padding: 10px; border: 1px solid #ddd; color: #333;">
                            ${float(item['unit_amount']['value']) * float(item['quantity']):.2f}
                        </td>
                    </tr>
                """ for item in items)

    def add_partner_html(self, partner):
         return f""" <tr>
                <td style="padding: 4px; border: 1px solid #ddd; white-space: nowrap;">Partner Name</td>
                <td style="padding: 4px; border: 1px solid #ddd; white-space: nowrap;">{partner}</td>
              </tr>"""

    def add_partner_html1(self, name, participant1_level, partner=None, participant2_level=None):
        html = f"""
            <tr style="background-color: #fff;">
                <td style="padding: 10px; border: 1px solid #ddd; color: #333;">{name}</td>
                <td style="padding: 10px; border: 1px solid #ddd; color: #333;">{participant1_level}</td>
            </tr>
        """

        if partner and participant2_level:
            html += f"""
            <tr style="background-color: #fff;">
                <td style="padding: 10px; border: 1px solid #ddd; color: #333;">{partner}</td>
                <td style="padding: 10px; border: 1px solid #ddd; color: #333;">{participant2_level}</td>
            </tr>
        """

        return html

    def build_dynamic_form_table(self, form_data: dict, table_title: str = "Form Data"):
        """
        Build an HTML table from arbitrary form data.
        Accepts dict of main + nested participants, works for any form.
        """
        # Determine all unique keys
        all_keys = set()
        rows_data = []

        # Flatten main dict & nested lists
        for key, value in form_data.items():
            if isinstance(value, list):
                # Each member in list
                for member in value:
                    if isinstance(member, dict):
                        all_keys.update(member.keys())
                        rows_data.append(member)
            elif isinstance(value, dict):
                all_keys.update(value.keys())
                rows_data.append(value)
            else:
                all_keys.add(key)
                rows_data.append({key: value})

        # Ensure consistent order
        all_keys = sorted(all_keys)

        # Build table header
        header_row = "<tr style='background-color:#f9f9f9'>" + "".join(
            f"<th style='padding:10px;border:1px solid #ddd;color:#333'>{k}</th>" for k in all_keys
        ) + "</tr>"

        # Build table body
        body_rows = ""
        for row in rows_data:
            body_rows += "<tr>" + "".join(
                f"<td style='padding:8px;border:1px solid #ddd;color:#333'>{row.get(k,'')}</td>" for k in all_keys
            ) + "</tr>"

        # Full table
        table_html = f"""
            <table style='border-collapse:collapse;width:100%;margin-bottom:20px;'>
                <caption style='caption-side:top;font-weight:bold;padding-bottom:8px;'>{table_title}</caption>
                {header_row}
                {body_rows}
            </table>
        """
        return table_html


    def send_email(self, body: str, subject: str, mail_to: str, mail_from: str) -> bool:
        """Send an HTML email using preset credentials."""
        recipient = resolve_email_recipient(mail_to)
        msg = MIMEMultipart('alternative')
        msg['Subject'] = subject
        self._apply_sender_headers(msg, mail_from)
        msg['To'] = recipient["header_to"]
        if recipient["original_to"]:
            msg['X-Original-To'] = recipient["original_to"]
        if mail_to:
            msg['Reply-To'] = mail_to

        msg.attach(MIMEText(body, 'html'))

        return self._send_message(msg, mail_from, [recipient["send_to"]], "email")

    def send_email_with_s3_attachments(self, body: str, subject: str, mail_to: str, mail_from: str, s3_folder_key: str) -> bool:
        """Send an HTML email with files from an S3 folder attached."""
        recipient = resolve_email_recipient(mail_to)
        msg = MIMEMultipart('mixed')
        msg['Subject'] = subject
        self._apply_sender_headers(msg, mail_from)
        msg['To'] = recipient["header_to"]
        if recipient["original_to"]:
            msg['X-Original-To'] = recipient["original_to"]
        if mail_to:
            msg['Reply-To'] = mail_to

        msg.attach(MIMEText(body, 'html'))

        if s3_folder_key:
            try:
                s3_resource = boto3.resource("s3")
                bucket_name = os.environ.get("S3_ATTACHMENT_BUCKET", "sotf-file-upload")
                bucket = s3_resource.Bucket(bucket_name)

                for obj in bucket.objects.filter(Prefix=s3_folder_key):
                    if '.' not in obj.key:
                        continue
                    file_name = obj.key.split('/')[-1]
                    file_data = s3_resource.Object(bucket_name, obj.key).get()

                    file_type = obj.key.split('.')[-1].lower()
                    if file_type in ['jpg', 'jpeg', 'png']:
                        part = MIMEBase('image', file_type)
                    elif file_type == 'pdf':
                        part = MIMEBase('application', 'pdf')
                    elif file_type in ['docx', 'xlsx']:
                        part = MIMEBase('application', 'octet-stream')
                    else:
                        continue

                    part.set_payload(file_data['Body'].read())
                    part['Content-Disposition'] = f'attachment; filename="{file_name}"'
                    encoders.encode_base64(part)
                    msg.attach(part)
            except Exception as e:
                print(f"❌ Failed to attach S3 files: {e}")

        return self._send_message(msg, mail_from, [recipient["send_to"]], "email with attachments")

    def build_form_fields_html(self, form_data: dict):
        rows = ""
        for key, value in form_data.items():

            if value is None or value == "":
                continue
            label = self.format_field_label(key)
            escaped_value = html.escape(str(value))

            rows += f"""
            <tr>
                <td style="padding:8px;border:1px solid #ddd;font-weight:bold;">
                    {label}
                </td>
                <td style="padding:8px;border:1px solid #ddd;">
                    {escaped_value}
                </td>
            </tr>
            """
        return rows

    def format_field_label(self, key: str) -> str:
        labels = {
            "contactName": "Contact Name",
            "streetAddress": "Street Address",
            "zipcode": "Zip Code",
            "paradeAnnouncement": "Parade Announcement",
            "wantGift": "Appreciation Gift",
            "signatureName": "Signature Name",
            "entryType": "Entry Type",
            "vipName": "VIP Name",
            "vipOwnCar": "Providing Own Car",
            "driversName": "Driver Name",
            "driversEmail": "Driver Email",
            "driversPhone": "Driver Phone",
            "availableSeats": "Available VIP Seats",
            "clubAffiliation": "Club Affiliation",
        }
        if key in labels:
            return labels[key]
        return re.sub(r"[_-]+", " ", re.sub(r"([a-z0-9])([A-Z])", r"\1 \2", key)).title()
