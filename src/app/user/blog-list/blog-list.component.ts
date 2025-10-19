import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { Router, RouterLink, RouterModule } from '@angular/router';
import { User } from '../modals/user.model';
import { FormsModule } from '@angular/forms';
import { FilterBlogPipe } from "../filter-blog-pipe";

@Component({
  selector: 'app-blog-list',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule, FilterBlogPipe, RouterModule],
  templateUrl: './blog-list.component.html',
  styleUrls: ['./blog-list.component.css']
})
export class BlogListComponent implements OnInit {

 currentUser: User = {
  name: 'John Doe',
  handle: 'johndoe',
  profileImage: 'https://via.placeholder.com/120',
  followersCount: 1250,
  followingCount: 300,
  posts: [
    {
      id: 1,
      title: 'Village Festival Celebration',
      content: 'A brief summary about our annual village festival...',
      imageUrl: 'assets/images/festival.jpg',
      likes: 12,
      comments: 4,
      date: new Date('2022-12-12') // YYYY-MM-DD format
    },
    {
      id: 2,
      title: 'Local Farmers Market',
      content: 'Highlights from our weekly farmers market...',
      imageUrl: 'assets/images/market.jpg',
      likes: 8,
      comments: 2,
      date: new Date('2022-12-12')
    },
    {
      id: 3,
      title: 'Community Clean-up Drive',
      content: 'How our community came together to clean the village...',
      imageUrl: '',
      likes: 15,
      comments: 6,
      date: new Date('2022-12-12')
    },
    {
      id: 4,
      title: 'Village Storytelling Night',
      content: 'Stories shared by elders at the community center...',
      imageUrl: '',
      likes: 5,
      comments: 1,
      date: new Date('2022-12-12')
    },
    {
      id: 5,
      title: 'Local Handicrafts Exhibition',
      content: 'Showcasing local artisans and their crafts...',
      imageUrl: '',
      likes: 7,
      comments: 3,
      date: new Date('2022-12-12')
    }
  ]
};

  constructor(private router: Router) {}

  ngOnInit(): void {}

  viewBlog(id: number) {
    this.router.navigate(['/user-dashboard/blog-details', id]);
  }

  searchText: string  = "";
  filterOption: string = "";
}
