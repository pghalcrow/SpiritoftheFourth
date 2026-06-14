import { environment } from './environment.prod';

describe('production environment', () => {
  it('routes volunteer notifications to original recipients', () => {
    expect(environment.forms.volunteerForm.toEamil).toBe('dave.spiritofthefourth@gmail.com, joelsurfdog@redshift.com');
  });

  it('routes motor show notifications and Stripe to live production values', () => {
    expect(environment.forms.carShow.toEamil).toBe('cowge41@gmail.com, tim@shinn.com');
    expect(environment.stripe.pk).toMatch(/^pk_live_/);
  });
});
