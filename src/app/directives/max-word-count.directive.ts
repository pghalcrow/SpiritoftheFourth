import { Directive, Input, ElementRef, HostListener } from '@angular/core';

@Directive({
  selector: '[appMaxWordCount]'
})
export class MaxWordCountDirective {

  @Input() appMaxWordCount: number = 50

  constructor(private el: ElementRef) { }

  @HostListener('keydown', ['$event']) onKeyDown(event:any) {
    let e = <KeyboardEvent>event;
    let currentEntry: string = this.el.nativeElement.value;
    let currentEntryCount: number = 0

    if(currentEntry){
      currentEntryCount = currentEntry.split(' ').length
    }
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
      }else if(currentEntryCount > this.appMaxWordCount){
      e.preventDefault()
    }
  }

}
