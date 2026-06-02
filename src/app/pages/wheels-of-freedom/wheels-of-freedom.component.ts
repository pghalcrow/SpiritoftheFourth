import { Component } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { EmailService } from 'src/app/services/email.service';
import { States } from '../../utilities/states';
import { environment } from 'src/environments/environment';
import { MotorShowShirtItem } from 'src/app/models/motorShowShirtItem';
import { faCartShopping } from '@fortawesome/free-solid-svg-icons'
import { ActivatedRoute } from '@angular/router';
import { OrderService } from 'src/app/services/order.service';
import { PaypalDonationService } from 'src/app/services/paypal-donation.service';
import { debounceTime, Subscription } from 'rxjs';

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
  stripePreloadInFlight: boolean = false;
  preloadedStripeClientSecret: string | null = null;
  private preloadedStripePayloadKey: string | null = null;
  private stripePreloadRequestKey: string | null = null;
  private stripePreloadSubscription: Subscription | null = null;
  private cartPreloadTimer: ReturnType<typeof setTimeout> | null = null;
  private stripePreloadWaiters: Array<{
    payloadKey: string;
    callback: (clientSecret: string | null) => void;
  }> = [];

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
    private paypalDonationService: PaypalDonationService,
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
    this.scheduleStripePreload();
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

    this.stripePreloadSubscription = this.motorShowForm.valueChanges
      .pipe(debounceTime(700))
      .subscribe(() => this.preloadStripeCheckoutIfReady());

    this.updateCartTotal();

    this.paypalDonationService.renderDonationButton('#paypal-donate-button-motor-form');
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

    const payload = this.buildStripePayload();
    const payloadKey = this.getStripePayloadKey(payload);

    if (this.preloadedStripeClientSecret && this.preloadedStripePayloadKey === payloadKey) {
      this.mountStripeCheckout(this.preloadedStripeClientSecret);
      return;
    }

    if (this.stripePreloadInFlight && this.stripePreloadRequestKey === payloadKey) {
      this.stripeIsLoading = true;
      this.stripePreloadWaiters.push({
        payloadKey,
        callback: (clientSecret) => {
          if (clientSecret && this.getStripePayloadKey(this.buildStripePayload()) === payloadKey) {
            this.mountStripeCheckout(clientSecret);
            return;
          }

          this.createAndMountStripeCheckout(payload);
        }
      });
      return;
    }

    this.stripeIsLoading = true;
    this.createAndMountStripeCheckout(payload);
  }

  private createAndMountStripeCheckout(payload: any) {
    this.orderService.createStripeEmbeddedSession(payload).subscribe({
      next: async (response) => {
        await this.mountStripeCheckout(response.client_secret);
      },
      error: () => {
        this.stripeIsLoading = false;
        alert('Error initiating payment. Please try again.');
      }
    });
  }

  buildStripePayload() {
    const form = this.motorShowForm.value;
    const selectedShirt = form.selectedShirt;

    return {
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
  }

  preloadStripeCheckoutIfReady() {
    if (!this.motorShowForm.valid || this.showStripeCheckout) return;

    const payload = this.buildStripePayload();
    const payloadKey = this.getStripePayloadKey(payload);

    if (this.preloadedStripeClientSecret && this.preloadedStripePayloadKey === payloadKey) return;
    if (this.stripePreloadInFlight && this.stripePreloadRequestKey === payloadKey) return;

    this.preloadedStripeClientSecret = null;
    this.preloadedStripePayloadKey = null;
    this.stripePreloadInFlight = true;
    this.stripePreloadRequestKey = payloadKey;

    this.orderService.createStripeEmbeddedSession(payload).subscribe({
      next: (response) => {
        const latestPayloadKey = this.motorShowForm.valid
          ? this.getStripePayloadKey(this.buildStripePayload())
          : null;

        if (latestPayloadKey === payloadKey) {
          this.preloadedStripeClientSecret = response.client_secret;
          this.preloadedStripePayloadKey = payloadKey;
        }

        this.resolveStripePreloadWaiters(
          payloadKey,
          latestPayloadKey === payloadKey ? response.client_secret : null
        );
        this.finishStripePreload(payloadKey);
      },
      error: () => {
        this.resolveStripePreloadWaiters(payloadKey, null);
        this.finishStripePreload(payloadKey);
      }
    });
  }

  private scheduleStripePreload() {
    if (this.cartPreloadTimer) {
      clearTimeout(this.cartPreloadTimer);
    }

    this.cartPreloadTimer = setTimeout(() => this.preloadStripeCheckoutIfReady(), 700);
  }

  private getStripePayloadKey(payload: any): string {
    return JSON.stringify(payload);
  }

  private finishStripePreload(payloadKey: string) {
    if (this.stripePreloadRequestKey === payloadKey) {
      this.stripePreloadInFlight = false;
      this.stripePreloadRequestKey = null;
    }
  }

  private resolveStripePreloadWaiters(payloadKey: string, clientSecret: string | null) {
    const matchingWaiters = this.stripePreloadWaiters.filter(waiter => waiter.payloadKey === payloadKey);
    this.stripePreloadWaiters = this.stripePreloadWaiters.filter(waiter => waiter.payloadKey !== payloadKey);
    matchingWaiters.forEach(waiter => waiter.callback(clientSecret));
  }

  private async mountStripeCheckout(clientSecret: string) {
    const stripe = Stripe(environment.stripe.pk);
    this.showStripeCheckout = true;
    this.stripeIsLoading = false;
    await new Promise(r => setTimeout(r, 50));
    this.stripeCheckout = await stripe.initEmbeddedCheckout({
      fetchClientSecret: () => Promise.resolve(clientSecret)
    });
    this.stripeCheckout.mount('#stripe-checkout-wof');
  }

  destroyStripeCheckout() {
    if (this.stripeCheckout) {
      this.stripeCheckout.destroy();
      this.stripeCheckout = null;
    }
    this.showStripeCheckout = false;
  }

  ngOnDestroy() {
    this.stripePreloadSubscription?.unsubscribe();
    if (this.cartPreloadTimer) {
      clearTimeout(this.cartPreloadTimer);
    }
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
      ? form.selectedShirt?.size ?? ''
      : 'No';
    const clubLine = form.clubAffiliation || 'None';
    const additionalItemsRows = this.shirtItems
      .filter(shirt => this.cartAdditionalShirtsCounterDict[shirt.size] > 0)
      .map(shirt => `
        <tr>
          <th>${shirt.description}</th>
          <td>${this.cartAdditionalShirtsCounterDict[shirt.size]} x $${shirt.price}.00</td>
        </tr>
      `)
      .join('');

    const printHtml = `<!DOCTYPE html>
<html>
<head>
  <title>Wheels of Freedom — Entry Form</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: Arial, sans-serif;
      color: #172b3a;
      font-size: 12px;
      line-height: 1.35;
      margin: 0;
      padding: 32px;
      background: #ffffff;
    }
    .sheet {
      max-width: 720px;
      margin: 0 auto;
      border: 1px solid #d8e1e8;
      padding: 28px;
    }
    .header {
      border-bottom: 3px solid #0A3161;
      padding-bottom: 14px;
      margin-bottom: 18px;
    }
    h1 {
      color: #0A3161;
      font-size: 22px;
      line-height: 1.15;
      margin: 0 0 4px;
    }
    .subtitle {
      color: #4b5b67;
      font-size: 13px;
      margin: 0;
    }
    .payment-box {
      background: #f3f8fb;
      border: 1px solid #b8d1df;
      border-left: 5px solid #0A3161;
      padding: 14px 16px;
      margin: 18px 0;
    }
    .payment-box h2 {
      color: #0A3161;
      font-size: 16px;
      margin: 0 0 8px;
    }
    .payment-box p {
      margin: 4px 0;
    }
    .section {
      margin-top: 18px;
    }
    .section h3 {
      color: #0A3161;
      font-size: 14px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      margin: 0 0 8px;
      border-bottom: 1px solid #d8e1e8;
      padding-bottom: 5px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
    }
    th,
    td {
      font-size: 12px;
      padding: 6px 8px;
      border-bottom: 1px solid #edf1f4;
      vertical-align: top;
      text-align: left;
    }
    th {
      width: 34%;
      color: #52616d;
      font-weight: 700;
    }
    .total {
      margin-top: 18px;
      padding: 12px 16px;
      background: #0A3161;
      color: #ffffff;
      font-size: 18px;
      font-weight: 700;
      text-align: right;
    }
    .footer-note {
      margin-top: 14px;
      color: #52616d;
      font-size: 11px;
    }
    @media print {
      body { padding: 0.35in; }
      .sheet { border: none; padding: 0; max-width: none; }
    }
  </style>
</head>
<body>
  <main class="sheet">
    <header class="header">
      <h1>Wheels of Freedom Motor Show Entry</h1>
      <p class="subtitle">Spirit of the Fourth | July 4th | Pay by Check Confirmation</p>
    </header>

    <section class="payment-box">
      <h2>Payment Instructions</h2>
      <p><strong>Amount due:</strong> $${this.cartTotal}.00</p>
      <p><strong>Payment deadline:</strong> Check must be received by June 15.</p>
      <p><strong>Make check payable to:</strong> The Spirit of the Fourth</p>
      <p><strong>Mail to:</strong> P.O. Box 270736, San Diego, CA 92198</p>
    </section>

    <section class="section">
      <h3>Contact Information</h3>
      <table>
        <tr><th>Name</th><td>${form.firstName} ${form.lastName}</td></tr>
        <tr><th>Email</th><td>${form.email}</td></tr>
        <tr><th>Phone</th><td>${form.phone || 'Not provided'}</td></tr>
        <tr><th>Address</th><td>${form.streetAddress}, ${form.city}, ${form.state} ${form.zipcode}</td></tr>
      </table>
    </section>

    <section class="section">
      <h3>Vehicle Information</h3>
      <table>
        <tr><th>Vehicle</th><td>${form.year} ${form.make} ${form.model}</td></tr>
        <tr><th>Color</th><td>${form.color}</td></tr>
        <tr><th>Club Affiliation</th><td>${clubLine}</td></tr>
      </table>
    </section>

    <section class="section">
      <h3>Registration Items</h3>
      <table>
        <tr><th>Entry Fee</th><td>$25.00</td></tr>
        <tr><th>T-Shirt &amp; Plaque Bundle</th><td>${shirtBundleLine}</td></tr>
        ${additionalItemsRows || '<tr><th>Additional Items</th><td>None</td></tr>'}
      </table>
    </section>

    <div class="total">Total Due: $${this.cartTotal}.00</div>
    <p class="footer-note">Please include this printed confirmation with your mailed check if possible.</p>
  </main>
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
