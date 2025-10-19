import { Component, EventEmitter, Input, OnChanges, Output } from '@angular/core';
import { User } from '../modals/user.model';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormControl, FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { userService } from '../../services/user-service';

@Component({
  selector: 'app-edit-profile',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './edit-profile.html',
  styleUrls: ['./edit-profile.css']
})
export class EditProfile{

  editProfileForm: FormGroup = new FormGroup({});
  constructor(private router: Router, private user: userService, private fb: FormBuilder){
    this.editProfileForm = this.fb.group({
      'name': new FormControl('', []),
      'about': new FormControl('', []),
      'profile_image': new FormControl('', [])
    });
  }

  editedUser: User | null = null;

  changeProfilePhoto(event: any): void {
    const file = event.target.files[0];
    if (file && this.editedUser) {
      const reader = new FileReader();
      reader.onload = (e: any) => {
        this.editedUser!.profileImage = e.target.result;
      };
      reader.readAsDataURL(file);
    }
  }

  save(): void {
    this.user.editProfile(this.editProfileForm.value as User).subscribe((res) =>{
      this.router.navigate(['/user-dashboard/my-profile/', 1]);
    });
  }

  close(): void {
    this.router.navigate(['/user-dashboard/my-profile/', 1]);
  }
}
