import {
  Component, computed, ElementRef, inject, input,
  OnDestroy, OnInit, output, signal, ViewChild
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Subject, takeUntil, finalize } from 'rxjs';
import { PostService } from '../../features/post/services/post-service';
import { UploadService } from '../../features/post/services/upload-service';
import { Auth } from '../../core/services/auth';
import { Post } from '../../core/models/post.model';
import { ToastService } from '../../core/services/toast.service';

interface ImageItem {
  url: string;
  isUploading: boolean;
  uploadProgress?: number;
}

@Component({
  selector: 'app-view-post',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './view-post.html',
  styleUrl: './view-post.css'
})
export class ViewPost implements OnInit, OnDestroy {
  private fb            = inject(FormBuilder);
  private postService   = inject(PostService);
  private uploadService = inject(UploadService);
  private authService   = inject(Auth);
  private toastService  = inject(ToastService);
  private destroy$      = new Subject<void>();

  isAdmin = computed(() => this.authService.getCurrentUser()?.role?.toLowerCase() === 'admin');

  /** True when the post is pending/rejected AND the viewer is not admin — hides status controls */
  isPendingForUser = computed(() =>
    (this.post()?.status === 'pending' || this.post()?.status === 'rejected') && !this.isAdmin()
  );

  /** True when the post is rejected — shown to all viewers */
  isRejected = computed(() => this.post()?.status === 'rejected');

  postId      = input<string>('');
  message     = input<string>('');
  close       = output<void>();
  postUpdated = output<Post>();

  post           = signal<Post | null>(null);
  isLoading      = signal(false);
  isEditing      = signal(false);
  isSaving       = signal(false);
  successMessage = signal('');
  errorMessage   = signal('');
  showComments   = signal(false);
  editForm!: FormGroup;

  showDeleteConfirm      = signal(false);
  pendingDeleteCommentId = signal<string>('');
  isDeletingComment      = signal(false);

  wordCount      = signal(0);

  activeFormats  = signal<Set<string>>(new Set());
  activeBlock    = signal<string>('');
  isCodeActive   = signal(false);

  // Reject modal state
  showRejectModal = signal(false);
  rejectReason    = signal('');
  isRejecting     = signal(false);

  // Image gallery management
  imageGallery = signal<ImageItem[]>([]);
  uploadError  = signal('');

  @ViewChild('contentEditor') contentEditorRef!: ElementRef<HTMLDivElement>;

  categoryOptions = [
    'Update', 'News',
    'Sports', 'Technology', 'Lifestyle', 'Education',
    'Health', 'Business', 'Entertainment', 'Social',
    'Village', 'Cooking', 'Quotes', 'Exercise'
  ];

  tagOptions = [
    'Trending', 'Motivation', 'Tips',
    'Opinion', 'Guide'
  ];

  ngOnInit(): void { this.loadPost(); }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadPost(): void {
    this.isLoading.set(true);
    this.postService.getPostById(this.postId())
      .pipe(takeUntil(this.destroy$), finalize(() => this.isLoading.set(false)))
      .subscribe({
        next: (res) => this.post.set(res.data),
        error: () => this.toastService.show('Failed to load post details.', 'error'),
      });
  }

  toggleComments(): void {
    this.showComments.set(!this.showComments());
  }

  confirmDeleteComment(commentId: string): void {
    this.pendingDeleteCommentId.set(commentId);
    this.showDeleteConfirm.set(true);
  }

  cancelDeleteComment(): void {
    this.showDeleteConfirm.set(false);
    this.pendingDeleteCommentId.set('');
  }

