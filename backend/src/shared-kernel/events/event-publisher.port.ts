import { IDomainEvent } from './domain-event';

export const EVENT_PUBLISHER_PORT = Symbol('EVENT_PUBLISHER_PORT');

export interface IEventPublisher {
  publish(event: IDomainEvent): Promise<void>;
  publishAll(events: ReadonlyArray<IDomainEvent>): Promise<void>;
}
