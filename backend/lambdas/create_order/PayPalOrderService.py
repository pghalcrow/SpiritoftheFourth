import requests
import json
import hmac
import hashlib


class PayPalOrderService:
    entry_fee = 25
    bundle_price = 35
    plaque_price = 5
    small_price = 24
    medium_price = 24
    large_price = 24
    xlarge_price = 24
    xxlarge_price = 26
    xxxlarge_price = 26

    def __init__(self, access_token, sandbox=False):
        self.access_token = access_token
        self.base_url = "https://api.sandbox.paypal.com" if sandbox else "https://api.paypal.com"




    def get_item_from_size(self, size: str, quantity: int, price: int):
        return {
            "name": f"{size} : additional T-Shirt",
            "quantity": f"{quantity}",
            "description": f"{size} : additional T-Shirt",
            "category": "DONATION",
            "unit_amount": {
                "currency_code": "USD",
                "value": str(price)
            }
        }

    def create_order(self,
                     combo_size: str,
                     plaques: int,
                     small: int = 0,
                     medium: int = 0,
                     large: int = 0,
                     xlarge: int = 0,
                     xxlarge: int = 0,
                     xxxlarge: int = 0,
                     return_base_url = "",
                     custom_id=None,
                     order_type=None
                     ):
        url = f"{self.base_url}/v2/checkout/orders"
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.access_token}"
        }

        print(f"create order called: combo_size: {combo_size}, plaques: {plaques}, small: {small}, "
              f"medium: {medium}, large: {large}, xlarge: {xlarge}, xxlarge: {xxlarge}, xxxlarge: {xxxlarge}")
        order_items = [
            {
                "name": "Motor Show Entry Fee",
                "quantity": "1",
                "description": "Motor Show Registration",
                "category": "DONATION",
                "unit_amount": {
                    "currency_code": "USD",
                    "value": str(self.entry_fee)
                }
            }
        ]

        total_amount = self.entry_fee

        if combo_size:
            total_amount += self.bundle_price

            order_items.append({
                "name": f"T-Shirt - {combo_size} and plaque combo",
                "quantity": "1",
                "description": f"T-Shirt - {combo_size} and plaque combo",
                "category": "DONATION",
                "unit_amount": {
                    "currency_code": "USD",
                    "value": str(self.bundle_price)
                }
            })
        if plaques > 0:
            total_amount += self.plaque_price * plaques
            order_items.append({
                "name": f"additional plaques",
                "quantity": f"{plaques}",
                "description": f"additional plaque",
                "category": "DONATION",
                "unit_amount": {
                    "currency_code": "USD",
                    "value": str(self.plaque_price)
                }
            })

        if small > 0:
            total_amount += self.small_price * small
            order_items.append(self.get_item_from_size("Small", small, self.small_price))

        if medium > 0:
            total_amount += self.medium_price * medium
            order_items.append(self.get_item_from_size("Medium", medium, self.medium_price))

        if large > 0:
            total_amount += self.large_price * large
            order_items.append(self.get_item_from_size("Large", large, self.large_price))

        if xlarge > 0:
            total_amount += self.xlarge_price * xlarge
            order_items.append(self.get_item_from_size("XLarge", xlarge, self.xlarge_price))

        if xxlarge > 0:
            total_amount += self.xxlarge_price * xxlarge
            order_items.append(self.get_item_from_size("2XLarge", xxlarge, self.xxlarge_price))

        if xxxlarge > 0:
            total_amount += self.xxxlarge_price * xxxlarge
            order_items.append(self.get_item_from_size("3XLarge", xxxlarge, self.xxxlarge_price))


        data = {
            "intent": "CAPTURE",
            "payment_source": {
                "paypal": {
                    "experience_context": {
                        "payment_method_preference": "IMMEDIATE_PAYMENT_REQUIRED",
                        "landing_page": "NO_PREFERENCE",
                        "shipping_preference": "NO_SHIPPING",
                        "user_action": "PAY_NOW",
                        "return_url": f"{return_base_url}/order/success?order_type={order_type}",
                        "cancel_url": f"{return_base_url}/order/cancel"
                    }
                }
            },
            "purchase_units": [
                {
                    "amount": {
                        "currency_code": "USD",
                        "value": total_amount,
                        "breakdown": {
                            "item_total": {
                                "currency_code": "USD",
                                "value": total_amount
                            }
                        }
                    },
                    "items": order_items
                }
            ]
        }

        if custom_id:
            data["purchase_units"][0]["custom_id"] = custom_id

        print("creating order: ")
        print(data)
        response = requests.post(url, headers=headers, json=data)

        if response.ok:
            return response.json()
        else:
            response.raise_for_status()


    def modular_create_order(self, items, return_base_url="", level=None, partner=None, custom_id=None, order_type=None):
        url = f"{self.base_url}/v2/checkout/orders"
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.access_token}"
        }

        total_amount = sum(
            int(item["quantity"]) * float(item["unit_amount"]["value"])
            for item in items
        )

        data = {
            "intent": "CAPTURE",
            "payment_source": {
                "paypal": {
                    "experience_context": {
                        "payment_method_preference": "IMMEDIATE_PAYMENT_REQUIRED",
                        "landing_page": "NO_PREFERENCE",
                        "shipping_preference": "NO_SHIPPING",
                        "user_action": "PAY_NOW",
                        "return_url": f"{return_base_url}/order/success?order_type={order_type}",
                        "cancel_url": f"{return_base_url}/order/cancel"
                    }
                }
            },
            "purchase_units": [
                {
                    "amount": {
                        "currency_code": "USD",
                        "value": f"{total_amount:.2f}",
                        "breakdown": {
                            "item_total": {
                                "currency_code": "USD",
                                "value": f"{total_amount:.2f}"
                            }
                        }
                    },
                    "items": items
                }
            ]
        }
        if level:
            data["purchase_units"][0]["level"] = level
        if partner:
            data["purchase_units"][0]["partner"] = partner
        if custom_id:
            data["purchase_units"][0]["custom_id"] = custom_id

        print("creating order: ")
        print(json.dumps(data, indent=2))
        try:
            response = requests.post(url, headers=headers, json=data)
            response.raise_for_status()
            return response.json()
        except requests.exceptions.HTTPError as e:
            # Log the error response details
            print(f"HTTP Error: {e}")
            print(response.text)
        except Exception as e:
            print(f"Error: {e}")

        return None


    def capture_order(self, order_id: str):
        url = f"{self.base_url}/v2/checkout/orders/{order_id}/capture"
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.access_token}"
        }
        response = requests.post(url, headers=headers)

        if response.ok:
            return response.json()
        else:
            print(f"❌ PayPal capture failed: {response.status_code} {response.text}")
            response.raise_for_status()

    def validate_webhook(self, webhook_id, webhook_event, webhook_signature, webhook_signature_key):
        expected_signature = hmac.new(
            webhook_signature_key.encode(),
            webhook_event.encode(),
            hashlib.sha256
        ).hexdigest()

        if hmac.compare_digest(expected_signature, webhook_signature):
            return True
        else:
            return False