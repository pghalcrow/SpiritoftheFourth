import { Component, OnInit, AfterViewInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators, FormArray } from '@angular/forms';
import { OrderService } from 'src/app/services/order.service';
import { CmsService, Event as CmsEvent } from 'src/app/services/cms.service';
import { Router, NavigationEnd } from '@angular/router';

interface UIEvent extends CmsEvent {
  formGroup: FormGroup;
  fieldMap: { [key: string]: any };
}

declare var PayPal: any

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
  // sections: any[] = [];
  sponsorForm!: FormGroup;


  constructor(
    private fb: FormBuilder,
    private orderService: OrderService,
    private router: Router,
    private cmsService: CmsService
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
    const container = document.getElementById('paypal-donate-button-container-2');
    if (container) {
      PayPal.Donation.Button({
        env: 'production',
        hosted_button_id: 'ERLZZZF5H4NSN',
        image: {
          title: 'PayPal - The safer, easier way to pay online!',
          alt: 'Donate with PayPal button'
        }
      }).render('#paypal-donate-button-container-2');
    }
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

  if (this.paymentMethod === 'stripe') {
    this.orderService.createStripeOrder(formData).subscribe({
      next: (response) => {
        console.log('Stripe session created:', response);
        if (response?.session_url) {
          window.location.href = response.session_url;
        }
      },
      error: (err) => {
        console.error('Error creating Stripe session:', err);
        alert('There was an error submitting your payment. Please try again.');
      }
    });
  } else if (this.paymentMethod === 'paypal') {
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

  if (this.sponsorPaymentMethod === 'stripe') {
    this.orderService.createStripeOrder(baseData).subscribe({
      next: (response) => {
        if (response?.session_url) {
          window.location.href = response.session_url;
        }
      },
      error: (err) => {
        console.error('Error creating Stripe session:', err);
        alert('Payment failed. Try again.');
      }
    });
  } else {
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
}
