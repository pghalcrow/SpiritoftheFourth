import { Component } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { EmailService } from 'src/app/services/email.service';
import { EmailUtlity } from 'src/app/utilities/email-utility';
import { States } from 'src/app/utilities/states';
import { environment } from 'src/environments/environment';

@Component({
  selector: 'app-volunteers',
  templateUrl: './volunteers.component.html',
  styleUrls: ['./volunteers.component.css']
})
export class VolunteersComponent {

  volunteerForm: FormGroup;
  states = new States().states
  isLoading: boolean = false
  showSuccess: boolean = false
  showError: boolean = false

  constructor(private fb: FormBuilder, private emailService: EmailService){
    this.volunteerForm = new FormGroup({
      contactName: new FormControl('', Validators.required),
      organizationName: new FormControl(''),
      email: new FormControl('', [Validators.required, Validators.email]),
      phone: new FormControl('', [Validators.required, Validators.minLength(12), Validators.maxLength(12)]),
      availability: new FormControl('', Validators.required),
      message: new FormControl('', [Validators.required]),
    });
  }

  ngOnInit() {
    document.getElementById('volunteerModal')!.addEventListener('hidden.bs.modal',  (event) => {
      this.isLoading = false
      this.showSuccess = false
      this.showError = false
      this.volunteerForm.reset()
      this.volunteerForm.enable()
    })
  }

  async onSubmit(form: FormGroup) {
    form.markAllAsTouched()   
    if(form.valid){
      this.isLoading = true
      this.volunteerForm.disable()
      let toAddress = environment.forms.volunteerForm.toEamil
      let subject = environment.forms.volunteerForm.subject
      let body = EmailUtlity.createVolunteerFormHTMLBody(this.volunteerForm)
      let replyTo = this.volunteerForm.get("email")!.value
      let name = this.volunteerForm.get("contactName")!.value
      let phone = this.volunteerForm.get("phone")!.value
      let formData = {
        formType: "volunteerForm",
        ...this.volunteerForm.getRawValue()
      }
      this.emailService.sendEmail(toAddress, body, subject, replyTo, name, phone, undefined, formData).subscribe(result =>{
        this.isLoading = false
        if(result.status){
          this.showSuccess = true
          this.showError = false
          
        }else{
          this.showSuccess = false
          this.showError = true
          this.volunteerForm.enable()
        }
      })

      

    }
  }
  
}
