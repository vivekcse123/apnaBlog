import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ViewPost } from './view-post';

describe('ViewPost', () => {
  let component: ViewPost;
  let fixture: ComponentFixture<ViewPost>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ViewPost]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ViewPost);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
