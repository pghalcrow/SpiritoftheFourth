import base64
import hashlib
import hmac
import os
import secrets
import string

try:
    import boto3
except ImportError:
    boto3 = None

try:
    from botocore.exceptions import ClientError
except ImportError:
    ClientError = None


ROLE_DEVELOPER = "developer"
ROLE_SUPER_ADMIN = "superAdmin"
ROLE_ADMIN = "admin"
ROLE_VIEWER = "viewer"
VALID_ROLES = {ROLE_DEVELOPER, ROLE_SUPER_ADMIN, ROLE_ADMIN, ROLE_VIEWER}
ROLE_GROUPS = {
    ROLE_DEVELOPER: "Developer",
    ROLE_SUPER_ADMIN: "SuperAdmin",
    ROLE_ADMIN: "Admin",
    ROLE_VIEWER: "Viewer",
}
GROUP_ROLES = {value: key for key, value in ROLE_GROUPS.items()}


def normalize_role(role):
    value = str(role or "").strip()
    if value in VALID_ROLES:
        return value
    if value in GROUP_ROLES:
        return GROUP_ROLES[value]
    return ""


def can_read(role):
    return normalize_role(role) in VALID_ROLES


def can_edit(role):
    return normalize_role(role) in {ROLE_DEVELOPER, ROLE_SUPER_ADMIN, ROLE_ADMIN}


def can_delete_submissions(role):
    return normalize_role(role) in {ROLE_DEVELOPER, ROLE_SUPER_ADMIN}


def can_update_test_mode(role):
    return normalize_role(role) == ROLE_DEVELOPER


def can_manage_users(role):
    return normalize_role(role) in {ROLE_DEVELOPER, ROLE_SUPER_ADMIN, ROLE_ADMIN}


def can_manage_role(actor_role, target_role):
    actor = normalize_role(actor_role)
    target = normalize_role(target_role)
    if not target:
        return False
    if actor == ROLE_DEVELOPER:
        return True
    if actor == ROLE_SUPER_ADMIN:
        return target in {ROLE_SUPER_ADMIN, ROLE_ADMIN, ROLE_VIEWER}
    if actor == ROLE_ADMIN:
        return target == ROLE_VIEWER
    return False


def password_meets_policy(password):
    value = str(password or "")
    return (
        len(value) >= 8
        and any(char.isupper() for char in value)
        and any(char.islower() for char in value)
        and any(char.isdigit() for char in value)
        and any(not char.isalnum() for char in value)
    )


def generate_temporary_password():
    alphabet = string.ascii_letters + string.digits + "!@#$%^&*"
    return "Tmp!" + "".join(secrets.choice(alphabet) for _ in range(18)) + "7"


