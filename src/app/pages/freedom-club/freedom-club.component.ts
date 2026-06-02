import { Component, OnInit } from '@angular/core';
import { PaypalDonationService } from 'src/app/services/paypal-donation.service';

@Component({
  selector: 'app-freedom-club',
  templateUrl: './freedom-club.component.html',
  styleUrls: ['./freedom-club.component.css']
})
export class FreedomClubComponent implements OnInit {
  constructor(private paypalDonationService: PaypalDonationService) {}

  ngOnInit() {
    this.paypalDonationService.renderDonationButton('#paypal-donate-button-container-freedom-club');
  }
}
