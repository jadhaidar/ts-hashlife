import { Pattern } from "./formats";

type EventCallback<T = unknown> = (data: T) => void;

export interface EventMap {
  fps: string | number;
  population: string | number;
  generation: string | number;
  zoom: string | number;
  step: string | number;
  "mouse:x": string | number;
  "mouse:y": string | number;
  "pan:x": string | number;
  "pan:y": string | number;
  "pattern:load": Pattern;
  "start": boolean;
  "stop": boolean;
}

type ListenersMap = {
  [key: string]: EventCallback<any>[];
};

class EventBus {
  #listeners: ListenersMap = {};

  /**
   * Emit an event with data
   */
  emit<K extends keyof EventMap>(event: K, data: EventMap[K]): void {
    if (!this.#listeners[event as string]) return;

    const callbacks = this.#listeners[event as string] || [];
    callbacks.forEach((callback) => callback(data));
  }

  /**
   * Subscribe to an event
   * @returns A function to unsubscribe
   */
  on<K extends keyof EventMap>(
    event: K,
    callback: EventCallback<EventMap[K]>
  ): () => void {
    if (!this.#listeners[event as string]) {
      this.#listeners[event as string] = [];
    }

    this.#listeners[event as string].push(callback as EventCallback);

    // Return unsubscribe function
    return () => this.off(event, callback);
  }

  /**
   * Unsubscribe from an event
   */
  off<K extends keyof EventMap>(
    event: K,
    callback: EventCallback<EventMap[K]>
  ): void {
    if (!this.#listeners[event as string]) return;

    const filtered = this.#listeners[event as string].filter(
      (cb) => cb !== callback
    );
    this.#listeners[event as string] = filtered;
  }

  /**
   * Clear all listeners for an event or all events
   */
  clear<K extends keyof EventMap>(event?: K): void {
    if (event) {
      this.#listeners[event as string] = [];
    } else {
      this.#listeners = {};
    }
  }
}

// Create a singleton instance
const eventBus = new EventBus();
export default eventBus;