  proceedDeleteComment(): void {
    const commentId = this.pendingDeleteCommentId();
    const postId    = this.post()?._id;
    if (!commentId || !postId) return;

    this.isDeletingComment.set(true);

    this.postService.deleteComment(postId, commentId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.post.update(p => {
            if (!p) return p;
            const updatedComments = (p.comments ?? []).filter((c: any) => c._id !== commentId);
            return { ...p, comments: updatedComments, commentsCount: Math.max(0, (p.commentsCount ?? 1) - 1) };
          });
          this.isDeletingComment.set(false);
          this.showDeleteConfirm.set(false);
          this.pendingDeleteCommentId.set('');
          this.toastService.show('Comment deleted successfully.', 'success');
        },
        error: (err) => {
          this.isDeletingComment.set(false);
          this.showDeleteConfirm.set(false);
          this.pendingDeleteCommentId.set('');
          this.toastService.show(err?.error?.message ?? 'Failed to delete comment.', 'error');
        }
      });
  }

  startEdit(): void {
    const p = this.post();
    this.successMessage.set('');
    this.errorMessage.set('');

    this.editForm = this.fb.group({
      title:         [p?.title         || '', [Validators.required, Validators.minLength(5), Validators.maxLength(100)]],
      description:   [p?.description   || '', [Validators.required, Validators.minLength(10)]],
      content:       [p?.content       || '', [Validators.required, Validators.minLength(20)]],
      categories:    [p?.categories    || []],
      tags:          [p?.tags          || []],
      featuredImage: [p?.featuredImage || ''],
      // Non-admins cannot change status while the post is pending
      status:        [p?.status || 'draft', this.isPendingForUser() ? [] : Validators.required],
    });

    // Initialize image gallery with featured image if exists
    if (p?.featuredImage) {
      this.imageGallery.set([{ url: p.featuredImage, isUploading: false }]);
    } else {
      this.imageGallery.set([]);
    }

    this.isEditing.set(true);

    setTimeout(() => {
      if (this.contentEditorRef?.nativeElement) {
        this.contentEditorRef.nativeElement.innerHTML = p?.content || '';
        this.updateWordCount(p?.content || '');
      }
    }, 0);
  }

  cancelEdit(): void {
    this.isEditing.set(false);
    this.successMessage.set('');
    this.errorMessage.set('');
    this.uploadError.set('');
    this.activeFormats.set(new Set());
    this.activeBlock.set('');
    this.imageGallery.set([]);
    this.editForm.reset();
  }

  onImageUpload(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = input.files;
    if (!files || files.length === 0) return;

    this.uploadError.set('');

    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    
    Array.from(files).forEach(file => {
      // Validate file type
      if (!allowed.includes(file.type)) {
        this.uploadError.set('Only JPG, PNG, WEBP or GIF images are allowed.');
        return;
      }

      // Validate file size
      if (file.size > 5 * 1024 * 1024) {
        this.uploadError.set('Each image must be smaller than 5 MB.');
        return;
      }

      // Create preview immediately
      const reader = new FileReader();
      reader.onload = (e) => {
        const previewUrl = e.target?.result as string;
        
        // Add to gallery with uploading state
        this.imageGallery.update(gallery => [
          ...gallery,
          { url: previewUrl, isUploading: true }
        ]);

        const currentIndex = this.imageGallery().length - 1;

        // Upload the image
        this.uploadService.uploadImage(file).subscribe({
          next: (res) => {
            if (res.success && res.url) {
              // Update gallery with actual URL
              this.imageGallery.update(gallery => {
                const updated = [...gallery];
                updated[currentIndex] = { url: res.url, isUploading: false };
                return updated;
              });

              // Update form value with first image as featured
              if (currentIndex === 0) {
                this.editForm.patchValue({ featuredImage: res.url });
              }
            } else {
              // Remove failed upload from gallery
              this.imageGallery.update(gallery => 
                gallery.filter((_, idx) => idx !== currentIndex)
              );
              this.uploadError.set(res.message ?? 'Upload failed.');
            }
          },
          error: (err) => {
            // Remove failed upload from gallery
            this.imageGallery.update(gallery => 
              gallery.filter((_, idx) => idx !== currentIndex)
            );
            this.uploadError.set(err?.error?.message ?? 'Upload failed.');
          }
        });
      };
      reader.readAsDataURL(file);
    });

    // Clear input so same file can be uploaded again
    input.value = '';
  }

  removeImageFromGallery(index: number): void {
    this.imageGallery.update(gallery => gallery.filter((_, idx) => idx !== index));
    
    // Update featured image in form (use first image or empty)
    const remainingImages = this.imageGallery();
    if (remainingImages.length > 0) {
      this.editForm.patchValue({ featuredImage: remainingImages[0].url });
    } else {
      this.editForm.patchValue({ featuredImage: '' });
    }
  }

  setAsFeatured(index: number): void {
    const image = this.imageGallery()[index];
    if (image && !image.isUploading) {
      this.editForm.patchValue({ featuredImage: image.url });
      
      // Reorder gallery to put featured image first
      this.imageGallery.update(gallery => {
        const updated = [...gallery];
        const [selected] = updated.splice(index, 1);
        updated.unshift(selected);
        return updated;
      });
    }
  }

  hasUploadingImages(): boolean {
    return this.imageGallery().some(img => img.isUploading);
  }

  savePost(): void {
    if (this.editForm.invalid) return;
    if (this.hasUploadingImages()) {
      this.errorMessage.set('Please wait for all images to finish uploading.');
      return;
    }

    this.isSaving.set(true);
    this.errorMessage.set('');

    this.postService.updatePost(this.post()?._id ?? '', this.editForm.value)
      .pipe(takeUntil(this.destroy$), finalize(() => this.isSaving.set(false)))
      .subscribe({
        next: (res) => {
          const updated = res.data ?? { ...this.post(), ...this.editForm.value };
          this.post.set(updated);
          this.isEditing.set(false);
          this.imageGallery.set([]);
          this.toastService.show('Post edited successfully', 'success');
          this.postUpdated.emit(updated);
          this.closeModal();
        },
        error: (err) => {
          this.errorMessage.set(err?.error?.message ?? 'Something went wrong. Please try again.');
        }
      });
  }

  onContentInput(event: Event): void {
    const html    = (event.target as HTMLElement).innerHTML;
    const isEmpty = html === '' || html === '<br>';
    this.editForm.patchValue({ content: isEmpty ? '' : html }, { emitEvent: false });
    this.updateWordCount(html);
    this.updateEditorFormats();
  }

  private updateWordCount(html: string): void {
    const text  = html.replace(/<[^>]*>/g, ' ').replace(/&[a-z]+;/gi, ' ');
    const words = text.trim().split(/\s+/).filter((w: string) => w.length > 0);
    this.wordCount.set(words.length);
  }

  openRejectModal(): void {
    this.rejectReason.set('');
    this.showRejectModal.set(true);
  }

  cancelReject(): void {
    this.showRejectModal.set(false);
    this.rejectReason.set('');
  }

  confirmReject(): void {
    const reason = this.rejectReason().trim();
    if (!reason) return;

    this.isRejecting.set(true);
    this.postService.updatePost(this.post()?._id ?? '', { status: 'rejected', rejectionReason: reason })
      .pipe(takeUntil(this.destroy$), finalize(() => this.isRejecting.set(false)))
      .subscribe({
        next: (res) => {
          const updated = res.data ?? { ...this.post(), status: 'rejected', rejectionReason: reason };
          this.post.set(updated);
          this.showRejectModal.set(false);
          this.rejectReason.set('');
          this.toastService.show('Post rejected and author notified.', 'success');
          this.postUpdated.emit(updated);
        },
        error: (err) => {
          this.toastService.show(err?.error?.message ?? 'Failed to reject post.', 'error');
        }
      });
  }

  onContentPaste(event: ClipboardEvent): void {
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

    this.onContentInput(event);
  }

  private cleanPastedHTML(html: string): string {
    const temp = document.createElement('div');
    temp.innerHTML = html;

    const unwantedSelectors = [
      'script', 'style', 'meta', 'link', 'object', 'embed',
      'iframe', 'applet', 'xml', 'o\\:p', 'w\\:sdt'
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
      'pre':   ['data-language'],
      'table': ['border', 'cellpadding', 'cellspacing'],
      'td':    ['colspan', 'rowspan'],
      'th':    ['colspan', 'rowspan'],
    };

    Array.from(element.childNodes).forEach(node => {
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      const el      = node as Element;
      const tagName = el.tagName.toLowerCase();

      if (tagName === 'pre' || tagName === 'code') {
        const allowed = allowedAttrs[tagName] ?? [];
        Array.from(el.attributes).forEach(attr => {
          if (!allowed.includes(attr.name.toLowerCase())) el.removeAttribute(attr.name);
        });
        return;
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

  updateEditorFormats(): void {
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
      while (node && node !== this.contentEditorRef?.nativeElement) {
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

  isInCode(): boolean {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return false;
    let node: Node | null = selection.getRangeAt(0).commonAncestorContainer;
    while (node && node !== this.contentEditorRef?.nativeElement) {
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
    while (node && node !== this.contentEditorRef?.nativeElement) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        const el  = node as Element;
        const tag = el.tagName.toLowerCase();
        if (tag === 'pre') {
          const p = document.createElement('p');
          p.textContent = el.textContent ?? '';
          el.replaceWith(p);
          const html = this.contentEditorRef.nativeElement.innerHTML;
          this.editForm.patchValue({ content: html }, { emitEvent: false });
          this.updateEditorFormats();
          return;
        }
        if (tag === 'code' && el.parentElement?.tagName.toLowerCase() !== 'pre') {
          el.replaceWith(...Array.from(el.childNodes));
          const html = this.contentEditorRef.nativeElement.innerHTML;
          this.editForm.patchValue({ content: html }, { emitEvent: false });
          this.updateEditorFormats();
          return;
        }
      }
      node = node.parentNode;
    }
  }

  insertCode(): void {
    this.contentEditorRef.nativeElement.focus();
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;

    if (this.isInCode()) { this.unwrapCode(); return; }

    const range    = selection.getRangeAt(0);
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

    if (!pre.nextElementSibling) {
      const p = document.createElement('p'); p.innerHTML = '<br>';
      pre.after(p);
    }

    const cursor = document.createRange();
    if (codeText.trim()) {
      cursor.setStartAfter(pre);
    } else {
      cursor.setStart(code, 0);
    }
    cursor.collapse(true);
    selection.removeAllRanges();
    selection.addRange(cursor);

    const html = this.contentEditorRef.nativeElement.innerHTML;
    this.editForm.patchValue({ content: html }, { emitEvent: false });
    this.updateEditorFormats();
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
    while (node && node !== this.contentEditorRef.nativeElement) {
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
    if (/#include\s*<|int\s+main\s*\(/.test(code))             return 'cpp';
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

  execFormat(command: string): void {
    this.contentEditorRef.nativeElement.focus();
    document.execCommand(command, false, '');
    this.updateEditorFormats();
    const html = this.contentEditorRef.nativeElement.innerHTML;
    this.editForm.patchValue({ content: html }, { emitEvent: false });
  }

  execFormatBlock(tag: string): void {
    this.contentEditorRef.nativeElement.focus();
    document.execCommand('formatBlock', false, tag);
    this.updateEditorFormats();
    const html = this.contentEditorRef.nativeElement.innerHTML;
    this.editForm.patchValue({ content: html }, { emitEvent: false });
  }

  isFormatActive(command: string): boolean {
    return this.activeFormats().has(command);
  }

  toggleCategory(category: string): void {
    const current: string[] = this.editForm.get('categories')?.value ?? [];
    this.editForm.patchValue({
      categories: current.includes(category)
        ? current.filter(c => c !== category)
        : [...current, category]
    });
  }

  toggleTag(tag: string): void {
    const current: string[] = this.editForm.get('tags')?.value ?? [];
    this.editForm.patchValue({
      tags: current.includes(tag)
        ? current.filter(t => t !== tag)
        : [...current, tag]
    });
  }

  isCategorySelected(category: string): boolean {
    return (this.editForm.get('categories')?.value ?? []).includes(category);
  }

  isTagSelected(tag: string): boolean {
    return (this.editForm.get('tags')?.value ?? []).includes(tag);
  }

  closeModal(): void { this.close.emit(); }
}