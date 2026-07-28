import type { TranslationShape } from '../translation-shape';
import type { viPlatform } from '../vi/platform';

export const enPlatform = {
  seo: {
    title: 'BookingOS — Booking operations platform',
    description:
      'BookingOS helps service businesses launch a branded booking storefront and run scheduling, partners, payments, and finance from one platform.',
  },
  skipToContent: 'Skip navigation',
  brandLabel: 'BookingOS — Platform home',
  nav: {
    label: 'Main navigation',
    benefits: 'Platform',
    workflow: 'How it works',
    audiences: 'Who it is for',
    login: 'Sign in',
    language: 'Xem bằng tiếng Việt',
  },
  hero: {
    eyebrow: 'Booking infrastructure for modern teams',
    title: 'Turn booking operations into a growth advantage.',
    description:
      'One operating system for storefronts, availability, partners, payments, and finance — flexible enough for your brand and rigorous enough to scale safely.',
    primaryCta: 'Sign in to Dashboard',
    secondaryCta: 'Explore the platform',
    trustNote: 'Built for multi-location service businesses in Vietnam.',
  },
  preview: {
    eyebrow: 'Live operations',
    title: 'One operating rhythm. Every touchpoint.',
    status: 'Systems in sync',
    storefront: 'Storefront',
    scheduling: 'Schedule & resources',
    finance: 'Finance',
    bookingFlow: "Today's booking flow",
    incoming: 'New requests',
    confirmed: 'Confirmed',
    settled: 'Settled',
    controlTitle: 'Real-time control',
    controlDescription: 'Availability, access, and money movement share one source of truth.',
  },
  benefits: {
    eyebrow: 'More than a booking page',
    title: 'Operations from storefront to ledger.',
    description:
      'BookingOS connects the customer experience to the operating rules behind it, helping teams scale without scaling chaos.',
    storefront: {
      title: 'Branded storefronts',
      description: 'Each business gets its own domain, experience, and service catalog.',
    },
    operations: {
      title: 'Unified operations',
      description: 'Manage listings, resources, availability, bookings, and partners in one flow.',
    },
    finance: {
      title: 'Transparent money movement',
      description:
        'Payments, commissions, and settlements stay consistent through double-entry records.',
    },
    security: {
      title: 'Secure by architecture',
      description:
        'Data-layer tenant isolation and dynamic permissions protect every operating role.',
    },
  },
  workflow: {
    eyebrow: 'From configuration to growth',
    title: 'Set it up once. Operate as a system.',
    configure: {
      step: '01',
      title: 'Shape your model',
      description: 'Configure the brand, services, pricing, policies, and partner structure.',
    },
    publish: {
      step: '02',
      title: 'Publish the experience',
      description: 'Launch on your own domain with availability and pricing kept in sync.',
    },
    operate: {
      step: '03',
      title: 'Operate and expand',
      description:
        'Track bookings, payments, performance, and financial obligations from the dashboard.',
    },
  },
  audiences: {
    eyebrow: 'One platform, three experiences',
    title: 'Everyone sees exactly what they need.',
    tenant: {
      label: 'Tenant',
      title: 'Businesses control their ecosystem',
      description: 'Own the brand, policies, partners, service quality, and financial operations.',
    },
    partner: {
      label: 'Partner',
      title: 'Partners focus on delivering',
      description: 'Manage services, resources, working schedules, bookings, and revenue.',
    },
    customer: {
      label: 'Customer',
      title: 'Customers book without friction',
      description: 'Discover, schedule, pay, and follow a booking in one trusted experience.',
    },
  },
  cta: {
    eyebrow: 'Operate as a system',
    title: 'Ready to bring every booking operation into one rhythm?',
    description: 'Open the BookingOS Dashboard to continue managing your workspace.',
    login: 'Sign in to Dashboard',
    explore: 'See how it works',
  },
  footer: {
    tagline: 'Booking infrastructure for modern service businesses.',
    product: 'Platform',
    workflow: 'How it works',
    login: 'Dashboard',
    rights: 'BookingOS. Booking and operations platform.',
  },
} satisfies TranslationShape<typeof viPlatform>;
