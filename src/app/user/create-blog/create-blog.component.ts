import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

@Component({
    selector: 'app-create-post',
    imports: [FormsModule, CommonModule, RouterLink],
    templateUrl: './create-blog.component.html',
    styleUrls: ['./create-blog.component.css']
})
export class CreateBlogComponent {
  post = {
    title: '',
    content_en: '',
    content_hi: '',
    tags: '',
    imageUrl: ''
  };

  trendingTopics = [
    { tag: 'harvest2025', count: 340 },
    { tag: 'localstories', count: 210 },
    { tag: 'villageart', count: 180 },
  ];

  userName = 'Vivek Verma';

  onImageUpload(event: any) {
    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => this.post.imageUrl = reader.result as string;
      reader.readAsDataURL(file);
    }
  }

  onSubmit() {
    console.log('Post submitted:', this.post);
    alert('Your story has been published!');
  }
}
