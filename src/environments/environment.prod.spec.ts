import { environment } from './environment.prod';

describe('production environment', () => {
  it('routes volunteer notifications to original recipients', () => {
    expect(environment.forms.volunteerForm.toEamil).toBe('dave.spiritofthefourth@gmail.com, joelsurfdog@redshift.com');
  });

  it('temporarily routes motor show testing through Patrick and Stripe test mode', () => {
    expect(environment.forms.carShow.toEamil).toBe('pghalcrow@gmail.com');
    expect(environment.stripe.pk).toMatch(/^pk_test_/);
  });
});
