import { NotFoundException } from '@nestjs/common';

/**
 * Defense-in-depth helper for read-then-write paths that need to mutate a
 * record loaded by id. Throws NotFoundException (404) — never reveal
 * cross-tenant existence — if the loaded entity does not belong to the
 * caller's tenant.
 *
 * Prefer scoping the write itself via `updateMany`/`deleteMany` with
 * `{ id, tenantId }`. Use this helper only when a prior `findUnique` is
 * unavoidable (e.g. need to copy fields, or no composite index exists).
 */
export function assertTenant(
  entity: { tenantId: string } | null | undefined,
  tenantId: string,
): asserts entity is { tenantId: string } {
  if (!entity || entity.tenantId !== tenantId) {
    throw new NotFoundException('Recurso no encontrado');
  }
}

/**
 * Assert that a Prisma `updateMany`/`deleteMany` count matches the expected
 * value (default 1). Used after tenant-scoped writes to detect when the
 * target row did not exist for this tenant.
 */
export function assertAffected(
  result: { count: number },
  expected = 1,
  message = 'Recurso no encontrado',
): void {
  if (result.count !== expected) {
    throw new NotFoundException(message);
  }
}
