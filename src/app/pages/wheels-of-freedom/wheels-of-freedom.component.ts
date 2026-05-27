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

    if (this.paymentMethod === 'stripe') {
      this.orderService.createStripeOrder(basePayload).subscribe({
        next: response => {
          this.isLoading = false;
          if (response?.session_url) {
            window.location.href = response.session_url;
          }
        },
        error: error => {
          console.log(error);
          this.isLoading = false;
          alert("an error has occurred. please contact support.");
        }
      });
    } else {
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
