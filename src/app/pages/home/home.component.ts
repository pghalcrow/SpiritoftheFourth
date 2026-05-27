import { Component } from '@angular/core';
import * as moment from 'moment';

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.css']
})
export class HomeComponent {

  yearCounter: number = 0
  currentYear: number = 0
  constructor(){
    
    let originalDate = moment([1968, 6,4])
    let current = moment()
    this.yearCounter = current.diff(originalDate, 'years')
    this.currentYear = current.year()
    let thisYear4th = moment([this.currentYear, 6,4])
    if(current.isAfter(thisYear4th)){
      this.currentYear++
    }
    console.log(this.currentYear)
  }

  getOrdinal(n: number): string {
    let ord = 'th';
    if (n % 10 == 1 && n % 100 != 11)
    {
      ord = 'st';
    }
    else if (n % 10 == 2 && n % 100 != 12)
    {
      ord = 'nd';
    }
    else if (n % 10 == 3 && n % 100 != 13)
    {
      ord = 'rd';
    }
    return ord;
  }
}
