import { environment } from './environment.prod';

describe('production environment', () => {
  it('routes volunteer notifications to original recipients', () => {
    expect(environment.forms.volunteerForm.toEamil).toBe('dave.spiritofthefourth@gmail.com, joelsurfdog@redshift.com');
  });
});
