import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { AppRoutingModule } from './app-routing.module';
import { HomeComponent } from './pages/home/home.component';
import { VisitorInformationComponent } from './pages/visitor-information/visitor-information.component';
import { AboutComponent } from './pages/about/about.component';
import { SponsorsComponent } from './pages/sponsors/sponsors.component';
import { VendorsComponent } from './pages/vendors/vendors.component';
import { VolunteersComponent } from './pages/volunteers/volunteers.component';
import { MediaComponent } from './pages/media/media.component';
import { RootComponent } from './components/root/root.component';
import { NavigationComponent } from './components/navigation/navigation.component';
import { FooterComponent } from './components/footer/footer.component';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { SponsorsPlugComponent } from './components/sponsors-plug/sponsors-plug.component';
import { CommunityParadeComponent } from './pages/community-parade/community-parade.component';
import { WheelsOfFreedomComponent } from './pages/wheels-of-freedom/wheels-of-freedom.component';
import { FreedomClubComponent } from './pages/freedom-club/freedom-club.component';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { OnlyNumbersDirective } from './directives/only-numbers.directive';
import { EmailService } from './services/email.service';
import { HttpClientModule } from '@angular/common/http';
import { DigitsOnlyDirective } from './directives/digits-only.directive';
import { FileDropDirective } from './directives/file-drop.directive';
import { FileItemComponent } from './components/file-item/file-item.component';
import { PrivacyPolicyComponent } from './pages/privacy-policy/privacy-policy.component';
import { EveningEntertainmentComponent } from './pages/evening-entertainment/evening-entertainment.component';
import { ParadeComponent } from './pages/parade/parade.component';
import { MaxWordCountDirective } from './directives/max-word-count.directive';
import { UpcomingEventsComponent } from './pages/upcoming-events/upcoming-events.component';
import { OrderComponent } from './pages/order/order.component';
import { SignInComponent } from './pages/sign-in/sign-in.component';
import { AdminComponent } from './pages/admin/admin.component';
import { DragDropModule } from '@angular/cdk/drag-drop';


@NgModule({
  declarations: [
    HomeComponent,
    VisitorInformationComponent,
    AboutComponent,
    SponsorsComponent,
    VendorsComponent,
    VolunteersComponent,
    MediaComponent,
    RootComponent,
    NavigationComponent,
    FooterComponent,
    SponsorsPlugComponent,
    CommunityParadeComponent,
    WheelsOfFreedomComponent,
    FreedomClubComponent,
    OnlyNumbersDirective,
    DigitsOnlyDirective,
    FileDropDirective,
    FileItemComponent,
    PrivacyPolicyComponent,
    EveningEntertainmentComponent,
    ParadeComponent,
    MaxWordCountDirective,
    UpcomingEventsComponent,
    OrderComponent,
    SignInComponent,
    AdminComponent,
  ],
  imports: [
    BrowserModule,
    AppRoutingModule,
    FontAwesomeModule,
    FontAwesomeModule,
    ReactiveFormsModule,
    HttpClientModule,
    FormsModule,
    DragDropModule,
  ],
  providers: [],
  bootstrap: [RootComponent]
})
export class AppModule { }
