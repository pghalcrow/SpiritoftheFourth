import { Component } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { EmailService } from 'src/app/services/email.service';
import { States } from '../../utilities/states';
import { environment } from 'src/environments/environment';
import { MotorShowShirtItem } from 'src/app/models/motorShowShirtItem';
import { faCartShopping } from '@fortawesome/free-solid-svg-icons'
import { ActivatedRoute } from '@angular/router';
import { OrderService } from 'src/app/services/order.service';

declare var PayPal: any;
declare var bootstrap: any;
declare var Stripe: any;

@Component({
  selector: 'app-wheels-of-freedom',
  templateUrl: './wheels-of-freedom.component.html',
  styleUrls: ['./wheels-of-freedom.component.css']
})
export class WheelsOfFreedomComponent {

  faCartShopping = faCartShopping;

  // ✅ SINGLE FORM (replaces carShowForm)
  motorShowForm: FormGroup;

  states = new States().states;

  isLoading: boolean = false;
  showSuccess: boolean = false;
  showError: boolean = false;
  paymentMethod: string = 'paypal';
  showStripeCheckout: boolean = false;
  stripeCheckout: any = null;
  stripeIsLoading: boolean = false;

  cartTotal: number = 0;
  customerInfo: any = {};

  shirtItems: MotorShowShirtItem[] = [];

  shirtPlaqueComboPrice = 35;

  additionalShirtsItemsDict: { [key: string]: MotorShowShirtItem } = {};

  cartAdditionalShirtsCounterDict: { [key: string]: number } = {
    "Plaque": 0,
    "Small": 0,
    "Medium": 0,
    "Large": 0,
    "XLarge": 0,
    "XXLarge": 0,
    "XXXLarge": 0
  };

  tShirtSizes: string[] = [
    "Small",
    "Medium",
    "Large",
    "XLarge",
    "XXLarge",
    "XXXLarge"
  ];

  constructor(
    private fb: FormBuilder,
    private emailService: EmailService,
    private orderService: OrderService,
    private route: ActivatedRoute
  ) {

    // ✅ SINGLE FORM INIT
    this.motorShowForm = this.fb.group({
      firstName: ['', Validators.required],
      lastName: ['', Validators.required],
      email: ['', [Validators.required, Validators.email]],
      phone: ['', [Validators.minLength(12), Validators.maxLength(12)]],

      streetAddress: ['', Validators.required],
      city: ['', Validators.required],
      zipcode: ['', [Validators.required, Validators.minLength(5), Validators.maxLength(5)]],
      state: ['CA', Validators.required],

      year: ['', [Validators.required, Validators.minLength(4), Validators.maxLength(4)]],
      make: ['', Validators.required],
      model: ['', Validators.required],
      color: ['', Validators.required],
      clubAffiliation: [''],

      addShirtBundle: [false],
      selectedShirt: [null]
    });

    // shirts
    this.shirtItems.push(
      { price: 5, size: "Plaque", description: "Additional Plaque" },
      { price: 24, size: "Small", description: "Additional T-Shirt Small" },
      { price: 24, size: "Medium", description: "Additional T-Shirt Medium" },
      { price: 24, size: "Large", description: "Additional T-Shirt Large" },
      { price: 24, size: "XLarge", description: "Additional T-Shirt XLarge" },
      { price: 26, size: "XXLarge", description: "Additional T-Shirt XXLarge" },
      { price: 26, size: "XXXLarge", description: "Additional T-Shirt XXXLarge" }
    );

    this.shirtItems.forEach(shirt => {
      this.additionalShirtsItemsDict[shirt.size] = shirt;
    });
  }

  formatPhone() {
    const control = this.motorShowForm.get('phone');
    if (!control) return;

    let value = control.value || '';

    // remove all non-digits
    value = value.replace(/\D/g, '');

    // format: 111-111-1111
    if (value.length > 6) {
      value = value.slice(0, 3) + '-' + value.slice(3, 6) + '-' + value.slice(6, 10);
    } else if (value.length > 3) {
      value = value.slice(0, 3) + '-' + value.slice(3);
    }

    control.setValue(value, { emitEvent: false });
  }

