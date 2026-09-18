
export const getAudioDuration = (src: string): Promise<number> => {
  return new Promise((resolve) => {
    const audio = new Audio();
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => {
      resolve((audio.duration && !isNaN(audio.duration) && audio.duration !== Infinity) ? audio.duration : 0);
      audio.remove();
    };
    audio.onerror = () => { resolve(0); audio.remove(); };
    audio.src = src;
  });
};
