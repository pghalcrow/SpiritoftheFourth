import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MediaComponent } from './media.component';

describe('MediaComponent', () => {
  let fixture: ComponentFixture<MediaComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [MediaComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(MediaComponent);
    fixture.detectChanges();
  });

  it('links to the 2026 program PDF', () => {
    const nativeElement = fixture.nativeElement as HTMLElement;
    const programLink = nativeElement.querySelector<HTMLAnchorElement>('a[href="/assets/final-sotf-2026-program.pdf"]');

    expect(programLink).toBeTruthy();
    expect(programLink?.textContent).toContain('View the 2026 Program');
    expect(nativeElement.textContent).not.toContain('View the 2025 Program');
  });
});
