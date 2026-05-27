import { Component, OnInit } from '@angular/core';

declare var PayPal: any


@Component({
  selector: 'app-freedom-club',
  templateUrl: './freedom-club.component.html',
  styleUrls: ['./freedom-club.component.css']
})
export class FreedomClubComponent implements OnInit {
  
  
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
    }).render('#paypal-donate-button-container-freedom-club');
    


  
  }

  
}
