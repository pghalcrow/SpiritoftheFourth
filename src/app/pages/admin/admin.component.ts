import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';
import { CmsService, CmsEvent, AdminSubmission } from 'src/app/services/cms.service';
import { environment } from 'src/environments/environment';
import { CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { Observable, forkJoin } from 'rxjs';
import { tap } from 'rxjs/operators';

type AdminModalVariant = 'success' | 'danger' | 'warning';
type PricingMode = 'free' | 'fixed' | 'perParticipant';
type SubmissionGroupKey = 'all' | 'vendor' | 'artist' | 'sponsor' | 'motorShow' | 'parade' | 'volunteer' | 'specialEvents';
const ALLOWED_EVENT_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp']);

interface AdminModal {
  title: string;
  message: string;
  variant: AdminModalVariant;
  confirmText: string;
  cancelText?: string;
  onConfirm?: () => void;
}

interface SubmissionDisplayRow {
  label: string;
  value: string;
}

interface SubmissionGroupTab {
  key: SubmissionGroupKey;
  label: string;
}

@Component({
  selector: 'app-admin',
  templateUrl: './admin.component.html',
  styleUrls: ['./admin.component.css']
})
export class AdminComponent implements OnInit {
  events: CmsEvent[] = [];
  activeEventIndex = 0;
  selectedFile?: File;
  modal?: AdminModal;
  adminSection: 'events' | 'submissions' = 'submissions';
  submissions: AdminSubmission[] = [];
  selectedSubmission?: AdminSubmission;
  selectedSubmissionDetailRows: SubmissionDisplayRow[] = [];
  selectedSubmissionAddOnRows: SubmissionDisplayRow[] = [];
  submissionSearch = '';
  selectedSubmissionGroup: SubmissionGroupKey = 'all';
  submissionActionLoading: 'save' | 'delete' | null = null;
  submissionGroupTabs: SubmissionGroupTab[] = [
    { key: 'all', label: 'All' },
    { key: 'vendor', label: 'Vendors' },
    { key: 'sponsor', label: 'Sponsors' },
    { key: 'motorShow', label: 'Motor Show' },
    { key: 'parade', label: 'Parade' },
    { key: 'volunteer', label: 'Volunteers' },
    { key: 'specialEvents', label: 'Special Events' },
  ];
  submissionStatuses = ['New', 'In Review', 'Follow Up', 'Complete', 'Archived'];
  testMode = false;
  testModeLocalOnly = false;
  testModeLoading = false;

  activePricingHelp: string | null = null;
  pricingHelp = {
    mode: 'How this event is billed. “Fixed Price” charges one flat amount per registration. “Per Participant” multiplies your price by the number of people registered — useful for teams or groups. “Free” hides payment and shows a Sign Up button instead.',
    field: 'Per-participant pricing counts the people added to one of your “Group” form fields (for example a “Team Members” group). Choose that group here. If this list is empty, you have not created a Group field yet — add one with the button below, or add a field of type “Group” in the Form Fields section above and then choose it here.',
    price: 'The amount charged for each counted participant. The order total is this price times the number of participants — the group members, plus the primary registrant when that toggle is on — before any add-ons.',
    primary: 'When on, the person filling out the form counts as a paying participant too. Leave it off when the primary registrant organizes the group but is not attending themselves.'
  };

  constructor(private cmsService: CmsService, private router: Router, private sanitizer: DomSanitizer) {}

  ngOnInit() {
    this.cmsService.getEvents().subscribe(res => {
      this.events = (res.events || []).map(event => this.normalizeEventForEditor(event));
      this.activeEventIndex = this.events.length ? 0 : 0;
    });
    this.loadSubmissions();
    this.loadTestMode();
  }

  get activeEvent(): CmsEvent | undefined {
    return this.events[this.activeEventIndex];
  }

  normalizeEventForEditor(event: CmsEvent): CmsEvent {
    const contactEmails = this.normalizeContactEmails(event.eventMeta?.contactEmails, event.eventMeta?.contactEmail);
    return {
      ...event,
      isVisible: event.isVisible !== false,
      pricing: {
        ...event.pricing,
        pricingMode: this.derivePricingMode(event),
      },
      eventMeta: {
        ...event.eventMeta,
        dateOfEvent: this.normalizeDateForPicker(event.eventMeta?.dateOfEvent || ''),
        contactEmail: contactEmails[0] || '',
        contactEmails
      }
    };
  }

  normalizeContactEmails(contactEmails?: string[], legacyContactEmail?: string): string[] {
    const emails = Array.isArray(contactEmails) && contactEmails.length
      ? contactEmails
      : [legacyContactEmail || ''];
    const normalized = emails.map(email => String(email || '').trim()).filter(Boolean);
    return normalized.length ? normalized : [''];
  }

  normalizeDateForPicker(value: string): string {
    const trimmed = value.trim();
    if (!trimmed) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

    const date = new Date(trimmed);
    if (Number.isNaN(date.getTime())) return trimmed;

    const pad = (part: number) => String(part).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  getInputValue(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  derivePricingMode(event: CmsEvent): PricingMode {
    const mode = event.pricing?.pricingMode;
    if (mode === 'free' || mode === 'fixed' || mode === 'perParticipant') {
      return mode;
    }

    const hasParticipantField = Boolean(event.pricing?.basePlayerField && event.pricing.basePlayerField !== 'N/A');
    if (hasParticipantField || event.pricing?.includePrimaryPlayer) {
      return 'perParticipant';
    }

    return Number(event.pricing?.pricePerPlayer || 0) > 0 ? 'fixed' : 'free';
  }

  get adminHeaderTitle(): string {
    return this.adminSection === 'submissions' ? 'Submissions' : 'Upcoming Events';
  }

  get isDeveloper(): boolean {
    return sessionStorage.getItem('adminRole') === 'developer';
  }

  get testModeLabel(): string {
    return this.testMode ? 'Test Mode' : 'Live Mode';
  }

  loadTestMode() {
    if (!this.isDeveloper) return;
    if (!environment.production) {
      this.testMode = true;
      this.testModeLocalOnly = true;
      return;
    }
    this.cmsService.getTestMode().subscribe({
      next: res => {
        this.testMode = res.testMode;
        this.testModeLocalOnly = Boolean(res.localOnly);
      },
      error: err => {
        console.error('Test mode status failed', err);
        this.showModal('Test mode unavailable', 'Could not load developer test mode status.', 'danger');
      }
    });
  }

  toggleTestMode(enabled: boolean) {
    if (!this.isDeveloper || this.testModeLocalOnly) return;
    this.testModeLoading = true;
    this.cmsService.updateTestMode(enabled).subscribe({
      next: res => {
        this.testMode = res.testMode;
        this.testModeLocalOnly = Boolean(res.localOnly);
        this.testModeLoading = false;
        this.showModal(
          this.testMode ? 'Test mode enabled' : 'Live mode enabled',
          this.testMode
            ? 'Admin emails will route to the test inbox and Stripe will use test keys.'
            : 'Admin emails and Stripe payments will use live production settings.',
          'success'
        );
      },
      error: err => {
        console.error('Test mode update failed', err);
        this.testModeLoading = false;
        this.showModal('Test mode update failed', 'Could not update developer test mode.', 'danger');
      }
    });
  }

  selectEvent(index: number) {
    if (index >= 0 && index < this.events.length) {
      this.activeEventIndex = index;
    }
  }

  selectAdminSection(section: 'events' | 'submissions') {
    this.adminSection = section;
    if (section === 'submissions' && !this.submissions.length) {
      this.loadSubmissions();
    }
  }

  loadSubmissions() {
    this.cmsService.getSubmissions().subscribe({
      next: res => this.submissions = res.items || [],
      error: err => {
        console.error('Submissions load failed', err);
        this.showModal('Submissions unavailable', 'Could not load submissions.', 'danger');
      }
    });
  }

  get filteredSubmissions(): AdminSubmission[] {
    const groupedSubmissions = this.selectedSubmissionGroup !== 'all'
      ? this.submissions.filter(row => this.submissionMatchesGroup(row, this.selectedSubmissionGroup))
      : this.submissions;
    const query = this.submissionSearch.trim().toLowerCase();
    if (!query) return groupedSubmissions;
    return groupedSubmissions.filter(row =>
      [this.formatSubmissionTitle(row), row.submissionTitle, row.name, row.email, row.phone, row.status, row.assignedTo, row.notes]
        .filter(Boolean)
        .some(value => String(value).toLowerCase().includes(query))
    );
  }

  toggleSubmissionGroup(group: SubmissionGroupKey) {
    this.selectedSubmissionGroup = this.selectedSubmissionGroup === group ? 'all' : group;
    this.clearSelectedSubmission();
  }

  private submissionMatchesGroup(submission: AdminSubmission, group: SubmissionGroupKey): boolean {
    if (group === 'all') return true;

    const text = this.getSubmissionGroupText(submission);

    if (group === 'vendor') {
      return text.includes('vendor') || text.includes('vendorapplication');
    }
    if (group === 'artist') {
      return text.includes('artist') || text.includes('artistsignup');
    }
    if (group === 'sponsor') {
      return text.includes('sponsor') || text.includes('sponsorship');
    }
    if (group === 'motorShow') {
      return text.includes('motor show') || text.includes('motorshow') || text.includes('car show');
    }
    if (group === 'parade') {
      return text.includes('parade') || text.includes('paradeentry') || text.includes('paradecar') || text.includes('paradevip');
    }
    if (group === 'volunteer') {
      return text.includes('volunteer');
    }

    return this.isSpecialEventSubmission(submission);
  }

  private isSpecialEventSubmission(submission: AdminSubmission): boolean {
    if (
      this.submissionMatchesGroup(submission, 'vendor') ||
      this.submissionMatchesGroup(submission, 'artist') ||
      this.submissionMatchesGroup(submission, 'sponsor') ||
      this.submissionMatchesGroup(submission, 'motorShow') ||
      this.submissionMatchesGroup(submission, 'parade') ||
      this.submissionMatchesGroup(submission, 'volunteer')
    ) {
      return false;
    }

    const rawData = submission.rawData || {};
    return Boolean(
      rawData.eventTitle ||
      rawData.eventType ||
      rawData.pricing ||
      rawData.addOns ||
      rawData.players ||
      rawData.teamMembers ||
      submission.paymentProvider === 'stripe' ||
      submission.paymentProvider === 'paypal'
    );
  }

  private getSubmissionGroupText(submission: AdminSubmission): string {
    const rawData = submission.rawData || {};
    return [
      submission.source,
      submission.submissionTitle,
      rawData.formType,
      rawData.eventTitle,
      rawData.eventType,
      rawData.type,
    ]
      .filter(Boolean)
      .map(value => String(value).toLowerCase())
      .join(' ');
  }

  selectSubmission(submission: AdminSubmission) {
    this.selectedSubmission = {
      ...submission,
      paymentReceived: this.isCheckPaymentSubmission(submission) ? submission.paymentReceived === true : submission.paymentReceived,
    };
    this.selectedSubmissionDetailRows = this.getSubmissionDetailRows(this.selectedSubmission);
    this.selectedSubmissionAddOnRows = this.getSubmissionAddOns(this.selectedSubmission);
  }

  clearSelectedSubmission() {
    this.selectedSubmission = undefined;
    this.selectedSubmissionDetailRows = [];
    this.selectedSubmissionAddOnRows = [];
  }

  formatSubmissionDate(value?: string): string {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;

    const pad = (part: number) => String(part).padStart(2, '0');
    return [
      date.getFullYear(),
      pad(date.getMonth() + 1),
      pad(date.getDate())
    ].join('-') + ` ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  getSubmissionDetailRows(submission?: AdminSubmission): SubmissionDisplayRow[] {
    const rawData = submission?.rawData;
    if (!rawData || typeof rawData !== 'object' || Array.isArray(rawData)) {
      return [];
    }

    if (this.isMotorShowSubmission(submission)) {
      const motorShowRows = this.getMotorShowDetailRows(rawData);
      if (motorShowRows.length) return motorShowRows;
    }

    const excludedFields = new Set([
      'action',
      'type',
      'paymentMethod',
      'pricing',
      'addOns',
      'players',
      'total',
      'grandTotal',
      'submission_id',
      'stripe_session_id',
      'paypal_order_id',
      'firstName',
      'lastName',
      'fullName',
      'contactName',
      'name',
      'email',
      'phone',
      'additionalPlaques',
      'additionalSmall',
      'additionalMedium',
      'additionalLarge',
      'additionalXLarge',
      'additionalXXLarge',
      'additionalXXXLarge',
      'comboSize',
      'attachments',
      'body',
      'fileDropRef',
      'subject',
      'toContact',
      'replyTo',
    ]);

    const preferredOrder = [
      'streetAddress',
      'city',
      'state',
      'zipcode',
      'year',
      'make',
      'model',
      'color',
      'clubAffiliation',
      'message',
      'availability',
      'vendorStatus',
      'vendorType',
      'companyName',
      'website',
      'description',
      'specialRequests',
      'signatureName',
    ];

    const keys = Object.keys(rawData)
      .filter(key => !excludedFields.has(key) && this.hasDisplayValue(rawData[key]))
      .sort((a, b) => {
        const aIndex = preferredOrder.indexOf(a);
        const bIndex = preferredOrder.indexOf(b);
        if (aIndex >= 0 || bIndex >= 0) {
          return (aIndex >= 0 ? aIndex : Number.MAX_SAFE_INTEGER) - (bIndex >= 0 ? bIndex : Number.MAX_SAFE_INTEGER);
        }
        return this.formatSubmissionFieldLabel(a).localeCompare(this.formatSubmissionFieldLabel(b));
      });

    const rows = keys.map(key => ({
      label: this.formatSubmissionFieldLabel(key),
      value: this.formatSubmissionFieldValue(rawData[key], key),
    }));
    if (rows.length) return rows;

    return this.parseSubmissionBodyRows(rawData.body);
  }

  private isMotorShowSubmission(submission?: AdminSubmission): boolean {
    const rawData = submission?.rawData;
    return [
      submission?.source,
      submission?.submissionTitle,
      rawData?.type,
      rawData?.subject,
    ].some(value => typeof value === 'string' && /motor show|motorshoworder/i.test(value));
  }

  isCheckPaymentSubmission(submission?: AdminSubmission): boolean {
    const rawData = submission?.rawData || {};
    const paymentMethod = typeof rawData.paymentMethod === 'string' ? rawData.paymentMethod : '';
    if (/^(check|paybycheck|pay_by_check|pay-by-check)$/i.test(paymentMethod.replace(/\s+/g, ''))) {
      return true;
    }

    return [
      submission?.submissionTitle,
      submission?.paymentProvider,
      rawData.subject,
      rawData.body,
    ].some(value => typeof value === 'string' && /check payment|pay by check|mail check/i.test(value));
  }

  isCheckPaymentUnreceived(submission?: AdminSubmission): boolean {
    return this.isCheckPaymentSubmission(submission) && submission?.paymentReceived !== true;
  }

  private getMotorShowDetailRows(rawData: any): SubmissionDisplayRow[] {
    const rows: SubmissionDisplayRow[] = [];
    const cityStateZip = [
      rawData.city,
      [rawData.state, rawData.zipcode].filter(value => this.hasDisplayValue(value)).join(' '),
    ].filter(value => this.hasDisplayValue(value)).join(', ');
    const addressParts = [rawData.streetAddress, cityStateZip].filter(value => this.hasDisplayValue(value));
    if (addressParts.length) {
      rows.push({ label: 'Address', value: addressParts.join(', ') });
    }

    const vehicleParts = [rawData.year, rawData.make, rawData.model].filter(value => this.hasDisplayValue(value));
    if (vehicleParts.length) {
      const color = this.hasDisplayValue(rawData.color) ? ` (${rawData.color})` : '';
      rows.push({ label: 'Vehicle', value: `${vehicleParts.join(' ')}${color}` });
    }

    if (this.hasDisplayValue(rawData.clubAffiliation)) {
      rows.push({ label: 'Club Affiliation', value: String(rawData.clubAffiliation) });
    }
    if (this.hasDisplayValue(rawData.comboSize)) {
      rows.push({ label: 'T-Shirt & Plaque Bundle', value: String(rawData.comboSize) });
    }

    const total = this.hasDisplayValue(rawData.grandTotal) ? rawData.grandTotal : rawData.total;
    if (this.hasDisplayValue(total)) {
      rows.push({ label: 'Total', value: this.formatCurrencyValue(total) });
    }

    return rows;
  }

  getSubmissionAddOns(submission?: AdminSubmission): SubmissionDisplayRow[] {
    const rawData = submission?.rawData;
    if (!rawData || typeof rawData !== 'object' || Array.isArray(rawData)) {
      return [];
    }

    const rows: SubmissionDisplayRow[] = [];
    if (!this.isMotorShowSubmission(submission) && this.hasDisplayValue(rawData.comboSize)) {
      rows.push({ label: 'T-Shirt & Plaque Bundle', value: String(rawData.comboSize) });
    }

    [
      ['additionalPlaques', 'Additional Plaque'],
      ['additionalSmall', 'Additional T-Shirt - Small'],
      ['additionalMedium', 'Additional T-Shirt - Medium'],
      ['additionalLarge', 'Additional T-Shirt - Large'],
      ['additionalXLarge', 'Additional T-Shirt - XLarge'],
      ['additionalXXLarge', 'Additional T-Shirt - XXLarge'],
      ['additionalXXXLarge', 'Additional T-Shirt - XXXLarge'],
    ].forEach(([field, label]) => {
      const quantity = Number(rawData[field]);
      if (Number.isFinite(quantity) && quantity > 0) {
        rows.push({ label, value: String(quantity) });
      }
    });

    return rows;
  }

  private hasDisplayValue(value: any): boolean {
    if (value === null || value === undefined) return false;
    if (typeof value === 'string') return value.trim().length > 0;
    if (typeof value === 'number') return Number.isFinite(value);
    if (typeof value === 'boolean') return true;
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === 'object') return Object.keys(value).length > 0;
    return true;
  }

  private formatSubmissionFieldLabel(key: string): string {
    const labels: Record<string, string> = {
      streetAddress: 'Street Address',
      zipcode: 'Zip Code',
      year: 'Vehicle Year',
      make: 'Make',
      model: 'Model',
      color: 'Color',
      clubAffiliation: 'Club Affiliation',
      availability: 'Availability',
      message: 'Message',
    };

    if (labels[key]) return labels[key];

    return key
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/[_-]+/g, ' ')
      .replace(/\b\w/g, char => char.toUpperCase());
  }

  private formatSubmissionFieldValue(value: any, key = ''): string {
    if (key === 'formType' && typeof value === 'string') {
      return this.formatFormTypeValue(value);
    }
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (Array.isArray(value)) return value.map(item => this.formatSubmissionFieldValue(item)).join(', ');
    if (value && typeof value === 'object') return JSON.stringify(value);
    if (value === 'motorShowOrder Order' || value === 'Motor Show Event Order') return 'Motor Show Event';
    if (value === 'Freedom Club Donation Order') return 'Freedom Club Donation';
    return String(value);
  }

  formatSubmissionTitle(submission?: AdminSubmission): string {
    const title = submission?.submissionTitle || '';
    if (title === 'motorShowOrder Order' || title === 'Motor Show Event Order') {
      return 'Motor Show Event';
    }
    if (title === 'Freedom Club Donation Order') {
      return 'Freedom Club Donation';
    }
    if (title.endsWith(' Order')) {
      return title.slice(0, -' Order'.length);
    }
    return title;
  }

  private formatFormTypeValue(value: string): string {
    const labels: Record<string, string> = {
      volunteerForm: 'Volunteer Request',
      sponsorshipForm: 'Sponsorship Submission',
      vendorApplicationForm: 'Vendor Application',
      artistSignUpForm: 'Artist Sign-Up',
      paradeEntryForm: 'Parade Entry',
      carEntryForm: 'Parade Car Entry',
      vipEntryForm: 'VIP Parade Entry',
      motorShowOrder: 'Motor Show Event',
    };

    return labels[value] || this.formatSubmissionFieldLabel(value);
  }

  private formatCurrencyValue(value: any): string {
    const amount = Number(value);
    if (!Number.isFinite(amount)) return String(value);
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  }

  private parseSubmissionBodyRows(body: any): SubmissionDisplayRow[] {
    if (typeof body !== 'string' || !body.trim()) return [];

    const excludedLabels = new Set([
      'name',
      'email',
      'phone',
    ]);
    const allowedLabels = new Set([
      'address',
      'vehicle',
      'club affiliation',
      't-shirt & plaque bundle',
      'total',
    ]);

    return body
      .split(/\r?\n/)
      .map(line => line.trim())
      .map(line => {
        const match = line.match(/^([^:]+):\s*(.+)$/);
        if (!match) return undefined;
        const label = match[1].trim();
        const value = match[2].trim();
        const normalizedLabel = label.toLowerCase();
        if (excludedLabels.has(normalizedLabel) || !allowedLabels.has(normalizedLabel)) return undefined;
        return { label, value };
      })
      .filter((row): row is SubmissionDisplayRow => Boolean(row));
  }

  saveSelectedSubmission() {
    if (!this.selectedSubmission || this.submissionActionLoading) return;
    const { submissionId, notes } = this.selectedSubmission;
    const update = this.isCheckPaymentSubmission(this.selectedSubmission)
      ? { notes, paymentReceived: this.selectedSubmission.paymentReceived === true }
      : { notes };
    this.submissionActionLoading = 'save';
    this.cmsService.updateSubmissionAdminFields(submissionId, update).subscribe({
      next: updated => {
        this.submissions = this.submissions.map(row =>
          row.submissionId === updated.submissionId ? { ...row, ...updated } : row
        );
        this.submissionActionLoading = null;
        this.clearSelectedSubmission();
        this.showModal('Submission saved', 'Admin fields have been updated.', 'success');
      },
      error: err => {
        console.error('Submission save failed', err);
        this.submissionActionLoading = null;
        this.showModal('Save failed', 'Could not update the submission.', 'danger');
      }
    });
  }

  requestDeleteSelectedSubmission() {
    if (!this.selectedSubmission) return;
    const title = this.selectedSubmission.submissionTitle || 'this submission';
    this.showModal(
      'Delete submission',
      `Are you sure you want to delete ${title}? This cannot be undone.`,
      'danger',
      'Delete Submission',
      'Cancel',
      () => this.deleteSelectedSubmission()
    );
  }

  deleteSelectedSubmission() {
    if (!this.selectedSubmission || this.submissionActionLoading) return;
    const submissionId = this.selectedSubmission.submissionId;
    this.submissionActionLoading = 'delete';
    this.cmsService.deleteSubmission(submissionId).subscribe({
      next: () => {
        this.submissions = this.submissions.filter(row => row.submissionId !== submissionId);
        this.submissionActionLoading = null;
        this.clearSelectedSubmission();
        this.showModal('Submission deleted', 'The submission has been deleted.', 'success');
      },
      error: err => {
        console.error('Submission delete failed', err);
        this.submissionActionLoading = null;
        this.showModal('Delete failed', 'Could not delete the submission.', 'danger');
      }
    });
  }

  getEventTabLabel(event: CmsEvent, index: number): string {
    return event.title?.trim() || `New Event ${index + 1}`;
  }

  getFlyerSrc(url: string): string {
    return this.cmsService.resolveAssetUrl(url);
  }

  hasEventImage(event: CmsEvent): boolean {
    return Boolean(event.flyerUrl || event.selectedFilePreviewUrl);
  }

  getEventImagePreviewSrc(event: CmsEvent): string | SafeUrl {
    if (event.selectedFilePreviewUrl) {
      return this.sanitizer.bypassSecurityTrustUrl(event.selectedFilePreviewUrl);
    }
    return this.getFlyerSrc(event.flyerUrl);
  }

  removeEventImage(event: CmsEvent) {
    this.revokeEventPreviewUrl(event);
    event.flyerUrl = '';
    event.selectedFile = undefined;
    event.selectedFilePreviewUrl = undefined;
  }

  logout() {
    sessionStorage.removeItem('adminToken');
    sessionStorage.removeItem('adminRole');
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
    if (!this.validateEventsBeforeSave()) {
      return;
    }

    const invalidImageEvent = this.events.find(event => event.selectedFile && !this.isSupportedEventImage(event.selectedFile));
    if (invalidImageEvent) {
      this.showUnsupportedImageModal();
      this.adminSection = 'events';
      this.activeEventIndex = Math.max(this.events.indexOf(invalidImageEvent), 0);
      return;
    }

    const uploadObservables: Observable<any>[] = [];

    this.events.forEach(event => {
      if (event.selectedFile) { // store selected file per event
        const upload$ = this.cmsService.uploadImage(event.selectedFile).pipe(
          tap(res => {
            event.flyerUrl = res.url; // update flyerUrl with S3 URL
            event.selectedFile = undefined; // clear the file
            this.revokeEventPreviewUrl(event);
            event.selectedFilePreviewUrl = undefined;
          })
        );
        uploadObservables.push(upload$);
      }
    });

    if (uploadObservables.length) {
      forkJoin(uploadObservables).subscribe({
        next: () => this.finalizeSave(),
        error: err => {
          console.error('Image upload failed', err);
          this.showModal('Image upload failed', 'Please try saving again.', 'danger');
        }
      });
    } else {
      this.finalizeSave();
    }
  }

  validateEventsBeforeSave(): boolean {
    const invalidEvent = this.events.find(event =>
      !event.title?.trim() ||
      !event.eventMeta?.dateOfEvent?.trim() ||
      !event.eventMeta?.location?.trim()
    );

    if (!invalidEvent) {
      return true;
    }

    this.showModal(
      'Event details required',
      'Event title, date, and location are required before saving.',
      'warning'
    );
    this.adminSection = 'events';
    this.activeEventIndex = Math.max(this.events.indexOf(invalidEvent), 0);
    return false;
  }

  togglePricingHelp(key: string, ev?: Event) {
    ev?.preventDefault();
    ev?.stopPropagation();
    this.activePricingHelp = this.activePricingHelp === key ? null : key;
  }

  hasGroupField(event: CmsEvent): boolean {
    return event.formFields.some(field => field.type === 'group');
  }

  addParticipantGroup(event: CmsEvent) {
    const groupField = {
      name: 'teamMembers',
      label: 'Team Members',
      type: 'group',
      required: false,
      maxMembers: 4,
      fields: []
    };
    event.formFields.push(groupField);
    event.pricing.basePlayerField = groupField.name;
  }

  pricingPreview(event: CmsEvent): string {
    const price = Number(event.pricing?.pricePerPlayer || 0);
    const priceLabel = price > 0 ? `$${price}` : 'The per-participant price';
    const sources: string[] = [];
    const groupField = event.formFields.find(
      field => field.type === 'group' && field.name === event.pricing.basePlayerField
    );
    if (groupField) {
      sources.push(`each person added to “${groupField.label || 'the participant group'}”`);
    }
    if (event.pricing.includePrimaryPlayer) {
      sources.push('the primary registrant');
    }
    if (!sources.length) {
      return 'No participants are counted yet, so every order totals $0. Pick a participant group below or turn on “Include Primary Participant”.';
    }
    return `${priceLabel} is charged for ${sources.join(' and ')}.`;
  }

  onPricingModeChange(event: CmsEvent, mode: PricingMode) {
    event.pricing.pricingMode = mode;
    if (mode === 'free') {
      event.pricing.basePlayerField = 'N/A';
      event.pricing.includePrimaryPlayer = false;
      event.pricing.pricePerPlayer = 0;
      return;
    }

    if (mode === 'fixed') {
      event.pricing.basePlayerField = 'N/A';
      event.pricing.includePrimaryPlayer = false;
      return;
    }

    const currentField = event.formFields.find(field => field.type === 'group' && field.name === event.pricing.basePlayerField);
    if (!currentField) {
      const firstGroup = event.formFields.find(field => field.type === 'group');
      event.pricing.basePlayerField = firstGroup?.name || 'N/A';
    }
  }

  addEventContactEmail(event: CmsEvent) {
    event.eventMeta.contactEmails = this.normalizeContactEmails(event.eventMeta.contactEmails, event.eventMeta.contactEmail);
    event.eventMeta.contactEmails.push('');
  }

  removeEventContactEmail(event: CmsEvent, index: number) {
    event.eventMeta.contactEmails = this.normalizeContactEmails(event.eventMeta.contactEmails, event.eventMeta.contactEmail);
    event.eventMeta.contactEmails.splice(index, 1);
    if (!event.eventMeta.contactEmails.length) {
      event.eventMeta.contactEmails.push('');
    }
    event.eventMeta.contactEmail = event.eventMeta.contactEmails[0] || '';
  }

  updateEventContactEmail(event: CmsEvent, index: number, value: string) {
    event.eventMeta.contactEmails = this.normalizeContactEmails(event.eventMeta.contactEmails, event.eventMeta.contactEmail);
    event.eventMeta.contactEmails[index] = value;
    event.eventMeta.contactEmail = event.eventMeta.contactEmails.find(email => email.trim())?.trim() || '';
  }

  trackContactEmailByIndex(index: number): number {
    return index;
  }

  // Actually save the JSON after images are uploaded
  finalizeSave() {
    const updatedEvents = this.events.map(event => ({
      ...event,
      isVisible: event.isVisible !== false,
      pricing: this.normalizePricingForSave(event),
      eventMeta: {
        ...event.eventMeta,
        contactEmails: this.normalizeContactEmails(event.eventMeta.contactEmails, event.eventMeta.contactEmail).filter(email => email.trim()),
        contactEmail: this.normalizeContactEmails(event.eventMeta.contactEmails, event.eventMeta.contactEmail).find(email => email.trim()) || ''
      },
      sections: this.buildSections(event)
    }));

    this.cmsService.updateEvents(updatedEvents).subscribe({
      next: res => {
        if (res.success) {
          this.showModal('Events saved', 'Your event changes have been saved.', 'success');
        }
      },
      error: err => {
        console.error('Events save failed', err);
        this.showModal('Save failed', 'Please try saving again.', 'danger');
      }
    });
  }

  normalizePricingForSave(event: CmsEvent) {
    const mode = this.derivePricingMode(event);
    const pricing = {
      ...event.pricing,
      pricingMode: mode,
    };

    if (mode === 'free') {
      return {
        ...pricing,
        basePlayerField: 'N/A',
        includePrimaryPlayer: false,
        pricePerPlayer: 0,
        addOns: [],
      };
    }

    if (mode === 'fixed') {
      return {
        ...pricing,
        basePlayerField: 'N/A',
        includePrimaryPlayer: false,
      };
    }

    return pricing;
  }

  // Update onFileSelected to store the file in the event
  onFileSelected(event: any, cmsEvent: CmsEvent) {
    const file: File = event.target.files[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      this.showModal('Invalid image', 'Only images are allowed!', 'warning');
      event.target.value = '';
      return;
    }

    if (!this.isSupportedEventImage(file)) {
      this.showUnsupportedImageModal();
      event.target.value = '';
      return;
    }
    this.revokeEventPreviewUrl(cmsEvent);
    cmsEvent.flyerUrl = '';
    cmsEvent.selectedFile = file;
    cmsEvent.selectedFilePreviewUrl = URL.createObjectURL(file);
    event.target.value = '';
  }

  private isSupportedEventImage(file: File): boolean {
    return ALLOWED_EVENT_IMAGE_TYPES.has(file.type);
  }

  private showUnsupportedImageModal() {
    this.showModal('Unsupported image format', 'Use a PNG, JPG, or WebP image before saving.', 'warning');
  }

  private revokeEventPreviewUrl(event: CmsEvent) {
    if (event.selectedFilePreviewUrl?.startsWith('blob:')) {
      URL.revokeObjectURL(event.selectedFilePreviewUrl);
    }
  }

  addEvent() {
    const newEvent: CmsEvent = {
      title: '',
      type: '',
      flyerUrl: '',
      description: '',
      isVisible: true,
      eventMeta: {
        dateOfEvent: '',
        location: '',
        endBlurb: '',
        contactEmail: '',
        contactEmails: ['']
      },
      pricing: {
        pricingMode: 'fixed',
        basePlayerField: 'N/A',
        includePrimaryPlayer: false,
        pricePerPlayer: 0,
        addOns: []
      },
      formFields: [],
      sections: []
    };

    this.events.push(newEvent);
    this.activeEventIndex = this.events.length - 1;
    this.adminSection = 'events';
  }

  editEvent(index: number) {
    const event = this.events[index];
    // You could open a modal here or show a form to edit the event
    console.log('Edit event:', event);
  }

  deleteEvent(index: number) {
    this.showModal(
      'Delete event',
      'Are you sure you want to delete this event?',
      'danger',
      'Delete Event',
      'Cancel',
      () => {
      this.events.splice(index, 1);
      this.activeEventIndex = Math.min(this.activeEventIndex, Math.max(this.events.length - 1, 0));
      }
    );
  }

  showModal(
    title: string,
    message: string,
    variant: AdminModalVariant,
    confirmText = 'OK',
    cancelText?: string,
    onConfirm?: () => void
  ) {
    this.modal = { title, message, variant, confirmText, cancelText, onConfirm };
  }

  closeModal() {
    this.modal = undefined;
  }

  confirmModal() {
    const onConfirm = this.modal?.onConfirm;
    this.closeModal();
    onConfirm?.();
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