  digitsOnly(field: string, maxLength: number) {
  const control = this.motorShowForm.get(field);
  if (!control) return;

  let value = control.value || '';

  value = value.replace(/\D/g, '');
  value = value.slice(0, maxLength);

  control.setValue(value, { emitEvent: false });
}
  // CART LOGIC

  updateCartTotal() {
    const baseFee = 25;
    const bundleFee = this.motorShowForm.get('addShirtBundle')?.value
    ? this.shirtPlaqueComboPrice
    : 0;
    const extras =
      (this.additionalShirtsItemsDict["Plaque"].price * this.cartAdditionalShirtsCounterDict["Plaque"]) +
      (this.additionalShirtsItemsDict["Small"].price * this.cartAdditionalShirtsCounterDict["Small"]) +
      (this.additionalShirtsItemsDict["Medium"].price * this.cartAdditionalShirtsCounterDict["Medium"]) +
      (this.additionalShirtsItemsDict["Large"].price * this.cartAdditionalShirtsCounterDict["Large"]) +
      (this.additionalShirtsItemsDict["XLarge"].price * this.cartAdditionalShirtsCounterDict["XLarge"]) +
      (this.additionalShirtsItemsDict["XXLarge"].price * this.cartAdditionalShirtsCounterDict["XXLarge"]) +
      (this.additionalShirtsItemsDict["XXXLarge"].price * this.cartAdditionalShirtsCounterDict["XXXLarge"]);
    
    this.cartTotal = baseFee + bundleFee + extras;
  }

  increment(item: string) {
    if (this.cartAdditionalShirtsCounterDict[item] < 5) {
      this.cartAdditionalShirtsCounterDict[item]++;
    }
    this.updateCartTotal();
  }

  decrement(item: string) {
    if (this.cartAdditionalShirtsCounterDict[item] > 0) {
      this.cartAdditionalShirtsCounterDict[item]--;
    }
    this.updateCartTotal();
  }

  // INIT

  ngOnInit() {

    const carModal = document.getElementById('motorShowModal');

    carModal?.addEventListener('hidden.bs.modal', () => {
      this.isLoading = false;
      this.showSuccess = false;
      this.showError = false;
      this.destroyStripeCheckout();

      this.motorShowForm.reset();
      this.motorShowForm.enable();

      this.updateCartTotal();
    });

    this.route.queryParams.subscribe(params => {
      let placeOrder = params['order'] ?? "";
      if (placeOrder == 'true') {
        document.getElementById('purchasePlaqueModalToggle')?.click();
      }});
    
    this.motorShowForm.get('addShirtBundle')?.valueChanges.subscribe(() => {
      this.updateCartTotal();
    });

    this.updateCartTotal();

    // PayPal Donation (unchanged)
    PayPal.Donation.Button({
      onInit: function () {
        console.log('called');
      },
      env: 'production',
      hosted_button_id: 'ERLZZZF5H4NSN',
      image: {
        title: 'PayPal - The safer, easier way to pay online!',
        alt: 'Donate with PayPal button'
      },
      onComplete: function () {
        console.log('called');
      },
    }).render('#paypal-donate-button-motor-form');
  }

  // ORDER FLOW

  onOrderSubmit() {

    console.log("reached");
    this.isLoading = true;

    const form = this.motorShowForm.value;
    const selectedShirt = form.selectedShirt;

    const basePayload = {
      type: 'motorShowOrder',
      firstName: form.firstName,
      lastName: form.lastName,
      email: form.email,
      phone: form.phone,
      streetAddress: form.streetAddress,
      city: form.city,
      state: form.state,
      zipcode: form.zipcode,
      year: form.year,
      make: form.make,
      model: form.model,
      color: form.color,
      clubAffiliation: form.clubAffiliation,
      comboSize: selectedShirt ? selectedShirt.size : null,
      total: this.cartTotal,
      grandTotal: this.cartTotal,
      additionalPlaques: this.cartAdditionalShirtsCounterDict["Plaque"],
      additionalSmall: this.cartAdditionalShirtsCounterDict["Small"],
      additionalMedium: this.cartAdditionalShirtsCounterDict["Medium"],
      additionalLarge: this.cartAdditionalShirtsCounterDict["Large"],
      additionalXLarge: this.cartAdditionalShirtsCounterDict["XLarge"],
      additionalXXLarge: this.cartAdditionalShirtsCounterDict["XXLarge"],
      additionalXXXLarge: this.cartAdditionalShirtsCounterDict["XXXLarge"],
    };

    this.orderService.submitOrder({ ...basePayload, action: 'createOrder' }).subscribe({
      next: result => {
        this.isLoading = false;
        const links = result['links'];
        links.forEach((link: any) => {
          if (link['rel'] === 'payer-action') {
            document.location.href = link['href'];
          }
        });
        const modalEl = document.getElementById('motorShowModal');
        const modal = bootstrap?.Modal.getInstance(modalEl);
        modal?.hide();
      },
      error: error => {
        console.log(error);
        this.isLoading = false;
        alert("an error has occurred. please contact support.");
      }
    });
  }

