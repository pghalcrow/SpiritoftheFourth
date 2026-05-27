import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { faFileAlt, faTrashAlt } from '@fortawesome/free-regular-svg-icons'

@Component({
  selector: 'app-file-item',
  templateUrl: './file-item.component.html',
  styleUrls: ['./file-item.component.css']
})
export class FileItemComponent implements OnInit{

  @Input() file: File | undefined
  @Input() index: number = 0
  @Output() onRemoveFile: EventEmitter<number> = new EventEmitter();

  faFileAlt = faFileAlt
  faTrashAlt = faTrashAlt

  constructor() { 
  }

  ngOnInit(): void {
  }

  formatBytes(bytes: number, decimals: number = 2) {
    if (bytes === 0) {
      return "0 Bytes";
    }
    const k = 1024;
    const dm = decimals <= 0 ? 0 : decimals;
    const sizes = ["Bytes", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
  }

  deleteFile(): void{
    this.onRemoveFile.emit(this.index)
  }

}
