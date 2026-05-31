-- AlterEnum
-- Adding EN_ROUTE value to WorkOrderStatus enum between DISPATCHED and IN_PROGRESS.
-- PostgreSQL requires ADD VALUE outside a transaction block for enum mutations.
ALTER TYPE "WorkOrderStatus" ADD VALUE 'EN_ROUTE' AFTER 'DISPATCHED';
