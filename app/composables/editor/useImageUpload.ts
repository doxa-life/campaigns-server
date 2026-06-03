/**
 * Image Upload Functionality
 * Handles image uploads with progress tracking for the TipTap editor
 */

import { editorConfig } from '~/config/editor.config'

/**
 * Progress event interface
 */
export interface UploadProgress {
  progress: number
}

/**
 * Upload an image with progress tracking
 *
 * @param file - The image file to upload
 * @param onProgress - Optional callback for upload progress updates
 * @param abortSignal - Optional AbortSignal to cancel the upload
 * @returns Promise resolving to the uploaded image URL
 */
export const uploadImage = async (
  file: File,
  onProgress?: (event: UploadProgress) => void,
  abortSignal?: AbortSignal
): Promise<string> => {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    const formData = new FormData()
    formData.append('image', file)

    // Track upload progress
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        const percentComplete = Math.round((e.loaded / e.total) * 100)
        onProgress?.({ progress: percentComplete })
      }
    })

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const response = JSON.parse(xhr.responseText)
          // Handle both Editor.js format and direct URL format
          const url = response.file?.url || response.url
          if (url) {
            resolve(url)
          } else {
            reject(new Error('No URL in response'))
          }
        } catch (error) {
          reject(new Error('Invalid response from server'))
        }
      } else {
        try {
          const error = JSON.parse(xhr.responseText)
          reject(new Error(error.error || error.message || 'Upload failed'))
        } catch {
          reject(new Error(`Upload failed with status ${xhr.status}`))
        }
      }
    })

    xhr.addEventListener('error', () => {
      reject(new Error('Network error during upload'))
    })

    xhr.addEventListener('abort', () => {
      reject(new Error('Upload cancelled'))
    })

    // Handle abort signal
    if (abortSignal) {
      abortSignal.addEventListener('abort', () => {
        xhr.abort()
      })
    }

    xhr.open('POST', editorConfig.upload.image.endpoint)
    xhr.send(formData)
  })
}

/**
 * Composable for image upload functionality
 */
export const useImageUpload = () => {
  return {
    uploadImage,
    config: editorConfig.upload.image
  }
}
