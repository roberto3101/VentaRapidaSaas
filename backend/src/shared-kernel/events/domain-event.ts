export interface IDomainEvent<TPayload = unknown> {
  readonly name: string;
  readonly tenantId: string;
  readonly occurredAt: Date;
  readonly payload: TPayload;
}
