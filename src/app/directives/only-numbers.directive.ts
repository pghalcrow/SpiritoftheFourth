import { Directive, Input, ElementRef, HostListener } from '@angular/core';

@Directive({
  selector: '[appOnlyNumbers]'
})
export class OnlyNumbersDirective {

  appOnlyNumbers: boolean = true;

  constructor(private el: ElementRef) { }

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
    let phoneNumber: string = this.el.nativeElement.value;

    if(e.key != "Backspace" && e.key != "Del"){
      phoneNumber = this.setDashes(phoneNumber);
      this.el.nativeElement.value = phoneNumber;
    }

  }

  setDashes(phoneNumber: string): string{
    if (phoneNumber.length >= 3) {
      phoneNumber = phoneNumber.replace(/[-]+/g,"");
      phoneNumber = phoneNumber.slice(0, 3) + "-" + phoneNumber.slice(3);
      if (phoneNumber.length >= 7) {
        phoneNumber = phoneNumber.slice(0, 7) + "-" + phoneNumber.slice(7);
      }
    }
    return phoneNumber;
  }

}
