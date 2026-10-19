export type LegalSection = { heading: string; body: string[] };

export type LegalDocument = {
  slug: string;
  title: string;
  summary: string;
  updated: string;
  sections: LegalSection[];
};

const EMAIL = "neuravic2026@gmail.com";
const UPDATED = "19 October 2026";

export const LEGAL_DOCUMENTS: LegalDocument[] = [
  {
    slug: "privacy",
    title: "Privacy Policy",
    summary: "What we collect, why we collect it and the choices you have.",
    updated: UPDATED,
    sections: [
      {
        heading: "Who we are",
        body: [
          "Neuravic (“we”, “us”) designs and builds AI systems, software and product experiences from offices in Dubai and Cairo. This policy explains how we handle personal data on this website and in the Neuravic client portal.",
        ],
      },
      {
        heading: "What we collect",
        body: [
          "Contact form: your first and last name, email address, optional company name, the services you are interested in and your message.",
          "Portal sign-in: your email address, so we can send a one-time sign-in link, plus the organisation, project and request details you create while using the portal.",
          "Technical data: your IP address and basic request information, used only to keep the service secure (for example, to limit repeated sign-in attempts).",
          "We do not run advertising trackers and we do not sell personal data.",
        ],
      },
      {
        heading: "How we use it",
        body: [
          "To reply to your enquiry and to deliver, support and improve our work for you.",
          "To sign you in to the portal and keep your account and organisation data secure.",
          "To prevent abuse, investigate security incidents and meet our legal obligations.",
        ],
      },
      {
        heading: "Who we share it with",
        body: [
          "Only with service providers that help us run the site and portal (hosting, database and email delivery), under terms that limit them to acting on our instructions. We may also disclose data when the law requires it.",
        ],
      },
      {
        heading: "How long we keep it",
        body: [
          "Contact enquiries are kept for as long as needed to respond and for a reasonable period afterwards. Portal data is kept while your organisation has an account, then deleted or anonymised on request or when the engagement ends, unless the law requires us to keep it longer.",
        ],
      },
      {
        heading: "Your rights",
        body: [
          `You can ask us to access, correct, export or delete your personal data, or object to how we use it, at any time by emailing ${EMAIL}. Depending on where you live, you may also have the right to complain to your local data protection authority.`,
        ],
      },
      {
        heading: "Security",
        body: [
          "Traffic is encrypted in transit, sign-in is passwordless and time-limited, and access to organisation data is restricted by role. No system is perfectly secure, so please tell us at once if you suspect a problem.",
        ],
      },
      {
        heading: "Changes",
        body: [
          "We will update this page when our practices change and show the date of the latest revision at the top.",
        ],
      },
    ],
  },
  {
    slug: "terms",
    title: "Terms of Use",
    summary: "The rules for using this website and the client portal.",
    updated: UPDATED,
    sections: [
      {
        heading: "Agreement",
        body: [
          "By using this website or the Neuravic client portal you agree to these terms. If you do not agree, please do not use them. Work we carry out for clients is governed by a separate written agreement, which takes priority over these terms where they differ.",
        ],
      },
      {
        heading: "Using the site and portal",
        body: [
          "You agree to use them lawfully and to give accurate information.",
          "You must not attempt to gain unauthorised access, probe or disrupt the service, scrape it at scale, or upload malicious code.",
          "You are responsible for activity under your account and for keeping your sign-in email secure. Tell us promptly if you think it has been compromised.",
        ],
      },
      {
        heading: "Your content",
        body: [
          "You keep ownership of the content and data you submit. You give us the permission needed to host, process and display it in order to provide the service to you.",
        ],
      },
      {
        heading: "Our content",
        body: [
          "The Neuravic name, logo, designs, text and code on this site are owned by us or our licensors and protected by intellectual property laws. See the Licence page for details.",
        ],
      },
      {
        heading: "Availability",
        body: [
          "We work to keep the service running but provide it “as is” and “as available”. We may change, suspend or withdraw features, including the portal, at any time.",
        ],
      },
      {
        heading: "Liability",
        body: [
          "To the fullest extent permitted by law, we are not liable for indirect or consequential loss arising from your use of the website or portal. Nothing here limits liability that cannot be limited by law.",
        ],
      },
      {
        heading: "Governing law and contact",
        body: [
          `Questions about these terms can be sent to ${EMAIL}. The governing law and courts for any commercial engagement will be set out in the relevant client agreement.`,
        ],
      },
    ],
  },
  {
    slug: "cookies",
    title: "Cookie Policy",
    summary: "The small pieces of data this site stores in your browser.",
    updated: UPDATED,
    sections: [
      {
        heading: "Short version",
        body: [
          "We only use cookies and browser storage that the site needs to work. We do not use advertising or analytics cookies, so there is nothing to opt out of.",
        ],
      },
      {
        heading: "What we store",
        body: [
          "Sign-in session cookie (portal only): keeps you signed in after you open your one-time link. It is first-party, secure, not readable by scripts, and removed when you sign out or it expires. Essential.",
          "sidebar_state cookie (portal only): remembers whether the portal sidebar is open, for 7 days. Preference.",
          "Local storage (portal only): remembers the organisation you last selected. Preference.",
          "Local storage, notice choice: remembers that you dismissed the cookie notice so it does not appear again. Essential.",
        ],
      },
      {
        heading: "Managing storage",
        body: [
          "You can clear or block cookies and site data in your browser settings. Blocking the sign-in cookie will stop you from using the portal, but the public website will keep working.",
        ],
      },
      {
        heading: "Third parties",
        body: [
          "Fonts are loaded from Adobe Fonts (Typekit), which may receive your IP address and browser details as part of serving the font files. See the provider’s own privacy information for how it handles this.",
        ],
      },
      {
        heading: "Questions",
        body: [`Email ${EMAIL} and we will be glad to help.`],
      },
    ],
  },
  {
    slug: "license",
    title: "Licence & Copyright",
    summary: "Who owns what on this site, and what you may reuse.",
    updated: UPDATED,
    sections: [
      {
        heading: "Copyright",
        body: [
          "© 2026 Neuravic. All rights reserved. The website, portal, brand, logo, artwork, copy and source code are proprietary. No part may be copied, modified, distributed or used to build a competing service without our written permission.",
        ],
      },
      {
        heading: "Trademarks",
        body: [
          "“Neuravic” and the Neuravic logo are trademarks of Neuravic. Other names and logos mentioned belong to their respective owners.",
        ],
      },
      {
        heading: "What you may do",
        body: [
          "View and use the public website for personal, non-commercial purposes, and quote short excerpts with attribution and a link back to us.",
        ],
      },
      {
        heading: "Open-source software",
        body: [
          "This site is built with open-source software including Next.js, React, Tailwind CSS, Hono, Drizzle ORM and Zod, each used under its own licence (mostly MIT). Their notices remain with their respective authors.",
        ],
      },
      {
        heading: "Permissions and reports",
        body: [
          `To request permission, or to report content you believe infringes your rights, email ${EMAIL}.`,
        ],
      },
    ],
  },
];

export function getLegalDocument(slug: string) {
  return LEGAL_DOCUMENTS.find((doc) => doc.slug === slug);
}
