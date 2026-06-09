import { IDomainEvent } from '../../../../shared-kernel/events/domain-event';

export interface ProductCreatedPayload {
  productId: string;
  name: string;
  variantCount: number;
  createdBy: string;
}

export class ProductCreatedEvent implements IDomainEvent<ProductCreatedPayload> {
  readonly name = 'products.product-created';
  readonly occurredAt: Date;

  constructor(
    public readonly tenantId: string,
    public readonly payload: ProductCreatedPayload,
    occurredAt: Date = new Date(),
  ) {
    this.occurredAt = occurredAt;
  }
}