  // STRIPE EMBEDDED CHECKOUT

  onStripeClick() {
    this.motorShowForm.markAllAsTouched();
    if (!this.motorShowForm.valid) return;

    const form = this.motorShowForm.value;
    const selectedShirt = form.selectedShirt;
    this.stripeIsLoading = true;

    const payload = {
      type: 'motorShowOrder',
      firstName: form.firstName,
      lastName: form.lastName,
      email: form.email,
      phone: form.phone,
      streetAddress: form.streetAddress,
      city: form.city,
      state: form.state,
      zipcode: form.zipcode,
      year: form.year,
      make: form.make,
      model: form.model,
      color: form.color,
      clubAffiliation: form.clubAffiliation,
      comboSize: selectedShirt ? selectedShirt.size : null,
      total: this.cartTotal,
      grandTotal: this.cartTotal,
      additionalPlaques: this.cartAdditionalShirtsCounterDict['Plaque'],
      additionalSmall: this.cartAdditionalShirtsCounterDict['Small'],
      additionalMedium: this.cartAdditionalShirtsCounterDict['Medium'],
      additionalLarge: this.cartAdditionalShirtsCounterDict['Large'],
      additionalXLarge: this.cartAdditionalShirtsCounterDict['XLarge'],
      additionalXXLarge: this.cartAdditionalShirtsCounterDict['XXLarge'],
      additionalXXXLarge: this.cartAdditionalShirtsCounterDict['XXXLarge'],
    };

    this.orderService.createStripeEmbeddedSession(payload).subscribe({
      next: async (response) => {
        const clientSecret = response.client_secret;
        const stripe = Stripe(environment.stripe.pk);
        this.showStripeCheckout = true;
        this.stripeIsLoading = false;
        await new Promise(r => setTimeout(r, 50));
        this.stripeCheckout = await stripe.initEmbeddedCheckout({
          fetchClientSecret: () => Promise.resolve(clientSecret)
        });
        this.stripeCheckout.mount('#stripe-checkout-wof');
      },
      error: () => {
        this.stripeIsLoading = false;
        alert('Error initiating payment. Please try again.');
      }
    });
  }

  destroyStripeCheckout() {
    if (this.stripeCheckout) {
      this.stripeCheckout.destroy();
      this.stripeCheckout = null;
    }
    this.showStripeCheckout = false;
  }

  // PAY BY CHECK

