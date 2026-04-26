import {
  Component, ElementRef, ViewChild,
  inject, input, output, signal, computed,
  OnInit, OnDestroy, PLATFORM_ID,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
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
export class CreatePost implements OnInit, OnDestroy {
  private fb            = inject(FormBuilder);
  private authService   = inject(Auth);
  private postService   = inject(PostService);
  private uploadService = inject(UploadService);
  private platformId    = inject(PLATFORM_ID);

  @ViewChild('editorRef') editorRef!: ElementRef<HTMLDivElement>;

  close       = output<void>();
  postCreated = output<Post>();

  isSubmitted    = signal(false);
  isSubmitting   = signal(false);
  errorMessage   = signal('');
  successMessage = signal('');
  activeFormats  = signal<Set<string>>(new Set());
  activeBlock    = signal<string>('');
  isCodeActive   = signal(false);

  // ── Word count ───────────────────────────────────────────────────────────────
  wordCount = signal(0);

  private updateWordCount(html: string): void {
    const text  = html.replace(/<[^>]*>/g, ' ').replace(/&[a-z]+;/gi, ' ');
    const words = text.trim().split(/\s+/).filter((w: string) => w.length > 0);
    this.wordCount.set(words.length);
  }

  // ── Autosave ─────────────────────────────────────────────────────────────────
  private readonly AUTOSAVE_KEY = 'apna_blog_draft';
  private autosaveTimer: ReturnType<typeof setTimeout> | null = null;
  autosaveStatus = signal<'' | 'saving' | 'saved'>('');
  hasDraft       = signal(false);

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

  // ── Lifecycle ────────────────────────────────────────────────────────────────
  ngOnInit(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    try {
      const raw = localStorage.getItem(this.AUTOSAVE_KEY);
      if (raw) {
        const d = JSON.parse(raw);
        if (d.title || d.description || d.content) this.hasDraft.set(true);
      }
    } catch { /* ignore corrupt data */ }
  }

  ngOnDestroy(): void {
    if (this.autosaveTimer) clearTimeout(this.autosaveTimer);
  }

  restoreDraft(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    try {
      const raw = localStorage.getItem(this.AUTOSAVE_KEY);
      if (!raw) return;
      const d = JSON.parse(raw);
      this.createBlogForm.patchValue({
        title:       d.title       ?? '',
        description: d.description ?? '',
        content:     d.content     ?? '',
      });
      if (d.content && this.editorRef?.nativeElement) {
        this.editorRef.nativeElement.innerHTML = d.content;
      }
    } catch { /* ignore */ }
    this.hasDraft.set(false);
  }

  dismissDraft(): void {
    this.hasDraft.set(false);
    if (isPlatformBrowser(this.platformId)) localStorage.removeItem(this.AUTOSAVE_KEY);
  }

  private scheduleAutosave(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    if (this.autosaveTimer) clearTimeout(this.autosaveTimer);
    this.autosaveStatus.set('saving');
    this.autosaveTimer = setTimeout(() => {
      const draft = {
        title:       this.createBlogForm.get('title')?.value       ?? '',
        description: this.createBlogForm.get('description')?.value ?? '',
        content:     this.createBlogForm.get('content')?.value     ?? '',
        savedAt:     new Date().toISOString(),
      };
      localStorage.setItem(this.AUTOSAVE_KEY, JSON.stringify(draft));
      this.autosaveStatus.set('saved');
      setTimeout(() => this.autosaveStatus.set(''), 2500);
    }, 3000);
  }

  // ── Rich-text editor ─────────────────────────────────────────────────────────
  onEditorInput(): void {
    const html    = this.editorRef.nativeElement.innerHTML;
    const isEmpty = html === '' || html === '<br>';
    this.createBlogForm.get('content')?.setValue(isEmpty ? '' : html);
    this.createBlogForm.get('content')?.markAsTouched();
    this.updateWordCount(isEmpty ? '' : html);
    this.updateActiveFormats();
    this.scheduleAutosave();
  }

  onEditorPaste(event: ClipboardEvent): void {
    event.preventDefault();
    const clipboardData = event.clipboardData;
    if (!clipboardData) return;

    const text = clipboardData.getData('text/plain');
    let html   = clipboardData.getData('text/html');

    if (html) {
      html = this.cleanPastedHTML(html);
    } else if (this.looksLikeCode(text)) {
      const lang = this.detectLanguage(text);
      const pre  = document.createElement('pre');
      if (lang) pre.setAttribute('data-language', lang);
      const code = document.createElement('code');
      code.textContent = text;
      pre.appendChild(code);
      html = pre.outerHTML + '<p><br></p>';
    } else {
      html = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
                 .replace(/\n/g, '<br>');
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
      'a':    ['href', 'title'],
      'img':  ['src', 'alt', 'width', 'height'],
      'pre':  ['data-language'],
      'table': ['border', 'cellpadding', 'cellspacing'],
      'td':   ['colspan', 'rowspan'],
      'th':   ['colspan', 'rowspan'],
    };

    Array.from(element.childNodes).forEach(node => {
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      const el      = node as Element;
      const tagName = el.tagName.toLowerCase();

      // Preserve pre/code blocks as-is — only strip disallowed attrs
      if (tagName === 'pre' || tagName === 'code') {
        const allowed = allowedAttrs[tagName] ?? [];
        Array.from(el.attributes).forEach(attr => {
          if (!allowed.includes(attr.name.toLowerCase())) el.removeAttribute(attr.name);
        });
        return; // do not recurse inside code blocks
      }

      const attrs   = Array.from(el.attributes);
      const allowed = allowedAttrs[tagName] ?? [];
      attrs.forEach(attr => {
        const attrName = attr.name.toLowerCase();
        const keep = allowed.includes(attrName) && !attrName.startsWith('on');
        if (!keep || attrName === 'style' || attrName === 'class' || attrName === 'id') {
          el.removeAttribute(attr.name);
        }
      });

      this.cleanElement(el);

      if (['span', 'font', 'div'].includes(tagName)) {
        if (el.querySelector('p, h1, h2, h3, h4, ul, ol, table, pre')) {
          const wrapper = document.createElement('div');
          while (el.firstChild) wrapper.appendChild(el.firstChild);
          el.replaceWith(...Array.from(wrapper.childNodes));
        } else {
          el.replaceWith(...Array.from(el.childNodes));
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
      let foundBlock = false;
      let inCode = false;
      while (node && node !== this.editorRef.nativeElement) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          const tag = (node as Element).tagName.toLowerCase();
          if (tag === 'pre' || tag === 'code') inCode = true;
          if (!foundBlock && ['h1', 'h2', 'h3', 'h4', 'p'].includes(tag)) {
            this.activeBlock.set(tag);
            foundBlock = true;
          }
        }
        node = node.parentNode;
      }
      this.isCodeActive.set(inCode);
      if (!foundBlock) this.activeBlock.set('');
      return;
    }
    this.isCodeActive.set(false);
    this.activeBlock.set('');
  }

  onEditorKeyUp():   void { this.updateActiveFormats(); }
  onEditorMouseUp(): void { this.updateActiveFormats(); }

  // ── Code block helpers ───────────────────────────────────────────────────────

  isInCode(): boolean {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return false;
    let node: Node | null = selection.getRangeAt(0).commonAncestorContainer;
    while (node && node !== this.editorRef.nativeElement) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        const tag = (node as Element).tagName.toLowerCase();
        if (tag === 'code' || tag === 'pre') return true;
      }
      node = node.parentNode;
    }
    return false;
  }

  private unwrapCode(): void {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    let node: Node | null = selection.getRangeAt(0).commonAncestorContainer;
    while (node && node !== this.editorRef.nativeElement) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        const el  = node as Element;
        const tag = el.tagName.toLowerCase();
        if (tag === 'pre') {
          const text = el.textContent ?? '';
          const p = document.createElement('p');
          p.textContent = text;
          el.replaceWith(p);
          this.onEditorInput();
          return;
        }
        if (tag === 'code' && (el.parentElement?.tagName.toLowerCase() !== 'pre')) {
          el.replaceWith(...Array.from(el.childNodes));
          this.onEditorInput();
          return;
        }
      }
      node = node.parentNode;
    }
  }

  insertCode(): void {
    this.editorRef.nativeElement.focus();
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;

    if (this.isInCode()) { this.unwrapCode(); return; }

    const range    = selection.getRangeAt(0);
    // Use DOM-aware extraction so paragraph boundaries become \n
    const rawText  = this.extractPlainText(range.cloneContents());
    const codeText = this.normalizeCodeText(rawText);

    const pre  = document.createElement('pre');
    const lang = codeText.trim() ? this.detectLanguage(codeText) : '';
    if (lang) pre.setAttribute('data-language', lang);
    const code = document.createElement('code');
    code.textContent = codeText || '';
    pre.appendChild(code);

    range.deleteContents();
    this.cleanEmptyAncestor(range);
    range.insertNode(pre);

    // Guarantee an exit paragraph after the block
    if (!pre.nextElementSibling) {
      const p = document.createElement('p'); p.innerHTML = '<br>';
      pre.after(p);
    }

    // Place cursor after the block (or inside if empty)
    const cursor = document.createRange();
    if (codeText.trim()) {
      cursor.setStartAfter(pre);
    } else {
      cursor.setStart(code, 0);
    }
    cursor.collapse(true);
    selection.removeAllRanges();
    selection.addRange(cursor);

    this.onEditorInput();
  }

  private extractPlainText(node: Node): string {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';

    const tag = node.nodeType === Node.ELEMENT_NODE
      ? (node as Element).tagName.toLowerCase() : '';

    if (tag === 'br') return '\n';
    if (tag === 'pre') {
      const t = (node as Element).textContent ?? '';
      return t + (t.endsWith('\n') ? '' : '\n');
    }

    let result = '';
    node.childNodes.forEach(child => { result += this.extractPlainText(child); });

    const blockTags = ['p','div','h1','h2','h3','h4','h5','h6','li','blockquote','tr'];
    if (blockTags.includes(tag) && result.length > 0 && !result.endsWith('\n')) {
      result += '\n';
    }
    return result;
  }

  private normalizeCodeText(text: string): string {
    const lines = text.split('\n');
    while (lines.length > 0 && lines[0].trim() === '')            lines.shift();
    while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop();
    if (lines.length === 0) return '';

    const nonEmpty  = lines.filter(l => l.trim().length > 0);
    const minIndent = nonEmpty.reduce((m, l) => {
      const spaces = l.match(/^([ \t]*)/)?.[1].length ?? 0;
      return Math.min(m, spaces);
    }, Infinity);

    return (minIndent > 0 && minIndent !== Infinity
      ? lines.map(l => l.slice(minIndent))
      : lines
    ).join('\n');
  }

  private cleanEmptyAncestor(range: Range): void {
    let node: Node | null = range.commonAncestorContainer;
    while (node && node !== this.editorRef.nativeElement) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as Element;
        if (el.innerHTML === '' || el.innerHTML === '<br>') {
          const parent = el.parentNode;
          if (parent) {
            range.setStartBefore(el);
            range.collapse(true);
            parent.removeChild(el);
            return;
          }
        }
      }
      node = node.parentNode;
    }
  }

  looksLikeCode(text: string): boolean {
    if (text.split('\n').length < 2) return false;
    const codePatterns = [
      /^\s*(function|const|let|var|class|import|export|return|if|for|while)\b/m,
      /[{};]\s*$/m,
      /=>/,
      /\bdef\s+\w+\s*\(/m,
      /\bpublic\s+(static\s+)?(void|int|String)\b/m,
      /#include\s*</m,
      /::\w+/,
    ];
    return codePatterns.some(re => re.test(text));
  }

  detectLanguage(code: string): string {
    if (/#include\s*<|int\s+main\s*\(/.test(code))            return 'cpp';
    if (/\bimport\s+\w|def\s+\w+\s*\(|print\s*\(/.test(code)) return 'python';
    if (/\bpublic\s+class\b|\bSystem\.out\.print/.test(code))  return 'java';
    if (/<\/?[a-z][\w-]*[\s>]/i.test(code))                   return 'html';
    if (/^\s*[\.\#][\w-]+\s*\{/m.test(code))                  return 'css';
    if (/\bconst\b|\blet\b|\b=>\b|\bconsole\./.test(code))    return 'javascript';
    if (/\binterface\b|\btype\s+\w+\s*=|\bas\s+\w/.test(code)) return 'typescript';
    if (/\$\w+\s*=|echo\s|<?php/.test(code))                  return 'php';
    if (/^\s*(SELECT|INSERT|UPDATE|DELETE|CREATE)\b/im.test(code)) return 'sql';
    if (/\bfn\s+\w+|let\s+mut\b|::/.test(code))               return 'rust';
    if (/\bfunc\s+\w+|:=|fmt\./.test(code))                   return 'go';
    return '';
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
            : 'Post submitted for review. You\'ll be notified once approved!'
        );
        this.isSubmitted.set(false);
        if (isPlatformBrowser(this.platformId)) localStorage.removeItem(this.AUTOSAVE_KEY);
        this.hasDraft.set(false);
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
        }, 1500);
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
