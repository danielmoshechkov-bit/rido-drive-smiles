/**
 * Compress and resize an image file
 * @param file - The original image file
 * @param maxWidth - Maximum width in pixels (default: 400 for logos)
 * @param maxHeight - Maximum height in pixels (default: 400 for logos)
 * @param quality - JPEG quality 0-1 (default: 0.85)
 * @returns Compressed image as Blob
 */
export async function compressImage(
  file: File,
  maxWidth: number = 400,
  maxHeight: number = 400,
  quality: number = 0.85
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      const img = new Image();
      
      img.onload = () => {
        // Calculate new dimensions maintaining aspect ratio
        let { width, height } = img;
        
        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }
        
        // Create canvas and draw resized image
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Could not get canvas context'));
          return;
        }
        
        // Use better quality rendering
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);
        
        // Convert to blob
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error('Could not compress image'));
            }
          },
          'image/jpeg',
          quality
        );
      };
      
      img.onerror = () => {
        reject(new Error('Could not load image'));
      };
      
      img.src = e.target?.result as string;
    };
    
    reader.onerror = () => {
      reject(new Error('Could not read file'));
    };
    
    reader.readAsDataURL(file);
  });
}

/**
 * Compress image for logo upload (max 400x400, optimized for small file size)
 */
export async function compressLogoImage(file: File): Promise<Blob> {
  return compressImage(file, 400, 400, 0.85);
}

/**
 * Compress image for general use (max 1200px, good quality)
 */
export async function compressGeneralImage(file: File): Promise<Blob> {
  return compressImage(file, 1200, 1200, 0.85);
}

/**
 * Compress image for high-quality photos (max 2000px, high quality)
 */
export async function compressPhotoImage(file: File): Promise<Blob> {
  return compressImage(file, 2000, 2000, 0.9);
}
