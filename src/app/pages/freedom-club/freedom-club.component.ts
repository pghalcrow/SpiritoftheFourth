import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { AbstractControl, FormBuilder, FormGroup, ValidationErrors, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { OrderService } from 'src/app/services/order.service';
import { environment } from 'src/environments/environment';

declare var Stripe: any;

@Component({
  selector: 'app-freedom-club',
  templateUrl: './freedom-club.component.html',
  styleUrls: ['./freedom-club.component.css']
})
export class FreedomClubComponent implements OnInit {
  readonly presetAmounts = [25, 50, 100, 150, 200, 300, 500];
  readonly donationTitle = 'Freedom Club Donation';
  readonly officerRecipients = environment.forms.freedomClubDonation.toEamil;

  donationForm: FormGroup;
  selectedAmount: number | null = 150;
  isDonationFormOpen = false;
  paymentError = '';
  paypalIsLoading = false;
  stripeIsLoading = false;
  showStripeCheckout = false;
  stripeCheckout: any = null;

  @ViewChild('donationFormSection') donationFormSection?: ElementRef;

  constructor(
    private fb: FormBuilder,
    private orderService: OrderService,
    private route: ActivatedRoute
  ) {
    this.donationForm = this.fb.group({
      fullName: ['', Validators.required],
      email: ['', [Validators.required, Validators.email]],
      phone: ['', Validators.required],
      customAmount: [''],
    }, { validators: [this.donationAmountValidator.bind(this)] });
  }

  ngOnInit(): void {
    if (this.route.snapshot.queryParamMap.get('donate') === 'true') {
      this.openDonationForm();
    }
  }

  get currentAmount(): number {
    if (this.selectedAmount !== null) return this.selectedAmount;
    return Number(this.donationForm.get('customAmount')?.value || 0);
  }

  openDonationForm(): void {
    this.isDonationFormOpen = true;
    this.paymentError = '';
    window.setTimeout(() => this.donationFormSection?.nativeElement.scrollIntoView({
      behavior: 'smooth',
      block: 'start'
    }));
  }

  selectAmount(amount: number): void {
    this.selectedAmount = amount;
    this.donationForm.patchValue({ customAmount: '' });
    this.donationForm.updateValueAndValidity();
  }

  selectCustomAmount(): void {
    this.selectedAmount = null;
    this.donationForm.updateValueAndValidity();
  }

  submitPayPalDonation(): void {
    if (!this.prepareForPayment()) return;

    this.paypalIsLoading = true;
    this.orderService.createEventPayPalOrder({
      ...this.buildDonationPayload('paypal'),
      action: 'createOrder',
    }).subscribe({
      next: (result) => {
        const payerAction = (result?.links || []).find((link: any) => link.rel === 'payer-action');
        if (payerAction?.href) {
          document.location.href = payerAction.href;
          return;
        }
        this.paypalIsLoading = false;
      },
      error: () => {
        this.paypalIsLoading = false;
        this.paymentError = 'Could not start PayPal payment. Please try again.';
      }
    });
  }

  submitStripeDonation(): void {
    if (!this.prepareForPayment()) return;

    this.stripeIsLoading = true;
    this.destroyStripeCheckout();
    this.orderService.createStripeEmbeddedSession(this.buildDonationPayload('stripe')).subscribe({
      next: async (response) => {
        try {
          const clientSecret = response.client_secret;
          if (!clientSecret) throw new Error('Missing Stripe client secret.');

          const stripe = Stripe(response.publishable_key || environment.stripe.pk);
          this.showStripeCheckout = true;
          await new Promise(r => setTimeout(r, 50));
          this.stripeCheckout = await stripe.initEmbeddedCheckout({
            fetchClientSecret: () => Promise.resolve(clientSecret)
          });
          this.stripeCheckout.mount('#stripe-checkout-freedom-club');
          this.stripeIsLoading = false;
        } catch {
          this.stripeIsLoading = false;
          this.paymentError = 'Could not start card payment. Please try again.';
        }
      },
      error: () => {
        this.stripeIsLoading = false;
        this.paymentError = 'Could not start card payment. Please try again.';
      }
    });
  }

  private prepareForPayment(): boolean {
    this.paymentError = '';
    this.donationForm.markAllAsTouched();

    if (!this.donationForm.valid) {
      this.paymentError = 'Please complete your contact information and choose a donation amount.';
      return false;
    }

    return true;
  }

  private buildDonationPayload(paymentMethod: 'paypal' | 'stripe') {
    const form = this.donationForm.getRawValue();
    const amount = this.currentAmount;

    return {
      type: 'freedomClubDonation',
      eventTitle: this.donationTitle,
      formType: 'Freedom Club Donation',
      fullName: form.fullName,
      email: form.email,
      phone: form.phone,
      donationAmount: amount,
      grandTotal: amount,
      paymentMethod,
      toContact: this.officerRecipients,
      subject: environment.forms.freedomClubDonation.subject,
    };
  }

  private donationAmountValidator(control: AbstractControl): ValidationErrors | null {
    const customAmount = Number(control.get('customAmount')?.value || 0);
    const amount = this.selectedAmount !== null ? this.selectedAmount : customAmount;
    return amount > 0 ? null : { donationAmount: true };
  }

  private destroyStripeCheckout(): void {
    if (this.stripeCheckout) {
      this.stripeCheckout.destroy();
      this.stripeCheckout = null;
    }
    this.showStripeCheckout = false;
  }
}
