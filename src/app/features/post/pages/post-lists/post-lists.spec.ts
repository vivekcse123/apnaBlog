import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PostLists } from './post-lists';

describe('PostLists', () => {
  let component: PostLists;
  let fixture: ComponentFixture<PostLists>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PostLists]
    })
    .compileComponents();

    fixture = TestBed.createComponent(PostLists);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
