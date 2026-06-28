import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { of, Subject } from 'rxjs';
import { Router } from '@angular/router';
import { UpcomingEventsComponent } from './upcoming-events.component';
import { CmsService } from 'src/app/services/cms.service';
import { OrderService } from 'src/app/services/order.service';
import { PaypalDonationService } from 'src/app/services/paypal-donation.service';

describe('UpcomingEventsComponent', () => {
  let fixture: ComponentFixture<UpcomingEventsComponent>;
  let cmsService: jasmine.SpyObj<CmsService>;
  let orderService: jasmine.SpyObj<OrderService>;

  beforeEach(async () => {
    cmsService = jasmine.createSpyObj<CmsService>('CmsService', ['getEvents', 'resolveAssetUrl']);
    cmsService.resolveAssetUrl.and.callFake((url: string) => url);
    cmsService.getEvents.and.returnValue(of({
      events: [
        {
          title: 'No Flyer Event',
          type: 'noFlyerEvent',
          flyerUrl: '',
          description: 'No flyer should show.',
          eventMeta: {
            dateOfEvent: '',
            location: '',
            endBlurb: '',
            contactEmail: '',
          },
          pricing: {
            basePlayerField: 'N/A',
            includePrimaryPlayer: false,
            pricePerPlayer: 0,
            addOns: [],
          },
          formFields: [],
          sections: [],
        },
        {
          title: 'Whitespace Flyer Event',
          type: 'whitespaceFlyerEvent',
          flyerUrl: '   ',
          description: 'Whitespace should not show.',
          eventMeta: {
            dateOfEvent: '',
            location: '',
            endBlurb: '',
            contactEmail: '',
          },
          pricing: {
            basePlayerField: 'N/A',
            includePrimaryPlayer: false,
            pricePerPlayer: 0,
            addOns: [],
          },
          formFields: [],
          sections: [],
        },
        {
          title: 'Flyer Event',
          type: 'flyerEvent',
          flyerUrl: 'assets/flyer.png',
          description: 'Flyer should show.',
          eventMeta: {
            dateOfEvent: '2099-07-04',
            location: 'Town Park',
            endBlurb: 'Bring your confirmation email to check in.',
            contactEmail: '',
          },
          pricing: {
            pricingMode: 'fixed',
            basePlayerField: 'N/A',
            includePrimaryPlayer: false,
            pricePerPlayer: 10,
            addOns: [],
          },
          formFields: [],
          sections: [],
        },
        {
          title: 'Past Event',
          type: 'pastEvent',
          flyerUrl: '',
          description: 'Past event should be hidden.',
          eventMeta: {
            dateOfEvent: '2000-01-01',
            location: 'Old Park',
            endBlurb: 'This should not show.',
            contactEmail: '',
          },
          pricing: {
            basePlayerField: 'N/A',
            includePrimaryPlayer: false,
            pricePerPlayer: 0,
            addOns: [],
          },
          formFields: [],
          sections: [],
        },
      ],
    }));

    orderService = jasmine.createSpyObj<OrderService>('OrderService', [
      'submitOrder',
      'createStripeEmbeddedSession',
      'createEventPayPalOrder',
      'processFreeEventSignup',
    ]);
    orderService.processFreeEventSignup.and.returnValue(of({ status: 'submitted', submission_id: 'free-1' }));
    const paypalDonationService = jasmine.createSpyObj<PaypalDonationService>('PaypalDonationService', ['renderDonationButton']);

    await TestBed.configureTestingModule({
      declarations: [UpcomingEventsComponent],
      imports: [ReactiveFormsModule],
      providers: [
        { provide: CmsService, useValue: cmsService },
        { provide: OrderService, useValue: orderService },
        { provide: PaypalDonationService, useValue: paypalDonationService },
        { provide: Router, useValue: { events: of() } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(UpcomingEventsComponent);
    fixture.detectChanges();
  });

  afterEach(() => {
    delete (window as any).Stripe;
  });

  it('does not render a flyer image when an event has no flyer URL', () => {
    const nativeElement = fixture.nativeElement as HTMLElement;
    const images = Array.from(nativeElement.querySelectorAll<HTMLImageElement>('img.flyer-img'));

    expect(images.length).toBe(1);
    expect(images[0].alt).toBe('Flyer Event flyer');
    expect(images[0].getAttribute('src')).toBe('assets/flyer.png');
  });

  it('replaces payment buttons with sign up for free events', () => {
    const nativeElement = fixture.nativeElement as HTMLElement;
    const eventBlocks = Array.from(nativeElement.querySelectorAll<HTMLElement>('[data-testid="upcoming-event"]'));

    expect(eventBlocks[0].textContent).toContain('Sign Up');
    expect(eventBlocks[0].textContent).not.toContain('Total: $0');
    expect(eventBlocks[0].textContent).not.toContain('Pay by Credit Card');
    expect(eventBlocks[0].textContent).not.toContain('PayPal');
    expect(eventBlocks[2].textContent).toContain('Pay by Credit Card');
    expect(eventBlocks[2].textContent).toContain('PayPal');
  });

  it('uses Events as the page heading', () => {
    const nativeElement = fixture.nativeElement as HTMLElement;

    expect(nativeElement.querySelector('h1')?.textContent?.trim()).toBe('Events');
    expect(nativeElement.textContent).not.toContain('Upcoming Event(s)');
  });

  it('shows disabled registration events without signup or payment controls', () => {
    cmsService.getEvents.and.returnValue(of({
      events: [{
        title: 'Display Only Event',
        type: 'displayOnlyEvent',
        flyerUrl: '',
        description: 'This event is informational.',
        registrationEnabled: false,
        eventMeta: {
          dateOfEvent: '',
          location: '',
          endBlurb: '',
          contactEmail: '',
        },
        pricing: {
          pricingMode: 'fixed',
          basePlayerField: 'N/A',
          includePrimaryPlayer: false,
          pricePerPlayer: 25,
          addOns: [],
        },
        formFields: [{
          name: 'fullName',
          label: 'Full Name',
          type: 'text',
          required: true,
        }],
        sections: [{ type: 'fields', fields: ['fullName'] }],
      }],
    }));

    const disabledFixture = TestBed.createComponent(UpcomingEventsComponent);
    disabledFixture.detectChanges();

    const eventBlock = (disabledFixture.nativeElement as HTMLElement).querySelector<HTMLElement>('[data-testid="upcoming-event"]')!;
    expect(eventBlock.textContent).toContain('Display Only Event');
    expect(eventBlock.querySelector('form')).toBeFalsy();
    expect(eventBlock.textContent).not.toContain('Sign Up');
    expect(eventBlock.textContent).not.toContain('Pay by Credit Card');
    expect(eventBlock.textContent).not.toContain('PayPal');
    expect(orderService.processFreeEventSignup).not.toHaveBeenCalled();
  });

  it('submits a free event signup without creating a payment session', () => {
    spyOn(window, 'alert');
    const nativeElement = fixture.nativeElement as HTMLElement;

    nativeElement.querySelector<HTMLButtonElement>('[data-testid="free-event-signup-0"]')!.click();

    expect(orderService.processFreeEventSignup).toHaveBeenCalled();
    expect(orderService.createStripeEmbeddedSession).not.toHaveBeenCalled();
    expect(orderService.createEventPayPalOrder).not.toHaveBeenCalled();
    expect(window.alert).toHaveBeenCalledWith('Thank you for signing up.');
  });

  it('charges fixed price events as one registration without a participant group', () => {
    const fixedEvent = fixture.componentInstance.events[2];

    expect(fixture.componentInstance.calculateTotal(fixedEvent)).toBe(10);
    expect(fixture.componentInstance.buildEventSubmissionPayload(fixedEvent, 'stripe')).toEqual(jasmine.objectContaining({
      pricing: jasmine.objectContaining({ pricingMode: 'fixed', basePlayerField: 'N/A' }),
      players: 1,
      grandTotal: 10,
    }));
  });

  it('initializes event Stripe checkout with the publishable key returned by the backend', fakeAsync(() => {
    orderService.createStripeEmbeddedSession.and.returnValue(
      of({ client_secret: 'cs_test_event', publishable_key: 'pk_test_backend' })
    );
    (window as any).Stripe = jasmine.createSpy('Stripe').and.returnValue({
      initEmbeddedCheckout: jasmine.createSpy('initEmbeddedCheckout').and.returnValue(
        Promise.resolve({
          mount: jasmine.createSpy('mount'),
          destroy: jasmine.createSpy('destroy'),
        })
      ),
    });

    fixture.componentInstance.onStripeEvent(fixture.componentInstance.events[2], 2);
    tick(60);

    expect((window as any).Stripe).toHaveBeenCalledWith('pk_test_backend');
  }));

  it('treats explicit free pricing mode as free even when a price is present', () => {
    const event = fixture.componentInstance.events[2];
    event.pricing.pricingMode = 'free';

    expect(fixture.componentInstance.calculateTotal(event)).toBe(0);
    expect(fixture.componentInstance.isFreeEvent(event)).toBeTrue();
    expect(fixture.componentInstance.buildEventSubmissionPayload(event, 'none')).toEqual(jasmine.objectContaining({
      players: 0,
      grandTotal: 0,
    }));
  });

  it('shows event date location and end blurb for visible events', () => {
    const nativeElement = fixture.nativeElement as HTMLElement;
    const flyerEvent = Array.from(nativeElement.querySelectorAll<HTMLElement>('[data-testid="upcoming-event"]'))
      .find(eventBlock => eventBlock.querySelector('h2')?.textContent?.trim() === 'Flyer Event')!;

    expect(flyerEvent.textContent).toContain('July 4, 2099');
    expect(flyerEvent.textContent).toContain('Town Park');
    expect(flyerEvent.textContent).toContain('Bring your confirmation email to check in.');
  });

  it('shows events scheduled before today unless explicitly hidden', () => {
    const nativeElement = fixture.nativeElement as HTMLElement;

    expect(nativeElement.textContent).toContain('Past Event');
    expect(fixture.componentInstance.events.some(event => event.title === 'Past Event')).toBeTrue();
  });

  it('hides events explicitly marked not visible', () => {
    cmsService.getEvents.and.returnValue(of({
      events: [{
        title: 'Hidden Event',
        type: 'hiddenEvent',
        flyerUrl: '',
        description: 'Hidden event should not show.',
        isVisible: false,
        eventMeta: {
          dateOfEvent: '2099-01-01',
          location: 'Hidden Park',
          endBlurb: '',
          contactEmail: '',
        },
        pricing: {
          basePlayerField: 'N/A',
          includePrimaryPlayer: false,
          pricePerPlayer: 0,
          addOns: [],
        },
        formFields: [],
        sections: [],
      }],
    }));

    const hiddenFixture = TestBed.createComponent(UpcomingEventsComponent);
    hiddenFixture.detectChanges();

    expect(hiddenFixture.nativeElement.textContent).not.toContain('Hidden Event');
    expect(hiddenFixture.nativeElement.querySelector('[data-testid="no-upcoming-events"]')).toBeTruthy();
  });

  it('does not render the hardcoded tournament sponsor section', () => {
    const nativeElement = fixture.nativeElement as HTMLElement;

    expect(nativeElement.textContent).not.toContain('Not participating in the tournament?');
    expect(nativeElement.querySelector('.sponsor-section')).toBeFalsy();
  });

  it('shows a placeholder when there are no upcoming events', () => {
    cmsService.getEvents.and.returnValue(of({
      events: [{
        title: 'Past Event Only',
        type: 'pastEventOnly',
        flyerUrl: '',
        description: 'Hidden event should not show.',
        isVisible: false,
        eventMeta: {
          dateOfEvent: '2000-01-01',
          location: 'Old Park',
          endBlurb: '',
          contactEmail: '',
        },
        pricing: {
          basePlayerField: 'N/A',
          includePrimaryPlayer: false,
          pricePerPlayer: 0,
          addOns: [],
        },
        formFields: [],
        sections: [],
      }],
    }));

    const emptyFixture = TestBed.createComponent(UpcomingEventsComponent);
    emptyFixture.detectChanges();

    const nativeElement = emptyFixture.nativeElement as HTMLElement;

    expect(nativeElement.querySelector('[data-testid="no-upcoming-events"]')).toBeTruthy();
    expect(nativeElement.textContent).toContain('No upcoming events are scheduled right now.');
    expect(nativeElement.textContent).not.toContain('Past Event Only');
  });

  it('does not show the no-events message while events are still loading', () => {
    const loadingResponse = new Subject<any>();
    cmsService.getEvents.and.returnValue(loadingResponse.asObservable());

    const loadingFixture = TestBed.createComponent(UpcomingEventsComponent);
    loadingFixture.detectChanges();

    let nativeElement = loadingFixture.nativeElement as HTMLElement;
    expect(nativeElement.querySelector('[data-testid="no-upcoming-events"]')).toBeFalsy();

    loadingResponse.next({ events: [] });
    loadingResponse.complete();
    loadingFixture.detectChanges();

    nativeElement = loadingFixture.nativeElement as HTMLElement;
    expect(nativeElement.querySelector('[data-testid="no-upcoming-events"]')).toBeTruthy();
  });
});
