import { Component, ElementRef, ViewChild, inject, input, output, signal } from '@angular/core';
import { AbstractControl, FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Post } from '../../../../core/models/post.model';
import { Auth } from '../../../../core/services/auth';
import { PostService } from '../../services/post-service';
import { UploadService } from '../../services/upload-service';

@Component({
  selector: 'app-create-blog',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './create-post.html',
  styleUrl: './create-post.css',
})
export class CreatePost {
  private fb            = inject(FormBuilder);
  private authService   = inject(Auth);
  private postService   = inject(PostService);
  private uploadService = inject(UploadService); 

  @ViewChild('editorRef') editorRef!: ElementRef<HTMLDivElement>;

  close       = output<void>();
  postCreated = output<Post>();

  isSubmitted      = signal(false);
  errorMessage     = signal('');
  successMessage   = signal('');
  activeFormats    = signal<Set<string>>(new Set());
  imageUploading   = signal(false);
  imageUploadError = signal('');
  imagePreviewUrl  = signal('');
  uploadMode       = signal<'url' | 'file'>('url');

  categoryOptions = [
    'Technology', 'Lifestyle', 'Education', 'Health', 'Business',
    'Entertainment', 'Social', 'Village', 'Cooking', 'Quotes', 'Exercise',
  ];

  tagOptions = [
    'Trending', 'Motivation', 'Tips', 'News', 'Opinion', 'Guide', 'Update',
  ];

  createBlogForm: FormGroup = this.fb.group({
    title:         ['', [Validators.required, Validators.minLength(5), Validators.maxLength(100)]],
    description:   ['', [Validators.required, Validators.minLength(10)]],
    content:       ['', [Validators.required, Validators.minLength(20)]],
    categories:    this.fb.array(this.categoryOptions.map(() => this.fb.control(false))),
    tags:          this.fb.array(this.tagOptions.map(() => this.fb.control(false))),
    comments:      [''],
    featuredImage: [''],
    status:        ['', Validators.required],
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
    const html    = this.editorRef.nativeElement.innerHTML;
    const isEmpty = html === '' || html === '<br>';
    this.createBlogForm.get('content')?.setValue(isEmpty ? '' : html);
    this.createBlogForm.get('content')?.markAsTouched();
    this.updateActiveFormats();
  }

  updateActiveFormats(): void {
    const commands = [
      'bold', 'italic', 'underline', 'strikeThrough',
      'justifyLeft', 'justifyCenter', 'justifyRight', 'justifyFull',
      'insertUnorderedList', 'insertOrderedList',
    ];
    const active = new Set<string>();
    commands.forEach(cmd => {
      try { if (document.queryCommandState(cmd)) active.add(cmd); } catch { }
    });
    this.activeFormats.set(active);
  }

  onEditorKeyUp():   void { this.updateActiveFormats(); }
  onEditorMouseUp(): void { this.updateActiveFormats(); }

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


  onUrlInput(value: string): void {
    this.uploadMode.set('url');
    this.imageUploadError.set('');
    this.imagePreviewUrl.set(value.trim());
    this.createBlogForm.patchValue({ featuredImage: value.trim() });
  }

  onFileChange(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;

    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowed.includes(file.type)) {
      this.imageUploadError.set('Only JPG, PNG, WEBP or GIF images are allowed.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      this.imageUploadError.set('Image must be smaller than 5 MB.');
      return;
    }

    this.uploadMode.set('file');
    this.imageUploading.set(true);
    this.imageUploadError.set('');
    this.imagePreviewUrl.set('');
    this.createBlogForm.patchValue({ featuredImage: '' });

    const reader = new FileReader();
    reader.onload = e => this.imagePreviewUrl.set(e.target?.result as string);
    reader.readAsDataURL(file);

    this.uploadService.uploadImage(file).subscribe({
      next: (res) => {
        this.imageUploading.set(false);
        if (res.success) {
          this.imagePreviewUrl.set(res.url);
          this.createBlogForm.patchValue({ featuredImage: res.url });
        } else {
          this.imageUploadError.set(res.message ?? 'Upload failed.');
          this.imagePreviewUrl.set('');
        }
      },
      error: (err) => {
        this.imageUploading.set(false);
        this.imageUploadError.set(err.error?.message ?? 'Upload failed. Please try again.');
        this.imagePreviewUrl.set('');
      },
    });
  }

  removeImage(fileInput: HTMLInputElement): void {
    this.imagePreviewUrl.set('');
    this.imageUploadError.set('');
    this.uploadMode.set('url');
    this.createBlogForm.patchValue({ featuredImage: '' });
    fileInput.value = '';

    const urlInput = document.querySelector('input[data-url-input]') as HTMLInputElement | null;
    if (urlInput) urlInput.value = '';
  }

  createBlog(): void {
    this.isSubmitted.set(true);
    this.errorMessage.set('');
    this.successMessage.set('');

    if (this.imageUploading()) {
      this.errorMessage.set('Please wait — image is still uploading.');
      return;
    }

    const userId = this.authService.userId();
    if (!userId) {
      this.errorMessage.set('You must be logged in to create a post.');
      return;
    }

    const categorySelected = this.hasAtLeastOneChecked('categories');
    if (this.createBlogForm.invalid || !categorySelected) {
      if (!categorySelected) this.errorMessage.set('Please select at least one category.');
      return;
    }

    const selectedCategories = this.categoryOptions.filter((_, i) => this.categoriesArray.at(i).value);
    const selectedTags       = this.tagOptions.filter((_, i) => this.tagsArray.at(i).value);

    const payload: Omit<Post, '_id' | 'user' | 'userId' | 'likesCount' | 'commentsCount' | 'views' | 'createdAt' | 'updatedAt'> & { user: string } = {
      title:         this.createBlogForm.value.title,
      description:   this.createBlogForm.value.description,
      content:       this.createBlogForm.value.content,
      categories:    selectedCategories,
      tags:          selectedTags,
      featuredImage: this.createBlogForm.value.featuredImage ?? '',
      status:        this.createBlogForm.value.status,
      comments:      this.createBlogForm.value.comments,
      user:          userId,
    };

    this.postService.createBlog(payload).subscribe({
      next: (res) => {
        this.successMessage.set('Post published successfully!');
        this.isSubmitted.set(false);
        setTimeout(() => {
          this.postCreated.emit(res.data);
          this.successMessage.set('');
          this.imagePreviewUrl.set('');
          this.createBlogForm.reset();
          if (this.editorRef?.nativeElement) this.editorRef.nativeElement.innerHTML = '';
          this.closeModal();
        }, 1000);
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message ?? 'Something went wrong. Please try again.');
      },
    });
  }

  closeModal(): void { this.close.emit(); }

  openBlog = input(false);
}