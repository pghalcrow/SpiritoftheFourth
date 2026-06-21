import os
from urllib.parse import urlencode


RESET_BASE_URL = os.environ.get("RESET_BASE_URL", "https://spiritofthefourth.org/admin/reset-password")
RESET_EMAIL_SUBJECT = "Spirit of the Fourth password reset code"


def lambda_handler(event, context):
    if event.get("triggerSource") != "CustomMessage_ForgotPassword":
        return event

    request = event.get("request", {})
    response = event.setdefault("response", {})
    email = request.get("userAttributes", {}).get("email") or event.get("userName", "")
    code_parameter = request.get("codeParameter", "{####}")
    reset_url = f"{RESET_BASE_URL}?{urlencode({'email': email})}"

    response["emailSubject"] = RESET_EMAIL_SUBJECT
    response["emailMessage"] = (
        "<p>Use this code to reset your Spirit of the Fourth admin password:</p>"
        f"<p><strong>{code_parameter}</strong></p>"
        f'<p><a href="{reset_url}">Open the password reset page</a></p>'
        f"<p>If the button does not work, copy and paste this URL into your browser:<br>{reset_url}</p>"
        "<p>If you requested more than one code, use the newest email.</p>"
    )
    return event
