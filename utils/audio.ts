
export const getAudioDuration = (src: string): Promise<number> => {
  return new Promise((resolve) => {
    const audio = new Audio();
    audio.preload = 'metadata';
    let settled = false;
    const finish = (dur: number) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(dur);
      audio.remove();
    };
    const timer = setTimeout(() => finish(0), 4000);
    audio.onloadedmetadata = () => {
      const d = (audio.duration && !isNaN(audio.duration) && audio.duration !== Infinity) ? audio.duration : 0;
      finish(d);
    };
    audio.onerror = () => finish(0);
    audio.src = src;
  });
};

