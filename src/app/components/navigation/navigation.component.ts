import { Component, OnInit } from '@angular/core';
import { NavigationEnd, Router, RouterEvent } from '@angular/router';
import { faFacebook, faInstagram } from '@fortawesome/free-brands-svg-icons'
import { filter } from 'rxjs';

declare var PayPal: any

@Component({
  selector: 'app-navigation',
  templateUrl: './navigation.component.html',
  styleUrls: ['./navigation.component.css']
})
export class NavigationComponent implements OnInit {
  faFacebook = faFacebook
  faInstagram = faInstagram

  router: string = ''

  constructor(private _router: Router) {
    _router.events.pipe(filter(event => event instanceof NavigationEnd)).subscribe((val: any) => {
      this.router = val.url
    })
  }

  ngOnInit() {
    PayPal.Donation.Button({
      onInit: function (data: any, actions: any) {
        console.log('called')
      },
      env: 'production',
      hosted_button_id: 'ERLZZZF5H4NSN',
      image: {
        title: 'PayPal - The safer, easier way to pay online!',
        alt: 'Donate with PayPal button'
      },
      onComplete: function (params: any) {
        // Your onComplete handler
        console.log('called');
      },
    }).render('#paypal-donate-button-container-1');
    PayPal.Donation.Button({
      onInit: function (data: any, actions: any) {
        console.log('called')
      },
      env: 'production',
      hosted_button_id: 'ERLZZZF5H4NSN',
      image: {
        title: 'PayPal - The safer, easier way to pay online!',
        alt: 'Donate with PayPal button'
      },
      onComplete: function (params: any) {
        // Your onComplete handler
        console.log('called');
      },
    }).render('#paypal-donate-button-container-2');
  }

}
