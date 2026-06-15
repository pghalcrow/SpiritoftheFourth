import os

from backend.shared.submissions_repository import SubmissionsRepository


TEST_MODE_EMAIL_DEFAULT = "pghalcrow@gmail.com"
LIVE_PUBLISHABLE_KEY_DEFAULT = "pk_live_51N6ITZCtYBFkGDnFjqlCYuxO0JKLaoNHBmq1I56Hde6k4QbSMqDk15NtZf6gyzi9Wnwem6K0zLpxO3D8Ypab6Qks00de6HVbgz"
TEST_PUBLISHABLE_KEY_DEFAULT = "pk_test_51N6ITZCtYBFkGDnFnqxO5njTXiRYsHAx8UQ4E9jxmIl392iDU6FLSu9wFpXQ09PvT9ACFjbBwtyfj2WjIxUgyTbZ006rnkZaql"


def is_local_test_mode():
    return os.environ.get("LOCAL_TEST_MODE", "").strip().lower() in {"1", "true", "yes"}


def is_test_mode(repo_factory=SubmissionsRepository):
    if is_local_test_mode():
        return True

    try:
        return bool(repo_factory().get_runtime_settings().get("testMode", False))
    except Exception as error:
        print(f"Unable to read runtime test mode; defaulting to live mode: {error}")
        return False


def test_mode_email():
    return os.environ.get("TEST_MODE_EMAIL", TEST_MODE_EMAIL_DEFAULT).strip() or TEST_MODE_EMAIL_DEFAULT


def resolve_email_override():
    if is_test_mode():
        return test_mode_email()
    return os.environ.get("EMAIL_OVERRIDE_TO", "").strip()


def stripe_secret_key():
    if is_test_mode():
        if os.environ.get("LOCAL_TEST_MODE"):
            return os.environ.get("STRIPE_TEST_API_KEY") or os.environ["STRIPE_API_KEY"]
        return os.environ["STRIPE_TEST_API_KEY"]
    return os.environ["STRIPE_API_KEY"]


def stripe_webhook_secret():
    if is_test_mode():
        if os.environ.get("LOCAL_TEST_MODE"):
            return os.environ.get("STRIPE_TEST_WEBHOOK_SECRET") or os.environ["WEBHOOK_SECRET"]
        return os.environ["STRIPE_TEST_WEBHOOK_SECRET"]
    return os.environ["WEBHOOK_SECRET"]


def stripe_publishable_key():
    if is_test_mode():
        return os.environ.get("STRIPE_TEST_PUBLISHABLE_KEY", TEST_PUBLISHABLE_KEY_DEFAULT)
    return os.environ.get("STRIPE_PUBLISHABLE_KEY", LIVE_PUBLISHABLE_KEY_DEFAULT)
