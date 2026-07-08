import { Component } from '@angular/core';
import { Sponsor } from 'src/app/models/sponsor';

@Component({
  selector: 'app-sponsors-plug',
  templateUrl: './sponsors-plug.component.html',
  styleUrls: ['./sponsors-plug.component.css']
})
export class SponsorsPlugComponent {

  sponsors: Sponsor[] = []
  constructor() {
    this.sponsors.push({
      image: "assets/sponsor_logos/THE-SHOP.png",
      url: "https://theshoppizza.com/"
    },
    {
      image: "assets/sponsor_logos/cosd.png",
      url: "https://www.sandiego.gov/"
    },
      {
        image: "assets/sponsor_logos/sd_foundation.png",
        url: 'https://www.sdfoundation.org/'
      },
      // {
      //   image: "assets/sponsor_logos/sd_county.png",
      //   url: 'https://www.sandiegocounty.gov/auditor/commehnc.html'
      // },
      // {
      //   image: "assets/sponsor_logos/lucia.png",
      //   url: 'https://www.luciacap.com/'
      // },
      {
        image: "assets/sponsor_logos/rotary.png",
        url: 'https://www.rbsunrise.org/'
      },
      {
        image: "assets/sponsor_logos/rotary_club_rb.png",
        url: 'https://www.rbrotary.org/'
      },
      {
        image: "assets/sponsor_logos/SDHE_logo_2.png",
        url: 'https://www.sdhehomes.com/'
      },
      {
        image: "assets/sponsor_logos/oasis_logo.PNG",
        url: 'https://san-diego.oasisnet.org/san-diego-oasis-at-rancho-bernardo/'
      },
      // {
      //   image: "assets/sponsor_logos/peraton.png",
      //   url: 'https://www.peraton.com/'
      // },
      {
        image: "assets/sponsor_logos/heritagehomes.jpg",
        url: 'https://heritagehomesre.com/'
      },
      {
        image: "assets/sponsor_logos/gearbox.png",
        url: 'https://gearboxwebsites.com/'
      },
      {
        image: "assets/sponsor_logos/Akroz.png",
        url: 'https://www.facebook.com/akrozusa/'
      },
      {
        image: "assets/sponsor_logos/studio_west.png",
        url: 'https://studiowest.com/'
      },
      {
        image: "assets/sponsor_logos/gk_logo.png",
        url: 'https://www.gyminnykids.com/'
      },
      {
        image: "assets/sponsor_logos/barons_market_logo.png",
        url: 'https://baronsmarket.com/'
      },
      {
        image: "assets/sponsor_logos/koizen_logo.png",
        url: 'https://koizencellars.com/'
      },
      {
        image: "assets/sponsor_logos/lucia.png",
        url: 'https://www.luciacap.com/'
      },
      {
        image: "assets/sponsor_logos/psycho_oncology_care.png",
        url: 'https://psychooncologycare.com/'
      },
      {
        image: "assets/sponsor_logos/kiln.png",
        url: 'https://kiln.com/communities/rancho-bernardo/'
      },
      {
        image: "assets/sponsor_logos/TheHeights.png",
        url: 'https://www.invitedclubs.com/clubs/the-heights-golf-club'
      },
    )
  }

}
