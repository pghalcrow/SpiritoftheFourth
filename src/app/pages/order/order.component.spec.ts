import { convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import { OrderService } from 'src/app/services/order.service';
import { environment } from 'src/environments/environment';
import { OrderComponent } from './order.component';

describe('OrderComponent', () => {
  let originalProduction: boolean;

  beforeEach(() => {
    originalProduction = environment.production;
  });

  afterEach(() => {
    environment.production = originalProduction;
  });

  it('shows donation-specific success copy for Freedom Club card payments', () => {
    environment.production = true;
    const route = {
      snapshot: {
        queryParamMap: convertToParamMap({ order_type: 'freedom_club_donation' }),
      },
      paramMap: of(convertToParamMap({ status: 'success' })),
      queryParamMap: of(convertToParamMap({ session_id: 'cs_test_donation' })),
    };
    const orderService = jasmine.createSpyObj<OrderService>('OrderService', ['processLocalStripeSession', 'captureOrder']);

    const component = new OrderComponent(route as any, orderService);
    component.ngOnInit();

    expect(component.message).toContain('Thank you for sponsoring Spirit of the Fourth');
    expect(component.message).not.toContain('merchandise');
  });

  it('shows donation-specific success copy for the Freedom Club metadata order type', () => {
    environment.production = true;
    const route = {
      snapshot: {
        queryParamMap: convertToParamMap({ order_type: 'freedomClubDonation' }),
      },
      paramMap: of(convertToParamMap({ status: 'success' })),
      queryParamMap: of(convertToParamMap({ session_id: 'cs_test_donation' })),
    };
    const orderService = jasmine.createSpyObj<OrderService>('OrderService', ['processLocalStripeSession', 'captureOrder']);

    const component = new OrderComponent(route as any, orderService);
    component.ngOnInit();

    expect(component.message).toContain('Thank you for sponsoring Spirit of the Fourth');
    expect(component.message).not.toContain('merchandise');
  });
});
