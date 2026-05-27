import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { CmsService, CmsEvent } from 'src/app/services/cms.service';
import { CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { Observable, forkJoin } from 'rxjs';
import { tap } from 'rxjs/operators';

@Component({
  selector: 'app-admin',
  templateUrl: './admin.component.html',
  styleUrls: ['./admin.component.css']
})
export class AdminComponent implements OnInit {
  events: CmsEvent[] = [];
  selectedFile?: File;

  constructor(private cmsService: CmsService, private router: Router) {}

  ngOnInit() {
    this.cmsService.getEvents().subscribe(res => this.events = res.events);
  }

  logout() {
    sessionStorage.removeItem('adminToken');
    this.router.navigate(['/sign-in']);
  }

  uploadImage() {
    if (!this.selectedFile) return;
    this.cmsService.uploadImage(this.selectedFile).subscribe(res => {
      console.log('Uploaded image URL:', res.url);
    });
  }

  uploadImageForEvent(eventItem: CmsEvent) {
    if (!this.selectedFile) return;

    this.cmsService.uploadImage(this.selectedFile).subscribe({
      next: (res) => {
        console.log('Uploaded image URL:', res.url);
        eventItem.flyerUrl = res.url;  // ✅ Auto-update event flyer
        this.selectedFile = undefined; // Reset selection
      },
      error: (err) => console.error(err)
    });
  }

  saveEvents() {
    const uploadObservables: Observable<any>[] = [];

    this.events.forEach(event => {
      if (event.selectedFile) { // store selected file per event
        const upload$ = this.cmsService.uploadImage(event.selectedFile).pipe(
          tap(res => {
            event.flyerUrl = res.url; // update flyerUrl with S3 URL
            event.selectedFile = undefined; // clear the file
          })
        );
        uploadObservables.push(upload$);
      }
    });

    if (uploadObservables.length) {
      forkJoin(uploadObservables).subscribe({
        next: () => this.finalizeSave(),
        error: err => console.error('Image upload failed', err)
      });
    } else {
      this.finalizeSave();
    }
  }

  // Actually save the JSON after images are uploaded
  finalizeSave() {
    this.events.forEach(event => {
      const peopleGroup = event.formFields.find(f => f.type === 'group');
      if (peopleGroup) {
        peopleGroup.name = 'teamMembers';
        event.pricing.basePlayerField = 'teamMembers';
      }
    });

    const updatedEvents = this.events.map(event => ({
      ...event,
      sections: this.buildSections(event)
    }));

    this.cmsService.updateEvents(updatedEvents).subscribe(res => {
      if (res.success) alert('Events saved!');
    });
  }

  // Update onFileSelected to store the file in the event
  onFileSelected(event: any, cmsEvent: CmsEvent) {
    const file: File = event.target.files[0];
    if (!file.type.startsWith("image/")) {
      alert("Only images are allowed!");
      return;
    }
    cmsEvent.selectedFile = file;
  }

  addEvent() {
    const newEvent: CmsEvent = {
      title: '',
      type: '',
      flyerUrl: '',
      description: '',
      eventMeta: {
        dateOfEvent: '',
        location: '',
        endBlurb: '',
        contactEmail: ''
      },
      pricing: {
        basePlayerField: '',
        includePrimaryPlayer: false,
        pricePerPlayer: 0,
        addOns: []
      },
      formFields: [],
      sections: []
    };

    this.events.push(newEvent);
  }

  editEvent(index: number) {
    const event = this.events[index];
    // You could open a modal here or show a form to edit the event
    console.log('Edit event:', event);
  }

  deleteEvent(index: number) {
    if (confirm('Are you sure you want to delete this event?')) {
      this.events.splice(index, 1);
    }
  }

  addAddOn(event: CmsEvent) {
    if (!event.pricing.addOns) {
      event.pricing.addOns = [];
    }
    event.pricing.addOns.push({ field: '', price: 0 });
  }

  removeAddOn(event: CmsEvent, index: number) {
    if (event.pricing.addOns) {
      event.pricing.addOns.splice(index, 1);
    }
  }

  addFormField(event: CmsEvent) {
    event.formFields.push({
      name: '',
      label: '',
      type: 'text',
      required: false,
      fields: []
    });
  }

  removeFormField(event: CmsEvent, index: number) {
    event.formFields.splice(index, 1);
  }

  addSubField(groupField: any) {
    if (!groupField.fields) groupField.fields = [];
    groupField.fields.push({
      name: '',
      label: '',
      type: 'text',
      required: false
    });
  }

  addSection(event: CmsEvent) {
    event.sections.push({ type: '', field: '', fields: [], fieldsString: '' });
  }

  removeSection(event: CmsEvent, index: number) {
    event.sections.splice(index, 1);
  }

  dropField(event: CdkDragDrop<any[]>, fields: any[]) {
    moveItemInArray(fields, event.previousIndex, event.currentIndex);
  }

  buildSections(event: CmsEvent) {
    const sections: any[] = [];

    const normalFields = event.formFields
      .filter(f => f.type !== 'group')
      .map(f => f.name);

    if (normalFields.length) {
      sections.push({
        type: 'fields',
        fields: normalFields
      });
    }

    event.formFields
      .filter(f => f.type === 'group')
      .forEach(groupField => {
        sections.push({
          type: 'group',
          field: groupField.name
        });
      });

    return sections;
  }

  toCamelCase(label: string): string {
    return label
      .trim()
      .replace(/[^A-Za-z0-9 ]+/g, '')       // remove non-alphanumeric chars
      .split(' ')
      .map((word, index) =>
        index === 0 ? word.toLowerCase() : word.charAt(0).toUpperCase() + word.slice(1)
      )
      .join('');
  }

  onFieldLabelChange(field: any) {
    if (field.type === 'group') {
      field.name = 'teamMembers';
    } else {
      field.name = this.toCamelCase(field.label);
    }
  }

  onFieldTypeChange(field: any) {
    if (field.type === 'group') {
      field.name = 'teamMembers';
    } else {
      field.name = this.toCamelCase(field.label);
    }
  }

  fieldTypes = [
    'text',
    'email',
    'number',
    'checkbox',
    'date',
    'phone',
    'group',
  ];

  subFieldTypes = [
    'text',
    'email',
    'number',
    'checkbox',
    'date',
    'phone'
  ];

}
