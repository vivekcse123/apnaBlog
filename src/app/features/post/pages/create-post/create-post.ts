import { CommonModule } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { FormArray, FormBuilder, FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { PostService } from '../../services/post-service';
import { toSignal } from '@angular/core/rxjs-interop';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-create-post',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './create-post.html',
  styleUrl: './create-post.css',
})
export class CreatePost implements OnInit{
  createBlogForm: FormGroup = new FormGroup({});

 userId = signal<string | null>(
  localStorage.getItem('userId')
);

  private postService = inject(PostService);
  public fb = inject(FormBuilder);

  sub!: Subscription;

  categoryOptions: string[] = [
  'Technology',
  'Lifestyle',
  'Education',
  'Health',
  'Business',
  'Entertainment',
  'Social',
  'Village'
];

tagOptions: string[] = [
  'Trending',
  'Motivation',
  'Tips',
  'News',
  'Opinion',
  'Guide',
  'Update'
];

  ngOnInit(): void {

    this.createBlogForm = this.fb.group({
      title: new FormControl(''),
      description: new FormControl(''),
      content: new FormControl(''),
      categories: this.fb.array(
      this.categoryOptions.map(() => this.fb.control(false)),),
      tags: this.fb.array(this.tagOptions.map(() => this.fb.control(false))),
      featuredImage: new FormControl(''),
      user: new FormControl(this.userId()),
      likesCount: new FormControl(0),
      commentsCount: new FormControl(0),
      views: new FormControl(0),
      status: new FormControl('draft')
    });
  }


get categories(): FormArray {
  return this.createBlogForm.get('categories') as FormArray;
}

get tags(): FormArray {
  return this.createBlogForm.get('tags') as FormArray;
}
  errorMessage = signal('');
  successMessage = signal('');
  isSubmitted = signal(false);

  createBlog(){
    this.isSubmitted.set(true);
    if(this.createBlogForm.invalid){
      this.createBlogForm.markAllAsTouched();
      return;
    }
    const selectedCategories = this.categoryOptions.filter(
    (_, i) => this.categories.value[i]
  );

  const selectedTags = this.tagOptions.filter(
    (_, i) => this.tags.value[i]
  );

  const payload = {
    ...this.createBlogForm.value,
    categories: selectedCategories,
    tags: selectedTags
  };

    this.sub = this.postService.createBlog(payload).subscribe({
      next: (response) =>{
        console.log(response);
      },
      error(err){
        console.log(err?.error.message);
      }
    })
  }
}
