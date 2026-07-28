import type { TranslationShape } from '../translation-shape';
import type { viPlatform } from '../vi/platform';

export const enPlatform = {
  seo: {
    title: 'BookingOS - Booking platform for service businesses',
    description:
      'Launch a branded booking website and manage schedules, partners, payments, and finance on one platform.',
  },
  skipToContent: 'Skip navigation',
  brandLabel: 'BookingOS - Platform home',
  nav: {
    label: 'Main navigation',
    product: 'Product',
    solutions: 'Solutions',
    workflow: 'How it works',
    pricing: 'Pricing',
    faq: 'FAQ',
    login: 'Sign in',
    consultation: 'Book a consultation',
    language: 'Xem bằng tiếng Việt',
    openMenu: 'Open menu',
    closeMenu: 'Close menu',
  },
  hero: {
    title: 'More bookings. Less manual work.',
    description:
      'BookingOS unifies your booking website, schedule, partners, and finance so your service business can grow.',
    primaryCta: 'Book a consultation',
    secondaryCta: 'View real demos',
    visualAlt: 'Studio space used in the BookingStudio demo model',
    visualCaption: 'A storefront that looks and feels like your business.',
    visualMeta: 'Image from the BookingStudio demo model',
    schedule: {
      title: 'Sample operations schedule',
      status: 'Synced',
      caption: 'Illustrative data for the demo model',
      time: 'Time',
      monday: 'Mon',
      tuesday: 'Tue',
      morning: 'Studio A',
      afternoon: 'Studio B',
      confirmed: 'Confirmed',
      available: 'Available',
    },
  },
  models: {
    eyebrow: 'Flexible by design',
    title: 'One platform, many service models.',
    description:
      'Any business with resources, schedules, or capacity that must be booked in advance can run on BookingOS.',
    studio: 'Studios',
    sport: 'Sports venues',
    class: 'Classes',
    appointment: 'Appointments',
    stay: 'Daily stays',
    inventory: 'Equipment rental',
  },
  transformation: {
    eyebrow: 'One operating source',
    title: 'From scattered calendars to one connected operation.',
    description: 'Connect the booking experience to schedules, partners, and finance behind it.',
    beforeTitle: 'When tools do not connect',
    afterTitle: 'When operations run on BookingOS',
    before: {
      one: 'Bookings arrive through separate channels.',
      two: 'Calendars are updated manually.',
      three: 'Partner information lives in different places.',
      four: 'Payments are hard to trace at month end.',
      five: 'The website is disconnected from operations.',
    },
    after: {
      one: 'Customers view availability and book directly.',
      two: 'Resources are managed in one place.',
      three: 'Partners work on the same platform.',
      four: 'Bookings and money share one history.',
      five: 'The storefront carries your own brand.',
    },
  },
  capabilities: {
    eyebrow: 'Core capabilities',
    title: 'Four capabilities. One operating system.',
    description:
      'Each capability solves a clear job while data stays connected from discovery through reconciliation.',
    storefront: {
      title: 'A website built around your brand.',
      description:
        'Publish a responsive storefront with your catalog, availability, and branded booking journey.',
      detail: 'Custom domains by plan, branded design, and a complete booking experience.',
    },
    scheduling: {
      title: 'Availability stays accurate.',
      description:
        'Manage hourly, daily, appointment, class, and inventory bookings in one operating model.',
      detail: 'Hold inventory during payment and prevent two bookings from taking one resource.',
    },
    partners: {
      title: 'Run a partner network without losing control.',
      description:
        'Onboard partners, review content, assign permissions, and apply commissions by relationship.',
      detail: 'Every role sees only the work and data it is allowed to use.',
    },
    finance: {
      title: 'Every unit of revenue can be reconciled.',
      description:
        'Connect bookings, transactions, commissions, and payables in one consistent financial history.',
      detail:
        'Track money held by the tenant and obligations to partners, affiliates, and the platform.',
    },
  },
  workflow: {
    eyebrow: 'How it works',
    title: 'Configure. Publish. Grow.',
    description: 'Start from your current model and grow without replacing the whole system.',
    configure: {
      title: 'Configure',
      description:
        'Set up the brand, services, schedule, pricing, policies, and partner structure.',
      note: 'Model the way your business actually operates.',
    },
    publish: {
      title: 'Publish',
      description: 'Launch services on the storefront, review content, and begin taking bookings.',
      note: 'Customers see availability and pricing from one source.',
    },
    grow: {
      title: 'Grow',
      description:
        'Track bookings and money, then add locations, resources, or partners as needed.',
      note: 'Expand while keeping operational control.',
    },
  },
  demos: {
    eyebrow: 'Demo models',
    title: 'Two models, one operating system.',
    description: 'BookingOS demo models, not customers or case studies.',
    demoLabel: 'BookingOS demo model',
    illustrationLabel: 'Illustrative service-space image',
    studio: {
      title: 'BookingStudio',
      description:
        'Studios, photo packages, and rental equipment using hourly, daily, and inventory bookings.',
      alt: 'Photography space in the BookingStudio demo model',
    },
    sport: {
      title: 'BookingStad',
      description:
        'Multiple sports and resources organized in one storefront and shared operating schedule.',
      alt: 'Illustrative indoor sports courts for the BookingStad model',
    },
  },
  pricing: {
    eyebrow: 'Service plans',
    title: 'Choose a plan that fits your scale.',
    description:
      'Official pricing is being finalized. We will recommend a configuration after understanding your operating model.',
    pendingTitle: 'Get a recommendation for your operation',
    pendingDescription:
      'Tell us about locations, partners, services, and booking volume to receive a suitable plan without invented or hidden fees.',
    consultation: 'Book a consultation',
    plans: {
      one: {
        name: '[PLAN NAME]',
        price: '[PRICE]',
        limits: '[LIMITS]',
        feature: '[FEATURES]',
      },
      two: {
        name: '[PLAN NAME]',
        price: '[PRICE]',
        limits: '[LIMITS]',
        feature: '[FEATURES]',
      },
      three: {
        name: '[PLAN NAME]',
        price: '[PRICE]',
        limits: '[LIMITS]',
        feature: '[FEATURES]',
      },
    },
  },
  trust: {
    eyebrow: 'Trust by architecture',
    title: 'Infrastructure designed for sensitive data and money.',
    description:
      'Every business runs on the shared platform while its data and access boundaries remain separate.',
    isolation: {
      title: 'Business data stays isolated',
      description: 'Each tenant works only inside its own data boundary.',
    },
    access: {
      title: 'Role-based access',
      description: 'Platform, tenant, and partner roles have separate permission scopes.',
    },
    session: {
      title: 'Server-side sessions',
      description: 'Secure cookies replace exposed browser tokens.',
    },
    schedule: {
      title: 'Resource collision prevention',
      description: 'Database constraints stop two bookings from taking the same schedule.',
    },
    ledger: {
      title: 'Consistent financial history',
      description: 'Double-entry records preserve obligations between operating parties.',
    },
  },
  faq: {
    eyebrow: 'Answers',
    title: 'Frequently asked questions.',
    description: 'Short answers before we discuss your operating model.',
    one: {
      question: 'Which service businesses is BookingOS designed for?',
      answer:
        'BookingOS fits businesses that sell time, resources, capacity, or inventory in advance. It can model studios, sports venues, classes, appointments, stays, and equipment rental.',
    },
    two: {
      question: 'Which booking modes does BookingOS support?',
      answer:
        'The platform supports hourly, daily, appointment, capacity-based class, and quantity-based inventory bookings.',
    },
    three: {
      question: 'Can I use my own domain and brand?',
      answer:
        'Yes. Each tenant has a branded storefront. Custom domains are available according to the selected plan.',
    },
    four: {
      question: 'How does BookingOS manage multiple partners?',
      answer:
        'Tenants can onboard partners, assign permissions, review content, manage listings, and configure commission rules by relationship.',
    },
    five: {
      question: 'How do payments and reconciliation work?',
      answer:
        'Payments go to the configured tenant account. BookingOS records transactions, commissions, and payables so the tenant can reconcile and run payouts through its own process.',
    },
    six: {
      question: 'How long does implementation take?',
      answer:
        'Timing depends on services, data, domains, and payment configuration. BookingOS proposes an implementation plan after the consultation.',
    },
  },
  consultation: {
    eyebrow: 'Book a consultation',
    title: 'Ready to turn booking operations into a growth engine?',
    description:
      'Tell us about your booking model. The BookingOS team will recommend a suitable setup and rollout plan.',
    formTitle: 'Tell us about your booking operation.',
    nameLabel: 'Full name',
    namePlaceholder: 'Minh Anh Nguyen',
    phoneLabel: 'Phone number',
    phonePlaceholder: '090 123 4567',
    businessLabel: 'Business name',
    businessPlaceholder: 'Brand or company name',
    serviceLabel: 'Service model',
    servicePlaceholder: 'Choose a service model',
    options: {
      studio: 'Studio',
      sport: 'Sports venue',
      class: 'Classes',
      appointment: 'Appointments',
      stay: 'Daily stay or rental',
      inventory: 'Equipment rental',
      other: 'Another model',
    },
    submit: 'Book a consultation',
    submitting: 'Sending request...',
    required: 'Required',
    nameError: 'Enter your full name.',
    phoneError: 'Enter a valid Vietnamese phone number.',
    businessError: 'Enter your business name.',
    serviceError: 'Choose a service model.',
    unavailableTitle: 'The consultation channel is not connected yet.',
    unavailableDescription:
      'The form interface is ready but does not send data outside the site. Please return after the consultation channel is configured.',
    successTitle: 'Your request has been received.',
    successDescription: 'The BookingOS team will contact you using the details provided.',
    errorTitle: 'The request could not be sent.',
    errorDescription: 'Check your details and try again.',
    privacyNote: 'Your information is only used to discuss BookingOS once submission is connected.',
  },
  footer: {
    tagline:
      'One platform for booking websites, schedules, partners, and finance for service businesses.',
    productTitle: 'Product',
    solutionsTitle: 'Solutions',
    supportTitle: 'Support',
    legalTitle: 'Legal',
    product: 'Platform capabilities',
    workflow: 'How it works',
    pricing: 'Pricing',
    demos: 'Demo models',
    faq: 'Frequently asked questions',
    consultation: 'Book a consultation',
    login: 'Sign in to Dashboard',
    terms: 'Terms of use',
    privacy: 'Privacy policy',
    legalUnavailable: 'Legal routes will be added before publication.',
    rights: 'BookingOS. Booking and operations platform.',
  },
} satisfies TranslationShape<typeof viPlatform>;
