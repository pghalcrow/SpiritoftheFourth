import { ElementRef } from '@angular/core';
import { FormControl, Validators } from '@angular/forms';
import { OnlyNumbersDirective } from './only-numbers.directive';

describe('OnlyNumbersDirective', () => {
  it('formats autofilled phone values and syncs Angular validation', () => {
    const element = { value: '(555) 123-4567' } as HTMLInputElement;
    const control = new FormControl('(555) 123-4567', [Validators.minLength(12), Validators.maxLength(12)]);
    const ngControl = { control } as any;
    const directive = new OnlyNumbersDirective(new ElementRef(element), ngControl);

    directive.onInput();

    expect(element.value).toBe('555-123-4567');
    expect(control.value).toBe('555-123-4567');
    expect(control.valid).toBeTrue();
  });
});
