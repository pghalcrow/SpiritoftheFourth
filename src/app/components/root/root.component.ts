import { Component } from '@angular/core';
import * as AOS from "aos";

@Component({
  selector: 'app-root',
  templateUrl: './root.component.html',
  styleUrls: ['./root.component.css']
})
export class RootComponent {

  ngOnInit() {
    AOS.init();
  }
}
