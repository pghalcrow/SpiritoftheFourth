import json
import stripe


class StripeOrderService:
    def __init__(self, api_key):
        stripe.api_key = api_key

    def create_checkout_session(self, event_type, submission_id, line_items, customer_email, return_base_url, cancel_path="/upcomingevents"):
        metadata = {
            "event_type": event_type,
            "submission_id": submission_id
        }
        session_params = {
            "payment_method_types": ["card"],
            "mode": "payment",
            "line_items": line_items,
            "success_url": f"{return_base_url}/order/success?session_id={{CHECKOUT_SESSION_ID}}&order_type={event_type}",
            "cancel_url": f"{return_base_url}{cancel_path}",
            "metadata": metadata
        }
        if customer_email:
            session_params["customer_email"] = customer_email
        try:
            session = stripe.checkout.Session.create(**session_params)
            return {"statusCode": 200, "body": json.dumps({"session_url": session.url})}
        except stripe.error.StripeError as e:
            print(f"❌ Stripe session creation error: {e}")
            return {"statusCode": 500, "body": json.dumps({"error": str(e)})}

    def create_embedded_checkout_session(self, event_type, submission_id, line_items, customer_email, return_base_url):
        metadata = {
            "event_type": event_type,
            "submission_id": submission_id
        }
        session_params = {
            "payment_method_types": ["card"],
            "mode": "payment",
            "ui_mode": "embedded_page",
            "line_items": line_items,
            "return_url": f"{return_base_url}/order/success?session_id={{CHECKOUT_SESSION_ID}}&order_type={event_type}",
            "metadata": metadata
        }
        if customer_email:
            session_params["customer_email"] = customer_email
        try:
            session = stripe.checkout.Session.create(**session_params)
            return {"statusCode": 200, "body": json.dumps({"client_secret": session.client_secret})}
        except stripe.error.StripeError as e:
            print(f"❌ Stripe embedded session creation error: {e}")
            return {"statusCode": 500, "body": json.dumps({"error": str(e)})}

    def retrieve_session(self, session_id):
        try:
            session = stripe.checkout.Session.retrieve(session_id, expand=["payment_intent"])
            if hasattr(session, "_to_dict_recursive"):
                session = session._to_dict_recursive()
            return {"statusCode": 200, "body": json.dumps(session)}
        except stripe.error.StripeError as e:
            return {"statusCode": 500, "body": json.dumps({"error": str(e)})}

    def list_line_items(self, session_id):
        try:
            response = stripe.checkout.Session.list_line_items(session_id, limit=100)
            return {
                "data": [
                    {
                        "description": item.description,
                        "quantity": item.quantity,
                        "price": {"unit_amount": item.price.unit_amount if item.price else 0}
                    }
                    for item in response.data
                ]
            }
        except stripe.error.StripeError as e:
            print(f"❌ Failed to list Stripe line items: {e}")
            return {"data": []}
