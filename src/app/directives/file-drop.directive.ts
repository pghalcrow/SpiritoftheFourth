import { Directive, EventEmitter, HostBinding, HostListener, Output } from '@angular/core';

@Directive({
  selector: '[appFileDrop]'
})
export class FileDropDirective {
@HostBinding('class.fileover') fileOver: boolean = false;
@Output() fileDropped = new EventEmitter<any>();

  constructor() { }

  @HostListener('dragover', ['$event']) 
  onDragOver(evt: Event){
    this.fileOver = true
    evt.preventDefault()
    evt.stopPropagation()
  }
  @HostListener('dragleave', ['$event']) 
  onDragLeave(evt: Event){
    this.fileOver = false
    evt.preventDefault()
    evt.stopPropagation()
  }
  @HostListener('drop', ['$event']) 
  onDrop(evt: any){
    this.fileOver = false
    evt.preventDefault()
    evt.stopPropagation()
    let files = evt.dataTransfer.files
    this.fileDropped.emit(files);
  }
}