  onPayByCheck() {
    this.motorShowForm.markAllAsTouched();
    if (!this.motorShowForm.valid) return;

    const form = this.motorShowForm.value;

    const shirtLine = form.addShirtBundle
      ? `Yes — ${form.selectedShirt?.size ?? ''}`
      : 'No';

    const adminBody =
      `New Motor Show Entry — Pay by Check\n\n` +
      `Name: ${form.firstName} ${form.lastName}\n` +
      `Email: ${form.email}\n` +
      `Phone: ${form.phone}\n` +
      `Address: ${form.streetAddress}, ${form.city}, ${form.state} ${form.zipcode}\n\n` +
      `Vehicle: ${form.year} ${form.make} ${form.model} (${form.color})\n` +
      `Club Affiliation: ${form.clubAffiliation || 'N/A'}\n` +
      `T-Shirt & Plaque Bundle: ${shirtLine}\n` +
      `Total: $${this.cartTotal}.00\n\n` +
      `Customer will mail check to: The Spirit of the Fourth, P.O. Box 270736, San Diego, CA 92198 by June 15.`;

    this.emailService.sendEmail(
      environment.forms.carShow.toEamil,
      adminBody,
      'New Motor Show Entry — Check Payment',
      form.email,
      `${form.firstName} ${form.lastName}`,
      form.phone
    ).subscribe();

    const receiptBody =
      `Thank you for registering for the Wheels of Freedom Motor Show!\n\n` +
      `Your entry has been received. Please mail your check for $${this.cartTotal}.00 ` +
      `by June 15 to:\n\n` +
      `  The Spirit of the Fourth\n  P.O. Box 270736\n  San Diego, CA 92198\n\n` +
      `Entry Details:\n` +
      `  Name: ${form.firstName} ${form.lastName}\n` +
      `  Vehicle: ${form.year} ${form.make} ${form.model} (${form.color})\n` +
      `  T-Shirt & Plaque Bundle: ${shirtLine}\n` +
      `  Total Due: $${this.cartTotal}.00`;

    this.emailService.sendEmail(
      form.email,
      receiptBody,
      'Wheels of Freedom Motor Show — Entry Confirmation',
      environment.forms.carShow.toEamil,
      'Spirit of the Fourth',
      ''
    ).subscribe();

    const shirtBundleLine = form.addShirtBundle
      ? `<p><strong>T-Shirt &amp; Plaque Bundle:</strong> ${form.selectedShirt?.size ?? ''}</p>`
      : '';
    const clubLine = form.clubAffiliation
      ? `<p><strong>Club Affiliation:</strong> ${form.clubAffiliation}</p>`
      : '';

    const printHtml = `<!DOCTYPE html>
<html>
<head>
  <title>Wheels of Freedom — Entry Form</title>
  <style>
    body { font-family: Arial, sans-serif; color: #0A3161; padding: 48px; margin: 0; }
    h2 { font-size: 1.5rem; margin-bottom: 4px; }
    h4 { font-size: 1.1rem; margin: 4px 0 16px; }
    h5 { margin: 16px 0 8px; }
    p { margin: 4px 0; font-size: 1rem; }
    hr { margin: 16px 0; border: none; border-top: 1px solid #ccc; }
  </style>
</head>
<body>
  <h2>Wheels of Freedom Motor Show — Entry Form</h2>
  <h4>Spirit of the Fourth &nbsp;|&nbsp; July 4th</h4>
  <p><strong>Payment by Check</strong> — must be received by June 15</p>
  <p>Mail check to: The Spirit of the Fourth, P.O. Box 270736, San Diego, CA 92198</p>
  <hr/>
  <h5>Contact Information</h5>
  <p><strong>Name:</strong> ${form.firstName} ${form.lastName}</p>
  <p><strong>Email:</strong> ${form.email}</p>
  <p><strong>Phone:</strong> ${form.phone}</p>
  <p><strong>Address:</strong> ${form.streetAddress}, ${form.city}, ${form.state} ${form.zipcode}</p>
  <hr/>
  <h5>Vehicle Information</h5>
  <p><strong>Year:</strong> ${form.year}</p>
  <p><strong>Make:</strong> ${form.make}</p>
  <p><strong>Model:</strong> ${form.model}</p>
  <p><strong>Color:</strong> ${form.color}</p>
  ${clubLine}
  <hr/>
  ${shirtBundleLine}
  <h4><strong>Total Due: $${this.cartTotal}.00</strong></h4>
</body>
</html>`;

    const printWindow = window.open('', '_blank', 'width=800,height=600');
    if (printWindow) {
      printWindow.document.write(printHtml);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => { printWindow.print(); printWindow.close(); }, 250);
    }
  }

  // FORM SUBMIT

  onSubmit() {

    this.motorShowForm.markAllAsTouched();

    if (!this.motorShowForm.valid) return;

    this.customerInfo = this.motorShowForm.value;

  // 🔥 immediately move to PayPal flow
    this.onOrderSubmit();

  }
}
