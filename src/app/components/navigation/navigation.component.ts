import { Component, OnInit } from '@angular/core';
import { NavigationEnd, Router, RouterEvent } from '@angular/router';
import { faFacebook, faInstagram } from '@fortawesome/free-brands-svg-icons'
import { PaypalDonationService } from 'src/app/services/paypal-donation.service';
import { filter } from 'rxjs';

@Component({
  selector: 'app-navigation',
  templateUrl: './navigation.component.html',
  styleUrls: ['./navigation.component.css']
})
export class NavigationComponent implements OnInit {
  faFacebook = faFacebook
  faInstagram = faInstagram

  router: string = ''

  constructor(
    private _router: Router,
    private paypalDonationService: PaypalDonationService
  ) {
    _router.events.pipe(filter(event => event instanceof NavigationEnd)).subscribe((val: any) => {
      this.router = val.url
    })
  }

  ngOnInit() {
    this.paypalDonationService.renderDonationButton('#paypal-donate-button-container-1');
    this.paypalDonationService.renderDonationButton('#paypal-donate-button-container-2');
  }

}
