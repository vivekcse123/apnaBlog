import {
  Component, ElementRef, ViewChild,
  inject, input, output, signal, computed,
} from '@angular/core';
import {
  AbstractControl, FormArray, FormBuilder,
  FormGroup, ReactiveFormsModule, Validators,
} from '@angular/forms';
import { Post }          from '../../../../core/models/post.model';
import { Auth }          from '../../../../core/services/auth';
import { PostService }   from '../../services/post-service';
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
  activeBlock      = signal<string>('');

  imageUploading   = signal(false);
  imageUploadError = signal('');
  imagePreviewUrl  = signal('');
  uploadMode       = signal<'url' | 'file'>('url');

  // ── Role-based flag ──────────────────────────────────────
  isAdmin = computed(() => {
    const role = this.authService.getCurrentUser()?.role?.toLowerCase();
    return role === 'admin' || role === 'super_admin';
  });

  categoryOptions = [
    'Update', 'News',
    'Sports', 'Technology', 'Lifestyle', 'Education', 'Health', 'Business',
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
    // Status is required only for admins; non-admins always submit as 'draft'
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

  onEditorPaste(event: ClipboardEvent): void {
    event.preventDefault();
    const clipboardData = event.clipboardData;
    if (!clipboardData) return;

    const text = clipboardData.getData('text/plain');
    let html   = clipboardData.getData('text/html');

    if (html) {
      html = this.cleanPastedHTML(html);
    } else {
      html = text.replace(/\n/g, '<br>');
    }

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    range.deleteContents();

    const fragment = range.createContextualFragment(html);
    range.insertNode(fragment);

    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);

    this.onEditorInput();
  }

  private cleanPastedHTML(html: string): string {
    const temp = document.createElement('div');
    temp.innerHTML = html;

    const unwantedSelectors = [
      'script', 'style', 'meta', 'link', 'object', 'embed',
      'iframe', 'applet', 'xml', 'o\\:p', 'w\\:sdt',
    ];
    unwantedSelectors.forEach(selector => {
      temp.querySelectorAll(selector).forEach(el => el.remove());
    });

    this.cleanElement(temp);
    return temp.innerHTML;
  }

  private cleanElement(element: Element): void {
    const allowedAttrs: { [key: string]: string[] } = {
      'a':     ['href', 'title'],
      'img':   ['src', 'alt', 'width', 'height'],
      'table': ['border', 'cellpadding', 'cellspacing'],
      'td':    ['colspan', 'rowspan'],
      'th':    ['colspan', 'rowspan'],
    };

    Array.from(element.childNodes).forEach(node => {
      if (node.nodeType === Node.ELEMENT_NODE) {
        const el      = node as Element;
        const tagName = el.tagName.toLowerCase();

        const attrs = Array.from(el.attributes);
        attrs.forEach(attr => {
          const attrName = attr.name.toLowerCase();
          const allowed  = allowedAttrs[tagName] || [];
          if (!allowed.includes(attrName) ||
              attrName.startsWith('data-') ||
              attrName === 'style' ||
              attrName === 'class' ||
              attrName === 'id') {
            el.removeAttribute(attr.name);
          }
        });

        this.cleanElement(el);

        if (['span', 'font', 'div'].includes(tagName)) {
          if (el.querySelector('p, h1, h2, h3, h4, ul, ol, table')) {
            const wrapper = document.createElement('div');
            while (el.firstChild) wrapper.appendChild(el.firstChild);
            el.replaceWith(...Array.from(wrapper.childNodes));
          } else {
            el.replaceWith(...Array.from(el.childNodes));
          }
        }
      }
    });
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

    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      let node: Node | null = selection.getRangeAt(0).commonAncestorContainer;
      while (node && node !== this.editorRef.nativeElement) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          const tag = (node as Element).tagName.toLowerCase();
          if (['h1', 'h2', 'h3', 'h4', 'p'].includes(tag)) {
            this.activeBlock.set(tag);
            return;
          }
        }
        node = node.parentNode;
      }
    }
    this.activeBlock.set('');
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

    if (!this.isAdmin()) {
      this.createBlogForm.get('status')?.clearValidators();
      this.createBlogForm.get('status')?.updateValueAndValidity();
      this.createBlogForm.patchValue({ status: 'pending' });
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
        this.successMessage.set(
          this.isAdmin()
            ? 'Post published successfully!'
            : 'Post submitted for review!'
        );
        this.isSubmitted.set(false);
        setTimeout(() => {
          this.postCreated.emit(res.data);
          this.successMessage.set('');
          this.imagePreviewUrl.set('');
          this.createBlogForm.reset();
          this.createBlogForm.get('status')?.setValidators(Validators.required);
          this.createBlogForm.get('status')?.updateValueAndValidity();
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