class AdminAuthService:
    def __init__(self, client=None, user_pool_id=None, client_id=None, client_secret=None):
        if client is not None:
            self.client = client
        else:
            if boto3 is None:
                raise ImportError("boto3 is required when an auth client is not provided")
            self.client = boto3.client("cognito-idp")
        self.user_pool_id = user_pool_id or os.environ.get("COGNITO_USER_POOL_ID", "")
        self.client_id = client_id or os.environ.get("COGNITO_CLIENT_ID", "")
        self.client_secret = client_secret or os.environ.get("COGNITO_CLIENT_SECRET", "")

    def login(self, email, password):
        auth_parameters = {
            "USERNAME": email,
            "PASSWORD": password,
        }
        secret_hash = self._secret_hash(email)
        if secret_hash:
            auth_parameters["SECRET_HASH"] = secret_hash

        try:
            response = self.client.initiate_auth(
                ClientId=self.client_id,
                AuthFlow="USER_PASSWORD_AUTH",
                AuthParameters=auth_parameters,
            )
        except Exception as error:
            if self._is_disabled_login_error(error):
                return {"success": False, "reason": "disabled"}
            if self._is_bad_login_error(error):
                return {"success": False}
            raise
        if response.get("ChallengeName") == "NEW_PASSWORD_REQUIRED":
            return {
                "success": False,
                "challenge": "NEW_PASSWORD_REQUIRED",
                "session": response.get("Session", ""),
                "email": email,
            }
        auth_result = response.get("AuthenticationResult", {})
        access_token = auth_result.get("AccessToken", "")
        user = self.get_current_user(access_token)
        return {
            "success": True,
            "token": access_token,
            "idToken": auth_result.get("IdToken", ""),
            "role": user["role"],
            "email": user["email"],
        }

    def _is_disabled_login_error(self, error):
        if ClientError is not None and isinstance(error, ClientError):
            error_info = error.response.get("Error", {})
            message = str(error_info.get("Message", "")).lower()
            code = error_info.get("Code")
            return code in {"UserDisabledException"} or "disabled" in message
        return False

    def _is_bad_login_error(self, error):
        if ClientError is not None and isinstance(error, ClientError):
            error_info = error.response.get("Error", {})
            return error_info.get("Code") in {"NotAuthorizedException", "UserNotFoundException"}
        return False

    def _is_existing_user_error(self, error):
        if ClientError is not None and isinstance(error, ClientError):
            error_info = error.response.get("Error", {})
            return error_info.get("Code") == "UsernameExistsException"
        return False

    def get_current_user(self, access_token):
        user_response = self.client.get_user(AccessToken=access_token)
        username = user_response.get("Username", "")
        attributes = {
            item.get("Name"): item.get("Value")
            for item in user_response.get("UserAttributes", [])
        }
        groups_response = self.client.admin_list_groups_for_user(
            UserPoolId=self.user_pool_id,
            Username=username,
        )
        role = self._highest_role(groups_response.get("Groups", []))
        return {
            "username": username,
            "email": attributes.get("email", username),
            "role": role,
        }

    def list_users(self):
        users = []
        response = self.client.list_users(UserPoolId=self.user_pool_id)
        for user in response.get("Users", []):
            username = user.get("Username", "")
            groups_response = self.client.admin_list_groups_for_user(
                UserPoolId=self.user_pool_id,
                Username=username,
            )
            attributes = {
                item.get("Name"): item.get("Value")
                for item in user.get("Attributes", [])
            }
            users.append({
                "email": attributes.get("email", username),
                "username": username,
                "role": self._highest_role(groups_response.get("Groups", [])),
                "enabled": bool(user.get("Enabled", False)),
                "status": user.get("UserStatus", ""),
            })
        return {"items": users}

    def create_user(self, email, role):
        normalized_role = normalize_role(role)
        if not normalized_role:
            raise ValueError("Invalid role")
        temporary_password = generate_temporary_password()
        try:
            self.client.admin_create_user(
                UserPoolId=self.user_pool_id,
                Username=email,
                UserAttributes=[
                    {"Name": "email", "Value": email},
                    {"Name": "email_verified", "Value": "true"},
                ],
                TemporaryPassword=temporary_password,
                DesiredDeliveryMediums=["EMAIL"],
            )
        except Exception as error:
            if self._is_existing_user_error(error):
                raise ValueError("An account using that email already exists.")
            raise
        self.client.admin_add_user_to_group(
            UserPoolId=self.user_pool_id,
            Username=email,
            GroupName=ROLE_GROUPS[normalized_role],
        )
        return {"email": email, "role": normalized_role}

    def delete_user(self, email):
        self.client.admin_delete_user(UserPoolId=self.user_pool_id, Username=email)
        return {"email": email}

    def update_user(self, email, role=None, enabled=None):
        normalized_role = None
        if role is not None:
            normalized_role = normalize_role(role)
            if not normalized_role:
                raise ValueError("Invalid role")

        if enabled is not None:
            if bool(enabled):
                self.client.admin_enable_user(UserPoolId=self.user_pool_id, Username=email)
            else:
                self.client.admin_disable_user(UserPoolId=self.user_pool_id, Username=email)

        if normalized_role is not None:
            for group_name in ROLE_GROUPS.values():
                try:
                    self.client.admin_remove_user_from_group(
                        UserPoolId=self.user_pool_id,
                        Username=email,
                        GroupName=group_name,
                    )
                except Exception as error:
                    if ClientError is None or not isinstance(error, ClientError):
                        raise
                    code = error.response.get("Error", {}).get("Code", "")
                    if code not in {"ResourceNotFoundException", "UserNotFoundException"}:
                        raise
            self.client.admin_add_user_to_group(
                UserPoolId=self.user_pool_id,
                Username=email,
                GroupName=ROLE_GROUPS[normalized_role],
            )

        result = {"email": email}
        if normalized_role is not None:
            result["role"] = normalized_role
        if enabled is not None:
            result["enabled"] = bool(enabled)
        return result

    def request_password_reset(self, email):
        secret_hash = self._secret_hash(email)
        try:
            self.client.forgot_password(ClientId=self.client_id, Username=email, **({"SecretHash": secret_hash} if secret_hash else {}))
        except Exception as error:
            if ClientError is not None and isinstance(error, ClientError):
                code = error.response.get("Error", {}).get("Code", "")
                if code in {"UserNotFoundException", "InvalidParameterException"}:
                    return {"success": True}
            raise
        return {"success": True}

    def confirm_password_reset(self, email, code, password):
        if not password_meets_policy(password):
            raise ValueError("Password does not meet policy")
        kwargs = {}
        secret_hash = self._secret_hash(email)
        if secret_hash:
            kwargs["SecretHash"] = secret_hash
        self.client.confirm_forgot_password(
            ClientId=self.client_id,
            Username=email,
            ConfirmationCode=code,
            Password=password,
            **kwargs,
        )
        return {"success": True}

    def complete_new_password_challenge(self, email, password, session):
        if not password_meets_policy(password):
            raise ValueError("Password does not meet policy")
        challenge_responses = {
            "USERNAME": email,
            "NEW_PASSWORD": password,
        }
        secret_hash = self._secret_hash(email)
        if secret_hash:
            challenge_responses["SECRET_HASH"] = secret_hash
        response = self.client.respond_to_auth_challenge(
            ClientId=self.client_id,
            ChallengeName="NEW_PASSWORD_REQUIRED",
            Session=session,
            ChallengeResponses=challenge_responses,
        )
        auth_result = response.get("AuthenticationResult", {})
        access_token = auth_result.get("AccessToken", "")
        user = self.get_current_user(access_token)
        return {
            "success": True,
            "token": access_token,
            "idToken": auth_result.get("IdToken", ""),
            "role": user["role"],
            "email": user["email"],
        }

    def _highest_role(self, groups):
        group_names = {group.get("GroupName", "") for group in groups}
        for role in [ROLE_DEVELOPER, ROLE_SUPER_ADMIN, ROLE_ADMIN, ROLE_VIEWER]:
            if ROLE_GROUPS[role] in group_names:
                return role
        return ROLE_VIEWER

    def _secret_hash(self, username):
        if not self.client_secret:
            return ""
        digest = hmac.new(
            self.client_secret.encode("utf-8"),
            msg=(username + self.client_id).encode("utf-8"),
            digestmod=hashlib.sha256,
        ).digest()
        return base64.b64encode(digest).decode("utf-8")
