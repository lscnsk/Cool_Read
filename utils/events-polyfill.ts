export class EventEmitter {
  private listeners: Record<string, Function[]> = {};

  constructor() {}

  static call(instance: any) {
    instance.listeners = {};
  }

  on(event: string, listener: Function) {
    if (!this.listeners) this.listeners = {};
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(listener);
    return this;
  }

  once(event: string, listener: Function) {
    const wrapper = (...args: any[]) => {
      this.off(event, wrapper);
      listener(...args);
    };
    return this.on(event, wrapper);
  }

  off(event: string, listener: Function) {
    if (!this.listeners || !this.listeners[event]) return this;
    this.listeners[event] = this.listeners[event].filter(l => l !== listener);
    return this;
  }

  emit(event: string, ...args: any[]) {
    if (!this.listeners || !this.listeners[event]) return false;
    this.listeners[event].forEach(l => {
      try {
        l(...args);
      } catch (e) {
        console.error(e);
      }
    });
    return true;
  }

  removeListener(event: string, listener: Function) {
    return this.off(event, listener);
  }
}

export default EventEmitter;
