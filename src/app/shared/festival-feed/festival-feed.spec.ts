import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FestivalFeed } from './festival-feed';

describe('FestivalFeed', () => {
  let component: FestivalFeed;
  let fixture: ComponentFixture<FestivalFeed>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FestivalFeed]
    })
    .compileComponents();

    fixture = TestBed.createComponent(FestivalFeed);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
