import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CommonHeader } from './common-header';

describe('CommonHeader', () => {
  let component: CommonHeader;
  let fixture: ComponentFixture<CommonHeader>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CommonHeader]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CommonHeader);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
