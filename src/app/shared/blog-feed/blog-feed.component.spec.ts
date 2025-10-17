import { ComponentFixture, TestBed } from '@angular/core/testing';

import { BlogFeedComponent } from './blog-feed.component';

describe('BlogFeedComponent', () => {
  let component: BlogFeedComponent;
  let fixture: ComponentFixture<BlogFeedComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BlogFeedComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(BlogFeedComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
