import os
from urllib.parse import urlencode


RESET_BASE_URL = os.environ.get("RESET_BASE_URL", "https://spiritofthefourth.org/admin/reset-password")
SIGN_IN_URL = os.environ.get("SIGN_IN_URL", "https://spiritofthefourth.org/sign-in")
RESET_EMAIL_SUBJECT = "Spirit of the Fourth password reset code"
SETUP_EMAIL_SUBJECT = "Spirit of the Fourth admin account setup"


def lambda_handler(event, context):
    request = event.get("request", {})
    response = event.setdefault("response", {})
    email = request.get("userAttributes", {}).get("email") or event.get("userName", "")
    code_parameter = request.get("codeParameter", "{####}")

    if event.get("triggerSource") == "CustomMessage_AdminCreateUser":
        username_parameter = request.get("usernameParameter", email)
        response["emailSubject"] = SETUP_EMAIL_SUBJECT
        response["emailMessage"] = (
            "<p>An admin account has been created for Spirit of the Fourth.</p>"
            f"<p>Email: <strong>{email}</strong></p>"
            f"<p>Username: <strong>{username_parameter}</strong></p>"
            f"<p>Temporary password: <strong>{code_parameter}</strong></p>"
            f'<p><a href="{SIGN_IN_URL}">Open the admin sign-in page</a></p>'
            f"<p>If the button does not work, copy and paste this URL into your browser:<br>{SIGN_IN_URL}</p>"
            "<p>This temporary password is valid for 48 hours. After signing in, you will be prompted to set your own password.</p>"
        )
        return event

    if event.get("triggerSource") != "CustomMessage_ForgotPassword":
        return event

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
