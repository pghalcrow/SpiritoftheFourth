import { environment } from './environment.prod';

describe('production environment', () => {
  it('temporarily routes volunteer notifications to Patrick for live testing', () => {
    expect(environment.forms.volunteerForm.toEamil).toBe('pghalcrow@gmail.com');
  });
});
