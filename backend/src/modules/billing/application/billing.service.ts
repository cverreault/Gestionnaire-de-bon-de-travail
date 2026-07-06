import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { TenantPlan } from '@prisma/client';
import Stripe from 'stripe';
import { PrismaService } from '../../../common/prisma/prisma.service';
import {
  ISystemConfigResolver,
  SYSTEM_CONFIG_RESOLVER,
} from '../../../common/contracts/system-config-resolver.contract';

/**
 * B22 — Stripe subscription billing for tenant SaaS plans.
 *
 * Model: each purchasable Plan carries a `stripePriceId` (recurring
 * Price created by the SA in the Stripe dashboard, pasted in the plans
 * screen). A tenant's primary ADMIN starts a Stripe Checkout for a
 * plan; the signed webhook is the single source of truth that flips
 * `Tenant.plan` (+ quota snap) — never the redirect page.
 *
 * Configuration (SA platform screen, env fallbacks in parentheses):
 *   stripe.secret-key     (STRIPE_SECRET_KEY)     — encrypted at rest
 *   stripe.webhook-secret (STRIPE_WEBHOOK_SECRET) — encrypted at rest
 * Webhook endpoint to register in the Stripe dashboard:
 *   https://<domaine>/api/billing/webhook
 * Events: checkout.session.completed, customer.subscription.updated,
 * customer.subscription.deleted.
 */
