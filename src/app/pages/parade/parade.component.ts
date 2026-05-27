import { Component } from '@angular/core';
import { AbstractControl, FormBuilder, FormControl, FormGroup, ValidationErrors, ValidatorFn, Validators } from '@angular/forms';
import { EmailService } from 'src/app/services/email.service';
import { EmailUtlity } from 'src/app/utilities/email-utility';
import { States } from 'src/app/utilities/states';
import { environment } from 'src/environments/environment';

@Component({
  selector: 'app-parade',
  templateUrl: './parade.component.html',
  styleUrls: ['./parade.component.css']
})
export class ParadeComponent {
  paradeEntryForm: FormGroup;
  carEntryForm: FormGroup;
  vipEntryForm: FormGroup;
  states = new States().states
  isLoading: boolean = false
  showSuccess: boolean = false
  showError: boolean = false

  vipOwnCar: boolean = true

  constructor(private fb: FormBuilder, private emailService: EmailService){
    this.carEntryForm = new FormGroup({
      contactName: new FormControl('', Validators.required),
      email: new FormControl('', [Validators.required, Validators.email]),
      phone: new FormControl('', [Validators.required, Validators.minLength(12), Validators.maxLength(12)]),
      streetAddress: new FormControl('', Validators.required),
      city: new FormControl('', Validators.required),
      zipcode: new FormControl('', [Validators.required, Validators.minLength(5), Validators.maxLength(5)]),
      state: new FormControl('CA', Validators.required),
      description: new FormControl('', [Validators.required]),
      wantGift: new FormControl('Yes', Validators.required),
      signatureName: new FormControl('', [Validators.required, this.carNamesMatchValidator()]),
      make: new FormControl('', Validators.required),
      model: new FormControl('', Validators.required),
      color: new FormControl('', Validators.required),
      year: new FormControl('', [Validators.required, Validators.minLength(4), Validators.maxLength(4)]),
      availableSeats: new FormControl('', [Validators.required, Validators.minLength(0), Validators.maxLength(2)]),
    })
    this.vipEntryForm = new FormGroup({
      vipName: new FormControl('', Validators.required),
      contactName: new FormControl('', Validators.required),
      email: new FormControl('', [Validators.required, Validators.email]),
      phone: new FormControl('', [Validators.required, Validators.minLength(12), Validators.maxLength(12)]),
      streetAddress: new FormControl('', Validators.required),
      city: new FormControl('', Validators.required),
      zipcode: new FormControl('', [Validators.required, Validators.minLength(5), Validators.maxLength(5)]),
      state: new FormControl('CA', Validators.required),
      paradeAnnouncement: new FormControl('', Validators.required),
      signatureName: new FormControl('', [Validators.required, this.vipNamesMatchValidator()]),
      vipOwnCar: new FormControl('Yes', Validators.required),
      make: new FormControl('', Validators.required),
      model: new FormControl('', Validators.required),
      color: new FormControl('', Validators.required),
      year: new FormControl('', [Validators.required, Validators.minLength(4), Validators.maxLength(4)]),
      driversName: new FormControl('', Validators.required),
      driversPhone: new FormControl('', Validators.required),
      driversEmail: new FormControl('', Validators.required),
    })
    this.paradeEntryForm = new FormGroup({
      entryName: new FormControl('', Validators.required),
      contactName: new FormControl('', Validators.required),
      email: new FormControl('', [Validators.required, Validators.email]),
      phone: new FormControl('', [Validators.required, Validators.minLength(12), Validators.maxLength(12)]),
      streetAddress: new FormControl('', Validators.required),
      city: new FormControl('', Validators.required),
      zipcode: new FormControl('', [Validators.required, Validators.minLength(5), Validators.maxLength(5)]),
      state: new FormControl('CA', Validators.required),
      description: new FormControl('', [Validators.required]),
      paradeAnnouncement: new FormControl('', Validators.required),
      wantGift: new FormControl('Yes', Validators.required),
      signatureName: new FormControl('', [Validators.required, this.paradeNamesMatchValidator()]),
      entryType: new FormControl('Float', Validators.required)
    });
    this.vipEntryForm.get('vipOwnCar')?.valueChanges.subscribe(value => {
      console.log("value changed to: "+value)
      if(value == 'Yes'){
        this.vipOwnCar = true
        this.vipEntryForm.get("make")?.addValidators(Validators.required)
        this.vipEntryForm.get("model")?.addValidators(Validators.required)
        this.vipEntryForm.get("color")?.addValidators(Validators.required)
        this.vipEntryForm.get("year")?.addValidators([Validators.required, Validators.minLength(4), Validators.maxLength(4)])
        this.vipEntryForm.get("driversName")?.addValidators(Validators.required)
        this.vipEntryForm.get("driversPhone")?.addValidators([Validators.required, Validators.minLength(12), Validators.maxLength(12)])
        this.vipEntryForm.get("driversEmail")?.addValidators([Validators.required, Validators.email])
      }else{
        this.vipOwnCar = false
          this.vipEntryForm.get("make")?.clearValidators()
          this.vipEntryForm.get("model")?.clearValidators()
          this.vipEntryForm.get("color")?.clearValidators()
          this.vipEntryForm.get("year")?.clearValidators()
          this.vipEntryForm.get("driversName")?.clearValidators()
          this.vipEntryForm.get("driversPhone")?.clearValidators()
          this.vipEntryForm.get("driversEmail")?.clearValidators()
      }
      this.vipEntryForm.get("make")?.updateValueAndValidity()
      this.vipEntryForm.get("model")?.updateValueAndValidity()
      this.vipEntryForm.get("color")?.updateValueAndValidity()
      this.vipEntryForm.get("year")?.updateValueAndValidity()
      this.vipEntryForm.get("driversName")?.updateValueAndValidity()
      this.vipEntryForm.get("driversPhone")?.updateValueAndValidity()
      this.vipEntryForm.get("driversEmail")?.updateValueAndValidity()
    })
  }
  
