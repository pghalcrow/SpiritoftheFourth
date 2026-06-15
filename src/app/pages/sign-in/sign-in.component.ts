import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { CmsService } from 'src/app/services/cms.service';

@Component({
  selector: 'app-sign-in',
  templateUrl: './sign-in.component.html',
  styleUrls: ['./sign-in.component.css']
})
export class SignInComponent {
  password: string = '';
  errorMessage: string = '';

  constructor(private router: Router, private cmsService: CmsService) {}

  login() {

    this.cmsService.login(this.password).subscribe({
        next: (res) => {
          if (res.success) {
            sessionStorage.setItem('adminToken', res.token!);
            sessionStorage.setItem('adminRole', res.role || 'admin');
            this.router.navigate(['/admin']);
          } else {
            this.errorMessage = 'Incorrect password.';
          }
        },
        error: () => {
          this.errorMessage = 'Login failed.';
        }
      });
  }
}
