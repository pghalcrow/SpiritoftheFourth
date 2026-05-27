import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { EmailService } from 'src/app/services/email.service';
import { EmailUtlity } from 'src/app/utilities/email-utility';
import { States } from 'src/app/utilities/states';
import { environment } from 'src/environments/environment';



@Component({
  selector: 'app-sponsors',
  templateUrl: './sponsors.component.html',
  styleUrls: ['./sponsors.component.css']
})


export class SponsorsComponent implements OnInit {

  sponsorForm: FormGroup;
  states = new States().states
  isLoading: boolean = false
  showSuccess: boolean = false
  showError: boolean = false

  constructor(private fb: FormBuilder, private emailService: EmailService) {
    this.sponsorForm = new FormGroup({
      contactName: new FormControl('', Validators.required),
      contactTitle: new FormControl('', Validators.required),
      companyName: new FormControl('', [Validators.required]),
      website: new FormControl('', [Validators.required]),
      email: new FormControl('', [Validators.required, Validators.email]),
      phone: new FormControl('', [Validators.required, Validators.minLength(12), Validators.maxLength(12)]),
      streetAddress: new FormControl('', Validators.required),
      city: new FormControl('', Validators.required),
      zipcode: new FormControl('', [Validators.required, Validators.minLength(5), Validators.maxLength(5)]),
      state: new FormControl('CA', Validators.required),
      sponsorshipLevel: new FormControl('sotf', Validators.required),
    });
  }


  ngOnInit() {


    document.getElementById('sponsorshipModal')!.addEventListener('hidden.bs.modal', (event) => {
      this.isLoading = false
      this.showSuccess = false
      this.showError = false
      this.sponsorForm.reset()
      this.sponsorForm.enable()
      this.sponsorForm.patchValue({ 'sponsorshipLevel': 'sotf' })
    })
  }

  async onSubmit(form: FormGroup) {
    form.markAllAsTouched()
    if (form.valid) {
      this.isLoading = true
      this.sponsorForm.disable()
      let toAddress = environment.forms.sponsorshipForm.toEamil
      let subject = environment.forms.sponsorshipForm.subject
      let body = EmailUtlity.createSponsorshipHTMLBody(this.sponsorForm)
      let replyTo = this.sponsorForm.get('email')!.value
      this.emailService.sendEmail(toAddress, body, subject, replyTo, this.sponsorForm!.get("contactName")!.value, this.sponsorForm!.get("phone")!.value).subscribe(result => {
        this.isLoading = false
        if (result.status) {
          this.showSuccess = true
          this.showError = false

        } else {
          this.showSuccess = false
          this.showError = true
          this.sponsorForm.enable()
        }
      })
    }
  }
}