  carNamesMatchValidator(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      if(!this.carEntryForm){
        return null
      }
      if(!this.carEntryForm.get('contactName')!.value){
        return {invalidName: {value: control.value}}
      }
      const matches = this.carEntryForm.get('contactName')!.value.toLowerCase().trim() == control.value.toLowerCase().trim();
      return matches ? null : {invalidName: {value: control.value}};
    };
  }
  vipNamesMatchValidator(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      if(!this.vipEntryForm){
        return null
      }
      if(!this.vipEntryForm.get('contactName')!.value){
        return {invalidName: {value: control.value}}
      }
      const matches = this.vipEntryForm.get('contactName')!.value.toLowerCase().trim() == control.value.toLowerCase().trim();
      return matches ? null : {invalidName: {value: control.value}};
    };
  }
  paradeNamesMatchValidator(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      if(!this.paradeEntryForm){
        return null
      }
      if(!this.paradeEntryForm.get('contactName')!.value){
        return {invalidName: {value: control.value}}
      }
      const matches = this.paradeEntryForm.get('contactName')!.value.toLowerCase().trim() == control.value.toLowerCase().trim();
      return matches ? null : {invalidName: {value: control.value}};
    };
  }

  ngOnInit() {
    document.getElementById('paradeEntryModal')!.addEventListener('hidden.bs.modal',  (event) => {
      this.isLoading = false
      this.showSuccess = false
      this.paradeEntryForm.reset()
      this.paradeEntryForm.enable()
      this.paradeEntryForm.patchValue({'wantGift':'Yes', 'entryType': 'Float'})
    })
    document.getElementById('carEntryModal')!.addEventListener('hidden.bs.modal',  (event) => {
      this.isLoading = false
      this.showSuccess = false
      this.carEntryForm.reset()
      this.carEntryForm.enable()
      this.carEntryForm.patchValue({'wantGift':'Yes'})
    })
    document.getElementById('vipEntryModal')!.addEventListener('hidden.bs.modal',  (event) => {
      this.isLoading = false
      this.showSuccess = false
      this.vipEntryForm.reset()
      this.vipEntryForm.enable()
      this.vipEntryForm.patchValue({'vipOwnCar':'Yes'})
    })
  }


  onSubmit(formKey: string) {
    let form = null
    if(formKey == "VIP"){
      form = this.vipEntryForm
    }else if (formKey == "PARADE"){
      form = this.paradeEntryForm
    }else if(formKey == "CAR"){
      form = this.carEntryForm
    }

    form!.markAllAsTouched()



    if(form!.valid){
      this.isLoading = true
      form!.disable()

      let toAddress = ''
      let subject = ''
      let body = ''
      let replyTo = ''
      if(formKey == "VIP"){
        toAddress =  environment.forms.vipEntryForm.toEamil
        subject = environment.forms.vipEntryForm.subject
        body = EmailUtlity.createVIPEntryHTMLBody(form!)
        replyTo = this.vipEntryForm.get('email')!.value
      }else if (formKey == "PARADE"){
        toAddress =  environment.forms.paradeEntryForm.toEamil
        subject = environment.forms.paradeEntryForm.subject
        body = EmailUtlity.createParadeEntryHTMLBody(form!)
        replyTo = this.paradeEntryForm.get('email')!.value
      }else if(formKey == "CAR"){
        toAddress =  environment.forms.carEntryForm.toEamil
        subject = environment.forms.carEntryForm.subject
        body = EmailUtlity.createCarEntryHTMLBody(form!)
        replyTo = this.carEntryForm.get('email')!.value
      }


      this.emailService.sendEmail(toAddress, body, subject, replyTo, form!.get("contactName")!.value, form!.get("phone")!.value).subscribe(result =>{
        this.isLoading = false
        if(result.status){
          this.showSuccess = true
          this.showError = false
        }else{
          this.showSuccess = false
          this.showError = true
          this.carEntryForm.enable()
          this.vipEntryForm.enable()
          this.paradeEntryForm.enable()
        }
      })
    }
  }
}
