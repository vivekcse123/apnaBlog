import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ReadBlog } from './read-blog';

describe('ReadBlog', () => {
  let component: ReadBlog;
  let fixture: ComponentFixture<ReadBlog>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ReadBlog]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ReadBlog);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
