import { Component, ElementRef, ViewChild, inject, input, output, signal } from '@angular/core';
import { AbstractControl, FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Post } from '../../../../core/models/post.model';
import { Auth } from '../../../../core/services/auth';
import { PostService } from '../../services/post-service';

@Component({
  selector: 'app-create-blog',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './create-post.html',
  styleUrl: './create-post.css',
})
export class CreatePost {
  private fb = inject(FormBuilder);
  private authService = inject(Auth);
  private postService = inject(PostService);

  @ViewChild('editorRef') editorRef!: ElementRef<HTMLDivElement>;

  close = output<void>();
  postCreated = output<Post>();

  isSubmitted = signal(false);
  errorMessage = signal('');
  successMessage = signal('');
  activeFormats = signal<Set<string>>(new Set());

  categoryOptions = [
   'Technology', 'Lifestyle', 'Education',
    'Health', 'Business', 'Entertainment', 'Social', 'Village', 'Cooking', 'Quotes', 'Excercise'
];

  tagOptions = [
    'Trending', 'Motivation', 'Tips', 'News',
    'Opinion', 'Guide', 'Update',
  ];

  createBlogForm: FormGroup = this.fb.group({
    title: ['', [Validators.required, Validators.minLength(5), Validators.maxLength(100)]],
    description: ['', [Validators.required, Validators.minLength(10)]],
    content: ['', [Validators.required, Validators.minLength(20)]],
    categories: this.fb.array(this.categoryOptions.map(() => this.fb.control(false))),
    tags: this.fb.array(this.tagOptions.map(() => this.fb.control(false))),
    comments: [''],
    featuredImage: [''],
    status: ['', Validators.required],
  });

  get categoriesArray(): FormArray {
    return this.createBlogForm.get('categories') as FormArray;
  }

  get tagsArray(): FormArray {
    return this.createBlogForm.get('tags') as FormArray;
  }

  hasAtLeastOneChecked(arrayName: 'categories' | 'tags'): boolean {
    const arr = this.createBlogForm.get(arrayName) as FormArray;
    return arr.controls.some((c: AbstractControl) => c.value === true);
  }

  onEditorInput(): void {
    const html = this.editorRef.nativeElement.innerHTML;
    const isEmpty = html === '' || html === '<br>';
    this.createBlogForm.get('content')?.setValue(isEmpty ? '' : html);
    this.createBlogForm.get('content')?.markAsTouched();
    this.updateActiveFormats();
  }

  updateActiveFormats(): void {
    const commands = ['bold', 'italic', 'underline', 'strikeThrough',
      'justifyLeft', 'justifyCenter', 'justifyRight', 'justifyFull',
      'insertUnorderedList', 'insertOrderedList'];
    const active = new Set<string>();
    commands.forEach(cmd => {
      try { if (document.queryCommandState(cmd)) active.add(cmd); } catch { /* noop */ }
    });
    this.activeFormats.set(active);
  }

  onEditorKeyUp(): void {
    this.updateActiveFormats();
  }

  onEditorMouseUp(): void {
    this.updateActiveFormats();
  }

  format(command: string, value?: string): void {
    this.editorRef.nativeElement.focus();
    document.execCommand(command, false, value ?? '');
    this.onEditorInput();
  }

  formatBlock(tag: string): void {
    this.editorRef.nativeElement.focus();
    document.execCommand('formatBlock', false, tag);
    this.onEditorInput();
  }

  isActive(command: string): boolean {
    return this.activeFormats().has(command);
  }

  onFileChange(event: Event): void {
    this.createBlogForm.patchValue({ featuredImage: '' });
  }

  createBlog(): void {
    this.isSubmitted.set(true);
    this.errorMessage.set('');
    this.successMessage.set('');

    const userId = this.authService.userId();
    if (!userId) {
      this.errorMessage.set('You must be logged in to create a post.');
      return;
    }

    const categorySelected = this.hasAtLeastOneChecked('categories');
    if (this.createBlogForm.invalid || !categorySelected) {
      if (!categorySelected) {
        this.errorMessage.set('Please select at least one category.');
      }
      return;
    }

    const selectedCategories = this.categoryOptions.filter((_, i) => this.categoriesArray.at(i).value);
    const selectedTags = this.tagOptions.filter(
      (_, i) => this.tagsArray.at(i).value
    );

    const payload: Omit<Post, '_id' | 'user' | 'userId' | 'likesCount' | 'commentsCount' | 'views' | 'createdAt' | 'updatedAt'> & { user: string } = {
      title: this.createBlogForm.value.title,
      description: this.createBlogForm.value.description,
      content: this.createBlogForm.value.content,
      categories: selectedCategories,
      tags: selectedTags,
      featuredImage: this.createBlogForm.value.featuredImage ?? '',
      status: this.createBlogForm.value.status,
      comments: this.createBlogForm.value.comments,
      user: userId,
    };

    this.postService.createBlog(payload).subscribe({
      next: (res) => {
        this.successMessage.set('Post published successfully!');
        this.isSubmitted.set(false);
        setTimeout(() => {
          this.postCreated.emit(res.data);
          this.successMessage.set('');
          this.createBlogForm.reset();
          
          if (this.editorRef?.nativeElement) {
            this.editorRef.nativeElement.innerHTML = '';
          }
          this.closeModal();
        }, 1000);
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message ?? 'Something went wrong. Please try again.');
      },
    });
  }

  closeModal(): void {
    this.close.emit();
  }

  openBlog = input(false);
}