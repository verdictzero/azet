// ─── MUSIC / AUDIO SYSTEM ───

export const TRACKS = {
  TITLE: 'music/aq_title.ogg',
  OVERWORLD_DAY: 'music/aq_overworld_day.ogg',
  OVERWORLD_NIGHT: 'music/aq_overworld_night.ogg',
  TOWN: ['music/aq_town_var1.ogg', 'music/aq_town_var2.ogg', 'music/aq_town_var3.ogg'],
  RUINS: ['music/aq_ruins_var1.ogg', 'music/aq_ruins_var2.ogg'],
  BATTLE: 'music/aq_battle.ogg',
  BOSS_BATTLE: 'music/aq_boss_battle.ogg',
  FANFARE: 'music/aq_fanfare.ogg',
};

export class MusicManager {
  constructor() {
    this.audioA = new Audio();
    this.audioB = new Audio();
    this.audioA.loop = true;
    this.audioB.loop = true;
    this._active = this.audioA; // currently playing element
    this.currentTrack = null;
    this.volume = 0.5;
    this.muted = false;
    this.crossfadeDuration = 1500;
    this._fadeInterval = null;
  }

  play(trackPath, { loop = true, fadeDuration } = {}) {
    if (trackPath === this.currentTrack) return;
    this.currentTrack = trackPath;
    const incoming = this._active === this.audioA ? this.audioB : this.audioA;
    const outgoing = this._active;
    this._startCrossfade(outgoing, incoming, trackPath, loop, fadeDuration);
    this._active = incoming;
  }

  stop(fadeOut = true) {
    this.currentTrack = null;
    if (!fadeOut) {
      this._clearFade();
      this.audioA.pause();
      this.audioB.pause();
      return;
    }
    const outgoing = this._active;
    this._clearFade();
    let elapsed = 0;
    const step = 30;
    this._fadeInterval = setInterval(() => {
      elapsed += step;
      const progress = Math.min(elapsed / this.crossfadeDuration, 1);
      outgoing.volume = this.muted ? 0 : (1 - progress) * this.volume;
      if (progress >= 1) {
        this._clearFade();
        outgoing.pause();
      }
    }, step);
  }

  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, v));
    if (!this.muted) {
      this._active.volume = this.volume;
    }
  }

  setMuted(m) {
    this.muted = m;
    this.audioA.muted = m;
    this.audioB.muted = m;
  }

  toggleMute() {
    this.setMuted(!this.muted);
    return this.muted;
  }

  _startCrossfade(outgoing, incoming, newSrc, loop, fadeDuration) {
    this._clearFade();
    const duration = fadeDuration != null ? fadeDuration : this.crossfadeDuration;
    incoming.src = newSrc;
    incoming.loop = loop;
    incoming.volume = 0;
    incoming.muted = this.muted;

    const playPromise = incoming.play();
    if (playPromise) {
      playPromise.catch(() => {
        const resume = () => {
          incoming.play().catch(() => {});
          document.removeEventListener('click', resume);
          document.removeEventListener('keydown', resume);
        };
        document.addEventListener('click', resume, { once: true });
        document.addEventListener('keydown', resume, { once: true });
      });
    }

    let elapsed = 0;
    const step = 30;
    const startVol = outgoing.src ? outgoing.volume : 0;
    this._fadeInterval = setInterval(() => {
      elapsed += step;
      const progress = Math.min(elapsed / duration, 1);
      incoming.volume = this.muted ? 0 : progress * this.volume;
      if (outgoing.src) {
        outgoing.volume = this.muted ? 0 : (1 - progress) * startVol;
      }
      if (progress >= 1) {
        this._clearFade();
        if (outgoing.src) outgoing.pause();
      }
    }, step);
  }

  _clearFade() {
    if (this._fadeInterval) {
      clearInterval(this._fadeInterval);
      this._fadeInterval = null;
    }
  }
}
