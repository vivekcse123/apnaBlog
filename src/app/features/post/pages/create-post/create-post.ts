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

  isSubmitted    = signal(false);
  isSubmitting   = signal(false);
  errorMessage   = signal('');
  successMessage = signal('');
  activeFormats  = signal<Set<string>>(new Set());
  activeBlock    = signal<string>('');

  // ── Unified blog images (up to 5 total) ─────────────────────────────────────
  // First entry = featuredImage, rest = images[]
  blogImages     = signal<{ url: string; publicId?: string }[]>([]);
  imageUploading = signal(false);
  imageUrlInput  = signal('');
  imageError     = signal('');

  // ── Role-based flag ──────────────────────────────────────────────────────────
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
    title:       ['', [Validators.required, Validators.minLength(5), Validators.maxLength(100)]],
    description: ['', [Validators.required, Validators.minLength(10)]],
    content:     ['', [Validators.required, Validators.minLength(20)]],
    categories:  this.fb.array(this.categoryOptions.map(() => this.fb.control(false))),
    tags:        this.fb.array(this.tagOptions.map(() => this.fb.control(false))),
    comments:    [''],
    status:      ['', Validators.required],
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

  // ── Rich-text editor ─────────────────────────────────────────────────────────
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

  // ── Unified image upload ─────────────────────────────────────────────────────

  addImageByUrl(): void {
    const url = this.imageUrlInput().trim();
    if (!url) return;
    if (this.blogImages().length >= 5) {
      this.imageError.set('Maximum 5 images allowed.');
      return;
    }
    try { new URL(url); } catch {
      this.imageError.set('Please enter a valid image URL.');
      return;
    }
    this.imageError.set('');
    this.blogImages.update(imgs => [...imgs, { url }]);
    this.imageUrlInput.set('');
  }

  onImageFilesChange(event: Event, fileInput: HTMLInputElement): void {
    const files = Array.from((event.target as HTMLInputElement).files ?? []);
    if (!files.length) return;

    const slotsLeft = 5 - this.blogImages().length;
    if (slotsLeft <= 0) {
      this.imageError.set('Maximum 5 images allowed.');
      fileInput.value = '';
      return;
    }

    const allowed  = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    const valid    = files.filter(f => allowed.includes(f.type) && f.size <= 5 * 1024 * 1024);
    const toUpload = valid.slice(0, slotsLeft);

    if (!toUpload.length) {
      this.imageError.set('No valid files selected (must be JPG/PNG/WEBP/GIF under 5 MB).');
      fileInput.value = '';
      return;
    }

    if (toUpload.length < files.length) {
      this.imageError.set('Some files were skipped (wrong type, too large, or limit reached).');
    } else {
      this.imageError.set('');
    }

    this.imageUploading.set(true);

    this.uploadService.uploadImages(toUpload).subscribe({
      next: (res) => {
        this.imageUploading.set(false);
        if (res.success && res.images?.length) {
          this.blogImages.update(imgs => [...imgs, ...res.images.map(img => ({ url: img.url, publicId: img.publicId }))]);
        } else if (res.success && res.url) {
          this.blogImages.update(imgs => [...imgs, { url: res.url, publicId: res.publicId }]);
        } else {
          this.imageError.set(res.message ?? 'Upload failed.');
        }
        fileInput.value = '';
      },
      error: (err) => {
        this.imageUploading.set(false);
        this.imageError.set(err.error?.message ?? 'Upload failed. Please try again.');
        fileInput.value = '';
      },
    });
  }

  removeImage(index: number): void {
    this.blogImages.update(imgs => imgs.filter((_, i) => i !== index));
  }

  // ── Submit ───────────────────────────────────────────────────────────────────
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

    const allImages    = this.blogImages();
    const featuredImage = allImages[0]?.url ?? '';
    const extraImages   = allImages.slice(1).map(img => img.url);

    const payload: Omit<Post, '_id' | 'user' | 'userId' | 'likesCount' | 'commentsCount' | 'views' | 'createdAt' | 'updatedAt'> & { user: string } = {
      title:         this.createBlogForm.value.title,
      description:   this.createBlogForm.value.description,
      content:       this.createBlogForm.value.content,
      categories:    selectedCategories,
      tags:          selectedTags,
      featuredImage,
      images:        extraImages,
      status:        this.createBlogForm.value.status,
      comments:      this.createBlogForm.value.comments,
      user:          userId,
    };

    this.isSubmitting.set(true);

    this.postService.createBlog(payload).subscribe({
      next: (res) => {
        this.isSubmitting.set(false);
        this.successMessage.set(
          this.isAdmin()
            ? 'Post published successfully!'
            : 'Post submitted for review!'
        );
        this.isSubmitted.set(false);
        setTimeout(() => {
          this.postCreated.emit(res.data);
          this.successMessage.set('');
          this.blogImages.set([]);
          this.imageError.set('');
          this.imageUrlInput.set('');
          this.createBlogForm.reset();
          this.createBlogForm.get('status')?.setValidators(Validators.required);
          this.createBlogForm.get('status')?.updateValueAndValidity();
          if (this.editorRef?.nativeElement) this.editorRef.nativeElement.innerHTML = '';
          this.closeModal();
        }, 1000);
      },
      error: (err) => {
        this.isSubmitting.set(false);
        this.errorMessage.set(err.error?.message ?? 'Something went wrong. Please try again.');
      },
    });
  }

  closeModal(): void { this.close.emit(); }

  openBlog = input(false);
}
