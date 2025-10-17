import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';

interface Festival {
  title: string;
  village: string;
  organizer: string;
  date: string;
  imageUrl: string;
  description_en: string;
  description_hi: string;
  likes: number;
  comments: number;
  isLiked: boolean;
}

interface TrendingFestival {
  name: string;
  posts: number;
}

interface UpcomingFestival {
  name: string;
  month: string;
}

interface Village {
  name: string;
  state: string;
}

@Component({
  selector: 'app-festival',
  standalone: true,
  imports: [CommonModule, ],
  templateUrl: './festival-feed.html',
  styleUrls: ['./festival-feed.css']
})
export class FestivalFeed implements OnInit {

  festivals: Festival[] = [];
  trendingFestivals: TrendingFestival[] = [];
  upcomingFestivals: UpcomingFestival[] = [];
  suggestedVillages: Village[] = [];

  ngOnInit(): void {
    this.loadFestivals();
    this.loadTrendingFestivals();
    this.loadUpcomingFestivals();
    this.loadSuggestedVillages();
  }

  // ✅ Mock Data Loading
  loadFestivals(): void {
    this.festivals = [
      {
        title: 'Holi Celebration in Vrindavan',
        village: 'Vrindavan',
        organizer: 'Radha Mohan',
        date: 'March 2025',
        imageUrl: 'assets/images/holi.jpg',
        description_en:
          'Holi in Vrindavan is one of the most colorful celebrations in India, where people play with colors and sing devotional songs.',
        description_hi:
          'वृंदावन में होली भारत के सबसे रंगीन त्योहारों में से एक है, जहां लोग रंग खेलते हैं और भजन गाते हैं।',
        likes: 325,
        comments: 42,
        isLiked: false
      },
      {
        title: 'Pongal Festival in Tamil Nadu',
        village: 'Thanjavur',
        organizer: 'Arun Kumar',
        date: 'January 2025',
        imageUrl: 'assets/images/pongal.jpg',
        description_en:
          'Pongal marks the harvest season in Tamil Nadu, celebrated with traditional cooking and decorated houses.',
        description_hi:
          'पोंगल तमिलनाडु में फसल कटाई के अवसर पर मनाया जाने वाला त्योहार है, जिसे पारंपरिक भोजन और सजे हुए घरों के साथ मनाया जाता है।',
        likes: 210,
        comments: 18,
        isLiked: false
      },
      {
        title: 'Bihu Celebration in Assam',
        village: 'Guwahati',
        organizer: 'Anjali Das',
        date: 'April 2025',
        imageUrl: 'assets/images/bihu.jpg',
        description_en:
          'Bihu is the harvest festival of Assam, marked by dance, music, and traditional Assamese cuisine.',
        description_hi:
          'बिहू असम का फसल उत्सव है, जिसे नृत्य, संगीत और पारंपरिक असमिया भोजन के साथ मनाया जाता है।',
        likes: 150,
        comments: 12,
        isLiked: false
      }
    ];
  }

  loadTrendingFestivals(): void {
    this.trendingFestivals = [
      { name: 'Holi', posts: 540 },
      { name: 'Diwali', posts: 620 },
      { name: 'Pongal', posts: 410 },
      { name: 'Bihu', posts: 350 }
    ];
  }

  loadUpcomingFestivals(): void {
    this.upcomingFestivals = [
      { name: 'Diwali', month: 'Nov' },
      { name: 'Lohri', month: 'Jan' },
      { name: 'Onam', month: 'Aug' },
      { name: 'Baisakhi', month: 'Apr' }
    ];
  }

  loadSuggestedVillages(): void {
    this.suggestedVillages = [
      { name: 'Shirdi', state: 'Maharashtra' },
      { name: 'Raghurajpur', state: 'Odisha' },
      { name: 'Khajuraho', state: 'Madhya Pradesh' },
      { name: 'Pelling', state: 'Sikkim' }
    ];
  }

  // ✅ Actions
  likeFestival(festival: Festival): void {
    festival.isLiked = !festival.isLiked;
    festival.likes += festival.isLiked ? 1 : -1;
  }

  commentFestival(festival: Festival): void {
    console.log('Open comments section for:', festival.title);
    // You can navigate to a detailed page or open a modal here
  }

  shareFestival(festival: Festival): void {
    const shareText = `Check out the ${festival.title} celebrated in ${festival.village}! 🎉`;
    if (navigator.share) {
      navigator.share({ title: festival.title, text: shareText });
    } else {
      alert('Sharing not supported on this device.');
    }
  }

  createFestival(): void {
    console.log('Navigate to festival creation page');
    // Example: this.router.navigate(['/create-festival']);
  }
}