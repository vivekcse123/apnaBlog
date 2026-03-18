import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'filterByName'
})
export class FilterByNamePipe implements PipeTransform {

  transform(value: any[], searchName: string): any[] {

    if (!value) {
      return [];
    }

    if (!searchName) {
      return value;
    }

    searchName = searchName.toLowerCase();

    return value.filter(user =>
      user.name.toLowerCase().includes(searchName)
    );
  }

}