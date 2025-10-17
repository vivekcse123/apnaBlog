import { ComponentFixture, TestBed } from '@angular/core/testing';

import { VerifyUser } from './verify-user';

describe('VerifyUser', () => {
  let component: VerifyUser;
  let fixture: ComponentFixture<VerifyUser>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [VerifyUser]
    })
    .compileComponents();

    fixture = TestBed.createComponent(VerifyUser);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
