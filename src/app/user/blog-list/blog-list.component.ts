import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

@Component({
    selector: 'app-blog-list',
    imports: [CommonModule, RouterLink],
    templateUrl: './blog-list.component.html',
    styleUrl: './blog-list.component.css'
})
export class BlogListComponent implements OnInit{
  constructor(private router: Router){}

  blogs = [
    {
      id: 1,
      title: 'Village Festival Celebration',
      summary: 'A brief summary about our annual village festival...',
      image: 'assets/images/festival.jpg',
      likes: 12,
      comments: 4
    },
    {
      id: 2,
      title: 'Local Farmers Market',
      summary: 'Highlights from our weekly farmers market...',
      image: 'assets/images/market.jpg',
      likes: 8,
      comments: 2
    },
    {
      id: 3,
      title: 'Community Clean-up Drive',
      summary: 'How our community came together to clean the village...',
      image: '',
      likes: 15,
      comments: 6
    },
    {
      id: 4,
      title: 'Community Clean-up Drive',
      summary: 'How our community came together to clean the village...',
      image: '',
      likes: 5,
      comments: 1
    },
    {
      id: 5,
      title: 'Community Clean-up Drive',
      summary: 'How our community came together to clean the village...',
      image: '',
      likes: 7,
      comments: 3
    }
  ];

  viewBlog(id: number) {
    this.router.navigate(['/user-dashboard/blog-details', id]);
  }
  
  ngOnInit(): void {
      
  }
}
