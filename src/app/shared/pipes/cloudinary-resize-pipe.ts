import { Pipe, PipeTransform } from '@angular/core';

/**
 * CloudinaryResizePipe
 *
 * Uploaded post images are stored with a baked-in `w_800,h_500,c_limit,q_auto,f_auto`
 * transform — sized for a full-width content image. Thumbnails and cards rendered
 * much smaller (e.g. 110x82 in a feed) were downloading that same 800x500 image,
 * wasting bandwidth and hurting LCP, especially on mobile.
 *
 * This pipe rewrites the `w_NNN,h_NNN` portion of that transform to the size the
 * image is actually rendered at (2x for retina displays). URLs that don't match
 * the expected Cloudinary transform pattern (e.g. external URLs) pass through
 * unchanged.
 *
 * USAGE IN TEMPLATE:
 *   <img [src]="blog.featuredImage | cldResize:240:240" ... />
 */
const TRANSFORM_RE = /\/upload\/w_\d+,h_\d+,c_limit,q_auto,f_auto\//;

@Pipe({
  name: 'cldResize',
  standalone: true,
  pure: true,
})
export class CloudinaryResizePipe implements PipeTransform {
  transform(url: string | null | undefined, width: number, height?: number): string | null | undefined {
    if (!url) return url;
    const h = height ?? width;
    return url.replace(TRANSFORM_RE, `/upload/w_${width},h_${h},c_limit,q_auto,f_auto/`);
  }
}
