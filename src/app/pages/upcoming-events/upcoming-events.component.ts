import { Component, OnInit, AfterViewInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators, FormArray } from '@angular/forms';
import { OrderService } from 'src/app/services/order.service';
import { CmsService, Event as CmsEvent } from 'src/app/services/cms.service';
import { Router, NavigationEnd } from '@angular/router';
import { environment } from 'src/environments/environment';
import { PaypalDonationService } from 'src/app/services/paypal-donation.service';

interface UIEvent extends CmsEvent {
  formGroup: FormGroup;
  fieldMap: { [key: string]: any };
}

declare var Stripe: any;

@Component({
  selector: 'app-upcoming-events',
  templateUrl: './upcoming-events.component.html',
  styleUrls: ['./upcoming-events.component.css']
})
export class UpcomingEventsComponent implements OnInit, AfterViewInit{
  // applyForm!: FormGroup;
  hasReloaded: boolean = false;
  paymentMethod: string = '';
  events: UIEvent[] = [];
  sponsorForm!: FormGroup;
  stripeCheckoutEventIndex: number | null = null;
  showSponsorStripeCheckout: boolean = false;
  stripeCheckout: any = null;
  stripeIsLoading: boolean = false;


  constructor(
    private fb: FormBuilder,
    private orderService: OrderService,
    private router: Router,
    private cmsService: CmsService,
    private paypalDonationService: PaypalDonationService
  ) {

    // refreshes page every time it is accessed
    this.router.events.subscribe(event => {
      if (
        event instanceof NavigationEnd &&
        event.urlAfterRedirects === '/upcomingevents' &&
        !sessionStorage.getItem('hasReloaded')
      ) {
        sessionStorage.setItem('hasReloaded', 'true');
        window.location.reload();
      }
    });
  }

  ngOnInit() {

    this.sponsorForm = this.fb.group({
      name: ['', Validators.required],
      email: ['', [Validators.required, Validators.email]],
      phone: ['', Validators.required]
    });

    this.cmsService.getEvents().subscribe({
      next: (data) => {
        this.events = data.events.map(event => {
          const fg = this.fb.group({});

          event.formFields.forEach(field => {

            const validators = [];
            if (field.required) validators.push(Validators.required);
            if (field.type === 'email') validators.push(Validators.email);

            // NORMAL FIELD
            if (field.type !== 'group') {
              const defaultValue = field.type === 'checkbox' ? false : '';
              
              fg.addControl(field.name, this.fb.control(defaultValue, validators));
            }

            // GROUP FIELD (team members)
            if (field.type === 'group') {
              const name = field.name || 'teamMembers';
              fg.addControl(name, this.fb.array([]));
              field.name = name;
            }

            event.pricing.addOns?.forEach((addOn: any) => {
              fg.addControl(addOn.field, this.fb.control(false));
            });

          });

          const fieldMap: any = {};

          event.formFields.forEach(f => {
            fieldMap[f.name] = f;
          });

          return {
            ...event,
            formGroup: fg,
            fieldMap: fieldMap
          };
        });
      },
      error: (err) => console.error('Failed to load events', err)
    });
  }

  ngAfterViewInit() {
    this.paypalDonationService.renderDonationButton('#paypal-donate-button-container-2');
  }

  getFlyerSrc(url: string): string {
    return this.cmsService.resolveAssetUrl(url);
  }

  // TS helper to get teamMembers as FormArray
  getMembers(fg: FormGroup, fieldName: string): FormArray {
    return fg.get(fieldName) as FormArray;
  }

  // Add a team member (limit 3)
  addMember(event: any, field: any) {

    const members = this.getMembers(event.formGroup, field.name);

    if (members.length >= field.maxMembers) return;

    const group: any = {};

    field.fields.forEach((f: any) => {
      const validators = [];
      if (f.required) validators.push(Validators.required);
      if (f.type === 'email') validators.push(Validators.email);

      group[f.name] = ['', validators];
    });

    members.push(this.fb.group(group));
  }

  // Remove a team member
  removeMember(fg: FormGroup, fieldName: string, index: number) {
    const members = this.getMembers(fg, fieldName);
    members.removeAt(index);
  }

  // reset reloading catch
  ngOnDestroy() {
    sessionStorage.removeItem('hasReloaded');
  }

  // findField(event: any, name: string) {
  //   return event.formFields.find((f: any) => f.name === name);
  // }

  collectAddOns(form: FormGroup, pricing: any) {
    const selected: any[] = [];

    pricing.addOns?.forEach((a: any) => {
      if (form.get(a.field)?.value) {
        selected.push({
          field: a.field,
          price: a.price
        });
      }
    });

    return selected;
  }

  calculateTotal(event: UIEvent): number {

    if (!event.formGroup) return 0;

    const form = event.formGroup;
    const pricing = event.pricing;

    let total = 0;

    const group = form.get(pricing.basePlayerField)?.value || [];
    let players = group.length;

    if (pricing.includePrimaryPlayer) players += 1;

    total += players * pricing.pricePerPlayer;

    pricing.addOns?.forEach((addOn: any) => {
      if (form.get(addOn.field)?.value) {
        total += addOn.price;
      }
    });

    return total;
  }

