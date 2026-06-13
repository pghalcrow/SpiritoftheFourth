import requests
from requests.auth import HTTPBasicAuth


class OAuthClient:
    def __init__(self, client_id, client_secret, sandbox=True):
        self.client_id = client_id
        self.client_secret = client_secret
        self.base_url = "https://api.sandbox.paypal.com" if sandbox else "https://api.paypal.com"

    def get_access_token(self):

        headers = {
            "Accept": "application/json",
            "Accept-Language": "en_US",
        }
        data = {
            "grant_type": "client_credentials"
        }
        response = requests.post(self.base_url+"/v1/oauth2/token", headers=headers, data=data,
                                 auth=HTTPBasicAuth(self.client_id, self.client_secret))

        if response.status_code == 200:
            return response.json().get("access_token")
        else:
            response.raise_for_status()
