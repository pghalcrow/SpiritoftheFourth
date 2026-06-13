import { FormControl, FormGroup } from '@angular/forms';
import { EmailUtlity } from './email-utility';

describe('EmailUtlity', () => {
  it('formats volunteer request emails as a readable admin summary', () => {
    const form = new FormGroup({
      contactName: new FormControl('Pat Halcrow'),
      organizationName: new FormControl('Spirit Testers'),
      email: new FormControl('pat@example.com'),
      phone: new FormControl('555-121-2121'),
      availability: new FormControl('Morning setup'),
      message: new FormControl('Happy to help wherever needed.'),
    });

    const html = EmailUtlity.createVolunteerFormHTMLBody(form);

    expect(html).toContain('Volunteer Request');
    expect(html).toContain('New volunteer signup');
    expect(html).toContain('border-collapse: collapse');
    expect(html).toContain('mailto:pat@example.com');
    expect(html).toContain('tel:5551212121');
    expect(html).toContain('Morning setup');
    expect(html).toContain('Happy to help wherever needed.');
  });
});
