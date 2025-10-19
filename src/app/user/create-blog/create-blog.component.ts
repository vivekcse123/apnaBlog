import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { createPost } from '../modals/create-post.modal';
import { BlogService } from '../../services/blog.service';

@Component({
  selector: 'app-create-post',
  standalone: true,
  imports: [FormsModule, CommonModule, RouterLink, ReactiveFormsModule],
  templateUrl: './create-blog.component.html',
  styleUrls: ['./create-blog.component.css']
})
export class CreateBlogComponent {
  createPostForm: FormGroup = new FormGroup({});

  constructor(private fb : FormBuilder, private blog : BlogService){
    this.createPostForm = this.fb.group({
      'title': new FormControl('', [Validators.required, Validators.pattern(/^[A-Za-z0-9\s.,!?'"-]+$/)]),
      'content_eng': new FormControl('', [Validators.required, Validators.pattern(/^[A-Za-z0-9\s.,!?'"-]+$/)]),
      'content_hindi': new FormControl('', [Validators.pattern(/^[\u0900-\u097F\s]+$/)]), 
      'images': new FormControl('', [Validators.pattern(/\.(png|jpg|jpeg)$/i)]),
      'tags': new FormControl('', [Validators.pattern(/^#[A-Za-z0-9_]+$/)]),
      'date': new FormControl(new Date().toISOString().split('T')[0])
    });
  }
  post: createPost = {
    title: '',
    content_eng: '',
    content_hindi: '',
    tags: [],
    images: []
  };

  trendingTopics = [
    { tag: 'harvest2025', count: 340 },
    { tag: 'localstories', count: 210 },
    { tag: 'villageart', count: 180 },
  ];

  userName = 'Vivek Verma';

  onImageUpload(event: any) {
    const files = event.target.files as FileList;
    if (files && files.length > 0) {
      this.post.images = [];

      Array.from(files).forEach((file: File) => {
        const reader = new FileReader();
        reader.onload = () => this.post.images.push(reader.result as string);
        reader.readAsDataURL(file);
      });
    }
  }
  message: string = "";
  isSubmitted: boolean = false;

  postBlog() {
    this.isSubmitted = true;
    if (this.createPostForm?.invalid) {
      this.message = "Please fill out all required fields correctly.";
      return;
    }
  
    this.blog.createBlog(this.createPostForm.value as createPost).subscribe({
      next: () => this.message = "Blog posted successfully!",
      error: () => this.message = "Something went wrong while posting the blog!"
    });
  }
  
  
}
