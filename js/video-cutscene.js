// ─────────────────────────────────────────────
// Video Cutscene Player — plays pre-rendered ASCII video files
// (WebM/MP4) as fullscreen cutscenes via a <video> element
// ─────────────────────────────────────────────

export class VideoCutscenePlayer {
  /**
   * @param {HTMLVideoElement} videoElement - The hidden <video> element in the DOM
   */
  constructor(videoElement) {
    this.videoEl = videoElement;
    this.active = false;
    this._onComplete = null;
    this._fileInput = null;
  }

  /**
   * Play a video cutscene from a URL or object URL.
   * @param {string} url - Path to the video file
   * @param {Object} [opts]
   * @param {Function} [opts.onComplete] - Called when video ends (non-looping)
   * @param {boolean} [opts.loop] - Loop the video (default false)
   */
  async play(url, { onComplete, loop = false } = {}) {
    this.videoEl.src = url;
    this.videoEl.loop = loop;
    this._onComplete = onComplete || null;
    this.active = true;

    // Show the video element
    this.videoEl.style.display = 'block';

    this.videoEl.onended = () => {
      if (!loop && this._onComplete) {
        const cb = this._onComplete;
        this._onComplete = null;
        cb();
      }
    };

    this.videoEl.onerror = () => {
      console.error('Video cutscene playback error:', this.videoEl.error);
      if (this._onComplete) {
        const cb = this._onComplete;
        this._onComplete = null;
        cb();
      }
    };

    try {
      await this.videoEl.play();
    } catch (e) {
      // Autoplay blocked — will resolve on user interaction
      console.warn('Video autoplay blocked:', e.message);
    }
  }

  /**
   * Stop playback and hide the video element.
   */
  stop() {
    this.videoEl.pause();
    this.videoEl.onended = null;
    this.videoEl.onerror = null;
    this.videoEl.removeAttribute('src');
    this.videoEl.load(); // release the video resource
    this.videoEl.style.display = 'none';
    this.active = false;
    this._onComplete = null;
  }

  /**
   * Open a file picker for selecting a local video file.
   * Returns a promise that resolves with an object URL, or null if cancelled.
   * @returns {Promise<string|null>}
   */
  pickLocalFile() {
    return new Promise((resolve) => {
      if (!this._fileInput) {
        this._fileInput = document.createElement('input');
        this._fileInput.type = 'file';
        this._fileInput.accept = 'video/*,.webm,.mp4';
        this._fileInput.style.display = 'none';
        document.body.appendChild(this._fileInput);
      }

      this._fileInput.onchange = () => {
        const file = this._fileInput.files[0];
        if (file) {
          resolve(URL.createObjectURL(file));
        } else {
          resolve(null);
        }
        this._fileInput.value = ''; // reset for next use
      };

      // Handle cancel (no reliable event, but click-away returns empty)
      this._fileInput.onclick = () => { this._fileInput.value = ''; };
      this._fileInput.click();
    });
  }
}
