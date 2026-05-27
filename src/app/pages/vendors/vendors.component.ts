import { Component, ElementRef, ViewChild } from '@angular/core';
import { AbstractControl, FormBuilder, FormControl, FormGroup, ValidationErrors, ValidatorFn, Validators } from '@angular/forms';
import { EmailService } from 'src/app/services/email.service';
import { FileServerService } from 'src/app/services/file-server.service';
import { OrderService } from 'src/app/services/order.service';
import { EmailUtlity } from 'src/app/utilities/email-utility';
import { States } from 'src/app/utilities/states';
import { environment } from 'src/environments/environment';
import * as moment from 'moment';


@Component({
  selector: 'app-vendors',
  templateUrl: './vendors.component.html',
  styleUrls: ['./vendors.component.css']
})
export class VendorsComponent {

  vendorApplicationForm: FormGroup;
  artistForm: FormGroup;
  states = new States().states
  isLoading: boolean = false
  showSuccess: boolean = false
  showError: boolean = false
  showFileErrorMessage: boolean = false
  fileErrorMessage: string = ""
  filesSize: string = "0 Bytes"
  totalFilesSize: number = 0
  maxFileSize: number = 15
  acceptedFileTypes: string[] = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/jpg',
    'image/jpeg',
    'image/png'
  ]
  files: File[] = []
  hasTouchedFileDrop: boolean = false
  shouldDisable: boolean = false
  paymentMethod: string = 'paypal'

  currentYear: number = 0

  // Fee schedule for vendor types. Non-Profit remains $0 (email-only submission).
  vendorTypeFees: { [key: string]: number } = {
    'Non-Profit': 0,
    'Information Only': 50,
    'Non-Food Sales': 65,
    'Food Sales - Day Only': 110,
    'Food Sales - Evening Only': 275,
    'Food Sales - Day and Evening': 175
  }

  @ViewChild("fileDropRef", { static: false }) fileDropEl!: ElementRef;

  constructor(
    private fb: FormBuilder,
    private emailService: EmailService,
    private uploadService: FileServerService,
    private orderService: OrderService
  ) {
    let current = moment()
    this.currentYear = current.year()
    let thisYear4th = moment([this.currentYear, 6, 4])
    if (current.isAfter(thisYear4th)) {
      this.currentYear++
    }

    this.vendorApplicationForm = new FormGroup({
      vendorStatus: new FormControl('New Vendor', Validators.required),
      vendorType: new FormControl('Non-Profit', Validators.required),
      companyName: new FormControl('', Validators.required),
      contactName: new FormControl('', Validators.required),
      email: new FormControl('', [Validators.required, Validators.email]),
      phone: new FormControl('', [Validators.required, Validators.minLength(12), Validators.maxLength(12)]),
      streetAddress: new FormControl('', Validators.required),
      city: new FormControl('', Validators.required),
      zipcode: new FormControl('', [Validators.required, Validators.minLength(5), Validators.maxLength(5)]),
      state: new FormControl('CA', Validators.required),
      website: new FormControl('', [Validators.required]),
      specialRequests: new FormControl(''),
      description: new FormControl('', [Validators.required]),
      agreeCheckbox: new FormControl('', Validators.requiredTrue),
      signatureName: new FormControl('', [Validators.required, this.namesMatchValidator()]),
      fileDropRef: new FormControl([null])
    });

    this.artistForm = new FormGroup({
      contactName: new FormControl('', Validators.required),
      organizationName: new FormControl(''),
      email: new FormControl('', [Validators.required, Validators.email]),
      phone: new FormControl('', [Validators.required, Validators.minLength(12), Validators.maxLength(12)]),
      message: new FormControl(''),
    });
  }

  ngOnInit() {
    document.getElementById('vendorApplicationModal')!.addEventListener('hidden.bs.modal', (event) => {
      this.isLoading = false
      this.showSuccess = false
      this.showError = false
      this.vendorApplicationForm.reset()
      this.vendorApplicationForm.enable()
      this.vendorApplicationForm.patchValue({ 'vendorStatus': 'New Vendor', 'vendorType': 'Non-Profit' })
      this.updateFilesSizeValue()
    })

    document.getElementById('artistModal')!.addEventListener('hidden.bs.modal', (event) => {
      this.isLoading = false
      this.showSuccess = false
      this.showError = false
      this.artistForm.reset()
      this.artistForm.enable()
    });
  }

  get currentFee(): number {
    const type = this.vendorApplicationForm?.get('vendorType')?.value
    return this.vendorTypeFees[type] ?? 0
  }

  namesMatchValidator(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      if (!this.vendorApplicationForm) {
        return null
      }
      if (!this.vendorApplicationForm.get('contactName')!.value) {
        return { invalidName: { value: control.value } }
      }
      const matches = this.vendorApplicationForm.get('contactName')!.value.toLowerCase().trim() == control.value.toLowerCase().trim();
      return matches ? null : { invalidName: { value: control.value } };
    };
  }
  async onSubmit(form: FormGroup, formType: 'vendor' | 'artist') {
    form.markAllAsTouched(); // Mark all form fields as touched for validation

    if (form.valid && this.totalFilesSize <= this.maxFileSize) {
      this.isLoading = true;
      form.disable();

      let toAddress = '';
      let subject = '';
      let body = '';
      let replyTo = form.get('email')!.value;
      let name = form.get("contactName")!.value;
      let phone = form.get("phone")!.value;

      if (formType === 'vendor') {
        // Vendor form processing
        const formData = this.vendorApplicationForm.getRawValue();
        toAddress = environment.forms.vendorApplicationForm.toEamil;
        subject = environment.forms.vendorApplicationForm.subject;
        body = EmailUtlity.createVendorApplicationHTMLBody(this.vendorApplicationForm);

        const fee = this.currentFee;
        const basePayload = { ...formData, toContact: toAddress, subject: subject, replyTo: replyTo, name: name, phone: phone, body: body, grandTotal: fee };

        if (this.files.length > 0) {
          this.uploadService.postFiles(this.files).subscribe(folder => {
            folder.subscribe((folder: string) => {
              this.finalizeVendorSubmission({ ...basePayload, attachments: folder }, fee);
            });
          });
        } else {
          this.finalizeVendorSubmission({ ...basePayload, attachments: '' }, fee);
        }
      } else if (formType === 'artist') {
        // Artist form processing
        toAddress = environment.forms.artistSignUpForm.toEamil;
        subject = environment.forms.artistSignUpForm.subject;
        body = EmailUtlity.createArtistFormHTMLBody(this.artistForm);

        // Send artist email
        this.emailService.sendEmail(toAddress, body, subject, replyTo, name, phone).subscribe(result => {
          this.isLoading = false;
          if (result.status) {
            this.showSuccess = true;
            this.showError = false;
          } else {
            this.showSuccess = false;
            this.showError = true;
            this.artistForm.enable();
          }
        });
      }
    }
  }


  finalizeVendorSubmission(payload: any, fee: number) {
    const basePayload = {
      ...payload,
      type: 'vendorApplication',
      paymentMethod: fee > 0 ? this.paymentMethod : 'none'
    };

    if (fee > 0 && this.paymentMethod === 'stripe') {
      this.orderService.createStripeOrder(basePayload).subscribe({
        next: response => {
          if (response?.session_url) {
            window.location.href = response.session_url;
          }
        },
        error: error => {
          console.log(error);
          this.isLoading = false;
          this.showError = true;
          this.vendorApplicationForm.enable();
        }
      });
    } else {
      this.orderService.createEventPayPalOrder({ ...basePayload, action: 'createOrder' }).subscribe({
        next: result => {
          const links = result?.['links'] ?? [];
          const payerAction = links.find((link: any) => link['rel'] === 'payer-action');

          if (payerAction) {
            document.location.href = payerAction['href'];
            return;
          }

          this.isLoading = false;
          this.showSuccess = true;
          this.showError = false;
        },
        error: error => {
          console.log(error);
          this.isLoading = false;
          this.showError = true;
          this.vendorApplicationForm.enable();
        }
      });
    }
  }

  sendMail(payload: any) {
    this.emailService.sendVenderEmail(payload).subscribe({
      next: result => {
        this.isLoading = false
        if (result.status) {
          this.showSuccess = true
          this.showError = false

        } else {
          this.showSuccess = false
          this.showError = true
          this.vendorApplicationForm.enable()
        }
      },
      error: error => {
        console.log(error)
        this.isLoading = false
        this.showError = false
      }
    })
  }

  fileBrowserHandler($event: any) {
    this.prepareFilesList($event.target.files);
  }

  onFilesDropped($event: any) {
    if (!this.shouldDisable) {
      this.prepareFilesList($event);
    }
    this.updateFilesSizeValue()
  }

  prepareFilesList(files: Array<File>) {
    this.hasTouchedFileDrop = true

    this.vendorApplicationForm.get('fileDropRef')!.markAsTouched({ onlySelf: true })
    this.showFileErrorMessage = false
    for (const file of files) {
      if (this.acceptedFileTypes.includes(file.type)) {
        this.files.push(file);
      } else {
        this.showFileErrorMessage = true
      }

    }

    this.updateFilesSizeValue()
  }

  deleteFile($event: number) {
    if (!this.shouldDisable) {
      this.files.splice($event, 1)
    }
    this.updateFilesSizeValue()
  }

  updateFilesSizeValue() {
    let size = 0
    this.files.forEach(item => {
      size += item.size
    });
    this.filesSize = this.formatBytes(size)
    this.totalFilesSize = size / (1024 ** 2)
  }

  formatBytes(bytes: number, decimals: number = 2) {
    if (bytes === 0) {
      return "0 Bytes";
    }
    const k = 1024;
    const dm = decimals <= 0 ? 0 : decimals;
    const sizes = ["Bytes", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
  }
}