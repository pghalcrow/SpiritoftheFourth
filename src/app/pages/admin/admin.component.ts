import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';
import { CmsService, CmsEvent, AdminRole, AdminSubmission, AdminUser } from 'src/app/services/cms.service';
import { environment } from 'src/environments/environment';
import { CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { Observable, forkJoin, of } from 'rxjs';
import { finalize, switchMap, tap } from 'rxjs/operators';
import writeExcelFile from 'write-excel-file/browser';

type AdminModalVariant = 'success' | 'danger' | 'warning';
type PricingMode = 'free' | 'fixed' | 'perParticipant';
type SubmissionGroupKey = 'all' | 'vendor' | 'artist' | 'sponsor' | 'motorShow' | 'parade' | 'volunteer' | 'specialEvents';
type AdminSection = 'events' | 'submissions' | 'users';
const ALLOWED_EVENT_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp']);
const ADMIN_ROLE_SORT_ORDER: Record<string, number> = {
  developer: 0,
  superAdmin: 1,
  admin: 2,
  viewer: 3,
};
const SUBMISSION_SUMMARY_RAW_KEYS = new Set(['formType', 'eventTitle', 'eventType', 'type', 'subject']);

interface AdminModal {
  title: string;
  message: string;
  variant: AdminModalVariant;
  confirmText: string;
  cancelText?: string;
  onConfirm?: () => void;
  contentType?: 'roleHelp';
}

interface SubmissionDisplayRow {
  label: string;
  value: string;
}

interface SubmissionGroupTab {
  key: SubmissionGroupKey;
  label: string;
}

interface SubmissionExportCategory {
  key: Exclude<SubmissionGroupKey, 'all'>;
  label: string;
  sheetName: string;
}

interface SubmissionExportSheet {
  sheet: string;
  data: SubmissionExportCell[][];
}

type SubmissionExportCell = string | number | boolean | Date | null;

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
  adminSection: AdminSection = 'submissions';
  submissions: AdminSubmission[] = [];
  selectedSubmission?: AdminSubmission;
  selectedSubmissionDetailRows: SubmissionDisplayRow[] = [];
  selectedSubmissionAddOnRows: SubmissionDisplayRow[] = [];
  submissionSearch = '';
  selectedSubmissionGroup: SubmissionGroupKey = 'all';
  submissionActionLoading: 'save' | 'delete' | null = null;
  eventsLoading = false;
  submissionsLoading = false;
  submissionsRefreshing = false;
  submissionPageSize = 50;
  submissionPageNumber = 1;
  submissionTotalCount = 0;
  submissionTotalPages = 1;
  private submissionPageCursors: (string | undefined)[] = [undefined];
  private nextSubmissionCursor?: string | null;
  submissionDetailLoading = false;
  submissionExportLoading = false;
  private submissionDetailCache: Record<string, AdminSubmission> = {};
  private submissionDetailPrefetching = new Set<string>();
  submissionGroupTabs: SubmissionGroupTab[] = [
    { key: 'all', label: 'All' },
    { key: 'vendor', label: 'Vendors' },
    { key: 'sponsor', label: 'Freedom Club' },
    { key: 'motorShow', label: 'Motor Show' },
    { key: 'parade', label: 'Parade' },
    { key: 'volunteer', label: 'Volunteers' },
    { key: 'specialEvents', label: 'Special Events' },
  ];
  submissionStatuses = ['New', 'In Review', 'Follow Up', 'Complete', 'Archived'];
  submissionExportFromDate = '';
  submissionExportToDate = '';
  submissionExportGroup: SubmissionGroupKey = 'all';
  submissionExportCategories: SubmissionExportCategory[] = [
    { key: 'vendor', label: 'Vendors', sheetName: 'Vendors' },
    { key: 'artist', label: 'Artists', sheetName: 'Artists' },
    { key: 'sponsor', label: 'Freedom Club', sheetName: 'Freedom Club' },
    { key: 'motorShow', label: 'Motor Show', sheetName: 'Motor Show' },
    { key: 'parade', label: 'Parade', sheetName: 'Parade' },
    { key: 'volunteer', label: 'Volunteers', sheetName: 'Volunteers' },
    { key: 'specialEvents', label: 'Special Events', sheetName: 'Special Events' },
  ];
  testMode = false;
  testModeLocalOnly = false;
  testModeLoading = false;
  adminUsers: AdminUser[] = [];
  usersLoading = false;
  userActionLoading = false;
  userUpdateLoadingEmail: string | null = null;
  newUserEmail = '';
  newUserEmailError = '';
  newUserRole: AdminRole = 'viewer';

  activePricingHelp: string | null = null;
  pricingHelp = {
    mode: 'How this event is billed. “Fixed Price” charges one flat amount per registration. “Per Participant” multiplies your price by the number of people registered — useful for teams or groups. “Free” hides payment and shows a Sign Up button instead.',
    field: 'Per-participant pricing counts the people added to one of your “Group” form fields (for example a “Team Members” group). Choose that group here. If this list is empty, you have not created a Group field yet — add one with the button below, or add a field of type “Group” in the Form Fields section above and then choose it here.',
    price: 'The amount charged for each counted participant. The order total is this price times the number of participants — the group members, plus the primary registrant when that toggle is on — before any add-ons.',
    primary: 'When on, the person filling out the form counts as a paying participant too. Leave it off when the primary registrant organizes the group but is not attending themselves.'
  };

  constructor(private cmsService: CmsService, private router: Router, private sanitizer: DomSanitizer) {}

  ngOnInit() {
    this.setDefaultSubmissionExportDates();
    this.loadEvents();
    this.loadSubmissions();
    this.loadTestMode();
    this.syncCurrentUserRole();
  }

  loadEvents() {
    this.eventsLoading = true;
    this.cmsService.getEvents()
      .pipe(finalize(() => this.eventsLoading = false))
      .subscribe({
        next: res => {
          this.events = (res.events || []).map(event => this.normalizeEventForEditor(event));
          this.activeEventIndex = this.events.length ? 0 : 0;
        },
        error: err => {
          console.error('Events load failed', err);
          this.showModal('Events unavailable', 'Could not load events.', 'danger');
        }
      });
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
    if (this.adminSection === 'users') return 'Admin Users';
    return this.adminSection === 'submissions' ? 'Submissions' : 'Upcoming Events';
  }

  get currentRole(): AdminRole {
    return (sessionStorage.getItem('adminRole') as AdminRole) || 'admin';
  }

  get currentEmail(): string {
    return (sessionStorage.getItem('adminEmail') || '').trim().toLowerCase();
  }

  get currentRoleLabel(): string {
    return this.formatRole(this.currentRole);
  }

  formatRole(role: AdminRole | string): string {
    const labels: Record<string, string> = {
      developer: 'Developer',
      superAdmin: 'Super Admin',
      admin: 'Admin',
      viewer: 'Viewer',
    };
    return labels[role] || 'Unknown Role';
  }

  formatAccountStatus(status?: string): string {
    const labels: Record<string, string> = {
      CONFIRMED: 'Active',
      RESET_REQUIRED: 'Password setup needed',
      FORCE_CHANGE_PASSWORD: 'Password change required',
      UNCONFIRMED: 'Not confirmed',
    };
    return labels[String(status || '').trim()] || 'Unknown';
  }

  get isDeveloper(): boolean {
    return this.currentRole === 'developer';
  }

  get canEditBackend(): boolean {
    return this.canAccessEvents;
  }

  get canAccessEvents(): boolean {
    return ['developer', 'superAdmin'].includes(this.currentRole);
  }

  get canDeleteSubmissionItems(): boolean {
    return ['developer', 'superAdmin'].includes(this.currentRole);
  }

  get canManageUsers(): boolean {
    return ['developer', 'superAdmin', 'admin'].includes(this.currentRole);
  }

  get availableAdminSections(): AdminSection[] {
    const sections: AdminSection[] = [];
    sections.push('submissions');
    if (this.canAccessEvents) sections.push('events');
    if (this.canManageUsers) sections.push('users');
    return sections;
  }

  get showAdminSectionSwitcher(): boolean {
    return this.availableAdminSections.length > 1;
  }

  get creatableRoles(): AdminRole[] {
    if (this.currentRole === 'developer') return ['developer', 'superAdmin', 'admin', 'viewer'];
    if (this.currentRole === 'superAdmin') return ['superAdmin', 'admin', 'viewer'];
    if (this.currentRole === 'admin') return ['viewer'];
    return [];
  }

  canRemoveAdminUser(user: AdminUser): boolean {
    return this.canManageAdminUser(user);
  }

  canManageAdminUser(user: AdminUser): boolean {
    const targetEmail = (user.email || user.username || '').trim().toLowerCase();
    if (!this.canManageUsers || !targetEmail || targetEmail === this.currentEmail) return false;

    if (this.currentRole === 'developer') return true;
    if (this.currentRole === 'superAdmin') return ['superAdmin', 'admin', 'viewer'].includes(user.role);
    if (this.currentRole === 'admin') return user.role === 'viewer';
    return false;
  }

  getRoleOptionsForUser(user: AdminUser): AdminRole[] {
    if (!this.canManageAdminUser(user)) return [];
    return this.creatableRoles;
  }

  canChangeAdminUserRole(user: AdminUser): boolean {
    const options = this.getRoleOptionsForUser(user);
    return options.length > 1 && options.includes(user.role);
  }

  canToggleAdminUserEnabled(user: AdminUser): boolean {
    return this.canManageAdminUser(user);
  }

  showRoleHelp() {
    this.showModal(
      'User Roles & Permissions',
      '',
      'warning',
      'Close',
      undefined,
      undefined,
      'roleHelp'
    );
  }

  get testModeLabel(): string {
    return this.testMode ? 'Test Mode' : 'Live Mode';
  }

  loadTestMode() {
    if (!this.isDeveloper) return;
    this.cmsService.getTestMode().subscribe({
      next: res => {
        this.testMode = res.testMode;
        this.testModeLocalOnly = Boolean(res.localOnly || !environment.production);
      },
      error: err => {
        if (this.handleAuthFailure(err)) return;
        console.error('Test mode status failed', err);
        this.showModal('Test mode unavailable', 'Could not load developer test mode status.', 'danger');
      }
    });
  }

  toggleTestMode(enabled: boolean) {
    if (!this.isDeveloper) return;
    this.testModeLoading = true;
    this.cmsService.updateTestMode(enabled).subscribe({
      next: res => {
        this.testMode = res.testMode;
        this.testModeLocalOnly = Boolean(res.localOnly || !environment.production);
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
        if (this.handleAuthFailure(err)) return;
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

  selectAdminSection(section: AdminSection) {
    if (section === 'events' && !this.canAccessEvents) return;
    if (section === 'users' && !this.canManageUsers) return;
    this.adminSection = section;
    if (section === 'submissions' && !this.submissions.length) {
      this.loadSubmissions('initial');
    }
    if (section === 'users') {
      this.loadAdminUsers();
    }
  }

  loadAdminUsers() {
    if (!this.canManageUsers) return;
    this.usersLoading = true;
    this.cmsService.getAdminUsers().pipe(finalize(() => this.usersLoading = false)).subscribe({
      next: res => {
        const users = res.items || [];
        this.applyCurrentUserRole(users);
        this.adminUsers = this.sortAdminUsers(this.filterVisibleAdminUsers(users));
      },
      error: err => {
        if (this.handleAuthFailure(err)) return;
        console.error('Admin users load failed', err);
        this.showModal('Users unavailable', 'Could not load admin users.', 'danger');
      }
    });
  }

  syncCurrentUserRole() {
    if (!this.canManageUsers || !this.currentEmail) return;
    this.cmsService.getAdminUsers().subscribe({
      next: res => this.applyCurrentUserRole(res.items || []),
      error: err => {
        if (this.handleAuthFailure(err)) return;
        console.error('Current user role sync failed', err);
      }
    });
  }

  private applyCurrentUserRole(users: AdminUser[]) {
    const currentUser = users.find(user => (user.email || user.username || '').trim().toLowerCase() === this.currentEmail);
    if (!currentUser?.role || currentUser.role === this.currentRole) return;
    sessionStorage.setItem('adminRole', currentUser.role);
  }

  private filterVisibleAdminUsers(users: AdminUser[]): AdminUser[] {
    if (this.currentRole === 'developer') return users;
    return users.filter(user => user.role !== 'developer');
  }

  private sortAdminUsers(users: AdminUser[]): AdminUser[] {
    return [...users].sort((firstUser, secondUser) => {
      const firstRoleOrder = ADMIN_ROLE_SORT_ORDER[firstUser.role || ''] ?? Number.MAX_SAFE_INTEGER;
      const secondRoleOrder = ADMIN_ROLE_SORT_ORDER[secondUser.role || ''] ?? Number.MAX_SAFE_INTEGER;
      if (firstRoleOrder !== secondRoleOrder) {
        return firstRoleOrder - secondRoleOrder;
      }

      const firstEmail = (firstUser.email || firstUser.username || '').trim().toLowerCase();
      const secondEmail = (secondUser.email || secondUser.username || '').trim().toLowerCase();
      return firstEmail.localeCompare(secondEmail);
    });
  }

  createAdminUser() {
    const email = this.newUserEmail.trim();
    if (!this.canManageUsers || !this.creatableRoles.includes(this.newUserRole)) return;
    if (!this.isValidEmail(email)) {
      this.newUserEmailError = 'Enter a valid email address.';
      return;
    }
    if (this.adminUserEmailExists(email)) {
      this.newUserEmailError = 'An account using that email already exists.';
      return;
    }
    this.newUserEmailError = '';
    this.userActionLoading = true;
    this.cmsService.createAdminUser(email, this.newUserRole)
      .pipe(finalize(() => this.userActionLoading = false))
      .subscribe({
        next: () => {
          this.newUserEmail = '';
          this.newUserEmailError = '';
          this.newUserRole = this.creatableRoles[0] || 'viewer';
          this.loadAdminUsers();
          this.showModal('User invited', 'The user has been created and a password reset email has been sent.', 'success');
        },
        error: err => {
          if (this.handleAuthFailure(err)) return;
          console.error('Admin user create failed', err);
          if (this.isExistingUserError(err)) {
            this.newUserEmailError = 'An account using that email already exists.';
            return;
          }
          this.showModal('User create failed', err?.error?.error || 'Could not create the admin user.', 'danger');
        }
      });
  }

  onNewUserEmailChange() {
    if (!this.newUserEmailError) return;
    const email = this.newUserEmail.trim();
    if (!this.isValidEmail(email)) {
      this.newUserEmailError = 'Enter a valid email address.';
      return;
    }
    this.newUserEmailError = this.adminUserEmailExists(email) ? 'An account using that email already exists.' : '';
  }

  private isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  private adminUserEmailExists(email: string): boolean {
    const normalizedEmail = email.trim().toLowerCase();
    return this.adminUsers.some(user => (user.email || user.username || '').trim().toLowerCase() === normalizedEmail);
  }

  private isExistingUserError(error: any): boolean {
    return String(error?.error?.error || error?.message || '').toLowerCase().includes('already exists');
  }

  deleteAdminUser(user: AdminUser) {
    if (!this.canRemoveAdminUser(user) || !user.email) return;
    const email = user.email;
    this.showModal(
      'Remove user',
      `Are you sure you want to remove ${email}? This will remove their admin access.`,
      'danger',
      'Remove User',
      'Cancel',
      () => this.confirmDeleteAdminUser(email)
    );
  }

  private confirmDeleteAdminUser(email: string) {
    this.userActionLoading = true;
    this.cmsService.deleteAdminUser(email)
      .pipe(finalize(() => this.userActionLoading = false))
      .subscribe({
        next: () => {
          this.adminUsers = this.adminUsers.filter(item => item.email !== email);
        },
        error: err => {
          if (this.handleAuthFailure(err)) return;
          console.error('Admin user delete failed', err);
          this.showModal('User delete failed', 'Could not remove the admin user.', 'danger');
        }
      });
  }

  updateAdminUserRole(user: AdminUser, role: AdminRole | string) {
    const nextRole = role as AdminRole;
    if (!user.email || !this.canChangeAdminUserRole(user) || !this.getRoleOptionsForUser(user).includes(nextRole) || user.role === nextRole) {
      return;
    }

    this.userUpdateLoadingEmail = user.email;
    this.cmsService.updateAdminUser(user.email, { role: nextRole })
      .pipe(finalize(() => this.userUpdateLoadingEmail = null))
      .subscribe({
        next: updatedUser => {
          this.applyAdminUserUpdate(user.email, updatedUser);
          this.showModal(
            'User role changed',
            `${user.email} is now ${this.formatRole(updatedUser.role || nextRole)}.`,
            'success'
          );
        },
        error: err => {
          if (this.handleAuthFailure(err)) return;
          console.error('Admin user role update failed', err);
          this.showModal('User update failed', 'Could not update the admin user role.', 'danger');
        }
      });
  }

  updateAdminUserEnabled(user: AdminUser, enabled: boolean) {
    if (!user.email || !this.canToggleAdminUserEnabled(user) || user.enabled === enabled) {
      return;
    }

    this.userUpdateLoadingEmail = user.email;
    this.cmsService.updateAdminUser(user.email, { enabled })
      .pipe(finalize(() => this.userUpdateLoadingEmail = null))
      .subscribe({
        next: updatedUser => this.applyAdminUserUpdate(user.email, updatedUser),
        error: err => {
          if (this.handleAuthFailure(err)) return;
          console.error('Admin user enabled update failed', err);
          this.showModal('User update failed', 'Could not update the admin user account access.', 'danger');
        }
      });
  }

  private applyAdminUserUpdate(email: string, update: Partial<AdminUser>) {
    this.adminUsers = this.sortAdminUsers(this.adminUsers.map(user => {
      if (user.email !== email) return user;
      return { ...user, ...update };
    }));
  }

  refreshSubmissions() {
    this.submissionPageCursors = [undefined];
    this.loadSubmissions('refresh', undefined, 1);
  }

  get hasNextSubmissionPage(): boolean {
    return Boolean(this.nextSubmissionCursor);
  }

  get hasPreviousSubmissionPage(): boolean {
    return this.submissionPageNumber > 1;
  }

  loadNextSubmissionPage() {
    if (!this.nextSubmissionCursor || this.submissionsLoading || this.submissionsRefreshing) return;
    this.submissionPageCursors[this.submissionPageNumber] = this.nextSubmissionCursor;
    this.loadSubmissions('page', this.nextSubmissionCursor, this.submissionPageNumber + 1);
  }

  loadPreviousSubmissionPage() {
    if (!this.hasPreviousSubmissionPage || this.submissionsLoading || this.submissionsRefreshing) return;
    const previousPageNumber = this.submissionPageNumber - 1;
    this.loadSubmissions('page', this.submissionPageCursors[previousPageNumber - 1], previousPageNumber);
  }

  loadSubmissions(mode: 'initial' | 'refresh' | 'page' | 'filter' = 'initial', cursor?: string, pageNumber = 1) {
    const isRefresh = mode === 'refresh';
    if (isRefresh) {
      this.submissionsRefreshing = true;
    } else {
      this.submissionsLoading = true;
    }
    const options: { limit: number; cursor?: string; group?: SubmissionGroupKey } = {
      limit: this.submissionPageSize,
    };
    if (cursor) options.cursor = cursor;
    if (this.selectedSubmissionGroup !== 'all') options.group = this.selectedSubmissionGroup;
    this.cmsService.getSubmissions(options).pipe(finalize(() => {
      if (isRefresh) {
        this.submissionsRefreshing = false;
      } else {
        this.submissionsLoading = false;
      }
    })).subscribe({
      next: res => {
        this.submissions = res.items || [];
        this.nextSubmissionCursor = res.nextCursor || null;
        this.submissionPageNumber = pageNumber;
        this.submissionTotalCount = Number(res.totalCount || 0);
        this.submissionTotalPages = Math.max(1, Number(res.totalPages || 1));
        this.clearSelectedSubmission();
        this.prefetchVisibleSubmissionDetails();
      },
      error: err => {
        if (this.handleAuthFailure(err)) return;
        console.error('Submissions load failed', err);
        this.showModal('Submissions unavailable', 'Could not load submissions.', 'danger');
      }
    });
  }

  private setDefaultSubmissionExportDates() {
    const today = new Date();
    this.submissionExportFromDate = `${today.getFullYear() - 1}-07-05`;
    this.submissionExportToDate = this.formatDateInputValue(today);
  }

  private formatDateInputValue(date: Date): string {
    const pad = (part: number) => String(part).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  exportSubmissionsToExcel() {
    const fromDate = this.parseExportDate(this.submissionExportFromDate, false);
    const toDate = this.parseExportDate(this.submissionExportToDate, true);
    if (!fromDate || !toDate || fromDate.getTime() > toDate.getTime()) {
      this.showModal('Invalid export dates', 'Choose a valid export date range.', 'warning');
      return;
    }

    const categories = this.submissionExportGroup === 'all'
      ? this.submissionExportCategories
      : this.submissionExportCategories.filter(category => category.key === this.submissionExportGroup);

    const currentRowsAreComplete = !this.nextSubmissionCursor && this.submissions.every(row => this.submissionHasFullExportData(row));
    const exportRows$ = currentRowsAreComplete
      ? of(this.submissions)
      : this.fetchAllSubmissionExportRows();

    this.submissionExportLoading = true;
    exportRows$.pipe(finalize(() => this.submissionExportLoading = false)).subscribe({
      next: submissions => {
        const sheets = categories.map(category => {
          const rows = submissions
            .filter(submission => this.submissionMatchesGroup(submission, category.key))
            .filter(submission => this.submissionIsWithinExportDateRange(submission, fromDate, toDate));
          return this.buildSubmissionExportSheet(category.sheetName, rows, category.key);
        });

        this.writeSubmissionWorkbook(sheets, this.buildSubmissionExportFilename());
      },
      error: err => {
        if (this.handleAuthFailure(err)) return;
        console.error('Submission export failed', err);
        this.showModal('Export unavailable', 'Could not load submissions for the export.', 'danger');
      }
    });
  }

  private fetchAllSubmissionExportRows(cursor?: string, collected: AdminSubmission[] = []): Observable<AdminSubmission[]> {
    return this.cmsService.getSubmissions({ limit: 100, cursor, summaryOnly: false }).pipe(
      switchMap(res => {
        const rows = [...collected, ...(res.items || [])];
        return res.nextCursor
          ? this.fetchAllSubmissionExportRows(res.nextCursor, rows)
          : of(rows);
      })
    );
  }

  private submissionHasFullExportData(submission: AdminSubmission): boolean {
    const rawData = submission.rawData;
    if (!rawData || typeof rawData !== 'object' || Array.isArray(rawData)) return true;
    return Object.keys(rawData).some(key => !SUBMISSION_SUMMARY_RAW_KEYS.has(key));
  }

  private prefetchVisibleSubmissionDetails() {
    this.submissions
      .filter(submission => submission.submissionId)
      .filter(submission => !this.submissionDetailCache[submission.submissionId])
      .filter(submission => !this.submissionDetailPrefetching.has(submission.submissionId))
      .filter(submission => !this.submissionHasFullExportData(submission))
      .forEach(submission => {
        this.submissionDetailPrefetching.add(submission.submissionId);
        this.cmsService.getSubmissionDetail(submission.submissionId)
          .pipe(finalize(() => this.submissionDetailPrefetching.delete(submission.submissionId)))
          .subscribe({
            next: detail => {
              this.submissionDetailCache[submission.submissionId] = detail;
              this.submissions = this.submissions.map(row =>
                row.submissionId === detail.submissionId ? { ...row, ...detail } : row
              );
              if (this.selectedSubmission?.submissionId === detail.submissionId) {
                this.applySelectedSubmission(detail);
              }
            },
            error: err => {
              if (this.handleAuthFailure(err)) return;
              console.warn('Submission detail prefetch failed', submission.submissionId, err);
            },
            complete: () => {
              if (this.selectedSubmission?.submissionId === submission.submissionId) {
                this.submissionDetailLoading = false;
              }
            },
          });
      });
  }

  private writeSubmissionWorkbook(sheets: SubmissionExportSheet[], filename: string) {
    writeExcelFile(sheets).toFile(filename);
  }

  private parseExportDate(value: string, endOfDay: boolean): Date | undefined {
    if (!value) return undefined;
    const [year, month, day] = value.split('-').map(part => Number(part));
    if (!year || !month || !day) return undefined;
    const date = new Date(year, month - 1, day, endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0);
    return Number.isNaN(date.getTime()) ? undefined : date;
  }

  private submissionIsWithinExportDateRange(submission: AdminSubmission, fromDate: Date, toDate: Date): boolean {
    if (!submission.submittedAt) return false;
    const submittedAt = new Date(submission.submittedAt);
    if (Number.isNaN(submittedAt.getTime())) return false;
    return submittedAt.getTime() >= fromDate.getTime() && submittedAt.getTime() <= toDate.getTime();
  }

  private buildSubmissionExportRows(submissions: AdminSubmission[], group: SubmissionGroupKey): Record<string, string | number | boolean>[] {
    const rawKeys = this.getSubmissionExportRawKeys(submissions, group);
    return submissions.map(submission => {
      const row: Record<string, string | number | boolean> = {
        Name: submission.name || '',
        Email: submission.email || '',
        Phone: submission.phone || '',
      };
      if (this.hasDisplayValue(submission.amount)) {
        row['Amount'] = this.formatSubmissionExportFieldValue(submission.amount, 'amount');
      }
      rawKeys.forEach(key => {
        row[this.formatSubmissionFieldLabel(key)] = this.hasDisplayValue(submission.rawData?.[key])
          ? this.formatSubmissionExportFieldValue(submission.rawData[key], key)
          : '';
      });
      if (this.isMotorShowSubmission(submission)) {
        row['Submitted Date'] = this.formatSubmissionExportDate(submission.submittedAt);
        this.addMotorShowExportDefaults(row, submission.rawData);
        this.addMotorShowBodyExportFields(row, submission.rawData?.body);
      }
      return row;
    });
  }

  private addMotorShowExportDefaults(row: Record<string, string | number | boolean>, rawData: any) {
    const total = this.hasDisplayValue(rawData?.grandTotal) ? rawData.grandTotal : rawData?.total;
    if (!this.hasDisplayValue(row['Total']) && this.hasDisplayValue(total)) {
      row['Total'] = this.formatSubmissionExportFieldValue(total, 'total');
    }
    if (!this.hasDisplayValue(row['Plaque & T-shirt']) && this.hasDisplayValue(rawData?.comboSize)) {
      row['Plaque & T-shirt'] = String(rawData.comboSize);
    }

    [
      ['additionalLarge', 'Additional Large'],
      ['additionalMedium', 'Additional Medium'],
      ['additionalPlaques', 'Additional Plaques'],
      ['additionalSmall', 'Additional Small'],
      ['additionalXLarge', 'Additional XLarge'],
      ['additionalXXLarge', 'Additional XXLarge'],
      ['additionalXXXLarge', 'Additional XXXLarge'],
    ].forEach(([field, header]) => {
      if (this.hasDisplayValue(row[header])) return;
      row[header] = this.hasDisplayValue(rawData?.[field])
        ? this.formatSubmissionExportFieldValue(rawData[field], field)
        : 0;
    });
  }

  private formatSubmissionExportDate(value?: string): string {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toISOString().slice(0, 10);
  }

  private addMotorShowBodyExportFields(row: Record<string, string | number | boolean>, body: any) {
    this.parseSubmissionBodyRows(body).forEach(detail => {
      const value = detail.label.toLowerCase() === 'total'
        ? this.formatSubmissionExportFieldValue(detail.value, 'total')
        : detail.value;
      row[detail.label] = value;
    });

    const parsedFields = this.parseMotorShowBodyExportFields(body);
    Object.entries(parsedFields).forEach(([key, value]) => {
      if (!this.hasDisplayValue(row[key]) && this.hasDisplayValue(value)) {
        row[key] = value;
      }
    });
  }

  private parseMotorShowBodyExportFields(body: any): Record<string, string | number> {
    const rows = this.parseSubmissionBodyRows(body);
    const byLabel = new Map(rows.map(row => [row.label.toLowerCase(), row.value]));
    const fields: Record<string, string | number> = {};

    const address = byLabel.get('address');
    if (address) {
      fields['Address'] = address;
      const addressMatch = address.match(/^(.+),\s*([^,]+),\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$/);
      if (addressMatch) {
        fields['Street Address'] = addressMatch[1].trim();
        fields['City'] = addressMatch[2].trim();
        fields['State'] = addressMatch[3].trim();
        const zipValue = this.formatSubmissionExportFieldValue(addressMatch[4].trim(), 'zipcode');
        fields['Zip Code'] = typeof zipValue === 'number' ? zipValue : String(zipValue);
      }
    }

    const vehicle = byLabel.get('vehicle');
    if (vehicle) {
      fields['Vehicle'] = vehicle;
      const colorMatch = vehicle.match(/\(([^)]+)\)\s*$/);
      const vehicleWithoutColor = vehicle.replace(/\s*\([^)]+\)\s*$/, '').trim();
      const vehicleParts = vehicleWithoutColor.split(/\s+/).filter(Boolean);
      if (vehicleParts.length >= 2) {
        const yearValue = this.formatSubmissionExportFieldValue(vehicleParts[0], 'year');
        fields['Vehicle Year'] = typeof yearValue === 'number' ? yearValue : String(yearValue);
        fields['Make'] = vehicleParts[1];
        if (vehicleParts.length > 2) {
          fields['Model'] = vehicleParts.slice(2).join(' ');
        }
      }
      if (colorMatch) {
        fields['Color'] = colorMatch[1].trim();
      }
    }

    const clubAffiliation = byLabel.get('club affiliation');
    if (clubAffiliation) {
      fields['Club Affiliation'] = clubAffiliation;
    }

    const bundle = byLabel.get('t-shirt & plaque bundle');
    if (bundle) {
      fields['T-Shirt & Plaque Bundle'] = bundle;
      fields['Plaque & T-shirt'] = bundle;
    }

    const total = byLabel.get('total') || byLabel.get('total due');
    if (total) {
      const totalValue = this.formatSubmissionExportFieldValue(total, 'total');
      fields['Total'] = typeof totalValue === 'number' ? totalValue : String(totalValue);
      fields['Grand Total'] = fields['Total'];
    }

    return fields;
  }

  private buildSubmissionExportSheet(sheetName: string, submissions: AdminSubmission[], group: SubmissionGroupKey): SubmissionExportSheet {
    const rows = this.buildSubmissionExportRows(submissions, group);
    const headers = this.getSubmissionExportHeaders(rows, group);
    return {
      sheet: sheetName,
      data: [
        headers,
        ...rows.map(row => headers.map(header => this.hasDisplayValue(row[header]) ? row[header] : null)),
      ],
    };
  }

  private getSubmissionExportHeaders(rows: Record<string, string | number | boolean>[], group?: SubmissionGroupKey): string[] {
    if (!rows.length) {
      const headers = [
        'Name',
        'Email',
        'Phone',
      ];
      return headers;
    }
    const headers = new Set<string>();
    rows.forEach(row => Object.keys(row).forEach(header => headers.add(header)));
    const headerList = Array.from(headers)
      .filter(header => rows.some(row => this.hasDisplayValue(row[header])));
    if (group === 'motorShow') return this.orderMotorShowExportHeaders(headerList);
    if (group === 'parade') return this.orderParadeExportHeaders(headerList);
    return headerList;
  }

  private orderMotorShowExportHeaders(headers: string[]): string[] {
    const excludedHeaders = new Set([
      'Submission',
      'Amount',
      'Address',
      'Combo Size',
      'Grand Total',
      'Vehicle',
      'T-Shirt & Plaque Bundle',
      'Signature Name',
    ]);
    const preferredOrder = [
      'Name',
      'Email',
      'Phone',
      'Submitted Date',
      'Total',
      'Vehicle Year',
      'Make',
      'Model',
      'Color',
      'Street Address',
      'City',
      'State',
      'Zip Code',
      'Club Affiliation',
      'Plaque & T-shirt',
      'Additional Large',
      'Additional Medium',
      'Additional Plaques',
      'Additional Small',
      'Additional XLarge',
      'Additional XXLarge',
      'Additional XXXLarge',
    ];
    const headerSet = new Set(headers.filter(header => !excludedHeaders.has(header)));
    const orderedHeaders = preferredOrder.filter(header => headerSet.delete(header));
    return [
      ...orderedHeaders,
      ...Array.from(headerSet),
    ];
  }

  private orderParadeExportHeaders(headers: string[]): string[] {
    const excludedHeaders = new Set([
      'Submission',
      'Signature Name',
    ]);
    const preferredOrder = [
      'Name',
      'Contact Name',
      'Email',
      'Phone',
      'Entry Name',
      'VIP Name',
      'Available Seats',
      'Vehicle Year',
      'Make',
      'Model',
      'Color',
      'Street Address',
      'Address',
      'City',
      'State',
      'Zip Code',
    ];
    const headerSet = new Set(headers.filter(header => !excludedHeaders.has(header)));
    const orderedHeaders = preferredOrder.filter(header => headerSet.delete(header));
    return [
      ...orderedHeaders,
      ...Array.from(headerSet),
    ];
  }

  private getSubmissionExportRawKeys(submissions: AdminSubmission[], group: SubmissionGroupKey): string[] {
    const excludedFields = new Set([
      'action',
      'adminStatus',
      'assignedTo',
      'attachments',
      'body',
      'currency',
      'email',
      'fileDropRef',
      'firstName',
      'fullName',
      'headers',
      'lastName',
      'name',
      'notes',
      'paymentMethod',
      'paymentProvider',
      'paymentReceived',
      'paymentStatus',
      'paymentHoldCreatedAt',
      'paymentHoldId',
      'payment_hold_created_at',
      'payment_hold_id',
      'phone',
      'replyTo',
      'rowNumber',
      'signatureName',
      'stripe_session_id',
      'submission',
      'submission_id',
      'submissionId',
      'submissions',
      'subject',
      'toContact',
      'type',
      'updatedBy',
      'values',
      'worksheet',
    ].map(field => field.toLowerCase()));
    if (group === 'vendor') excludedFields.add('agreecheckbox');
    if (group === 'volunteer' || group === 'specialEvents') excludedFields.add('formtype');
    const keys = new Set<string>();
    submissions.forEach(submission => {
      const rawData = submission.rawData;
      if (!rawData || typeof rawData !== 'object' || Array.isArray(rawData)) return;
      Object.keys(rawData).forEach(key => {
        if (!excludedFields.has(key.toLowerCase()) && this.hasDisplayValue(rawData[key])) {
          keys.add(key);
        }
      });
    });
    return Array.from(keys).sort((first, second) =>
      this.formatSubmissionFieldLabel(first).localeCompare(this.formatSubmissionFieldLabel(second))
    );
  }

  private buildSubmissionExportFilename(): string {
    const group = this.submissionExportGroup === 'all' ? 'all-categories' : this.submissionExportGroup;
    return `spirit-of-the-fourth-submissions-${group}-${this.submissionExportFromDate}-to-${this.submissionExportToDate}.xlsx`;
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

  get showSubmissionColumn(): boolean {
    return !['vendor', 'sponsor', 'motorShow', 'volunteer'].includes(this.selectedSubmissionGroup);
  }

  get submissionColumnLabel(): string {
    return this.selectedSubmissionGroup === 'parade' ? 'Entry Type' : 'Submission';
  }

  get showPaymentMethodColumn(): boolean {
    return this.selectedSubmissionGroup === 'motorShow';
  }

  get showDonationAmountColumn(): boolean {
    return this.selectedSubmissionGroup === 'sponsor';
  }

  toggleSubmissionGroup(group: SubmissionGroupKey) {
    this.selectedSubmissionGroup = this.selectedSubmissionGroup === group ? 'all' : group;
    this.submissionExportGroup = this.selectedSubmissionGroup;
    this.submissionPageCursors = [undefined];
    this.clearSelectedSubmission();
    this.loadSubmissions('filter', undefined, 1);
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
      return this.isFreedomClubSubmission(submission);
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

    return this.isSponsorshipSubmission(submission);
  }

  private isSponsorshipSubmission(submission: AdminSubmission): boolean {
    const text = this.getSubmissionGroupText(submission);
    return text.includes('sponsor') || text.includes('sponsorship');
  }

  private isFreedomClubSubmission(submission: AdminSubmission): boolean {
    if (this.isSponsorshipSubmission(submission)) {
      return false;
    }

    if (
      this.submissionMatchesGroup(submission, 'vendor') ||
      this.submissionMatchesGroup(submission, 'artist') ||
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
    const cachedSubmission = this.submissionDetailCache[submission.submissionId];
    this.applySelectedSubmission(cachedSubmission || submission);
    if (cachedSubmission || this.submissionHasFullExportData(submission)) {
      return;
    }
    if (this.submissionDetailPrefetching.has(submission.submissionId)) {
      this.submissionDetailLoading = true;
      return;
    }

    this.submissionDetailLoading = true;
    this.cmsService.getSubmissionDetail(submission.submissionId)
      .pipe(finalize(() => this.submissionDetailLoading = false))
      .subscribe({
        next: detail => {
          this.submissionDetailCache[submission.submissionId] = detail;
          this.submissions = this.submissions.map(row =>
            row.submissionId === detail.submissionId ? { ...row, ...detail } : row
          );
          if (this.selectedSubmission?.submissionId === detail.submissionId) {
            this.applySelectedSubmission(detail);
          }
        },
        error: err => {
          if (this.handleAuthFailure(err)) return;
          console.error('Submission detail load failed', err);
          this.showModal('Submission unavailable', 'Could not load submission details.', 'danger');
        }
      });
  }

  private applySelectedSubmission(submission: AdminSubmission) {
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
      'donationAmount',
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
      contactName: 'Contact Name',
      entryName: 'Entry Name',
      vipName: 'VIP Name',
      availableSeats: 'Available Seats',
      clubAffiliation: 'Club Affiliation',
      donationAmount: 'Donation Amount',
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
    if (this.isCurrencySubmissionField(key) && this.hasDisplayValue(value)) {
      return this.formatCurrencyValue(value);
    }
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (Array.isArray(value)) return value.map(item => this.formatSubmissionFieldValue(item)).join(', ');
    if (value && typeof value === 'object') return JSON.stringify(value);
    if (value === 'motorShowOrder Order' || value === 'Motor Show Event Order') return 'Motor Show Event';
    if (value === 'Freedom Club Donation Order') return 'Freedom Club Donation';
    return String(value);
  }

  private formatSubmissionExportFieldValue(value: any, key = ''): string | number | boolean {
    if (key === 'formType' && typeof value === 'string') {
      return this.formatFormTypeValue(value);
    }
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (Array.isArray(value)) return value.map(item => this.formatSubmissionFieldValue(item)).join(', ');
    if (value && typeof value === 'object') return JSON.stringify(value);
    if (value === 'motorShowOrder Order' || value === 'Motor Show Event Order') return 'Motor Show Event';
    if (value === 'Freedom Club Donation Order') return 'Freedom Club Donation';

    const numericValue = this.getSubmissionExportNumericValue(value, key);
    return numericValue === undefined ? String(value) : numericValue;
  }

  private getSubmissionExportNumericValue(value: any, key: string): number | undefined {
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : undefined;
    }
    if (typeof value !== 'string' || !this.isNumericSubmissionExportField(key)) {
      return undefined;
    }

    const normalizedValue = value.trim().replace(/[$,]/g, '');
    if (!/^-?\d+(\.\d+)?$/.test(normalizedValue)) {
      return undefined;
    }

    const numericValue = Number(normalizedValue);
    return Number.isFinite(numericValue) ? numericValue : undefined;
  }

  private isNumericSubmissionExportField(key: string): boolean {
    const normalizedKey = key.toLowerCase();
    if (this.isRequiredNumericSubmissionExportField(normalizedKey)) {
      return true;
    }
    if (this.isTextSubmissionExportField(normalizedKey)) {
      return false;
    }
    return [
      'amount',
      'balance',
      'cost',
      'count',
      'donation',
      'fee',
      'grandtotal',
      'number',
      'paid',
      'participant',
      'plaque',
      'price',
      'quantity',
      'small',
      'medium',
      'large',
      'total',
      'xlarge',
    ].some(term => normalizedKey.includes(term));
  }

  private isRequiredNumericSubmissionExportField(normalizedKey: string): boolean {
    return normalizedKey === 'zipcode' ||
      normalizedKey === 'zip' ||
      normalizedKey === 'year' ||
      normalizedKey === 'vehicleyear' ||
      normalizedKey === 'vehicle_year' ||
      normalizedKey === 'availableseats' ||
      normalizedKey === 'available_seats' ||
      normalizedKey === 'available seats';
  }

  private isTextSubmissionExportField(normalizedKey: string): boolean {
    return [
      'address',
      'city',
      'club',
      'color',
      'contact',
      'email',
      'entry',
      'first',
      'last',
      'make',
      'message',
      'model',
      'name',
      'phone',
      'state',
      'street',
      'vehicle',
      'year',
      'zip',
    ].some(term => normalizedKey.includes(term));
  }

  private isCurrencySubmissionField(key: string): boolean {
    return ['donationAmount', 'grandTotal', 'total', 'amount'].includes(key);
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

  formatSubmissionTableTitle(submission?: AdminSubmission): string {
    const title = this.formatSubmissionTitle(submission);
    if (this.selectedSubmissionGroup !== 'parade') return title;
    return title.replace(/^Parade Entry Request -\s*/, '');
  }

  formatSubmissionPaymentMethod(submission?: AdminSubmission): string {
    if (!submission) return '';
    const rawData = submission.rawData || {};
    const rawPaymentMethod = typeof rawData.paymentMethod === 'string' ? rawData.paymentMethod : '';
    if (/check/i.test(rawPaymentMethod) || this.isCheckPaymentSubmission(submission)) {
      return 'Check';
    }
    return 'Card';
  }

  formatSubmissionDonationAmount(submission?: AdminSubmission): string {
    if (!submission) return '';
    const rawData = submission.rawData || {};
    const amount = [
      submission.amount,
      rawData.donationAmount,
      rawData.grandTotal,
      rawData.total,
      rawData.amount,
    ].find(value => this.hasDisplayValue(value));
    return this.hasDisplayValue(amount) ? this.formatCurrencyValue(amount) : '';
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
      'total due',
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
        if (this.submissionDetailCache[updated.submissionId]) {
          this.submissionDetailCache[updated.submissionId] = { ...this.submissionDetailCache[updated.submissionId], ...updated };
        }
        this.submissionActionLoading = null;
        this.clearSelectedSubmission();
        this.showModal('Submission saved', 'Admin fields have been updated.', 'success');
      },
      error: err => {
        if (this.handleAuthFailure(err)) return;
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
        delete this.submissionDetailCache[submissionId];
        this.submissionActionLoading = null;
        this.clearSelectedSubmission();
        this.showModal('Submission deleted', 'The submission has been deleted.', 'success');
      },
      error: err => {
        if (this.handleAuthFailure(err)) return;
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
    sessionStorage.removeItem('adminEmail');
    this.router.navigate(['/sign-in']);
  }

  private handleAuthFailure(error: any): boolean {
    if (error?.status !== 401 && error?.status !== 403) return false;
    this.logout();
    return true;
  }

  uploadImage() {
    if (!this.selectedFile) return;
    this.cmsService.uploadImage(this.selectedFile).subscribe({
      next: res => {
        console.log('Uploaded image URL:', res.url);
      },
      error: err => {
        if (this.handleAuthFailure(err)) return;
        console.error(err);
      }
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
      error: (err) => {
        if (this.handleAuthFailure(err)) return;
        console.error(err);
      }
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
          if (this.handleAuthFailure(err)) return;
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
        if (this.handleAuthFailure(err)) return;
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
    onConfirm?: () => void,
    contentType?: AdminModal['contentType']
  ) {
    this.modal = { title, message, variant, confirmText, cancelText, onConfirm, contentType };
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
