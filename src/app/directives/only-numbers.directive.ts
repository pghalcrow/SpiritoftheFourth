import { Directive, ElementRef, HostListener, Optional, Self } from '@angular/core';
import { NgControl } from '@angular/forms';

@Directive({
  selector: '[appOnlyNumbers]'
})
export class OnlyNumbersDirective {

  appOnlyNumbers: boolean = true;

  constructor(private el: ElementRef, @Optional() @Self() private ngControl?: NgControl) { }

  @HostListener('keydown', ['$event']) onKeyDown(event:any) {
    let e = <KeyboardEvent>event;
    let phoneNumber: string = this.el.nativeElement.value;

    if (this.appOnlyNumbers) {

      if ([46, 8, 9, 27, 13, 110, 190].indexOf(e.keyCode) !== -1 ||
        // Allow: Ctrl+A
        (e.keyCode === 65 && (e.ctrlKey || e.metaKey)) ||
        // Allow: Ctrl+C
        (e.keyCode === 67 && (e.ctrlKey || e.metaKey)) ||
        // Allow: Ctrl+X
        (e.keyCode === 88 && (e.ctrlKey || e.metaKey)) ||
        // Allow: home, end, left, right
        (e.keyCode >= 35 && e.keyCode <= 39)) {
        // let it happen, don't do anything
        return;
      }

      // Ensure that it is a number and stop the keypress
      if ((e.shiftKey || (e.keyCode < 48 || e.keyCode > 57)) && (e.keyCode < 96 || e.keyCode > 105)) {
     
        e.preventDefault();

      }
    }
  }

  @HostListener('keyup', ['$event']) onKeyUp(event:any) {
    let e = <KeyboardEvent>event;

    if(e.key != "Backspace" && e.key != "Del"){
      this.formatAndSync();
    }

  }

  @HostListener('input') onInput() {
    this.formatAndSync();
  }

  private formatAndSync() {
    const phoneNumber = this.setDashes(this.el.nativeElement.value);
    this.el.nativeElement.value = phoneNumber;
    if (this.ngControl?.control && this.ngControl.control.value !== phoneNumber) {
      this.ngControl.control.setValue(phoneNumber, { emitEvent: false });
      this.ngControl.control.updateValueAndValidity({ emitEvent: false });
    }
  }

  setDashes(phoneNumber: string): string{
    const digits = String(phoneNumber || "").replace(/\D/g, "").slice(0, 10);
    if (digits.length <= 3) {
      return digits;
    }
    if (digits.length <= 6) {
      return `${digits.slice(0, 3)}-${digits.slice(3)}`;
    }
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }

}