  // submit data to Stripe
  async onSubmit(eventData: UIEvent): Promise<void> {

    if (!eventData.formGroup) {
    console.error("FormGroup missing on event");
    return;
  }

  const form = eventData.formGroup;
  const grandTotal = this.calculateTotal(eventData);
  const pricing = eventData.pricing;

  const addOns = this.collectAddOns(form, pricing);

  const group = form.get(pricing.basePlayerField)?.value || [];
  let players = group.length;
  

  if (pricing.includePrimaryPlayer) players += 1;

  if (!form.valid) {
    console.log("form is invalid");
    form.markAllAsTouched();
    alert('Please fill out all required fields before submitting.');
    return;
  }

  console.log("FORM VALUE:", form.value);
  const groupArray = form.get(pricing.basePlayerField)?.value || [];

  const formData = {
    action: "createOrder",
    type: eventData.type,
    ...form.value,
    eventTitle: eventData.title,
    paymentMethod: this.paymentMethod,
    addOns: addOns,
    players: players,
    pricing: pricing,
    teamMembers: groupArray,
    grandTotal: grandTotal
  };

  console.log('Submitting form data:', formData);

  if (this.paymentMethod === 'paypal') {
    this.orderService.createEventPayPalOrder(formData).subscribe({
      next: (result) => {
        console.log('PayPal order created:', result);

        const links = result['links'];

        links.forEach((link: any) => {
          if (link['rel'] === 'payer-action') {
            document.location.href = link['href'];
          }
        });
      },
      error: (err) => {
        console.error('Error creating PayPal order:', err);
        alert('There was an error submitting your PayPal payment. Please try again.');
      }
    });
  }
}
sponsorPaymentMethod: string = 'paypal';

submitSponsor() {
  if (!this.sponsorForm.valid) {
    this.sponsorForm.markAllAsTouched();
    alert('Please fill out all fields.');
    return;
  }

  const baseData = {
    type: "sponsor",
    ...this.sponsorForm.value,
    eventTitle: "T Sign Hole Sponsorship",
    grandTotal: 100
  };

  if (this.sponsorPaymentMethod === 'paypal') {
    this.orderService.createEventPayPalOrder({ ...baseData, action: 'createOrder', paymentMethod: 'paypal' }).subscribe({
      next: (result) => {
        const links = result['links'];
        links.forEach((link: any) => {
          if (link.rel === 'payer-action') {
            document.location.href = link.href;
          }
        });
      },
      error: (err) => {
        console.error('Error creating PayPal order:', err);
        alert('Payment failed. Try again.');
      }
    });
  }
}

onStripeEvent(eventData: UIEvent, index: number) {
  const form = eventData.formGroup;
  const grandTotal = this.calculateTotal(eventData);
  const pricing = eventData.pricing;
  const addOns = this.collectAddOns(form, pricing);
  const groupArray = form.get(pricing.basePlayerField)?.value || [];
  let players = groupArray.length;
  if (pricing.includePrimaryPlayer) players += 1;

  if (!form.valid) {
    form.markAllAsTouched();
    alert('Please fill out all required fields before submitting.');
    return;
  }

  const payload = {
    type: eventData.type,
    ...form.value,
    eventTitle: eventData.title,
    addOns,
    players,
    pricing,
    teamMembers: groupArray,
    grandTotal
  };

  this.stripeIsLoading = true;
  this.orderService.createStripeEmbeddedSession(payload).subscribe({
    next: async (response) => {
      const clientSecret = response.client_secret;
      const stripe = Stripe(environment.stripe.pk);
      this.stripeCheckoutEventIndex = index;
      this.stripeIsLoading = false;
      await new Promise(r => setTimeout(r, 50));
      this.stripeCheckout = await stripe.initEmbeddedCheckout({
        fetchClientSecret: () => Promise.resolve(clientSecret)
      });
      this.stripeCheckout.mount(`#stripe-checkout-event-${index}`);
    },
    error: () => {
      this.stripeIsLoading = false;
      alert('Error initiating payment. Please try again.');
    }
  });
}

onSponsorStripeClick() {
  if (!this.sponsorForm.valid) {
    this.sponsorForm.markAllAsTouched();
    alert('Please fill out all fields.');
    return;
  }

  const payload = {
    type: 'sponsor',
    ...this.sponsorForm.value,
    eventTitle: 'T Sign Hole Sponsorship',
    grandTotal: 100
  };

  this.stripeIsLoading = true;
  this.orderService.createStripeEmbeddedSession(payload).subscribe({
    next: async (response) => {
      const clientSecret = response.client_secret;
      const stripe = Stripe(environment.stripe.pk);
      this.showSponsorStripeCheckout = true;
      this.stripeIsLoading = false;
      await new Promise(r => setTimeout(r, 50));
      this.stripeCheckout = await stripe.initEmbeddedCheckout({
        fetchClientSecret: () => Promise.resolve(clientSecret)
      });
      this.stripeCheckout.mount('#stripe-checkout-sponsor');
    },
    error: () => {
      this.stripeIsLoading = false;
      alert('Error initiating payment. Please try again.');
    }
  });
}

cancelEventStripe() {
  this.destroyStripeCheckout();
  this.stripeCheckoutEventIndex = null;
}

cancelSponsorStripe() {
  this.destroyStripeCheckout();
  this.showSponsorStripeCheckout = false;
}

destroyStripeCheckout() {
  if (this.stripeCheckout) {
    this.stripeCheckout.destroy();
    this.stripeCheckout = null;
  }
}
}
