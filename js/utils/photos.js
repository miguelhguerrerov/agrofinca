// ============================================
// AgroFinca - Photo Utilities
// Camera capture, gallery upload, compression
// ============================================

const PhotoUtils = (() => {

  // Create photo input HTML with both camera and gallery options
  function createPhotoInput(inputId, options = {}) {
    const { label = 'Foto', multiple = false, required = false } = options;
    return `
      <div class="form-group photo-input-group">
        <label>${label}</label>
        <div class="photo-input-actions">
          <button type="button" class="btn btn-outline btn-sm photo-btn-camera" data-input="${inputId}">
            📷 Tomar foto
          </button>
          <button type="button" class="btn btn-outline btn-sm photo-btn-gallery" data-input="${inputId}">
            🖼️ Galería
          </button>
        </div>
        <input type="file" id="${inputId}-camera" accept="image/*" capture="environment"
               style="display:none;" ${multiple ? 'multiple' : ''} ${required ? 'required' : ''}>
        <input type="file" id="${inputId}-gallery" accept="image/*"
               style="display:none;" ${multiple ? 'multiple' : ''} ${required ? 'required' : ''}>
        <div id="${inputId}-preview" class="photo-preview-container"></div>
      </div>
    `;
  }

  // Initialize photo input event listeners
  function initPhotoInput(inputId, onPhotoSelected) {
    const cameraInput = document.getElementById(`${inputId}-camera`);
    const galleryInput = document.getElementById(`${inputId}-gallery`);
    const previewContainer = document.getElementById(`${inputId}-preview`);

    // Camera button
    document.querySelectorAll(`.photo-btn-camera[data-input="${inputId}"]`).forEach(btn => {
      btn.addEventListener('click', () => cameraInput?.click());
    });

    // Gallery button
    document.querySelectorAll(`.photo-btn-gallery[data-input="${inputId}"]`).forEach(btn => {
      btn.addEventListener('click', () => galleryInput?.click());
    });

    // Handle file selection
    const handleFiles = async (e) => {
      const files = Array.from(e.target.files);
      if (!files.length) return;

      for (const file of files) {
        try {
          const compressed = await compressImage(file);
          showPreview(previewContainer, compressed);
          if (onPhotoSelected) {
            onPhotoSelected(compressed);
          }
        } catch (err) {
          console.error('Error processing photo:', err);
          App.showToast('Error al procesar la foto', 'error');
        }
      }
    };

    if (cameraInput) cameraInput.addEventListener('change', handleFiles);
    if (galleryInput) galleryInput.addEventListener('change', handleFiles);
  }

  // Compress image to max dimensions
  function compressImage(file, maxWidth = AppConfig.MAX_PHOTO_WIDTH, quality = AppConfig.PHOTO_QUALITY) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;

          if (width > maxWidth) {
            height = (height * maxWidth) / width;
            width = maxWidth;
          }

          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);

          canvas.toBlob(
            (blob) => {
              if (blob) {
                resolve({
                  blob,
                  base64: canvas.toDataURL('image/jpeg', quality),
                  width,
                  height,
                  size: blob.size,
                  type: 'image/jpeg',
                  name: file.name || 'photo.jpg'
                });
              } else {
                reject(new Error('Failed to compress image'));
              }
            },
            'image/jpeg',
            quality
          );
        };
        img.onerror = () => reject(new Error('Failed to load image'));
        img.src = e.target.result;
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });
  }

  // Show image preview
  function showPreview(container, photo) {
    if (!container) return;
    const preview = document.createElement('div');
    preview.className = 'photo-preview-item';
    preview.innerHTML = `
      <img src="${photo.base64}" alt="Preview">
      <button type="button" class="photo-remove-btn" title="Eliminar">&times;</button>
    `;
    preview.querySelector('.photo-remove-btn').addEventListener('click', () => {
      preview.remove();
    });
    container.appendChild(preview);
  }

  // Convert base64 to Blob
  function base64ToBlob(base64, type = 'image/jpeg') {
    const byteString = atob(base64.split(',')[1]);
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) {
      ia[i] = byteString.charCodeAt(i);
    }
    return new Blob([ab], { type });
  }

  // Upload photo to Supabase Storage
  async function uploadToStorage(photo, bucket, path) {
    const blob = photo.blob || base64ToBlob(photo.base64);
    return SupabaseClient.uploadPhoto(bucket, path, blob, photo.type || 'image/jpeg');
  }

  return {
    createPhotoInput,
    initPhotoInput,
    compressImage,
    showPreview,
    base64ToBlob,
    uploadToStorage
  };
})();