@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(SYSTEM_CONFIG_RESOLVER)
    private readonly configs: ISystemConfigResolver,
  ) {}

  // ── Stripe client ──────────────────────────────────────────────────────────

  private async getStripe(): Promise<Stripe | null> {
    const key = await this.configs.resolve('stripe.secret-key', 'STRIPE_SECRET_KEY');
    if (!key) return null;
    return new Stripe(key);
  }

  /** Frontend gate: is online payment configured, and for which plans? */
  async getStatus() {
    const key = await this.configs.resolve('stripe.secret-key', 'STRIPE_SECRET_KEY');
    const plans = await this.prisma.plan.findMany({
      where: { isActive: true, stripePriceId: { not: null } },
      select: { code: true },
    });
    return {
      enabled: !!key && plans.length > 0,
      purchasablePlans: plans.map((p) => p.code),
    };
  }

  // ── Checkout / portal ──────────────────────────────────────────────────────

  async createCheckoutSession(tenantId: string, planCode: TenantPlan) {
    const stripe = await this.getStripe();
    if (!stripe) {
      throw new ConflictException(
        "Le paiement en ligne n'est pas configuré (clé Stripe absente).",
      );
    }

    const plan = await this.prisma.plan.findUnique({ where: { code: planCode } });
    if (!plan || !plan.isActive) {
      throw new NotFoundException('Plan introuvable ou inactif');
    }
    if (!plan.stripePriceId) {
      throw new ConflictException(
        'Ce plan ne peut pas être acheté en ligne (aucun prix Stripe configuré).',
      );
    }

    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException('Tenant introuvable');

    const origin =
      (await this.configs.resolve('platform.origin', 'PLATFORM_ORIGIN')) ??
      'http://localhost:8088';

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: plan.stripePriceId, quantity: 1 }],
      // Reuse the Stripe customer across upgrades so the portal shows
      // the full history.
      ...(tenant.stripeCustomerId
        ? { customer: tenant.stripeCustomerId }
        : { customer_email: tenant.ownerEmail ?? undefined }),
      // The webhook is the source of truth — metadata routes it back.
      metadata: { tenantId: tenant.id, planCode },
      subscription_data: { metadata: { tenantId: tenant.id, planCode } },
      success_url: `${origin}/mon-abonnement?checkout=success`,
      cancel_url: `${origin}/mon-abonnement?checkout=cancelled`,
    });

    this.logger.log(
      `Checkout session ${session.id} created for tenant=${tenant.id} plan=${planCode}`,
    );
    return { url: session.url };
  }

  /** Stripe customer portal — invoices, card update, cancellation. */
  async createPortalSession(tenantId: string) {
    const stripe = await this.getStripe();
    if (!stripe) {
      throw new ConflictException(
        "Le paiement en ligne n'est pas configuré (clé Stripe absente).",
      );
    }
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant?.stripeCustomerId) {
      throw new ConflictException(
        "Aucun abonnement Stripe pour ce compte — complétez d'abord un paiement.",
      );
    }
    const origin =
      (await this.configs.resolve('platform.origin', 'PLATFORM_ORIGIN')) ??
      'http://localhost:8088';
    const session = await stripe.billingPortal.sessions.create({
      customer: tenant.stripeCustomerId,
      return_url: `${origin}/mon-abonnement`,
    });
    return { url: session.url };
  }

  // ── Webhook ────────────────────────────────────────────────────────────────

  async handleWebhook(rawBody: Buffer | undefined, signature: string | undefined) {
    const stripe = await this.getStripe();
    const webhookSecret = await this.configs.resolve(
      'stripe.webhook-secret',
      'STRIPE_WEBHOOK_SECRET',
    );
    if (!stripe || !webhookSecret) {
      throw new ConflictException('Webhook Stripe non configuré');
    }
    if (!rawBody || !signature) {
      throw new BadRequestException('Signature ou corps de requête manquant');
    }

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } catch (err) {
      this.logger.warn(
        `Stripe webhook signature verification failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      throw new BadRequestException('Signature invalide');
    }

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        await this.onCheckoutCompleted(session);
        break;
      }
      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription;
        await this.onSubscriptionUpdated(sub);
        break;
      }
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        await this.onSubscriptionDeleted(sub);
        break;
      }
      default:
        this.logger.debug(`Stripe event ignored: ${event.type}`);
    }
    return { received: true };
  }

  private async onCheckoutCompleted(session: Stripe.Checkout.Session) {
    const tenantId = session.metadata?.tenantId;
    const planCode = session.metadata?.planCode as TenantPlan | undefined;
    if (!tenantId || !planCode) {
      this.logger.warn(
        `checkout.session.completed ${session.id} without tenantId/planCode metadata — ignored`,
      );
      return;
    }
    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        stripeCustomerId:
          typeof session.customer === 'string' ? session.customer : undefined,
        stripeSubscriptionId:
          typeof session.subscription === 'string' ? session.subscription : undefined,
      },
    });
    await this.applyPlan(tenantId, planCode, `checkout ${session.id}`);
  }

  private async onSubscriptionUpdated(sub: Stripe.Subscription) {
    const tenant = await this.findTenantForSubscription(sub);
    if (!tenant) return;

    // Map the (single) subscription item price back to a plan.
    const priceId = sub.items.data[0]?.price?.id;
    if (!priceId) return;
    const plan = await this.prisma.plan.findFirst({
      where: { stripePriceId: priceId },
      select: { code: true },
    });
    if (!plan) {
      this.logger.warn(
        `Subscription ${sub.id}: price ${priceId} matches no plan — no change applied`,
      );
      return;
    }
    if (tenant.plan !== plan.code) {
      await this.applyPlan(tenant.id, plan.code, `subscription ${sub.id} updated`);
    }
  }

  private async onSubscriptionDeleted(sub: Stripe.Subscription) {
    const tenant = await this.findTenantForSubscription(sub);
    if (!tenant) return;
    await this.prisma.tenant.update({
      where: { id: tenant.id },
      data: { stripeSubscriptionId: null },
    });
    await this.applyPlan(tenant.id, TenantPlan.FREE, `subscription ${sub.id} deleted`);
  }

  private async findTenantForSubscription(sub: Stripe.Subscription) {
    const byMetadata = sub.metadata?.tenantId;
    const customerId = typeof sub.customer === 'string' ? sub.customer : undefined;
    const tenant = await this.prisma.tenant.findFirst({
      where: byMetadata ? { id: byMetadata } : { stripeCustomerId: customerId },
      select: { id: true, plan: true },
    });
    if (!tenant) {
      this.logger.warn(
        `Stripe subscription ${sub.id}: no matching tenant (customer=${customerId ?? '?'})`,
      );
    }
    return tenant;
  }

  /**
   * Switch the tenant's plan and snap the four quota caps to the plan's
   * defaults — same semantics as the SA manual PATCH (the webhook has no
   * explicit overrides, so plan defaults always apply).
   */
  private async applyPlan(tenantId: string, planCode: TenantPlan, reason: string) {
    const plan = await this.prisma.plan.findUnique({ where: { code: planCode } });
    if (!plan) {
      this.logger.error(`applyPlan: plan ${planCode} missing from catalog — aborted`);
      return;
    }
    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        plan: planCode,
        maxUsers: plan.maxUsers,
        maxWorkOrdersPerMonth: plan.maxWorkOrdersPerMonth,
        maxStorageMb: plan.maxStorageMb,
        maxClients: plan.maxClients,
      },
    });
    this.logger.log(`Tenant ${tenantId} → plan ${planCode} (${reason})`);
  }
}
