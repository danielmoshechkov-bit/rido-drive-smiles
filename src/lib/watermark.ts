/**
 * Adds a GetRido watermark to an image
 */
export async function addWatermark(imageBlob: Blob): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    if (!ctx) {
      reject(new Error("Could not get canvas context"));
      return;
    }

    img.onload = async () => {
      // Set canvas size to image size
      canvas.width = img.width;
      canvas.height = img.height;

      // Draw original image
      ctx.drawImage(img, 0, 0);

      // Watermark settings
      const watermarkText = "GetRido";
      const padding = 15;
      const fontSize = Math.max(14, Math.floor(img.width / 40));
      
      ctx.save();

      // Position: bottom-right corner
      const x = img.width - padding;
      const y = img.height - padding;

      // Draw semi-transparent background for better visibility
      ctx.globalAlpha = 0.25;
      
      // Text styling
      ctx.font = `bold ${fontSize}px system-ui, -apple-system, sans-serif`;
      ctx.textAlign = "right";
      ctx.textBaseline = "bottom";

      // Measure text for background
      const textMetrics = ctx.measureText(watermarkText);
      const textWidth = textMetrics.width;
      const textHeight = fontSize;

      // Draw background rectangle
      ctx.fillStyle = "#000000";
      ctx.fillRect(
        x - textWidth - 10,
        y - textHeight - 5,
        textWidth + 15,
        textHeight + 10
      );

      // Draw text
      ctx.globalAlpha = 0.7;
      ctx.fillStyle = "#ffffff";
      ctx.fillText(watermarkText, x - 5, y - 5);

      // Draw small mascot icon (simplified circle with face)
      const iconSize = fontSize * 0.8;
      const iconX = x - textWidth - 15 - iconSize / 2;
      const iconY = y - textHeight / 2 - 2;

      // Draw circle (mascot simplified)
      ctx.globalAlpha = 0.6;
      ctx.fillStyle = "#6C4AE2"; // RIDO Purple
      ctx.beginPath();
      ctx.arc(iconX, iconY, iconSize / 2, 0, Math.PI * 2);
      ctx.fill();

      // Draw simple eyes
      ctx.fillStyle = "#ffffff";
      ctx.globalAlpha = 0.8;
      const eyeSize = iconSize / 6;
      ctx.beginPath();
      ctx.arc(iconX - eyeSize, iconY - eyeSize / 2, eyeSize, 0, Math.PI * 2);
      ctx.arc(iconX + eyeSize, iconY - eyeSize / 2, eyeSize, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();

      // Convert to blob
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error("Failed to create watermarked image"));
          }
        },
        "image/jpeg",
        0.92
      );
    };

    img.onerror = () => reject(new Error("Failed to load image for watermarking"));
    img.src = URL.createObjectURL(imageBlob);
  });
}

/**
 * Adds watermark to an image URL (fetches, processes, returns base64)
 */
export async function addWatermarkToUrl(imageUrl: string): Promise<string> {
  try {
    const response = await fetch(imageUrl);
    const blob = await response.blob();
    const watermarkedBlob = await addWatermark(blob);
    
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(watermarkedBlob);
    });
  } catch (error) {
    console.error("Error adding watermark:", error);
    throw error;
  }
}
