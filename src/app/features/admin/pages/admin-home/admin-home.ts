import { CommonModule } from '@angular/common';
import { Component, OnInit, signal } from '@angular/core';

@Component({
  selector: 'app-admin-home',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './admin-home.html',
  styleUrl: './admin-home.css',
})
export class AdminHome {
  
currentDate: Date = new Date();

totalBlogs: number = 128;
totalUsers: number = 64;
totalPublished: number = 94;
totalDrafts: number = 34;
totalViews: number = 52400;
totalComments: number = 318;
totalLikes: number = 1240;
activeUsers: number = 47;

newBlogs: number = 5;
newUsers: number = 3;
newPublished: number = 4;
pendingReview: number = 8;
newViews: number = 320;
newComments: number = 12;
newLikes: number = 58;
}
