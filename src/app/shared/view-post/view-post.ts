import {
  Component, ElementRef, inject, input,
  OnDestroy, OnInit, output, signal, ViewChild
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { PostService } from '../../features/post/services/post-service';
import { Post } from '../../core/models/post.model';

@Component({
  selector: 'app-view-post',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './view-post.html',
  styleUrl: './view-post.css'
})
export class ViewPost implements OnInit, OnDestroy {
  private fb          = inject(FormBuilder);
  private postService = inject(PostService);
  private destroy$    = new Subject<void>();

  postId      = input<string>('');
  message     = input<string>('');
  close       = output<void>();
  postUpdated = output<Post>();

  post           = signal<Post | null>(null);
  isEditing      = signal(false);
  successMessage = signal('');
  errorMessage   = signal('');
  showComments   = signal(false);
  editForm!: FormGroup;

  showDeleteConfirm      = signal(false);
  pendingDeleteCommentId = signal<string>('');
  isDeletingComment      = signal(false);

  activeFormats = signal<Set<string>>(new Set());
  activeBlock   = signal<string>('');

  @ViewChild('contentEditor') contentEditorRef!: ElementRef<HTMLDivElement>;

  categoryOptions = [
    'Sports', 'Technology', 'Lifestyle', 'Education',
    'Health', 'Business', 'Entertainment', 'Social',
    'Village', 'Cooking', 'Quotes', 'Exercise'
  ];

  tagOptions = [
    'Trending', 'Motivation', 'Tips',
    'News', 'Opinion', 'Guide', 'Update'
  ];

  ngOnInit(): void { this.loadPost(); }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadPost(): void {
    this.postService.getPostById(this.postId())
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => this.post.set(res.data),
        error: (err) => console.error(err)
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
          this.successMessage.set('Comment deleted successfully.');
          setTimeout(() => this.successMessage.set(''), 3000);
        },
        error: (err) => {
          this.isDeletingComment.set(false);
          this.showDeleteConfirm.set(false);
          this.pendingDeleteCommentId.set('');
          this.errorMessage.set(err?.error?.message ?? 'Failed to delete comment.');
          setTimeout(() => this.errorMessage.set(''), 3000);
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
      status:        [p?.status        || 'draft', Validators.required],
    });

    this.isEditing.set(true);

    setTimeout(() => {
      if (this.contentEditorRef?.nativeElement) {
        this.contentEditorRef.nativeElement.innerHTML = p?.content || '';
      }
    }, 0);
  }

  cancelEdit(): void {
    this.isEditing.set(false);
    this.successMessage.set('');
    this.errorMessage.set('');
    this.activeFormats.set(new Set());
    this.activeBlock.set('');
    this.editForm.reset();
  }

  savePost(): void {
    if (this.editForm.invalid) return;
    this.successMessage.set('');
    this.errorMessage.set('');

    this.postService.updatePost(this.post()?._id ?? '', this.editForm.value)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          const updated = res.data ?? { ...this.post(), ...this.editForm.value };
          this.post.set(updated);
          this.isEditing.set(false);
          this.successMessage.set('Post updated successfully!');
          setTimeout(() => {
            this.successMessage.set('');
            this.postUpdated.emit(updated);
            this.closeModal();
          }, 1500);
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
    this.updateEditorFormats();
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

    // Detect current block tag (h1–h4, p)
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      let node: Node | null = selection.getRangeAt(0).commonAncestorContainer;
      while (node && node !== this.contentEditorRef?.nativeElement) {
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

  execFormat(command: string): void {
    this.contentEditorRef.nativeElement.focus();
    document.execCommand(command, false, '');
    this.updateEditorFormats();
    // sync value after format
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

  // ── Categories & Tags ──
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