import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { AboutComponent } from './pages/about/about.component';
import { CommunityParadeComponent } from './pages/community-parade/community-parade.component';
import { FreedomClubComponent } from './pages/freedom-club/freedom-club.component';
import { HomeComponent } from './pages/home/home.component';
import { MediaComponent } from './pages/media/media.component';
import { SponsorsComponent } from './pages/sponsors/sponsors.component';
import { VendorsComponent } from './pages/vendors/vendors.component';
import { VisitorInformationComponent } from './pages/visitor-information/visitor-information.component';
import { VolunteersComponent } from './pages/volunteers/volunteers.component';
import { WheelsOfFreedomComponent } from './pages/wheels-of-freedom/wheels-of-freedom.component';
import { PrivacyPolicyComponent } from './pages/privacy-policy/privacy-policy.component';
import { EveningEntertainmentComponent } from './pages/evening-entertainment/evening-entertainment.component';
import { ParadeComponent } from './pages/parade/parade.component';
import { UpcomingEventsComponent } from './pages/upcoming-events/upcoming-events.component';
import { OrderComponent } from './pages/order/order.component';
import { SignInComponent } from './pages/sign-in/sign-in.component';
import { AdminComponent } from './pages/admin/admin.component';
import { AdminPasswordResetComponent } from './pages/admin-password-reset/admin-password-reset.component';
import { AdminGuard } from './guards/admin.guard';

const routes: Routes = [
  { path: "", component: HomeComponent },
  { path: "about", component: AboutComponent },
  { path: "upcomingevents", component: UpcomingEventsComponent },
  { path: "media", component: MediaComponent },
  { path: "sponsors", component: SponsorsComponent },
  { path: "vendors", component: VendorsComponent },
  { path: "freedom-club", component: FreedomClubComponent },
  { path: "visitor-information/community-fair-and-parade", component: CommunityParadeComponent },
  { path: "visitor-information/wheels-of-freedom", component: WheelsOfFreedomComponent },
  { path: "visitor-information/evening-entertainment", component: EveningEntertainmentComponent },
  { path: "visitor-information/parade", component: ParadeComponent },
  { path: "visitor-information", component: VisitorInformationComponent },
  { path: "volunteers", component: VolunteersComponent },
  { path: "privacy-policy", component: PrivacyPolicyComponent },
  { path: "order/:status", component: OrderComponent },
  { path: 'sign-in', component: SignInComponent },
  { path: 'admin/reset-password', component: AdminPasswordResetComponent },
  { path: 'admin', component: AdminComponent, canActivate: [AdminGuard] },
  { path: "**", redirectTo: "" },
];

@NgModule({
  imports: [RouterModule.forRoot(routes, {
    scrollPositionRestoration: "enabled",
    anchorScrolling: "enabled",
  })],
  exports: [RouterModule]
})
export class AppRoutingModule { }
