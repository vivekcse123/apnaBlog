import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PromoModal } from './promo-modal';

describe('PromoModal', () => {
  let component: PromoModal;
  let fixture: ComponentFixture<PromoModal>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PromoModal]
    })
    .compileComponents();

    fixture = TestBed.createComponent(PromoModal);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
